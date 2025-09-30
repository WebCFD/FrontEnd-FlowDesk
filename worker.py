#!/usr/bin/env python3
"""
Worker for processing test calculations with Inductiva API.
This worker polls the Express API for pending simulations and processes them.
"""

import os
import sys
import time
import requests
import json
from datetime import datetime

# Try to import inductiva, handle if not installed
try:
    import inductiva
except ImportError:
    print("[WORKER] WARNING: inductiva module not installed. Install with: pip install inductiva")
    inductiva = None

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


def process_test_calculation(simulation):
    """Process a test calculation simulation with Inductiva"""
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
    
    log(f"Found test calculation ID: {sim_id} - Computing ({number_a} + {number_b})²")
    
    # Update status to processing
    if not update_simulation_status(sim_id, 'processing'):
        log(f"ERROR: Failed to update simulation {sim_id} to processing, skipping...")
        return
    
    try:
        # Check if Inductiva is available and configured
        if inductiva is None:
            raise Exception("Inductiva module not installed")
        
        if not INDUCTIVA_API_KEY:
            raise Exception("INDUCTIVA_API_KEY environment variable not set")
        
        # Set Inductiva API key
        inductiva.api_key = INDUCTIVA_API_KEY
        
        # Create Python code for Inductiva to execute
        python_code = f"""result = ({number_a} + {number_b}) ** 2
print(result)
"""
        
        log(f"Sending calculation to Inductiva API...")
        log(f"Python code: {python_code.strip()}")
        
        # Submit task to Inductiva
        # Note: This is a simplified example. Actual Inductiva API usage may differ.
        # You may need to adjust based on the actual Inductiva API documentation.
        
        task = inductiva.tasks.run(
            command=["python", "-c", python_code],
            working_dir=".",
        )
        
        log(f"Waiting for Inductiva to complete...")
        
        # Wait for task completion
        task.wait()
        
        # Get the result
        output = task.get_output()
        result_value = None
        
        # Parse output to get the result
        if output and 'stdout' in output:
            try:
                result_value = int(output['stdout'].strip())
                log(f"Result from Inductiva: {result_value}")
            except ValueError:
                log(f"WARNING: Could not parse Inductiva output: {output['stdout']}")
                result_value = output['stdout'].strip()
        
        # Update simulation with result
        result_data = {
            'calculatedValue': result_value,
            'formula': f"({number_a} + {number_b})²",
            'numberA': number_a,
            'numberB': number_b,
            'processedAt': datetime.now().isoformat()
        }
        
        update_simulation_status(sim_id, 'completed', result_data)
        log(f"Simulation {sim_id} completed successfully")
        
    except Exception as e:
        log(f"ERROR: Failed to process simulation {sim_id} with Inductiva: {e}")
        
        # Fallback: Calculate locally if Inductiva fails
        log(f"Fallback: Calculating locally...")
        try:
            result_value = (number_a + number_b) ** 2
            log(f"Local calculation result: {result_value}")
            
            result_data = {
                'calculatedValue': result_value,
                'formula': f"({number_a} + {number_b})²",
                'numberA': number_a,
                'numberB': number_b,
                'processedAt': datetime.now().isoformat(),
                'processedWith': 'local_fallback',
                'inductivaError': str(e)
            }
            
            update_simulation_status(sim_id, 'completed', result_data)
            log(f"Simulation {sim_id} completed with local fallback")
        except Exception as fallback_error:
            log(f"ERROR: Even local fallback failed: {fallback_error}")
            update_simulation_status(sim_id, 'failed', {
                'error': str(e),
                'fallbackError': str(fallback_error)
            })


def main():
    """Main worker loop"""
    log("Worker starting...")
    log(f"API Base URL: {API_BASE_URL}")
    log(f"Poll interval: {POLL_INTERVAL} seconds")
    
    if not INDUCTIVA_API_KEY:
        log("WARNING: INDUCTIVA_API_KEY not set. Will use local fallback for calculations.")
    
    if inductiva is None:
        log("WARNING: Inductiva module not available. Will use local fallback for calculations.")
    
    log("Worker ready. Polling for pending simulations...")
    
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
                            process_test_calculation(sim)
                        else:
                            log(f"Skipping simulation {sim_id} (type: {sim_type})")
                else:
                    log("No pending simulations found")
                    
            except Exception as e:
                log(f"ERROR in main loop iteration: {e}")
                # Continue the loop even if an iteration fails
            
            # Wait before next poll
            time.sleep(POLL_INTERVAL)
            
    except KeyboardInterrupt:
        log("Worker stopped by user (Ctrl+C)")
        sys.exit(0)
    except Exception as e:
        log(f"FATAL ERROR: Worker crashed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
