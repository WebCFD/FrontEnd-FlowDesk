import os
import sys
import shutil
import logging
import subprocess
import traceback
from pathlib import Path

# Add project root to path for src imports
project_root = str(Path(__file__).parent.parent)
sys.path.insert(0, project_root)

from src.components.post.objects import (
    analyze_comfort_planes, generate_html_report,
    analyze_flow_planes, generate_flow_html_report,
    generate_surface_3d_vtk, generate_volume_internal_vtk,
)
from src.components.post.ventilation import analyze_ventilation_planes, generate_ventilation_html_report
from src.components.post.setup_summary import analyze_setup_summary, generate_setup_html_report
from src.components.post.datacenter import run_data_centers
from src.components.tools.performance import PerformanceMonitor
from src.components.tools.export_debug import load_foam_results


logger = logging.getLogger(__name__)

# Supported simulation types
SIMULATION_TYPES = ["IndoorSpaces", "DataCenters", "FireAndSmoke", "IndustrialCooling"]


def _resolve_paths(case_name: str):
    """
    Resolve sim_path and post_path for a given case_name.
    Tries PYTHON_STEPS/cases first, then cases/ at project root.
    
    Returns:
        tuple: (sim_path, post_path)
    """
    sim_path_python_steps = os.path.join(os.getcwd(), "PYTHON_STEPS", "cases", case_name, "sim")
    sim_path_root = os.path.join(os.getcwd(), "cases", case_name, "sim")

    if os.path.isdir(sim_path_python_steps):
        return sim_path_python_steps, os.path.join(os.getcwd(), "PYTHON_STEPS", "cases", case_name, "post")
    elif os.path.isdir(sim_path_root):
        return sim_path_root, os.path.join(os.getcwd(), "cases", case_name, "post")
    else:
        raise FileNotFoundError(f"Case not found in PYTHON_STEPS/cases/{case_name} or cases/{case_name}")


def _copy_index_html(post_path: str, simulation_type: str) -> None:
    """
    Copy the static index.html template to the post output directory.
    
    Args:
        post_path: Destination post directory
        simulation_type: Simulation type string (used to select the right template)
    """
    # Template map: simulation type → template filename
    template_map = {
        "IndoorSpaces": "index_indoor_spaces.html",
        "DataCenters":  "index_data_centers.html",
    }
    template_name = template_map.get(simulation_type, "index_indoor_spaces.html")
    templates_dir = os.path.join(project_root, "src", "components", "post", "templates")
    src_template = os.path.join(templates_dir, template_name)

    if not os.path.isfile(src_template):
        logger.warning(f"Index template not found: {src_template} — skipping index.html copy")
        return

    dst_index = os.path.join(post_path, "index.html")
    shutil.copy2(src_template, dst_index)
    logger.info(f"   ✓ Copied index.html to: {dst_index}")


def run_indoor_spaces(case_name: str, sim_path: str, post_path: str) -> None:
    """
    Run Indoor Spaces post-processing:
    PMV/PPD comfort + flow (T,U) + ventilation (CO2, ACH) + setup summary.
    
    Args:
        case_name: Name of the simulation case
        sim_path: Resolved path to simulation directory
        post_path: Resolved path to post-processing output directory
    """
    performance_monitor = PerformanceMonitor()
    performance_monitor.start()

    logger.info("\n=========== RUNNING THERMAL COMFORT POST-PROCESSING ===========")
    logger.info(f"Simulation path: {sim_path}")
    logger.info(f"Post-processing output: {post_path}")

    # Calculate PMV/PPD fields locally from downloaded OpenFOAM results
    logger.info("\n1 - Calculating PMV/PPD comfort fields")
    comfort_script = os.path.join(project_root, 'src', 'components', 'post', 'calculate_comfort.py')
    logger.info(f"   Running: python3 {comfort_script} {sim_path}")

    try:
        result = subprocess.run(
            ['python3', comfort_script, sim_path],
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("PMV/PPD calculation timed out after 120s — calculate_comfort.py hung")

    if result.stdout:
        for line in result.stdout.strip().split('\n'):
            logger.info(f"   {line}")

    if result.stderr:
        for line in result.stderr.strip().split('\n'):
            logger.warning(f"   [stderr] {line}")

    if result.returncode != 0:
        logger.error(f"   calculate_comfort.py failed with exit code {result.returncode}")
        raise RuntimeError(f"PMV/PPD calculation failed (exit {result.returncode}): {result.stderr}")

    logger.info("   ✓ PMV/PPD fields calculated successfully")

    # Load CFD mesh ONCE and share it across all analysis functions
    logger.info("\n1b - Loading CFD mesh (shared across all analysis steps)")
    performance_monitor.update_memory()
    internal_mesh, surfaces_mesh, multiblock = load_foam_results(sim_path)
    logger.info(f"   Loaded mesh: {internal_mesh.n_cells:,} cells")
    performance_monitor.update_memory()

    # Analyze comfort in horizontal planes
    logger.info("\n2 - Analyzing PMV/PPD thermal comfort in horizontal planes")
    performance_monitor.update_memory()
    
    results = analyze_comfort_planes(sim_path, post_path, internal_mesh=internal_mesh)
    performance_monitor.update_memory()
    
    # Generate HTML comfort report
    logger.info("\n3 - Generating HTML comfort report")
    html_path = generate_html_report(results, post_path, case_name=case_name)
    logger.info(f"HTML report: {html_path}")
    
    # Analyze flow fields (T, U) in horizontal planes
    logger.info("\n4 - Analyzing T/U flow fields in horizontal planes")
    performance_monitor.update_memory()
    
    flow_results = analyze_flow_planes(
        sim_path, post_path,
        internal_mesh=internal_mesh,
        surfaces_mesh=surfaces_mesh,
        multiblock=multiblock,
    )
    performance_monitor.update_memory()
    
    # Generate HTML flow report
    logger.info("\n5 - Generating HTML flow report")
    flow_html_path = generate_flow_html_report(flow_results, post_path, case_name=case_name)
    logger.info(f"Flow report: {flow_html_path}")
    
    # Analyze ventilation (CO2, ADPI, stagnation zones)
    logger.info("\n6 - Analyzing ventilation metrics in horizontal planes")
    performance_monitor.update_memory()
    
    ventilation_results = analyze_ventilation_planes(sim_path, post_path)
    performance_monitor.update_memory()
    
    # Generate HTML ventilation report
    logger.info("\n7 - Generating HTML ventilation report")
    ventilation_html_path = generate_ventilation_html_report(ventilation_results, post_path, case_name=case_name)
    logger.info(f"Ventilation report: {ventilation_html_path}")
    
    # Analyze setup summary (boundary conditions)
    logger.info("\n8 - Analyzing simulation setup (boundary conditions)")
    performance_monitor.update_memory()
    
    setup_summary = analyze_setup_summary(sim_path, post_path)
    performance_monitor.update_memory()
    
    # Generate HTML setup report
    logger.info("\n9 - Generating HTML setup report")
    setup_html_path = generate_setup_html_report(setup_summary, post_path, case_name=case_name)
    logger.info(f"Setup report: {setup_html_path}")
    
    # Generate 3D boundary surface VTK for web viewer (required output)
    logger.info("\n10 - Generating 3D boundary surface VTK (walls, floor, ceiling, door, window)")
    performance_monitor.update_memory()
    try:
        surface_3d_path = generate_surface_3d_vtk(sim_path, post_path)
        logger.info(f"3D surface VTK: {surface_3d_path}")
    except Exception as _e:
        logger.error(f"10 - FAILED: generate_surface_3d_vtk raised {type(_e).__name__}: {_e}")
        logger.error(traceback.format_exc())
        raise RuntimeError(
            f"3D surface VTK generation failed [{type(_e).__name__}]: {_e}"
        ) from _e

    # Generate 3D internal volume VTK for web viewer (required output)
    logger.info("\n11 - Generating 3D internal volume VTK (UnstructuredGrid internal air volume)")
    performance_monitor.update_memory()
    try:
        volume_internal_path = generate_volume_internal_vtk(sim_path, post_path)
        logger.info(f"3D volume VTK: {volume_internal_path}")
    except Exception as _e:
        logger.error(f"11 - FAILED: generate_volume_internal_vtk raised {type(_e).__name__}: {_e}")
        logger.error(traceback.format_exc())
        raise RuntimeError(
            f"3D volume VTK generation failed [{type(_e).__name__}]: {_e}"
        ) from _e

    # Summary
    logger.info("\n=========== COMFORT ANALYSIS SUMMARY ===========")
    for plane_name, metrics in results.items():
        logger.info(f"\n{plane_name.upper()} (z={metrics['height_m']}m):")
        logger.info(f"  Comfort area: {metrics['comfort_area_pct']:.1f}%")
        logger.info(f"  PMV: {metrics['pmv_mean']:.2f} ± {metrics['pmv_std']:.2f} (range: [{metrics['pmv_min']:.2f}, {metrics['pmv_max']:.2f}])")
        logger.info(f"  PPD: {metrics['ppd_mean']:.1f}% (max: {metrics['ppd_max']:.1f}%)")
    
    # Log performance summary
    performance_summary = performance_monitor.get_summary()
    logger.info(f"\nTotal processing time: {performance_summary['total_time']:.2f}s")
    logger.info(f"Peak memory usage: {performance_summary['peak_memory_mb']:.1f}MB")
    logger.info(f"\n✅ Post-processing completed successfully")
    logger.info(f"Results saved at: {post_path}")


def run(case_name: str = "cases/cfd_case", simulation_type: str = "IndoorSpaces") -> None:
    """
    Post-process CFD simulation results.

    Dispatches to the appropriate post-processing pipeline based on simulation_type:
      - IndoorSpaces    : PMV/PPD comfort + flow + ventilation + setup
      - DataCenters     : (not yet implemented)
      - FireAndSmoke    : (not yet implemented)
      - IndustrialCooling: (not yet implemented)

    Args:
        case_name: Name of the simulation case (folder inside cases/)
        simulation_type: One of SIMULATION_TYPES
    """
    if simulation_type not in SIMULATION_TYPES:
        raise ValueError(
            f"Unknown simulationType '{simulation_type}'. "
            f"Supported types: {SIMULATION_TYPES}"
        )

    logger.info(f"\n=========== POST-PROCESSING DISPATCH ===========")
    logger.info(f"Case:            {case_name}")
    logger.info(f"Simulation type: {simulation_type}")

    # Resolve paths (shared by all simulation types)
    sim_path, post_path = _resolve_paths(case_name)
    logger.info(f"Simulation path: {sim_path}")
    logger.info(f"Post-processing output: {post_path}")
    os.makedirs(post_path, exist_ok=True)

    # Dispatch to the correct post-processing pipeline
    if simulation_type == "IndoorSpaces":
        run_indoor_spaces(case_name, sim_path, post_path)
    elif simulation_type == "DataCenters":
        run_data_centers(case_name, sim_path, post_path)
    elif simulation_type == "FireAndSmoke":
        raise NotImplementedError(
            "FireAndSmoke post-processing is not yet implemented."
        )
    elif simulation_type == "IndustrialCooling":
        raise NotImplementedError(
            "IndustrialCooling post-processing is not yet implemented."
        )

    # Copy index.html template to post directory (all types that have one)
    _copy_index_html(post_path, simulation_type)

    logger.info(f"\n✅ Post-processing completed — results at: {post_path}")


if __name__ == "__main__":
    import sys

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(levelname)s - %(message)s',
        handlers=[logging.StreamHandler(sys.stderr)]
    )

    # Accept case_name and optional simulation_type as command-line arguments
    if len(sys.argv) > 1:
        case_name = sys.argv[1]
    else:
        case_name = "FDM_iter2"

    sim_type = sys.argv[2] if len(sys.argv) > 2 else "IndoorSpaces"

    logger.info(f"Starting post-processing for case: {case_name} [{sim_type}]")

    try:
        run(case_name=case_name, simulation_type=sim_type)
        logger.info("✅ Post-processing completed successfully")
        sys.exit(0)
    except Exception as e:
        logger.error(f"❌ Post-processing failed: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)
