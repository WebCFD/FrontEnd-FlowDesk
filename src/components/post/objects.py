import os
import logging
import numpy as np
import pyvista as pv

from src.components.tools.export_debug import load_foam_results


# Visualization settings per variable
VAR_SETTINGS = {
    "T_degC":  {"clim": (15, 30), "cmap": "plasma",    "label": "Temperature [°C]"},
    "PMV":     {"clim": (-3, 3),  "cmap": "coolwarm",  "label": "PMV"},
    "PPD":     {"clim": (0, 100), "cmap": "inferno_r", "label": "PPD [%]"},
    "U_mag":   {"clim": None,     "cmap": "turbo",     "label": "Velocity Magnitude [m/s]"},
    "age":     {"clim": None,     "cmap": "magma",     "label": "Age of Air [s]"},
}


def post_objects(sim_path, post_path):
    """
    Generate 3D slices and images for key CFD fields (temperature, PMV, velocity, etc.).
    """
    logger = logging.getLogger(__name__)
    logger.info(f"    * Generating post-processing objects from: {sim_path}")

    # Load CFD results
    internal_mesh, surfaces_mesh = load_foam_results(sim_path)

    logger.info(
        f"    * Loaded mesh with {internal_mesh.n_cells:,} internal cells "
        f"and {surfaces_mesh.GetNumberOfCells():,} surface cells"
    )

    # Ensure temperature in °C
    if "T" in internal_mesh.point_data:
        internal_mesh.point_data["T_degC"] = internal_mesh.point_data["T"] - 273.15
        del internal_mesh.point_data["T"]

    # Add velocity magnitude if U exists
    if "U" in internal_mesh.point_data and "U_mag" not in internal_mesh.point_data:
        U = internal_mesh.point_data["U"]
        internal_mesh.point_data["U_mag"] = np.linalg.norm(U, axis=1)

    # Output directories
    obj_dir = os.path.join(post_path, "obj")
    img_dir = os.path.join(post_path, "images")
    os.makedirs(obj_dir, exist_ok=True)
    os.makedirs(img_dir, exist_ok=True)

    # Slice configuration
    bounds = internal_mesh.bounds
    z_values = np.linspace(bounds[4] + 0.1, bounds[5] - 0.1, 10)
    logger.info(f"    * Creating {len(z_values)} slices along Z-axis")

    # Camera configuration
    center = [(bounds[0] + bounds[1]) / 2,
              (bounds[2] + bounds[3]) / 2,
              (bounds[4] + bounds[5]) / 2]
    dx, dy, dz = (bounds[1] - bounds[0],
                  bounds[3] - bounds[2],
                  bounds[5] - bounds[4])
    distance_range = 1.9

    # Loop over variables of interest
    for var_name, settings in VAR_SETTINGS.items():
        if var_name not in internal_mesh.point_data:
            logger.debug(f"    * Skipping {var_name} (not in dataset)")
            continue

        scalars = internal_mesh.point_data[var_name]

        # Use robust auto range if not predefined
        clim = settings["clim"]
        if clim is None:
            vmin, vmax = np.nanpercentile(scalars, [2, 98])
            clim = (vmin, vmax)

        logger.info(f"    * Visualizing variable: {var_name} ({settings['label']})")

        for i, z in enumerate(z_values, start=1):
            logger.info(f"       - Slice {i}/{len(z_values)} at z={z:.3f}")

            # Create slice 
            with pv.vtk_verbosity('off'):
                slice_mesh = internal_mesh.slice(normal="z", origin=(0, 0, z))

            # Save slice mesh
            vtk_path = os.path.join(obj_dir, f"{var_name}_slice_{i:02d}.vtk")
            slice_mesh.save(vtk_path)

            # Save rendered image
            img_path = os.path.join(img_dir, f"{var_name}_slice_{i:02d}.png")

            plotter = pv.Plotter(off_screen=True, lighting="three lights")
            plotter.set_background("white")

            # Add transparent walls
            plotter.add_mesh(
                surfaces_mesh,
                color="lightgrey",
                opacity=0.25,
                smooth_shading=True,
            )

            # Add slice with colorbar
            plotter.add_mesh(
                slice_mesh,
                scalars=var_name,
                cmap=settings["cmap"],
                clim=clim,
                show_scalar_bar=True,
                scalar_bar_args={
                    "title": settings["label"],
                    "vertical": True,
                    "label_font_size": 12,
                    "title_font_size": 14,
                    "position_x": 0.88,
                    "position_y": 0.2,
                    "height": 0.6,
                    "width": 0.08,
                },
                smooth_shading=True,
            )

            # Camera view
            plotter.camera_position = [
                (center[0] + dx * distance_range,
                 center[1] + dy * distance_range,
                 center[2] + dz * distance_range),
                center,
                (0, 0, 1),
            ]

            plotter.show(screenshot=img_path)
            plotter.close()

    # Save complete internal mesh for interactive visualization in web viewer
    logger.info("    * Saving complete internal mesh for web viewer")
    internal_mesh_path = os.path.join(obj_dir, "internal_mesh_complete.vtu")
    internal_mesh.save(internal_mesh_path)
    logger.info(f"    * Saved complete internal mesh: {internal_mesh_path}")
    
    logger.info("    * Post-processing objects generation completed successfully")
    return internal_mesh
