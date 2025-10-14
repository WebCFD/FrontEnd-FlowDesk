import os
import pyvista as pv


def load_foam_results(sim_path: str):
    foam_path = os.path.join(sim_path, "results.foam")
    reader = pv.get_reader(foam_path)
    reader.set_active_time_value(reader.time_values[-1])
    return reader.read()