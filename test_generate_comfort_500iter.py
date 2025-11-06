import os
import logging
from src.components.cfd.hvac import setup as hvac_setup
from src.components.tools.clear_case import clean_case_keep_mesh

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s - %(message)s'
)

# Generate CFD case for Thermal Comfort (500 iterations)
case_name = "test_simple_room"
case_path = os.path.join(os.getcwd(), "cases", case_name)

print(f"\n=== Generating Thermal Comfort CFD case (500 iter): {case_name} ===\n")

# Clean case directory while preserving mesh
print("1. Cleaning case directory...")
clean_case_keep_mesh(case_path)

# Setup HVAC CFD simulation with comfort30Iter (500 iterations)
print("2. Setting up HVAC CFD configuration for Thermal Comfort...")
solve_script = hvac_setup(case_path, simulation_type='comfort30Iter')

print("\n✅ Thermal Comfort CFD case generated successfully!")
print(f"   Case location: {case_path}/sim")
print(f"   Simulation type: comfort30Iter")
print(f"   Configuration:")
print(f"      - Iterations: 500")
print(f"      - writeInterval: 500 (only last iteration)")
print(f"      - purgeWrite: 1 (keep only last timestep)")
print(f"   Result storage: Only iteration 500 will be saved")
