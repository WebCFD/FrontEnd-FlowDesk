#!/usr/bin/env python3
"""
Execute mesh generation on Inductiva cloud using cfMesh.

This script runs the mesh generation step in Inductiva using the cfMesh image,
which provides faster and more robust meshing for HVAC applications.

Pipeline integration:
    Step 1: JSON → Geometry (step01_json2geo.py)
    Step 2a: Geometry → Mesh Config (step02_geo2mesh.py) - prepares config files
    Step 2b: Run Mesh on Inductiva (THIS SCRIPT) - executes cartesianMesh
    Step 3: Mesh → CFD Setup (step03_mesh2cfd.py)
    Step 4: Execute CFD on Inductiva (step04_cfd2result.py)
"""

import os
import sys
import time
import logging
from typing import Optional

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


def run(case_name: str, machine_type: str = "c2d-standard-8", wait: bool = True) -> Optional[str]:
    """
    Execute cfMesh mesh generation on Inductiva cloud.
    
    Args:
        case_name: Name of the simulation case
        machine_type: Inductiva machine type (default: c2d-standard-8)
        wait: If True, wait for completion. If False, return task_id immediately
        
    Returns:
        task_id if wait=False, None if wait=True
        
    Raises:
        ImportError: If inductiva package is not installed
        FileNotFoundError: If simulation directory or required files not found
        Exception: If mesh generation fails
    """
    try:
        import inductiva
    except ImportError:
        logger.error("ERROR: inductiva package not installed")
        logger.error("Install it with: pip install inductiva")
        raise
    
    # Verify API key
    if not os.getenv('INDUCTIVA_API_KEY'):
        logger.error("ERROR: INDUCTIVA_API_KEY environment variable not set")
        raise EnvironmentError("INDUCTIVA_API_KEY not set")
    
    case_path = os.path.join(os.getcwd(), "cases", case_name)
    sim_path = os.path.join(case_path, "sim")
    
    if not os.path.exists(sim_path):
        logger.error(f"ERROR: Simulation directory not found: {sim_path}")
        logger.error("Make sure you've run step02_geo2mesh first to prepare mesh configuration")
        raise FileNotFoundError(f"Simulation directory not found: {sim_path}")
    
    # Verify required mesh configuration files exist
    required_files = [
        os.path.join(sim_path, "system", "meshDict"),
        os.path.join(sim_path, "constant", "triSurface")
    ]
    
    for req_file in required_files:
        if not os.path.exists(req_file):
            logger.error(f"ERROR: Required mesh config file/dir not found: {req_file}")
            logger.error("Run step02_geo2mesh first to generate mesh configuration")
            raise FileNotFoundError(f"Required file not found: {req_file}")
    
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
        "chmod +x Allmesh",
        "./Allmesh",  # Run the mesh generation script prepared by step02
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
    
    # Check if task failed
    if status == "failed":
        logger.error("\n❌ Mesh generation FAILED on Inductiva")
        logger.error("   Check Inductiva dashboard for logs")
        raise Exception(f"Mesh generation failed on Inductiva (task: {task_id})")
    
    # Download results
    logger.info("\n6. Downloading mesh generation results...")
    try:
        task.download_outputs(output_dir=case_path, rm_remote_files=True)
        logger.info("   ✓ Results downloaded successfully")
    except Exception as e:
        logger.error(f"   ✗ Download failed: {e}")
        raise
    
    # Verify mesh was generated
    logger.info("\n7. Verifying mesh generation...")
    mesh_points = os.path.join(sim_path, "constant", "polyMesh", "points")
    mesh_faces = os.path.join(sim_path, "constant", "polyMesh", "faces")
    mesh_boundary = os.path.join(sim_path, "constant", "polyMesh", "boundary")
    
    if os.path.exists(mesh_points) and os.path.exists(mesh_faces) and os.path.exists(mesh_boundary):
        points_size = os.path.getsize(mesh_points)
        faces_size = os.path.getsize(mesh_faces)
        logger.info(f"   ✓ Mesh generated successfully!")
        logger.info(f"     - points: {points_size:,} bytes")
        logger.info(f"     - faces: {faces_size:,} bytes")
    else:
        logger.error(f"\n❌ Mesh files not found!")
        logger.error(f"   Expected: {mesh_points}")
        raise FileNotFoundError(f"Mesh not generated: {mesh_points}")
    
    # Terminate machine
    logger.info("\n8. Terminating cloud machine...")
    try:
        cloud_machine.terminate()
        logger.info("   ✓ Machine group terminated")
    except Exception as e:
        logger.warning(f"   ⚠ Termination issue (may already be terminated): {e}")
    
    logger.info("\n" + "="*80)
    logger.info("✅ CFMESH MESH GENERATION COMPLETED SUCCESSFULLY")
    logger.info("="*80)
    logger.info(f"\nMesh location: {sim_path}/constant/polyMesh/")
    logger.info(f"\nNext step: Run CFD simulation with step04_cfd2result.py")
    
    return None


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Run cfMesh mesh generation on Inductiva cloud"
    )
    parser.add_argument(
        "case_name",
        help="Name of the simulation case"
    )
    parser.add_argument(
        "--machine",
        default="c2d-standard-8",
        help="Inductiva machine type (default: c2d-standard-8)"
    )
    parser.add_argument(
        "--no-wait",
        action="store_true",
        help="Don't wait for completion, return task ID immediately"
    )
    
    args = parser.parse_args()
    
    wait = not args.no_wait
    
    try:
        task_id = run(
            case_name=args.case_name,
            machine_type=args.machine,
            wait=wait
        )
        
        if task_id:
            logger.info(f"\nTask ID for monitoring: {task_id}")
        
        sys.exit(0)
    except Exception as e:
        logger.error(f"\n❌ FAILED: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)
