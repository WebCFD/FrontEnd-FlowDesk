import os
import numpy as np
import pandas as pd
import pyvista as pv
import multiprocessing
import logging
from pathlib import Path

from src.components.tools.populate_template_file import replace_in_file

logger = logging.getLogger(__name__)

# Calculate project root: 4 levels up from this file
# src/components/mesh/cfmesh.py -> src/components/mesh/ -> src/components/ -> src/ -> FLOWDESK_OF/
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def create_surfaceFeatureExtractDict(template_path, sim_path, stl_filename):
    """Create surfaceFeatureExtractDict for cfMesh (same as snappyHexMesh)"""
    input_path = os.path.join(template_path, "system", "surfaceFeatureExtractDict") 
    output_path = os.path.join(sim_path, "system", "surfaceFeatureExtractDict") 
    str_replace_dict = dict()
    str_replace_dict["$STL_FILENAME"] = stl_filename
    replace_in_file(input_path, output_path, str_replace_dict)


def calculate_adaptive_cell_size(geo_mesh):
    """
    Calculate base cell size for cfMesh using volume-based adaptive scaling.

    Algorithm:
      base_cell_size = REF_CELL * (volume / REF_VOLUME)^(1/3)

    The cube-root scaling keeps the BULK cell count approximately constant
    across all room sizes: N_cells = V / cell³ = V / (C·V^(1/3))³ = const.
    The extra computational cost for large rooms comes exclusively from the
    fixed-size local refinement zones (vents, doors, furniture) — exactly
    where the physics demands it.

    Reference calibration:
      REF_VOLUME = 200 m³  (≈ 5×13×3 m typical office)
      REF_CELL   = 0.10 m  → ~300k bulk cells for that reference

    Limits:
      - Minimum: 0.10 m    (never go below reference quality)
      - Maximum: height/10  (at least 10 cells vertically — physical floor)

    Coarsening scale factor (smooth transition via _coarsening_alpha):
      - Small rooms  (V ≤ 1500 m³): ×1.00  (original quality)
      - Large rooms  (V ≥ 5000 m³): ×1.20  (20% coarser bulk for speed)
      - In between: linear interpolation
    """
    bounds = geo_mesh.bounds
    x_range = bounds[1] - bounds[0]
    y_range = bounds[3] - bounds[2]
    z_range = bounds[5] - bounds[4]
    volume  = x_range * y_range * z_range

    # --- Calibration constants ---
    REF_VOLUME = 200.0   # m³  — reference room
    REF_CELL   = 0.10    # m   — cell size at reference volume

    # --- Smooth scale factor: 1.0 (small) → 1.20 (large) ---
    alpha        = _coarsening_alpha(volume)
    scale_factor = 1.0 + 0.20 * alpha

    # --- Continuous cube-root formula with smooth scale ---
    volume_ratio  = volume / REF_VOLUME
    raw_cell_size = REF_CELL * (volume_ratio ** (1.0 / 3.0)) * scale_factor

    # --- Physical limits ---
    min_cell_size = REF_CELL            # never coarser than reference
    max_cell_size = z_range / 10.0      # at least 10 cells across height

    base_cell_size = max(min_cell_size, min(raw_cell_size, max_cell_size))

    # --- Room size category for human-readable logging ---
    if volume <= 500:
        category = "SMALL   (≤500 m³)"
    elif volume <= 3_000:
        category = "MEDIUM  (500–3k m³)"
    elif volume <= 20_000:
        category = "LARGE   (3k–20k m³)"
    else:
        category = "MEGA    (>20k m³)"

    logger.info(f"    * Geometry bounds : X={x_range:.2f}m  Y={y_range:.2f}m  Z={z_range:.2f}m")
    logger.info(f"    * Volume          : {volume:.1f} m³  →  category: {category}")
    logger.info(f"    * Coarsening alpha: {alpha:.3f}  (scale={scale_factor:.3f})")
    logger.info(f"    * Raw cell size   : {raw_cell_size:.4f}m  (before limits)")
    logger.info(f"    * Limits applied  : min={min_cell_size:.3f}m  max(H/10)={max_cell_size:.3f}m")
    logger.info(f"    * Adaptive base cell size : {base_cell_size:.4f}m")
    logger.info(f"    * Est. bulk cells (bbox)  : ~{volume / base_cell_size**3:.0f}")

    return base_cell_size


def validate_geometry(geo_mesh, geo_df):
    """Validate geometry before meshing."""
    if geo_mesh.n_cells == 0:
        raise ValueError("Geometry mesh is empty - no cells to mesh")
    if len(geo_df) == 0:
        raise ValueError("No boundary conditions defined")
    logger.info(f"✓ Geometry validation passed: {geo_mesh.n_cells} cells, {len(geo_df)} boundary conditions")


# =============================================================================
# ABSOLUTE local-refinement sizes — physically calibrated, independent of
# room dimensions.  These ensure adequate resolution of jets, boundary layers
# and furniture geometry no matter how large the room is.
# cfMesh transitions automatically between these fine zones and the coarse
# bulk via its octree refinement.
# =============================================================================
_ABS = {
    # (cellSize [m], refinementThickness [m])
    # Values match the original relative formula evaluated at base_cell_size = 0.1 m
    # (the reference cell size for small rooms).  They are now frozen as absolute
    # constants so that feature resolution does NOT degrade as the room grows.
    "vent":    (0.025,   0.050),  # base/4,  base/2   — ~72 cells across 1.8 m vent
    "window":  (0.025,   0.050),  # base/4,  base/2
    "door":    (0.025,   0.050),  # base/4,  base/2
    "person":  (0.00625, 0.0125), # base/16, base/8   — fine body boundary layer
    "block":   (0.025,   0.100),  # base/4,  base
    "table":   (0.0125,  0.100),  # base/8,  base
    "chair":   (0.005,   0.0125), # base/20, base/8   — finest geometry
    "stairs":  (0.025,   0.400),  # base/4,  4×base
    "other":   (0.0125,  0.00625),# base/8,  base/16
}

# =============================================================================
# SMOOTH COARSENING TRANSITION
# For small/medium rooms the mesh behaves as the original (fine boundary,
# no extra scale).  For large rooms the bulk and boundary coarsen smoothly.
#
#   V < V_START  → alpha = 0  →  scale=1.00, boundary_ratio=0.50 (original)
#   V > V_END    → alpha = 1  →  scale=1.20, boundary_ratio=0.67 (coarser)
#   in between   → linear interpolation
# =============================================================================
_TRANSITION_V_START = 1500.0   # m³ — transition starts here
_TRANSITION_V_END   = 5000.0   # m³ — fully in large-room regime above this


def _coarsening_alpha(volume):
    """Return 0 for small rooms, 1 for large rooms, interpolated in between."""
    raw = (volume - _TRANSITION_V_START) / (_TRANSITION_V_END - _TRANSITION_V_START)
    return max(0.0, min(1.0, raw))


# Target number of cells per vent/door/window face.
# sqrt(area / N_CELLS_PER_PATCH) gives the cell size that places ~N cells
# on the face, which equals ~sqrt(N) cells across each linear dimension.
# N=400 → ~20 cells across a 1.8m vent (90mm cells) or a 3.52m vent (180mm).
_N_CELLS_PER_PATCH = 400

# Maximum allowed octree level gap between local refinement and the bulk.
# Keeping this ≤ 4 prevents exponential cell counts in large rooms where
# the bulk cell (~1m) and the vent cell (~0.025m) would otherwise span
# 5+ octree levels, creating tens of millions of transition cells.
# For small rooms the abs limit (_ABS) is finer → this cap has no effect.
_MAX_LEVELS_FROM_BULK = 4


def _apply_level_cap(cell_size, thickness, base_cell_size):
    """
    Enforce a maximum octree level gap between local and bulk cell sizes.

    min_from_bulk = base_cell_size / 2^_MAX_LEVELS_FROM_BULK
    cell_size     = max(abs_cell_size, min_from_bulk)
    thickness     = max(abs_thickness, 2 × cell_size)   [always ≥ 2 cells thick]

    Examples (MAX_LEVELS=4):
      bulk=0.10m (small room) → min=0.0063m < 0.025m abs → unchanged ✓
      bulk=1.00m (Promart)    → min=0.0625m > 0.025m abs → cap=0.0625m
    """
    min_from_bulk     = base_cell_size / (2 ** _MAX_LEVELS_FROM_BULK)
    capped_cell_size  = max(cell_size, min_from_bulk)
    capped_thickness  = max(thickness, 2.0 * capped_cell_size)
    return capped_cell_size, capped_thickness


def _area_cell_size(patch_id, abs_floor, abs_thickness, base_cell_size, area_map):
    """
    Compute area-adaptive cell size for a single patch.

    Formula:  cell_size = max(abs_floor, sqrt(patch_area / N_CELLS_PER_PATCH))

    The area formula ensures ~sqrt(N_CELLS_PER_PATCH) cells across each
    linear dimension of the patch, regardless of its physical size.
    - N=400 → ~20 cells across a 1.8m vent (90mm cells) and
               ~20 cells across a 3.52m vent (180mm cells).

    Constraints applied in order:
      1. abs_floor   — never finer than the physical minimum (e.g. 25mm for vents)
      2. max → bulk  — never coarser than the bulk (must still refine!)
      3. _apply_level_cap — raises to bulk/2^MAX_LEVELS if area formula is too fine

    Returns (cell_size, thickness).
    """
    if area_map and patch_id in area_map:
        area          = area_map[patch_id]
        area_cs       = np.sqrt(area / _N_CELLS_PER_PATCH)
        cell_size     = max(abs_floor, area_cs)          # 1. physical floor
        cell_size     = min(cell_size, base_cell_size * 0.95)  # 2. always finer than bulk
    else:
        cell_size = abs_floor

    cell_size, thickness = _apply_level_cap(cell_size, abs_thickness, base_cell_size)
    return cell_size, thickness


def generate_local_refinement_block(geo_df, base_cell_size, area_map=None):
    """
    Generate localRefinement block for critical patches and furniture.

    Cell sizes are computed per-patch using the area-adaptive formula
    (see _area_cell_size) when area_map is provided, or fall back to the
    absolute calibration in _ABS otherwise.  In both cases the level cap
    ensures no more than _MAX_LEVELS_FROM_BULK octree levels from the bulk,
    preventing OOM kills in large rooms.

    area_map  : dict {patch_id → surface_area_m2}, computed from geo_mesh_dict
                in prepare_cfmesh().  If None, uses absolute _ABS sizes.
    """
    blocks = []

    # ------------------------------------------------------------------
    # 1. Critical surface patches: vent / window / door
    # ------------------------------------------------------------------
    # cfMesh regex matching is case-sensitive; detect actual capitalisation
    # from geo_df so the meshDict wildcard always matches the STL patch names.
    import re as _re
    critical_patterns = ["vent", "window", "door"]

    for pattern in critical_patterns:
        all_matching = geo_df[geo_df["id"].str.contains(pattern, case=False, na=False)]
        if len(all_matching) == 0:
            continue

        # --- Exclude CLOSED vents (type="wall") from flow refinement ---
        # Closed vents are solid walls that require no flow resolution.
        # MORE IMPORTANTLY: closed ceiling/floor vents sit co-planar with their
        # parent surface (same Z coordinate). cfMesh's proximity refinement detects
        # two surfaces at the same location and over-refines to minCellSize,
        # creating 1mm cells on a 0.5×0.5m vent → 212k faces per vent → OOM.
        open_matching  = all_matching[all_matching["type"] != "wall"]
        closed_patches = all_matching[all_matching["type"] == "wall"]

        if len(closed_patches) > 0:
            logger.info(
                f"    * {pattern}: excluding {len(closed_patches)} CLOSED (wall) patches "
                f"from localRefinement → {[str(p) for p in closed_patches['id'].tolist()]}"
            )

        if len(open_matching) == 0:
            continue

        abs_floor, abs_thickness = _ABS[pattern]

        # When area_map is available, each patch gets its own size →
        # always use EXPLICIT names (no wildcard), regardless of closed/open mix.
        use_explicit = (area_map is not None) or (len(closed_patches) > 0)

        if use_explicit:
            log_mode = "AREA-ADAPTIVE per patch" if area_map else "EXPLICIT names — closed vents excluded"
            logger.info(
                f"    * {pattern} ({len(open_matching)} open patches)  [{log_mode}]"
            )
            for pid in open_matching["id"]:
                cs, th = _area_cell_size(
                    str(pid), abs_floor, abs_thickness, base_cell_size, area_map
                )
                if cs >= base_cell_size:
                    logger.info(f"      → {pid}: skipped (cs={cs:.4f}m ≥ bulk={base_cell_size:.4f}m)")
                    continue
                area_info = ""
                if area_map and str(pid) in area_map:
                    area_info = f"  area={area_map[str(pid)]:.3f}m²"
                logger.info(f"      → {pid}: cellSize={cs:.4f}m  thickness={th:.4f}m{area_info}")
                blocks.append(
                    f"    {pid}\n"
                    f"    {{\n"
                    f"        cellSize {cs:.6f};\n"
                    f"        refinementThickness {th:.6f};\n"
                    f"    }}"
                )
        else:
            # All vents are open, no area_map → safe to use wildcard
            cs, th = _apply_level_cap(abs_floor, abs_thickness, base_cell_size)
            if cs >= base_cell_size:
                logger.info(f"    * {pattern}.* : skipped (cs={cs:.4f}m ≥ bulk)")
                continue
            first_id = str(open_matching.iloc[0]["id"])
            m = _re.match(r'^([A-Za-z]+)', first_id)
            actual_prefix = m.group(1) if m else pattern
            cfmesh_pattern = f"{actual_prefix}.*"
            logger.info(
                f"    * {cfmesh_pattern} ({len(open_matching)} patches) : "
                f"cellSize={cs:.4f}m  thickness={th:.4f}m  [wildcard]"
            )
            blocks.append(
                f'    "{cfmesh_pattern}"\n'
                f"    {{\n"
                f"        cellSize {cs:.6f};\n"
                f"        refinementThickness {th:.6f};\n"
                f"    }}"
            )

    # ------------------------------------------------------------------
    # 2. Furniture / objects  (explicit names — cfMesh has no wildcards)
    # ------------------------------------------------------------------
    object_patches = geo_df[geo_df["id"].str.startswith("object_", na=False)]
    if len(object_patches) > 0:
        logger.info(f"    * 3D Objects: {len(object_patches)} patches — absolute refinement sizes")

        obj_types = {
            "person": [], "block": [], "table": [],
            "chair": [], "stairs": [], "other": [],
        }
        for patch_id in object_patches["id"]:
            pl = patch_id.lower()
            if "person" in pl:
                obj_types["person"].append(patch_id)
            elif "block" in pl:
                obj_types["block"].append(patch_id)
            elif "mesa" in pl or "table" in pl:
                obj_types["table"].append(patch_id)
            elif "silla" in pl or "chair" in pl:
                obj_types["chair"].append(patch_id)
            elif "stair" in pl:
                obj_types["stairs"].append(patch_id)
            else:
                obj_types["other"].append(patch_id)

        for obj_type, patch_ids in obj_types.items():
            if not patch_ids:
                continue
            cell_size, thickness = _ABS[obj_type]

            if cell_size >= base_cell_size:
                logger.info(
                    f"      → {obj_type} ({len(patch_ids)}): skipped "
                    f"(abs {cell_size}m ≥ base {base_cell_size:.4f}m)"
                )
                continue

            logger.info(
                f"      → {obj_type} ({len(patch_ids)}): "
                f"cellSize={cell_size}m (ABS)  thickness={thickness}m"
            )
            for patch_id in patch_ids:
                logger.info(f"          - {patch_id}")
                blocks.append(
                    f"    {patch_id}\n"
                    f"    {{\n"
                    f"        cellSize {cell_size:.6f};\n"
                    f"        refinementThickness {thickness:.6f};\n"
                    f"    }}"
                )

    if blocks:
        return (
            "// Refinamiento LOCAL — tamaños ABSOLUTOS, independientes del tamaño de la sala\n"
            "localRefinement\n{\n"
            + "\n    \n".join(blocks)
            + "\n}"
        )
    else:
        return "// No critical patches or furniture objects found for localRefinement"


def generate_boundary_layers_block(geo_df, base_cell_size):
    """
    Generate boundaryLayers block with adaptive first-layer thickness.

    maxFirstLayerThickness is scaled with the bulk cell size to avoid triggering
    cfMesh's automatic boundary-layer subdivision.  For large rooms, a 5mm first
    layer next to a 0.67m bulk cell creates a 134:1 aspect-ratio prism; cfMesh
    auto-splits those prisms, multiplying BL cell count by 2–4× and causing OOM.

    Formula: firstLayer = max(0.005, base_cell_size / 20)
      Small room  (bulk=0.10m): max(0.005, 0.005) = 0.005m  (original, unchanged)
      Promart     (bulk=1.00m): max(0.005, 0.050) = 0.050m  (50mm, no auto-split)
    """
    n_layers        = 3
    thickness_ratio = 1.2
    first_layer     = max(0.005, base_cell_size / 20.0)   # adaptive, floor at 5mm

    result = f"""// Boundary layers — adaptive firstLayerThickness (bulk/20, min 5mm)
// Prevents cfMesh auto-subdivision of extreme-aspect-ratio prism cells in large rooms.
boundaryLayers
{{
    nLayers {n_layers};
    thicknessRatio {thickness_ratio};
    maxFirstLayerThickness {first_layer:.6f};
}}"""

    logger.info(
        f"    * Boundary layers: {n_layers} layers, ratio={thickness_ratio}, "
        f"firstLayer={first_layer*1000:.1f}mm  (bulk/20 = {base_cell_size/20:.4f}m)"
    )
    return result


def create_meshDict(template_path, sim_path, stl_filename, geo_mesh, geo_df,
                    area_map=None):
    """
    Create meshDict for cfMesh cartesianMesh with adaptive cell sizes.

    Cell size strategy
    ------------------
    maxCellSize     : adaptive bulk — cube-root of volume, with smooth scale ×1.0→×1.20
    boundaryCellSize: smooth transition:
                        small rooms  → base × 0.50  (original: base/2)
                        large rooms  → base × 0.67  (coarser for speed)
                        in between   → linear interpolation via _coarsening_alpha
    minCellSize     : adaptive — max(0.005, bulk/16), bounds octree depth
    localRefinement : area-adaptive per-patch sizes (see _area_cell_size, _ABS)
    area_map        : {patch_name → surface_area_m2} from geo_mesh_dict
    """
    input_path = os.path.join(template_path, "system", "meshDict")
    output_path = os.path.join(sim_path, "system", "meshDict")
    validate_geometry(geo_mesh, geo_df)

    # --- Adaptive bulk cell size (volume-based, includes smooth scale factor) ---
    base_cell_size = calculate_adaptive_cell_size(geo_mesh)

    # --- Smooth boundary ratio: 0.50 (small rooms) → 0.67 (large rooms) ---
    bounds = geo_mesh.bounds
    volume = (bounds[1]-bounds[0]) * (bounds[3]-bounds[2]) * (bounds[5]-bounds[4])
    alpha             = _coarsening_alpha(volume)
    boundary_ratio    = 0.50 + 0.17 * alpha          # 0.50 → 0.67
    boundary_cell_size = max(base_cell_size * boundary_ratio, 0.10)

    # --- Global minimum: adaptive — never more than _MAX_LEVELS_FROM_BULK below bulk ---
    abs_min_cell_size     = 0.005
    capped_min_cell_size  = base_cell_size / (2 ** _MAX_LEVELS_FROM_BULK)
    min_cell_size         = max(abs_min_cell_size, capped_min_cell_size)

    # Also cap minCellSize to the smallest actual localRefinement cellSize so
    # cfMesh doesn't build octree levels no patch actually needs.
    if area_map:
        finest_patch_size = min_cell_size   # will tighten in generate_local_refinement_block
        # Approximate: sqrt(min_area / N_CELLS), floored at abs minimum
        open_mask = geo_df["type"] != "wall"
        open_areas = [area_map[pid] for pid in geo_df[open_mask]["id"] if pid in area_map]
        if open_areas:
            min_open_area = min(open_areas)
            area_cs       = np.sqrt(min_open_area / _N_CELLS_PER_PATCH)
            finest_patch_size = max(0.005, min(area_cs, base_cell_size * 0.95))
            finest_patch_size, _ = _apply_level_cap(finest_patch_size, 0.0, base_cell_size)
        min_cell_size = min(min_cell_size, finest_patch_size)
        min_cell_size = max(min_cell_size, 0.005)

    # --- Generate dynamic blocks ---
    local_refinement = generate_local_refinement_block(geo_df, base_cell_size, area_map)
    boundary_layers  = generate_boundary_layers_block(geo_df, base_cell_size)

    # --- FMS filename ---
    fms_filename = stl_filename.replace(".stl", ".fms")

    str_replace_dict = {
        "$FMS_FILENAME":       fms_filename,
        "$MAX_CELL_SIZE":      f"{base_cell_size:.6f}",
        "$BOUNDARY_CELL_SIZE": f"{boundary_cell_size:.6f}",
        "$MIN_CELL_SIZE":      f"{min_cell_size:.6f}",
        "$LOCAL_REFINEMENT":   local_refinement,
        "$BOUNDARY_LAYERS":    boundary_layers,
    }

    logger.info(
        f"    * meshDict cell sizes → "
        f"max(bulk)={base_cell_size:.4f}m  "
        f"boundary={boundary_cell_size:.4f}m  "
        f"min(abs)={min_cell_size}m"
    )
    replace_in_file(input_path, output_path, str_replace_dict)


def create_emesh_file(geo_mesh_dict, sim_path, stl_filename):
    """Create .eMesh file for cfMesh to properly identify patches."""
    emesh_filename = stl_filename.replace(".stl", ".eMesh")
    emesh_path = os.path.join(sim_path, "constant", "triSurface", emesh_filename)
    with open(emesh_path, 'w') as f:
        f.write("/*--------------------------------*- C++ -*----------------------------------*\\\n")
        f.write("| =========                 |                                                 |\n")
        f.write("| \\\\      /  F ield         | cfMesh: A library for mesh generation          |\n")
        f.write("|  \\\\    /   O peration     |                                                 |\n")
        f.write("|   \\\\  /    A nd           | Author: Franjo Juretic                          |\n")
        f.write("|    \\\\/     M anipulation  | E-mail: franjo.juretic@c-fields.com            |\n")
        f.write("\\*---------------------------------------------------------------------------*/\n")
        f.write("FoamFile\n")
        f.write("{\n")
        f.write("    version   2.0;\n")
        f.write("    format    ascii;\n")
        f.write("    class     edgeMesh;\n")
        f.write("    location  \"constant/triSurface\";\n")
        f.write(f"    object    {emesh_filename};\n")
        f.write("}\n")
        f.write("// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //\n")
        f.write("\n")
        patch_idx = 0
        for patch_name, mesh in geo_mesh_dict.items():
            f.write(f"// Patch {patch_idx}: {patch_name}\n")
            f.write(f"// Faces: {mesh.n_cells}\n")
            patch_idx += 1
        f.write("\n")
    logger.info(f"    * Created eMesh file: {emesh_path}")
    return emesh_filename


def export_to_fms(geo_mesh_dict, sim_path, fms_filename):
    """Export geometry to STL format for cfMesh."""
    stl_filename = fms_filename.replace(".fms", ".stl")
    stl_path = os.path.join(sim_path, "constant", "triSurface", stl_filename)
    os.makedirs(os.path.dirname(stl_path), exist_ok=True)
    
    def write_facet(f, normal, points):
        f.write(f"  facet normal {normal[0]:.6e} {normal[1]:.6e} {normal[2]:.6e}\n")
        f.write("    outer loop\n")
        for pt in points:
            f.write(f"      vertex {pt[0]:.6e} {pt[1]:.6e} {pt[2]:.6e}\n")
        f.write("    endloop\n")
        f.write("  endfacet\n")
    
    with open(stl_path, 'w') as f:
        for solid_name, mesh in geo_mesh_dict.items():
            f.write(f"solid {solid_name}\n")
            mesh = mesh.triangulate()
            # Fix inconsistent winding order:
            # 0. extract_surface() converts UnstructuredGrid → PolyData (required
            #    for clean() and compute_normals(), which only exist on PolyData).
            # 1. clean() merges duplicate vertices so triangles share edges,
            #    allowing VTK to propagate a consistent orientation.
            # 2. compute_normals(consistent_normals=True, auto_orient_normals=True)
            #    reorders cell vertices so all normals point outward (into the
            #    fluid domain). Without this, PyVista's per-patch cell extraction
            #    can produce CW and CCW triangles on the same face, which causes
            #    cfMesh's quadric fitting to fail at shared corners with
            #    contradictory normals.
            mesh = mesh.extract_surface()  # UnstructuredGrid → PolyData if needed
            mesh = mesh.clean()
            mesh = mesh.compute_normals(
                consistent_normals=True,
                auto_orient_normals=True,
                flip_normals=False,
                cell_normals=True,
                point_normals=False,
            )
            # After extract_surface() the mesh is always PolyData.
            # PyVista ≥ 0.45 uses .faces on PolyData (same flat [3,i,j,k,...] format),
            # while UnstructuredGrid uses .cells — pick the right one.
            _cells_arr = mesh.faces if isinstance(mesh, pv.PolyData) else mesh.cells
            faces = _cells_arr.reshape((-1, 4))
            skipped = 0
            for face in faces:
                assert face[0] == 3
                pts = mesh.points[face[1:4]]
                v1 = pts[1] - pts[0]
                v2 = pts[2] - pts[0]
                normal = np.cross(v1, v2)
                norm = np.linalg.norm(normal)
                if norm < 1e-12:
                    skipped += 1
                    continue
                normal /= norm
                write_facet(f, normal, pts)
            if skipped:
                logger.warning(f"[STL export] Skipped {skipped} zero-area triangle(s) in solid '{solid_name}'")
            f.write(f"endsolid {solid_name}\n")
    
    return stl_filename


def split_polydata_by_cell_data(mesh: pv.PolyData, df: pd.DataFrame) -> dict:
    """Split mesh by patch ID for multi-solid export"""
    patch_names = df[["id"]].to_dict()
    patch_mesh_dict = {}
    for patch_id, patch_name in patch_names['id'].items():
        mask = mesh.cell_data["patch_id"] == patch_id
        submesh = mesh.extract_cells(mask)
        patch_mesh_dict[patch_name] = submesh
    return patch_mesh_dict


def get_parallel_options():
    """Get parallel execution options for cfMesh.
    
    Always uses serial meshing for stability and compatibility.
    Serial mode is more reliable and avoids parallel execution issues.
    """
    logger.info("    * Using SERIAL meshing mode (most stable and reliable)")
    return ""


def prepare_cfmesh(geo_mesh, sim_path, geo_df, fms_filename="geometry.fms"):
    """Prepare cfMesh configuration and scripts for mesh generation."""
    logger.info(f"    * Preparing cfMesh configuration for {geo_mesh.n_cells} geometry cells")
    logger.info("    * Implementing regular prism boundary layers with uniform thickness")
    
    logger.info("    * Splitting geometry mesh by boundary condition patches")
    geo_mesh_dict = split_polydata_by_cell_data(geo_mesh, geo_df)
    logger.info(f"    * Split into {len(geo_mesh_dict)} patch meshes")
    
    logger.info(f"    * Exporting geometry to STL format: {fms_filename}")
    stl_filename = export_to_fms(geo_mesh_dict, sim_path, fms_filename)

    # ------------------------------------------------------------------
    # Compute patch surface areas from the actual geometry (before export).
    # area_map {patch_name → m²} is used by create_meshDict to size each
    # vent/door/window cell proportionally to its physical face area.
    # extract_surface() handles both PolyData and UnstructuredGrid inputs.
    # ------------------------------------------------------------------
    logger.info("    * Computing patch surface areas for adaptive localRefinement")
    area_map = {}
    for patch_name, pmesh in geo_mesh_dict.items():
        try:
            surf = pmesh.extract_surface() if hasattr(pmesh, "extract_surface") else pmesh
            area_map[patch_name] = float(surf.area)
        except Exception as exc:
            logger.warning(f"      ⚠ Could not compute area for '{patch_name}': {exc}")
    logger.info(f"      → {len(area_map)} patch areas computed "
                f"(total = {sum(area_map.values()):.1f} m²)")

    # Use PROJECT_ROOT for robust path resolution (independent of execution directory)
    template_path = str(PROJECT_ROOT / "data" / "settings" / "mesh" / "cfmesh")
    logger.info(f"    * Creating cfMesh configuration files from template: {template_path}")

    logger.info("    * Creating meshDict with optimized settings")
    create_meshDict(template_path, sim_path, stl_filename, geo_mesh, geo_df, area_map=area_map)
    
    expected_patches = geo_df["id"].tolist()
    expected_patches_str = ", ".join(expected_patches)
    
    pressure_patches = geo_df[geo_df['type'].isin(['pressure_inlet', 'pressure_outlet'])]
    wall_patches = geo_df[geo_df['type'] == 'wall']
    logger.info(f"    * Pressure boundaries ({len(pressure_patches)}): 8 layers, 2x fine refinement")
    logger.info(f"    * Wall boundaries ({len(wall_patches)}): 6 layers, 1.5x fine refinement")
    
    parallel_opts = get_parallel_options()
    
    # Generate FMS filename
    fms_file = stl_filename.replace(".stl", ".fms")
    
    script_commands = [
        '#!/bin/sh',
        'cd "${0%/*}" || exit',
        '. ${WM_PROJECT_DIR:?}/bin/tools/RunFunctions',
        'echo "==================== GENERATING FMS WITH FEATURE EDGES ===================="',
        f'runApplication surfaceFeatureEdges -angle 10 constant/triSurface/{stl_filename} constant/triSurface/{fms_file}',
        'echo "==================== EXPORTING FEATURE EDGES TO VTK ===================="',
        f'echo "Using FMSToSurface to export feature edges for ParaView visualization..."',
        f'FMSToSurface constant/triSurface/{fms_file} constant/triSurface/edges_temp.vtk -exportFeatureEdges',
        f'if [ -f "constant/triSurface/edges_temp_featureEdges.vtk" ]; then',
        f'    mv constant/triSurface/edges_temp_featureEdges.vtk constant/triSurface/geometry_edges.vtk',
        f'    echo "✓ Feature edges exported to: constant/triSurface/geometry_edges.vtk"',
        f'else',
        f'    echo "⚠ Warning: Feature edges export may have failed"',
        f'fi',
        'echo "==================== RUNNING CFMESH CARTESIAN MESHER ===================="',
        'echo "cfMesh configuration:"',
        'echo "  - Adaptive base cell size from geometry"',
        'echo "  - Pressure boundaries: 2x fine refinement, 8 regular prism layers"',
        'echo "  - Wall boundaries: 1.5x fine refinement, 6 regular prism layers"',
        'echo "  - Boundary layer optimization: enabled"',
        'echo "  - Geometry constraint enforcement: enabled"',
        'echo ""',
        f'runApplication cartesianMesh {parallel_opts}',
        'echo "==================== DETECTING MESH LOCATION ===================="',
        'if [ -d "constant/polyMesh" ]; then',
        '    MESH_LOCATION="constant"',
        '    echo "✓ Mesh found in SERIAL location: constant/polyMesh"',
        'elif [ -d "processor0/constant/polyMesh" ]; then',
        '    MESH_LOCATION="processor0/constant"',
        '    echo "✓ Mesh found in PARALLEL location: processor0/constant/polyMesh"',
        'else',
        '    echo "✗ ERROR: Mesh not found in constant/polyMesh or processor0/constant/polyMesh"',
        '    exit 1',
        'fi',
        'runApplication checkMesh',
        'echo "==================== COPYING MESH TO STANDARD LOCATION ===================="',
        'if [ "$MESH_LOCATION" != "constant" ]; then',
        '    echo "Copying mesh from $MESH_LOCATION/polyMesh to constant/polyMesh"',
        '    rm -rf constant/polyMesh',
        '    cp -r $MESH_LOCATION/polyMesh constant/',
        'fi',
        'touch results.foam',
    ]
    
    logger.info("    * cfMesh preparation completed successfully")
    logger.info(f"    * Expected patches: {expected_patches}")
    logger.info("    * cfMesh will generate robust boundary layers automatically")
    logger.info("    * Pressure boundaries will have 2x finer resolution than walls")
    return script_commands
