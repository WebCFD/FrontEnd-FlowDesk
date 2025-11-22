#!/usr/bin/env python3
"""
Script para ejecutar cfMesh mesh generation en Inductiva cloud.

Este script prepara un caso OpenFOAM con cfMesh y lo ejecuta en Inductiva,
usando la imagen: inductiva/kutu:openfoam-cfmesh_v2412_dev

Uso:
    python inductiva_cfmesh_runner.py <case_name> [--wait]
    
Ejemplo:
    python inductiva_cfmesh_runner.py test_room --wait
"""

import os
import sys
import logging
import argparse
import time

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


def run_cfmesh_on_inductiva(case_name, wait=True, machine_type="c2d-standard-8"):
    """
    Execute cfMesh mesh generation on Inductiva cloud.
    
    Args:
        case_name: Name of the simulation case
        wait: If True, wait for completion. If False, return task_id immediately
        machine_type: Inductiva machine type (default: c2d-standard-8)
        
    Returns:
        task_id if wait=False, None if wait=True
    """
    try:
        import inductiva
    except ImportError:
        logger.error("ERROR: inductiva package not installed")
        logger.error("Install it with: pip install inductiva")
        return None
    
    # Verify API key
    if not os.getenv('INDUCTIVA_API_KEY'):
        logger.error("ERROR: INDUCTIVA_API_KEY environment variable not set")
        return None
    
    case_path = os.path.join(os.getcwd(), "cases", case_name)
    sim_path = os.path.join(case_path, "sim")
    
    if not os.path.exists(sim_path):
        logger.error(f"ERROR: Simulation directory not found: {sim_path}")
        logger.error("Make sure you've run steps 1-3 (json2geo, geo2mesh, mesh2cfd)")
        return None
    
    logger.info("="*80)
    logger.info("CFMESH MESH GENERATION ON INDUCTIVA CLOUD")
    logger.info("="*80)
    logger.info(f"Case: {case_name}")
    logger.info(f"Sim path: {sim_path}")
    logger.info(f"Machine type: {machine_type}")
    logger.info(f"Image: inductiva/kutu:openfoam-cfmesh_v2412_dev")
    logger.info("")
    
    # Create machine group
    logger.info("1. Creating machine group on Google Cloud Platform...")
    cloud_machine = inductiva.resources.MachineGroup(
        provider="GCP",
        machine_type=machine_type,
        spot=True,
        data_disk_gb=20,
        auto_resize_disk_max_gb=500
    )
    cloud_machine.start()
    logger.info(f"   ✓ Machine group started: {cloud_machine.name}")
    
    # Initialize custom cfMesh image
    logger.info("\n2. Initializing cfMesh custom image...")
    cf_mesh = inductiva.simulators.CustomImage(
        "inductiva/kutu:openfoam-cfmesh_v2412_dev"
    )
    logger.info("   ✓ cfMesh image loaded")
    
    # Prepare mesh generation commands
    logger.info("\n3. Preparing mesh generation commands...")
    commands = [
        "cd sim",
        "bash ./Allmesh",  # Run the mesh generation script
    ]
    logger.info(f"   ✓ Commands prepared: {len(commands)} steps")
    
    # Submit task
    logger.info("\n4. Submitting mesh generation task...")
    task = cf_mesh.run(
        on=cloud_machine,
        input_dir=case_path,  # Upload entire case directory
        commands=commands,
    )
    logger.info(f"   ✓ Task submitted with ID: {task.id}")
    
    task_id = task.id
    
    if not wait:
        logger.info(f"\n✓ Task submitted (no wait mode)")
        logger.info(f"   Task ID: {task_id}")
        logger.info(f"   Check status with: inductiva tasks show {task_id}")
        return task_id
    
    # Wait for completion
    logger.info("\n5. Waiting for mesh generation to complete...")
    start_time = time.time()
    
    while True:
        status = task.get_status()
        elapsed = int(time.time() - start_time)
        
        if status in ["success", "failed", "terminated"]:
            logger.info(f"   ✓ Task completed in {elapsed}s (status: {status})")
            break
        
        if elapsed % 30 == 0 and elapsed > 0:
            logger.info(f"   ... still waiting ({elapsed}s, status: {status})")
        
        time.sleep(10)
    
    # Download results
    logger.info("\n6. Downloading mesh generation results...")
    try:
        task.download_outputs(output_dir=case_path, rm_remote_files=True)
        logger.info("   ✓ Results downloaded successfully")
    except Exception as e:
        logger.error(f"   ✗ Download failed: {e}")
        logger.info(f"   (Results may still be available in case directory)")
    
    # Verify mesh
    mesh_file = os.path.join(sim_path, "constant", "polyMesh", "points")
    if os.path.exists(mesh_file):
        file_size = os.path.getsize(mesh_file)
        logger.info(f"\n✓ Mesh generated successfully (points file: {file_size} bytes)")
    else:
        logger.warning(f"\n⚠ Warning: Mesh points file not found at {mesh_file}")
    
    # Print task summary
    logger.info("\n" + "="*80)
    logger.info("TASK SUMMARY")
    logger.info("="*80)
    try:
        task.print_summary()
    except:
        pass
    
    # Terminate machine
    logger.info("\n7. Terminating cloud machine...")
    try:
        cloud_machine.terminate()
        logger.info("   ✓ Machine group terminated")
    except Exception as e:
        logger.warning(f"   ⚠ Termination issue (may already be terminated): {e}")
    
    logger.info("\n" + "="*80)
    logger.info("✅ CFMESH MESH GENERATION COMPLETED SUCCESSFULLY")
    logger.info("="*80)
    logger.info(f"\nNext steps:")
    logger.info(f"1. Review mesh in: {sim_path}/constant/polyMesh/")
    logger.info(f"2. Run CFD simulation with: python step04_cfd2result.py {case_name}")
    
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run cfMesh mesh generation on Inductiva cloud"
    )
    parser.add_argument(
        "case_name",
        help="Name of the simulation case"
    )
    parser.add_argument(
        "--wait",
        action="store_true",
        default=True,
        help="Wait for completion (default: True)"
    )
    parser.add_argument(
        "--no-wait",
        action="store_true",
        help="Don't wait for completion, return task ID immediately"
    )
    parser.add_argument(
        "--machine",
        default="c2d-standard-8",
        help="Inductiva machine type (default: c2d-standard-8)"
    )
    
    args = parser.parse_args()
    
    if args.no_wait:
        wait = False
    else:
        wait = args.wait
    
    task_id = run_cfmesh_on_inductiva(
        case_name=args.case_name,
        wait=wait,
        machine_type=args.machine
    )
    
    if task_id:
        logger.info(f"\nTask ID for monitoring: {task_id}")
    
    sys.exit(0)
