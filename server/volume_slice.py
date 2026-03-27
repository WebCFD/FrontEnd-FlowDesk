#!/usr/bin/env python3
"""
volume_slice.py - Extract a cutting plane from volume_internal.vtk using PyVista.
Usage: python3 volume_slice.py <vtk_file> <axis> <position>
  axis: x, y, or z
  position: float position along the axis (meters)
Output: ASCII POLYDATA written to stdout (planar slice with all CFD fields).
"""
import sys
import os
import tempfile

EMPTY_VTK = (
    "# vtk DataFile Version 2.0\n"
    "Volume Slice Result\n"
    "ASCII\n"
    "DATASET POLYDATA\n"
    "POINTS 0 float\n"
)


def main():
    if len(sys.argv) < 4:
        print("Usage: volume_slice.py <vtk_file> <axis> <position>", file=sys.stderr)
        sys.stdout.write(EMPTY_VTK)
        sys.exit(0)

    vtk_file = sys.argv[1]
    axis = sys.argv[2].lower()

    try:
        position = float(sys.argv[3])
    except ValueError:
        print(f"Invalid position: {sys.argv[3]}", file=sys.stderr)
        sys.stdout.write(EMPTY_VTK)
        sys.exit(0)

    if axis not in ('x', 'y', 'z'):
        print(f"Invalid axis '{axis}'. Must be x, y, or z", file=sys.stderr)
        sys.stdout.write(EMPTY_VTK)
        sys.exit(0)

    if not os.path.isfile(vtk_file):
        print(f"File not found: {vtk_file}", file=sys.stderr)
        sys.stdout.write(EMPTY_VTK)
        sys.exit(0)

    try:
        import pyvista as pv

        print(f"[volume_slice] Reading: {vtk_file}", file=sys.stderr)
        mesh = pv.read(vtk_file)

        bounds = mesh.bounds
        cx = (bounds[0] + bounds[1]) / 2
        cy = (bounds[2] + bounds[3]) / 2
        cz = (bounds[4] + bounds[5]) / 2

        if axis == 'x':
            normal = [1, 0, 0]
            origin = [position, cy, cz]
        elif axis == 'y':
            normal = [0, 1, 0]
            origin = [cx, position, cz]
        else:
            normal = [0, 0, 1]
            origin = [cx, cy, position]

        print(f"[volume_slice] Slicing at {axis}={position}, normal={normal}, origin={origin}", file=sys.stderr)

        try:
            sliced = mesh.slice(normal=normal, origin=origin)
        except Exception as e:
            print(f"[volume_slice] slice() failed: {e}", file=sys.stderr)
            sys.stdout.write(EMPTY_VTK)
            return

        if sliced is None or sliced.n_points == 0:
            print(f"[volume_slice] No slice geometry at {axis}={position}", file=sys.stderr)
            sys.stdout.write(EMPTY_VTK)
            return

        print(f"[volume_slice] Slice: n_points={sliced.n_points}, n_cells={sliced.n_cells}", file=sys.stderr)

        # Interpolate cell-centred fields (U, p, T …) to point positions so
        # that the frontend glyph mapper (which reads POINT_DATA) can use them.
        # This also gives smoother colour gradients on the cut surface.
        sliced = sliced.cell_data_to_point_data()
        print(f"[volume_slice] After cell→point: n_points={sliced.n_points}, arrays={list(sliced.point_data.keys())}", file=sys.stderr)

        # Project velocity to the cut plane by zeroing the normal component.
        # This ensures vector arrows lie flat in the plane and are visible from
        # any camera angle. Without this, arrows in e.g. a Z-cut point mostly
        # downward (supply air) and appear as invisible dots head-on.
        if 'U' in sliced.point_data:
            import numpy as np
            normal_idx = {'x': 0, 'y': 1, 'z': 2}[axis]
            u = sliced.point_data['U'].copy()
            u[:, normal_idx] = 0.0
            sliced.point_data['U'] = u
            print(f"[volume_slice] Projected U to cut plane (zeroed component {normal_idx})", file=sys.stderr)

        fd, tmp_path = tempfile.mkstemp(suffix=".vtk")
        os.close(fd)
        try:
            sliced.save(tmp_path, binary=False)
            with open(tmp_path, "r") as f:
                sys.stdout.write(f.read())
            print(f"[volume_slice] Done", file=sys.stderr)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except Exception as e:
        print(f"[volume_slice] Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.stdout.write(EMPTY_VTK)


if __name__ == "__main__":
    main()
