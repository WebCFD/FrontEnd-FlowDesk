#!/usr/bin/env python3
"""
Test script for complete CFD pipeline with Inductiva cloud execution
Tests: JSON → Geometry → Mesh config → CFD setup → Inductiva execution
"""

import os
import sys
import json
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(message)s'
)

logger = logging.getLogger(__name__)

# Add current directory to path
sys.path.append('.')

# Import pipeline steps
from step01_json2geo import run as json2geo
from step02_geo2mesh import run as geo2mesh
from step03_mesh2cfd import run as mesh2cfd
from mesher_config import get_default_mesher
from step04_cfd2result import run as cfd2result
from step05_results2post import run as results2post

def test_pipeline_inductiva():
    """
    Test complete pipeline with Inductiva cloud execution.
    
    Pipeline flow (4 steps):
    1. JSON → Geometry (local)
    2. Geometry → Mesh Config (local, cfMesh configuration)
    3. Mesh Config → CFD Setup (local)
    4. Upload to Inductiva → Run Allmesh (mesh) + Allrun (CFD) → Download results
    
    Note: Mesh generation happens ON Inductiva, not locally.
    """
    
    logger.info("="*60)
    logger.info("TESTING CFD PIPELINE WITH INDUCTIVA")
    logger.info("="*60)
    
    # Verify Inductiva API key
    inductiva_key = os.getenv('INDUCTIVA_API_KEY')
    if not inductiva_key:
        logger.error("ERROR: INDUCTIVA_API_KEY not set in environment")
        return False
    
    logger.info(f"✓ Inductiva API key configured: {inductiva_key[:10]}...")
    
    # Load test JSON
    input_json_path = os.path.join(os.getcwd(), "input", "test_simple.json")
    logger.info(f"Loading test JSON from: {input_json_path}")
    
    if not os.path.exists(input_json_path):
        logger.error(f"Test JSON not found: {input_json_path}")
        return False
    
    with open(input_json_path, 'r') as f:
        json_payload = json.load(f)
    
    case_name = "test_simple_room"
    
    try:
        # STEP 1: JSON → Geometry
        logger.info("\n" + "="*60)
        logger.info("STEP 1: Converting JSON to 3D Geometry")
        logger.info("="*60)
        final_geometry_mesh, boundary_conditions_df = json2geo(json_payload, case_name)
        logger.info(f"✓ Geometry created: {final_geometry_mesh.n_cells} cells, {final_geometry_mesh.n_points} points")
        logger.info(f"✓ Boundary conditions: {len(boundary_conditions_df)} patches")
        
        # STEP 2: Geometry → Mesh Configuration
        mesher_type = get_default_mesher()
        logger.info("\n" + "="*60)
        logger.info(f"STEP 2: Preparing Mesh Configuration ({mesher_type})")
        logger.info("="*60)
        mesh_script = geo2mesh(case_name, final_geometry_mesh, boundary_conditions_df, type=mesher_type)
        logger.info(f"✓ Mesh configuration created")
        logger.info(f"✓ Generated {len(mesh_script)} mesh script commands")
        
        # STEP 3: Setup CFD Case
        logger.info("\n" + "="*60)
        logger.info("STEP 3: Setting up CFD Case")
        logger.info("="*60)
        mesh2cfd(case_name, type="hvac", mesh_script=mesh_script)
        logger.info(f"✓ CFD case configured")
        
        # Confirm before running on Inductiva
        logger.info("\n" + "="*60)
        logger.info("READY TO EXECUTE MESH + CFD ON INDUCTIVA CLOUD")
        logger.info("="*60)
        logger.info("\nSimulation details:")
        logger.info(f"  - Case: {case_name}")
        logger.info(f"  - Machine type: c2d-highcpu-16 (GCP spot instance)")
        logger.info(f"  - Mesher: {mesher_type} (cartesianMesh)")
        logger.info(f"  - Solver: buoyantSimpleFoam")
        logger.info(f"  - Iterations: 5 (test mode)")
        logger.info(f"  - Estimated time: 5-10 minutes")
        logger.info(f"  - Estimated cost: $0.10-0.20")
        logger.info(f"\nNote: Mesh generation AND CFD solve will run in single Inductiva session")
        
        # Ask for confirmation (auto-confirm if --yes flag)
        import sys
        auto_confirm = '--yes' in sys.argv or '-y' in sys.argv
        
        if auto_confirm:
            response = 'yes'
            logger.info("Auto-confirming execution (--yes flag detected)")
        else:
            response = input("\nProceed with mesh + CFD execution on Inductiva? (yes/no): ").strip().lower()
        
        if response != 'yes':
            logger.info("❌ Execution cancelled by user")
            return False
        
        # STEP 4: Execute Mesh + CFD on Inductiva (single session)
        logger.info("\n" + "="*60)
        logger.info("STEP 4: Executing Mesh Generation + CFD on Inductiva Cloud")
        logger.info("="*60)
        cfd2result(case_name, type="inductiva")
        logger.info(f"✓ Inductiva mesh + CFD simulation completed")
        
        # STEP 5: Post-process results
        logger.info("\n" + "="*60)
        logger.info("STEP 5: Post-Processing Results")
        logger.info("="*60)
        results2post(case_name)
        logger.info(f"✓ Post-processing completed")
        
        # Success
        logger.info("\n" + "="*60)
        logger.info("🎉 SUCCESS! Complete pipeline with Inductiva executed successfully")
        logger.info("="*60)
        
        case_path = os.path.join(os.getcwd(), "cases", case_name)
        logger.info(f"\nResults directory: {case_path}/sim")
        logger.info(f"\nPost-processing outputs:")
        logger.info(f"  - PDF Report: cases/{case_name}/post/post_report.pdf")
        logger.info(f"  - Residuals CSV: cases/{case_name}/post/csv/residuals.csv")
        logger.info(f"  - Images: cases/{case_name}/post/images/")
        logger.info(f"  - VTK slices: cases/{case_name}/post/obj/")
        logger.info("\nNext steps:")
        logger.info("1. Review simulation results in cases/test_simple_room/sim/")
        logger.info("2. Check convergence in postProcessing/ directory")
        logger.info("3. Visualize results with ParaView")
        
        return True
        
    except Exception as e:
        logger.error("\n" + "="*60)
        logger.error(f"❌ PIPELINE FAILED: {e}")
        logger.error("="*60)
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    success = test_pipeline_inductiva()
    sys.exit(0 if success else 1)
