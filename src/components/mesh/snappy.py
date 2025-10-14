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
    # Definir un offset pequeño
    epsilon = 1e-3  # ajusta según el tamaño de tu mesh

    # Obtener puntos
    points = mesh.points

    # Encontrar el punto más extremo en +X, +Y, +Z
    # Calculamos la "distancia" combinada para determinar el punto más en la esquina +X+Y+Z
    distances = points[:, 0] + points[:, 1] + points[:, 2]
    extreme_idx = np.argmax(distances)
    extreme_point = points[extreme_idx].copy()

    # Calcular vector hacia el centro de la malla
    center = mesh.center
    direction_to_center = center - extreme_point
    direction_to_center /= np.linalg.norm(direction_to_center)  # normalizar

    # Aplicar offset hacia el interior
    new_point = extreme_point + epsilon * direction_to_center
    #return "({:.6f} {:.6f} {:.6f})".format(*new_point)
    return "(0.0 0.0 1.0)"


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





    script_commands = [
        '#!/bin/sh', 
        'cd "${0%/*}" || exit', 
        '. ${WM_PROJECT_DIR:?}/bin/tools/RunFunctions',

        'decompDict="-decomposeParDict system/decomposeParDict"',

        # 1. Extract features for snapping and refinement in snappyHexMesh
        'runApplication surfaceFeatureExtract',

        # 2. This creates a simple background mesh in constant/polyMesh
        'runApplication blockMesh',

        # 4. Run snappyHexMesh in a single core
        'runApplication snappyHexMesh -overwrite',

        # Prepare initial fields
        'rm -rf 0',
        'cp -r 0.orig 0',

        # Clean processors & decompose
        'rm -rf processor*',
        'runApplication decomposePar',

        # 9. Create foam marker file for GUI usage
        'touch results.foam',
        ]
    
    logger.info("    * SnappyHexMesh preparation completed successfully")
    return script_commands