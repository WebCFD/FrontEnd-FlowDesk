#!/usr/bin/env python3
"""
Verification script to check if locationInMesh is calculated correctly.
Run this on the worker before submitting to Inductiva.
"""
import json
import sys
import re
from step01_json2geo import run as json2geo
from step02_geo2mesh import run as geo2mesh

def verify_locationinmesh(json_file, expected_coords):
    """
    Verify that locationInMesh is calculated correctly.
    
    Args:
        json_file: Path to input JSON
        expected_coords: Expected (x, y, z) coordinates
    
    Returns:
        bool: True if correct, False otherwise
    """
    print("="*80)
    print("VERIFICATION: locationInMesh Calculation")
    print("="*80)
    
    # Load JSON
    with open(json_file, 'r') as f:
        json_payload = json.load(f)
    
    # Generate geometry and mesh
    case_name = "verify_test"
    final_geometry_mesh, boundary_conditions_df = json2geo(json_payload, case_name)
    mesh_script = geo2mesh(case_name, final_geometry_mesh, boundary_conditions_df, type="snappy", quality_level=1)
    
    # Read generated snappyHexMeshDict
    snappy_path = f"cases/{case_name}/sim/system/snappyHexMeshDict"
    with open(snappy_path, 'r') as f:
        content = f.read()
    
    # Extract locationInMesh
    match = re.search(r'locationInMesh \(([\d\.\-\s]+)\);', content)
    if not match:
        print("❌ FAILED: Could not find locationInMesh in generated file")
        return False
    
    coords = match.group(1).split()
    x, y, z = float(coords[0]), float(coords[1]), float(coords[2])
    
    print(f"\n✓ Generated locationInMesh:")
    print(f"  ({x:.6f}, {y:.6f}, {z:.6f})")
    
    print(f"\n✓ Expected locationInMesh:")
    print(f"  ({expected_coords[0]:.6f}, {expected_coords[1]:.6f}, {expected_coords[2]:.6f})")
    
    # Check if close to expected (tolerance 0.01m)
    tolerance = 0.01
    if (abs(x - expected_coords[0]) < tolerance and 
        abs(y - expected_coords[1]) < tolerance and 
        abs(z - expected_coords[2]) < tolerance):
        print(f"\n✅ PASS: locationInMesh is correct (within {tolerance}m tolerance)")
        return True
    else:
        print(f"\n❌ FAIL: locationInMesh is incorrect")
        print(f"   Offset: ({abs(x - expected_coords[0]):.3f}, {abs(y - expected_coords[1]):.3f}, {abs(z - expected_coords[2]):.3f})")
        print(f"\n   This means you are using OLD CODE!")
        print(f"   Expected: Geometric center with hybrid scoring")
        print(f"   Got: Old method or incorrect calculation")
        return False


if __name__ == "__main__":
    # Test with test_simple.json
    # Geometry bounds: X=[0,5], Y=[0,4], Z=[0,2.5]
    # Expected center: (2.5, 2.0, 1.25)
    
    result = verify_locationinmesh('input/test_simple.json', expected_coords=(2.5, 2.0, 1.25))
    
    print("\n" + "="*80)
    if result:
        print("✅ VERIFICATION PASSED - Code is up to date")
        print("="*80)
        sys.exit(0)
    else:
        print("❌ VERIFICATION FAILED - Using old code")
        print("   ACTION REQUIRED:")
        print("   1. Pull latest changes from Git")
        print("   2. Verify src/components/mesh/snappy.py is updated")
        print("   3. Re-run this script")
        print("="*80)
        sys.exit(1)
