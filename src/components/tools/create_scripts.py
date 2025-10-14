"""Create and save mesh/simulation scripts."""
import os
from typing import List


def save_scripts(case_path: str, mesh_script: List[str], solve_script: List[str] = None) -> None:
    """
    Save mesh and solve script commands to shell script files.
    
    Args:
        case_path: Path to case directory
        mesh_script: List of mesh generation shell commands
        solve_script: List of solver shell commands (optional)
    """
    sim_path = os.path.join(case_path, "sim")
    
    # Save mesh script
    mesh_script_path = os.path.join(sim_path, "mesh.sh")
    with open(mesh_script_path, 'w') as f:
        f.write("#!/bin/bash\n")
        f.write("set -e\n\n")
        for cmd in mesh_script:
            f.write(f"{cmd}\n")
    os.chmod(mesh_script_path, 0o755)
    
    # Save solve script if provided
    if solve_script:
        solve_script_path = os.path.join(sim_path, "solve.sh")
        with open(solve_script_path, 'w') as f:
            f.write("#!/bin/bash\n")
            f.write("set -e\n\n")
            for cmd in solve_script:
                f.write(f"{cmd}\n")
        os.chmod(solve_script_path, 0o755)
