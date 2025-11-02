# 🔧 Mesher Configuration Guide

## Quick Start

To switch between cfMesh and snappyHexMesh globally, edit **ONE line** in `mesher_config.py`:

```python
# In mesher_config.py, line 8:
DEFAULT_MESHER = "cfmesh"  # Change to "snappy" to use snappyHexMesh
```

That's it! All pipeline components will automatically use the selected mesher.

## Options

### cfMesh (Recommended for HVAC)
```python
DEFAULT_MESHER = "cfmesh"
```

**Best for:**
- Single-zone rooms with pressure boundaries (windows, doors, vents)
- HVAC thermal comfort simulations
- Cases requiring accurate boundary layers

**Advantages:**
- ✅ Automatic boundary layers (>90% coverage)
- ✅ Pressure boundaries get 2x finer mesh automatically
- ✅ 2-5x faster meshing
- ✅ Single-command workflow

### snappyHexMesh
```python
DEFAULT_MESHER = "snappy"
```

**Best for:**
- Multi-region cases
- Rotating machinery
- Complex industrial equipment

**Advantages:**
- ✅ Flexible multi-region support
- ✅ Mature and well-documented
- ✅ Good for complex geometries

## Files That Use This Configuration

The following files automatically read from `mesher_config.py`:
- `worker_submit.py` (production worker)
- `worker.py` (legacy worker)
- `step02_geo2mesh.py` (standalone script)
- `test_pipeline_inductiva.py` (Inductiva tests)
- `test_pipeline_local.py` (local tests)

## Verification

After changing the mesher, check the logs for confirmation:

**cfMesh:**
```
Using mesher: cfmesh
* Preparing cfMesh configuration for X geometry cells
Running cartesianMesh
```

**snappyHexMesh:**
```
Using mesher: snappy
* Preparing snappyHexMesh configuration for X geometry cells
Running blockMesh
Running snappyHexMesh
```

## Technical Details

The configuration is implemented via:
1. `mesher_config.py` - Central configuration file
2. `get_default_mesher()` - Function that returns the configured mesher
3. All pipeline components import and use this function

This ensures consistency across all execution paths (production, testing, development).
