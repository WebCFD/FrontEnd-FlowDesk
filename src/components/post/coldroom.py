"""
Industrial Cooling (Cold Room) Post-Processing Module.

Analyzes CFD simulation results for cold room / industrial refrigeration:
- Temperature uniformity analysis at 3 product heights (0.5m, 1.5m, 2.5m)
- Airflow distribution: stagnation zones, high-velocity areas, VUI, ADE
- Energy metrics: ACH (from evaporator mass flow), Q_transmission (wall heat flux)
- T_setpoint inference from JSON evaporator BCs

Standards referenced:
  EN 12830 / HACCP — Cold chain temperature monitoring
  EN 1366 / ASHRAE 62.1 — Ventilation and air distribution
  Typical targets:
    Refrigeration: T_setpoint 0–8°C, TNU < 2°C, stagnation < 15%, ACH 40–60
    Freezing:      T_setpoint –30 to –18°C, TNU < 3°C, stagnation < 15%, ACH 20–40
"""

import os
import json
import glob as _glob
import logging
import numpy as np
from datetime import datetime
from pathlib import Path

from src.components.tools.export_debug import load_foam_results
from src.components.post.objects import generate_surface_3d_vtk, generate_volume_internal_vtk

logger = logging.getLogger(__name__)

# ── Air physical constants ─────────────────────────────────────────────────────
CP_AIR  = 1006.0   # J/(kg·K)
RHO_AIR = 1.293    # kg/m³  (approximate at cold room temperatures)

# ── Stagnation / high-velocity thresholds ─────────────────────────────────────
STAGNATION_THRESHOLD = 0.10   # m/s  — below = dead zone
HIGH_VEL_THRESHOLD   = 2.00   # m/s  — above = dehydration risk for product

# ── Slice heights for cold room analysis ──────────────────────────────────────
SLICE_HEIGHTS = {
    "low":  0.5,   # lower product tier / floor pallet level
    "mid":  1.5,   # mid-rack product level
    "high": 2.5,   # upper product tier / near evaporator
}


# ─────────────────────────────────────────────────────────────────────────────
# JSON PARSING — infer T_setpoint from evaporator BCs
# ─────────────────────────────────────────────────────────────────────────────

def extract_evaporator_info_from_json(json_payload: dict) -> dict:
    """
    Parse the FlowDesk JSON payload and extract evaporator / cold-room metadata.

    Looks for air inlets (evaporators / supply grilles) with a temperature BC.
    Uses the minimum inlet temperature as T_setpoint proxy.

    Returns:
        dict with:
            t_setpoint_inferred  (float) — °C, from lowest inlet BC temp
            room_type            (str)   — 'freezing' | 'refrigeration'
            evaporator_temps     (list)  — all found inlet BC temperatures [°C]
            evaporator_ids       (list)  — object IDs of found evaporators
    """
    inlet_temps = []
    evaporator_ids = []

    levels = json_payload.get("levels", {})
    for level_id, level_data in levels.items():
        # Check walls for air inlets (AirEntry objects stored in walls)
        for wall in level_data.get("walls", []):
            for opening in wall.get("openings", []):
                role = opening.get("role", "")
                if role in ("inlet", "supply", "evaporator"):
                    T = opening.get("temperature", None)
                    if T is not None:
                        try:
                            inlet_temps.append(float(T))
                            evaporator_ids.append(opening.get("id", "unknown"))
                        except (ValueError, TypeError):
                            pass

        # Also check furniture (e.g. evaporator units modeled as objects)
        for obj in level_data.get("furniture", []):
            faces = obj.get("faces", {})
            for face_name, face_data in faces.items():
                role = face_data.get("role", "")
                if role in ("inlet", "supply", "evaporator"):
                    T = face_data.get("temperature", None)
                    if T is not None:
                        try:
                            inlet_temps.append(float(T))
                            evaporator_ids.append(f"{obj.get('id', 'unknown')}_{face_name}")
                        except (ValueError, TypeError):
                            pass

    # Also check top-level airEntries if present
    for entry in json_payload.get("airEntries", []):
        role = entry.get("role", "")
        if role in ("inlet", "supply", "evaporator"):
            T = entry.get("temperature", None)
            if T is not None:
                try:
                    inlet_temps.append(float(T))
                    evaporator_ids.append(entry.get("id", "unknown"))
                except (ValueError, TypeError):
                    pass

    # Collect inlet positions for ADE patch sampling
    evaporator_positions = []
    levels = json_payload.get("levels", {})
    for level_id, level_data in levels.items():
        for wall in level_data.get("walls", []):
            for opening in wall.get("openings", []):
                role = opening.get("role", "")
                if role in ("inlet", "supply", "evaporator"):
                    pos = opening.get("position", None) or opening.get("center", None)
                    if pos is not None:
                        try:
                            evaporator_positions.append([float(pos[0]), float(pos[1]), float(pos[2])])
                        except (TypeError, IndexError, ValueError):
                            pass
        for obj in level_data.get("furniture", []):
            faces = obj.get("faces", {})
            for face_name, face_data in faces.items():
                role = face_data.get("role", "")
                if role in ("inlet", "supply", "evaporator"):
                    pos = face_data.get("position", None) or obj.get("position", None)
                    if pos is not None:
                        try:
                            evaporator_positions.append([float(pos[0]), float(pos[1]), float(pos[2])])
                        except (TypeError, IndexError, ValueError):
                            pass

    for entry in json_payload.get("airEntries", []):
        role = entry.get("role", "")
        if role in ("inlet", "supply", "evaporator"):
            pos = entry.get("position", None) or entry.get("center", None)
            if pos is not None:
                try:
                    evaporator_positions.append([float(pos[0]), float(pos[1]), float(pos[2])])
                except (TypeError, IndexError, ValueError):
                    pass

    if inlet_temps:
        t_setpoint = float(min(inlet_temps))
    else:
        # Fallback: use −18°C (freezing default)
        t_setpoint = -18.0
        logger.warning("    * No inlet BC temperatures found in JSON — defaulting T_setpoint to −18°C")

    room_type = "freezing" if t_setpoint <= -10.0 else "refrigeration"

    logger.info(f"    * Evaporator BCs found: {len(inlet_temps)} inlets, {len(evaporator_positions)} positions")
    logger.info(f"    * T_setpoint inferred: {t_setpoint:.1f}°C → room_type = {room_type}")

    return {
        "t_setpoint_inferred":  t_setpoint,
        "room_type":            room_type,
        "evaporator_temps":     inlet_temps,
        "evaporator_ids":       evaporator_ids,
        "evaporator_positions": evaporator_positions,
    }


# ─────────────────────────────────────────────────────────────────────────────
# HORIZONTAL SLICE ANALYSIS
# ─────────────────────────────────────────────────────────────────────────────

def analyze_coldroom_slices(internal_mesh, post_path: str) -> dict:
    """
    Analyze temperature and velocity at 3 product heights.

    Heights: 0.5m (low), 1.5m (mid), 2.5m (high)

    Per-slice metrics:
        T_mean, T_std, T_min, T_max, T_p95, T_p05
        U_mean, U_max, U_std
        pct_stagnation  — % points with |U| < STAGNATION_THRESHOLD (0.10 m/s)
        pct_high_vel    — % points with |U| > HIGH_VEL_THRESHOLD (2.00 m/s)
        VUI             — Velocity Uniformity Index = 1 - U_std/U_mean

    Returns:
        dict keyed by slice name ("low", "mid", "high")
    """
    slice_results = {}

    vtk_dir = os.path.join(post_path, "vtk")
    os.makedirs(vtk_dir, exist_ok=True)
    os.makedirs(os.path.join(post_path, "images"), exist_ok=True)

    for name, z in SLICE_HEIGHTS.items():
        logger.info(f"    * Cold room slice: {name} (z={z:.1f}m)")
        try:
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                sl = internal_mesh.slice(normal="z", origin=(0, 0, z))
        except Exception:
            sl = internal_mesh.slice(normal="z", origin=(0, 0, z))

        if sl.n_points == 0:
            logger.warning(f"       Slice at z={z}m returned 0 points — writing empty placeholder")
            slice_results[name] = {"height_m": z, "plane_name": name, "empty": True}
            continue

        metrics = {"height_m": z, "plane_name": name}

        # ── Temperature field ────────────────────────────────────────────────
        T_raw = sl.point_data.get("T", None)
        if T_raw is not None and len(T_raw) > 0:
            # Convert K → °C if buoyantSimpleFoam stores in Kelvin
            T_c = T_raw - 273.15 if float(T_raw.mean()) > 100.0 else T_raw.copy()
            metrics["T_mean"] = float(np.mean(T_c))
            metrics["T_std"]  = float(np.std(T_c))
            metrics["T_min"]  = float(np.min(T_c))
            metrics["T_max"]  = float(np.max(T_c))
            metrics["T_p95"]  = float(np.percentile(T_c, 95))
            metrics["T_p05"]  = float(np.percentile(T_c, 5))
            logger.info(
                f"       T: mean={metrics['T_mean']:.1f}°C, "
                f"min={metrics['T_min']:.1f}°C, max={metrics['T_max']:.1f}°C, "
                f"std={metrics['T_std']:.2f}°C"
            )
        else:
            logger.warning(f"       No T field in slice {name}")

        # ── Velocity field ───────────────────────────────────────────────────
        U_raw = sl.point_data.get("U", None)
        if U_raw is not None and len(U_raw) > 0:
            if len(U_raw.shape) > 1:
                U_mag = np.linalg.norm(U_raw, axis=1)
            else:
                U_mag = U_raw.copy()

            U_mean = float(np.mean(U_mag))
            U_std  = float(np.std(U_mag))

            metrics["U_mean"] = U_mean
            metrics["U_max"]  = float(np.max(U_mag))
            metrics["U_std"]  = U_std
            metrics["pct_stagnation"] = float(
                100.0 * (U_mag < STAGNATION_THRESHOLD).sum() / len(U_mag)
            )
            metrics["pct_high_vel"] = float(
                100.0 * (U_mag > HIGH_VEL_THRESHOLD).sum() / len(U_mag)
            )
            # VUI: 1 − U_std/U_mean (clamped to [0, 1])
            if U_mean > 1e-6:
                metrics["VUI"] = float(np.clip(1.0 - U_std / U_mean, 0.0, 1.0))
            else:
                metrics["VUI"] = 0.0

            logger.info(
                f"       U: mean={U_mean:.3f} m/s, max={metrics['U_max']:.3f} m/s, "
                f"stagnation={metrics['pct_stagnation']:.1f}%, "
                f"high_vel={metrics['pct_high_vel']:.1f}%, "
                f"VUI={metrics['VUI']:.3f}"
            )
        else:
            logger.warning(f"       No U field in slice {name}")

        slice_results[name] = metrics

        # Save VTK slice for web viewer
        vtk_path = os.path.join(vtk_dir, f"cr_slice_{name}_{z}m.vtk")
        try:
            sl.save(vtk_path, binary=False)
        except Exception as e:
            logger.warning(f"       Failed to save slice VTK: {e}")

    return slice_results


# ─────────────────────────────────────────────────────────────────────────────
# MASS FLOW & Q_TRANSMISSION FROM postProcessing
# ─────────────────────────────────────────────────────────────────────────────

def read_evaporator_mass_flows(sim_path: str, volume_m3: float) -> dict:
    """
    Read evaporator mass flow from postProcessing/massFlow_* files.

    ACH = total_volumetric_flow [m³/h] / volume [m³]

    Returns:
        dict with: mass_flow_kgs, volumetric_flow_m3s, ACH
    """
    postproc = os.path.join(sim_path, "postProcessing")
    pattern  = os.path.join(postproc, "massFlow_*", "0", "surfaceFieldValue.dat")
    files    = _glob.glob(pattern)

    inlet_flows  = []
    outlet_flows = []

    for filepath in files:
        try:
            patch_name = os.path.basename(
                os.path.dirname(os.path.dirname(filepath))
            ).replace("massFlow_", "")
            data = np.loadtxt(filepath, comments="#")
            if data.ndim == 0 or data.size == 0:
                continue
            phi = float(data[-1, 1]) if data.ndim > 1 else float(data[1])

            if phi > 0:
                inlet_flows.append((patch_name, phi))
            else:
                outlet_flows.append((patch_name, abs(phi)))

            logger.info(f"       massFlow {patch_name}: φ = {phi:.6f} m³/s")
        except Exception as exc:
            logger.warning(f"       Failed to read {filepath}: {exc}")

    total_m3s = sum(v for _, v in inlet_flows) if inlet_flows else \
                sum(v for _, v in outlet_flows)

    mass_flow_kgs = total_m3s * RHO_AIR
    ACH = (total_m3s * 3600.0) / volume_m3 if volume_m3 > 0.1 else 0.0

    logger.info(f"    * Total evaporator flow: {total_m3s:.4f} m³/s = {mass_flow_kgs:.4f} kg/s")
    logger.info(f"    * ACH = {ACH:.1f} h⁻¹  (volume = {volume_m3:.1f} m³)")

    return {
        "mass_flow_kgs":      float(mass_flow_kgs),
        "volumetric_flow_m3s": float(total_m3s),
        "ACH":                float(ACH),
    }


def read_wall_heat_flux(sim_path: str) -> float:
    """
    Read total Q_transmission from postProcessing/wallHeatFlux files.

    Sums heat flux over all wall patches (envelope heat gain).

    Returns:
        Q_transmission_W (float) — total wall heat gain in Watts, or 0.0 if unavailable.
    """
    postproc = os.path.join(sim_path, "postProcessing")
    patterns = [
        os.path.join(postproc, "wallHeatFlux*", "0", "surfaceFieldValue.dat"),
        os.path.join(postproc, "heatFlux*", "0", "surfaceFieldValue.dat"),
        os.path.join(postproc, "wallQ*", "0", "surfaceFieldValue.dat"),
    ]

    total_W = 0.0
    found = False

    for pattern in patterns:
        for filepath in _glob.glob(pattern):
            try:
                data = np.loadtxt(filepath, comments="#")
                if data.ndim == 0 or data.size == 0:
                    continue
                q = float(data[-1, 1]) if data.ndim > 1 else float(data[1])
                total_W += abs(q)
                found = True
                logger.info(f"       wallHeatFlux from {os.path.basename(filepath)}: {q:.1f} W")
            except Exception as exc:
                logger.warning(f"       Failed to read {filepath}: {exc}")

    if not found:
        logger.warning("    * No wallHeatFlux postProcessing files found — Q_transmission = 0")

    logger.info(f"    * Q_transmission total: {total_W:.1f} W")
    return float(total_W)


def estimate_volume_from_mesh(internal_mesh) -> float:
    """
    Estimate cold room volume from bounding box of CFD domain.

    Returns:
        volume estimate in m³
    """
    try:
        bounds = internal_mesh.bounds  # (xmin, xmax, ymin, ymax, zmin, zmax)
        dx = bounds[1] - bounds[0]
        dy = bounds[3] - bounds[2]
        dz = bounds[5] - bounds[4]
        vol = dx * dy * dz
        logger.info(f"    * Domain bounding box: {dx:.1f}m × {dy:.1f}m × {dz:.1f}m = {vol:.1f} m³")
        return float(vol)
    except Exception as exc:
        logger.warning(f"    * Could not estimate volume: {exc}")
        return 1.0


def estimate_ade(internal_mesh, evaporator_info: dict = None) -> dict:
    """
    Estimate Air Distribution Effectiveness (ADE).

    ADE = U_mean in product zone / U_mean near evaporator discharge.

    If evaporator positions are available from the JSON payload (via evaporator_info),
    the discharge velocity is sampled from points near the evaporator patch locations.
    Otherwise falls back to the high-level slice (z = 2.5 m) as a proxy for the
    evaporator discharge zone.

    Args:
        internal_mesh: PyVista combined mesh with velocity field U
        evaporator_info: dict returned by extract_evaporator_info_from_json(), which may
            contain 'evaporator_positions' (list of [x, y, z] or None).

    Returns:
        dict with: ADE, U_mean_discharge, U_mean_product
    """
    evaporator_info = evaporator_info or {}
    evaporator_positions = evaporator_info.get("evaporator_positions", None)

    try:
        # ── Product-zone velocity — mid slice (z = 1.5 m) ────────────────────
        sl_mid = internal_mesh.slice(normal="z", origin=(0, 0, SLICE_HEIGHTS["mid"]))

        def _umean_slice(sl):
            U = sl.point_data.get("U", None)
            if U is None or sl.n_points == 0:
                return None
            mag = np.linalg.norm(U, axis=1) if len(U.shape) > 1 else U.copy()
            return float(np.mean(mag))

        u_product = _umean_slice(sl_mid)

        # ── Discharge velocity — use evaporator patch positions from JSON ─────
        u_discharge = None
        if evaporator_positions and len(evaporator_positions) > 0:
            # Sample U at points near each evaporator position (radius = 0.5 m)
            SAMPLE_RADIUS = 0.5  # m
            all_points = np.array(internal_mesh.points)
            U_all = internal_mesh.point_data.get("U", None)

            if U_all is not None and len(U_all) > 0:
                near_mags = []
                for pos in evaporator_positions:
                    pos_arr = np.array(pos, dtype=float)
                    dists = np.linalg.norm(all_points - pos_arr, axis=1)
                    mask = dists < SAMPLE_RADIUS
                    if mask.sum() > 0:
                        U_near = U_all[mask]
                        mag_near = np.linalg.norm(U_near, axis=1) if len(U_near.shape) > 1 else U_near.copy()
                        near_mags.extend(mag_near.tolist())

                if near_mags:
                    u_discharge = float(np.mean(near_mags))
                    logger.info(
                        f"    * ADE: sampled {len(near_mags)} points near {len(evaporator_positions)} "
                        f"evaporator patch(es) → U_discharge = {u_discharge:.3f} m/s"
                    )

        # Fallback to high slice if patch-based sampling failed
        if u_discharge is None:
            sl_high = internal_mesh.slice(normal="z", origin=(0, 0, SLICE_HEIGHTS["high"]))
            u_discharge = _umean_slice(sl_high)
            logger.info(f"    * ADE: no evaporator positions → using high slice proxy, U_discharge = {u_discharge}")

        if u_product is not None and u_discharge is not None and u_discharge > 1e-6:
            ADE = float(u_product / u_discharge)
        else:
            ADE = None

        logger.info(f"    * ADE: U_product={u_product}, U_discharge={u_discharge}, ADE={ADE}")
        return {
            "ADE":              ADE,
            "U_mean_discharge": float(u_discharge) if u_discharge is not None else None,
            "U_mean_product":   float(u_product) if u_product is not None else None,
        }
    except Exception as exc:
        logger.warning(f"    * ADE estimation failed: {exc}")
        return {"ADE": None, "U_mean_discharge": None, "U_mean_product": None}


# ─────────────────────────────────────────────────────────────────────────────
# HTML REPORT GENERATION
# ─────────────────────────────────────────────────────────────────────────────

_CSS_BASE = """
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                 'Helvetica Neue', Arial, sans-serif;
    background: #f8fafc;
    color: #1e293b;
    line-height: 1.6;
    padding: 20px;
}
.container { max-width: 1200px; margin: 0 auto; }
.header {
    padding: 40px;
    text-align: center;
    border-radius: 12px;
    margin-bottom: 24px;
    color: white;
}
.header h1 { font-size: 2.2em; font-weight: 300; letter-spacing: 1px; margin-bottom: 8px; }
.subtitle { font-size: 0.95em; opacity: 0.85; margin-top: 6px; }
.executive-summary {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 24px;
    margin-bottom: 24px;
}
.executive-summary h2 { color: #334155; margin-bottom: 16px; font-size: 1.2em; }
.kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
}
.kpi-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 20px;
    text-align: center;
}
.kpi-label { font-size: 0.72em; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 8px; }
.kpi-value { font-size: 2em; font-weight: 700; line-height: 1; }
.kpi-note  { font-size: 0.72em; color: #94a3b8; margin-top: 6px; }
.ok     { color: #16a34a; }
.warn   { color: #d97706; }
.danger { color: #dc2626; }
.info   { color: #2563eb; }
.section {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 24px;
    margin-bottom: 20px;
}
.section h2 { color: #334155; margin-bottom: 16px; font-size: 1.1em; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
.metrics-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 12px;
    font-size: 0.88em;
}
.metrics-table th {
    background: #f8fafc;
    text-align: left;
    padding: 10px 12px;
    font-weight: 600;
    color: #475569;
    border-bottom: 2px solid #e2e8f0;
}
.metrics-table td {
    padding: 9px 12px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
}
.metrics-table tr:last-child td { border-bottom: none; }
.metric-value { font-weight: 600; }
.footer {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px 24px;
    margin-top: 24px;
    font-size: 0.82em;
    color: #64748b;
}
.summary-metric {
    display: inline-block;
    padding: 14px 24px;
    margin: 8px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    text-align: center;
}
.summary-metric .label { font-size: 0.8em; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; }
.summary-metric .value { font-size: 2em; font-weight: 700; margin-top: 4px; }
"""


def _color(value, good_threshold, warn_threshold, higher_is_better=True) -> str:
    """Return CSS class based on thresholds."""
    if higher_is_better:
        if value >= good_threshold:
            return "ok"
        if value >= warn_threshold:
            return "warn"
        return "danger"
    else:
        if value <= good_threshold:
            return "ok"
        if value <= warn_threshold:
            return "warn"
        return "danger"


def generate_cr_thermal_report(slice_results: dict, t_setpoint: float,
                                room_type: str, post_path: str,
                                case_name: str = "ColdRoom_Case") -> str:
    """
    Generate HTML thermal uniformity report.
    Report 1: T_mean, T_std, T_min, T_max, T_p95, T_p05 per slice.
    """
    logger.info("    * Generating Cold Room thermal report")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    tnu_target = 2.0 if room_type == "refrigeration" else 3.0
    plane_titles = {
        "low":  f"Low Product Level (z = {SLICE_HEIGHTS['low']} m)",
        "mid":  f"Mid Product Level (z = {SLICE_HEIGHTS['mid']} m)",
        "high": f"High Product Level (z = {SLICE_HEIGHTS['high']} m)",
    }

    # Global TNU (worst case across slices)
    tnu_values = []
    for name, m in slice_results.items():
        if "T_max" in m and "T_min" in m:
            tnu_values.append(m["T_max"] - m["T_min"])
    global_tnu = max(tnu_values) if tnu_values else 0.0

    header_color = "linear-gradient(135deg,#155e75 0%,#0e7490 60%,#0891b2 100%)"
    room_label = "Refrigeration" if room_type == "refrigeration" else "Freezing"

    html = f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Cold Room Thermal Report — {case_name}</title>
<style>{_CSS_BASE}</style></head><body><div class="container">

<div class="header" style="background:{header_color};">
    <h1>Thermal Uniformity Report</h1>
    <div class="subtitle">{case_name} &nbsp;|&nbsp; {room_label} &nbsp;|&nbsp; T_setpoint = {t_setpoint:.1f}°C</div>
    <div class="subtitle">Generated: {timestamp}</div>
</div>

<div class="executive-summary">
    <h2>Executive Summary</h2>
    <div class="summary-metric">
        <div class="label">TNU (worst plane)</div>
        <div class="value {_color(global_tnu, tnu_target, tnu_target*1.5, higher_is_better=False)}">{global_tnu:.2f}°C</div>
        <div style="font-size:0.75em;color:#64748b;margin-top:6px">Target &lt; {tnu_target:.0f}°C</div>
    </div>
    <div class="summary-metric">
        <div class="label">T_setpoint</div>
        <div class="value info">{t_setpoint:.1f}°C</div>
        <div style="font-size:0.75em;color:#64748b;margin-top:6px">Inferred from evaporator BCs</div>
    </div>
    <div class="summary-metric">
        <div class="label">Room Type</div>
        <div class="value info">{room_label}</div>
        <div style="font-size:0.75em;color:#64748b;margin-top:6px">TNU target &lt; {tnu_target:.0f}°C</div>
    </div>
</div>
"""

    for name in ("low", "mid", "high"):
        if name not in slice_results:
            continue
        m = slice_results[name]
        z = m.get("height_m", SLICE_HEIGHTS.get(name, 0))
        T_mean = m.get("T_mean", 0)
        T_std  = m.get("T_std",  0)
        T_min  = m.get("T_min",  0)
        T_max  = m.get("T_max",  0)
        T_p95  = m.get("T_p95",  0)
        T_p05  = m.get("T_p05",  0)
        tnu    = T_max - T_min

        html += f"""
<div class="section">
    <h2>{plane_titles.get(name, name)} — z = {z:.1f} m</h2>
    <table class="metrics-table">
        <tr><th>Metric</th><th>Value</th><th>Target / Reference</th></tr>
        <tr>
            <td>T mean</td>
            <td class="metric-value">{T_mean:.2f} °C</td>
            <td>≈ T_setpoint ({t_setpoint:.1f}°C)</td>
        </tr>
        <tr>
            <td>T standard deviation</td>
            <td class="metric-value">{T_std:.3f} °C</td>
            <td>Lower is more uniform</td>
        </tr>
        <tr>
            <td>T min</td>
            <td class="metric-value">{T_min:.2f} °C</td>
            <td>—</td>
        </tr>
        <tr>
            <td>T max</td>
            <td class="metric-value">{T_max:.2f} °C</td>
            <td>—</td>
        </tr>
        <tr>
            <td>T P95 (95th percentile)</td>
            <td class="metric-value">{T_p95:.2f} °C</td>
            <td>Hot spots indicator</td>
        </tr>
        <tr>
            <td>T P05 (5th percentile)</td>
            <td class="metric-value">{T_p05:.2f} °C</td>
            <td>Cold spots indicator</td>
        </tr>
        <tr>
            <td>TNU (T_max − T_min)</td>
            <td class="metric-value {_color(tnu, tnu_target, tnu_target*1.5, higher_is_better=False)}">{tnu:.2f} °C</td>
            <td>&lt; {tnu_target:.0f}°C ({room_label} target)</td>
        </tr>
    </table>
</div>
"""

    html += f"""
<div class="footer">
    Standard: EN 12830 / HACCP cold chain &nbsp;|&nbsp;
    TNU target: &lt; {tnu_target:.0f}°C ({room_label}) &nbsp;|&nbsp;
    Solver: OpenFOAM buoyantSimpleFoam
</div>
</div></body></html>"""

    html_path = os.path.join(post_path, "cr_thermal_report.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    logger.info(f"    * CR thermal report: {html_path}")
    return html_path


def generate_cr_airflow_report(slice_results: dict, evaporator: dict,
                                post_path: str,
                                case_name: str = "ColdRoom_Case") -> str:
    """
    Generate HTML airflow distribution report.
    Report 2: U_mean, U_max, U_std, stagnation %, high-vel %, VUI, ADE.
    """
    logger.info("    * Generating Cold Room airflow report")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    plane_titles = {
        "low":  f"Low Product Level (z = {SLICE_HEIGHTS['low']} m)",
        "mid":  f"Mid Product Level (z = {SLICE_HEIGHTS['mid']} m)",
        "high": f"High Product Level (z = {SLICE_HEIGHTS['high']} m)",
    }

    global_stagnation = np.mean([
        slice_results[k]["pct_stagnation"]
        for k in ("low", "mid", "high")
        if k in slice_results and "pct_stagnation" in slice_results[k]
    ]) if slice_results else 0.0

    ADE = evaporator.get("ADE", None)
    U_discharge = evaporator.get("U_mean_discharge", None)

    header_color = "linear-gradient(135deg,#1e3a5f 0%,#1e40af 60%,#1d4ed8 100%)"

    html = f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Cold Room Airflow Report — {case_name}</title>
<style>{_CSS_BASE}</style></head><body><div class="container">

<div class="header" style="background:{header_color};">
    <h1>Airflow Distribution Report</h1>
    <div class="subtitle">{case_name}</div>
    <div class="subtitle">Generated: {timestamp}</div>
</div>

<div class="executive-summary">
    <h2>Executive Summary</h2>
    <div class="summary-metric">
        <div class="label">Stagnation (avg)</div>
        <div class="value {_color(global_stagnation, 15, 25, higher_is_better=False)}">{global_stagnation:.1f}%</div>
        <div style="font-size:0.75em;color:#64748b;margin-top:6px">U &lt; {STAGNATION_THRESHOLD} m/s &nbsp;|&nbsp; Target &lt; 15%</div>
    </div>
    <div class="summary-metric">
        <div class="label">ADE</div>
        <div class="value {_color(ADE if ADE is not None else 0, 0.7, 0.4, higher_is_better=True) if ADE is not None else 'info'}">{f'{ADE:.2f}' if ADE is not None else 'N/A'}</div>
        <div style="font-size:0.75em;color:#64748b;margin-top:6px">Air Distribution Effectiveness &nbsp;|&nbsp; Target &gt; 0.7</div>
    </div>
    <div class="summary-metric">
        <div class="label">U_discharge</div>
        <div class="value info">{f'{U_discharge:.2f} m/s' if U_discharge is not None else 'N/A'}</div>
        <div style="font-size:0.75em;color:#64748b;margin-top:6px">Evaporator discharge velocity</div>
    </div>
</div>
"""

    for name in ("low", "mid", "high"):
        if name not in slice_results:
            continue
        m = slice_results[name]
        z = m.get("height_m", SLICE_HEIGHTS.get(name, 0))
        U_mean = m.get("U_mean", 0)
        U_max  = m.get("U_max",  0)
        U_std  = m.get("U_std",  0)
        stag   = m.get("pct_stagnation", 0)
        hv     = m.get("pct_high_vel",   0)
        vui    = m.get("VUI", 0)

        html += f"""
<div class="section">
    <h2>{plane_titles.get(name, name)} — z = {z:.1f} m</h2>
    <table class="metrics-table">
        <tr><th>Metric</th><th>Value</th><th>Target / Reference</th></tr>
        <tr>
            <td>Velocity Mean</td>
            <td class="metric-value">{U_mean:.3f} m/s</td>
            <td>Adequate coverage of product</td>
        </tr>
        <tr>
            <td>Velocity Max</td>
            <td class="metric-value">{U_max:.3f} m/s</td>
            <td>—</td>
        </tr>
        <tr>
            <td>Velocity Std Dev</td>
            <td class="metric-value">{U_std:.3f} m/s</td>
            <td>Lower = more uniform</td>
        </tr>
        <tr>
            <td>Stagnation Area (U &lt; {STAGNATION_THRESHOLD} m/s)</td>
            <td class="metric-value {_color(stag, 15, 25, higher_is_better=False)}">{stag:.1f}%</td>
            <td>&lt; 15% (dead zones risk)</td>
        </tr>
        <tr>
            <td>High Velocity Area (U &gt; {HIGH_VEL_THRESHOLD} m/s)</td>
            <td class="metric-value {_color(hv, 5, 15, higher_is_better=False)}">{hv:.1f}%</td>
            <td>&lt; 5% (dehydration risk)</td>
        </tr>
        <tr>
            <td>VUI — Velocity Uniformity Index</td>
            <td class="metric-value {_color(vui, 0.6, 0.4, higher_is_better=True)}">{vui:.3f}</td>
            <td>1.0 = perfectly uniform &nbsp;|&nbsp; Target &gt; 0.60</td>
        </tr>
    </table>
</div>
"""

    html += """
<div class="footer">
    Stagnation threshold: U &lt; 0.10 m/s &nbsp;|&nbsp;
    High-velocity threshold: U &gt; 2.00 m/s &nbsp;|&nbsp;
    ADE = U_mean(product) / U_mean(evaporator discharge)
</div>
</div></body></html>"""

    html_path = os.path.join(post_path, "cr_airflow_report.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    logger.info(f"    * CR airflow report: {html_path}")
    return html_path


def generate_cr_energy_report(energy: dict, evaporator: dict, room_type: str,
                               post_path: str,
                               case_name: str = "ColdRoom_Case") -> str:
    """
    Generate HTML energy and infiltration report.
    Report 3: ACH, Q_transmission, SEC placeholder, Q_infiltration placeholder.
    """
    logger.info("    * Generating Cold Room energy report")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    ACH            = energy.get("ACH", 0)
    Q_trans        = energy.get("Q_transmission_W", 0)
    volume_m3      = energy.get("volume_m3", 0)
    mass_flow_kgs  = energy.get("mass_flow_kgs", 0)

    ach_target_lo  = 20.0 if room_type == "freezing" else 40.0
    ach_target_hi  = 40.0 if room_type == "freezing" else 60.0
    room_label     = "Refrigeration" if room_type == "refrigeration" else "Freezing"

    header_color = "linear-gradient(135deg,#14532d 0%,#166534 60%,#16a34a 100%)"

    html = f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Cold Room Energy Report — {case_name}</title>
<style>{_CSS_BASE}</style></head><body><div class="container">

<div class="header" style="background:{header_color};">
    <h1>Energy &amp; Infiltration Report</h1>
    <div class="subtitle">{case_name} &nbsp;|&nbsp; {room_label}</div>
    <div class="subtitle">Generated: {timestamp}</div>
</div>

<div class="executive-summary">
    <h2>Executive Summary</h2>
    <div class="summary-metric">
        <div class="label">ACH</div>
        <div class="value {_color(ACH, ach_target_lo, ach_target_lo*0.7, higher_is_better=True)}">{ACH:.1f} h⁻¹</div>
        <div style="font-size:0.75em;color:#64748b;margin-top:6px">Target {ach_target_lo:.0f}–{ach_target_hi:.0f} h⁻¹ ({room_label})</div>
    </div>
    <div class="summary-metric">
        <div class="label">Q_transmission</div>
        <div class="value info">{Q_trans:.0f} W</div>
        <div style="font-size:0.75em;color:#64748b;margin-top:6px">Wall heat gain (from CFD)</div>
    </div>
</div>

<div class="section">
    <h2>Evaporator Flow &amp; Air Changes</h2>
    <table class="metrics-table">
        <tr><th>Metric</th><th>Value</th><th>Target / Reference</th></tr>
        <tr>
            <td>Air Changes per Hour (ACH)</td>
            <td class="metric-value {_color(ACH, ach_target_lo, ach_target_lo*0.7, higher_is_better=True)}">{ACH:.1f} h⁻¹</td>
            <td>{ach_target_lo:.0f}–{ach_target_hi:.0f} h⁻¹ (typical {room_label})</td>
        </tr>
        <tr>
            <td>Evaporator mass flow</td>
            <td class="metric-value">{mass_flow_kgs:.4f} kg/s</td>
            <td>—</td>
        </tr>
        <tr>
            <td>Room volume (bounding box)</td>
            <td class="metric-value">{volume_m3:.1f} m³</td>
            <td>—</td>
        </tr>
    </table>
</div>

<div class="section">
    <h2>Wall Heat Transmission</h2>
    <table class="metrics-table">
        <tr><th>Metric</th><th>Value</th><th>Notes</th></tr>
        <tr>
            <td>Q_transmission (walls + ceiling + floor)</td>
            <td class="metric-value">{Q_trans:.0f} W</td>
            <td>Integrated CFD wall heat flux — direct from solver</td>
        </tr>
        <tr>
            <td>Q_transmission (kW)</td>
            <td class="metric-value">{Q_trans/1000:.2f} kW</td>
            <td>Design load reference</td>
        </tr>
    </table>
</div>

<div class="section">
    <h2>Infiltration &amp; Operating Costs (requires user inputs)</h2>
    <p style="color:#64748b;font-size:0.9em;margin-bottom:16px">
        The following metrics require additional user inputs (COP of refrigeration equipment,
        door dimensions and opening frequency). These can be configured in the
        FlowDesk analysis dashboard to compute Q_infiltration and SEC.
    </p>
    <table class="metrics-table">
        <tr><th>Metric</th><th>Value</th><th>Formula</th></tr>
        <tr>
            <td>Q_infiltration (door losses)</td>
            <td class="metric-value" style="color:#94a3b8;">N/A — configure in dashboard</td>
            <td>Gosney-Olama: f(door dims, ΔT, openings/day)</td>
        </tr>
        <tr>
            <td>SEC — Specific Energy Consumption</td>
            <td class="metric-value" style="color:#94a3b8;">N/A — configure COP in dashboard</td>
            <td>Q_total / (COP × volume_m3) [kWh/m³/year]</td>
        </tr>
    </table>
</div>

<div class="footer">
    ACH from postProcessing/massFlow &nbsp;|&nbsp;
    Q_transmission from postProcessing/wallHeatFlux &nbsp;|&nbsp;
    Reference: EN 1366, ASHRAE 62.1
</div>
</div></body></html>"""

    html_path = os.path.join(post_path, "cr_energy_report.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    logger.info(f"    * CR energy report: {html_path}")
    return html_path


def generate_cr_summary_report(slice_results: dict, energy: dict,
                                t_setpoint: float, room_type: str,
                                post_path: str,
                                case_name: str = "ColdRoom_Case") -> str:
    """
    Generate HTML executive summary (one-pager).
    Report 4: 6 KPIs with traffic-light status.
    """
    logger.info("    * Generating Cold Room executive summary report")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    room_label = "Refrigeration" if room_type == "refrigeration" else "Freezing"
    tnu_target = 2.0 if room_type == "refrigeration" else 3.0
    ach_target_lo = 20.0 if room_type == "freezing" else 40.0
    ach_target_hi = 40.0 if room_type == "freezing" else 60.0

    # ── Compute global KPIs ──────────────────────────────────────────────────
    # Temperature Compliance (% points within [T_setpoint-tnu_target, T_setpoint+tnu_target])
    all_t_means = [m["T_mean"] for m in slice_results.values() if "T_mean" in m]
    all_t_min   = min([m["T_min"] for m in slice_results.values() if "T_min" in m], default=t_setpoint)
    all_t_max   = max([m["T_max"] for m in slice_results.values() if "T_max" in m], default=t_setpoint)
    global_tnu  = all_t_max - all_t_min

    # Approximate compliance: fraction of slices where T_mean is within ±2*tnu_target of setpoint
    compliant_slices = sum(
        1 for t in all_t_means
        if abs(t - t_setpoint) <= tnu_target * 2
    )
    compliance_pct = 100.0 * compliant_slices / len(all_t_means) if all_t_means else 0.0

    avg_stagnation = np.mean([m["pct_stagnation"] for m in slice_results.values() if "pct_stagnation" in m]) if slice_results else 0.0
    avg_high_vel   = np.mean([m["pct_high_vel"] for m in slice_results.values() if "pct_high_vel" in m]) if slice_results else 0.0
    Q_trans        = energy.get("Q_transmission_W", 0)
    ACH            = energy.get("ACH", 0)

    header_color = "linear-gradient(135deg,#1e293b 0%,#334155 60%,#475569 100%)"

    def _badge(val, good, warn, higher_is_better=True, fmt="{:.1f}"):
        cls = _color(val, good, warn, higher_is_better)
        label = {"ok": "✓ Good", "warn": "⚠ Acceptable", "danger": "✗ Issue"}[cls]
        return f'<span class="{cls}">{fmt.format(val)}</span> &nbsp;<small style="color:#94a3b8">{label}</small>'

    html = f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Cold Room Executive Summary — {case_name}</title>
<style>{_CSS_BASE}
.summary-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin: 20px 0;
}}
.summary-card {{
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 20px;
    border-left: 4px solid #e2e8f0;
}}
.summary-card.ok     {{ border-left-color: #16a34a; }}
.summary-card.warn   {{ border-left-color: #d97706; }}
.summary-card.danger {{ border-left-color: #dc2626; }}
.summary-card .sc-label {{ font-size: 0.75em; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 8px; }}
.summary-card .sc-value {{ font-size: 1.8em; font-weight: 700; margin-bottom: 4px; }}
.summary-card .sc-target {{ font-size: 0.78em; color: #94a3b8; }}
</style></head><body><div class="container">

<div class="header" style="background:{header_color};">
    <h1>Cold Room Executive Summary</h1>
    <div class="subtitle">{case_name} &nbsp;|&nbsp; {room_label} &nbsp;|&nbsp; T_setpoint = {t_setpoint:.1f}°C</div>
    <div class="subtitle">Generated: {timestamp} &nbsp;|&nbsp; OpenFOAM CFD Analysis</div>
</div>

<div class="section">
    <h2>Key Performance Indicators</h2>
    <div class="summary-grid">

        <div class="summary-card {_color(compliance_pct, 95, 80, higher_is_better=True)}">
            <div class="sc-label">Temperature Compliance</div>
            <div class="sc-value {_color(compliance_pct, 95, 80, higher_is_better=True)}">{compliance_pct:.0f}%</div>
            <div class="sc-target">Slices within ±{tnu_target*2:.0f}°C of T_setpoint &nbsp;|&nbsp; Target ≥ 95%</div>
        </div>

        <div class="summary-card {_color(global_tnu, tnu_target, tnu_target*1.5, higher_is_better=False)}">
            <div class="sc-label">TNU (global)</div>
            <div class="sc-value {_color(global_tnu, tnu_target, tnu_target*1.5, higher_is_better=False)}">{global_tnu:.2f}°C</div>
            <div class="sc-target">T_max − T_min (domain) &nbsp;|&nbsp; Target &lt; {tnu_target:.0f}°C</div>
        </div>

        <div class="summary-card {_color(avg_stagnation, 15, 25, higher_is_better=False)}">
            <div class="sc-label">Stagnation Area</div>
            <div class="sc-value {_color(avg_stagnation, 15, 25, higher_is_better=False)}">{avg_stagnation:.1f}%</div>
            <div class="sc-target">U &lt; {STAGNATION_THRESHOLD} m/s &nbsp;|&nbsp; Target &lt; 15%</div>
        </div>

        <div class="summary-card {_color(avg_high_vel, 5, 15, higher_is_better=False)}">
            <div class="sc-label">High Velocity Area</div>
            <div class="sc-value {_color(avg_high_vel, 5, 15, higher_is_better=False)}">{avg_high_vel:.1f}%</div>
            <div class="sc-target">U &gt; {HIGH_VEL_THRESHOLD} m/s (dehydration risk) &nbsp;|&nbsp; Target &lt; 5%</div>
        </div>

        <div class="summary-card {_color(ACH, ach_target_lo, ach_target_lo*0.7, higher_is_better=True)}">
            <div class="sc-label">ACH</div>
            <div class="sc-value {_color(ACH, ach_target_lo, ach_target_lo*0.7, higher_is_better=True)}">{ACH:.1f} h⁻¹</div>
            <div class="sc-target">Target {ach_target_lo:.0f}–{ach_target_hi:.0f} h⁻¹ ({room_label})</div>
        </div>

        <div class="summary-card info">
            <div class="sc-label">Q_transmission</div>
            <div class="sc-value info">{Q_trans:.0f} W</div>
            <div class="sc-target">Wall heat gain from CFD &nbsp;|&nbsp; Informational</div>
        </div>

    </div>
</div>

<div class="section">
    <h2>Temperature Distribution by Plane</h2>
    <table class="metrics-table">
        <tr>
            <th>Level</th>
            <th>T mean (°C)</th>
            <th>T std (°C)</th>
            <th>T min (°C)</th>
            <th>T max (°C)</th>
            <th>TNU (°C)</th>
        </tr>
"""
    for name in ("low", "mid", "high"):
        if name not in slice_results:
            continue
        m = slice_results[name]
        z = m.get("height_m", SLICE_HEIGHTS.get(name, 0))
        tnu = m.get("T_max", 0) - m.get("T_min", 0)
        html += f"""        <tr>
            <td>{name.capitalize()} ({z:.1f} m)</td>
            <td class="metric-value">{m.get('T_mean', 0):.2f}</td>
            <td>{m.get('T_std', 0):.3f}</td>
            <td>{m.get('T_min', 0):.2f}</td>
            <td>{m.get('T_max', 0):.2f}</td>
            <td class="metric-value {_color(tnu, tnu_target, tnu_target*1.5, higher_is_better=False)}">{tnu:.2f}</td>
        </tr>
"""

    html += """    </table>
</div>

<div class="footer">
    FlowDesk CFD Platform — Cold Room / Industrial Cooling Analysis &nbsp;|&nbsp;
    Solver: OpenFOAM buoyantSimpleFoam &nbsp;|&nbsp;
    Standards: EN 12830, HACCP, EN 1366
</div>
</div></body></html>"""

    html_path = os.path.join(post_path, "cr_summary_report.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    logger.info(f"    * CR summary report: {html_path}")
    return html_path


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

def run_industrial_cooling(case_name: str, sim_path: str, post_path: str,
                            json_payload: dict = None) -> None:
    """
    Run Industrial Cooling (Cold Room) post-processing pipeline.

    Reads evaporator metadata from the provided json_payload (or falls back to
    geo/building_config.json if not supplied), loads CFD results, computes thermal
    and airflow KPIs, and generates 4 HTML reports + coldroom_metrics.json.

    Args:
        case_name:    Name of the simulation case
        sim_path:     Path to simulation directory (with VTK/)
        post_path:    Path to post-processing output directory
        json_payload: Pre-loaded building_config.json dict (passed by step05).
                      If None, the function loads it from geo/building_config.json.
    """
    logger.info("\n=========== RUNNING INDUSTRIAL COOLING (COLD ROOM) POST-PROCESSING ===========")
    logger.info(f"Simulation path: {sim_path}")
    logger.info(f"Post-processing output: {post_path}")

    os.makedirs(post_path, exist_ok=True)

    # 1 ── Load JSON evaporator metadata ──────────────────────────────────────
    if json_payload is None:
        json_path = os.path.join(sim_path, "..", "geo", "building_config.json")
        if not os.path.isfile(json_path):
            logger.warning(f"    * building_config.json not found at {json_path}")
            logger.warning("    * Proceeding with defaults (T_setpoint = −18°C)")
            json_payload = {}
        else:
            with open(json_path, "r") as f:
                json_payload = json.load(f)
            logger.info(f"\n1 - Loaded JSON config: {json_path}")
    else:
        logger.info("\n1 - Using pre-loaded json_payload from caller")

    logger.info("\n1b - Extracting evaporator info from JSON")
    evap_info = extract_evaporator_info_from_json(json_payload)
    t_setpoint = evap_info["t_setpoint_inferred"]
    room_type  = evap_info["room_type"]

    # 2 ── Load CFD results ───────────────────────────────────────────────────
    logger.info("\n2 - Loading CFD results")
    internal_mesh, surfaces_mesh, multiblock = load_foam_results(sim_path)
    logger.info(f"    * Loaded mesh with {internal_mesh.n_cells:,} cells")

    # 3 ── Estimate room volume ───────────────────────────────────────────────
    logger.info("\n3 - Estimating room volume from CFD domain bounding box")
    volume_m3 = estimate_volume_from_mesh(internal_mesh)

    # 4 ── Mass flow / ACH ───────────────────────────────────────────────────
    logger.info("\n4 - Reading evaporator mass flows (ACH)")
    flow_data = read_evaporator_mass_flows(sim_path, volume_m3)

    # 5 ── Wall heat flux / Q_transmission ───────────────────────────────────
    logger.info("\n5 - Reading wall heat flux (Q_transmission)")
    Q_transmission_W = read_wall_heat_flux(sim_path)

    energy = {
        "ACH":              flow_data["ACH"],
        "mass_flow_kgs":    flow_data["mass_flow_kgs"],
        "volumetric_flow_m3s": flow_data["volumetric_flow_m3s"],
        "Q_transmission_W": Q_transmission_W,
        "volume_m3":        volume_m3,
    }

    # 6 ── Horizontal slice analysis ──────────────────────────────────────────
    logger.info("\n6 - Analyzing horizontal slices at product heights (0.5m, 1.5m, 2.5m)")
    slice_results = analyze_coldroom_slices(internal_mesh, post_path)

    # 7 ── ADE (Air Distribution Effectiveness) ───────────────────────────────
    logger.info("\n7 - Estimating ADE (Air Distribution Effectiveness)")
    evaporator = estimate_ade(internal_mesh, evap_info)

    # 8 ── Generate HTML reports ──────────────────────────────────────────────
    logger.info("\n8 - Generating HTML reports")
    generate_cr_thermal_report(slice_results, t_setpoint, room_type, post_path, case_name)
    generate_cr_airflow_report(slice_results, evaporator, post_path, case_name)
    generate_cr_energy_report(energy, evaporator, room_type, post_path, case_name)
    generate_cr_summary_report(slice_results, energy, t_setpoint, room_type, post_path, case_name)

    # 9 ── Save JSON metrics ──────────────────────────────────────────────────
    def _np_safe(obj):
        if isinstance(obj, dict):
            return {k: _np_safe(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [_np_safe(i) for i in obj]
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        return obj

    metrics_all = {
        "t_setpoint_inferred": t_setpoint,
        "room_type":           room_type,
        "slices":              slice_results,
        "energy":              energy,
        "evaporator":          evaporator,
    }
    metrics_path = os.path.join(post_path, "coldroom_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(_np_safe(metrics_all), f, indent=2)
    logger.info(f"\n    * Saved Cold Room metrics: {os.path.basename(metrics_path)}")

    # 10 ── 3D boundary surface VTK (required by web viewer) ──────────────────
    logger.info("\n10 - Generating 3D boundary surface VTK")
    try:
        surface_3d_path = generate_surface_3d_vtk(sim_path, post_path, preloaded_multiblock=multiblock)
        logger.info(f"    * 3D surface VTK: {surface_3d_path}")
    except Exception as _e:
        logger.error(f"10 - FAILED: generate_surface_3d_vtk raised {type(_e).__name__}: {_e}")

    # 11 ── 3D internal volume VTK (required by web viewer) ───────────────────
    logger.info("\n11 - Generating 3D internal volume VTK")
    try:
        volume_internal_path = generate_volume_internal_vtk(sim_path, post_path, preloaded_multiblock=multiblock)
        logger.info(f"    * 3D volume VTK: {volume_internal_path}")
    except Exception as _e:
        logger.error(f"11 - FAILED: generate_volume_internal_vtk raised {type(_e).__name__}: {_e}")

    # Summary log
    logger.info("\n=========== COLD ROOM POST-PROCESSING SUMMARY ===========")
    logger.info(f"  T_setpoint    = {t_setpoint:.1f}°C  ({room_type})")
    logger.info(f"  ACH           = {energy['ACH']:.1f} h⁻¹")
    logger.info(f"  Q_trans       = {Q_transmission_W:.0f} W")
    for name, m in slice_results.items():
        tnu = m.get("T_max", 0) - m.get("T_min", 0)
        logger.info(
            f"  Slice {name:4s} (z={m.get('height_m', 0):.1f}m): "
            f"T_mean={m.get('T_mean', 0):.1f}°C, TNU={tnu:.2f}°C, "
            f"stagnation={m.get('pct_stagnation', 0):.1f}%"
        )
    logger.info(f"\n✅ Industrial Cooling post-processing completed")
    logger.info(f"Results saved at: {post_path}")
