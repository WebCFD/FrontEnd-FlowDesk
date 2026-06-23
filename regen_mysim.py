#!/usr/bin/env python
"""Regenerate MySim geometry with the boolean-cleanup fix and report surface quality."""
import sys, json, logging
sys.path.insert(0, "PYTHON_STEPS")
sys.path.insert(0, ".")
logging.basicConfig(level=logging.WARNING)
import numpy as np
import pyvista as pv
from src.components.geo.create_volumes import create_volumes
from src.components.geo.boolean_operations import perform_boolean_operations

cfg = json.load(open("PYTHON_STEPS/cases/MySim/geo/building_config.json"))
valid = sorted(cfg["levels"].keys(), key=lambda x: int(x))
print("levels:", valid)

rooms, furn, bc = create_volumes(cfg, valid)
print(f"rooms={len(rooms)} furniture={len(furn)} bc_rows={len(bc)}")

final = perform_boolean_operations(rooms, furn)
print(f"final mesh: cells={final.n_cells} points={final.n_points}")

m = final.triangulate().extract_surface()
cs = m.compute_cell_sizes(length=False, area=True, volume=False)
A = cs.cell_data.get("Area", cs.cell_data.get("area"))
print("min tri area:", float(A.min()), " #area<1e-9:", int((A < 1e-9).sum()))

tri = m.faces.reshape(-1, 4)[:, 1:]
p = m.points
v0, v1, v2 = p[tri[:, 0]], p[tri[:, 1]], p[tri[:, 2]]
e = np.stack([np.linalg.norm(v1 - v0, axis=1),
              np.linalg.norm(v2 - v1, axis=1),
              np.linalg.norm(v0 - v2, axis=1)], 1)
emax = e.max(1)
hmin = np.divide(2 * A, emax, out=np.zeros_like(A), where=emax > 0)
ar = np.divide(emax, hmin, out=np.full_like(A, np.inf), where=hmin > 0)
print("max aspect ratio:", float(ar.max()), " #AR>1e3:", int((ar > 1e3).sum()))
print("n_open_edges:", m.n_open_edges, " is_manifold:", bool(m.is_manifold))
print("bbox:", m.bounds)

final.save("/tmp/MySim_fixed.vtk")
print("saved /tmp/MySim_fixed.vtk")
print("DONE")
