#!/usr/bin/env python3
"""
volume_surface.py - Extract the outer surface from volume_internal.vtk using PyVista.
Usage: python3 volume_surface.py <vtk_file>
Output: ASCII POLYDATA written to stdout (outer surface with CFD field values).
"""
import sys
import os
import tempfile

EMPTY_VTK = (
    "# vtk DataFile Version 2.0\n"
    "Volume Surface Result\n"
    "ASCII\n"
    "DATASET POLYDATA\n"
    "POINTS 0 float\n"
)


def main():
    if len(sys.argv) < 2:
        print("Usage: volume_surface.py <vtk_file>", file=sys.stderr)
        sys.stdout.write(EMPTY_VTK)
        sys.exit(0)

    vtk_file = sys.argv[1]

    if not os.path.isfile(vtk_file):
        print(f"File not found: {vtk_file}", file=sys.stderr)
        sys.stdout.write(EMPTY_VTK)
        sys.exit(0)

    try:
        import pyvista as pv

        print(f"[volume_surface] Reading: {vtk_file}", file=sys.stderr)
        mesh = pv.read(vtk_file)
        print(f"[volume_surface] Mesh type: {type(mesh).__name__}, n_points={mesh.n_points}, n_cells={mesh.n_cells}", file=sys.stderr)

        surface = mesh.extract_surface()
        print(f"[volume_surface] Surface: n_points={surface.n_points}, n_cells={surface.n_cells}", file=sys.stderr)

        if surface is None or surface.n_points == 0:
            print("[volume_surface] Surface extraction returned empty mesh", file=sys.stderr)
            sys.stdout.write(EMPTY_VTK)
            return

        fd, tmp_path = tempfile.mkstemp(suffix=".vtk")
        os.close(fd)
        try:
            surface.save(tmp_path, binary=False)
            with open(tmp_path, "r") as f:
                sys.stdout.write(f.read())
            print(f"[volume_surface] Done — wrote ASCII surface", file=sys.stderr)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except Exception as e:
        print(f"[volume_surface] Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.stdout.write(EMPTY_VTK)


if __name__ == "__main__":
    main()
