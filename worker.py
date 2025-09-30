#!/usr/bin/env python3
"""
Worker for processing test calculations with Inductiva API.
This worker polls the Express API for pending simulations and processes them using Inductiva cloud infrastructure.
NO LOCAL FALLBACK - All calculations run on Inductiva.
"""

import os
import sys
import time
import requests
import json
import tempfile
import shutil
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


def process_test_calculation_with_inductiva(simulation):
    """Process a test calculation simulation with Inductiva - NO FALLBACK"""
    sim_id = simulation['id']
    json_config = simulation.get('jsonConfig', {})
    
    # Extract numbers from configuration
    number_a = json_config.get('numberA')
    number_b = json_config.get('numberB')
    
    if number_a is None or number_b is None:
        log(f"ERROR: Simulation {sim_id} missing numberA or numberB in jsonConfig")
        update_simulation_status(sim_id, 'failed', {
            'error': 'Missing numberA or numberB in configuration'
        })
        return
    
    log(f"Processing test calculation ID: {sim_id} - Computing ({number_a} + {number_b})² on Inductiva")
    
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
        
        log(f"Preparing Inductiva job for simulation {sim_id}...")
        
        # Create the Python script that will run on Inductiva
        script_content = f"""#!/usr/bin/env python3
import json

# Calculate result
number_a = {number_a}
number_b = {number_b}
result = (number_a + number_b) ** 2

# Create output
output = {{
    "calculatedValue": result,
    "formula": f"({{number_a}} + {{number_b}})²",
    "numberA": number_a,
    "numberB": number_b,
    "processedWith": "inductiva_cloud"
}}

# Write result to file
with open("result.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"Calculation completed: ({{number_a}} + {{number_b}})² = {{result}}")
"""
        
        # Write script to temp directory
        script_path = os.path.join(temp_dir, "calculate.py")
        with open(script_path, 'w') as f:
            f.write(script_content)
        
        log(f"Created script at {script_path}")
        log(f"Connecting to Inductiva API...")
        
        # Verify connection to Inductiva
        try:
            user_info = inductiva.users.get_info()
            log(f"Connected to Inductiva API - User: {getattr(user_info, 'username', 'N/A')}")
        except Exception as api_error:
            raise Exception(f"Failed to connect to Inductiva API: {api_error}")
        
        # Create machine group (lightweight for simple calculations)
        log(f"Creating machine group...")
        machine_group = inductiva.resources.MachineGroup(
            machine_type="c2-standard-4",  # 4 vCPUs, 16 GB RAM
            spot=True  # Use spot instances for 85% cost savings
        )
        machine_group.start()
        log(f"Machine group started: {machine_group.name}")
        
        # Define commands to run on Inductiva
        commands = ["python3 calculate.py"]
        
        log(f"Submitting job to Inductiva...")
        
        # Submit custom command task using run_simulation
        task = inductiva.tasks.run_simulation(
            input_dir=temp_dir,
            commands=commands,
            on=machine_group,
            storage_dir=f"simulation_{sim_id}"
        )
        
        log(f"Task submitted to Inductiva with ID: {task.id}")
        log(f"Waiting for Inductiva to complete task...")
        
        # Wait for task completion
        task.wait()
        
        log(f"Task completed. Downloading results...")
        
        # Download results to temp directory
        output_dir = os.path.join(temp_dir, "output")
        os.makedirs(output_dir, exist_ok=True)
        task.download_outputs(output_dir)
        
        # Read result.json
        result_file = os.path.join(output_dir, "result.json")
        if not os.path.exists(result_file):
            raise Exception(f"result.json not found in Inductiva output")
        
        with open(result_file, 'r') as f:
            result_data = json.load(f)
        
        log(f"Result from Inductiva: {result_data['calculatedValue']}")
        
        # Add processing timestamp
        result_data['processedAt'] = datetime.now().isoformat()
        result_data['inductivaTaskId'] = task.id
        
        # Update simulation with result
        update_simulation_status(sim_id, 'completed', result_data)
        log(f"Simulation {sim_id} completed successfully with Inductiva")
        
        # Cleanup machine group
        log(f"Terminating machine group...")
        machine_group.terminate()
        log(f"Machine group terminated")
        
    except Exception as e:
        log(f"ERROR: Failed to process simulation {sim_id} with Inductiva: {e}")
        
        # NO FALLBACK - Report error directly
        update_simulation_status(sim_id, 'failed', {
            'error': str(e),
            'errorType': 'inductiva_error',
            'message': 'Simulation failed on Inductiva cloud infrastructure'
        })
        log(f"Simulation {sim_id} marked as failed - NO LOCAL FALLBACK")
        
    finally:
        # Cleanup temp directory
        try:
            shutil.rmtree(temp_dir)
            log(f"Cleaned up temp directory: {temp_dir}")
        except Exception as cleanup_error:
            log(f"WARNING: Failed to cleanup temp directory: {cleanup_error}")


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
    
    log("Worker ready. Polling for pending simulations...")
    log("NOTE: NO LOCAL FALLBACK - All calculations run on Inductiva cloud")
    
    try:
        while True:
            log("Checking for pending simulations...")
            
            try:
                simulations = get_pending_simulations()
                
                if simulations:
                    log(f"Found {len(simulations)} pending simulation(s)")
                    
                    for sim in simulations:
                        sim_type = sim.get('simulationType')
                        sim_id = sim.get('id')
                        
                        if sim_type == 'test_calculation':
                            log(f"Processing test calculation simulation {sim_id}")
                            process_test_calculation_with_inductiva(sim)
                        else:
                            log(f"Skipping simulation {sim_id} (type: {sim_type})")
                else:
                    log("No pending simulations found")
                    
            except Exception as e:
                log(f"ERROR in main loop iteration: {e}")
                # Continue the loop even if an iteration fails
            
            # Wait before next poll
            log(f"Waiting {POLL_INTERVAL} seconds before next check...")
            time.sleep(POLL_INTERVAL)
            
    except KeyboardInterrupt:
        log("Worker stopped by user (Ctrl+C)")
        sys.exit(0)
    except Exception as e:
        log(f"FATAL ERROR: Worker crashed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
