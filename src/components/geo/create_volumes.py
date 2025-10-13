import os
import shapely
import numpy as np
import pandas as pd
import pyvista as pv
import logging

from typing import List, Tuple, Dict, Any
from src.components.tools.performance import (
    optimize_mesh_memory,
    PerformanceMonitor
)

logger = logging.getLogger(__name__)

VOLUMES_TOLERANCE = 1e-5
DEFAULT_TEMPERATURE = 20

FLOW_LEVELS = {
    # STRING: (VALUE IN METERS PER SECOND)
    'low':      10,
    'medium':   20,
    'high':     30,
}

ELEMENTS_MESHES = {
    # ID: (NAME, FOLDER PATH)
     1: ('h_open_arms',                         'HUMANS'),
     2: ('h_standing',                          'HUMANS'),
     3: ('h_sitting',                           'HUMANS'),
    11: ('table_round',                         'TABLES'),
    12: ('table_rect',                          'TABLES'),
    21: ('chair_basic',                         'CHAIRS'),
    22: ('chair_office',                        'UNKNOWN'),         # CHECK WITH JUAN
    41: ('h_open_arms_NOMOUTH',                 'BREATHING'),
    42: ('h_standing_NOMOUTH',                  'BREATHING'),
    43: ('h_sitting_NOMOUTH',                   'BREATHING'),
    51: ('MOUTH_h_open_arms',                   'BREATHING'),
    52: ('MOUTH_h_standing',                    'BREATHING'),
    53: ('MOUTH_h_sitting',                     'BREATHING'),
   111: ('set_chair_basic_N4',                  'SETS'),
   112: ('set_h_sitting_N4',                    'SETS'),
   121: ('set_4chairs_table_rectangular',       'JRM_Designs'),    # CHECK WITH JUAN
   122: ('set_4people_table_rectangular',       'JRM_Designs'),    # CHECK WITH JUAN
   131: ('set_6chairs_Long_table_rectangular',  'JRM_Designs'),    # CHECK WITH JUAN
   132: ('set_6people_Long_table_rectangular',  'JRM_Designs'),    # CHECK WITH JUAN
   143: ('set_h_sitting_N4_NOMOUTH',            'SETS'),
   153: ('set_h_sitting_N4_Mouth',              'SETS'),
}


def create_furniture_mesh(patch_df: pd.DataFrame, data: Dict[str, Any]) -> Tuple[pd.DataFrame, pv.PolyData]:
    """Create furniture mesh from FDM_iter2.json format."""
    # Sanitize patch ID for OpenFOAM compatibility
    patch_id = data['id'].replace(' ', '_')
    
    # Add patch info
    new_patch = get_wall_bc_dict(patch_id)
    patch_df = pd.concat([patch_df, pd.DataFrame([new_patch])], ignore_index=True)
    patch_idx = patch_df.index[patch_df['id'] == patch_id][0].astype(np.int16)

    # Extract position, rotation, and scale
    translation = np.array([data['position']['x'], data['position']['y'], data['position']['z']])
    rotation = data['rotation']['z']
    scale = data.get('scale', {'x': 1, 'y': 1, 'z': 1})
    
    # Determine mesh ID from furniture type
    if 'table' in data['id'].lower():
        mesh_id = 11  # table_round
    elif 'chair' in data['id'].lower():
        mesh_id = 21  # chair_basic
    else:
        mesh_id = 11  # default to table_round

    # Load and transform mesh
    mesh_path_info = ELEMENTS_MESHES[mesh_id]
    mesh_path = os.path.join(os.getcwd(), 'data', 'meshes', mesh_path_info[1], mesh_path_info[0] + '.stl')
    
    obj_mesh = pv.read(mesh_path)
    obj_mesh.rotate_z(rotation, inplace=True)
    obj_mesh.translate(xyz=translation, inplace=True)
    obj_mesh.scale([scale['x'], scale['y'], scale['z']], inplace=True)
    
    # Clean and prepare mesh
    obj_mesh = obj_mesh.clean().triangulate().extract_surface()
    obj_mesh.compute_normals(inplace=True, auto_orient_normals=True, consistent_normals=True, split_vertices=True, point_normals=False)
    obj_mesh.cell_data['patch_id'] = [patch_idx] * obj_mesh.n_cells
    
    return patch_df, optimize_mesh_memory(obj_mesh)


def add_new_bc(bc_names, new_name):
    if(not new_name in bc_names):
        bc_names.append(new_name)
    bc_idx = bc_names.index(new_name)
    return bc_names, bc_idx


def get_entry_bc_dict(data):
    """Create boundary condition dictionary for air entries (FDM_iter2.json format)."""
    simulation = data['simulation']
    
    # Sanitize patch ID for OpenFOAM compatibility (replace spaces with underscores)
    patch_id = data['id'].replace(' ', '_')
    
    new_patch = {
        'id': patch_id,
        'open': simulation['state'] == 'open'
    }
    
    if not new_patch['open']:
        # Closed entry behaves like a wall
        return {
            'id': patch_id,
            'type': 'wall',
            'T': simulation.get('temperature', DEFAULT_TEMPERATURE)
        }
    
    # Determine type based on flowType
    flow_type = simulation.get('flowType', 'velocity')
    if flow_type == 'Air Mass Flow':
        new_patch['type'] = 'pressure_outlet'
        new_patch['U'] = np.nan
    else:  # velocity
        new_patch['type'] = 'velocity_inlet'
        flow_intensity = simulation.get('flowIntensity', 'medium')
        new_patch['U'] = FLOW_LEVELS.get(flow_intensity, FLOW_LEVELS['medium'])
    
    new_patch['T'] = simulation.get('temperature', DEFAULT_TEMPERATURE)
    return new_patch


def get_wall_bc_dict(id, temperature=DEFAULT_TEMPERATURE):
    # Sanitize patch ID for OpenFOAM compatibility
    new_patch = dict()
    new_patch['id'] = id.replace(' ', '_')
    new_patch['type'] = 'wall'
    new_patch['T'] = temperature
    return new_patch


def from_3d_to_wall2d(points_3d, p_origin, udir, vdir):
    """
    Transforms a batch of 3D points from a 3D coordinate system to a 2D wall coordinate system.

    Parameters:
    points (np.ndarray): A NumPy array of 3D points. Can be a 1D array for a single point
    p_origin (np.ndarray): A 1D NumPy array representing the origin of the wall in 3D space.
    udir (np.ndarray): A 1D NumPy array representing the u-direction (x-axis) of the wall.
    vdir (np.ndarray): A 1D NumPy array representing the v-direction (y-axis) of the wall.

    Returns:
    np.ndarray: A NumPy array of 2D points in the wall coordinate system.

    Raises:
    BaseException: If any 3D point is not on the wall surface (i.e., its z_wall component is not zero).
    """
    if points_3d.ndim == 1:
        points_3d = points_3d[np.newaxis, :]

    if points_3d.shape[1] != 3:
        raise ValueError("Each point in 'points_3d' must be a 3D point")
    
    p_origin = p_origin[np.newaxis, :]
    x_2d = np.dot(points_3d - p_origin, udir)[:, np.newaxis]
    y_2d = np.dot(points_3d - p_origin, vdir)[:, np.newaxis]
    z_2d = (points_3d - x_2d * udir - y_2d * vdir)[..., 2] - p_origin[:, 2]

    if not np.allclose(z_2d, 0):
        raise BaseException('At least one 3D point is not on the wall surface')
    
    return np.hstack([x_2d, y_2d])


def from_wall2d_to_3d(points_2d, p_origin, udir, vdir):
    if points_2d.ndim == 1:
        points_2d = points_2d[np.newaxis, :]

    if points_2d.shape[1] != 2:
        raise ValueError("Each point in 'points_2d' must be a 2D point")

    return p_origin + np.outer(points_2d[:, 0], udir) + np.outer(points_2d[:, 1], vdir)


def create_single_entry(entry_data: Dict, base_height: float, p0: np.ndarray, udir: np.ndarray, vdir: np.ndarray) -> Tuple[Dict, shapely.Polygon]:
    """Process a single entry for FDM_iter2.json format."""
    # Convert 3D position to 2D wall coordinates
    centre_3d = np.array([
        entry_data['position']['x'], 
        entry_data['position']['y'], 
        entry_data['position']['z'] + base_height
    ])
    centre_2d = from_3d_to_wall2d(centre_3d, p0, udir, vdir)

    # Create rectangular polygon
    dimensions = entry_data['dimensions']
    width, height = dimensions['width'], dimensions['height']
    polygon = shapely.box(-width/2, -height/2, +width/2, +height/2)
    polygon = shapely.affinity.translate(polygon, xoff=centre_2d[0, 0], yoff=centre_2d[0, 1])
    
    return get_entry_bc_dict(entry_data), polygon


def create_entries(patch_df, entries_data, base_height, p0, udir, vdir):
    """Create air entries for FDM_iter2.json format."""
    entries_dict = {}
    for entry_data in entries_data:
        new_patch, polygon = create_single_entry(entry_data, base_height, p0, udir, vdir)
        patch_df = pd.concat([patch_df, pd.DataFrame([new_patch])], ignore_index=True)
        entries_dict[entry_data['id']] = polygon
    return patch_df, entries_dict


def create_wall(patch_df: pd.DataFrame, data: Dict[str, Any], height: float, base_height: float) -> Tuple[pd.DataFrame, pv.PolyData]:
    """Optimized wall creation with parallel processing for entries."""
    p0 = np.array([data['start']['x'], data['start']['y'], base_height])
    p1 = np.array([data['end']['x'], data['end']['y'], base_height])
    udir = p1 - p0
    udir = udir / np.linalg.norm(udir)
    vdir = np.array([0, 0, 1])

    p0_top = p0 + height*vdir
    p1_top = p1 + height*vdir
    wall_points_3d = np.vstack([p0, p0_top, p1_top, p1, p0])
    wall_points_2d = from_3d_to_wall2d(wall_points_3d, p0, udir, vdir)
    wall_polygon = shapely.Polygon(wall_points_2d)

    new_patch = get_wall_bc_dict(data['id'], temperature=data['temp'])
    patch_df = pd.concat([patch_df, pd.DataFrame([new_patch])], ignore_index=True)
    patch_df, entries_dict = create_entries(patch_df, data['airEntries'], base_height, p0, udir, vdir)

    wall_meshes = []
    for entry_id, entry_polygon in entries_dict.items():
        wall_polygon = wall_polygon.difference(entry_polygon)
        entry_mesh = create_mesh_from_polygon(patch_df, entry_id, entry_polygon, p0, udir, vdir)
        wall_meshes.append(entry_mesh)

    wall_mesh = create_mesh_from_polygon(patch_df, data['id'], wall_polygon, p0, udir, vdir)
    wall_meshes.append(wall_mesh)
    
    # Merge meshes efficiently
    result_mesh = pv.merge(wall_meshes)
    return patch_df, result_mesh


def create_bound_surface(str_type: str, patch_df: pd.DataFrame, polygon: pv.PolyData, level_name: str, data: Dict[str, Any]) -> Tuple[pd.DataFrame, pv.PolyData]:
    floor_id = f"{str_type}_{level_name}F"
    new_patch = get_wall_bc_dict(floor_id, temperature=data['temp'])
    patch_df = pd.concat([patch_df, pd.DataFrame([new_patch])], ignore_index=True)

    z_floor = np.mean(polygon.points[:,2])
    p0 = np.array([0, 0, z_floor])
    udir = np.array([1, 0, 0])
    vdir = np.array([0, 1, 0])

    # Get the ordered vertex indices directly from faces
    floor_polygon = create_polygon_from_mesh(polygon)

    patch_df, entries_dict = create_entries(patch_df, data['airEntries'], 0, p0, udir, vdir)

    wall_meshes = []
    for entry_id, entry_polygon in entries_dict.items():
        floor_polygon = floor_polygon.difference(entry_polygon)
        entry_mesh = create_mesh_from_polygon(patch_df, entry_id, entry_polygon, p0, udir, vdir)
        wall_meshes.append(entry_mesh)

    wall_mesh = create_mesh_from_polygon(patch_df, floor_id, floor_polygon, p0, udir, vdir)
    wall_meshes.append(wall_mesh)
    
    # Merge meshes efficiently
    result_mesh = pv.merge(wall_meshes)
    return patch_df, result_mesh


def create_polygon_from_mesh(mesh):
    edges = mesh.cells.reshape(-1,3)[:,1:]
    u, v = edges.T
    adj = np.empty(u.shape, dtype=u.dtype)
    adj[u] = v

    v = edges[0,0]
    vert_idxs = [v]
    for _ in range(len(edges)):
        v = adj[v]
        vert_idxs.append(v)
    return shapely.force_2d(shapely.Polygon(mesh.points[vert_idxs]))


def create_mesh_from_polygon(patch_df, entry_id, entry_polygon, p0, udir, vdir):
    points_2d = []
    faces = []
    point_index = {}
    next_index = 0

    triangles  = shapely.constrained_delaunay_triangles(entry_polygon)
    for triangle in triangles.geoms:
        coords = list(triangle.exterior.coords)[:-1]  # omit duplicate closing point
        face = [3]  # number of points in the triangle
        for x, y in coords:
            key = (x, y)
            if key not in point_index:
                point_index[key] = next_index
                points_2d.append([x, y])
                next_index += 1
            face.append(point_index[key])
        faces.extend(face)

    points_2d = np.array(points_2d)
    points_3d = from_wall2d_to_3d(points_2d, p0, udir, vdir)
    faces = np.array(faces)

    # Create PyVista PolyData
    mesh = pv.PolyData(points_3d, faces)
    patch_idx = patch_df.index[patch_df['id'] == entry_id][0].astype(np.int16)
    mesh.cell_data['patch_id'] = [patch_idx] * mesh.n_cells
    return mesh 


def create_floor_mesh(patch_df: pd.DataFrame, level_name: str, level_data: Dict[str, Any], base_height: float = 0) -> Tuple[pd.DataFrame, pv.PolyData]:
    """Optimized floor mesh creation with parallel wall processing."""
    height = level_data["height"]

    # Create all walls and merge them
    wall_meshes = []
    for wall in level_data["walls"]:
        patch_df, wall_mesh = create_wall(patch_df, wall, height, base_height)
        wall_meshes.append(wall_mesh)
    walls_mesh = pv.merge(wall_meshes)
    walls_mesh.clean(tolerance=1e-3, absolute=True, inplace=True)

    # Process boundaries floor and ceiling
    wall_boundaries = walls_mesh.extract_feature_edges(
        boundary_edges=True,
        feature_edges=False,
        manifold_edges=False,
        non_manifold_edges=False
    )
    del wall_boundaries.cell_data['patch_id']
    polygon_meshes = wall_boundaries.split_bodies()

    # 2. Compute the centroid (center of mass) of each part
    centroids = [part.center for part in polygon_meshes]
    sorted_polygons = [p for _, p in sorted(zip(centroids, polygon_meshes), key=lambda cp: cp[0][2])]
    polygon_floor = sorted_polygons[0]
    polygon_ceil = sorted_polygons[1]

    # Handle ceiling and floor_surf air entries
    if "floor" in level_data:
        patch_df, mesh_floor = create_bound_surface("floor", patch_df, polygon_floor, level_name, level_data["floor"])

    if "ceiling" in level_data:
        patch_df, mesh_ceil = create_bound_surface("ceil", patch_df, polygon_ceil, level_name, level_data["ceiling"])

    # Merge room meshes efficiently
    floor_mesh = pv.merge([walls_mesh, mesh_floor, mesh_ceil])
    floor_mesh.triangulate(inplace=True)
    floor_mesh.compute_normals(inplace=True, auto_orient_normals=True, consistent_normals=True, split_vertices=True, point_normals=False)
    
    # Optimize memory usage
    floor_mesh = optimize_mesh_memory(floor_mesh)
    
    return patch_df, floor_mesh


def create_stair_mesh(patch_df: pd.DataFrame, data: Dict[str, Any], current_base: float, floor_deck: float) -> Tuple[pd.DataFrame, pv.PolyData]:
    """Optimized stair mesh creation."""
    new_patch = get_wall_bc_dict(data['id'])
    patch_df = pd.concat([patch_df, pd.DataFrame([new_patch])], ignore_index=True)

    points = []
    connectivity = []
    for i, line in enumerate(data['lines']):
        # TODO: TELL JUAN THAT NO LINE ID IS NEEDED IN STAIR ELEMENT
        p0 = np.array([line['start']['x'], line['start']['y'], current_base - VOLUMES_TOLERANCE])
        p1 = np.array([line['end']['x'], line['end']['y'], current_base - VOLUMES_TOLERANCE])
        if len(points) == 0:
            points = np.vstack((p0, p1))
        else:
            points = np.vstack((points, p0))
            points = np.vstack((points, p1))
        connectivity.extend([2, 2*i, 2*i + 1])

    poly_mesh = pv.PolyData()
    poly_mesh.points = points
    poly_mesh.lines = connectivity
    poly_mesh.clean(inplace=True)
    poly_filled = poly_mesh.triangulate_contours()

    patch_idx = patch_df.index[patch_df['id'] == data['id']][0].astype(np.int16)

    stair_mesh = poly_filled.extrude([0, 0, floor_deck + 2*VOLUMES_TOLERANCE], capping=True)
    stair_mesh.compute_normals(inplace=True, auto_orient_normals=True, consistent_normals=True, split_vertices=True, point_normals=False)
    stair_mesh.triangulate(inplace=True)
    stair_mesh.cell_data['patch_id'] = [patch_idx] * stair_mesh.n_cells
    
    # Optimize memory usage
    stair_mesh = optimize_mesh_memory(stair_mesh)
    
    return patch_df, stair_mesh


def create_volumes(building_config_data: Dict[str, Any]) -> Tuple[List[pv.PolyData], List[pv.PolyData], pd.DataFrame]:
    """
    Create 3D room geometry and furniture from building configuration data.
    
    This function processes each floor level to create:
    - Room geometry (walls, floors, ceilings) 
    - Stair connections between floors
    - Furniture objects within each room
    
    Args:
        building_config_data: JSON data containing building floor definitions
        
    Returns:
        Tuple of (room_geometry_meshes, furniture_meshes, boundary_conditions_df)
    """
    performance_monitor = PerformanceMonitor()
    performance_monitor.start()
    
    # Track current floor elevation for proper stacking
    current_floor_elevation = 0.0

    # Initialize data structures for geometry creation
    boundary_conditions_df = pd.DataFrame()
    room_geometry_meshes = []
    furniture_meshes = []

    total_floors = len(building_config_data['levels'])
    logger.info(f"    * Processing {total_floors} floor levels")

    for floor_name, floor_config in building_config_data["levels"].items():
        logger.info(f"    * Creating geometry for floor #{floor_name}")
        performance_monitor.update_memory()
        
        floor_deck_thickness = floor_config["deck"]
        floor_height = floor_config["height"]
        
        # CREATE ROOM GEOMETRY (walls, floors, ceilings)
        boundary_conditions_df, room_mesh = create_floor_mesh(
            boundary_conditions_df, floor_name, floor_config, base_height=current_floor_elevation
        )
        room_geometry_meshes.append(room_mesh)

        # CREATE STAIR CONNECTIONS (FDM_iter2.json format - always upward direction)
        for stair_config in floor_config["stairs"]:
            boundary_conditions_df, stair_mesh = create_stair_mesh(
                boundary_conditions_df, stair_config, 
                current_floor_elevation + floor_height, floor_deck_thickness
            )
            room_geometry_meshes.append(stair_mesh)

        # ADD FURNITURE OBJECTS
        for furniture_config in floor_config.get("furniture", []):
            boundary_conditions_df, furniture_mesh = create_furniture_mesh(
                boundary_conditions_df, furniture_config
            )
            furniture_meshes.append(furniture_mesh)
        
        # Update elevation for next floor
        current_floor_elevation += floor_height + floor_deck_thickness
        performance_monitor.update_memory()

    # Log performance summary
    performance_summary = performance_monitor.get_summary()
    logger.info(f"    * Room geometry creation completed: {performance_summary['total_time']:.2f}s, peak memory: {performance_summary['peak_memory_mb']:.1f}MB")
    
    return room_geometry_meshes, furniture_meshes, boundary_conditions_df