#!/usr/bin/env python3
"""
Surface STL quality analyzer (sliver / degenerate-triangle detector).

Reads a multi-solid STL and reports, PER SOLID (= per OpenFOAM patch):
  - triangle count
  - min triangle area
  - max aspect ratio (longest edge / triangle height)
  - number of degenerate triangles (area < SLIVER_MIN_AREA)
  - vertices that sit at a suspicious near-zero / negative Z (sub-mm offset)

Usage:
    python3 analyze_mesh_quality.py [path/to/geometry.stl] > /tmp/mesh_report.txt 2>&1

The report is printed to stdout; redirect to a file and read it back.
"""
import sys
import numpy as np

SLIVER_MIN_AREA = 1e-9   # m²  — same threshold as the pipeline fix
AR_WARN         = 1e3    # aspect ratio above this is suspicious
Z_SUSPECT_LOW   = 1e-3   # |z| below this near the floor is "near zero"


def parse_ascii_stl_by_solid(path):
    """Return {solid_name: np.ndarray (n_tris, 3, 3)} for an ASCII STL."""
    solids = {}
    name = None
    verts = []
    cur = []
    with open(path, "r", errors="ignore") as f:
        for line in f:
            s = line.strip()
            if s.startswith("solid "):
                name = s[6:].strip() or "unnamed"
                verts = []
            elif s.startswith("endsolid"):
                if name is not None:
                    solids[name] = np.array(verts, dtype=float).reshape(-1, 3, 3) if verts else np.zeros((0, 3, 3))
                name = None
            elif s.startswith("vertex"):
                parts = s.split()
                cur.append([float(parts[1]), float(parts[2]), float(parts[3])])
                if len(cur) == 3:
                    verts.append(cur)
                    cur = []
    return solids


def tri_metrics(tris):
    """Return (areas, aspect_ratios) for an array of triangles (n,3,3)."""
    if len(tris) == 0:
        return np.array([]), np.array([])
    v0, v1, v2 = tris[:, 0], tris[:, 1], tris[:, 2]
    e0 = np.linalg.norm(v1 - v0, axis=1)
    e1 = np.linalg.norm(v2 - v1, axis=1)
    e2 = np.linalg.norm(v0 - v2, axis=1)
    cross = np.cross(v1 - v0, v2 - v0)
    area = 0.5 * np.linalg.norm(cross, axis=1)
    emax = np.maximum(np.maximum(e0, e1), e2)
    hmin = np.divide(2 * area, emax, out=np.zeros_like(area), where=emax > 0)
    ar = np.divide(emax, hmin, out=np.full_like(area, np.inf), where=hmin > 0)
    return area, ar


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "PYTHON_STEPS/cases/MySim/sim/geometry.stl"
    print(f"=== STL QUALITY REPORT ===")
    print(f"file: {path}\n")

    # Detect ASCII vs binary
    with open(path, "rb") as f:
        head = f.read(5)
    is_ascii = head == b"solid"

    if not is_ascii:
        print("Binary STL detected — falling back to pyvista (single solid, no patch split).")
        import pyvista as pv
        m = pv.read(path).triangulate()
        tris = m.points[m.faces.reshape(-1, 4)[:, 1:]]
        solids = {"<binary single solid>": tris}
    else:
        solids = parse_ascii_stl_by_solid(path)

    print(f"solids (patches): {len(solids)}\n")

    # Global bbox
    allpts = []
    for tris in solids.values():
        if len(tris):
            allpts.append(tris.reshape(-1, 3))
    if allpts:
        allpts = np.vstack(allpts)
        print(f"global bbox min: {allpts.min(0)}")
        print(f"global bbox max: {allpts.max(0)}")
        zmin = allpts[:, 2].min()
        print(f"global z_min: {zmin:.8f}")
        print()

    header = f"{'patch':<34}{'tris':>8}{'minArea':>12}{'maxAR':>12}{'slivers':>9}{'zSuspect':>10}"
    print(header)
    print("-" * len(header))

    flagged = []
    for name, tris in sorted(solids.items()):
        area, ar = tri_metrics(tris)
        n = len(tris)
        if n == 0:
            print(f"{name:<34}{0:>8}{'-':>12}{'-':>12}{'-':>9}{'-':>10}")
            continue
        min_area = area.min()
        max_ar = ar.max()
        n_sliver = int((area < SLIVER_MIN_AREA).sum())
        # vertices near z=0 with negative or sub-mm offset
        zc = tris.reshape(-1, 3)[:, 2]
        n_zsus = int(((zc < Z_SUSPECT_LOW) & (zc > -1.0)).sum() if False else (np.abs(zc) < Z_SUSPECT_LOW).sum())
        # only count strictly-negative or clearly-offset as suspect
        n_zneg = int((zc < -1e-9).sum())
        mark = ""
        if n_sliver > 0 or max_ar > AR_WARN or min_area < SLIVER_MIN_AREA:
            mark = "  <-- FLAG"
            flagged.append(name)
        print(f"{name:<34}{n:>8}{min_area:>12.3e}{max_ar:>12.3e}{n_sliver:>9}{n_zneg:>10}{mark}")

    print()
    if flagged:
        print(f"FLAGGED PATCHES ({len(flagged)}): {flagged}")
    else:
        print("No surface slivers detected — degeneracy is introduced during volume meshing (cfMesh).")

    # Detail dump for flagged patches: worst triangles + their Z
    for name in flagged:
        tris = solids[name]
        area, ar = tri_metrics(tris)
        order = np.argsort(ar)[-5:]
        print(f"\n--- worst triangles in '{name}' ---")
        for i in order:
            c = tris[i].mean(0)
            print(f"  AR={ar[i]:.3e} area={area[i]:.3e} centroid=({c[0]:.4f},{c[1]:.4f},{c[2]:.6f})  "
                  f"zspan=[{tris[i][:,2].min():.6f},{tris[i][:,2].max():.6f}]")


if __name__ == "__main__":
    main()
