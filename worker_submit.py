import os
import sys
import time
import logging
import traceback
from datetime import datetime
from typing import Callable, Dict, Any, List
import requests

# Add project root to Python path for module imports
project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from step01_json2geo import run as json2geo
from step02_geo2mesh import run as geo2mesh
from step03_mesh2cfd import run as mesh2cfd
from mesher_config import get_default_mesher
from pipeline_exceptions import (
    PipelineStepError,
    GeometryStepError,
    MeshingStepError,
    CFDSetupError,
    SubmissionError
)

# Config
API_BASE = os.getenv('API_BASE_URL', 'http://localhost:5000')
API_KEY = 'flowerpower-external-api'
POLLING_INTERVAL = 10

# Configure structured logging with clear prefix
logging.basicConfig(
    level=logging.INFO, 
    format='[WORKER_SUBMIT] [%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Inductiva configuration
INDUCTIVA_API_KEY = os.getenv('INDUCTIVA_API_KEY')

def log_startup_configuration():
    """Log environment and configuration at startup for debugging."""
    is_production = os.getenv('NODE_ENV') == 'production'
    env_label = "PRODUCTION" if is_production else "DEVELOPMENT"
    
    logger.info("=" * 60)
    logger.info(f"🚀 WORKER_SUBMIT STARTING")
    logger.info("=" * 60)
    logger.info(f"Environment: {env_label}")
    logger.info(f"NODE_ENV: {os.getenv('NODE_ENV', 'not set')}")
    logger.info(f"API_BASE: {API_BASE}")
    
    # Cases directory
    cases_dir = os.path.join(os.getcwd(), 'cases')
    logger.info(f"Cases Directory: {cases_dir}")
    
    # Inductiva configuration
    inductiva_configured = bool(INDUCTIVA_API_KEY)
    inductiva_status = "✓ CONFIGURED" if inductiva_configured else "❌ NOT CONFIGURED"
    logger.info(f"Inductiva API: {inductiva_status}")
    if inductiva_configured:
        key_preview = INDUCTIVA_API_KEY[:8] + "..." if len(INDUCTIVA_API_KEY) > 8 else "***"
        logger.info(f"Inductiva Key: {key_preview}")
        
        # Try to get machine group info
        try:
            import inductiva
            machine_group = os.getenv('INDUCTIVA_MACHINE_GROUP', 'default')
            logger.info(f"Machine Group: {machine_group}")
        except Exception:
            pass
    else:
        logger.error("⚠️ Inductiva API key not set - job submission will fail!")
    
    # Default mesher
    try:
        default_mesher = get_default_mesher()
        logger.info(f"Default Mesher: {default_mesher}")
    except Exception:
        logger.info("Default Mesher: cfmesh (fallback)")
    
    # Production notes
    if is_production:
        logger.info("-" * 60)
        logger.info("PRODUCTION MODE NOTES:")
        logger.info("  - Jobs submitted to Inductiva cloud")
        logger.info("  - Results monitored by worker_monitor")
        logger.info("-" * 60)
    
    logger.info("=" * 60)


def get_pending_simulations():
    """Obtiene sims con status='pending'"""
    try:
        response = requests.get(
            f"{API_BASE}/api/external/simulations/pending",
            headers={'x-api-key': API_KEY}
        )
        if response.ok:
            data = response.json()
            if isinstance(data, dict) and 'simulations' in data:
                return data['simulations']
            return data if isinstance(data, list) else []
        else:
            logger.error(f"Request failed: {response.status_code}")
        return []
    except Exception as e:
        logger.error(f"Failed to fetch pending sims: {e}")
        return []


def update_simulation(sim_id: int, data: Dict[str, Any]):
    """Actualiza status/progress de simulación"""
    try:
        requests.patch(
            f"{API_BASE}/api/external/simulations/{sim_id}/status",
            json=data,
            headers={'x-api-key': API_KEY}
        )
    except Exception as e:
        logger.error(f"Failed to update sim {sim_id}: {e}")


def update_simulation_failure(sim_id: int, step: str, error: Exception):
    """
    Utility to update DB with consistent failure information.
    
    Args:
        sim_id: Simulation ID
        step: Pipeline step where failure occurred
        error: Exception that caused the failure
    """
    error_message = str(error)
    
    # Build comprehensive error payload
    payload = {
        'status': 'failed',
        'errorMessage': error_message,
        'currentStep': f'Failed at {step}',
        'completedAt': datetime.utcnow().isoformat(),
        'failedStep': step,  # CRITICAL: Record which step failed
        'errorType': type(error).__name__
    }
    
    # Add domain-specific details from PipelineStepError
    if isinstance(error, PipelineStepError):
        # Serialize error.details for DB storage
        if error.details:
            payload['failureDetails'] = error.details
            # Extract suggestion if available for easier frontend access
            if 'suggestion' in error.details:
                payload['suggestion'] = error.details['suggestion']
    
    update_simulation(sim_id, payload)
    
    logger.error(f"Simulation {sim_id} failed at {step}: {error_message}")
    if isinstance(error, PipelineStepError):
        logger.debug(f"Error details: {error.details}")


def submit_to_inductiva(case_name: str, sim_path: str) -> str:
    """Submit a Inductiva y retorna task_id"""
    try:
        from src.components.solve.inductiva import solve_inductiva
        task_id = solve_inductiva(sim_path, machine_type="c2d-standard-8", wait=False)
        return task_id
    except Exception as e:
        raise SubmissionError(f"Failed to submit to Inductiva: {str(e)}", {
            'case_name': case_name,
            'sim_path': sim_path
        })


class SimulationPipeline:
    """
    Orchestrator for CFD simulation pipeline with fail-fast error handling.
    
    Executes steps sequentially: geometry → meshing → cfd_setup → submit
    Stops immediately on first error and updates DB with diagnostic info.
    """
    
    def __init__(self, sim: Dict[str, Any]):
        self.sim = sim
        self.sim_id = sim['id']
        self.case_name = f"sim_{self.sim_id}"
        self.simulation_type = sim.get('simulationType', 'comfortTest')  # Default to TEST
        
        # Parse jsonConfig if string
        if isinstance(sim.get('jsonConfig'), str):
            import json as json_module
            self.sim['jsonConfig'] = json_module.loads(sim['jsonConfig'])
        
        # Pipeline step definitions
        self.steps = [
            {
                'id': 'geometry',
                'status': 'geometry',
                'progress': 20,
                'label': 'Generating 3D geometry...',
                'callable': self._step_geometry,
                'error_class': GeometryStepError
            },
            {
                'id': 'meshing',
                'status': 'meshing',
                'progress': 40,
                'label': 'Creating computational mesh...',
                'callable': self._step_meshing,
                'error_class': MeshingStepError
            },
            {
                'id': 'cfd_setup',
                'status': 'cfd_setup',
                'progress': 60,
                'label': 'Setting up CFD case...',
                'callable': self._step_cfd_setup,
                'error_class': CFDSetupError
            },
            {
                'id': 'submission',
                'status': 'cloud_execution',
                'progress': 75,
                'label': 'Submitting to cloud...',
                'callable': self._step_submit,
                'error_class': SubmissionError
            }
        ]
        
        # State storage for intermediate results
        self.state = {}
    
    def run(self):
        """
        Execute pipeline steps sequentially.
        Stops on first error and updates DB accordingly.
        """
        try:
            logger.info(f"[Pipeline] Starting simulation {self.sim_id}")
            
            # Initialize
            update_simulation(self.sim_id, {
                'status': 'processing',
                'progress': 10,
                'currentStep': 'Initializing...',
                'startedAt': datetime.utcnow().isoformat()
            })
            
            # Execute each step
            for step in self.steps:
                self._execute_step(step)
            
            logger.info(f"[Pipeline] Simulation {self.sim_id} submitted successfully")
            
        except PipelineStepError as e:
            # Domain-specific error - already logged and DB updated
            logger.error(f"[Pipeline] Simulation {self.sim_id} failed at {e.step_name}")
            update_simulation_failure(self.sim_id, e.step_name, e)
            
        except Exception as e:
            # Unexpected error
            logger.error(f"[Pipeline] Unexpected error in simulation {self.sim_id}: {e}")
            logger.error(traceback.format_exc())
            update_simulation_failure(self.sim_id, 'unknown', e)
    
    def _execute_step(self, step: Dict[str, Any]):
        """
        Execute a single pipeline step with error handling.
        
        Updates DB before/after execution and captures errors with context.
        """
        step_id = step['id']
        step_label = step['label']
        
        logger.info(f"[Pipeline][{step_id}] Starting: {step_label}")
        
        # Update DB: step started
        update_simulation(self.sim_id, {
            'status': step['status'],
            'progress': step['progress'],
            'currentStep': step_label
        })
        
        try:
            # Execute step callable
            result = step['callable']()
            
            # Store result in state for next steps
            self.state[step_id] = result
            
            logger.info(f"[Pipeline][{step_id}] Completed successfully")
            
        except PipelineStepError:
            # Re-raise pipeline errors without wrapping
            raise
            
        except Exception as e:
            # Wrap unexpected errors in appropriate domain exception
            error_class = step['error_class']
            error_msg = f"{step_label} failed: {str(e)}"
            
            logger.error(f"[Pipeline][{step_id}] ERROR: {error_msg}")
            logger.error(traceback.format_exc())
            
            raise error_class(error_msg, {
                'original_error': str(e),
                'traceback': traceback.format_exc()
            })
    
    # Step implementations
    
    def _step_geometry(self):
        """Step 1: JSON → Geometry"""
        try:
            geo_mesh, geo_df = json2geo(self.sim['jsonConfig'], self.case_name)
            return {'geo_mesh': geo_mesh, 'geo_df': geo_df}
        except Exception as e:
            raise GeometryStepError(
                f"Geometry generation failed: {str(e)}",
                {
                    'case_name': self.case_name,
                    'suggestion': 'Check if room polygon is closed and valid'
                }
            )
    
    def _step_meshing(self):
        """Step 2: Geometry → Mesh"""
        try:
            geo_data = self.state['geometry']
            mesher_type = get_default_mesher()
            logger.info(f"Using mesher: {mesher_type}")
            mesh_script = geo2mesh(
                self.case_name,
                geo_data['geo_mesh'],
                geo_data['geo_df'],
                type=mesher_type
            )
            return {'mesh_script': mesh_script}
        except Exception as e:
            raise MeshingStepError(
                f"Mesh generation failed: {str(e)}",
                {
                    'case_name': self.case_name,
                    'suggestion': 'Check if geometry is valid for meshing'
                }
            )
    
    def _step_cfd_setup(self):
        """Step 3: Mesh → CFD"""
        try:
            mesh_data = self.state['meshing']
            mesh2cfd(
                self.case_name,
                type="hvac",
                mesh_script=mesh_data['mesh_script'],
                simulation_type=self.simulation_type  # Pass simulation type for iteration config
            )
            return {'cfd_ready': True}
        except Exception as e:
            raise CFDSetupError(
                f"CFD setup failed: {str(e)}",
                {
                    'case_name': self.case_name,
                    'suggestion': 'Check boundary conditions and solver settings'
                }
            )
    
    def _step_submit(self):
        """Step 4: Submit to Inductiva"""
        sim_path = os.path.join(os.getcwd(), "cases", self.case_name, "sim")
        task_id = submit_to_inductiva(self.case_name, sim_path)
        
        # Update with task ID
        update_simulation(self.sim_id, {
            'status': 'cloud_execution',
            'taskId': task_id,
            'progress': 75,
            'currentStep': 'Running on Inductiva cloud...'
        })
        
        return {'task_id': task_id}


def process_simulation(sim: Dict[str, Any]):
    """Process a single simulation through the pipeline"""
    pipeline = SimulationPipeline(sim)
    pipeline.run()


def main():
    # Log startup configuration for debugging
    log_startup_configuration()
    
    while True:
        try:
            sims = get_pending_simulations()
            
            # Filter only HVAC simulations (comfortTest/comfort30Iter)
            sims = [s for s in sims if s.get('simulationType') in ['comfortTest', 'comfort30Iter']]
            logger.info(f"Found {len(sims)} HVAC simulations to process")
            
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
