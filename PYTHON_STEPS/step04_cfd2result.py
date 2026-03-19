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
from src.components.solve.inductiva import solve_inductiva
from src.components.tools.performance import PerformanceMonitor

logger = logging.getLogger(__name__)


def run(case_name: str = "cases/cfd_case", type: str = "local", wait: bool = True) -> Optional[str]:
    """
    Execute CFD simulation with parallel processing and memory management.

    Args:
        case_name: Name of the simulation case
        type: Execution platform — "local" or "inductiva"
        wait: If True (default), block until simulation finishes.
              If False, submit asynchronously and return the cloud task_id.
              Only relevant for cloud platforms (ignored for "local").

    Returns:
        task_id (str) when type="inductiva" and wait=False.
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

    if type == "inductiva":
        logger.info("Running CFD simulation on INDUCTIVA cloud platform")
        task_id = solve_inductiva(sim_path, machine_type="c2d-highcpu-16", wait=wait)
        performance_monitor.update_memory()
        performance_summary = performance_monitor.get_summary()
        logger.info(f"Total processing time so far: {performance_summary['total_time']:.2f}s")
        if not wait:
            logger.info(f"Task submitted asynchronously — task_id: {task_id}")
            return str(task_id) if task_id else None
        logger.info("Inductiva simulation completed (synchronous)")
        return None

    elif type == "local":
        logger.info(f"Running CFD simulation locally in {sim_path}")
        solve_local(sim_path)
        performance_monitor.update_memory()
        performance_summary = performance_monitor.get_summary()
        logger.info(f"Total processing time: {performance_summary['total_time']:.2f}s")
        logger.info(f"Peak memory usage: {performance_summary['peak_memory_mb']:.1f}MB")
        logger.info("CFD simulation completed successfully")
        return None

    else:
        logger.error(f"Unknown solve location: {type}")
        raise ValueError(f"Unknown solve location: {type}")


if __name__ == "__main__":
    run(case_name="FDM_iter2", type="local")
