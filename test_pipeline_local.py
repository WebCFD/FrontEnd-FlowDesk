#!/usr/bin/env python3
"""
Test script for CFD pipeline - LOCAL execution only (no Inductiva)
Tests: JSON → Geometry → Mesh config → CFD setup
Does NOT execute mesh generation or CFD solving
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

def test_pipeline_local():
    """Test complete pipeline locally without executing on Inductiva"""
    
    logger.info("="*60)
    logger.info("TESTING CFD PIPELINE LOCALLY")
    logger.info("="*60)
    
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
        logger.info(f"STEP 2: Generating Mesh Configuration ({mesher_type})")
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
        
        # Verify output files
        logger.info("\n" + "="*60)
        logger.info("VERIFYING OUTPUT FILES")
        logger.info("="*60)
        
        case_path = os.path.join(os.getcwd(), "cases", case_name)
        
        files_to_check = [
            "geo/geometry.vtk",
            "geo/patch_info.csv",
            "sim/constant/triSurface/geometry.stl",
            "sim/system/blockMeshDict",
            "sim/system/snappyHexMeshDict",
            "sim/system/controlDict",
            "sim/system/fvSchemes",
            "sim/system/fvSolution",
            "sim/constant/thermophysicalProperties",
            "sim/constant/g",
            "sim/0.orig/U",
            "sim/0.orig/p_rgh",
            "sim/0.orig/T"
        ]
        
        all_present = True
        for file_path in files_to_check:
            full_path = os.path.join(case_path, file_path)
            if os.path.exists(full_path):
                logger.info(f"✓ {file_path}")
            else:
                logger.error(f"✗ MISSING: {file_path}")
                all_present = False
        
        if all_present:
            logger.info("\n" + "="*60)
            logger.info("🎉 SUCCESS! Pipeline completed successfully")
            logger.info("="*60)
            logger.info(f"\nCase directory: {case_path}")
            logger.info("\nNext steps:")
            logger.info("1. Review the generated case in cases/test_simple_room/")
            logger.info("2. If everything looks good, test with Inductiva")
            return True
        else:
            logger.error("\n" + "="*60)
            logger.error("❌ FAILED: Some output files are missing")
            logger.error("="*60)
            return False
            
    except Exception as e:
        logger.error("\n" + "="*60)
        logger.error(f"❌ PIPELINE FAILED: {e}")
        logger.error("="*60)
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == "__main__":
    success = test_pipeline_local()
    sys.exit(0 if success else 1)
