"""
volume_threshold.py: Server-side volumetric threshold on volume_internal.vtk.

Usage:
  python3 volume_threshold.py <vtk_path> <field_name> <lo> <hi>

Reads the internalMesh UnstructuredGrid, applies PyVista threshold([lo, hi], scalars=field),
and writes the filtered POLYDATA as ASCII VTK to stdout.
"""
import sys
import os
import pyvista as pv
import numpy as np
import tempfile

def main():
    if len(sys.argv) != 5:
        print("Usage: volume_threshold.py <vtk_path> <field> <lo> <hi>", file=sys.stderr)
        sys.exit(1)

    vtk_path = sys.argv[1]
    field = sys.argv[2]
    lo = float(sys.argv[3])
    hi = float(sys.argv[4])

    print(f"[volume_threshold] Reading: {vtk_path}", file=sys.stderr)
    mesh = pv.read(vtk_path)
    print(f"[volume_threshold] Mesh type: {type(mesh).__name__}, n_points={mesh.n_points}, n_cells={mesh.n_cells}", file=sys.stderr)

    # Resolve the scalar array
    available = list(mesh.point_data.keys()) + list(mesh.cell_data.keys())
    print(f"[volume_threshold] Available arrays: {available}", file=sys.stderr)

    active_field = field
    if field not in available:
        # Try case-insensitive match
        match = next((k for k in available if k.lower() == field.lower()), None)
        if match:
            active_field = match
        else:
            print(f"[volume_threshold] Field '{field}' not found. Available: {available}", file=sys.stderr)
            # Return empty polydata
            empty = pv.PolyData()
            _write_empty(empty)
            return

    # Ensure the scalar is set as the active scalar on the mesh
    # For vector fields (e.g. U), threshold on magnitude
    is_cell = active_field in mesh.cell_data
    if is_cell:
        arr = mesh.cell_data[active_field]
    else:
        arr = mesh.point_data[active_field]

    if arr.ndim == 2:
        # Vector field — compute magnitude and add as a new array
        mag = np.linalg.norm(arr, axis=1)
        mag_name = f"{active_field}_mag"
        if is_cell:
            mesh.cell_data[mag_name] = mag
        else:
            mesh.point_data[mag_name] = mag
        active_field = mag_name
        print(f"[volume_threshold] Vector field — using magnitude as '{mag_name}'", file=sys.stderr)

    print(f"[volume_threshold] Thresholding field '{active_field}' in [{lo}, {hi}]", file=sys.stderr)

    try:
        result = mesh.threshold(value=[lo, hi], scalars=active_field)
    except Exception as e:
        print(f"[volume_threshold] threshold() failed: {e}", file=sys.stderr)
        _write_empty(pv.PolyData())
        return

    print(f"[volume_threshold] After threshold: n_points={result.n_points}, n_cells={result.n_cells}", file=sys.stderr)

    if result.n_points == 0:
        print("[volume_threshold] Empty result (no cells in range)", file=sys.stderr)
        _write_empty(pv.PolyData())
        return

    # Extract surface so VTK viewer can render it as POLYDATA
    surface = result.extract_surface()
    print(f"[volume_threshold] Surface: n_points={surface.n_points}, n_cells={surface.n_cells}", file=sys.stderr)

    # Write ASCII VTK to stdout via temp file
    tmp = tempfile.NamedTemporaryFile(suffix=".vtk", delete=False)
    tmp.close()
    try:
        surface.save(tmp.name, binary=False)
        with open(tmp.name, "r") as f:
            sys.stdout.write(f.read())
        print("[volume_threshold] Done", file=sys.stderr)
    finally:
        os.unlink(tmp.name)


def _write_empty(poly):
    import tempfile, os
    tmp = tempfile.NamedTemporaryFile(suffix=".vtk", delete=False)
    tmp.close()
    try:
        poly.save(tmp.name, binary=False)
        with open(tmp.name, "r") as f:
            sys.stdout.write(f.read())
    finally:
        os.unlink(tmp.name)


if __name__ == "__main__":
    main()
