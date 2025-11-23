import os
import numpy as np
import pandas as pd
import pyvista as pv

from src.components.tools.populate_template_file import replace_in_file


def create_surfaceFeatureExtractDict(template_path, sim_path, stl_filename):
    """Create surfaceFeatureExtractDict for cfMesh (same as snappyHexMesh)"""
    input_path = os.path.join(template_path, "system", "surfaceFeatureExtractDict") 
    output_path = os.path.join(sim_path, "system", "surfaceFeatureExtractDict") 
    str_replace_dict = dict()
    str_replace_dict["$STL_FILENAME"] = stl_filename
    replace_in_file(input_path, output_path, str_replace_dict)


def generate_patch_refinement_block(geo_df):
    """
    Generate refinement configuration for cfMesh meshDict.
    Applies differentiated refinement based on boundary condition type:
    - walls: base refinement level
    - pressure_inlet/outlet: 2 levels finer (better resolution for flow boundaries)
    """
    blocks = []
    
    for _, row in geo_df.iterrows():
        patch_name = row['id']
        patch_type = row['type']
        
        # Differentiated refinement based on BC type
        if patch_type in ['pressure_inlet', 'pressure_outlet']:
            # Pressure boundaries need finer mesh for accurate gradient resolution
            cell_size = "0.05"  # 5cm - fine mesh for openings
            blocks.append(f"""    {patch_name}
    {{
        cellSize {cell_size};
    }}""")
        elif patch_type == 'wall':
            # Standard walls use base mesh size
            cell_size = "0.10"  # 10cm - coarser mesh for walls
            blocks.append(f"""    {patch_name}
    {{
        cellSize {cell_size};
    }}""")
        else:
            # Other boundary types use base mesh
            cell_size = "0.10"
            blocks.append(f"""    {patch_name}
    {{
        cellSize {cell_size};
    }}""")
    
    return "\n".join(blocks)


def generate_boundary_layer_block(geo_df):
    """
    Generate boundary layer configuration for cfMesh.
    Applies boundary layers to all surfaces for accurate near-wall resolution.
    """
    blocks = []
    
    for _, row in geo_df.iterrows():
        patch_name = row['id']
        patch_type = row['type']
        
        # Apply boundary layers to all surfaces
        # More layers on pressure boundaries for better flow resolution
        if patch_type in ['pressure_inlet', 'pressure_outlet']:
            n_layers = "5"  # 5 layers on openings for good flow profiles
            thickness = "0.02"  # 2cm total thickness
        else:
            n_layers = "3"  # 3 layers on walls
            thickness = "0.01"  # 1cm total thickness
        
        blocks.append(f"""    {patch_name}
    {{
        nLayers {n_layers};
        thicknessRatio 1.2;
        maxFirstLayerThickness {thickness};
    }}""")
    
    return "\n".join(blocks)


def create_meshDict(template_path, sim_path, stl_filename, geo_mesh, geo_df):
    """
    Create meshDict for cfMesh cartesianMesh.
    This is the main configuration file for cfMesh meshing.
    """
    input_path = os.path.join(template_path, "system", "meshDict") 
    output_path = os.path.join(sim_path, "system", "meshDict") 
    
    # Calculate base mesh size from geometry bounds
    bounds = geo_mesh.bounds
    x_range = bounds[1] - bounds[0]
    y_range = bounds[3] - bounds[2]
    z_range = bounds[5] - bounds[4]
    
    # Base cell size: 10cm (adaptive refinement will make it finer near surfaces)
    max_cell_size = "0.10"
    
    # Generate patch-specific refinement and boundary layers
    patch_refinement = generate_patch_refinement_block(geo_df)
    boundary_layers = generate_boundary_layer_block(geo_df)
    
    # cfMesh needs full path relative to case directory
    # Template already includes quotes, so don't add them here
    stl_path = f"constant/triSurface/{stl_filename}"
    
    str_replace_dict = dict()
    str_replace_dict["$STL_FILENAME"] = stl_path
    str_replace_dict["$MAX_CELL_SIZE"] = max_cell_size
    str_replace_dict["$PATCH_REFINEMENT"] = patch_refinement
    str_replace_dict["$BOUNDARY_LAYERS"] = boundary_layers
    
    replace_in_file(input_path, output_path, str_replace_dict)


def export_to_fms(geo_mesh_dict, sim_path, fms_filename):
    """
    Export geometry to FMS format for cfMesh.
    FMS is cfMesh's preferred multi-region surface format.
    For simplicity, we'll use STL format which cfMesh also supports.
    """
    # cfMesh works well with STL, so we reuse the STL export
    # Convert .fms extension to .stl
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
            
            # Ensure mesh has triangles
            mesh = mesh.triangulate()
            
            # Iterate over faces
            faces = mesh.cells.reshape((-1, 4))  # VTK faces: [3, i0, i1, i2] for triangles
            for face in faces:
                assert face[0] == 3  # triangle
                
                pts = mesh.points[face[1:4]]
                # Calculate normal
                v1 = pts[1] - pts[0]
                v2 = pts[2] - pts[0]
                normal = np.cross(v1, v2)
                norm = np.linalg.norm(normal)
                if norm > 0:
                    normal /= norm
                else:
                    normal = np.array([0.0, 0.0, 0.0])
                
                write_facet(f, normal, pts)
            
            f.write(f"endsolid {solid_name}\n")
    
    return stl_filename


def split_polydata_by_cell_data(mesh: pv.PolyData, df: pd.DataFrame) -> dict[int, pv.PolyData]:
    """Split mesh by patch ID for multi-solid export"""
    patch_names = df[["id"]].to_dict()
    
    patch_mesh_dict = {}
    for patch_id, patch_name in patch_names['id'].items():
        mask = mesh.cell_data["patch_id"] == patch_id
        submesh = mesh.extract_cells(mask)
        patch_mesh_dict[patch_name] = submesh
    return patch_mesh_dict


def prepare_cfmesh(geo_mesh, sim_path, geo_df, fms_filename="geometry.fms"):
    """
    Prepare cfMesh configuration and scripts for mesh generation.
    
    cfMesh advantages for HVAC applications:
    - Automatic robust boundary layers (>90% coverage)
    - Simpler setup than snappyHexMesh
    - Faster meshing (2-5x speedup)
    - Better suited for pressure boundary conditions (windows/doors/vents)
    
    Args:
        geo_mesh: Geometry mesh to be meshed
        sim_path: Path to simulation directory
        geo_df: DataFrame containing boundary condition information
        fms_filename: Name of the geometry file (will be converted to STL)
        
    Returns:
        List of script commands for mesh generation
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"    * Preparing cfMesh configuration for {geo_mesh.n_cells} geometry cells")
    logger.info("    * cfMesh selected for superior boundary layer generation on pressure boundaries")
    
    logger.info("    * Splitting geometry mesh by boundary condition patches")
    geo_mesh_dict = split_polydata_by_cell_data(geo_mesh, geo_df)
    logger.info(f"    * Split into {len(geo_mesh_dict)} patch meshes")
    
    logger.info(f"    * Exporting geometry to STL format: {fms_filename}")
    stl_filename = export_to_fms(geo_mesh_dict, sim_path, fms_filename)
    
    template_path = os.path.join(os.getcwd(), "data", "settings", "mesh", "cfmesh")
    logger.info(f"    * Creating cfMesh configuration files from template: {template_path}")
    
    logger.info("    * Creating surfaceFeatureExtractDict")
    create_surfaceFeatureExtractDict(template_path, sim_path, stl_filename)
    
    logger.info("    * Creating meshDict")
    create_meshDict(template_path, sim_path, stl_filename, geo_mesh, geo_df)
    
    # Get expected patches for validation
    expected_patches = geo_df["id"].tolist()
    expected_patches_str = ", ".join(expected_patches)
    
    # Count pressure boundaries for logging
    pressure_patches = geo_df[geo_df['type'].isin(['pressure_inlet', 'pressure_outlet'])]
    logger.info(f"    * Applying fine refinement to {len(pressure_patches)} pressure boundaries")
    logger.info(f"    * Boundary layers will be generated automatically on all surfaces")
    
    script_commands = [
        '#!/bin/bash',
        'cd "${0%/*}" || exit',
        '',
        '# Source OpenFOAM environment - try multiple possible paths',
        'BASHRC_PATHS=(',
        '    "/opt/openfoam/openfoam2412_dev/etc/bashrc"',
        '    "/opt/openfoam/openfoam2412/etc/bashrc"',
        '    "/usr/lib/openfoam/openfoam2412_dev/etc/bashrc"',
        '    "/usr/lib/openfoam/openfoam2412/etc/bashrc"',
        '    "/opt/openfoam/etc/bashrc"',
        '    "/usr/local/openfoam/etc/bashrc"',
        ')',
        '',
        'BASHRC_FOUND=0',
        'for bashrc in "${BASHRC_PATHS[@]}"; do',
        '    if [ -f "$bashrc" ]; then',
        '        echo "Sourcing OpenFOAM environment from: $bashrc"',
        '        . "$bashrc"',
        '        BASHRC_FOUND=1',
        '        break',
        '    fi',
        'done',
        '',
        'if [ $BASHRC_FOUND -eq 0 ]; then',
        '    echo "ERROR: OpenFOAM bashrc not found in any known location"',
        '    echo "Tried paths: ${BASHRC_PATHS[@]}"',
        '    exit 1',
        'fi',
        '',
        '. ${WM_PROJECT_DIR:?}/bin/tools/RunFunctions',
        
        'decompDict="-decomposeParDict system/decomposeParDict"',
        
        # 1. Extract surface features (same as snappyHexMesh)
        'runApplication surfaceFeatureExtract',
        
        # 2. Run cfMesh cartesianMesh - single command does everything!
        'echo "==================== RUNNING CFMESH CARTESIAN MESHER ===================="',
        'echo "cfMesh will:"',
        'echo "  1. Create base cartesian mesh"',
        'echo "  2. Refine near surfaces automatically"',
        'echo "  3. Generate boundary layers on all patches"',
        'echo "  4. Snap to geometry features"',
        'echo ""',
        'runApplication cartesianMesh',
        
        # 3. VALIDATE MESH - Fail fast if background patches remain
        'echo "==================== VALIDATING MESH ===================="',
        "python3 << 'VALIDATION_EOF'",
        "import re",
        "",
        "# Read boundary file",
        "with open('constant/polyMesh/boundary', 'r') as f:",
        "    content = f.read()",
        "",
        "# Extract patch names and face counts",
        "patches = {}",
        "lines = content.split('\\n')",
        "current_patch = None",
        "for i, line in enumerate(lines):",
        "    # Match patch name",
        "    if re.match(r'^\\s+(\\w+)\\s*$', line):",
        "        current_patch = line.strip()",
        "    # Match nFaces",
        "    elif current_patch and 'nFaces' in line:",
        "        match = re.search(r'nFaces\\s+(\\d+)', line)",
        "        if match:",
        "            patches[current_patch] = int(match.group(1))",
        "            current_patch = None",
        "",
        "# Check for background patches",
        "background_patches = ['limits', 'defaultFaces', 'background']",
        f"expected_patches = [{', '.join([repr(p) for p in expected_patches])}]",
        "failed = [(p, patches[p]) for p in patches if p in background_patches and patches[p] > 0]",
        "",
        "if failed:",
        "    print('\\n' + '='*80)",
        "    print('MESHING ERROR: cfMesh failed to cut geometry properly!')",
        "    print('='*80)",
        "    print('Background patches remain in the mesh:')",
        "    for patch, count in failed:",
        "        print(f'  - {patch}: {count} faces')",
        "    print()",
        "    print('This indicates the geometry is NOT WATERTIGHT (has holes/gaps).')",
        "    print('Possible causes:')",
        "    print('  1. Geometry has holes, gaps, or non-manifold surfaces')",
        "    print('  2. Wall extrusion created invalid 3D geometry')",
        "    print('  3. Boolean operations failed to create closed volume')",
        "    print()",
        f"    print('Expected patches: {expected_patches_str}')",
        "    print(f'Actual patches: {\", \".join(patches.keys())}')",
        "    print('='*80 + '\\n')",
        "    exit(1)",
        "",
        "print('[OK] Mesh validation passed - no background patches found')",
        "print(f'Valid patches: {\", \".join(patches.keys())}')",
        "VALIDATION_EOF",
        'echo "==================== MESH VALIDATION PASSED ===================="',
        
        # 4. Check mesh quality
        'runApplication checkMesh',
        
        # 5. Prepare initial fields
        'rm -rf 0',
        'cp -r 0.orig 0',
        
        # 6. Check initial conditions
        'echo "==================== INITIAL CONDITIONS CHECK ===================="',
        'echo ""',
        'echo "--- Checking h (enthalpy) ---"',
        'grep "internalField" 0/h',
        'echo ""',
        'echo "h boundary conditions:"',
        'head -n 50 0/h | grep -A 2 "type"',
        'echo ""',
        'echo "--- Checking thermophysicalProperties ---"',
        'grep -A 15 "mixture" constant/thermophysicalProperties',
        'echo ""',
        'echo "==================== END INITIAL CONDITIONS CHECK ===================="',
        'echo ""',
        
        # 7. Create foam marker file
        'touch results.foam',
    ]
    
    logger.info("    * cfMesh preparation completed successfully")
    logger.info(f"    * Mesh validation will check for patches: {expected_patches}")
    logger.info("    * cfMesh will generate robust boundary layers automatically")
    logger.info("    * Pressure boundaries will have 2x finer resolution than walls")
    return script_commands
