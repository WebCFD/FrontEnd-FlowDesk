import os
import sys
import time
import logging
import shutil
import requests
import inductiva
import subprocess
import gc

sys.path.append('.')

from src.components.tools.vtk_to_vtkjs import vtk_to_vtkjs

# Config
API_BASE = os.getenv('API_BASE_URL', 'http://localhost:5000')
API_KEY = 'flowerpower-external-api'
POLLING_INTERVAL = 30
INDUCTIVA_API_KEY = os.getenv('INDUCTIVA_API_KEY')

if INDUCTIVA_API_KEY:
    os.environ['INDUCTIVA_API_KEY'] = INDUCTIVA_API_KEY

# Configure structured logging with clear prefix
logging.basicConfig(
    level=logging.INFO,
    format='[WORKER_MONITOR] [%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
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
        
        # Retornar solo archivos VTK (PDF e imágenes ya no se generan)
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
    Procesa simulación completada en Inductiva.
    
    IMPORTANTE: Esta función DEBE ser llamada solo una vez por ciclo
    para prevenir acumulación de memoria y OOM kills.
    """
    sim_id = sim['id']
    task_id = sim.get('taskId')
    case_name = f"sim_{sim_id}"
    
    logger.info(f"=" * 60)
    logger.info(f"🔄 STARTING PROCESSING: Simulation #{sim_id}")
    logger.info(f"=" * 60)
    
    try:
        # Update: post_processing
        update_simulation(sim_id, {
            'status': 'post_processing',
            'progress': 90,
            'currentStep': 'Downloading results...'
        })
        
        # Download results
        logger.info(f"[Sim {sim_id}] Step 1/4: Downloading results from Inductiva...")
        if not download_results(task_id, case_name):
            raise Exception("Failed to download results")
        logger.info(f"[Sim {sim_id}] ✅ Results downloaded successfully")
        
        # Create results.foam file for PyVista compatibility
        logger.info(f"[Sim {sim_id}] Step 2/4: Creating results.foam marker...")
        sim_path = os.path.join(os.getcwd(), "cases", case_name, "sim")
        foam_file = os.path.join(sim_path, "results.foam")
        try:
            with open(foam_file, 'w') as f:
                f.write("// Marker file for OpenFOAM case\n")
            logger.info(f"[Sim {sim_id}] ✅ results.foam created")
        except Exception as e:
            logger.warning(f"[Sim {sim_id}] ⚠️ Failed to create results.foam: {e}")
        
        # STEP 5: Post-processing (isolated subprocess to prevent memory leaks)
        update_simulation(sim_id, {
            'progress': 95,
            'currentStep': 'Generating visualizations...'
        })
        
        logger.info(f"[Sim {sim_id}] Step 3/4: Running post-processing in isolated subprocess...")
        logger.info(f"[Sim {sim_id}] ⚡ This subprocess will handle PyVista/VTK memory separately")
        
        # Execute post-processing in a separate process to ensure memory cleanup
        # This prevents PyVista/VTK memory accumulation in the worker process
        try:
            result = subprocess.run(
                ["python3", "-u", "step05_results2post.py", case_name],
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout for post-processing
                check=True
            )
            
            # Log subprocess output for debugging
            if result.stdout:
                logger.info(f"[Sim {sim_id}] Post-processing output:\n{result.stdout}")
            if result.stderr:
                logger.warning(f"[Sim {sim_id}] Post-processing stderr:\n{result.stderr}")
            
            logger.info(f"[Sim {sim_id}] ✅ Post-processing subprocess completed successfully")
            
        except subprocess.TimeoutExpired as e:
            logger.error(f"[Sim {sim_id}] ❌ Post-processing timeout after 10 minutes")
            raise Exception(f"Post-processing timeout: {str(e)}")
        except subprocess.CalledProcessError as e:
            logger.error(f"[Sim {sim_id}] ❌ Post-processing failed with exit code {e.returncode}")
            logger.error(f"[Sim {sim_id}] Subprocess stdout: {e.stdout}")
            logger.error(f"[Sim {sim_id}] Subprocess stderr: {e.stderr}")
            raise Exception(f"Post-processing failed: {e.stderr}")
        
        # Copy to public folder
        logger.info(f"[Sim {sim_id}] Step 4/4: Copying VTK files to public folder...")
        result_paths = copy_results_to_public(case_name, sim_id)
        
        if not result_paths:
            raise Exception("Failed to copy results")
        
        logger.info(f"[Sim {sim_id}] ✅ VTK files copied successfully ({len(result_paths.get('vtk', []))} files)")
        
        # Upload VTK files to Cloudflare R2 (persistent external storage)
        logger.info(f"[Sim {sim_id}] Step 5/5: Uploading VTK files to Cloudflare R2...")
        is_production = os.getenv('NODE_ENV') == 'production'
        vtk_dir = f'/tmp/uploads/sim_{sim_id}/vtk' if is_production else f'public/uploads/sim_{sim_id}/vtk'
        
        try:
            upload_result = subprocess.run(
                ["python3", "upload_vtk_to_r2.py", str(sim_id), vtk_dir],
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout for upload
                check=True
            )
            
            if upload_result.stdout:
                logger.info(f"[Sim {sim_id}] R2 Upload output:\n{upload_result.stdout}")
            if upload_result.stderr:
                logger.warning(f"[Sim {sim_id}] R2 Upload stderr:\n{upload_result.stderr}")
            
            logger.info(f"[Sim {sim_id}] ✅ VTK files uploaded to Cloudflare R2 successfully")
            
        except subprocess.TimeoutExpired:
            logger.error(f"[Sim {sim_id}] ⚠️ R2 upload timeout (non-critical)")
        except subprocess.CalledProcessError as e:
            logger.error(f"[Sim {sim_id}] ⚠️ R2 upload failed: {e.stderr}")
        except Exception as e:
            logger.error(f"[Sim {sim_id}] ⚠️ R2 upload error: {e}")
        
        # Update: completed
        update_simulation(sim_id, {
            'status': 'completed',
            'progress': 100,
            'currentStep': 'Completed',
            'result': result_paths,
            'completedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        })
        
        logger.info(f"🎉 SIMULATION #{sim_id} COMPLETED SUCCESSFULLY")
        logger.info(f"=" * 60)
        return True
        
    except Exception as e:
        logger.error(f"❌ ERROR PROCESSING SIMULATION #{sim_id}: {e}")
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
                logger.info(f"[Sim {sim_id}] 🧹 Cleaning up temporary files in {temp_case_path}")
                # Keep only essential files, delete large temp files
                sim_dir = os.path.join(temp_case_path, "sim")
                if os.path.exists(sim_dir):
                    # Delete large OpenFOAM time directories but keep results.foam
                    for item in os.listdir(sim_dir):
                        item_path = os.path.join(sim_dir, item)
                        if os.path.isdir(item_path) and item.replace('.', '').isdigit():
                            shutil.rmtree(item_path)
                            logger.info(f"[Sim {sim_id}] Deleted time directory: {item}")
        except Exception as cleanup_error:
            logger.warning(f"[Sim {sim_id}] ⚠️ Cleanup warning (non-critical): {cleanup_error}")

def cleanup_old_uploads(keep_last_n=5):
    """
    Clean up old simulation uploads from /tmp/uploads to free disk space.
    Keeps only the last N simulations in production.
    
    Cloud Run has a 512 MB limit on /tmp storage, so we need to clean up
    old files regularly to prevent disk space errors.
    """
    try:
        is_production = os.getenv('NODE_ENV') == 'production'
        if not is_production:
            return  # Only cleanup in production
        
        uploads_dir = "/tmp/uploads"
        if not os.path.exists(uploads_dir):
            return
        
        # Get all sim_X directories
        sim_dirs = []
        for item in os.listdir(uploads_dir):
            item_path = os.path.join(uploads_dir, item)
            if os.path.isdir(item_path) and item.startswith('sim_'):
                try:
                    # Extract sim ID from directory name
                    sim_id = int(item.replace('sim_', ''))
                    sim_dirs.append((sim_id, item_path))
                except ValueError:
                    continue
        
        # Sort by sim ID (newest first)
        sim_dirs.sort(key=lambda x: x[0], reverse=True)
        
        # Delete all except the last N
        deleted_count = 0
        for sim_id, dir_path in sim_dirs[keep_last_n:]:
            try:
                shutil.rmtree(dir_path)
                logger.info(f"🧹 Deleted old upload: sim_{sim_id} (freeing disk space)")
                deleted_count += 1
            except Exception as e:
                logger.warning(f"⚠️ Failed to delete {dir_path}: {e}")
        
        if deleted_count > 0:
            logger.info(f"✅ Cleaned up {deleted_count} old simulation(s) from /tmp/uploads")
        
    except Exception as e:
        logger.warning(f"⚠️ Upload cleanup warning (non-critical): {e}")

def main():
    logger.info("=" * 80)
    logger.info("🚀 WORKER MONITOR STARTED - PRODUCTION MODE")
    logger.info("⚡ Memory Management: ENABLED (1 simulation per 30s cycle)")
    logger.info("🔒 OOM Protection: ACTIVE (subprocess isolation + garbage collection)")
    logger.info("=" * 80)
    
    cycle_count = 0
    
    while True:
        cycle_count += 1
        processed_in_cycle = False
        
        try:
            logger.info(f"\n{'='*80}")
            logger.info(f"🔄 POLLING CYCLE #{cycle_count}")
            logger.info(f"{'='*80}")
            
            # Clean up old uploads to prevent disk space issues (only every 10 cycles)
            if cycle_count % 10 == 1:
                cleanup_old_uploads(keep_last_n=5)
            
            # 1️⃣ Buscar sims en cloud_execution
            sims = get_cloud_execution_sims()
            logger.info(f"📊 Found {len(sims)} simulation(s) in 'cloud_execution' state")
            
            # Process only ONE simulation per cycle to prevent memory accumulation
            # CRITICAL: This limit prevents OOM kills by ensuring memory is freed between sims
            processed_count = 0
            
            for sim in sims:
                # SAFETY GATE: Stop after processing 1 simulation
                if processed_count >= 1:
                    remaining = len(sims) - processed_count
                    logger.info(f"⏸️  MEMORY PROTECTION: Deferring {remaining} remaining simulation(s) to next cycle")
                    logger.info(f"⏱️  Next cycle in {POLLING_INTERVAL} seconds")
                    break
                
                task_id = sim.get('taskId')
                if not task_id:
                    logger.warning(f"⚠️  Sim {sim.get('id')} has no taskId, skipping")
                    continue
                
                logger.info(f"🔍 Checking Inductiva status for sim {sim.get('id')} (task: {task_id})")
                status = check_task_status(task_id)
                logger.info(f"📋 Sim {sim.get('id')} status: {status}")
                
                if status == 'TaskStatusCode.SUCCESS':
                    # Process simulation in try-finally to GUARANTEE memory cleanup
                    try:
                        success = process_completed_simulation(sim)
                        if success:
                            processed_count += 1
                            processed_in_cycle = True
                    finally:
                        # CRITICAL: ALWAYS force garbage collection, even if processing failed
                        logger.info(f"🧹 Forcing garbage collection...")
                        gc.collect()
                        logger.info(f"✅ Memory cleanup completed after sim {sim.get('id')}")
                    
                elif status == 'TaskStatusCode.FAILED':
                    logger.error(f"❌ Sim {sim.get('id')} FAILED in Inductiva cloud")
                    update_simulation(sim['id'], {
                        'status': 'failed',
                        'errorMessage': 'Inductiva task failed'
                    })
            
            # 2️⃣ Buscar sims huérfanas en post_processing (recovery)
            # Only if we didn't process any cloud_execution sims (avoid double-processing)
            if processed_count == 0:
                post_sims = get_post_processing_sims()
                if post_sims:
                    logger.warning(f"🔧 RECOVERY MODE: Found {len(post_sims)} orphaned simulation(s) in 'post_processing' state")
                    # Recover only the first orphaned simulation
                    sim = post_sims[0]
                    logger.info(f"🔄 Attempting to recover orphaned sim {sim['id']}")
                    
                    try:
                        success = process_completed_simulation(sim)
                        if success:
                            processed_in_cycle = True
                    finally:
                        # CRITICAL: ALWAYS force garbage collection after recovery
                        logger.info(f"🧹 Forcing garbage collection after recovery...")
                        gc.collect()
                        logger.info(f"✅ Memory cleanup completed after recovering sim {sim['id']}")
            
            # Summary of cycle
            if not processed_in_cycle:
                logger.info(f"💤 No simulations processed this cycle")
            
            logger.info(f"⏳ Sleeping for {POLLING_INTERVAL} seconds until next cycle...")
            time.sleep(POLLING_INTERVAL)
            
        except KeyboardInterrupt:
            logger.info("\n" + "=" * 80)
            logger.info("🛑 Worker Monitor stopped by user (KeyboardInterrupt)")
            logger.info("=" * 80)
            break
        except Exception as e:
            logger.error(f"❌ CRITICAL ERROR in worker cycle #{cycle_count}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            logger.info(f"🔄 Attempting to continue... sleeping for {POLLING_INTERVAL} seconds")
            time.sleep(POLLING_INTERVAL)

if __name__ == "__main__":
    main()
