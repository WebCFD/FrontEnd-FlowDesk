import os
import logging

from src.components.post.objects import post_objects
from src.components.post.pdf import post_pdf
from src.components.post.residuals import analyse_residuals
from src.components.tools.performance import PerformanceMonitor

logger = logging.getLogger(__name__)


def run(case_name: str = "cases/cfd_case") -> None:
    """
    Process CFD simulation results with parallel processing and memory management.
    
    This function orchestrates the complete post-processing pipeline:
    1. Validates simulation results and sets up post-processing environment
    2. Analyzes convergence residuals and solution quality
    3. Generates visualization objects and plots
    4. Creates comprehensive PDF reports with results
    
    Args:
        case_name: Name of the simulation case
        
    Returns:
        None
    """
    performance_monitor = PerformanceMonitor()
    performance_monitor.start()
    
    logger.info("\n=========== RUNNING CFD POST-PROCESSING ===========")

    # Step 1: Set up post-processing environment and validate results
    sim_path = os.path.join(os.getcwd(), "cases", case_name, "sim")
    post_path = os.path.join(os.getcwd(), "cases", case_name, "post")
    logger.info(f"1 - Setting up post-processing environment: {post_path}")
    performance_monitor.update_memory()
    
    # Try both buoyantPimpleFoam and buoyantSimpleFoam log files
    logfile_path = os.path.join(sim_path, "log.buoyantPimpleFoam")
    if not os.path.isfile(logfile_path):
        logfile_path = os.path.join(sim_path, "log.buoyantSimpleFoam")
        if not os.path.isfile(logfile_path):
            logger.error(f"Simulation log file not found in {sim_path}")
            raise ValueError(f"There are no results for this simulation")

    # Step 2: Analyze convergence residuals
    logger.info("2 - Analyzing convergence residuals and solution quality")
    analyse_residuals(logfile_path, post_path)
    performance_monitor.update_memory()

    # Step 3: Generate visualization objects
    logger.info("3 - Generating post-processing visualization objects")
    internal_mesh = post_objects(sim_path, post_path)
    performance_monitor.update_memory()
    
    # Step 4: Create comprehensive PDF report
    logger.info("4 - Generating comprehensive PDF report")
    post_pdf(post_path, internal_mesh)
    performance_monitor.update_memory()
    
    # Log performance summary
    performance_summary = performance_monitor.get_summary()
    logger.info(f"Total processing time: {performance_summary['total_time']:.2f}s")
    logger.info(f"Peak memory usage: {performance_summary['peak_memory_mb']:.1f}MB")
    logger.info(f"✅ Post-processing completed successfully - results saved at {post_path}")


if __name__ == "__main__":
    result = run(case_name="FDM_iter2")