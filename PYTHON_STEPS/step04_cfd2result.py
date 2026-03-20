import os
import sys
import logging
from pathlib import Path
from typing import Optional

# Ensure project root and PYTHON_STEPS are in sys.path
_PROJECT_ROOT = str(Path(__file__).parent.parent)
_PYTHON_STEPS = str(Path(__file__).parent)
for _p in [_PROJECT_ROOT, _PYTHON_STEPS]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from src.components.solve.local import solve_local
from src.components.solve.cfdfeaservice import upload_case, submit_simulation
from src.components.tools.performance import PerformanceMonitor

logger = logging.getLogger(__name__)


def run(case_name: str = "cases/cfd_case", type: str = "local", wait: bool = True, n_cpu: int = 2) -> Optional[str]:
    """
    Execute CFD simulation with parallel processing and memory management.

    Args:
        case_name: Name of the simulation case
        type: Execution platform — "local" or "cfdfeaservice"
        wait: If True (default), block until simulation finishes.
              If False, submit asynchronously and return the cloud task_id.
              Only relevant for cloud platforms (ignored for "local").
        n_cpu: Number of vCPUs to request on the cloud (cfdfeaservice only).
               Must match numberOfSubdomains written in decomposeParDict by step03.
               Passed explicitly from worker_submit.py (N_CPU constant).

    Returns:
        task_id (str) when type="cfdfeaservice" and wait=False.
        None in all other cases.
    """
    performance_monitor = PerformanceMonitor()
    performance_monitor.start()

    logger.info("\n=========== RUNNING CFD SIMULATION ===========")

    case_path = os.path.join(os.getcwd(), "cases", case_name)
    sim_path = os.path.join(case_path, "sim")
    logger.info(f"1 - Setting up simulation environment: {sim_path}")
    performance_monitor.update_memory()

    logger.info(f"2 - Executing CFD simulation on platform: {type} (wait={wait})")
    performance_monitor.update_memory()

    if type == "local":
        logger.info(f"Running CFD simulation locally in {sim_path}")
        solve_local(sim_path)
        performance_monitor.update_memory()
        performance_summary = performance_monitor.get_summary()
        logger.info(f"Total processing time: {performance_summary['total_time']:.2f}s")
        logger.info(f"Peak memory usage: {performance_summary['peak_memory_mb']:.1f}MB")
        logger.info("CFD simulation completed successfully")
        return None

    elif type == "cfdfeaservice":
        api_key = os.getenv('CFDFEASERVICE_API_KEY')
        if not api_key:
            raise EnvironmentError(
                "CFDFEASERVICE_API_KEY environment variable is not set. "
                "Add it in Secrets before using cloud execution."
            )

        logger.info("Running CFD simulation on CFD FEA Service cloud platform")

        # Upload case to cloud storage
        logger.info(f"    * Uploading case to CFD FEA Service storage...")
        folder = upload_case(sim_path, api_key)

        # Submit simulation
        logger.info(f"    * Submitting simulation job...")
        task_id = submit_simulation(folder, api_key, n_cpu=n_cpu)

        performance_monitor.update_memory()
        performance_summary = performance_monitor.get_summary()
        logger.info(f"Upload + submit time: {performance_summary['total_time']:.2f}s")

        if not wait:
            logger.info(f"    * Task submitted asynchronously — task_id: {task_id}")
            return str(task_id)

        # Synchronous wait (not used in normal pipeline — worker_monitor handles polling)
        import time
        from src.components.solve.cfdfeaservice import check_status, download_results
        from src.components.solve.cfdfeaservice import STATUS_COMPLETED, STATUS_ERROR

        logger.info(f"    * Waiting for simulation to complete (task_id: {task_id})...")
        start = time.time()
        while True:
            status = check_status(task_id, api_key)
            elapsed = int(time.time() - start)
            if status == STATUS_COMPLETED:
                logger.info(f"    * Simulation completed in {elapsed}s")
                break
            elif status == STATUS_ERROR:
                raise RuntimeError(f"CFD FEA Service simulation failed (status {STATUS_ERROR})")
            if elapsed % 60 == 0 and elapsed > 0:
                logger.info(f"    * Still waiting... ({elapsed}s, status: {status})")
            time.sleep(15)

        logger.info(f"    * Downloading results...")
        if not download_results(task_id, sim_path, api_key):
            raise RuntimeError("Failed to download results from CFD FEA Service")

        logger.info("CFD FEA Service simulation completed successfully")
        return None

    else:
        logger.error(f"Unknown solve location: {type}")
        raise ValueError(f"Unknown solve location: {type}")


if __name__ == "__main__":
    run(case_name="FDM_iter2", type="local")
