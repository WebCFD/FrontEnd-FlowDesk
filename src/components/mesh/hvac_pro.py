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
# MESH QUALITY LEVELS (PARAMETRIC)
# ============================================================================

class MeshQualityLevel:
    """
    Parametric mesh quality configurations for different use cases.
    
    Quality Level 1 (COARSE): ~50k cells
    - Quick validation, fast meshing (~2 min)
    - Basic flow patterns only
    - Not suitable for final results
    
    Quality Level 2 (MEDIUM): ~500k cells ⭐ RECOMMENDED
    - Production quality for most HVAC cases
    - Good balance of accuracy and speed (~5-10 min meshing)
    - Suitable for design iterations
    
    Quality Level 3 (FINE): ~5M cells
    - Research-grade mesh for publication
    - Maximum accuracy, slow meshing (~20-30 min)
    - Use for final validation only
    """
    
    CONFIGS = {
        1: {  # COARSE - ~50k cells
            'name': 'Coarse (fast validation)',
            'description': 'Quick mesh for flow pattern validation',
            'base_cell_size': 0.25,  # Same as Level 2
            'levels': {
                'pressure_inlet': 3,      # 0.031m (~3cm) - moderado
                'pressure_outlet': 2,     # 0.062m (~6cm)
                'wall': 1,                # 0.125m (~12cm)
                'floor_ceiling': 1,       # 0.125m (~12cm)
                'default': 1              # Moderate global refinement
            },
            'volumetric_zones': [
                {'distance': 0.2, 'level': 2, 'name': 'near_inlet'},
            ],
            'boundary_layers': {
                'pressure_inlet': {'nLayers': 3, 'firstLayerThickness': 0.005, 'expansionRatio': 1.3},
                'pressure_outlet': {'nLayers': 3, 'firstLayerThickness': 0.005, 'expansionRatio': 1.3},
                'wall': {'nLayers': 2, 'firstLayerThickness': 0.010, 'expansionRatio': 1.3},
            }
        },
        2: {  # MEDIUM - ~500k cells ⭐ DEFAULT
            'name': 'Medium (production)',
            'description': 'Professional HVAC mesh for design iterations',
            'base_cell_size': 0.25,
            'levels': {
                'pressure_inlet': 6,      # 0.0039m (~4mm)
                'pressure_outlet': 5,     # 0.0078m (~8mm)
                'wall': 3,                # 0.0312m (~3cm)
                'floor_ceiling': 2,       # 0.0625m (~6cm)
                'default': 2
            },
            'volumetric_zones': [
                {'distance': 0.3, 'level': 5, 'name': 'jet_core'},
                {'distance': 1.0, 'level': 4, 'name': 'near_field'},
                {'distance': 2.0, 'level': 3, 'name': 'mid_field'},
            ],
            'boundary_layers': {
                'pressure_inlet': {'nLayers': 7, 'firstLayerThickness': 0.001, 'expansionRatio': 1.15},
                'pressure_outlet': {'nLayers': 7, 'firstLayerThickness': 0.001, 'expansionRatio': 1.15},
                'wall': {'nLayers': 5, 'firstLayerThickness': 0.002, 'expansionRatio': 1.2},
            }
        },
        3: {  # FINE - ~5M cells
            'name': 'Fine (research grade)',
            'description': 'Maximum resolution for publication-quality results',
            'base_cell_size': 0.20,  # Smaller base mesh
            'levels': {
                'pressure_inlet': 8,      # 0.00078m (~0.8mm)
                'pressure_outlet': 7,     # 0.00156m (~1.5mm)
                'wall': 5,                # 0.00625m (~6mm)
                'floor_ceiling': 3,       # 0.025m (~2.5cm)
                'default': 3
            },
            'volumetric_zones': [
                {'distance': 0.2, 'level': 7, 'name': 'jet_core'},
                {'distance': 0.5, 'level': 6, 'name': 'jet_expansion'},
                {'distance': 1.0, 'level': 5, 'name': 'near_field'},
                {'distance': 2.0, 'level': 4, 'name': 'mid_field'},
            ],
            'boundary_layers': {
                'pressure_inlet': {'nLayers': 10, 'firstLayerThickness': 0.0005, 'expansionRatio': 1.1},
                'pressure_outlet': {'nLayers': 10, 'firstLayerThickness': 0.0005, 'expansionRatio': 1.1},
                'wall': {'nLayers': 7, 'firstLayerThickness': 0.001, 'expansionRatio': 1.15},
            }
        }
    }
    
    @staticmethod
    def get_config(quality_level: int):
        """Get configuration for specified quality level"""
        if quality_level not in MeshQualityLevel.CONFIGS:
            raise ValueError(f"Invalid quality level: {quality_level}. Must be 1 (coarse), 2 (medium), or 3 (fine)")
        return MeshQualityLevel.CONFIGS[quality_level]


# ============================================================================
# LEGACY CLASS (for backwards compatibility)
# ============================================================================

class HVACMeshParams:
    """Legacy parameters - now use MeshQualityLevel.get_config(2) instead"""
    
    BASE_CELL_SIZE = 0.25
    LEVELS = MeshQualityLevel.CONFIGS[2]['levels']
    VOLUMETRIC_ZONES = MeshQualityLevel.CONFIGS[2]['volumetric_zones']
    BOUNDARY_LAYERS = MeshQualityLevel.CONFIGS[2]['boundary_layers']


# ============================================================================
# REFINEMENT BLOCK GENERATION
# ============================================================================

def generate_hvac_refinement_surfaces(geo_df: pd.DataFrame, quality_level: int = 2) -> str:
    """
    Generate surface refinement configuration based on boundary condition types.
    
    Args:
        geo_df: DataFrame with boundary condition information
        quality_level: 1 (coarse ~50k), 2 (medium ~500k), 3 (fine ~5M cells)
    
    Uses physics-based refinement levels based on quality setting.
    """
    config = MeshQualityLevel.get_config(quality_level)
    levels = config['levels']
    base_size = config['base_cell_size']
    
    logger.info("=" * 80)
    logger.info(f"HVAC SURFACE REFINEMENT - Quality Level {quality_level}: {config['name']}")
    logger.info("=" * 80)
    logger.info(f"  Base cell size: {base_size}m")
    logger.info(f"  Target cells: {config['description']}")
    logger.info("")
    
    blocks = []
    refinement_summary = {}
    
    for idx, row in geo_df.iterrows():
        patch_name = row['id']
        bc_type = row['type']
        
        # Determine refinement level based on BC type
        if bc_type == 'pressure_inlet':
            level = levels['pressure_inlet']
            cell_size = base_size / (2 ** level)
            patch_type = 'patch'
        elif bc_type == 'pressure_outlet':
            level = levels['pressure_outlet']
            cell_size = base_size / (2 ** level)
            patch_type = 'patch'
        elif bc_type == 'wall':
            level = levels['wall']
            cell_size = base_size / (2 ** level)
            patch_type = 'wall'
        else:
            level = levels['default']
            cell_size = base_size / (2 ** level)
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

def generate_hvac_volumetric_refinement(geo_df: pd.DataFrame, quality_level: int = 2) -> str:
    """
    Generate multi-zone volumetric refinement around pressure boundaries.
    
    Args:
        geo_df: DataFrame with boundary condition information
        quality_level: 1 (coarse), 2 (medium), 3 (fine)
    
    Creates graduated refinement zones to capture jet development.
    """
    config = MeshQualityLevel.get_config(quality_level)
    volumetric_zones = config['volumetric_zones']
    base_size = config['base_cell_size']
    
    pressure_patches = geo_df[geo_df['type'].isin(['pressure_inlet', 'pressure_outlet'])]
    
    if len(pressure_patches) == 0:
        logger.info("  * No pressure boundaries → volumetric refinement disabled")
        return "        // No pressure boundaries for volumetric refinement"
    
    logger.info("=" * 80)
    logger.info(f"HVAC VOLUMETRIC REFINEMENT - Quality Level {quality_level}")
    logger.info("=" * 80)
    logger.info(f"  Creating multi-zone refinement for {len(pressure_patches)} pressure boundaries")
    logger.info("")
    
    # Log zone configuration
    for zone in volumetric_zones:
        cell_size = base_size / (2 ** zone['level'])
        logger.info(f"  Zone '{zone['name']}': 0-{zone['distance']}m → level {zone['level']} ({cell_size*1000:.1f}mm cells)")
    
    logger.info("")
    
    blocks = []
    for idx, row in pressure_patches.iterrows():
        patch_name = row['id']
        bc_type = row['type']
        
        # Build distance-based refinement levels
        level_spec = " ".join([f"({z['distance']} {z['level']})" for z in volumetric_zones])
        
        # Use the patch name from geometry (not _volume suffix)
        # Reference the actual surface in the STL file
        block = f"""        {patch_name}
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

def generate_hvac_boundary_layers(geo_df: pd.DataFrame, quality_level: int = 2) -> str:
    """
    Generate optimized boundary layer configuration.
    
    Args:
        geo_df: DataFrame with boundary condition information
        quality_level: 1 (coarse), 2 (medium), 3 (fine)
    
    Layer sizing based on y+ requirements, scaled by quality level.
    """
    config = MeshQualityLevel.get_config(quality_level)
    boundary_layers = config['boundary_layers']
    
    logger.info("=" * 80)
    logger.info(f"HVAC BOUNDARY LAYERS - Quality Level {quality_level}")
    logger.info("=" * 80)
    
    blocks = []
    layer_summary = {}
    
    for idx, row in geo_df.iterrows():
        patch_name = row['id']
        bc_type = row['type']
        
        # Get layer configuration for this BC type
        if bc_type in boundary_layers:
            layer_config = boundary_layers[bc_type]
        elif bc_type == 'wall':
            layer_config = boundary_layers['wall']
        else:
            continue  # No layers for this BC type
        
        # Generate layer block (using firstLayerThickness + expansionRatio)
        block = f"""        "{patch_name}"
        {{
            nSurfaceLayers {layer_config['nLayers']};
            firstLayerThickness {layer_config['firstLayerThickness']};
            expansionRatio {layer_config['expansionRatio']};
        }}"""
        blocks.append(block)
        
        # Track summary
        key = f"{bc_type} ({layer_config['nLayers']} layers, {layer_config['firstLayerThickness']*1000:.1f}mm first)"
        layer_summary[key] = layer_summary.get(key, 0) + 1
        
        logger.info(f"  {patch_name:20s} → {layer_config['nLayers']} layers (first: {layer_config['firstLayerThickness']*1000:.1f}mm)")
    
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

def create_hvac_pro_snappyHexMeshDict(template_path, sim_path, stl_filename, geo_mesh, geo_df, quality_level: int = 2):
    """
    Create professional HVAC snappyHexMeshDict from scratch.
    
    Args:
        template_path: Path to template directory
        sim_path: Path to simulation directory
        stl_filename: STL geometry filename
        geo_mesh: PyVista mesh for locationInMesh
        geo_df: DataFrame with boundary condition information
        quality_level: 1 (coarse ~50k), 2 (medium ~500k), 3 (fine ~5M cells)
    """
    from src.components.mesh.snappy import generate_location_inside_mesh
    
    config = MeshQualityLevel.get_config(quality_level)
    
    input_path = os.path.join(template_path, "system", "snappyHexMeshDict")
    output_path = os.path.join(sim_path, "system", "snappyHexMeshDict")
    
    logger.info("")
    logger.info("=" * 80)
    logger.info(f"GENERATING HVAC MESH - Quality Level {quality_level}: {config['name']}")
    logger.info("=" * 80)
    logger.info(f"  {config['description']}")
    logger.info("")
    
    # Generate configuration blocks
    geometry_regions = generate_regions_block(geo_df["id"].tolist())
    emesh_filename = stl_filename.replace(".stl", ".eMesh")
    refinement_surfaces = generate_hvac_refinement_surfaces(geo_df, quality_level)
    volumetric_refinement = generate_hvac_volumetric_refinement(geo_df, quality_level)
    boundary_layers = generate_hvac_boundary_layers(geo_df, quality_level)
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
    logger.info("✓ HVAC mesh configuration generated successfully")
    logger.info(f"  Quality level: {quality_level} ({config['name']})")
    logger.info(f"  Output: {output_path}")
    logger.info(f"  Boundary layers: {enable_layers}")
    logger.info("=" * 80)
    logger.info("")
