import os
import sys
import time
import logging
import shutil
import requests
import subprocess
import gc

sys.path.append('.')

from src.components.tools.vtk_to_vtkjs import vtk_to_vtkjs

# Config
API_BASE = os.getenv('API_BASE_URL', 'http://localhost:5000')
API_KEY = 'flowerpower-external-api'
POLLING_INTERVAL = 30

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
    logger.info("=" * 60)
    logger.info(f"Environment: {env_label}")
    logger.info(f"NODE_ENV: {os.getenv('NODE_ENV', 'not set')}")
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
    
    # Cloud solver status
    logger.info("Cloud Solver: NOT CONFIGURED (use SOLVER_TYPE=local for testing)")
    
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
            headers={'x-api-key': API_KEY}
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
            headers={'x-api-key': API_KEY}
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

def copy_results_to_public(case_name, sim_id):
    """
    Copia y convierte archivos VTK a carpeta pública para el visualizador web.
    
    NOTE: PDF and image generation removed to reduce memory usage.
    Only VTK files are generated and converted to vtkjs format.
    """
    try:
        post_path = os.path.join(os.getcwd(), "cases", case_name, "post")
        
        # Use production path if NODE_ENV=production, otherwise use public folder
        is_production = os.getenv('NODE_ENV') == 'production'
        if is_production:
            public_path = os.path.join("/tmp/uploads", f"sim_{sim_id}")
        else:
            public_path = os.path.join(os.getcwd(), "public", "uploads", f"sim_{sim_id}")
        
        os.makedirs(public_path, exist_ok=True)
        
        # Copiar y convertir VTK desde post/obj (slices y volumen completo)
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
                    
                    # Convertir VTK/VTU a vtkjs
                    try:
                        vtk_to_vtkjs(vtk_path, vtkjs_path)
                        vtk_count += 1
                        logger.info(f"Converted {vtk} to {vtkjs_name}")
                    except Exception as e:
                        logger.error(f"Failed to convert {vtk}: {e}")
            
            logger.info(f"Converted {vtk_count} VTK files for sim {sim_id}")
        else:
            logger.warning(f"No VTK files found in {obj_dir}")
        
        # Copiar y convertir VTK desde sim/VTK (archivos raw de OpenFOAM si existen)
        sim_path = os.path.join(os.getcwd(), "cases", case_name, "sim")
        sim_vtk_dir = os.path.join(sim_path, "VTK")
        
        if os.path.exists(sim_vtk_dir):
            os.makedirs(obj_dest, exist_ok=True)
            openfoam_count = 0
            
            # Buscar recursivamente archivos VTK de OpenFOAM
            for root, dirs, files in os.walk(sim_vtk_dir):
                for vtk_file in files:
                    if vtk_file.endswith('.vtk') or vtk_file.endswith('.vtu') or vtk_file.endswith('.vtp'):
                        vtk_path = os.path.join(root, vtk_file)
                        
                        # Generar nombre único basado en ruta relativa
                        rel_path = os.path.relpath(vtk_path, sim_vtk_dir)
                        safe_name = rel_path.replace(os.sep, '_').replace('.vtk', '').replace('.vtu', '').replace('.vtp', '')
                        vtkjs_name = f"openfoam_{safe_name}.vtkjs"
                        vtkjs_path = os.path.join(obj_dest, vtkjs_name)
                        
                        # Convertir a vtkjs
                        try:
                            vtk_to_vtkjs(vtk_path, vtkjs_path)
                            openfoam_count += 1
                            logger.info(f"Converted OpenFOAM {vtk_file} to {vtkjs_name}")
                        except Exception as e:
                            logger.error(f"Failed to convert OpenFOAM {vtk_file}: {e}")
            
            if openfoam_count > 0:
                logger.info(f"Converted {openfoam_count} OpenFOAM VTK files for sim {sim_id}")
        
        # Retornar solo archivos VTK
        vtk_list = []
        if os.path.exists(obj_dest):
            vtk_list = [f"/uploads/sim_{sim_id}/vtk/{vtk}" for vtk in os.listdir(obj_dest) if vtk.endswith('.vtkjs')]
        
        result_paths = {
            "vtk": vtk_list
        }
        
        logger.info(f"Total VTK files available: {len(vtk_list)}")
        return result_paths
        
    except Exception as e:
        logger.error(f"Failed to copy results: {e}")
        return None

def process_completed_simulation(sim):
    """
    Procesa simulación cuyo solver ya terminó (resultados en sim_path local).
    
    IMPORTANTE: Esta función DEBE ser llamada solo una vez por ciclo
    para prevenir acumulación de memoria y OOM kills.
    """
    sim_id = sim['id']
    case_name = f"sim_{sim_id}"
    
    logger.info(f"=" * 60)
    logger.info(f"STARTING PROCESSING: Simulation #{sim_id}")
    logger.info(f"=" * 60)
    
    try:
        # Update: post_processing
        update_simulation(sim_id, {
            'status': 'post_processing',
            'progress': 90,
            'currentStep': 'Post-processing results...'
        })
        
        # Verify sim directory exists (results must already be local)
        sim_path = os.path.join(os.getcwd(), "cases", case_name, "sim")
        if not os.path.exists(sim_path):
            raise FileNotFoundError(
                f"Simulation directory not found: {sim_path}. "
                f"Cloud solver download is not implemented — use SOLVER_TYPE=local."
            )
        logger.info(f"[Sim {sim_id}] Simulation directory found: {sim_path}")
        
        # Create results.foam file for PyVista compatibility
        logger.info(f"[Sim {sim_id}] Step 1/3: Creating results.foam marker...")
        foam_file = os.path.join(sim_path, "results.foam")
        try:
            with open(foam_file, 'w') as f:
                f.write("// Marker file for OpenFOAM case\n")
            logger.info(f"[Sim {sim_id}] results.foam created")
        except Exception as e:
            logger.warning(f"[Sim {sim_id}] Failed to create results.foam: {e}")
        
        # STEP 5: Post-processing (isolated subprocess to prevent memory leaks)
        update_simulation(sim_id, {
            'progress': 95,
            'currentStep': 'Generating visualizations...'
        })
        
        logger.info(f"[Sim {sim_id}] Step 2/3: Running post-processing in isolated subprocess...")
        
        try:
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'
            env['LC_ALL'] = 'C.UTF-8'
            env['LANG'] = 'C.UTF-8'
            
            result = subprocess.run(
                ["python3", "-u", "PYTHON_STEPS/step05_results2post.py", case_name],
                capture_output=True,
                text=True,
                timeout=600,
                check=True,
                env=env,
                encoding='utf-8'
            )
            
            if result.stdout:
                logger.info(f"[Sim {sim_id}] Post-processing output:\n{result.stdout}")
            if result.stderr:
                logger.warning(f"[Sim {sim_id}] Post-processing stderr:\n{result.stderr}")
            
            logger.info(f"[Sim {sim_id}] Post-processing subprocess completed successfully")
            
        except subprocess.TimeoutExpired as e:
            logger.error(f"[Sim {sim_id}] Post-processing timeout after 10 minutes")
            raise Exception(f"Post-processing timeout: {str(e)}")
        except subprocess.CalledProcessError as e:
            logger.error(f"[Sim {sim_id}] Post-processing failed with exit code {e.returncode}")
            logger.error(f"[Sim {sim_id}] Subprocess stdout: {e.stdout}")
            logger.error(f"[Sim {sim_id}] Subprocess stderr: {e.stderr}")
            
            if e.returncode == -9 or e.returncode == 137:
                error_msg = (
                    f"Out of Memory: Post-processing was killed by the system (SIGKILL). "
                    f"The simulation mesh may be too large for available memory. "
                    f"Try reducing mesh resolution or simplifying the geometry."
                )
                logger.error(f"[Sim {sim_id}] OOM DETECTED: Process killed with signal SIGKILL")
                raise Exception(error_msg)
            else:
                raise Exception(f"Post-processing failed: {e.stderr}")
        
        # Copy to public folder
        logger.info(f"[Sim {sim_id}] Step 3/3: Copying VTK files to public folder...")
        result_paths = copy_results_to_public(case_name, sim_id)
        
        if not result_paths:
            raise Exception("Failed to copy results")
        
        logger.info(f"[Sim {sim_id}] VTK files copied ({len(result_paths.get('vtk', []))} files)")
        
        # Upload VTK files to Cloudflare R2 (persistent external storage)
        is_production = os.getenv('NODE_ENV') == 'production'
        env_label = "PRODUCTION" if is_production else "DEVELOPMENT"
        vtk_dir = f'/tmp/uploads/sim_{sim_id}/vtk' if is_production else f'public/uploads/sim_{sim_id}/vtk'
        
        logger.info(f"[Sim {sim_id}] Uploading VTK files to Cloudflare R2...")
        logger.info(f"[Sim {sim_id}] Environment: {env_label}")
        logger.info(f"[Sim {sim_id}] Local VTK directory: {vtk_dir}")
        
        r2_configured = all([
            os.getenv('R2_ENDPOINT'),
            os.getenv('R2_ACCESS_KEY_ID'),
            os.getenv('R2_SECRET_ACCESS_KEY')
        ])
        
        if not r2_configured:
            logger.error(f"[Sim {sim_id}] R2 CREDENTIALS MISSING - Cannot upload to persistent storage")
            logger.error(f"[Sim {sim_id}] Required secrets: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")
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
                
                logger.info(f"[Sim {sim_id}] VTK files uploaded to Cloudflare R2 successfully")
                r2_upload_success = True
                
            except subprocess.TimeoutExpired:
                logger.error(f"[Sim {sim_id}] R2 UPLOAD TIMEOUT after 10 minutes")
            except subprocess.CalledProcessError as e:
                logger.error(f"[Sim {sim_id}] R2 UPLOAD FAILED with exit code {e.returncode}")
                if e.stdout:
                    logger.error(f"[Sim {sim_id}] stdout: {e.stdout}")
                if e.stderr:
                    logger.error(f"[Sim {sim_id}] stderr: {e.stderr}")
            except Exception as e:
                logger.error(f"[Sim {sim_id}] R2 UPLOAD ERROR: {type(e).__name__}: {e}")
        
        if not r2_upload_success:
            logger.warning(f"[Sim {sim_id}] VTK PERSISTENCE STATUS: NOT GUARANTEED")
            logger.warning(f"[Sim {sim_id}] Local files available at: {vtk_dir}")
            if is_production:
                logger.warning(f"[Sim {sim_id}] PRODUCTION WARNING: Files in /tmp are EPHEMERAL")
        else:
            logger.info(f"[Sim {sim_id}] VTK PERSISTENCE STATUS: GUARANTEED (R2)")
        
        # Update: completed
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
        logger.error(f"ERROR PROCESSING SIMULATION #{sim_id}: {e}")
        logger.error(f"=" * 60)
        update_simulation(sim_id, {
            'status': 'failed',
            'errorMessage': str(e)
        })
        return False
    finally:
        # CRITICAL: Clean up temporary files to free disk space
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
    """
    Clean up old simulation uploads from /tmp/uploads to free disk space.
    Keeps only the last N simulations in production.
    """
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
            
            # Clean up old uploads to prevent disk space issues (only every 10 cycles)
            if cycle_count % 10 == 1:
                cleanup_old_uploads(keep_last_n=5)
            
            # Check for cloud_execution sims — cloud solver not implemented yet
            sims = get_cloud_execution_sims()
            if sims:
                logger.warning(
                    f"Found {len(sims)} simulation(s) in 'cloud_execution' state "
                    f"but cloud solver is not configured. "
                    f"Use SOLVER_TYPE=local for pipeline testing."
                )
                for sim in sims:
                    logger.warning(f"  - Sim {sim.get('id')} (taskId: {sim.get('taskId', 'N/A')}) — skipped, no cloud solver")
            else:
                logger.info(f"Found 0 simulation(s) in 'cloud_execution' state")
            
            # Check for orphaned post_processing sims (recovery mode)
            post_sims = get_post_processing_sims()
            if post_sims:
                logger.warning(f"RECOVERY MODE: Found {len(post_sims)} orphaned simulation(s) in 'post_processing' state")
                sim = post_sims[0]
                logger.info(f"Attempting to recover orphaned sim {sim['id']}")
                
                try:
                    success = process_completed_simulation(sim)
                    if success:
                        processed_in_cycle = True
                finally:
                    logger.info(f"Forcing garbage collection after recovery...")
                    gc.collect()
                    logger.info(f"Memory cleanup completed after recovering sim {sim['id']}")
            
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
