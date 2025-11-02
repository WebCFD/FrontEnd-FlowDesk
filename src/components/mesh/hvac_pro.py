"""
HVAC Professional Meshing Module
=================================

Generates high-quality CFD meshes optimized for HVAC applications.
Design based on physical principles and industry best practices.

Key Features:
- Physics-based cell sizing (jets, boundary layers, stratification)
- Multi-zone volumetric refinement (jet core → near-field → far-field)
- Optimized boundary layers (y+ < 30 for wall functions)
- Strict quality controls for CFD stability
"""

import os
import logging
import numpy as np
import pandas as pd
import pyvista as pv

from src.components.tools.populate_template_file import replace_in_file, generate_regions_block

logger = logging.getLogger(__name__)


# ============================================================================
# PHYSICAL PARAMETERS
# ============================================================================

class HVACMeshParams:
    """Physical parameters for HVAC mesh generation"""
    
    # Base mesh sizing
    BASE_CELL_SIZE = 0.25  # m - background mesh
    
    # Refinement levels (cell_size = BASE / 2^level)
    LEVELS = {
        'pressure_inlet': 6,      # 0.0039m (~4mm) - finest for jet core
        'pressure_outlet': 5,     # 0.0078m (~8mm) - fine for return flow
        'wall': 3,                # 0.0312m (~3cm) - thermal boundary
        'floor_ceiling': 2,       # 0.0625m (~6cm) - stratification
        'default': 2              # 0.0625m - fallback
    }
    
    # Volumetric refinement zones (distance from pressure boundary)
    VOLUMETRIC_ZONES = [
        {'distance': 0.3, 'level': 5, 'name': 'jet_core'},       # 0-0.3m: jet expansion
        {'distance': 1.0, 'level': 4, 'name': 'near_field'},     # 0.3-1.0m: deceleration
        {'distance': 2.0, 'level': 3, 'name': 'mid_field'},      # 1.0-2.0m: development
    ]
    
    # Boundary layer configuration
    BOUNDARY_LAYERS = {
        'pressure_inlet': {
            'nLayers': 7,
            'firstLayerThickness': 0.001,  # 1mm → y+ ≈ 20-30
            'expansionRatio': 1.15,
            'finalLayerThickness': 0.25,
            'minThickness': 0.0005,
        },
        'pressure_outlet': {
            'nLayers': 7,
            'firstLayerThickness': 0.001,
            'expansionRatio': 1.15,
            'finalLayerThickness': 0.25,
            'minThickness': 0.0005,
        },
        'wall': {
            'nLayers': 5,
            'firstLayerThickness': 0.002,  # 2mm for thermal boundary
            'expansionRatio': 1.2,
            'finalLayerThickness': 0.30,
            'minThickness': 0.001,
        },
    }


# ============================================================================
# REFINEMENT BLOCK GENERATION
# ============================================================================

def generate_hvac_refinement_surfaces(geo_df: pd.DataFrame) -> str:
    """
    Generate surface refinement configuration based on boundary condition types.
    
    Uses physics-based refinement levels:
    - Level 6 (4mm): Pressure inlets for jet resolution
    - Level 5 (8mm): Pressure outlets for return flow
    - Level 3 (3cm): Walls for thermal boundary layer
    - Level 2 (6cm): Floor/ceiling for stratification
    """
    params = HVACMeshParams()
    
    logger.info("=" * 80)
    logger.info("HVAC SURFACE REFINEMENT CONFIGURATION")
    logger.info("=" * 80)
    
    blocks = []
    refinement_summary = {}
    
    for idx, row in geo_df.iterrows():
        patch_name = row['id']
        bc_type = row['type']
        
        # Determine refinement level based on BC type
        if bc_type == 'pressure_inlet':
            level = params.LEVELS['pressure_inlet']
            cell_size = params.BASE_CELL_SIZE / (2 ** level)
            patch_type = 'patch'
        elif bc_type == 'pressure_outlet':
            level = params.LEVELS['pressure_outlet']
            cell_size = params.BASE_CELL_SIZE / (2 ** level)
            patch_type = 'patch'
        elif bc_type == 'wall':
            level = params.LEVELS['wall']
            cell_size = params.BASE_CELL_SIZE / (2 ** level)
            patch_type = 'wall'
        else:
            level = params.LEVELS['default']
            cell_size = params.BASE_CELL_SIZE / (2 ** level)
            patch_type = 'patch'
        
        # Generate refinement block
        block = f"""{patch_name}
                {{
                    level ({level-1} {level});
                    patchInfo {{ type {patch_type}; }}
                }}"""
        blocks.append(block)
        
        # Track refinement summary
        key = f"{bc_type} (level {level})"
        refinement_summary[key] = refinement_summary.get(key, 0) + 1
        
        logger.info(f"  {patch_name:20s} → level {level} ({cell_size*1000:.1f}mm cells)")
    
    # Log summary
    logger.info("-" * 80)
    logger.info("Refinement Summary:")
    for config, count in sorted(refinement_summary.items()):
        logger.info(f"  {config}: {count} patches")
    logger.info("=" * 80)
    
    # Format as OpenFOAM regions block
    if blocks:
        indent = " " * 12
        formatted_blocks = [indent + block for block in blocks]
        return "regions\n" + indent + "{\n" + "\n".join(formatted_blocks) + "\n" + indent + "}"
    else:
        return ""


# ============================================================================
# VOLUMETRIC REFINEMENT
# ============================================================================

def generate_hvac_volumetric_refinement(geo_df: pd.DataFrame) -> str:
    """
    Generate multi-zone volumetric refinement around pressure boundaries.
    
    Creates graduated refinement zones to capture:
    - Jet core expansion (0-0.3m)
    - Near-field deceleration (0.3-1.0m)
    - Mid-field development (1.0-2.0m)
    """
    params = HVACMeshParams()
    pressure_patches = geo_df[geo_df['type'].isin(['pressure_inlet', 'pressure_outlet'])]
    
    if len(pressure_patches) == 0:
        logger.info("  * No pressure boundaries → volumetric refinement disabled")
        return "        // No pressure boundaries for volumetric refinement"
    
    logger.info("=" * 80)
    logger.info("HVAC VOLUMETRIC REFINEMENT ZONES")
    logger.info("=" * 80)
    logger.info(f"  Creating multi-zone refinement for {len(pressure_patches)} pressure boundaries")
    logger.info("")
    
    # Log zone configuration
    for zone in params.VOLUMETRIC_ZONES:
        cell_size = params.BASE_CELL_SIZE / (2 ** zone['level'])
        logger.info(f"  Zone '{zone['name']}': 0-{zone['distance']}m → level {zone['level']} ({cell_size*1000:.1f}mm cells)")
    
    logger.info("")
    
    blocks = []
    for idx, row in pressure_patches.iterrows():
        patch_name = row['id']
        bc_type = row['type']
        
        # Build distance-based refinement levels
        level_spec = " ".join([f"({z['distance']} {z['level']})" for z in params.VOLUMETRIC_ZONES])
        
        block = f"""        {patch_name}_volume
        {{
            mode    distance;
            levels  ({level_spec});
        }}"""
        blocks.append(block)
        
        logger.info(f"  {patch_name} ({bc_type}): 3-zone refinement enabled")
    
    logger.info("=" * 80)
    
    return "\n".join(blocks) if blocks else "        // No volumetric refinement"


# ============================================================================
# BOUNDARY LAYERS
# ============================================================================

def generate_hvac_boundary_layers(geo_df: pd.DataFrame) -> str:
    """
    Generate optimized boundary layer configuration.
    
    Layer sizing based on y+ requirements:
    - Pressure boundaries: 7 layers, first cell 1mm (y+ ≈ 20-30)
    - Walls: 5 layers, first cell 2mm (thermal boundary layer)
    """
    params = HVACMeshParams()
    
    logger.info("=" * 80)
    logger.info("HVAC BOUNDARY LAYER CONFIGURATION")
    logger.info("=" * 80)
    
    blocks = []
    layer_summary = {}
    
    for idx, row in geo_df.iterrows():
        patch_name = row['id']
        bc_type = row['type']
        
        # Get layer configuration for this BC type
        if bc_type in params.BOUNDARY_LAYERS:
            config = params.BOUNDARY_LAYERS[bc_type]
        elif bc_type == 'wall':
            config = params.BOUNDARY_LAYERS['wall']
        else:
            continue  # No layers for this BC type
        
        # Generate layer block
        block = f"""        "{patch_name}"
        {{
            nSurfaceLayers {config['nLayers']};
            firstLayerThickness {config['firstLayerThickness']};
            expansionRatio {config['expansionRatio']};
            finalLayerThickness {config['finalLayerThickness']};
            minThickness {config['minThickness']};
        }}"""
        blocks.append(block)
        
        # Track summary
        key = f"{bc_type} ({config['nLayers']} layers, {config['firstLayerThickness']*1000:.1f}mm first)"
        layer_summary[key] = layer_summary.get(key, 0) + 1
        
        logger.info(f"  {patch_name:20s} → {config['nLayers']} layers (first: {config['firstLayerThickness']*1000:.1f}mm)")
    
    # Log summary
    logger.info("-" * 80)
    logger.info("Boundary Layer Summary:")
    for config, count in sorted(layer_summary.items()):
        logger.info(f"  {config}: {count} patches")
    logger.info("  Target coverage: >95% on pressure boundaries, >90% on walls")
    logger.info("=" * 80)
    
    return "\n".join(blocks) if blocks else "        // No boundary layers configured"


# ============================================================================
# MAIN CONFIGURATION FUNCTION
# ============================================================================

def create_hvac_pro_snappyHexMeshDict(template_path, sim_path, stl_filename, geo_mesh, geo_df):
    """
    Create professional HVAC snappyHexMeshDict from scratch.
    
    Args:
        template_path: Path to template directory
        sim_path: Path to simulation directory
        stl_filename: STL geometry filename
        geo_mesh: PyVista mesh for locationInMesh
        geo_df: DataFrame with boundary condition information
    """
    from src.components.mesh.snappy import generate_location_inside_mesh
    
    input_path = os.path.join(template_path, "system", "snappyHexMeshDict")
    output_path = os.path.join(sim_path, "system", "snappyHexMeshDict")
    
    logger.info("")
    logger.info("=" * 80)
    logger.info("GENERATING HVAC PROFESSIONAL MESH CONFIGURATION")
    logger.info("=" * 80)
    logger.info("")
    
    # Generate configuration blocks
    geometry_regions = generate_regions_block(geo_df["id"].tolist())
    emesh_filename = stl_filename.replace(".stl", ".eMesh")
    refinement_surfaces = generate_hvac_refinement_surfaces(geo_df)
    volumetric_refinement = generate_hvac_volumetric_refinement(geo_df)
    boundary_layers = generate_hvac_boundary_layers(geo_df)
    location_inside_mesh = generate_location_inside_mesh(geo_mesh)
    
    # Enable layers if any boundary layers configured
    enable_layers = "true" if "No boundary layers" not in boundary_layers else "false"
    
    # Replace placeholders
    str_replace_dict = {
        "$STL_FILENAME": stl_filename,
        "$GEOMETRY_REGIONS": geometry_regions,
        "$EMESH_FILENAME": emesh_filename,
        "$REFINEMENT_SURFACES": refinement_surfaces,
        "$VOLUMETRIC_REFINEMENT": volumetric_refinement,
        "$BOUNDARY_LAYERS": boundary_layers,
        "$LOCATION_INSIDE_MESH": location_inside_mesh,
    }
    
    replace_in_file(input_path, output_path, str_replace_dict)
    
    logger.info("")
    logger.info("✓ HVAC Professional mesh configuration generated successfully")
    logger.info(f"  Output: {output_path}")
    logger.info(f"  Boundary layers: {enable_layers}")
    logger.info("=" * 80)
    logger.info("")
