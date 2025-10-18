"""
Geometry to mesh conversion with parallel processing and memory management.
"""

import os
import logging
import subprocess
from typing import List
import pyvista as pv
import pandas as pd

from src.components.tools.load_geo import load_geo_files
from src.components.tools.performance import PerformanceMonitor
from pipeline_exceptions import MeshingStepError

logger = logging.getLogger(__name__)


def run(case_name: str, geo_mesh: pv.PolyData, geo_df: pd.DataFrame, type: str = "cfmesh") -> List[str]:
    """
    Convert 3D geometry to computational mesh with parallel processing and memory management.
    
    This function orchestrates the complete mesh generation pipeline:
    1. Sets up the mesh case directory structure
    2. Prepares mesh generation scripts based on selected meshing software
    3. Configures mesh parameters and boundary conditions
    4. Generates mesh generation commands for execution
    
    Args:
        case_name: Name of the simulation case
        geo_mesh: 3D geometry mesh from previous step
        geo_df: DataFrame containing boundary condition information
        type: Type of meshing software ("cfmesh" or "snappy")
        
    Returns:
        List of script commands for mesh generation
    """
    performance_monitor = PerformanceMonitor()
    performance_monitor.start()
    
    logger.info("\n=========== RUNNING GEOMETRY TO MESH CONVERSION ===========")

    # Step 1: Set up case directory structure
    case_path = os.path.join(os.getcwd(), "cases", case_name)
    sim_path = os.path.join(case_path, "sim")
    logger.info(f"1 - Setting up case directory structure: {case_path}")
    performance_monitor.update_memory()

    # Step 2: Prepare mesh generation scripts
    logger.info(f"2 - Preparing {type} mesh generation scripts")
    performance_monitor.update_memory()
    
    try:
        if type == "cfmesh":
            from src.components.mesh.cfmesh import prepare_cfmesh
            script_commands = prepare_cfmesh(geo_mesh, sim_path, geo_df)
        elif type == "snappy":
            from src.components.mesh.snappy import prepare_snappy, validate_mesh_patches
            script_commands = prepare_snappy(geo_mesh, sim_path, geo_df)
            
            # Execute meshing locally to validate before cloud submission
            logger.info("3 - Running local mesh generation for validation")
            performance_monitor.update_memory()
            
            # Execute the meshing commands locally (surfaceFeatureExtract, blockMesh, snappyHexMesh)
            meshing_commands = [
                'surfaceFeatureExtract',
                'blockMesh', 
                'snappyHexMesh -overwrite'
            ]
            
            for cmd in meshing_commands:
                logger.info(f"   Executing: {cmd}")
                try:
                    result = subprocess.run(
                        cmd,
                        shell=True,
                        cwd=sim_path,
                        capture_output=True,
                        text=True,
                        timeout=300  # 5 minute timeout
                    )
                    if result.returncode != 0:
                        raise MeshingStepError(
                            f"Command '{cmd}' failed",
                            {
                                'case_name': case_name,
                                'command': cmd,
                                'stdout': result.stdout[-500:] if result.stdout else '',
                                'stderr': result.stderr[-500:] if result.stderr else '',
                                'suggestion': 'Check geometry validity and mesh parameters'
                            }
                        )
                except subprocess.TimeoutExpired:
                    raise MeshingStepError(
                        f"Command '{cmd}' timed out after 5 minutes",
                        {
                            'case_name': case_name,
                            'command': cmd,
                            'suggestion': 'Reduce mesh refinement or simplify geometry'
                        }
                    )
            
            # Validate mesh patches
            logger.info("4 - Validating mesh patches")
            expected_patches = geo_df["id"].tolist()
            try:
                validate_mesh_patches(sim_path, expected_patches)
                logger.info("   ✅ Mesh validation passed - no background patches found")
            except Exception as e:
                raise MeshingStepError(
                    f"Mesh validation failed: {str(e)}",
                    {
                        'case_name': case_name,
                        'expected_patches': expected_patches,
                        'suggestion': 'Geometry is not watertight. Check for gaps, holes, or non-manifold surfaces in the 3D geometry.'
                    }
                )
        else:
            raise MeshingStepError(
                f"Unknown meshing software: {type}",
                {
                    'case_name': case_name,
                    'meshing_type': type,
                    'suggestion': 'Use "cfmesh" or "snappy"'
                }
            )
    except MeshingStepError:
        # Re-raise MeshingStepError without wrapping
        raise
    except Exception as e:
        raise MeshingStepError(
            f"Mesh generation failed: {str(e)}",
            {
                'case_name': case_name,
                'meshing_type': type,
                'suggestion': 'Check if geometry is valid and mesh parameters are correct'
            }
        )
    
    performance_monitor.update_memory()
    
    # Log performance summary
    performance_summary = performance_monitor.get_summary()
    logger.info(f"Total processing time: {performance_summary['total_time']:.2f}s")
    logger.info(f"Peak memory usage: {performance_summary['peak_memory_mb']:.1f}MB")
    logger.info(f"✅ Mesh preparation pipeline completed successfully:")
    return script_commands


if __name__ == "__main__":
    case_name = "FDM_iter2"
    geo_mesh, geo_df = load_geo_files(case_name)
    result = run(case_name=case_name, geo_mesh=geo_mesh, geo_df=geo_df, type="snappy")