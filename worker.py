#!/usr/bin/env python3
"""
Worker for processing test calculations with Inductiva API using OpenFOAM.
This worker demonstrates complete integration: send → execute → download → extract value.
Uses OpenFOAM cavity case (available in Individual plan).
"""

import os
import sys
import time
import requests
import json
import tempfile
import shutil
import re
from datetime import datetime
from pathlib import Path

# Import inductiva
try:
    import inductiva
except ImportError:
    print("[WORKER] FATAL ERROR: inductiva module not installed. Install with: pip install inductiva")
    sys.exit(1)

# Configuration
API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:5000')
API_KEY = os.getenv('API_INTERNAL_KEY', 'flowerpower-external-api')
INDUCTIVA_API_KEY = os.getenv('INDUCTIVA_API_KEY')
POLL_INTERVAL = 30  # seconds

# API headers
headers = {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
}


def log(message):
    """Print timestamped log message"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[WORKER] [{timestamp}] {message}", flush=True)


def get_pending_simulations():
    """Fetch pending simulations from Express API"""
    try:
        url = f"{API_BASE_URL}/api/external/simulations/pending"
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            return data.get('simulations', [])
        elif response.status_code == 401:
            log("ERROR: Invalid API key. Check API_INTERNAL_KEY environment variable.")
            return []
        else:
            log(f"ERROR: Failed to fetch pending simulations. Status: {response.status_code}")
            return []
    except requests.exceptions.RequestException as e:
        log(f"ERROR: Network error while fetching pending simulations: {e}")
        return []
    except Exception as e:
        log(f"ERROR: Unexpected error while fetching pending simulations: {e}")
        return []


def update_simulation_status(simulation_id, status, result=None):
    """Update simulation status via Express API"""
    try:
        url = f"{API_BASE_URL}/api/external/simulations/{simulation_id}/status"
        payload = {'status': status}
        
        if result is not None:
            payload['result'] = result
        
        response = requests.patch(url, headers=headers, json=payload, timeout=10)
        
        if response.status_code == 200:
            log(f"Successfully updated simulation {simulation_id} to status: {status}")
            return True
        else:
            log(f"ERROR: Failed to update simulation {simulation_id}. Status: {response.status_code}")
            return False
    except Exception as e:
        log(f"ERROR: Failed to update simulation status: {e}")
        return False


def create_openfoam_cavity_case(temp_dir, iterations=10):
    """Create minimal OpenFOAM cavity case files"""
    
    # Create directory structure
    os.makedirs(os.path.join(temp_dir, "0"), exist_ok=True)
    os.makedirs(os.path.join(temp_dir, "constant"), exist_ok=True)
    os.makedirs(os.path.join(temp_dir, "system"), exist_ok=True)
    
    # 0/p - Pressure field
    p_content = """FoamFile
{
    version     2.0;
    format      ascii;
    class       volScalarField;
    object      p;
}
dimensions      [0 2 -2 0 0 0 0];
internalField   uniform 0;
boundaryField
{
    movingWall
    {
        type            zeroGradient;
    }
    fixedWalls
    {
        type            zeroGradient;
    }
    frontAndBack
    {
        type            empty;
    }
}
"""
    with open(os.path.join(temp_dir, "0", "p"), 'w') as f:
        f.write(p_content)
    
    # 0/U - Velocity field
    u_content = """FoamFile
{
    version     2.0;
    format      ascii;
    class       volVectorField;
    object      U;
}
dimensions      [0 1 -1 0 0 0 0];
internalField   uniform (0 0 0);
boundaryField
{
    movingWall
    {
        type            fixedValue;
        value           uniform (1 0 0);
    }
    fixedWalls
    {
        type            noSlip;
    }
    frontAndBack
    {
        type            empty;
    }
}
"""
    with open(os.path.join(temp_dir, "0", "U"), 'w') as f:
        f.write(u_content)
    
    # constant/transportProperties
    transport_content = """FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      transportProperties;
}
nu              [0 2 -1 0 0 0 0] 0.01;
"""
    with open(os.path.join(temp_dir, "constant", "transportProperties"), 'w') as f:
        f.write(transport_content)
    
    # system/controlDict
    control_content = f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      controlDict;
}}
application     icoFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         {iterations};
deltaT          1;
writeControl    timeStep;
writeInterval   {iterations};
purgeWrite      0;
writeFormat     ascii;
writePrecision  6;
writeCompression off;
timeFormat      general;
timePrecision   6;
runTimeModifiable true;
"""
    with open(os.path.join(temp_dir, "system", "controlDict"), 'w') as f:
        f.write(control_content)
    
    # system/fvSchemes
    schemes_content = """FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      fvSchemes;
}
ddtSchemes
{
    default         Euler;
}
gradSchemes
{
    default         Gauss linear;
    grad(p)         Gauss linear;
}
divSchemes
{
    default         none;
    div(phi,U)      Gauss linear;
}
laplacianSchemes
{
    default         Gauss linear orthogonal;
}
interpolationSchemes
{
    default         linear;
}
snGradSchemes
{
    default         orthogonal;
}
"""
    with open(os.path.join(temp_dir, "system", "fvSchemes"), 'w') as f:
        f.write(schemes_content)
    
    # system/fvSolution
    solution_content = """FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      fvSolution;
}
solvers
{
    p
    {
        solver          PCG;
        preconditioner  DIC;
        tolerance       1e-06;
        relTol          0.05;
    }
    pFinal
    {
        $p;
        relTol          0;
    }
    U
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-05;
        relTol          0;
    }
}
PISO
{
    nCorrectors     2;
    nNonOrthogonalCorrectors 0;
    pRefCell        0;
    pRefValue       0;
}
"""
    with open(os.path.join(temp_dir, "system", "fvSolution"), 'w') as f:
        f.write(solution_content)
    
    # system/blockMeshDict
    blockmesh_content = """FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      blockMeshDict;
}
convertToMeters 0.1;
vertices
(
    (0 0 0)
    (1 0 0)
    (1 1 0)
    (0 1 0)
    (0 0 0.1)
    (1 0 0.1)
    (1 1 0.1)
    (0 1 0.1)
);
blocks
(
    hex (0 1 2 3 4 5 6 7) (20 20 1) simpleGrading (1 1 1)
);
edges
(
);
boundary
(
    movingWall
    {
        type wall;
        faces
        (
            (3 7 6 2)
        );
    }
    fixedWalls
    {
        type wall;
        faces
        (
            (0 4 7 3)
            (2 6 5 1)
            (1 5 4 0)
        );
    }
    frontAndBack
    {
        type empty;
        faces
        (
            (0 3 2 1)
            (4 5 6 7)
        );
    }
);
mergePatchPairs
(
);
"""
    with open(os.path.join(temp_dir, "system", "blockMeshDict"), 'w') as f:
        f.write(blockmesh_content)
    
    log(f"Created OpenFOAM cavity case with {iterations} iterations")


def extract_value_from_openfoam_results(output_dir):
    """Extract a numerical value from OpenFOAM results"""
    try:
        # First, try to extract from stdout.txt if it exists
        stdout_file = os.path.join(output_dir, "stdout.txt")
        if os.path.exists(stdout_file):
            log(f"Reading stdout.txt for numerical values...")
            with open(stdout_file, 'r') as f:
                content = f.read()
            
            # Extract final time step Courant number
            courant_matches = re.findall(r'Time = (\d+)\s+Courant Number mean: ([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+max: ([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)', content)
            if courant_matches:
                last_time, mean_courant, max_courant = courant_matches[-1]
                log(f"Extracted Courant number from Time={last_time}: mean={mean_courant}, max={max_courant}")
                return {
                    'extractedValue': float(max_courant),
                    'meanValue': float(mean_courant),
                    'valueType': 'courant_number_max',
                    'timeStep': int(last_time),
                    'source': 'stdout.txt'
                }
            
            # Extract final pressure residuals
            p_residual_matches = re.findall(r'Time = (\d+)[\s\S]*?DICPCG:\s+Solving for p, Initial residual = ([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?), Final residual = ([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)', content)
            if p_residual_matches:
                last_time, initial_res, final_res = p_residual_matches[-1]
                log(f"Extracted pressure residual from Time={last_time}: final={final_res}")
                return {
                    'extractedValue': float(final_res),
                    'initialResidual': float(initial_res),
                    'valueType': 'pressure_final_residual',
                    'timeStep': int(last_time),
                    'source': 'stdout.txt'
                }
        
        # Fallback: try to find time directories (original approach)
        time_dirs = []
        for item in os.listdir(output_dir):
            item_path = os.path.join(output_dir, item)
            if os.path.isdir(item_path):
                try:
                    time_val = float(item)
                    time_dirs.append((time_val, item))
                except ValueError:
                    continue
        
        if not time_dirs:
            raise Exception("No time directories found and could not extract from stdout")
        
        # Get the last time directory
        time_dirs.sort()
        last_time_val, last_time_dir = time_dirs[-1]
        
        log(f"Found final time directory: {last_time_dir}")
        
        # Try to read pressure file
        p_file = os.path.join(output_dir, last_time_dir, "p")
        if os.path.exists(p_file):
            with open(p_file, 'r') as f:
                content = f.read()
            
            # Extract internalField values
            match = re.search(r'internalField\s+uniform\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)', content)
            if match:
                pressure_value = float(match.group(1))
                log(f"Extracted pressure value: {pressure_value}")
                return {
                    'extractedValue': pressure_value,
                    'valueType': 'pressure_uniform',
                    'timeStep': last_time_val,
                    'source': f'{last_time_dir}/p'
                }
        
        raise Exception("Could not extract numerical value from results")
        
    except Exception as e:
        raise Exception(f"Failed to extract value from OpenFOAM results: {e}")


def process_test_calculation_with_inductiva(simulation):
    """Process test calculation using OpenFOAM cavity case on Inductiva"""
    sim_id = simulation['id']
    json_config = simulation.get('jsonConfig', {})
    
    # Use minimal iterations for fast testing
    iterations = 3
    
    log(f"Processing simulation ID: {sim_id} using OpenFOAM cavity case ({iterations} iterations)")
    
    # Update status to processing
    if not update_simulation_status(sim_id, 'processing'):
        log(f"ERROR: Failed to update simulation {sim_id} to processing, skipping...")
        return
    
    # Create temporary directory for Inductiva input files
    temp_dir = tempfile.mkdtemp(prefix=f"inductiva_sim_{sim_id}_")
    
    try:
        # Verify Inductiva API key
        if not INDUCTIVA_API_KEY:
            raise Exception("INDUCTIVA_API_KEY environment variable not set")
        
        # Set Inductiva API key
        os.environ['INDUCTIVA_API_KEY'] = INDUCTIVA_API_KEY
        
        log(f"Creating OpenFOAM cavity case...")
        create_openfoam_cavity_case(temp_dir, iterations)
        
        # Create run script for OpenFOAM
        run_script = """#!/bin/bash
set -e
blockMesh
icoFoam
"""
        with open(os.path.join(temp_dir, "run.sh"), 'w') as f:
            f.write(run_script)
        
        log(f"Connecting to Inductiva API...")
        user_info = inductiva.users.get_info()
        log(f"Connected - User: {getattr(user_info, 'username', 'N/A')}")
        
        # Create machine group
        log(f"Creating machine group...")
        machine_group = inductiva.resources.MachineGroup(
            machine_type="c2-standard-4",
            spot=True,
            data_disk_gb=10,
            auto_resize_disk_max_gb=1000
        )
        machine_group.start()
        log(f"Machine group started: {machine_group.name}")
        
        # Use OpenFOAM simulator
        log(f"Submitting OpenFOAM cavity case to Inductiva...")
        openfoam = inductiva.simulators.OpenFOAM()
        
        # Submit task
        task = openfoam.run(
            input_dir=temp_dir,
            shell_script="run.sh",
            on=machine_group,
            storage_dir=f"simulation_{sim_id}"
        )
        
        log(f"Task submitted with ID: {task.id}")
        log(f"Waiting for Inductiva to complete OpenFOAM simulation...")
        
        # Wait for completion
        task.wait()
        
        log(f"Task completed! Downloading results...")
        
        # Download results (Inductiva downloads to inductiva_output/task_id/outputs by default)
        task.download_outputs()
        
        # Find the actual output directory where Inductiva downloaded files
        output_dir = os.path.join("inductiva_output", task.id, "outputs")
        
        log(f"Results downloaded. Extracting numerical value...")
        
        # Extract value from results
        result_data = extract_value_from_openfoam_results(output_dir)
        
        log(f"✓ Extracted value: {result_data['extractedValue']} ({result_data['valueType']})")
        
        # Add metadata
        result_data['processedAt'] = datetime.now().isoformat()
        result_data['inductivaTaskId'] = task.id
        result_data['simulationType'] = 'openfoam_cavity'
        result_data['iterations'] = iterations
        result_data['message'] = f"Simulation completed on Inductiva. Extracted {result_data['valueType']}: {result_data['extractedValue']}"
        
        # Update simulation with result
        update_simulation_status(sim_id, 'completed', result_data)
        log(f"✓ Simulation {sim_id} completed successfully!")
        
        # Cleanup machine group
        log(f"Terminating machine group...")
        machine_group.terminate()
        log(f"Machine group terminated")
        
    except Exception as e:
        log(f"ERROR: Failed to process simulation {sim_id}: {e}")
        
        update_simulation_status(sim_id, 'failed', {
            'error': str(e),
            'errorType': 'inductiva_openfoam_error',
            'message': 'OpenFOAM simulation failed on Inductiva'
        })
        log(f"Simulation {sim_id} marked as failed")
        
    finally:
        # Cleanup temp directory
        try:
            shutil.rmtree(temp_dir)
            log(f"Cleaned up temp directory: {temp_dir}")
        except Exception as cleanup_error:
            log(f"WARNING: Failed to cleanup temp directory: {cleanup_error}")


def process_cfd_simulation_with_pipeline(simulation):
    """Process CFD simulation using complete pipeline: JSON → Geo → Mesh → CFD → Inductiva"""
    sim_id = simulation['id']
    
    log(f"Processing CFD simulation ID: {sim_id}")
    
    # Update status to processing
    if not update_simulation_status(sim_id, 'processing'):
        log(f"ERROR: Failed to update simulation {sim_id} to processing")
        return
    
    try:
        # Step 1: Get file path from simulation data
        file_path = simulation.get('filePath')
        if not file_path:
            raise Exception("No file path provided in simulation data")
        
        log(f"Loading simulation JSON from: {file_path}")
        
        # Step 2: Read JSON file
        import json
        with open(file_path, 'r') as f:
            json_payload = json.load(f)
        
        log(f"JSON loaded successfully")
        
        # Step 3: Import pipeline steps
        import sys
        import os
        # Add project root to Python path
        project_root = os.path.dirname(os.path.abspath(__file__))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        
        from step01_json2geo import run as json2geo
        from step02_geo2mesh import run as geo2mesh
        from step03_mesh2cfd import run as mesh2cfd
        from step04_cfd2result import run as cfd2result
        from mesher_config import get_default_mesher, get_default_quality_level
        
        log(f"Pipeline modules imported successfully")
        
        # Step 4: Execute pipeline
        case_name = f"sim_{sim_id}"
        
        log(f"Step 1/4: Converting JSON to geometry...")
        final_geometry_mesh, boundary_conditions_df = json2geo(json_payload, case_name)
        
        mesher_type = get_default_mesher()
        quality_level = get_default_quality_level()
        log(f"Step 2/4: Generating mesh ({mesher_type}, quality level {quality_level})...")
        mesh_script = geo2mesh(case_name, final_geometry_mesh, boundary_conditions_df, type=mesher_type, quality_level=quality_level)
        
        log(f"Step 3/4: Setting up CFD case...")
        mesh2cfd(case_name, type="hvac", mesh_script=mesh_script)
        
        log(f"Step 4/4: Running CFD simulation on Inductiva...")
        cfd2result(case_name, type="inductiva")
        
        log(f"CFD simulation completed successfully")
        
        # Step 5: Prepare result data
        result_data = {
            'simulationType': 'cfd_comfort',
            'caseName': case_name,
            'processedAt': datetime.now().isoformat(),
            'message': 'CFD simulation completed on Inductiva',
            'resultsPath': f'cases/{case_name}/post'
        }
        
        # Update simulation with result
        update_simulation_status(sim_id, 'completed', result_data)
        log(f"Simulation {sim_id} completed successfully")
        
    except Exception as e:
        log(f"ERROR: Failed to process CFD simulation {sim_id}: {e}")
        import traceback
        log(f"Traceback: {traceback.format_exc()}")
        
        update_simulation_status(sim_id, 'failed', {
            'error': str(e),
            'errorType': 'cfd_pipeline_error',
            'message': 'CFD simulation pipeline failed'
        })


def main():
    """Main worker loop"""
    log("Worker starting...")
    log(f"API Base URL: {API_BASE_URL}")
    log(f"Poll interval: {POLL_INTERVAL} seconds")
    
    if not INDUCTIVA_API_KEY:
        log("FATAL ERROR: INDUCTIVA_API_KEY not set")
        sys.exit(1)
    
    log("Verifying Inductiva API connection...")
    try:
        user_info = inductiva.users.get_info()
        log(f"✓ Connected to Inductiva API")
        log(f"  User: {getattr(user_info, 'username', 'N/A')}")
        log(f"  Tier: {getattr(user_info, 'tier', 'N/A')}")
    except Exception as e:
        log(f"FATAL ERROR: Cannot connect to Inductiva API: {e}")
        sys.exit(1)
    
    log("Worker ready. Using OpenFOAM cavity case for test simulations.")
    
    try:
        while True:
            log("Checking for pending simulations...")
            
            try:
                simulations = get_pending_simulations()
                
                if not simulations:
                    log("No pending simulations found")
                else:
                    log(f"Found {len(simulations)} pending simulation(s)")
                    
                    for sim in simulations:
                        sim_type = sim.get('simulationType')
                        sim_id = sim.get('id')
                        
                        if sim_type == 'test_calculation':
                            log(f"Processing test calculation simulation {sim_id}")
                            process_test_calculation_with_inductiva(sim)
                        elif sim_type in ['comfort', 'renovation', 'cfd_real']:
                            log(f"Processing CFD simulation {sim_id} (type: {sim_type})")
                            process_cfd_simulation_with_pipeline(sim)
                        else:
                            log(f"Skipping simulation {sim_id} - unsupported type: {sim_type}")
                            
            except Exception as e:
                log(f"ERROR in main loop iteration: {e}")
            
            log(f"Waiting {POLL_INTERVAL} seconds before next check...")
            time.sleep(POLL_INTERVAL)
            
    except KeyboardInterrupt:
        log("Worker stopped by user")
        sys.exit(0)
    except Exception as e:
        log(f"FATAL ERROR in main loop: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
