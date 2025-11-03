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
        1: {  # COARSE - ~200k cells (optimized for BC stability)
            'name': 'BC-focused 200k (all-in on boundaries)',
            'description': 'Coarse base, aggressive BC refinement, thin layers for stability',
            'base_cell_size': 0.10,  # 10cm base cells (coarse domain)
            'global_level': 0,       # CRITICAL: (0 0) to keep domain coarse
            'maxGlobalCells': 1000000,  # CRITICAL: Force limit to prevent over-refinement
            'levels': {
                'pressure_inlet': 3,      # 1.25cm surface refinement (was 4 = too fine!)
                'pressure_outlet': 3,     # 1.25cm surface refinement
                'wall': 1,                # 0-5cm range (minimal - layers will handle it)
                'floor_ceiling': 1,       # 0-5cm range (minimal)
                'default': 0              # Coarse base
            },
            'volumetric_zones': [
                # Three-zone aggressive refinement around pressure boundaries
                {'distance': 0.08, 'level': 3, 'name': 'bc_core_0_8cm'},      # 0-8cm: 1.25cm cells
                {'distance': 0.25, 'level': 2, 'name': 'bc_near_8_25cm'},     # 8-25cm: 2.5cm cells
                {'distance': 0.50, 'level': 1, 'name': 'bc_mid_25_50cm'},     # 25-50cm: 5cm cells (reduced from 60cm)
            ],
            'boundary_layers': {
                # Thin layers for numerical stability (2 layers only - save cells!)
                # ABSOLUTE sizing (relativeSizes false)
                'pressure_inlet': {'nLayers': 2, 'firstLayerThickness': 0.001, 'expansionRatio': 1.3, 'relativeSizes': False},
                'pressure_outlet': {'nLayers': 2, 'firstLayerThickness': 0.001, 'expansionRatio': 1.3, 'relativeSizes': False},
                'wall': {'nLayers': 2, 'firstLayerThickness': 0.002, 'expansionRatio': 1.4, 'relativeSizes': False},
            },
            'feature_edge_refinement': {
                'enabled': True,         # Moderate feature detection
                'min_level': 1,          
                'max_level': 2,          # Moderate refinement
                'feature_angle': 45      # Moderate angle
            },
            'mesh_quality': {
                # Very relaxed quality - priority is getting layers to stick!
                'maxNonOrtho': 70,
                'maxBoundarySkewness': 25,
                'maxInternalSkewness': 5,
                'maxConcave': 80,
                'nCellsBetweenLevels': 3,  # Faster transitions (save cells)
                'minRefinementCells': 0,  # Prune small refinement regions
                # Relaxed fallback (MORE permissive than main)
                'relaxed': {
                    'maxNonOrtho': 75,
                    'maxBoundarySkewness': 35,
                    'maxInternalSkewness': 6
                }
            },
            'layer_controls': {
                # Very aggressive settings for maximum layer success
                'featureAngle': 80,              # More permissive (was 75)
                'nRelaxIter': 15,                # More relaxation
                'nSmoothNormals': 10,            # More smoothing
                'maxFaceThicknessRatio': 0.8,    # Very permissive
                'maxThicknessToMedialRatio': 0.8,
                'minThickness': 0.0005,          # Min 0.5mm absolute
                'minMedianAxisAngle': 70,        # More permissive
                'nLayerIter': 200,
                'nRelaxedIter': 100
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
        # For level 0, use (0 0) to avoid negative min level
        min_level = max(0, level - 1)
        block = f"""{patch_name}
                {{
                    level ({min_level} {level});
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
        
        # Generate layer block with ONLY 2 thickness params (OpenFOAM v2406 requirement)
        # Check if using relative or absolute sizing
        use_relative = layer_config.get('relativeSizes', True)
        
        if use_relative:
            # Relative sizing: 0.25 means 25% of local cell size
            first_layer = 0.25
        else:
            # Absolute sizing: use actual thickness in meters
            first_layer = layer_config['firstLayerThickness']
        
        block = f"""        "{patch_name}"
        {{
            firstLayerThickness {first_layer};
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
        quality_level: 1 (uniform 10mm), 2 (medium ~500k), 3 (fine ~5M cells)
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
    
    # Feature edge refinement configuration
    if quality_level == 1 and 'feature_edge_refinement' in config:
        # Level 1: Uniform mesh with feature edge refinement only
        feature_config = config['feature_edge_refinement']
        base_size = config['base_cell_size']
        
        # Calculate distances for feature refinement
        # level 3: 10mm / 2^3 = 1.25mm
        min_distance = base_size * 0.001  # Very close to edge
        max_distance = base_size * 0.02   # Further from edge
        
        feature_refinement_levels = f"            levels (({min_distance} {feature_config['max_level']}) ({max_distance} {feature_config['min_level']}));"
        feature_angle = str(feature_config['feature_angle'])
        
        logger.info(f"  Feature edge refinement: {base_size*1000}mm → {base_size*1000 / (2**feature_config['max_level']):.2f}mm at edges")
    else:
        # Level 2/3: Standard feature refinement
        feature_refinement_levels = "            levels ((0.001 6) (0.005 4) (0.020 2));  // Fine feature resolution"
        feature_angle = "25"
    
    # Enable layers if any boundary layers configured
    add_layers = "true" if len(config.get('boundary_layers', {})) > 0 else "false"
    
    # Global refinement level
    global_level = str(config.get('global_level', 1))
    
    # Cell count limits
    max_global_cells = str(config.get('maxGlobalCells', 5000000))
    
    # Mesh quality parameters (from config or defaults)
    mesh_quality = config.get('mesh_quality', {})
    n_cells_between = str(mesh_quality.get('nCellsBetweenLevels', 2))
    min_refinement_cells = str(mesh_quality.get('minRefinementCells', 0))
    max_non_ortho = str(mesh_quality.get('maxNonOrtho', 55))
    max_boundary_skew = str(mesh_quality.get('maxBoundarySkewness', 12))
    max_internal_skew = str(mesh_quality.get('maxInternalSkewness', 2.5))
    max_concave = str(mesh_quality.get('maxConcave', 70))
    
    # Relaxed quality controls (fallback - MORE permissive than main)
    relaxed_quality = mesh_quality.get('relaxed', {})
    max_non_ortho_relaxed = str(relaxed_quality.get('maxNonOrtho', int(max_non_ortho) + 10))
    max_boundary_skew_relaxed = str(relaxed_quality.get('maxBoundarySkewness', int(max_boundary_skew) + 10))
    max_internal_skew_relaxed = str(relaxed_quality.get('maxInternalSkewness', float(max_internal_skew) + 1.5))
    
    # Boundary layer parameters (detect if using relative or absolute sizing)
    # Check first boundary layer config to determine sizing mode
    boundary_layers_config = config.get('boundary_layers', {})
    if boundary_layers_config:
        first_bc_config = next(iter(boundary_layers_config.values()))
        use_relative = first_bc_config.get('relativeSizes', True)
    else:
        use_relative = True
    relative_sizes = "true" if use_relative else "false"
    
    # Layer controls (from config or defaults)
    layer_controls = config.get('layer_controls', {})
    layer_feature_angle = str(layer_controls.get('featureAngle', 75))
    layer_n_relax_iter = str(layer_controls.get('nRelaxIter', 12))
    layer_n_smooth_normals = str(layer_controls.get('nSmoothNormals', 8))
    layer_max_face_thickness = str(layer_controls.get('maxFaceThicknessRatio', 0.6))
    layer_max_thickness_medial = str(layer_controls.get('maxThicknessToMedialRatio', 0.6))
    layer_min_thickness = str(layer_controls.get('minThickness', 0.1 if use_relative else 0.0005))
    layer_min_median_angle = str(layer_controls.get('minMedianAxisAngle', 80))
    layer_n_layer_iter = str(layer_controls.get('nLayerIter', 150))
    layer_n_relaxed_iter = str(layer_controls.get('nRelaxedIter', 75))
    
    # Replace placeholders
    str_replace_dict = {
        "$STL_FILENAME": stl_filename,
        "$GEOMETRY_REGIONS": geometry_regions,
        "$EMESH_FILENAME": emesh_filename,
        "$FEATURE_REFINEMENT_LEVELS": feature_refinement_levels,
        "$FEATURE_ANGLE": feature_angle,
        "$REFINEMENT_SURFACES": refinement_surfaces,
        "$VOLUMETRIC_REFINEMENT": volumetric_refinement,
        "$BOUNDARY_LAYERS": boundary_layers,
        "$LOCATION_INSIDE_MESH": location_inside_mesh,
        "$ADD_LAYERS": add_layers,
        "$GLOBAL_LEVEL": global_level,
        "$MAX_GLOBAL_CELLS": max_global_cells,
        "$NCELLS_BETWEEN_LEVELS": n_cells_between,
        "$MIN_REFINEMENT_CELLS": min_refinement_cells,
        "$MAX_NON_ORTHO": max_non_ortho,
        "$MAX_BOUNDARY_SKEWNESS": max_boundary_skew,
        "$MAX_INTERNAL_SKEWNESS": max_internal_skew,
        "$MAX_CONCAVE": max_concave,
        "$MAX_NON_ORTHO_RELAXED": max_non_ortho_relaxed,
        "$MAX_BOUNDARY_SKEWNESS_RELAXED": max_boundary_skew_relaxed,
        "$MAX_INTERNAL_SKEWNESS_RELAXED": max_internal_skew_relaxed,
        "$RELATIVE_SIZES": relative_sizes,
        "$LAYER_FEATURE_ANGLE": layer_feature_angle,
        "$LAYER_N_RELAX_ITER": layer_n_relax_iter,
        "$LAYER_N_SMOOTH_NORMALS": layer_n_smooth_normals,
        "$LAYER_MAX_FACE_THICKNESS_RATIO": layer_max_face_thickness,
        "$LAYER_MAX_THICKNESS_TO_MEDIAL_RATIO": layer_max_thickness_medial,
        "$LAYER_MIN_THICKNESS": layer_min_thickness,
        "$LAYER_MIN_MEDIAN_AXIS_ANGLE": layer_min_median_angle,
        "$LAYER_N_LAYER_ITER": layer_n_layer_iter,
        "$LAYER_N_RELAXED_ITER": layer_n_relaxed_iter,
    }
    
    replace_in_file(input_path, output_path, str_replace_dict)
    
    logger.info("")
    logger.info("✓ HVAC mesh configuration generated successfully")
    logger.info(f"  Quality level: {quality_level} ({config['name']})")
    logger.info(f"  Output: {output_path}")
    logger.info(f"  Boundary layers: {add_layers}")
    logger.info("=" * 80)
    logger.info("")
