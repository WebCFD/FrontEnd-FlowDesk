"""Load geometry files for mesh generation."""
import os
import pandas as pd
import pyvista as pv


def load_geo_files(case_name: str):
    """
    Load geometry mesh and boundary conditions from case directory.
    
    Args:
        case_name: Name of the simulation case
        
    Returns:
        Tuple of (geometry_mesh, boundary_conditions_dataframe)
    """
    case_path = os.path.join(os.getcwd(), "cases", case_name)
    geo_path = os.path.join(case_path, "geo")
    
    # Load geometry mesh
    geo_mesh_path = os.path.join(geo_path, "geometry.vtk")
    geo_mesh = pv.read(geo_mesh_path)
    
    # Load boundary conditions dataframe
    geo_df_path = os.path.join(geo_path, "patch_info.csv")
    geo_df = pd.read_csv(geo_df_path)
    
    return geo_mesh, geo_df
