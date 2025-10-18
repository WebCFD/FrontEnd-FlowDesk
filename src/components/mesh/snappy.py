import os
import numpy as np
import pandas as pd
import pyvista as pv

from src.components.tools.populate_template_file import replace_in_file, generate_regions_block, generate_refinement_block


def create_surfaceFeatureExtractDict(template_path, sim_path, stl_filename):
    input_path = os.path.join(template_path, "system", "surfaceFeatureExtractDict") 
    output_path = os.path.join(sim_path, "system", "surfaceFeatureExtractDict") 
    str_replace_dict = dict()
    str_replace_dict["$STL_FILENAME"] = stl_filename
    replace_in_file(input_path, output_path, str_replace_dict)


def create_blockMeshDict(template_path, sim_path, geo_mesh):
    input_path = os.path.join(template_path, "system", "blockMeshDict") 
    output_path = os.path.join(sim_path, "system", "blockMeshDict") 

    BLOCKMESH_MARGIN = 0.1
    bounds = geo_mesh.bounds
    str_replace_dict = dict()
    str_replace_dict["$XMIN"] = str(bounds[0] - BLOCKMESH_MARGIN)
    str_replace_dict["$XMAX"] = str(bounds[1] + BLOCKMESH_MARGIN)
    str_replace_dict["$YMIN"] = str(bounds[2] - BLOCKMESH_MARGIN)
    str_replace_dict["$YMAX"] = str(bounds[3] + BLOCKMESH_MARGIN)
    str_replace_dict["$ZMIN"] = str(bounds[4] - BLOCKMESH_MARGIN)
    str_replace_dict["$ZMAX"] = str(bounds[5] + BLOCKMESH_MARGIN)
    replace_in_file(input_path, output_path, str_replace_dict)


def generate_location_inside_mesh(mesh):
    """
    Generate locationInMesh point for snappyHexMesh internal flow cases.
    Uses multiple validation strategies to ensure the point is truly interior.
    
    Strategy:
    1. Generate candidate points from cell centers
    2. Validate points are enclosed using select_enclosed_points
    3. Select point farthest from boundary for robustness
    4. Fail with clear error if no valid interior point found
    
    This approach prevents snappyHexMesh failures that occur when locationInMesh
    falls outside or on the boundary of the geometry.
    """
    import logging
    import numpy as np
    
    logger = logging.getLogger(__name__)
    
    # Generate candidate points from cell centers
    cell_centers = mesh.cell_centers()
    volumes = mesh.compute_cell_sizes()["Volume"]
    
    # Get top 10 largest cells as candidates (or all if fewer)
    n_candidates = min(10, len(volumes))
    top_indices = np.argsort(volumes)[-n_candidates:]
    candidate_points = cell_centers.points[top_indices]
    
    logger.info(f"    * Testing {n_candidates} candidate interior points")
    
    # Create a closed surface mesh for select_enclosed_points
    # For internal flow, mesh should already be closed, but extract surface to be sure
    surface_mesh = mesh.extract_surface()
    
    # Validate which candidates are truly enclosed
    candidate_cloud = pv.PolyData(candidate_points)
    enclosed_mask = candidate_cloud.select_enclosed_points(surface_mesh, tolerance=1e-6, check_surface=True)
    is_inside = enclosed_mask['SelectedPoints'].astype(bool)
    
    logger.info(f"    * Found {np.sum(is_inside)} valid interior points out of {n_candidates} candidates")
    
    if not np.any(is_inside):
        # No valid interior points found - this is a critical error
        error_msg = (
            f"\n{'='*80}\n"
            f"GEOMETRY ERROR: Cannot find valid interior point for locationInMesh!\n"
            f"{'='*80}\n"
            f"Tested {n_candidates} candidate points, none are truly enclosed.\n\n"
            f"This indicates a problem with the geometry:\n"
            f"  1. Geometry may have holes, gaps, or non-manifold surfaces\n"
            f"  2. Geometry may be too thin or have zero volume\n"
            f"  3. Surface normals may be inverted\n\n"
            f"SnappyHexMesh will fail without a valid interior point.\n"
            f"Please check and fix the geometry before meshing.\n"
            f"{'='*80}\n"
        )
        logger.error(error_msg)
        raise Exception(error_msg)
    
    # Select the valid point that is farthest from the boundary
    # This provides maximum robustness for snappyHexMesh
    valid_points = candidate_points[is_inside]
    
    # Compute distance to nearest surface point for each valid interior point
    distances = []
    for pt in valid_points:
        closest_point = surface_mesh.find_closest_point(pt)
        dist = np.linalg.norm(pt - surface_mesh.points[closest_point])
        distances.append(dist)
    
    # Select point with maximum distance from boundary
    best_idx = np.argmax(distances)
    point = valid_points[best_idx]
    max_dist = distances[best_idx]
    
    logger.info(f"    * Selected interior point: ({point[0]:.6f}, {point[1]:.6f}, {point[2]:.6f})")
    logger.info(f"    * Distance to nearest boundary: {max_dist:.6f} m")
    
    return f"({point[0]:.6f} {point[1]:.6f} {point[2]:.6f})"


def create_snappyHexMeshDict(template_path, sim_path, stl_filename, geo_mesh, geo_df):
    input_path = os.path.join(template_path, "system", "snappyHexMeshDict") 
    output_path = os.path.join(sim_path, "system", "snappyHexMeshDict") 

    patch_names = geo_df["id"].tolist()
    patch_types = geo_df["type"].tolist()
    geometry_regions = generate_regions_block(patch_names)
    emesh_filename = stl_filename.replace(".stl", ".eMesh")
    refinement_surfaces = generate_refinement_block(patch_types)
    location_inside_mesh = generate_location_inside_mesh(geo_mesh)

    str_replace_dict = dict()
    str_replace_dict["$STL_FILENAME"] = stl_filename
    str_replace_dict["$GEOMETRY_REGIONS"] = geometry_regions
    str_replace_dict["$EMESH_FILENAME"] = emesh_filename
    str_replace_dict["$REFINEMENT_SURFACES"] = refinement_surfaces
    str_replace_dict["$LOCATION_INSIDE_MESH"] = location_inside_mesh

    replace_in_file(input_path, output_path, str_replace_dict)


def export_to_stl(geo_mesh_dict, sim_path, stl_filename):
    """
    Write multiple PyVista PolyData solids to one multi-solid ASCII STL file.

    Parameters:
        geo_mesh_dict (dict): Keys are solid names (str), values are pv.PolyData objects.
        stl_path (str): Output STL file path.
    """

    stl_path = os.path.join(sim_path, "constant", "triSurface", stl_filename)
    os.makedirs(os.path.dirname(stl_path), exist_ok=True)

    def write_facet(f, normal, points):
        f.write(f"  facet normal {normal[0]:.6e} {normal[1]:.6e} {normal[2]:.6e}\n")
        f.write("    outer loop\n")
        for pt in points:
            f.write(f"      vertex {pt[0]:.6e} {pt[1]:.6e} {pt[2]:.6e}\n")
        f.write("    endloop\n")
        f.write("  endfacet\n")

    with open(stl_path, 'w') as f:
        for solid_name, mesh in geo_mesh_dict.items():
            f.write(f"solid {solid_name}\n")

            # Ensure mesh has triangles
            mesh = mesh.triangulate()

            # Iterate over faces
            faces = mesh.cells.reshape((-1, 4))  # VTK faces: [3, i0, i1, i2] for triangles
            for face in faces:
                assert face[0] == 3  # triangle

                pts = mesh.points[face[1:4]]
                # Calculate normal (can use PyVista or numpy)
                v1 = pts[1] - pts[0]
                v2 = pts[2] - pts[0]
                normal = np.cross(v1, v2)
                norm = np.linalg.norm(normal)
                if norm > 0:
                    normal /= norm
                else:
                    normal = np.array([0.0, 0.0, 0.0])

                write_facet(f, normal, pts)

            f.write(f"endsolid {solid_name}\n")


def validate_mesh_patches(sim_path: str, expected_patches: list[str]) -> None:
    """
    Validate that the mesh only contains user-defined patches.
    Raises exception if background patches like 'limits' remain, indicating meshing failure.
    
    Args:
        sim_path: Path to simulation directory
        expected_patches: List of patch names that should exist (from user config)
        
    Raises:
        Exception: If background patches remain or if meshing failed
    """
    import logging
    from foamlib import FoamCase
    
    logger = logging.getLogger(__name__)
    
    boundary_file = os.path.join(sim_path, "constant", "polyMesh", "boundary")
    if not os.path.exists(boundary_file):
        raise Exception(f"Mesh boundary file not found: {boundary_file}. Meshing may have failed.")
    
    # Read boundary file using FoamCase
    case = FoamCase(sim_path)
    try:
        with case['constant']['polyMesh']['boundary'] as bnd:
            # Get all patches from the mesh
            mesh_patches = {}
            for patch_name in bnd.keys():
                patch_info = bnd[patch_name]
                n_faces = patch_info.get('nFaces', 0)
                mesh_patches[patch_name] = n_faces
            
            logger.info(f"    * Mesh validation: Found {len(mesh_patches)} patches in mesh")
            for patch_name, n_faces in mesh_patches.items():
                logger.info(f"      - {patch_name}: {n_faces} faces")
            
            # Check for background patches that indicate meshing failure
            background_patches = ['limits', 'defaultFaces']
            failed_patches = []
            
            for bg_patch in background_patches:
                if bg_patch in mesh_patches and mesh_patches[bg_patch] > 0:
                    failed_patches.append(f"{bg_patch} ({mesh_patches[bg_patch]} faces)")
            
            if failed_patches:
                error_msg = (
                    f"\n{'='*80}\n"
                    f"MESHING ERROR: SnappyHexMesh failed to cut geometry properly!\n"
                    f"{'='*80}\n"
                    f"Background patches remain in the mesh:\n"
                    f"  {', '.join(failed_patches)}\n\n"
                    f"This indicates that snappyHexMesh could not classify cells correctly.\n"
                    f"Possible causes:\n"
                    f"  1. locationInMesh point is outside or on the boundary of the geometry\n"
                    f"  2. Geometry has holes, gaps, or non-manifold surfaces\n"
                    f"  3. STL file has errors or invalid normals\n\n"
                    f"Expected patches: {', '.join(expected_patches)}\n"
                    f"Actual patches: {', '.join(mesh_patches.keys())}\n"
                    f"{'='*80}\n"
                )
                logger.error(error_msg)
                raise Exception(error_msg)
            
            # Check for unexpected patches (not in user config and not background)
            unexpected = set(mesh_patches.keys()) - set(expected_patches) - set(background_patches)
            if unexpected:
                logger.warning(f"    * Warning: Unexpected patches found: {', '.join(unexpected)}")
            
            logger.info("    * Mesh validation PASSED: No background patches remain")
            
    except Exception as e:
        if "MESHING ERROR" in str(e):
            raise  # Re-raise our custom error
        else:
            raise Exception(f"Failed to read mesh boundary file: {e}")


def split_polydata_by_cell_data(mesh: pv.PolyData, df: pd.DataFrame) -> dict[int, pv.PolyData]:
    patch_names = df[["id"]].to_dict()

    patch_mesh_dict = {}
    for patch_id, patch_name in patch_names['id'].items():
        mask = mesh.cell_data["patch_id"] == patch_id
        submesh = mesh.extract_cells(mask)
        patch_mesh_dict[patch_name] = submesh
    return patch_mesh_dict


def prepare_snappy(geo_mesh, sim_path, geo_df, stl_filename = "geometry.stl"):
    """
    Prepare SnappyHexMesh configuration and scripts for mesh generation.
    
    Args:
        geo_mesh: Geometry mesh to be meshed
        sim_path: Path to simulation directory
        geo_df: DataFrame containing boundary condition information
        stl_filename: Name of the STL file to export
        
    Returns:
        List of script commands for mesh generation
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"    * Preparing SnappyHexMesh configuration for {geo_mesh.n_cells} geometry cells")
    
    logger.info("    * Splitting geometry mesh by boundary condition patches")
    geo_mesh_dict = split_polydata_by_cell_data(geo_mesh, geo_df)
    logger.info(f"    * Split into {len(geo_mesh_dict)} patch meshes")
    
    logger.info(f"    * Exporting geometry to STL format: {stl_filename}")
    export_to_stl(geo_mesh_dict, sim_path, stl_filename)
    
    template_path = os.path.join(os.getcwd(), "data", "settings", "mesh", "snappy")
    logger.info(f"    * Creating SnappyHexMesh configuration files from template: {template_path}")
    
    logger.info("    * Creating surfaceFeatureExtractDict")
    create_surfaceFeatureExtractDict(template_path, sim_path, stl_filename)
    
    logger.info("    * Creating blockMeshDict")
    create_blockMeshDict(template_path, sim_path, geo_mesh)
    
    logger.info("    * Creating snappyHexMeshDict")
    create_snappyHexMeshDict(template_path, sim_path, stl_filename, geo_mesh, geo_df)





    # Note: Mesh validation is now done locally in step02_geo2mesh.py before cloud submission
    # This saves credits by catching geometry errors early
    
    script_commands = [
        '#!/bin/sh', 
        'cd "${0%/*}" || exit',
        'set -e',  # Exit immediately if any command fails
        '. ${WM_PROJECT_DIR:?}/bin/tools/RunFunctions',

        'decompDict="-decomposeParDict system/decomposeParDict"',

        # 1. Extract features for snapping and refinement in snappyHexMesh
        'runApplication surfaceFeatureExtract',

        # 2. This creates a simple background mesh in constant/polyMesh
        'runApplication blockMesh',

        # 3. Run snappyHexMesh in a single core
        'runApplication snappyHexMesh -overwrite',

        # 4. Prepare initial fields
        'rm -rf 0',
        'cp -r 0.orig 0',

        # 5. Clean processors & decompose
        'rm -rf processor*',
        'runApplication decomposePar',

        # 6. Create foam marker file for GUI usage
        'touch results.foam',
        ]
    
    logger.info("    * SnappyHexMesh preparation completed successfully")
    logger.info("    * Mesh validation will be performed locally before cloud submission")
    return script_commands