#!/usr/bin/env python3
"""
Locate which furniture object(s) produced the degenerate volume cells.

Strategy:
  1. Read OpenFOAM polyMesh (points, faces, owner) and the `zeroVolumeCells`
     (+ badCells) cellSet to get the XYZ centroid of every degenerate cell.
  2. Read building_config.json, compute each furniture object's bounding box
     (with a small tolerance) plus the wall planes / floor / ceiling.
  3. For each degenerate-cell centroid, report which object bbox(es) contain it
     and how close it is to each wall/floor/ceiling plane.
  4. Also independently report geometric OVERLAPS between object bboxes and
     between objects and the wall planes (coplanar/buried faces).

Output: /tmp/bad_cells_report.txt
"""
import json
import re
import numpy as np
from collections import Counter

CASE = "PYTHON_STEPS/cases/MySim"
SIM = f"{CASE}/sim"
TOL = 0.02  # 2 cm tolerance for "near/overlap"


def read_points(path):
    txt = open(path).read()
    # find the big "(" ... ")" vector list
    m = re.search(r"\(\s*\n?(.*)\n?\)\s*$", txt, re.S)
    nums = re.findall(r"\(([^()]+)\)", txt)
    pts = np.array([[float(x) for x in n.split()] for n in nums], dtype=float)
    return pts


def read_labels_list(path):
    """Read an OpenFOAM list of labels or faces; return list of int-lists."""
    txt = open(path).read()
    body = txt[txt.index("("):]
    # faces look like "3(1 2 3)" or "4(...)"; labelLists look like "(\n12\n34\n)"
    faces = re.findall(r"\d+\(([^()]+)\)", body)
    if faces:
        return [[int(x) for x in f.split()] for f in faces]
    # plain label list
    nums = re.findall(r"^\s*(\d+)\s*$", body, re.M)
    return [[int(n)] for n in nums]


def read_cellset(path):
    txt = open(path).read()
    body = txt[txt.index("("):]
    return [int(x) for x in re.findall(r"\b(\d+)\b", body)]


def main():
    out = open("/tmp/bad_cells_report.txt", "w")
    def P(*a):
        print(*a); print(*a, file=out)

    pm = f"{SIM}/constant/polyMesh"
    P("Reading polyMesh ...")
    points = read_points(f"{pm}/points")
    faces = read_labels_list(f"{pm}/faces")
    owner = [c[0] for c in read_labels_list(f"{pm}/owner")]
    P(f"  points={len(points)} faces={len(faces)} owner={len(owner)}")

    # cell -> list of face indices (via owner)
    n_cells = max(owner) + 1
    cell_faces = {}
    for fi, c in enumerate(owner):
        cell_faces.setdefault(c, []).append(fi)

    def cell_centroid(c):
        vids = set()
        for fi in cell_faces.get(c, []):
            vids.update(faces[fi])
        if not vids:
            return None
        return points[list(vids)].mean(0)

    bad = set()
    for name in ("zeroVolumeCells", "badCells", "highAspectRatioCells"):
        p = f"{pm}/sets/{name}"
        try:
            ids = read_cellset(p)
            bad.update(ids)
            P(f"  cellSet {name}: {len(ids)} cells")
        except Exception as e:
            P(f"  cellSet {name}: MISSING ({e})")

    centroids = []
    for c in sorted(bad):
        cc = cell_centroid(c)
        if cc is not None:
            centroids.append(cc)
    centroids = np.array(centroids) if centroids else np.zeros((0, 3))
    P(f"\nDegenerate-cell centroids resolved: {len(centroids)}")
    if len(centroids):
        P(f"  centroid bbox min: {centroids.min(0)}")
        P(f"  centroid bbox max: {centroids.max(0)}")

    # ---- building_config objects ----
    cfg = json.load(open(f"{CASE}/geo/building_config.json"))
    lvl = cfg["levels"]["0"]
    walls = lvl["walls"]
    height = lvl["height"]

    # wall segments (2D) for proximity
    wall_segs = []
    for w in walls:
        wall_segs.append((w["id"], np.array([w["start"]["x"], w["start"]["y"]]),
                          np.array([w["end"]["x"], w["end"]["y"]])))

    def obj_bbox(o):
        """Return (id, min_xyz, max_xyz) for a furniture object, or None."""
        oid = o.get("id", "?")
        if "faces" in o:
            verts = []
            for fd in o["faces"].values():
                verts.extend(fd["vertices"])
            v = np.array(verts, float)
            return oid, v.min(0), v.max(0)
        if "position" in o and "dimensions" in o:
            p = o["position"]; d = o["dimensions"]
            c = np.array([p["x"], p["y"], p.get("z", 0)])
            half = np.array([d.get("width", 0), d.get("depth", 0), d.get("height", 0)]) / 2
            # position.z is usually the base; approximate bbox
            lo = np.array([c[0] - half[0], c[1] - half[1], p.get("z", 0)])
            hi = np.array([c[0] + half[0], c[1] + half[1], p.get("z", 0) + d.get("height", 0)])
            return oid, lo, hi
        return None

    objs = []
    for o in lvl["furniture"]:
        bb = obj_bbox(o)
        if bb:
            objs.append(bb)
    P(f"\nFurniture objects with bbox: {len(objs)}")

    # ---- assign each degenerate centroid to nearest/containing object ----
    hit = Counter()
    near_wall = Counter()
    for cc in centroids:
        for oid, lo, hi in objs:
            if (lo[0]-TOL <= cc[0] <= hi[0]+TOL and
                lo[1]-TOL <= cc[1] <= hi[1]+TOL and
                lo[2]-TOL <= cc[2] <= hi[2]+TOL):
                hit[oid] += 1
        # near a wall segment?
        for wid, a, b in wall_segs:
            ab = b - a; t = np.clip(np.dot(cc[:2]-a, ab)/(np.dot(ab,ab)+1e-12), 0, 1)
            d = np.linalg.norm(a + t*ab - cc[:2])
            if d < TOL:
                near_wall[wid] += 1
        # near floor/ceiling?
        if abs(cc[2]) < TOL: near_wall["FLOOR"] += 1
        if abs(cc[2]-height) < TOL: near_wall["CEILING"] += 1

    P("\n=== Degenerate cells per OBJECT bbox (TOL=2cm) ===")
    for oid, n in hit.most_common():
        P(f"  {oid:<40} {n}")
    P("\n=== Degenerate cells near WALL/FLOOR/CEILING (TOL=2cm) ===")
    for wid, n in near_wall.most_common():
        P(f"  {wid:<40} {n}")

    # ---- independent geometry overlap check: object vs object, object vs wall plane ----
    P("\n=== Object bbox OVERLAPS (object intersects object) ===")
    overlaps = 0
    for i in range(len(objs)):
        for j in range(i+1, len(objs)):
            id1, lo1, hi1 = objs[i]; id2, lo2, hi2 = objs[j]
            inter = np.minimum(hi1, hi2) - np.maximum(lo1, lo2)
            if np.all(inter > -TOL):  # boxes touch/overlap in all 3 axes
                vol = np.prod(np.clip(inter, 0, None))
                if vol > 1e-6:
                    P(f"  OVERLAP {id1} ∩ {id2}  interVol={vol:.4f} m³")
                    overlaps += 1
    if not overlaps:
        P("  (none)")

    # object faces coplanar with a wall? (object bbox face within TOL of wall line)
    P("\n=== Objects with a face COPLANAR/near a wall (possible buried face) ===")
    flagged = set()
    for oid, lo, hi in objs:
        cx = (lo[0]+hi[0])/2; cy=(lo[1]+hi[1])/2
        for wid, a, b in wall_segs:
            ab=b-a; 
            for corner in [(lo[0],lo[1]),(hi[0],lo[1]),(lo[0],hi[1]),(hi[0],hi[1])]:
                cpt=np.array(corner)
                t=np.clip(np.dot(cpt-a,ab)/(np.dot(ab,ab)+1e-12),0,1)
                d=np.linalg.norm(a+t*ab-cpt)
                if d < TOL:
                    flagged.add((oid,wid))
    for oid,wid in sorted(flagged):
        P(f"  {oid:<40} near wall {wid}")
    if not flagged:
        P("  (none)")

    out.close()


if __name__ == "__main__":
    main()
