import os
import pyvista as pv


def load_foam_results(sim_path: str):
    """
    Load OpenFOAM results and separate internal volume from surfaces.

    Returns:
        tuple: (internal_mesh, surfaces_mesh)
    """
    foam_path = os.path.join(sim_path, "results.foam")
    reader = pv.get_reader(foam_path)
    reader.set_active_time_value(reader.time_values[-1])

    # Read complete mesh
    mesh = reader.read()

    # Handle MultiBlock mesh (multiple regions or patches)
    if isinstance(mesh, pv.MultiBlock):
        # Combine all blocks into a single UnstructuredGrid
        mesh = mesh.combine()

    # Separate internal volume from boundary surfaces
    # Internal mesh: cells with volume data
    internal_mesh = mesh.extract_cells_by_type([
        pv.CellType.HEXAHEDRON, pv.CellType.TETRA, pv.CellType.WEDGE,
        pv.CellType.PYRAMID
    ])

    # Surface mesh: boundary faces
    surfaces_mesh = mesh.extract_surface()

    return internal_mesh, surfaces_mesh
