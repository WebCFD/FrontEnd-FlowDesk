import os
import logging
import pyvista as pv


def load_foam_results(sim_path: str):
    """
    Load OpenFOAM results and separate internal volume from surfaces.

    Returns:
        tuple: (internal_mesh, surfaces_mesh)
    """
    logger = logging.getLogger(__name__)
    
    foam_path = os.path.join(sim_path, "results.foam")
    
    # Check if results.foam exists
    if not os.path.exists(foam_path):
        raise FileNotFoundError(f"results.foam not found at: {foam_path}")
    
    logger.info(f"    * Loading results from: {foam_path}")
    logger.info(f"    * sim_path contents: {os.listdir(sim_path)[:20]}...")  # First 20 files
    
    # Log encoding info for debugging
    import sys
    import locale
    logger.info(f"    * ENCODING CHECK in load_foam_results:")
    logger.info(f"      - sys.getdefaultencoding(): {sys.getdefaultencoding()}")
    logger.info(f"      - locale.getpreferredencoding(): {locale.getpreferredencoding(False)}")
    
    try:
        reader = pv.get_reader(foam_path)
        logger.info(f"    * Reader created successfully")
        
        # Check if time values exist
        if not hasattr(reader, 'time_values') or len(reader.time_values) == 0:
            logger.warning(f"    * No time values found, using default read")
            mesh = reader.read()
        else:
            logger.info(f"    * Available time values: {reader.time_values}")
            reader.set_active_time_value(reader.time_values[-1])
            logger.info(f"    * Set active time to: {reader.time_values[-1]}")
            # Read complete mesh
            mesh = reader.read()
        
        logger.info(f"    * Mesh loaded successfully")

        # Handle MultiBlock mesh (multiple regions or patches)
        if isinstance(mesh, pv.MultiBlock):
            logger.info(f"    * MultiBlock detected, combining blocks")
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

        logger.info(f"    * Extraction complete - internal cells: {internal_mesh.n_cells}, surface cells: {surfaces_mesh.n_cells}")
        
        return internal_mesh, surfaces_mesh
    
    except UnicodeDecodeError as e:
        # Specific handling for encoding errors - log detailed info
        logger.error(f"    * UNICODE DECODE ERROR:")
        logger.error(f"      - encoding: {e.encoding}")
        logger.error(f"      - reason: {e.reason}")
        logger.error(f"      - position: {e.start}-{e.end}")
        logger.error(f"      - problematic bytes: {repr(e.object[max(0,e.start-10):e.end+10])}")
        logger.error(f"      - sim_path: {sim_path}")
        # List files in sim_path that might contain the issue
        for subdir in ['constant', 'system', '0']:
            subpath = os.path.join(sim_path, subdir)
            if os.path.exists(subpath):
                logger.error(f"      - {subdir}/ contents: {os.listdir(subpath)[:10]}")
        import traceback
        logger.error(f"    * Full traceback: {traceback.format_exc()}")
        raise
    except Exception as e:
        logger.error(f"    * ERROR loading results: {str(e)}")
        import traceback
        logger.error(f"    * Traceback: {traceback.format_exc()}")
        raise
