import os
import sys
import time
import logging
import shutil
import requests
import inductiva

sys.path.append('.')

from step05_results2post import run as results2post

# Config
API_BASE = os.getenv('API_BASE_URL', 'http://localhost:5000')
API_KEY = 'flowerpower-external-api'
POLLING_INTERVAL = 30
INDUCTIVA_API_KEY = os.getenv('INDUCTIVA_API_KEY')

if INDUCTIVA_API_KEY:
    os.environ['INDUCTIVA_API_KEY'] = INDUCTIVA_API_KEY

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_cloud_execution_sims():
    """Obtiene sims con status='cloud_execution'"""
    try:
        response = requests.get(
            f"{API_BASE}/api/external/simulations/cloud_execution",
            headers={'x-api-key': API_KEY}
        )
        if response.ok:
            data = response.json()
            # Si retorna objeto con 'simulations', extraer array
            if isinstance(data, dict) and 'simulations' in data:
                return data['simulations']
            # Si retorna array directo, usar como está
            return data if isinstance(data, list) else []
        return []
    except Exception as e:
        logger.error(f"Failed to fetch cloud sims: {e}")
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

def check_task_status(task_id):
    """Chequea status de task en Inductiva"""
    try:
        task = inductiva.tasks.Task(task_id)
        status = task.get_status()
        return str(status)
    except Exception as e:
        logger.error(f"Failed to check task {task_id}: {e}")
        return None

def download_results(task_id, case_name):
    """Descarga resultados de Inductiva"""
    try:
        task = inductiva.tasks.Task(task_id)
        sim_path = os.path.join(os.getcwd(), "cases", case_name, "sim")
        
        logger.info(f"Downloading results for {case_name}")
        task.download_outputs(output_dir=sim_path)
        
        return True
    except Exception as e:
        logger.error(f"Failed to download results: {e}")
        return False

def copy_results_to_public(case_name, sim_id):
    """Copia resultados a carpeta pública"""
    try:
        post_path = os.path.join(os.getcwd(), "cases", case_name, "post")
        public_path = os.path.join(os.getcwd(), "public", "uploads", f"sim_{sim_id}")
        
        os.makedirs(public_path, exist_ok=True)
        
        # Copiar PDF
        pdf_src = os.path.join(post_path, "post_report.pdf")
        if os.path.exists(pdf_src):
            shutil.copy(pdf_src, os.path.join(public_path, "report.pdf"))
        
        # Copiar imágenes
        img_dir = os.path.join(post_path, "images")
        img_dest = os.path.join(public_path, "images")
        if os.path.exists(img_dir):
            os.makedirs(img_dest, exist_ok=True)
            for img in os.listdir(img_dir):
                if img.endswith('.png'):
                    shutil.copy(
                        os.path.join(img_dir, img),
                        os.path.join(img_dest, img)
                    )
        
        # Copiar VTK desde post/obj (slices generados por post-procesamiento)
        obj_dir = os.path.join(post_path, "obj")
        obj_dest = os.path.join(public_path, "vtk")
        if os.path.exists(obj_dir):
            os.makedirs(obj_dest, exist_ok=True)
            for vtk in os.listdir(obj_dir):
                if vtk.endswith('.vtk'):
                    shutil.copy(
                        os.path.join(obj_dir, vtk),
                        os.path.join(obj_dest, vtk)
                    )
        
        # Copiar VTK desde sim/VTK (volumen completo generado por OpenFOAM)
        sim_path = os.path.join(os.getcwd(), "cases", case_name, "sim")
        sim_vtk_dir = os.path.join(sim_path, "VTK")
        if os.path.exists(sim_vtk_dir):
            os.makedirs(obj_dest, exist_ok=True)
            for vtk_folder in os.listdir(sim_vtk_dir):
                vtk_folder_path = os.path.join(sim_vtk_dir, vtk_folder)
                if os.path.isdir(vtk_folder_path):
                    for vtk_file in os.listdir(vtk_folder_path):
                        if vtk_file.endswith('.vtk'):
                            shutil.copy(
                                os.path.join(vtk_folder_path, vtk_file),
                                os.path.join(obj_dest, f"openfoam_{vtk_file}")
                            )
        
        # Retornar rutas
        images_list = [f"/uploads/sim_{sim_id}/images/{img}" for img in os.listdir(img_dest) if img.endswith('.png')] if os.path.exists(img_dest) else []
        vtk_list = [f"/uploads/sim_{sim_id}/vtk/{vtk}" for vtk in os.listdir(obj_dest) if vtk.endswith('.vtk')] if os.path.exists(obj_dest) else []
        
        result_paths = {
            "pdf": f"/uploads/sim_{sim_id}/report.pdf",
            "images": images_list,
            "vtk": vtk_list
        }
        
        return result_paths
        
    except Exception as e:
        logger.error(f"Failed to copy results: {e}")
        return None

def process_completed_simulation(sim):
    """Procesa simulación completada en Inductiva"""
    sim_id = sim['id']
    task_id = sim.get('taskId')
    case_name = f"sim_{sim_id}"
    
    try:
        logger.info(f"Processing completed sim {sim_id}")
        
        # Update: post_processing
        update_simulation(sim_id, {
            'status': 'post_processing',
            'progress': 90,
            'currentStep': 'Downloading results...'
        })
        
        # Download results
        if not download_results(task_id, case_name):
            raise Exception("Failed to download results")
        
        # STEP 5: Post-processing
        update_simulation(sim_id, {
            'progress': 95,
            'currentStep': 'Generating visualizations...'
        })
        
        results2post(case_name)
        
        # Copy to public folder
        result_paths = copy_results_to_public(case_name, sim_id)
        
        if not result_paths:
            raise Exception("Failed to copy results")
        
        # Update: completed
        update_simulation(sim_id, {
            'status': 'completed',
            'progress': 100,
            'currentStep': 'Completed',
            'result': result_paths,
            'completedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        })
        
        logger.info(f"Sim {sim_id} completed successfully")
        
    except Exception as e:
        logger.error(f"Error processing sim {sim_id}: {e}")
        update_simulation(sim_id, {
            'status': 'failed',
            'errorMessage': str(e)
        })

def main():
    logger.info("Worker Monitor started")
    
    while True:
        try:
            sims = get_cloud_execution_sims()
            
            for sim in sims:
                task_id = sim.get('taskId')
                if not task_id:
                    continue
                
                status = check_task_status(task_id)
                
                if status == 'TaskStatusCode.SUCCESS':
                    process_completed_simulation(sim)
                elif status == 'TaskStatusCode.FAILED':
                    update_simulation(sim['id'], {
                        'status': 'failed',
                        'errorMessage': 'Inductiva task failed'
                    })
            
            time.sleep(POLLING_INTERVAL)
            
        except KeyboardInterrupt:
            logger.info("Worker stopped")
            break
        except Exception as e:
            logger.error(f"Worker error: {e}")
            time.sleep(POLLING_INTERVAL)

if __name__ == "__main__":
    main()
