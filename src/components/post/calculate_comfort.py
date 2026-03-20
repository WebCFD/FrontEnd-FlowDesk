#!/usr/bin/env python3.12
"""
Calculate PMV/PPD thermal comfort fields from OpenFOAM T and U fields.
Runs on cloud server — uses direct OpenFOAM file parsing (no foamlib required).

Uses ISO 7730 standard with hardcoded parameters:
- Met = 1.0 (sedentary office work)
- Clo = 0.7 (light office clothing)
- RH = 50% (standard relative humidity)
- Tmrt = Tair (mean radiant temperature equals air temperature)

Usage:
    python3 calculate_comfort.py <case_path>              # Process only latest timestep
    python3 calculate_comfort.py <case_path> --all-times  # Process all timesteps (excluding t=0)
"""

import os
import sys
import re
import argparse
import numpy as np
import logging
from pythermalcomfort.models import pmv_ppd_iso
from pythermalcomfort.utilities import v_relative

MET = 1.0
CLO = 0.7
RH = 50.0

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# OpenFOAM field I/O (no foamlib dependency)
# ---------------------------------------------------------------------------

def _parse_internal_field(content):
    """
    Parse the internalField section from OpenFOAM field file content.
    Returns float (uniform) or np.ndarray (nonuniform scalar or Nx3 vector).
    """
    # uniform scalar: internalField uniform 293.15;
    m = re.search(r'internalField\s+uniform\s+([^\s;(]+)\s*;', content)
    if m:
        return float(m.group(1))

    # nonuniform scalar list
    m = re.search(
        r'internalField\s+nonuniform\s+List<scalar>\s*\n\s*(\d+)\s*\n\s*\(',
        content,
    )
    if m:
        n = int(m.group(1))
        paren_pos = content.index('(', m.end() - 1)
        rest = content[paren_pos + 1:]
        close_pos = rest.index(')')
        data_str = rest[:close_pos].strip()
        vals = [float(v) for v in data_str.split()]
        return np.array(vals, dtype=np.float64)

    # nonuniform vector list
    m = re.search(
        r'internalField\s+nonuniform\s+List<vector>\s*\n\s*(\d+)\s*\n\s*\(',
        content,
    )
    if m:
        n = int(m.group(1))
        paren_pos = content.index('(', m.end() - 1)
        rest = content[paren_pos + 1:]
        close_pos = rest.index(')')
        data_str = rest[:close_pos].strip()
        rows = re.findall(r'\(\s*([\s\S]*?)\s*\)', data_str)
        vecs = [[float(v) for v in row.split()] for row in rows]
        return np.array(vecs, dtype=np.float64)

    raise ValueError("Could not parse internalField")


def _parse_boundary_patches(content):
    """Return list of patch names from boundaryField section."""
    m = re.search(r'boundaryField\s*\{', content)
    if not m:
        return []
    start = m.end()
    depth = 1
    pos = start
    while pos < len(content) and depth > 0:
        if content[pos] == '{':
            depth += 1
        elif content[pos] == '}':
            depth -= 1
        pos += 1
    bf_content = content[start:pos - 1]
    return re.findall(r'(\w+)\s*\{', bf_content)


def read_foam_field(filepath):
    """
    Read an OpenFOAM field file.
    Returns (internal, boundary_patches) where:
      internal = float (uniform) or np.ndarray
      boundary_patches = list of patch name strings
    """
    with open(filepath, 'r', errors='replace') as f:
        content = f.read()
    internal = _parse_internal_field(content)
    patches = _parse_boundary_patches(content)
    return internal, patches


def write_foam_scalar_field(filepath, field_array, boundary_patches, field_name):
    """Write a volScalarField OpenFOAM file."""
    n_cells = len(field_array)
    values_str = '\n'.join(f'{v:.8g}' for v in field_array)
    mean_val = float(np.nanmean(field_array))

    boundary_str = ''
    for patch in boundary_patches:
        boundary_str += (
            f'    {patch}\n'
            f'    {{\n'
            f'        type            calculated;\n'
            f'        value           uniform {mean_val:.8g};\n'
            f'    }}\n'
        )

    content = (
        '/*--------------------------------*- C++ -*----------------------------------*\\\n'
        '| =========                 |                                                 |\n'
        '| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |\n'
        '|  \\\\    /   O peration     | Version:  v2412                                 |\n'
        '|   \\\\  /    A nd           | Website:  www.openfoam.com                      |\n'
        '|    \\\\/     M anipulation  |                                                 |\n'
        '\\*---------------------------------------------------------------------------*/\n'
        'FoamFile\n'
        '{\n'
        '    version     2.0;\n'
        '    format      ascii;\n'
        '    class       volScalarField;\n'
        f'    object      {field_name};\n'
        '}\n'
        '// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //\n'
        '\n'
        'dimensions      [0 0 0 0 0 0 0];\n'
        '\n'
        f'internalField   nonuniform List<scalar>\n'
        f'{n_cells}\n'
        '(\n'
        f'{values_str}\n'
        ')\n'
        ';\n'
        '\n'
        'boundaryField\n'
        '{\n'
        f'{boundary_str}'
        '}\n'
        '\n'
        '// ************************************************************************* //\n'
    )

    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    with open(filepath, 'w') as f:
        f.write(content)


def get_n_cells_from_mesh(case_path):
    """Count cells from polyMesh/owner file."""
    owner_file = os.path.join(case_path, 'constant', 'polyMesh', 'owner')
    with open(owner_file, 'r', errors='replace') as f:
        content = f.read()
    m = re.search(r'^\s*(\d+)\s*\n\s*\(', content, re.MULTILINE)
    if not m:
        raise ValueError("Cannot parse cell count from polyMesh/owner")
    start = content.index('(', m.start()) + 1
    end = content.index(')', start)
    owners = [int(v) for v in content[start:end].split()]
    return max(owners) + 1


# ---------------------------------------------------------------------------
# PMV/PPD calculation
# ---------------------------------------------------------------------------

def calculate_pmv_fanger(tdb, tr, vel, rh, met, clo):
    """Calculate PMV using ISO 7730 via pythermalcomfort."""
    vr = v_relative(v=vel, met=met)
    result = pmv_ppd_iso(
        tdb=tdb, tr=tr, vr=vr, rh=rh, met=met, clo=clo,
        wme=0.0, limit_inputs=False,
    )
    return result.pmv


def calculate_ppd(pmv):
    """Calculate PPD from PMV (ISO 7730)."""
    return 100.0 - 95.0 * np.exp(-0.03353 * pmv ** 4 - 0.2179 * pmv ** 2)


# ---------------------------------------------------------------------------
# Per-timestep processing
# ---------------------------------------------------------------------------

def process_timestep(case_path, time_str):
    """Process a single timestep: read T & U, compute PMV/PPD, write fields."""
    logger.info(f"\n{'='*70}")
    logger.info(f"Processing timestep: {time_str}")
    logger.info(f"{'='*70}")

    time_dir = os.path.join(case_path, time_str)

    # --- Read T ---
    T_file = os.path.join(time_dir, 'T')
    logger.info(f"Reading temperature field: {T_file}")
    T_internal, T_patches = read_foam_field(T_file)

    # --- Read U ---
    U_file = os.path.join(time_dir, 'U')
    logger.info(f"Reading velocity field: {U_file}")
    U_internal, _ = read_foam_field(U_file)

    # --- Optional: read G for T_mrt ---
    G_file = os.path.join(time_dir, 'G')
    G_internal = None
    if os.path.exists(G_file):
        try:
            G_internal, _ = read_foam_field(G_file)
            logger.info("G field found — will calculate T_mrt from radiation")
        except Exception as e:
            logger.warning(f"Could not read G field: {e} — using T_mrt = T_air")
    else:
        logger.info("G field not found — using T_mrt = T_air (simplified)")

    # --- Determine cell count ---
    try:
        p_file = os.path.join(time_dir, 'p')
        p_internal, _ = read_foam_field(p_file)
        if isinstance(p_internal, (int, float)):
            raise ValueError("p is uniform")
        n_cells = len(p_internal)
        logger.info(f"Cell count from p field: {n_cells}")
    except Exception:
        n_cells = get_n_cells_from_mesh(case_path)
        logger.info(f"Cell count from polyMesh/owner: {n_cells}")

    # --- Expand uniform fields ---
    if isinstance(T_internal, (int, float)):
        logger.info(f"T is uniform ({T_internal:.2f} K), expanding to {n_cells} cells")
        T_internal = np.full(n_cells, T_internal)

    if isinstance(U_internal, (int, float)):
        logger.info(f"U is uniform, expanding to {n_cells} cells")
        U_internal = np.zeros((n_cells, 3))
    elif U_internal.ndim == 1 and U_internal.shape[0] == 3:
        logger.info("U is single vector, tiling to all cells")
        U_internal = np.tile(U_internal, (n_cells, 1))

    n_cells = len(T_internal)
    logger.info(f"Processing {n_cells} cells")

    # --- Derived quantities ---
    T_celsius = T_internal - 273.15
    U_mag = np.linalg.norm(U_internal, axis=1) if U_internal.ndim == 2 else np.abs(U_internal)

    # --- Compute PMV/PPD per cell ---
    VALID_TEMP_MIN = 10.0
    VALID_TEMP_MAX = 40.0
    VALID_VEL_MAX = 5.0
    INVALID_VALUE = -1000.0

    pmv_field = np.full(n_cells, INVALID_VALUE)
    ppd_field = np.full(n_cells, INVALID_VALUE)
    invalid_count = 0

    for i in range(n_cells):
        tdb = float(T_celsius[i])
        vel = float(U_mag[i])

        # T_mrt from G or fallback to T_air
        if G_internal is not None:
            sigma = 5.67e-8
            G_val = float(G_internal) if isinstance(G_internal, (int, float)) else float(G_internal[i])
            G_val = max(G_val, 0.1)
            T_mrt_K = (G_val / (4 * sigma)) ** 0.25
            tr = float(np.clip(T_mrt_K - 273.15, -10, 80))
        else:
            tr = tdb

        if (VALID_TEMP_MIN <= tdb <= VALID_TEMP_MAX and
                VALID_TEMP_MIN <= tr <= VALID_TEMP_MAX and
                vel <= VALID_VEL_MAX):
            try:
                pmv_val = float(calculate_pmv_fanger(tdb, tr, vel, RH, MET, CLO))
                ppd_val = float(calculate_ppd(pmv_val))
                if (np.isfinite(pmv_val) and np.isfinite(ppd_val) and
                        -10.0 <= pmv_val <= 10.0 and 0.0 <= ppd_val <= 100.0):
                    pmv_field[i] = pmv_val
                    ppd_field[i] = ppd_val
                else:
                    invalid_count += 1
            except (OverflowError, ValueError):
                invalid_count += 1
        else:
            invalid_count += 1

    # --- Statistics ---
    valid_pmv = pmv_field[pmv_field != INVALID_VALUE]
    valid_ppd = ppd_field[ppd_field != INVALID_VALUE]
    valid_pct = 100.0 * len(valid_pmv) / n_cells
    logger.info(f"\nResults:")
    logger.info(f"  Valid cells: {len(valid_pmv)}/{n_cells} ({valid_pct:.1f}%)")
    logger.info(f"  Invalid/out-of-range: {invalid_count}")
    if len(valid_pmv) > 0:
        logger.info(f"  PMV: min={valid_pmv.min():.2f}  max={valid_pmv.max():.2f}  mean={valid_pmv.mean():.2f}")
        logger.info(f"  PPD: min={valid_ppd.min():.1f}%  max={valid_ppd.max():.1f}%  mean={valid_ppd.mean():.1f}%")
    comfortable = np.sum((pmv_field >= -0.5) & (pmv_field <= 0.5))
    logger.info(f"  Comfort zone (-0.5 < PMV < 0.5): {100.0 * comfortable / n_cells:.1f}%")

    # --- Write PMV field ---
    pmv_path = os.path.join(time_dir, 'PMV')
    logger.info(f"\nWriting PMV field to {pmv_path}")
    write_foam_scalar_field(pmv_path, pmv_field, T_patches, 'PMV')

    # --- Write PPD field ---
    ppd_path = os.path.join(time_dir, 'PPD')
    logger.info(f"Writing PPD field to {ppd_path}")
    write_foam_scalar_field(ppd_path, ppd_field, T_patches, 'PPD')

    logger.info(f"✓ PMV/PPD written for timestep {time_str}")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Calculate PMV/PPD thermal comfort fields from OpenFOAM results'
    )
    parser.add_argument('case_path', nargs='?', default='.', help='Path to OpenFOAM case directory')
    parser.add_argument('--all-times', action='store_true',
                        help='Process all timesteps (excluding t=0)')
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format='%(message)s')
    logger.info('=' * 70)
    logger.info('THERMAL COMFORT CALCULATION (PMV/PPD)')
    logger.info('=' * 70)
    logger.info(f'  Met={MET} met  Clo={CLO} clo  RH={RH}%  Tmrt=Tair')

    case_path = args.case_path

    # Find timestep directories (numeric names, skip 0 for all-times mode)
    all_entries = os.listdir(case_path)
    time_dirs = [d for d in all_entries if re.match(r'^\d+(\.\d+)?$', d)]
    if not time_dirs:
        logger.error('No timestep directories found!')
        sys.exit(1)

    time_values = sorted(float(t) for t in time_dirs)

    if args.all_times:
        times_to_process = [t for t in time_values if t > 0]
        logger.info(f'\nMode: ALL timesteps (excluding t=0): {times_to_process}')
    else:
        times_to_process = [time_values[-1]]
        logger.info(f'\nMode: Latest timestep only: {times_to_process[0]}')

    if not times_to_process:
        logger.error('No timesteps to process!')
        sys.exit(1)

    for time_val in times_to_process:
        time_str = str(int(time_val)) if float(time_val).is_integer() else str(time_val)
        try:
            process_timestep(case_path, time_str)
        except Exception as e:
            import traceback
            logger.error(f'\n❌ Error at timestep {time_str}: {e}')
            logger.error(traceback.format_exc())

    logger.info('\n' + '=' * 70)
    logger.info(f'✅ Done — {len(times_to_process)} timestep(s) processed')
    logger.info('=' * 70)


if __name__ == '__main__':
    main()
