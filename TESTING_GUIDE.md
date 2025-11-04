# Testing Guide

## CRITICAL: Always Test with Production Configuration

**RULE**: Local tests MUST use the same mesher configuration as Inductiva production.

### Current Production Configuration

```python
# mesher_config.py
DEFAULT_MESHER = "hvac_pro"
DEFAULT_QUALITY_LEVEL = 1
```

### How to Run Tests

**✅ CORRECT - Replicates Inductiva:**
```python
from step02_geo2mesh import run as geo2mesh

# Use hvac_pro with quality_level=1 (same as Inductiva)
mesh_script = geo2mesh(case_name, geo_mesh, geo_df, 
                       type="hvac_pro",     # ← MUST match mesher_config.py
                       quality_level=1)      # ← MUST match mesher_config.py
```

**❌ WRONG - Does NOT replicate Inductiva:**
```python
# Don't hardcode different mesher types
mesh_script = geo2mesh(..., type="snappy", quality_level=1)  # ❌ Wrong!
mesh_script = geo2mesh(..., type="cfmesh", quality_level=1)  # ❌ Wrong!
```

### Why This Matters

**Problem**: If tests use a different mesher than production, they:
- ✗ Don't catch production bugs
- ✗ Use different templates/code paths
- ✗ Give false confidence

**Solution**: Always use `get_default_mesher()` in tests:
```python
from mesher_config import get_default_mesher, get_default_quality_level

mesher_type = get_default_mesher()        # Returns 'hvac_pro'
quality_level = get_default_quality_level()  # Returns 1

mesh_script = geo2mesh(case_name, geo_mesh, geo_df,
                       type=mesher_type,
                       quality_level=quality_level)
```

### Template Locations

Different meshers use different templates:

| Mesher | Template Path | Used By |
|--------|--------------|---------|
| `hvac_pro` | `data/settings/mesh/hvac_pro/` | ✅ Inductiva Production |
| `snappy` | `data/settings/mesh/snappy/` | ❌ Legacy/unused |
| `cfmesh` | `data/settings/mesh/cfmesh/` | ❌ Not available on Inductiva |

### Recent Fix (Nov 4, 2025)

**Issue**: Tests were using `type="snappy"` while Inductiva uses `type="hvac_pro"`
- Tests passed locally but failed in production
- Root cause: Different code paths, different templates

**Fix Applied**:
1. Updated `hvac_pro.py` to match `snappy.py` fixes
2. Added global parameters to hvac_pro template
3. This guide created to prevent future discrepancies

---

**Remember**: If your test doesn't use hvac_pro, it's not testing production code! 🎯
