import os
import sys
import time
import logging
from datetime import datetime
import requests

sys.path.append('.')

from step01_json2geo import run as json2geo
from step02_geo2mesh import run as geo2mesh
from step03_mesh2cfd import run as mesh2cfd

# Config
API_BASE = os.getenv('API_BASE_URL', 'http://localhost:5000')
API_KEY = 'flowerpower-external-api'
POLLING_INTERVAL = 10

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_pending_simulations():
    """Obtiene sims con status='pending'"""
    try:
        response = requests.get(
            f"{API_BASE}/api/external/simulations/pending",
            headers={'x-api-key': API_KEY}
        )
        return response.json() if response.ok else []
    except Exception as e:
        logger.error(f"Failed to fetch pending sims: {e}")
        return []

def update_simulation(sim_id, data):
    """Actualiza status/progress de simulación"""
    try:
        requests.patch(
            f"{API_BASE}/api/external/simulations/{sim_id}/status",
            json=data,
            headers={'x-api-key': API_KEY}
        )
    except Exception as e:
        logger.error(f"Failed to update sim {sim_id}: {e}")

def submit_to_inductiva(case_name, sim_path):
    """Submit a Inductiva y retorna task_id"""
    from src.components.solve.inductiva import solve_inductiva
    task_id = solve_inductiva(sim_path, machine_type="c2d-highcpu-16", wait=False)
    return task_id

def process_simulation(sim):
    """Procesa Steps 1-3 y envía a Inductiva"""
    sim_id = sim['id']
    case_name = f"sim_{sim_id}"
    
    try:
        logger.info(f"Processing simulation {sim_id}")
        
        update_simulation(sim_id, {
            'status': 'processing',
            'progress': 10,
            'currentStep': 'Initializing...',
            'startedAt': datetime.utcnow().isoformat()
        })
        
        # STEP 1: JSON → Geometry
        update_simulation(sim_id, {
            'status': 'geometry',
            'progress': 20,
            'currentStep': 'Generating 3D geometry...'
        })
        import json
        json_payload = json.dumps(sim['jsonConfig'])
        geo_mesh, geo_df = json2geo(json_payload, case_name)
        
        # STEP 2: Geometry → Mesh
        update_simulation(sim_id, {
            'status': 'meshing',
            'progress': 40,
            'currentStep': 'Creating computational mesh...'
        })
        mesh_script = geo2mesh(case_name, geo_mesh, geo_df, type="cfmesh")
        
        # STEP 3: Mesh → CFD
        update_simulation(sim_id, {
            'status': 'cfd_setup',
            'progress': 60,
            'currentStep': 'Setting up CFD case...'
        })
        mesh2cfd(case_name, type="hvac", mesh_script=mesh_script)
        
        # STEP 4: Submit to Inductiva (NO ESPERA)
        update_simulation(sim_id, {
            'status': 'cloud_execution',
            'progress': 70,
            'currentStep': 'Submitting to cloud...'
        })
        
        sim_path = os.path.join(os.getcwd(), "cases", case_name, "sim")
        task_id = submit_to_inductiva(case_name, sim_path)
        
        update_simulation(sim_id, {
            'taskId': task_id,
            'progress': 75,
            'currentStep': 'Running on Inductiva cloud...'
        })
        
        logger.info(f"Sim {sim_id} submitted. Task ID: {task_id}")
        
    except Exception as e:
        logger.error(f"Error processing sim {sim_id}: {e}")
        update_simulation(sim_id, {
            'status': 'failed',
            'errorMessage': str(e)
        })

def main():
    logger.info("Worker Submit started")
    
    while True:
        try:
            sims = get_pending_simulations()
            
            for sim in sims:
                process_simulation(sim)
            
            time.sleep(POLLING_INTERVAL)
            
        except KeyboardInterrupt:
            logger.info("Worker stopped")
            break
        except Exception as e:
            logger.error(f"Worker error: {e}")
            time.sleep(POLLING_INTERVAL)

if __name__ == "__main__":
    main()
