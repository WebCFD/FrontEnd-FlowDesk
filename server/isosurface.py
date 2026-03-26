#!/usr/bin/env python3
"""
isosurface.py - Extract isosurface contour lines from a VTK file using PyVista.
Usage: python3 isosurface.py <vtk_file> <field_name> <value>
Output: VTK ASCII polydata written to stdout (contour lines).
"""
import sys
import os
import tempfile

EMPTY_VTK = (
    "# vtk DataFile Version 2.0\n"
    "Isosurface Result\n"
    "ASCII\n"
    "DATASET POLYDATA\n"
    "POINTS 0 float\n"
)


def main():
    if len(sys.argv) < 4:
        print("Usage: isosurface.py <vtk_file> <field_name> <value>", file=sys.stderr)
        sys.stdout.write(EMPTY_VTK)
        sys.exit(0)

    vtk_file = sys.argv[1]
    field_name = sys.argv[2]
    try:
        iso_value = float(sys.argv[3])
    except ValueError:
        print(f"Invalid iso value: {sys.argv[3]}", file=sys.stderr)
        sys.stdout.write(EMPTY_VTK)
        sys.exit(0)

    if not os.path.isfile(vtk_file):
        print(f"File not found: {vtk_file}", file=sys.stderr)
        sys.stdout.write(EMPTY_VTK)
        sys.exit(0)

    try:
        import pyvista as pv
        import numpy as np

        mesh = pv.read(vtk_file)

        available_pt = list(mesh.point_data.keys())
        available_cell = list(mesh.cell_data.keys())
        available_all = available_pt + available_cell

        effective_field = field_name

        # Handle T_degC: convert Kelvin field 'T' to Celsius
        if field_name == "T_degC":
            if "T" in mesh.point_data:
                mesh["T_degC"] = mesh.point_data["T"] - 273.15
                effective_field = "T_degC"
            elif "T" in mesh.cell_data:
                mesh["T_degC"] = mesh.cell_data["T"] - 273.15
                effective_field = "T_degC"
            else:
                print("Temperature field 'T' not found in dataset", file=sys.stderr)
                sys.stdout.write(EMPTY_VTK)
                return

        # Handle velocity: U is a 3-component vector; contour on its magnitude
        elif field_name == "U" or field_name == "U_magnitude":
            if "U" in mesh.point_data and mesh.point_data["U"].ndim == 2:
                mag = np.linalg.norm(mesh.point_data["U"], axis=1)
                mesh["_U_mag"] = mag
                effective_field = "_U_mag"
            elif "U" in mesh.cell_data and mesh.cell_data["U"].ndim == 2:
                mag = np.linalg.norm(mesh.cell_data["U"], axis=1)
                mesh["_U_mag_cell"] = mag
                effective_field = "_U_mag_cell"
            else:
                print(f"Velocity field 'U' not found or not 3D vector", file=sys.stderr)
                sys.stdout.write(EMPTY_VTK)
                return

        elif effective_field not in available_all:
            # Case-insensitive fallback
            lower_map = {k.lower(): k for k in available_all}
            if field_name.lower() in lower_map:
                effective_field = lower_map[field_name.lower()]
            else:
                print(
                    f"Field '{field_name}' not found. Available: {available_all}",
                    file=sys.stderr,
                )
                sys.stdout.write(EMPTY_VTK)
                return

        try:
            contour = mesh.contour([iso_value], scalars=effective_field)
        except Exception as e:
            print(f"contour() failed: {e}", file=sys.stderr)
            sys.stdout.write(EMPTY_VTK)
            return

        if contour is None or contour.n_points == 0:
            print(
                f"No contour found at value {iso_value} for field '{effective_field}'",
                file=sys.stderr,
            )
            sys.stdout.write(EMPTY_VTK)
            return

        # Save to temp file and print to stdout
        tmp_path = tempfile.mktemp(suffix=".vtk")
        try:
            contour.save(tmp_path, binary=False)
            with open(tmp_path, "r") as f:
                sys.stdout.write(f.read())
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except Exception as e:
        print(f"Isosurface extraction error: {e}", file=sys.stderr)
        sys.stdout.write(EMPTY_VTK)


if __name__ == "__main__":
    main()
