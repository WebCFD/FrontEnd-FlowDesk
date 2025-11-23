import os
import time
import inductiva

from src.components.tools.populate_template_file import replace_in_file
from src.components.tools.cpu_cores_partitions import best_cpu_partition

    
def create_decomposeParDict(template_path, sim_path, machine_type):
    input_path = os.path.join(template_path, "system", "decomposeParDict") 
    output_path = os.path.join(sim_path, "system", "decomposeParDict") 

    # TODO: When running using inductiva, this needs to be done with
    if(machine_type == "c2d-highcpu-16"):
        n_cpu = 16
    else:
        raise BaseException("This type of machine is unkwown.")
    n_cpu_available, (n_x, n_y, n_z) = best_cpu_partition(n_cpu)

    str_replace_dict = dict()
    str_replace_dict["$NUM_CPUS"] = str(n_cpu_available)
    str_replace_dict["$PARTITION_X"] = str(n_x)
    str_replace_dict["$PARTITION_Y"] = str(n_y)
    str_replace_dict["$PARTITION_Z"] = str(n_z)
    replace_in_file(input_path, output_path, str_replace_dict)


def solve_inductiva(sim_path, machine_type, wait=True):
    """
    Solve CFD case on Inductiva cloud.
    
    Args:
        sim_path: Path to simulation directory
        machine_type: Type of cloud machine
        wait: If True, waits for completion. If False, returns task_id immediately
    
    Returns:
        task_id if wait=False, None if wait=True
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"    * Starting Inductiva cloud CFD simulation in: {sim_path}")
    logger.info(f"    * Using machine type: {machine_type}")
    
    #  Set decomposeParDict for inductiva machine
    template_path = os.path.join(os.getcwd(), "data", "settings", "solve", "inductiva")
    logger.info(f"    * Setting up parallel decomposition from template: {template_path}")
    create_decomposeParDict(template_path, sim_path, machine_type)

    #  Allocate cloud machine on Google Cloud Platform
    logger.info("    * Allocating cloud machine on Google Cloud Platform")
    cloud_machine = inductiva.resources.MachineGroup(provider="GCP", machine_type="c2d-highcpu-16", spot=True)

    # Initialize custom cfMesh image
    logger.info("    * Initializing custom cfMesh image (OpenFOAM v2412)")
    cf_mesh = inductiva.simulators.CustomImage("inductiva/kutu:openfoam-cfmesh_v2412_dev")

    # DEBUG: Copy Allrun before upload to compare local vs Inductiva (set DEBUG_COPY_ALLRUN=1 to enable)
    if os.getenv('DEBUG_COPY_ALLRUN', '0') == '1':
        import shutil
        from datetime import datetime
        allrun_path = os.path.join(sim_path, "Allrun")
        if os.path.exists(allrun_path):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = os.path.join(sim_path, f"Allrun_LOCAL_{timestamp}")
            shutil.copy2(allrun_path, backup_path)
            logger.info(f"    * [DEBUG] Allrun copied to: {backup_path}")
            # Log first 20 lines
            with open(allrun_path, 'r') as f:
                lines = f.readlines()[:20]
                logger.info(f"    * [DEBUG] Allrun content (first 20 lines):")
                for i, line in enumerate(lines, 1):
                    logger.info(f"    *   {i}: {line.rstrip()}")

    # Run simulation with Allrun script
    # Note: Source OpenFOAM environment before running Allrun
    logger.info("    * Submitting CFD simulation task to cloud")
    task = cf_mesh.run(
        on=cloud_machine,
        input_dir=sim_path,
        commands=["bash -c 'source /opt/openfoam/openfoam2412/etc/bashrc && ./Allrun'"]
    )
    
    task_id = task.id
    
    if not wait:
        logger.info(f"    * Task submitted: {task_id}")
        return task_id

    # Wait for the simulation to finish using polling (wait() doesn't work in Replit)
    logger.info("    * Waiting for simulation to complete...")
    start_time = time.time()
    
    while True:
        status = task.get_status()
        elapsed = int(time.time() - start_time)
        
        if status in ["success", "failed", "terminated"]:
            logger.info(f"    * Task completed in {elapsed}s")
            break
        
        if elapsed % 30 == 0 and elapsed > 0:
            logger.info(f"    * Still waiting... ({elapsed}s, status: {status})")
        
        time.sleep(10)
    
    logger.info("    * Simulation completed, terminating cloud machine")
    try:
        cloud_machine.terminate()
        logger.info("    * Machine group terminated")
    except Exception as e:
        logger.warning(f"    * Machine group termination skipped (already terminated): {e}")

    logger.info("    * Downloading simulation results")
    
    try:
        task.download_outputs(output_dir=sim_path, rm_remote_files=True)
        logger.info("    * Download completed, checking for results.foam")
        
        # Verify that results.foam exists
        results_foam = os.path.join(sim_path, "results.foam")
        if os.path.exists(results_foam):
            file_size = os.path.getsize(results_foam)
            logger.info(f"    * ✅ results.foam found ({file_size} bytes)")
        else:
            logger.error(f"    * ❌ results.foam NOT FOUND at {results_foam}")
            logger.info(f"    * Available files in {sim_path}:")
            try:
                for root, dirs, files in os.walk(sim_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        rel_path = os.path.relpath(file_path, sim_path)
                        size = os.path.getsize(file_path)
                        logger.info(f"       - {rel_path} ({size} bytes)")
            except Exception as e:
                logger.warning(f"    * Could not list files: {e}")
            raise FileNotFoundError(f"results.foam not found in {sim_path}")
        
    except Exception as e:
        logger.error(f"    * ❌ Download failed: {e}")
        raise
    
    logger.info("    * Printing simulation summary")
    task.print_summary()
    logger.info("    * Inductiva cloud CFD simulation completed successfully")
