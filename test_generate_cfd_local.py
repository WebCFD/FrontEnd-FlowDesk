import os
import logging
from src.components.cfd.hvac import setup as hvac_setup
from src.components.tools.clear_case import clean_case_keep_mesh

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s - %(message)s'
)

# Generate CFD case locally
case_name = "test_simple_room"
case_path = os.path.join(os.getcwd(), "cases", case_name)

print(f"\n=== Generating CFD case for: {case_name} ===\n")

# Clean case directory while preserving mesh
print("1. Cleaning case directory...")
clean_case_keep_mesh(case_path)

# Setup HVAC CFD simulation
print("2. Setting up HVAC CFD configuration...")
solve_script = hvac_setup(case_path, simulation_type='comfortTest')

print("\n✅ CFD case generated successfully!")
print(f"   Case location: {case_path}/sim")
print(f"   Simulation type: comfortTest (3 iterations, write every iteration)")
