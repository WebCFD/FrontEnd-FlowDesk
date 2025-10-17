"""
Convert VTK text format files to vtkjs JSON format for web visualization.
"""
import json
import numpy as np
import pyvista as pv
import logging

logger = logging.getLogger(__name__)


def vtk_to_vtkjs(vtk_path: str, output_path: str) -> None:
    """
    Convert a VTK file to vtkjs JSON format.
    
    Args:
        vtk_path: Path to input .vtk file
        output_path: Path to output .vtkjs file
    """
    try:
        # Load VTK file
        mesh = pv.read(vtk_path)
        
        # If it's an UnstructuredGrid (3D volume), extract surface to get all faces
        # This is what ParaView does - shows the surface representation of the volume
        if hasattr(mesh, 'extract_surface'):
            logger.info(f"    * Extracting surface from 3D volume...")
            mesh = mesh.extract_surface()
        
        # Extract geometry
        points = mesh.points.flatten().tolist()
        
        # Extract polygons/cells (now guaranteed to be surface faces)
        if mesh.faces.size > 0:
            # PolyData with faces
            polys = mesh.faces.tolist()
        else:
            polys = []
        
        # Build vtkjs structure
        vtkjs_data = {
            "vtkClass": "vtkPolyData",
            "points": {
                "vtkClass": "vtkPoints",
                "name": "_points",
                "numberOfComponents": 3,
                "dataType": "Float32Array",
                "size": len(mesh.points) * 3,
                "values": points
            },
            "polys": {
                "vtkClass": "vtkCellArray",
                "name": "_polys",
                "numberOfComponents": 1,
                "dataType": "Uint32Array",
                "size": len(polys),
                "values": polys
            },
            "pointData": {
                "vtkClass": "vtkDataSetAttributes",
                "activeScalars": 0,
                "arrays": []
            }
        }
        
        # Add point data arrays (fields like T, U, p)
        for array_name in mesh.point_data.keys():
            array = mesh.point_data[array_name]
            
            # Handle vector and scalar data
            if array.ndim == 1:
                # Scalar data
                n_components = 1
                values = array.tolist()
            else:
                # Vector data (e.g., velocity)
                n_components = array.shape[1]
                values = array.flatten().tolist()
            
            vtkjs_data["pointData"]["arrays"].append({
                "data": {
                    "vtkClass": "vtkDataArray",
                    "name": array_name,
                    "numberOfComponents": n_components,
                    "dataType": "Float32Array",
                    "size": len(values),
                    "values": values
                }
            })
        
        # Set first array as active scalars if available
        if len(vtkjs_data["pointData"]["arrays"]) > 0:
            vtkjs_data["pointData"]["activeScalars"] = 0
        
        # Write JSON file
        with open(output_path, 'w') as f:
            json.dump(vtkjs_data, f)
        
        logger.info(f"    * Converted VTK to vtkjs: {output_path}")
        logger.info(f"      - Points: {len(mesh.points)}")
        logger.info(f"      - Arrays: {len(vtkjs_data['pointData']['arrays'])}")
        
    except Exception as e:
        logger.error(f"    * Failed to convert VTK to vtkjs: {e}")
        raise


if __name__ == "__main__":
    # Test conversion
    import sys
    if len(sys.argv) != 3:
        print("Usage: python vtk_to_vtkjs.py <input.vtk> <output.vtkjs>")
        sys.exit(1)
    
    vtk_to_vtkjs(sys.argv[1], sys.argv[2])
