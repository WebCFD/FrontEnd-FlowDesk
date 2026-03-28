import os
import sys
import time
import logging
import shutil
import requests
import subprocess
import threading
import gc
import traceback
from datetime import datetime, timezone

sys.path.append('.')

from src.components.tools.vtk_to_vtkjs import vtk_to_vtkjs
from src.components.solve.cfdfeaservice import (
    STATUS_QUEUED,
    check_status,
    download_results,
    STATUS_COMPLETED,
    STATUS_ERROR,
    STATUS_RUNNING,
    STATUS_PENDING,
    STATUS_STOPPED,
)

STATUS_LABELS = {
    STATUS_COMPLETED: 'COMPLETED',
    STATUS_PENDING:   'PENDING',
    STATUS_RUNNING:   'RUNNING',
    STATUS_QUEUED:    'QUEUED',
    STATUS_STOPPED:   'STOPPED',
    STATUS_ERROR:     'ERROR',
}

# Config
API_BASE = os.getenv('API_BASE_URL', 'http://localhost:5000')
API_KEY = 'flowerpower-external-api'
_node_env_default = 'production' if os.getenv('NODE_ENV') == 'production' else 'development'
WORKER_ENVIRONMENT = os.getenv('APP_ENVIRONMENT', _node_env_default)
POLLING_INTERVAL = 30
CFDFEASERVICE_API_KEY = os.getenv('CFDFEASERVICE_API_KEY')

# Configure structured logging with clear prefix
logging.basicConfig(
    level=logging.INFO,
    format='[WORKER_MONITOR] [%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def log_startup_configuration():
    """Log environment and configuration at startup for debugging."""
    is_production = os.getenv('NODE_ENV') == 'production'
    env_label = "PRODUCTION" if is_production else "DEVELOPMENT"
    
    logger.info("=" * 60)
    logger.info("WORKER_MONITOR STARTING")
    logger.info("Process manager: supervisord (supervisord.conf)")
    logger.info("Operate with: supervisorctl start/stop/restart worker_monitor")
    logger.info("=" * 60)
    logger.info(f"Environment: {env_label}")
    logger.info(f"NODE_ENV: {os.getenv('NODE_ENV', 'not set')}")
    logger.info(f"WORKER_ENVIRONMENT (sim filter): {WORKER_ENVIRONMENT}")
    logger.info(f"API_BASE: {API_BASE}")
    
    # VTK upload paths
    vtk_base = '/tmp/uploads' if is_production else 'public/uploads'
    logger.info(f"VTK Upload Path: {vtk_base}/sim_*/vtk/")
    
    # R2 configuration
    r2_configured = all([
        os.getenv('R2_ENDPOINT'),
        os.getenv('R2_ACCESS_KEY_ID'),
        os.getenv('R2_SECRET_ACCESS_KEY')
    ])
    r2_status = "CONFIGURED" if r2_configured else "NOT CONFIGURED"
    logger.info(f"Cloudflare R2: {r2_status}")
    if r2_configured:
        endpoint = os.getenv('R2_ENDPOINT', '')
        logger.info(f"R2 Endpoint: {endpoint}")
        logger.info(f"R2 Bucket: {os.getenv('R2_BUCKET_NAME', 'flowdesk-vtk-storage')}")
    else:
        if is_production:
            logger.critical("CRITICAL: R2 not configured in PRODUCTION!")
            logger.critical("VTK files will NOT persist after container restart!")
        else:
            logger.warning("R2 not configured - VTK files will only be stored locally")
    
    # CFD FEA Service configuration
    cfd_configured = bool(CFDFEASERVICE_API_KEY)
    cfd_status = "CONFIGURED" if cfd_configured else "NOT CONFIGURED"
    logger.info(f"CFD FEA Service: {cfd_status}")
    if cfd_configured:
        key_preview = CFDFEASERVICE_API_KEY[:8] + "..." if len(CFDFEASERVICE_API_KEY) > 8 else "***"
        logger.info(f"CFD FEA Service Key: {key_preview}")
        logger.info(f"CFD FEA Service Host: {os.getenv('CFDFEASERVICE_HOST', 'https://cloud.cfdfeaservice.it')}")
    else:
        if os.getenv('SOLVER_TYPE', 'cloud') != 'local':
            logger.warning("CFDFEASERVICE_API_KEY not set — cloud simulations will fail")
        else:
            logger.info("SOLVER_TYPE=local — cloud solver not needed")
    
    # Persistence warning for production
    if is_production:
        logger.info("-" * 60)
        logger.info("PRODUCTION MODE NOTES:")
        logger.info("  - Filesystem is EPHEMERAL (/tmp)")
        logger.info("  - VTK files MUST be uploaded to R2 for persistence")
        logger.info("  - Container may restart at any time")
        logger.info("-" * 60)
    
    logger.info("=" * 60)

def get_cloud_execution_sims():
    """Obtiene sims con status='cloud_execution'"""
    try:
        response = requests.get(
            f"{API_BASE}/api/external/simulations/cloud_execution",
            headers={'x-api-key': API_KEY},
            params={'environment': WORKER_ENVIRONMENT}
        )
        if response.ok:
            data = response.json()
            if isinstance(data, dict) and 'simulations' in data:
                return data['simulations']
            return data if isinstance(data, list) else []
        return []
    except Exception as e:
        logger.error(f"Failed to fetch cloud sims: {e}")
        return []

def get_post_processing_sims():
    """Obtiene sims con status='post_processing' (huérfanas que necesitan completarse)"""
    try:
        response = requests.get(
            f"{API_BASE}/api/external/simulations/post_processing",
            headers={'x-api-key': API_KEY},
            params={'environment': WORKER_ENVIRONMENT}
        )
        if response.ok:
            data = response.json()
            if isinstance(data, dict) and 'simulations' in data:
                return data['simulations']
            return data if isinstance(data, list) else []
        return []
    except Exception as e:
        logger.error(f"Failed to fetch post_processing sims: {e}")
        return []

def update_simulation(sim_id, data):
    """Actualiza status/progress de simulación"""
    try:
        response = requests.patch(
            f"{API_BASE}/api/external/simulations/{sim_id}/status",
            json=data,
            headers={'x-api-key': API_KEY}
        )
        if not response.ok:
            logger.error(f"[Sim {sim_id}] API rejected status update: HTTP {response.status_code}")
            logger.error(f"[Sim {sim_id}] Response: {response.text}")
            logger.error(f"[Sim {sim_id}] Payload sent: {data}")
            return False
        return True
    except Exception as e:
        logger.error(f"Failed to update sim {sim_id}: {e}")
        return False

def check_task_status(task_id: str) -> int | None:
    """
    Check simulation status on CFD FEA Service.
    Returns numeric status code (10/20/30/40/50/60) or None on error.
    STATUS_COMPLETED=10, STATUS_PENDING=20, STATUS_RUNNING=30,
    STATUS_QUEUED=40, STATUS_STOPPED=50, STATUS_ERROR=60
    """
    if not CFDFEASERVICE_API_KEY:
        logger.error("CFDFEASERVICE_API_KEY not set — cannot check task status")
        return None
    try:
        return check_status(task_id, CFDFEASERVICE_API_KEY)
    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else "?"
        body = (e.response.text[:500] if e.response is not None else "") or ""
        logger.error(f"HTTP {code} checking task {task_id}: {body}")
        return None
    except Exception as e:
        logger.error(f"Failed to check task {task_id}: {e}")
        return None

def _download_with_retry(task_id: str, case_name: str, max_attempts: int = 3, wait_seconds: int = 60) -> bool:
    """
    Download simulation results from CFD FEA Service with retry/backoff.
    Retries up to max_attempts times with wait_seconds between attempts.
    Only returns False after all attempts are exhausted.
    """
    if not CFDFEASERVICE_API_KEY:
        logger.error("CFDFEASERVICE_API_KEY not set — cannot download results")
        return False

    sim_path = os.path.join(os.getcwd(), "cases", case_name, "sim")

    last_exc: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            logger.info(f"[{case_name}] Download attempt {attempt}/{max_attempts} for task {task_id}")
            result = download_results(task_id, sim_path, CFDFEASERVICE_API_KEY)
            if result:
                logger.info(f"[{case_name}] Download succeeded on attempt {attempt}")
                return True
            logger.warning(f"[{case_name}] download_results returned False on attempt {attempt}")
            last_exc = None  # not an exception, just a False return
        except requests.HTTPError as e:
            last_exc = e
            code = e.response.status_code if e.response is not None else "?"
            body = (e.response.text[:500] if e.response is not None else "") or ""
            logger.error(f"[{case_name}] HTTP {code} on download attempt {attempt}: {body}")
            logger.error(traceback.format_exc())
        except Exception as e:
            last_exc = e
            logger.error(f"[{case_name}] Download attempt {attempt} failed: {type(e).__name__}: {e}")
            logger.error(traceback.format_exc())

        if attempt < max_attempts:
            logger.info(f"[{case_name}] Waiting {wait_seconds}s before retry {attempt + 1}...")
            time.sleep(wait_seconds)

    if last_exc is not None:
        logger.error(
            f"[{case_name}] All {max_attempts} download attempts failed for task {task_id}. "
            f"Last error: {type(last_exc).__name__}: {last_exc}"
        )
    else:
        logger.error(
            f"[{case_name}] All {max_attempts} download attempts returned False for task {task_id}"
        )
    return False

def copy_results_to_public(case_name, sim_id):
    """
    Copia y convierte archivos VTK a carpeta pública para el visualizador web.
    """
    try:
        post_path = os.path.join(os.getcwd(), "cases", case_name, "post")
        
        is_production = os.getenv('NODE_ENV') == 'production'
        if is_production:
            public_path = os.path.join("/tmp/uploads", f"sim_{sim_id}")
        else:
            public_path = os.path.join(os.getcwd(), "public", "uploads", f"sim_{sim_id}")
        
        os.makedirs(public_path, exist_ok=True)
        
        obj_dir = os.path.join(post_path, "obj")
        obj_dest = os.path.join(public_path, "vtk")
        
        if os.path.exists(obj_dir):
            os.makedirs(obj_dest, exist_ok=True)
            vtk_count = 0
            
            for vtk in os.listdir(obj_dir):
                if vtk.endswith('.vtk') or vtk.endswith('.vtu'):
                    vtk_path = os.path.join(obj_dir, vtk)
                    vtkjs_name = vtk.replace('.vtk', '.vtkjs').replace('.vtu', '.vtkjs')
                    vtkjs_path = os.path.join(obj_dest, vtkjs_name)
                    
                    try:
                        vtk_to_vtkjs(vtk_path, vtkjs_path)
                        vtk_count += 1
                        logger.info(f"Converted {vtk} to {vtkjs_name}")
                    except Exception as e:
                        logger.error(f"Failed to convert {vtk}: {e}")
            
            logger.info(f"Converted {vtk_count} VTK files for sim {sim_id}")
        else:
            logger.warning(f"No VTK files found in {obj_dir}")
        
        sim_path = os.path.join(os.getcwd(), "cases", case_name, "sim")
        sim_vtk_dir = os.path.join(sim_path, "VTK")
        
        if os.path.exists(sim_vtk_dir):
            os.makedirs(obj_dest, exist_ok=True)
            openfoam_count = 0
            
            for root, dirs, files in os.walk(sim_vtk_dir):
                for vtk_file in files:
                    if vtk_file.endswith('.vtk') or vtk_file.endswith('.vtu') or vtk_file.endswith('.vtp'):
                        vtk_path = os.path.join(root, vtk_file)
                        rel_path = os.path.relpath(vtk_path, sim_vtk_dir)
                        safe_name = rel_path.replace(os.sep, '_').replace('.vtk', '').replace('.vtu', '').replace('.vtp', '')
                        vtkjs_name = f"openfoam_{safe_name}.vtkjs"
                        vtkjs_path = os.path.join(obj_dest, vtkjs_name)
                        
                        try:
                            vtk_to_vtkjs(vtk_path, vtkjs_path)
                            openfoam_count += 1
                            logger.info(f"Converted OpenFOAM {vtk_file} to {vtkjs_name}")
                        except Exception as e:
                            logger.error(f"Failed to convert OpenFOAM {vtk_file}: {e}")
            
            if openfoam_count > 0:
                logger.info(f"Converted {openfoam_count} OpenFOAM VTK files for sim {sim_id}")
        
        vtk_list = []
        if os.path.exists(obj_dest):
            vtk_list = [f"/uploads/sim_{sim_id}/vtk/{vtk}" for vtk in os.listdir(obj_dest) if vtk.endswith('.vtkjs')]
        
        result_paths = {"vtk": vtk_list}
        logger.info(f"Total VTK files available: {len(vtk_list)}")
        return result_paths
        
    except Exception as e:
        logger.error(f"Failed to copy results: {e}")
        return None

KNOWN_CASE_TYPES = {'IndoorSpaces', 'DataCenters', 'FireAndSmoke', 'IndustrialCooling'}

def resolve_case_type(sim: dict) -> str:
    """
    Extract the case type (IndoorSpaces/DataCenters/etc.) from simulation jsonConfig.
    Falls back to 'IndoorSpaces' if not found or if the stored value is a solver type
    (SteadySim/TransientSim) rather than a case type — which happens for simulations
    created before the solverType/simulationType split was fixed in the API.
    """
    json_config = sim.get('jsonConfig') or {}
    raw = json_config.get('simulationType', 'IndoorSpaces')
    if raw in KNOWN_CASE_TYPES:
        return raw
    logger.warning(f"[Worker] jsonConfig.simulationType='{raw}' is not a known case type — defaulting to IndoorSpaces")
    return 'IndoorSpaces'


def process_completed_simulation(sim):
    """
    Procesa simulación cuyo cloud task ha completado (status 10).
    Descarga resultados de CFD FEA Service, ejecuta step05 y sube a R2.
    """
    sim_id = sim['id']
    task_id = sim.get('taskId')
    case_name = f"sim_{sim_id}"
    case_type = resolve_case_type(sim)
    logger.info(f"[Sim {sim_id}] Case type resolved: {case_type}")
    
    logger.info(f"=" * 60)
    logger.info(f"STARTING PROCESSING: Simulation #{sim_id}")
    logger.info(f"=" * 60)
    
    try:
        update_simulation(sim_id, {
            'status': 'post_processing',
            'progress': 90,
            'currentStep': 'Downloading results...'
        })
        
        # ── Download results from CFD FEA Service ─────────────────────────────
        logger.info(f"[Sim {sim_id}] Step 1/4: Downloading results from CFD FEA Service...")
        sim_path = os.path.join(os.getcwd(), "cases", case_name, "sim")
        try:
            pre_files = os.listdir(sim_path) if os.path.exists(sim_path) else []
        except Exception:
            pre_files = []
        logger.info(f"[Sim {sim_id}] sim/ contents BEFORE download: {pre_files}")

        t0 = time.time()
        try:
            download_ok = task_id and _download_with_retry(task_id, case_name)
        except Exception as e:
            logger.error(f"[Sim {sim_id}] [download] took {time.time() - t0:.1f}s — FAILED: {type(e).__name__}: {e}")
            logger.error(traceback.format_exc())
            raise
        if not download_ok:
            logger.error(f"[Sim {sim_id}] [download] took {time.time() - t0:.1f}s — FAILED (all retries exhausted)")
            raise Exception("Failed to download results from CFD FEA Service after 3 attempts")
        logger.info(f"[Sim {sim_id}] [download] took {time.time() - t0:.1f}s")

        try:
            post_files = os.listdir(sim_path) if os.path.exists(sim_path) else []
        except Exception:
            post_files = []
        logger.info(f"[Sim {sim_id}] sim/ contents AFTER download: {post_files}")
        logger.info(f"[Sim {sim_id}] Results downloaded successfully")
        
        # Create results.foam marker for PyVista compatibility
        logger.info(f"[Sim {sim_id}] Step 2/4: Creating results.foam marker...")
        sim_path = os.path.join(os.getcwd(), "cases", case_name, "sim")
        foam_file = os.path.join(sim_path, "results.foam")
        try:
            with open(foam_file, 'w') as f:
                f.write("// Marker file for OpenFOAM case\n")
            logger.info(f"[Sim {sim_id}] results.foam created")
        except Exception as e:
            logger.warning(f"[Sim {sim_id}] Failed to create results.foam: {e}")
        
        # ── Step 5: Post-processing in isolated subprocess ────────────────────
        update_simulation(sim_id, {
            'progress': 95,
            'currentStep': 'Generating visualizations...'
        })
        
        logger.info(f"[Sim {sim_id}] Step 3/4: Running post-processing in isolated subprocess...")
        t0 = time.time()
        STEP05_WARN_SECS = 900
        STEP05_FAIL_SECS = 1800
        try:
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'
            env['LC_ALL'] = 'C.UTF-8'
            env['LANG'] = 'C.UTF-8'

            # Stream stdout+stderr line-by-line so logs appear in real time
            proc = subprocess.Popen(
                ["python3", "-u", "PYTHON_STEPS/step05_results2post.py", case_name, case_type],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                env=env,
            )

            def _stream_step05(p, sid):
                try:
                    for line in p.stdout:
                        logger.info(f"[Sim {sid}] [step05] {line.rstrip()}")
                except Exception:
                    pass

            stream_thread = threading.Thread(target=_stream_step05, args=(proc, sim_id), daemon=True)
            stream_thread.start()

            _warned_05 = False
            while True:
                try:
                    proc.wait(timeout=30)
                    break
                except subprocess.TimeoutExpired:
                    elapsed = time.time() - t0
                    if not _warned_05 and elapsed >= STEP05_WARN_SECS:
                        logger.warning(
                            f"[Sim {sim_id}] [step05] ⚠ running for {elapsed:.0f}s — "
                            f"still alive, will be killed at {STEP05_FAIL_SECS}s"
                        )
                        _warned_05 = True
                    if elapsed >= STEP05_FAIL_SECS:
                        proc.kill()
                        stream_thread.join(timeout=3)
                        logger.error(
                            f"[Sim {sim_id}] [step05] took {elapsed:.1f}s — "
                            f"TIMEOUT after {STEP05_FAIL_SECS}s"
                        )
                        raise Exception(f"Post-processing timeout after {STEP05_FAIL_SECS}s")

            stream_thread.join(timeout=5)

            if proc.returncode != 0:
                elapsed = time.time() - t0
                logger.error(f"[Sim {sim_id}] [step05] took {elapsed:.1f}s — FAILED (exit code {proc.returncode})")
                raise subprocess.CalledProcessError(proc.returncode, proc.args)

            logger.info(f"[Sim {sim_id}] [step05] took {time.time() - t0:.1f}s — completed successfully")

        except subprocess.CalledProcessError as e:
            logger.error(f"[Sim {sim_id}] [step05] FAILED (exit code {e.returncode})")
            logger.error(traceback.format_exc())
            
            if e.returncode == -9 or e.returncode == 137:
                error_msg = (
                    "Out of Memory: Post-processing was killed by the system (SIGKILL). "
                    "The simulation mesh may be too large for available memory. "
                    "Try reducing mesh resolution or simplifying the geometry."
                )
                logger.error(f"[Sim {sim_id}] OOM DETECTED: Process killed with signal SIGKILL")
                raise Exception(error_msg)
            else:
                raise Exception(f"Post-processing failed with exit code {e.returncode}")
        
        # ── Copy to public folder ──────────────────────────────────────────────
        logger.info(f"[Sim {sim_id}] Step 4/4: Copying VTK files to public folder...")
        t0 = time.time()
        try:
            result_paths = copy_results_to_public(case_name, sim_id)
        except Exception as e:
            logger.error(f"[Sim {sim_id}] [copy] took {time.time() - t0:.1f}s — FAILED: {type(e).__name__}: {e}")
            logger.error(traceback.format_exc())
            raise
        
        if not result_paths:
            raise Exception("Failed to copy results")
        
        logger.info(f"[Sim {sim_id}] [copy] took {time.time() - t0:.1f}s — {len(result_paths.get('vtk', []))} VTK files copied")
        
        # Upload to Cloudflare R2
        is_production = os.getenv('NODE_ENV') == 'production'
        env_label = "PRODUCTION" if is_production else "DEVELOPMENT"
        vtk_dir = f'/tmp/uploads/sim_{sim_id}/vtk' if is_production else f'public/uploads/sim_{sim_id}/vtk'
        
        logger.info(f"[Sim {sim_id}] Uploading VTK files to Cloudflare R2... ({env_label})")
        
        r2_configured = all([
            os.getenv('R2_ENDPOINT'),
            os.getenv('R2_ACCESS_KEY_ID'),
            os.getenv('R2_SECRET_ACCESS_KEY')
        ])
        
        if not r2_configured:
            logger.error(f"[Sim {sim_id}] R2 CREDENTIALS MISSING — Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")
            if is_production:
                logger.critical(f"[Sim {sim_id}] CRITICAL: VTK files in {vtk_dir} will be LOST when container restarts!")
            else:
                logger.warning(f"[Sim {sim_id}] Development mode: Files persist in {vtk_dir}")
            r2_upload_success = False
        else:
            r2_upload_success = False
            try:
                env = os.environ.copy()
                env['PYTHONIOENCODING'] = 'utf-8'
                env['LC_ALL'] = 'C.UTF-8'
                env['LANG'] = 'C.UTF-8'
                
                upload_result = subprocess.run(
                    ["python3", "upload_vtk_to_r2.py", str(sim_id), vtk_dir],
                    capture_output=True,
                    text=True,
                    timeout=600,
                    check=True,
                    env=env,
                    encoding='utf-8'
                )
                
                if upload_result.stdout:
                    logger.info(f"[Sim {sim_id}] R2 Upload output:\n{upload_result.stdout}")
                if upload_result.stderr:
                    logger.warning(f"[Sim {sim_id}] R2 Upload stderr:\n{upload_result.stderr}")
                
                logger.info(f"[Sim {sim_id}] VTK files uploaded to Cloudflare R2 — PERSISTENT")
                r2_upload_success = True
                
            except subprocess.TimeoutExpired:
                logger.error(f"[Sim {sim_id}] R2 UPLOAD TIMEOUT after 10 minutes")
            except subprocess.CalledProcessError as e:
                logger.error(f"[Sim {sim_id}] R2 UPLOAD FAILED (exit code {e.returncode})")
                if e.stdout:
                    logger.error(f"[Sim {sim_id}] stdout: {e.stdout}")
                if e.stderr:
                    logger.error(f"[Sim {sim_id}] stderr: {e.stderr}")
            except Exception as e:
                logger.error(f"[Sim {sim_id}] R2 UPLOAD ERROR: {type(e).__name__}: {e}")
        
        if not r2_upload_success:
            logger.warning(f"[Sim {sim_id}] VTK PERSISTENCE STATUS: NOT GUARANTEED — local: {vtk_dir}")
            if is_production:
                logger.warning(f"[Sim {sim_id}] PRODUCTION WARNING: Files in /tmp are EPHEMERAL")
        else:
            logger.info(f"[Sim {sim_id}] VTK PERSISTENCE STATUS: GUARANTEED (R2)")
        
        update_simulation(sim_id, {
            'status': 'completed',
            'progress': 100,
            'currentStep': 'Completed',
            'result': result_paths,
            'completedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        })
        
        logger.info(f"SIMULATION #{sim_id} COMPLETED SUCCESSFULLY")
        logger.info(f"=" * 60)
        return True
        
    except Exception as e:
        logger.error(f"ERROR PROCESSING SIMULATION #{sim_id}: {type(e).__name__}: {e}")
        logger.error(traceback.format_exc())
        logger.error(f"=" * 60)
        update_simulation(sim_id, {
            'status': 'failed',
            'errorMessage': str(e)
        })
        return False
    finally:
        try:
            temp_case_path = os.path.join(os.getcwd(), "cases", case_name)
            if os.path.exists(temp_case_path):
                logger.info(f"[Sim {sim_id}] Cleaning up temporary files in {temp_case_path}")
                sim_dir = os.path.join(temp_case_path, "sim")
                if os.path.exists(sim_dir):
                    for item in os.listdir(sim_dir):
                        item_path = os.path.join(sim_dir, item)
                        if os.path.isdir(item_path) and item.replace('.', '').isdigit():
                            shutil.rmtree(item_path)
                            logger.info(f"[Sim {sim_id}] Deleted time directory: {item}")
        except Exception as cleanup_error:
            logger.warning(f"[Sim {sim_id}] Cleanup warning (non-critical): {cleanup_error}")

def cleanup_old_uploads(keep_last_n=5):
    """Clean up old simulation uploads from /tmp/uploads to free disk space."""
    try:
        is_production = os.getenv('NODE_ENV') == 'production'
        if not is_production:
            return

        uploads_dir = "/tmp/uploads"
        if not os.path.exists(uploads_dir):
            return
        
        sim_dirs = []
        for item in os.listdir(uploads_dir):
            item_path = os.path.join(uploads_dir, item)
            if os.path.isdir(item_path) and item.startswith('sim_'):
                try:
                    sim_id = int(item.replace('sim_', ''))
                    sim_dirs.append((sim_id, item_path))
                except ValueError:
                    continue
        
        sim_dirs.sort(key=lambda x: x[0], reverse=True)
        
        deleted_count = 0
        for sim_id, dir_path in sim_dirs[keep_last_n:]:
            try:
                shutil.rmtree(dir_path)
                logger.info(f"Deleted old upload: sim_{sim_id} (freeing disk space)")
                deleted_count += 1
            except Exception as e:
                logger.warning(f"Failed to delete {dir_path}: {e}")
        
        if deleted_count > 0:
            logger.info(f"Cleaned up {deleted_count} old simulation(s) from /tmp/uploads")
        
    except Exception as e:
        logger.warning(f"Upload cleanup warning (non-critical): {e}")

def main():
    log_startup_configuration()
    
    logger.info("Memory Management: ENABLED (1 simulation per 30s cycle)")
    logger.info("OOM Protection: ACTIVE (subprocess isolation + garbage collection)")
    
    cycle_count = 0
    
    while True:
        cycle_count += 1
        processed_in_cycle = False
        
        try:
            logger.info(f"\n{'='*80}")
            logger.info(f"POLLING CYCLE #{cycle_count}")
            logger.info(f"{'='*80}")
            
            if cycle_count % 10 == 1:
                cleanup_old_uploads(keep_last_n=5)
            
            # Poll cloud_execution sims via CFD FEA Service REST API
            sims = get_cloud_execution_sims()
            logger.info(f"Found {len(sims)} simulation(s) in 'cloud_execution' state")
            
            STALE_TIMEOUT_HOURS = 4
            STALE_TIMEOUT_SECONDS = STALE_TIMEOUT_HOURS * 3600
            processed_count = 0
            
            for sim in sims:
                if processed_count >= 1:
                    remaining = len(sims) - processed_count
                    logger.info(f"MEMORY PROTECTION: Deferring {remaining} remaining simulation(s) to next cycle")
                    break
                
                sim_id = sim.get('id')
                task_id = sim.get('taskId')
                if not task_id:
                    logger.warning(f"Sim {sim_id} has no taskId, skipping")
                    continue
                
                logger.info(f"Checking CFD FEA Service status for sim {sim_id} (task: {task_id})")
                status = check_task_status(task_id)
                label = STATUS_LABELS.get(status, 'UNKNOWN')
                logger.info(f"Sim {sim_id} cloud status: {status} ({label})")

                # ── Stale sim timeout ──────────────────────────────────────────
                if status in (STATUS_STOPPED, STATUS_ERROR, None):
                    updated_at_str = sim.get('updatedAt') or sim.get('updated_at')
                    if updated_at_str:
                        try:
                            # Handle both "Z" suffix and "+00:00" offset formats
                            updated_at_str_clean = updated_at_str.replace('Z', '+00:00')
                            updated_at = datetime.fromisoformat(updated_at_str_clean)
                            age_seconds = (datetime.now(timezone.utc) - updated_at).total_seconds()
                            if age_seconds > STALE_TIMEOUT_SECONDS:
                                logger.error(
                                    f"Sim {sim_id} stuck in cloud_execution for "
                                    f"{age_seconds/3600:.1f}h (>{STALE_TIMEOUT_HOURS}h) with "
                                    f"cloud status={status} ({label}) — marking as failed"
                                )
                                update_simulation(sim_id, {
                                    'status': 'failed',
                                    'errorMessage': f'Timeout: simulation stuck in cloud_execution for >{STALE_TIMEOUT_HOURS}h'
                                })
                                continue
                        except Exception as parse_err:
                            logger.warning(f"Sim {sim_id} could not parse updatedAt '{updated_at_str}': {parse_err}")

                if status == STATUS_COMPLETED:
                    logger.info(f"Sim {sim_id} completed on cloud — starting post-processing")
                    try:
                        success = process_completed_simulation(sim)
                        if success:
                            processed_count += 1
                            processed_in_cycle = True
                    finally:
                        logger.info(f"Forcing garbage collection...")
                        gc.collect()
                        logger.info(f"Memory cleanup completed after sim {sim_id}")
                    
                elif status == STATUS_STOPPED:
                    logger.error(f"Sim {sim_id} was STOPPED on CFD FEA Service (status {STATUS_STOPPED})")
                    update_simulation(sim_id, {
                        'status': 'failed',
                        'errorMessage': 'Cloud simulation was stopped (STOPPED)'
                    })
                elif status == STATUS_ERROR:
                    logger.error(f"Sim {sim_id} FAILED on CFD FEA Service (status {STATUS_ERROR})")
                    update_simulation(sim_id, {
                        'status': 'failed',
                        'errorMessage': f'CFD FEA Service simulation failed (status {STATUS_ERROR})'
                    })
                elif status == STATUS_RUNNING:
                    logger.info(f"Sim {sim_id} still running on CFD FEA Service")
                elif status == STATUS_QUEUED:
                    logger.info(f"Sim {sim_id} queued/preparing on CFD FEA Service (status {STATUS_QUEUED})")
                elif status == STATUS_PENDING:
                    logger.info(f"Sim {sim_id} pending on CFD FEA Service")
                elif status is None:
                    logger.warning(f"Sim {sim_id} — could not retrieve status (API key missing or request failed)")
            
            # Recovery: orphaned post_processing sims
            if processed_count == 0:
                post_sims = get_post_processing_sims()
                if post_sims:
                    logger.warning(f"RECOVERY MODE: Found {len(post_sims)} orphaned simulation(s) in 'post_processing' state")
                    sim = post_sims[0]
                    sim_id = sim['id']
                    task_id = sim.get('taskId')
                    logger.info(f"Attempting to recover orphaned sim {sim_id} (task: {task_id})")

                    # Verify cloud task is truly COMPLETED before attempting recovery
                    if task_id:
                        cloud_status = check_task_status(task_id)
                        cloud_label = STATUS_LABELS.get(cloud_status, 'UNKNOWN')
                        if cloud_status != STATUS_COMPLETED:
                            logger.warning(
                                f"RECOVERY MODE: sim {sim_id} cloud task {task_id} is {cloud_status} ({cloud_label}), "
                                f"not COMPLETED — skipping recovery to avoid incorrect processing"
                            )
                        else:
                            logger.info(f"RECOVERY MODE: sim {sim_id} cloud task is COMPLETED — proceeding")
                            try:
                                success = process_completed_simulation(sim)
                                if success:
                                    processed_in_cycle = True
                            finally:
                                logger.info(f"Forcing garbage collection after recovery...")
                                gc.collect()
                                logger.info(f"Memory cleanup completed after recovering sim {sim_id}")
                    else:
                        logger.warning(f"RECOVERY MODE: sim {sim_id} has no taskId — cannot verify cloud status, skipping")
            
            if not processed_in_cycle:
                logger.info(f"No simulations processed this cycle")
            
            logger.info(f"Sleeping for {POLLING_INTERVAL} seconds until next cycle...")
            time.sleep(POLLING_INTERVAL)
            
        except KeyboardInterrupt:
            logger.info("\n" + "=" * 80)
            logger.info("Worker Monitor stopped by user (KeyboardInterrupt)")
            logger.info("=" * 80)
            break
        except Exception as e:
            logger.error(f"CRITICAL ERROR in worker cycle #{cycle_count}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            logger.info(f"Attempting to continue... sleeping for {POLLING_INTERVAL} seconds")
            time.sleep(POLLING_INTERVAL)

if __name__ == "__main__":
    main()
