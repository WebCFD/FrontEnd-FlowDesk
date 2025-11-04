import os
import shutil
import logging
import numpy as np
import pandas as pd

from foamlib import FoamCase, FoamFile


logger = logging.getLogger(__name__)



# CONSTANTS FOR THERMOPHYSICS
CP = 1005.0  # Specific heat at constant pressure [J/(kg·K)]
HF = 0.0  # Formation enthalpy [J/kg]
# Note: Using Boussinesq (incompressiblePerfectGas + hConst): h = Cp×T, ρ = pRef/(R×T)

# DIMENSIONS
DIMENSIONS_DICT = {
    'alphat':   FoamFile.DimensionSet(mass=1, length=-1, time=-1),
    'DR':       FoamFile.DimensionSet(),
    'epsilon':  FoamFile.DimensionSet(length=2, time=-3),
    'h':        FoamFile.DimensionSet(length=2, time=-2),  # J/kg = m²/s²
    'k':        FoamFile.DimensionSet(length=2, time=-2),
    'nut':      FoamFile.DimensionSet(length=2, time=-1),
    'omega':    FoamFile.DimensionSet(time=-1),  # 1/s
    'p':        FoamFile.DimensionSet(mass=1, length=-1, time=-2),
    'p_rgh':    FoamFile.DimensionSet(mass=1, length=-1, time=-2),
    'PMV':      FoamFile.DimensionSet(),
    'PPD':      FoamFile.DimensionSet(),
    'T':        FoamFile.DimensionSet(temperature=1),
    'U':        FoamFile.DimensionSet(length=1, time=-1),
}

INTERNALFIELD_DICT = {
    'alphat':   0,
    'DR':       0,
    'epsilon':  0.23,
    'h':        294515.75,  # h = Cp×T = 1005×293.15 for Boussinesq
    'k':        0.08,
    'nut':      0,
    'omega':    0.5,
    'p':        101325,     # Atmospheric pressure [Pa]
    'p_rgh':    0,          # Hydrostatic-corrected pressure [Pa]
    'PMV':      1.40936,
    'PPD':      46.0115,
    'T':        293.15,     # Reference temperature for Boussinesq [K] (20°C)
    'U':        np.array([0, 0, 0]),
}

# Reference values for pressure calculations
P_ATM = 101325  # Atmospheric pressure [Pa]


def define_constant_files(template_path, sim_path):
    source_constant_path = os.path.join(template_path, 'constant')
    target_constant_path = os.path.join(sim_path, 'constant')
    for filename in os.listdir(source_constant_path):
        source_file = os.path.join(source_constant_path, filename)
        target_file = os.path.join(target_constant_path, filename)
        shutil.copy(src=source_file, dst=target_file)


def define_system_files(template_path, sim_path):
    source_constant_path = os.path.join(template_path, 'system')
    target_constant_path = os.path.join(sim_path, 'system')
    for filename in os.listdir(source_constant_path):
        source_file = os.path.join(source_constant_path, filename)
        target_file = os.path.join(target_constant_path, filename)
        shutil.copy(src=source_file, dst=target_file)


def update_controldict_iterations(case_path, simulation_type):
    """
    Update controlDict endTime and writeInterval based on simulation type.
    
    Maps simulation types to iteration counts:
    - comfortTest: 3 iterations (fast test)
    - comfort30Iter: 30 iterations (full simulation)
    - test_calculation: 3 iterations (default)
    
    Args:
        case_path: Path to case directory
        simulation_type: Type of simulation (comfortTest, comfort30Iter, test_calculation)
    """
    logger.info(f"    * Updating controlDict iterations for simulation type: {simulation_type}")
    
    # Map simulation types to iterations
    iterations_map = {
        'comfortTest': 3,
        'comfort30Iter': 30,
        'test_calculation': 3
    }
    
    iterations = iterations_map.get(simulation_type, 3)  # Default to 3 if type unknown
    logger.info(f"    * Setting endTime to {iterations} iterations")
    
    sim_path = os.path.join(case_path, "sim")
    case = FoamCase(sim_path)
    with case['system']['controlDict'] as ctrl:
        ctrl['endTime'] = iterations
        ctrl['writeInterval'] = iterations  # Write only at end (when timeStep == endTime)
        
        # CRITICAL: Also update VTK function writeInterval to avoid intermediate writes
        if 'functions' in ctrl and 'writeVTK' in ctrl['functions']:
            ctrl['functions']['writeVTK']['writeInterval'] = iterations
            logger.info(f"    * Updated VTK writeInterval to {iterations}")
        
        logger.info(f"    * ✅ controlDict fully updated: endTime={iterations}, writeInterval={iterations}")


def update_controldict_patches(sim_path, patch_df):
    """
    Update controlDict with actual floor/ceiling patch names from the mesh.
    
    Extracts all patches starting with 'floor_' or 'ceil_' (e.g., floor_0F, ceil_1F)
    and updates the VTK sampling surface definition in controlDict.
    
    Args:
        sim_path: Path to simulation directory
        patch_df: DataFrame containing boundary condition information
    """
    logger.info("    * Updating controlDict with actual floor/ceiling patch names")
    
    # Extract all floor and ceiling patches
    floor_ceiling_patches = []
    for _, row in patch_df.iterrows():
        patch_name = row['id']
        if patch_name.startswith('floor_') or patch_name.startswith('ceil_'):
            floor_ceiling_patches.append(patch_name)
    
    if not floor_ceiling_patches:
        logger.warning("    * No floor/ceiling patches found for VTK sampling - skipping controlDict update")
        return
    
    logger.info(f"    * Found {len(floor_ceiling_patches)} floor/ceiling patches: {floor_ceiling_patches}")
    
    # Update controlDict using foamlib
    case = FoamCase(sim_path)
    with case['system']['controlDict'] as ctrl:
        # Navigate to writeVTK function and update patches list
        if 'functions' in ctrl and 'writeVTK' in ctrl['functions']:
            if 'surfaces' in ctrl['functions']['writeVTK']:
                if 'internalMesh' in ctrl['functions']['writeVTK']['surfaces']:
                    # Update the patches list with actual floor/ceiling names
                    ctrl['functions']['writeVTK']['surfaces']['internalMesh']['patches'] = floor_ceiling_patches
                    logger.info(f"    * Updated controlDict patches successfully")
                else:
                    logger.warning("    * 'internalMesh' not found in controlDict surfaces")
            else:
                logger.warning("    * 'surfaces' not found in controlDict writeVTK function")
        else:
            logger.warning("    * 'writeVTK' function not found in controlDict")


def define_initial_files(sim_path, patch_df):
    os.makedirs(sim_path, exist_ok=True)

    # Create 0.orig/ directory for initial conditions
    # This will be copied to 0/ after snappyHexMesh by Allrun script
    initial_path = os.path.join(sim_path, "0.orig")
    os.makedirs(initial_path, exist_ok=True)

    # ============ STABILITY TEST MODE ============
    # Set to True to test solver stability with equilibrium solution (all walls, uniform fields)
    # Set to False to use normal boundary conditions from JSON
    STABILITY_TEST_MODE = False
    # =============================================
    
    if STABILITY_TEST_MODE:
        logger.info("=" * 80)
        logger.info("*** STABILITY TEST MODE ACTIVE ***")
        logger.info("*** All patches forced to wall BCs with uniform initial conditions ***")
        logger.info("*** This tests if solver is stable starting from equilibrium ***")
        logger.info("=" * 80)
        
        case = FoamCase(sim_path)
        for variable in DIMENSIONS_DICT.keys():
            with case['0.orig'][variable] as f:
                f.dimensions = DIMENSIONS_DICT[variable]
                f.internal_field = INTERNALFIELD_DICT[variable]
                
                f.boundary_field = dict()
                for _, row in patch_df.iterrows():
                    new_bc_data = dict()
                    
                    # Force all patches to wall-type boundary conditions
                    if(variable == 'alphat'):
                        new_bc_data["type"] = 'compressible::alphatJayatillekeWallFunction'
                        new_bc_data["Prt"] = 0.85
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'DR'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 0
                    elif(variable == 'epsilon'):
                        new_bc_data["type"] = 'epsilonWallFunction'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'omega'):
                        new_bc_data["type"] = 'omegaWallFunction'
                        new_bc_data["value"] = 0.5
                    elif(variable == 'h'):
                        # Uniform enthalpy at 20°C (equilibrium)
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = CP * 293.15  # h = Cp×T = 294515.75 J/kg
                    elif(variable == 'k'):
                        new_bc_data["type"] = 'kqRWallFunction'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'nut'):
                        new_bc_data["type"] = 'nutkWallFunction'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = P_ATM
                    elif(variable == 'p_rgh'):
                        new_bc_data["type"] = 'fixedFluxPressure'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'PMV'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 0
                    elif(variable == 'PPD'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 5
                    elif(variable == 'T'):
                        # Uniform temperature at 20°C (equilibrium)
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = 293.15  # 20°C
                    elif(variable == 'U'):
                        # No-slip walls (zero velocity everywhere)
                        new_bc_data["type"] = 'noSlip'
                    else:
                        raise BaseException('Unknown variable')
                    
                    f.boundary_field[row['id']] = new_bc_data
        
        logger.info("*** Stability test initial conditions created successfully ***")
        return
    
    # ============ NORMAL MODE (ORIGINAL CODE) ============
    case = FoamCase(sim_path)
    for variable in DIMENSIONS_DICT.keys():
        with case['0.orig'][variable] as f:
            f.dimensions = DIMENSIONS_DICT[variable]
            f.internal_field = INTERNALFIELD_DICT[variable]

            f.boundary_field = dict()
            for _, row in patch_df.iterrows():
                new_bc_data = dict()
                if(row['type'] == 'wall'):
                    if(variable == 'alphat'):
                        new_bc_data["type"] = 'compressible::alphatJayatillekeWallFunction'
                        new_bc_data["Prt"] = 0.85
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'DR'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 0
                    elif(variable == 'epsilon'):
                        new_bc_data["type"] = 'epsilonWallFunction'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'omega'):
                        new_bc_data["type"] = 'omegaWallFunction'
                        new_bc_data["value"] = 0.5
                    elif(variable == 'h'):
                        # Enthalpy for perfectGas: h = Cp×T
                        new_bc_data["type"] = 'fixedValue'
                        T_celsius = row['T']
                        T_wall = T_celsius + 273.15
                        h_value = CP * T_wall
                        logger.info(f"    BC {row['id']} ({row['type']}): T={T_celsius}°C → T_K={T_wall}K → h={h_value} J/kg")
                        new_bc_data["value"] = h_value
                    elif(variable == 'k'):
                        new_bc_data["type"] = 'kqRWallFunction'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'nut'):
                        new_bc_data["type"] = 'nutkWallFunction'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p'):
                        # p = p_rgh + p_atm (for walls, p_rgh ≈ 0)
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = P_ATM
                    elif(variable == 'p_rgh'):
                        new_bc_data["type"] = 'fixedFluxPressure'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'PMV'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 1.40936
                    elif(variable == 'PPD'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 46.0115
                    elif(variable == 'T'):
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = row['T'] + 273.15
                    elif(variable == 'U'):
                        new_bc_data["type"] = 'noSlip'
                    else:
                        raise BaseException('Unknown variable')
                elif(row['type'] == 'velocity_inlet'):
                    if(variable == 'alphat'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'DR'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 16.61
                    elif(variable == 'epsilon'):
                        new_bc_data["type"] = 'turbulentMixingLengthDissipationRateInlet'
                        new_bc_data["mixingLength"] = 0.0168
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'omega'):
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = 0.5
                    elif(variable == 'h'):
                        # Enthalpy for perfectGas: h = Cp×T
                        new_bc_data["type"] = 'fixedValue'
                        T_celsius = row['T']
                        T_wall = T_celsius + 273.15
                        h_value = CP * T_wall
                        logger.info(f"    BC {row['id']} ({row['type']}): T={T_celsius}°C → T_K={T_wall}K → h={h_value} J/kg")
                        new_bc_data["value"] = h_value
                    elif(variable == 'k'):
                        new_bc_data["type"] = 'turbulentIntensityKineticEnergyInlet'
                        new_bc_data["intensity"] = 0.14
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'nut'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p'):
                        # p = p_rgh + p_atm (for walls, p_rgh ≈ 0)
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = P_ATM
                    elif(variable == 'p_rgh'):
                        new_bc_data["type"] = 'fixedFluxPressure'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'PMV'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = -1.18438
                    elif(variable == 'PPD'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 34.4876
                    elif(variable == 'T'):
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = row['T'] + 273.15
                    elif(variable == 'U'):
                        new_bc_data["type"] = 'fixedValue'
                        if (row['open']):
                            new_bc_data["value"] = row['U'] * np.array([row['nx'], row['ny'], row['nz']])
                        else:
                            new_bc_data["value"] = np.array([0, 0, 0])
                    else:
                        raise BaseException('Unknown variable')
                elif(row['type'] == 'pressure_inlet'):
                    if(variable == 'alphat'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'DR'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 16.61
                    elif(variable == 'epsilon'):
                        new_bc_data["type"] = 'turbulentMixingLengthDissipationRateInlet'
                        new_bc_data["mixingLength"] = 0.0168
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'omega'):
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = 0.5
                    elif(variable == 'h'):
                        # Enthalpy inlet: zeroGradient to avoid overconstraining with fixedValue p_rgh
                        new_bc_data["type"] = 'zeroGradient'
                        logger.info(f"    BC {row['id']} ({row['type']}): h = zeroGradient (temperature adapts to flow)")
                    elif(variable == 'k'):
                        new_bc_data["type"] = 'turbulentIntensityKineticEnergyInlet'
                        new_bc_data["intensity"] = 0.14
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'nut'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p'):
                        # Let solver calculate p from p_rgh + ρ·g·h + p_ref (hydrostatic consistency)
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p_rgh'):
                        # Use fixedValue for pressure inlet (simple and stable)
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = 0  # p_rgh = 0 at atmospheric pressure opening
                    elif(variable == 'PMV'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = -1.18438
                    elif(variable == 'PPD'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 34.4876
                    elif(variable == 'T'):
                        # Temperature inlet: zeroGradient to avoid overconstraining with fixedValue p_rgh
                        new_bc_data["type"] = 'zeroGradient'
                    elif(variable == 'U'):
                        if (row['open']):
                            # Use pressureInletOutletVelocity for pressure-driven inflow
                            new_bc_data["type"] = 'pressureInletOutletVelocity'
                            new_bc_data["value"] = '$internalField'
                        else:
                            new_bc_data["type"] = 'fixedValue'
                            new_bc_data["value"] = np.array([0, 0, 0])
                    else:
                        raise BaseException('Unknown variable')
                elif(row['type'] == 'pressure_outlet'):
                    if(variable == 'alphat'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'DR'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 0
                    elif(variable == 'epsilon'):
                        new_bc_data["type"] = 'inletOutlet'
                        new_bc_data["inletValue"] = '$internalField'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'omega'):
                        new_bc_data["type"] = 'inletOutlet'
                        new_bc_data["inletValue"] = 0.5
                        new_bc_data["value"] = 0.5
                    elif(variable == 'h'):
                        # Enthalpy outlet: zeroGradient to avoid overconstraining with fixedValue p_rgh
                        new_bc_data["type"] = 'zeroGradient'
                    elif(variable == 'k'):
                        new_bc_data["type"] = 'inletOutlet'
                        new_bc_data["inletValue"] = '$internalField'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'nut'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p'):
                        # Let solver calculate p from p_rgh + ρ·g·h + p_ref (hydrostatic consistency)
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p_rgh'):
                        # Use fixedValue for pressure outlet (simple and stable)
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = 0  # p_rgh = 0 at atmospheric pressure opening
                    elif(variable == 'PMV'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 1.40936
                    elif(variable == 'PPD'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 46.0115
                    elif(variable == 'T'):
                        # Temperature outlet: zeroGradient to avoid overconstraining with fixedValue p_rgh
                        new_bc_data["type"] = 'zeroGradient'
                    elif(variable == 'U'):
                        if (row['open']):
                            # Use inletOutlet for adjustable mass flow conservation
                            new_bc_data["type"] = 'inletOutlet'
                            new_bc_data["inletValue"] = '$internalField'
                            new_bc_data["value"] = '$internalField'
                            new_bc_data["phi"] = 'phi'  # Required for SIMPLE to recognize as adjustable outflow
                        else:
                            new_bc_data["type"] = 'fixedValue'
                            new_bc_data["value"] = np.array([0, 0, 0])
                    else:
                        raise BaseException('Unknown variable')
                elif(row['type'] == 'mass_flow_inlet'):
                    if(variable == 'alphat'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'DR'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 16.61
                    elif(variable == 'epsilon'):
                        new_bc_data["type"] = 'turbulentMixingLengthDissipationRateInlet'
                        new_bc_data["mixingLength"] = 0.0168
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'omega'):
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = 0.5
                    elif(variable == 'h'):
                        # Enthalpy for perfectGas: h = Cp×T
                        new_bc_data["type"] = 'fixedValue'
                        T_inlet = row['T'] + 273.15
                        new_bc_data["value"] = CP * T_inlet
                    elif(variable == 'k'):
                        new_bc_data["type"] = 'turbulentIntensityKineticEnergyInlet'
                        new_bc_data["intensity"] = 0.14
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'nut'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p'):
                        # p = p_rgh + p_atm (for walls, p_rgh ≈ 0)
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = P_ATM
                    elif(variable == 'p_rgh'):
                        new_bc_data["type"] = 'fixedFluxPressure'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'PMV'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = -1.18438
                    elif(variable == 'PPD'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 34.4876
                    elif(variable == 'T'):
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = row['T'] + 273.15
                    elif(variable == 'U'):
                        # Use flowRateInletVelocity for mass flow inlet
                        # Convert m³/h to m³/s: massFlow (m³/h) / 3600
                        new_bc_data["type"] = 'flowRateInletVelocity'
                        new_bc_data["volumetricFlowRate"] = row['massFlow'] / 3600.0
                        new_bc_data["value"] = '$internalField'
                    else:
                        raise BaseException('Unknown variable')
                else:
                    raise BaseException('Boundary Condition Type Unknown')

                f.boundary_field[row['id']] = new_bc_data


def setup(case_path: str, simulation_type: str = 'comfortTest') -> list:
    """
    Set up HVAC CFD simulation case with boundary conditions and solver configuration.
    
    Args:
        case_path: Path to the case directory
        simulation_type: Simulation iteration type (comfortTest=3 iter, comfort30Iter=30 iter)
        
    Returns:
        List of script commands for CFD simulation
    """
    logger.info(f"    * Setting up HVAC CFD simulation case: {case_path}")
    logger.info(f"    * Simulation type: {simulation_type}")
    
    # Load boundary condition information
    geo_df_file = os.path.join(case_path, "geo", "patch_info.csv")
    logger.info(f"    * Loading boundary condition data from: {geo_df_file}")
    if(not os.path.isfile(geo_df_file)):
        logger.error("    * Boundary condition file not found")
        raise BaseException("The case has no information about boundary conditions")
    geo_df = pd.read_csv(geo_df_file)
    logger.info(f"    * Loaded {len(geo_df)} boundary condition patches")

    sim_path = os.path.join(case_path, "sim")
    logger.info(f"    * Setting up simulation directory: {sim_path}")
    
    logger.info("    * Creating initial field files")
    define_initial_files(sim_path, geo_df)

    template_path = os.path.join(os.getcwd(), "data", "settings", "cfd", "hvac")
    logger.info(f"    * Loading CFD configuration templates from: {template_path}")
    
    logger.info("    * Setting up constant files (thermophysical properties, turbulence models)")
    define_constant_files(template_path, sim_path)
    
    logger.info("    * Setting up system files (solver settings, discretization schemes)")
    define_system_files(template_path, sim_path)
    
    logger.info("    * Updating controlDict with actual floor/ceiling patches from mesh")
    update_controldict_patches(sim_path, geo_df)
    
    logger.info(f"    * Updating controlDict iterations based on simulation type: {simulation_type}")
    update_controldict_iterations(case_path, simulation_type)

    script_commands = [
        # Copy initial conditions from 0.orig to 0
        'echo "==================== COPYING INITIAL CONDITIONS FROM 0.orig TO 0 ===================="',
        'rm -rf 0',
        'cp -r 0.orig 0',
        'echo "==================== INITIAL CONDITIONS COPIED ===================="',
        
        # Decompose for parallel execution
        'rm -rf processor*',
        'runApplication decomposePar',
        
        # DEBUG: Copiar archivos de processor0 para inspección
        'echo "==================== DEBUG: Copying processor0 files ===================="',
        'mkdir -p debug_files',
        'cp processor0/0/h debug_files/processor0_h',
        'cp processor0/0/U debug_files/processor0_U',
        'cp processor0/0/p_rgh debug_files/processor0_p_rgh',
        'cp processor0/constant/thermophysicalProperties debug_files/processor0_thermo',
        'echo "==================== DEBUG FILES COPIED ===================="',
        
        # Initialize velocity and pressure fields with Laplacian solution for better stability
        'echo "==================== INITIALIZING FIELDS WITH potentialFoam ===================="',
        'runParallel -np 16 potentialFoam -initialiseUBCs -parallel',
        'echo "==================== FIELD INITIALIZATION COMPLETED ===================="',
        
        # Run solver in parallel
        'runParallel -np 16 buoyantSimpleFoam -parallel',

        # 3. Reconstruct the results back into serial for post-processing
        'runApplication reconstructPar -latestTime',

        # 3.5. Calculate PMV/PPD thermal comfort fields from T and U
        'echo "==================== CALCULATING PMV/PPD THERMAL COMFORT ===================="',
        'python3 /workspace/src/components/post/calculate_comfort.py . 2>&1 | tee log.comfort',
        'echo "==================== PMV/PPD CALCULATION COMPLETED ===================="',

        # 4. Generate VTK surface files (external surfaces only, optimized for web viewer)
        # -surfaceFields: Only surface data (walls, boundaries)
        # -faceSet: All faces including internal ones (for volume representation)
        'runApplication foamToVTK -latestTime -surfaceFields -fields "(T U p p_rgh PMV PPD)"',

        # Clean processors
        'rm -rf processor*',
        ]
    
    logger.info("    * HVAC CFD case setup completed successfully")
    return script_commands


if __name__ == "__main__":
    case_folder = "case"
    result = setup(case_folder)