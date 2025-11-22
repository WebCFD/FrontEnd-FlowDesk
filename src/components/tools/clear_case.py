import os
import shutil


def remove_files_inside_folder(dir_path, keep=[], keep_dirs=[]):
    """
    Remove files inside a folder while preserving specified files and directories.
    
    Args:
        dir_path: Path to the directory to clean
        keep: List of filenames to keep
        keep_dirs: List of directory names to keep (won't be deleted)
    """
    os.makedirs(dir_path, exist_ok=True)
    for filename in os.listdir(dir_path):
        file = os.path.join(dir_path, filename)
        if os.path.isdir(file):
            # Skip directories that should be kept
            if filename not in keep_dirs:
                shutil.rmtree(file)
        elif os.path.isfile(file):
            # Remove files that are not in the keep list
            if filename not in keep:
                os.remove(file)


def clean_case_keep_mesh(case_path):
    """
    Clean case directory while preserving mesh files.
    
    This function is used in the pipeline after mesh generation (on Inductiva)
    and before CFD setup. It preserves:
    - constant/polyMesh/ (generated mesh)
    - constant/triSurface/ (geometry files)
    - system/meshDict, snappyHexMeshDict, etc. (mesh configuration)
    """
    sim_path = os.path.join(case_path, "sim")
    initial_path = os.path.join(sim_path, "0.orig")
    remove_files_inside_folder(initial_path)
    
    system_path = os.path.join(sim_path, 'system')
    remove_files_inside_folder(
        system_path, 
        keep=['meshDict', 'snappyHexMeshDict', 'blockMeshDict', 'surfaceFeatureExtractDict', 'decomposeParDict']
    )
    
    constant_path = os.path.join(sim_path, 'constant')
    # Preserve polyMesh (generated mesh) and triSurface (geometry)
    remove_files_inside_folder(
        constant_path,
        keep_dirs=['polyMesh', 'triSurface']
    )


def clear_case_all(case_name):
    case_path = os.path.join(os.getcwd(), 'cases', case_name)
    os.makedirs(case_path, exist_ok=True)
    if os.path.isdir(case_path):
        for item in os.listdir(case_path):
            item_path = os.path.join(case_path, item)
            if os.path.isfile(item_path) or os.path.islink(item_path):
                os.unlink(item_path)
            elif os.path.isdir(item_path):
                shutil.rmtree(item_path)