"""
Centralized mesher configuration for HVAC CFD pipeline.

Change DEFAULT_MESHER to switch between meshing strategies globally.
"""

# =============================================================================
# MESHER CONFIGURATION - Change this single line to switch meshing strategy
# =============================================================================
DEFAULT_MESHER = "snappy"  # Options: "cfmesh" or "snappy"
# =============================================================================
# NOTE: cfMesh requires OpenFOAM ESI with cfMesh module compiled
#       Use "snappy" if cfMesh is not available in your OpenFOAM container

# Mesher descriptions for documentation
MESHER_INFO = {
    "cfmesh": {
        "name": "cfMesh",
        "description": "Recommended for HVAC applications with pressure boundaries",
        "advantages": [
            "Automatic boundary layers (>90% coverage)",
            "Differentiated refinement (pressure boundaries 2x finer)",
            "2-5x faster meshing",
            "Single-command workflow (cartesianMesh)"
        ],
        "best_for": "Single-zone rooms with windows/doors/vents"
    },
    "snappy": {
        "name": "snappyHexMesh",
        "description": "Standard OpenFOAM mesher for complex geometries",
        "advantages": [
            "Flexible multi-region meshing",
            "Good for rotating machinery",
            "Mature and well-documented"
        ],
        "best_for": "Multi-region cases or complex industrial equipment"
    }
}


def get_default_mesher():
    """Get the configured default mesher."""
    return DEFAULT_MESHER


def validate_mesher(mesher_type):
    """Validate that the mesher type is supported."""
    if mesher_type not in ["cfmesh", "snappy"]:
        raise ValueError(f"Unknown mesher type: {mesher_type}. Must be 'cfmesh' or 'snappy'")
    return mesher_type
