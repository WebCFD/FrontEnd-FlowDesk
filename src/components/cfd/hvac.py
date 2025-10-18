import os
import shutil
import logging
import numpy as np
import pandas as pd

from foamlib import FoamCase, FoamFile


logger = logging.getLogger(__name__)



# CONSTANTS FOR THERMOPHYSICS
CP = 1005.0  # Specific heat capacity [J/(kg·K)]
TREF = 293.15  # Reference temperature [K] - must match T0 in thermophysicalProperties
HF = 0.0  # Formation enthalpy [J/kg]

# DIMENSIONS
DIMENSIONS_DICT = {
    'alphat':   FoamFile.DimensionSet(mass=1, length=-1, time=-1),
    'DR':       FoamFile.DimensionSet(),
    'epsilon':  FoamFile.DimensionSet(length=2, time=-3),
    'h':        FoamFile.DimensionSet(length=2, time=-2),  # J/kg = m²/s²
    'k':        FoamFile.DimensionSet(length=2, time=-2),
    'nut':      FoamFile.DimensionSet(length=2, time=-1),
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
    'h':        0.0,  # h = Cp×(T-Tref) + Hf = 1005×(293.15-293.15) + 0 = 0
    'k':        0.08,
    'nut':      0,
    'p':        101325,
    'p_rgh':    0,
    'PMV':      1.40936,
    'PPD':      46.0115,
    'T':        293.15,
    'U':        np.array([0, 0, 0]),
}


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


def define_initial_files(sim_path, patch_df):
    os.makedirs(sim_path, exist_ok=True)

    # Create 0.orig/ directory for initial conditions
    # This will be copied to 0/ after snappyHexMesh by Allrun script
    initial_path = os.path.join(sim_path, "0.orig")
    os.makedirs(initial_path, exist_ok=True)

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
                    elif(variable == 'h'):
                        # Enthalpy: h = Cp×(T-Tref) + Hf
                        new_bc_data["type"] = 'fixedValue'
                        T_wall = row['T'] + 273.15
                        new_bc_data["value"] = CP * (T_wall - TREF) + HF
                    elif(variable == 'k'):
                        new_bc_data["type"] = 'kqRWallFunction'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'nut'):
                        new_bc_data["type"] = 'nutkWallFunction'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
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
                    elif(variable == 'h'):
                        # Enthalpy: h = Cp×(T-Tref) + Hf
                        new_bc_data["type"] = 'fixedValue'
                        T_wall = row['T'] + 273.15
                        new_bc_data["value"] = CP * (T_wall - TREF) + HF
                    elif(variable == 'k'):
                        new_bc_data["type"] = 'turbulentIntensityKineticEnergyInlet'
                        new_bc_data["intensity"] = 0.14
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'nut'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
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
                    elif(variable == 'h'):
                        # Enthalpy: h = Cp×(T-Tref) + Hf
                        new_bc_data["type"] = 'fixedValue'
                        T_wall = row['T'] + 273.15
                        new_bc_data["value"] = CP * (T_wall - TREF) + HF
                    elif(variable == 'k'):
                        new_bc_data["type"] = 'turbulentIntensityKineticEnergyInlet'
                        new_bc_data["intensity"] = 0.14
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'nut'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p_rgh'):
                        # Use fixedValue for pressure inlet with specified pressure differential
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = row['pressure']
                    elif(variable == 'PMV'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = -1.18438
                    elif(variable == 'PPD'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 34.4876
                    elif(variable == 'T'):
                        # Fixed temperature at pressure inlet
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = row['T'] + 273.15
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
                    elif(variable == 'h'):
                        # Enthalpy outlet: allow inflow at reference temperature
                        new_bc_data["type"] = 'inletOutlet'
                        new_bc_data["inletValue"] = 0.0  # h = Cp×(Tref-Tref) + Hf = 0
                        T_outlet = row['T'] + 273.15
                        new_bc_data["value"] = CP * (T_outlet - TREF) + HF
                    elif(variable == 'k'):
                        new_bc_data["type"] = 'inletOutlet'
                        new_bc_data["inletValue"] = '$internalField'
                    elif(variable == 'nut'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p_rgh'):
                        # Use fixedValue for pressure outlet with specified pressure differential
                        new_bc_data["type"] = 'fixedValue'
                        new_bc_data["value"] = row['pressure']
                    elif(variable == 'PMV'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 1.40936
                    elif(variable == 'PPD'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = 46.0115
                    elif(variable == 'T'):
                        # Use buoyant-specific outlet BC that respects Boussinesq reference temperature
                        new_bc_data["type"] = 'inletOutlet'
                        new_bc_data["inletValue"] = 293.15  # TRef from thermophysicalProperties
                        new_bc_data["value"] = row['T'] + 273.15
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
                    elif(variable == 'k'):
                        new_bc_data["type"] = 'turbulentIntensityKineticEnergyInlet'
                        new_bc_data["intensity"] = 0.14
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'nut'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
                    elif(variable == 'p'):
                        new_bc_data["type"] = 'calculated'
                        new_bc_data["value"] = '$internalField'
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


def setup(case_path: str) -> list:
    """
    Set up HVAC CFD simulation case with boundary conditions and solver configuration.
    
    Args:
        case_path: Path to the case directory
        
    Returns:
        List of script commands for CFD simulation
    """
    logger.info(f"    * Setting up HVAC CFD simulation case: {case_path}")
    
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

    script_commands = [
        # Run solver in parallel
        'runParallel -np 16 buoyantSimpleFoam -parallel',

        # 3. Reconstruct the results back into serial for post-processing
        'runApplication reconstructPar -latestTime',

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