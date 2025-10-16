import os
import time
import threading
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


def solve_inductiva(sim_path, machine_type):
    """
    Solve the CFD case on Inductiva cloud platform.
    
    Args:
        sim_path: Path to the simulation directory
        machine_type: Type of cloud machine to use
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

    # Initialize the Simulator
    logger.info("    * Initializing OpenFOAM simulator (ESI distribution v2406)")
    OpenFOAM = inductiva.simulators.OpenFOAM(distribution="esi",  version="2406")

    # Run simulation
    logger.info("    * Submitting CFD simulation task to cloud")
    task = OpenFOAM.run(input_dir=sim_path, shell_script="./Allrun", on=cloud_machine)

    # Progress feedback function
    def show_progress(start_time, stop_event):
        while not stop_event.is_set():
            elapsed = int(time.time() - start_time)
            if elapsed > 0 and elapsed % 30 == 0:
                logger.info(f"    * Still waiting... ({elapsed}s elapsed)")
            time.sleep(10)
    
    # Wait for the simulation to finish with progress feedback
    logger.info("    * Waiting for simulation to complete...")
    
    # Diagnostic logging
    initial_status = task.get_status()
    logger.info(f"    * [DEBUG] Initial task status before wait(): {initial_status}")
    logger.info(f"    * [DEBUG] Task ID: {task.id}")
    
    start_time = time.time()
    stop_event = threading.Event()
    progress_thread = threading.Thread(target=show_progress, args=(start_time, stop_event), daemon=True)
    progress_thread.start()
    
    task.wait()
    
    stop_event.set()
    progress_thread.join(timeout=1)
    
    elapsed = int(time.time() - start_time)
    logger.info(f"    * Task completed in {elapsed}s")
    
    final_status = task.get_status()
    logger.info(f"    * [DEBUG] Task status after wait(): {final_status}")
    
    logger.info("    * Simulation completed, terminating cloud machine")
    try:
        cloud_machine.terminate()
        logger.info("    * Machine group terminated")
    except Exception as e:
        logger.warning(f"    * Machine group termination skipped (already terminated): {e}")

    logger.info("    * Downloading simulation results")
    task.download_outputs(output_dir=sim_path, rm_remote_files=True)
    
    logger.info("    * Printing simulation summary")
    task.print_summary()
    logger.info("    * Inductiva cloud CFD simulation completed successfully")
