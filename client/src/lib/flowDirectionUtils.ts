const round5 = (v: number) => parseFloat(v.toFixed(5));

function normalize(v: { x: number; y: number; z: number }) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-9) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Compute the world-space flow direction for a wall-mounted entry
 * (wall vent, window, door).
 *
 * Coordinate frame:
 *   Local +Z = wall inward normal n = (nx, ny, 0)
 *   Local Y₀ = (0, 0, 1)  [world up]
 *   Local X₀ = (-ny, nx, 0) [horizontal along wall]
 *
 * ventRotation φ rotates X and Y around n (used only by wall vents).
 * verticalAngle θv tilts the arrow up/down (rotation.x on ventArrowsRoot).
 * horizontalAngle θh tilts the arrow left/right (rotation.y on ventArrowsRoot).
 *
 * Inflow direction in local frame: d = (cos(θv)·sin(θh), −sin(θv), cos(θv)·cos(θh))
 * Transformed to world:
 *   flowDir = LocalX_eff · d.x  +  LocalY_eff · d.y  +  n · d.z
 *
 * outflow → negate; equilibrium → same as inflow (backend decides via pressure).
 */
export function computeWallFlowDirection(
  wallNormal: { x: number; y: number; z: number },
  verticalAngle: number,
  horizontalAngle: number,
  ventRotation: number,
  airOrientation: string
): { x: number; y: number; z: number } {
  const nx = wallNormal.x;
  const ny = wallNormal.y;
  const θv = (verticalAngle * Math.PI) / 180;
  const θh = (horizontalAngle * Math.PI) / 180;
  const φ = (ventRotation * Math.PI) / 180;

  const cosφ = Math.cos(φ);
  const sinφ = Math.sin(φ);
  const cosθv = Math.cos(θv);
  const sinθv = Math.sin(θv);
  const cosθh = Math.cos(θh);
  const sinθh = Math.sin(θh);

  // Local X after ventRotation
  const Xx = -ny * cosφ - nx * sinφ;
  const Xy = nx * cosφ - ny * sinφ;
  // Xz = 0 (wall normal is in XY plane)

  // Local Y after ventRotation
  const Yx = ny * sinφ;
  const Yy = -nx * sinφ;
  const Yz = cosφ;

  // d in local frame
  const dx = cosθv * sinθh;
  const dy = -sinθv;
  const dz = cosθv * cosθh;

  const raw = {
    x: Xx * dx + Yx * dy + nx * dz,
    y: Xy * dx + Yy * dy + ny * dz,
    z: 0 * dx + Yz * dy + 0 * dz
  };

  const dir = normalize(raw);

  if (airOrientation === 'outflow') {
    return { x: round5(-dir.x), y: round5(-dir.y), z: round5(-dir.z) };
  }
  return { x: round5(dir.x), y: round5(dir.y), z: round5(dir.z) };
}

/**
 * Compute the world-space flow direction for a floor or ceiling furniture vent.
 *
 * Coordinate frame:
 *   Surface normal: +Z for floor, −Z for ceiling
 *   ventRotation φ rotates the vent around that normal (rotation.z on the furniture group).
 *   Local X = (cos(φ), sin(φ), 0)
 *   Local Y = (−sin(φ), cos(φ), 0)
 *
 * verticalAngle θv tilts up/down (rotation.x on ventArrowsRoot).
 * horizontalAngle θh tilts left/right (rotation.y on ventArrowsRoot).
 *
 * Floor inflow direction:
 *   fx =  cos(φ)·cos(θv)·sin(θh)  +  sin(φ)·sin(θv)
 *   fy =  sin(φ)·cos(θv)·sin(θh)  −  cos(φ)·sin(θv)
 *   fz =  cos(θv)·cos(θh)
 *
 * Ceiling: negate the whole vector.
 * outflow → negate; equilibrium → same as inflow.
 */
export function computeSurfaceFlowDirection(
  surfaceType: 'floor' | 'ceiling',
  verticalAngle: number,
  horizontalAngle: number,
  ventRotation: number,
  airOrientation: string
): { x: number; y: number; z: number } {
  const θv = (verticalAngle * Math.PI) / 180;
  const θh = (horizontalAngle * Math.PI) / 180;
  const φ = (ventRotation * Math.PI) / 180;

  const cosφ = Math.cos(φ);
  const sinφ = Math.sin(φ);
  const cosθv = Math.cos(θv);
  const sinθv = Math.sin(θv);
  const cosθh = Math.cos(θh);
  const sinθh = Math.sin(θh);

  let fx = cosφ * cosθv * sinθh + sinφ * sinθv;
  let fy = sinφ * cosθv * sinθh - cosφ * sinθv;
  let fz = cosθv * cosθh;

  if (surfaceType === 'ceiling') {
    fx = -fx;
    fy = -fy;
    fz = -fz;
  }

  const dir = normalize({ x: fx, y: fy, z: fz });

  if (airOrientation === 'outflow') {
    return { x: round5(-dir.x), y: round5(-dir.y), z: round5(-dir.z) };
  }
  return { x: round5(dir.x), y: round5(dir.y), z: round5(dir.z) };
}

/**
 * Compute the world-space flow direction for a furniture vent whose box can be
 * rotated on ALL three Euler axes (X, Y, Z) — used by topVentBox / sideVentBox.
 *
 * Algorithm:
 *  1. Start with the face outward normal in local space (localNormal).
 *     - topVentBox top face  →  (0, 0, 1)
 *     - sideVentBox front face → (0, -1, 0)
 *  2. Apply the Euler rotation Rx·Ry·Rz to get the world-space normal n_world.
 *  3. Build an orthonormal tangent frame around n_world (Gram-Schmidt).
 *  4. Apply verticalAngle (θv) and horizontalAngle (θh) offsets in that tangent frame.
 *  5. Negate for outflow.
 *
 * @param localNormal     Outward normal in box-local space, e.g. {0,0,1} for top face
 * @param rotX            Box Euler rotation around X (radians)
 * @param rotY            Box Euler rotation around Y (radians)
 * @param rotZ            Box Euler rotation around Z (radians)
 * @param verticalAngle   Tilt angle in degrees
 * @param horizontalAngle Tilt angle in degrees
 * @param airOrientation  'inflow' | 'outflow' | 'equilibrium'
 */
export function computeBoxVentFlowDirection(
  localNormal: { x: number; y: number; z: number },
  rotX: number,
  rotY: number,
  rotZ: number,
  verticalAngle: number,
  horizontalAngle: number,
  airOrientation: string
): { x: number; y: number; z: number } {
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

  const rotatePoint = (px: number, py: number, pz: number): [number, number, number] => {
    const y1 = py * cosX - pz * sinX;
    const z1 = py * sinX + pz * cosX;
    const x2 = px * cosY + z1 * sinY;
    const z2 = -px * sinY + z1 * cosY;
    const x3 = x2 * cosZ - y1 * sinZ;
    const y3 = x2 * sinZ + y1 * cosZ;
    return [x3, y3, z2];
  };

  const [nx, ny, nz] = rotatePoint(localNormal.x, localNormal.y, localNormal.z);
  const n = normalize({ x: nx, y: ny, z: nz });

  const ref = Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };

  const tx = ref.y * n.z - ref.z * n.y;
  const ty = ref.z * n.x - ref.x * n.z;
  const tz = ref.x * n.y - ref.y * n.x;
  const tX = normalize({ x: tx, y: ty, z: tz });

  const bx = n.y * tX.z - n.z * tX.y;
  const by = n.z * tX.x - n.x * tX.z;
  const bz = n.x * tX.y - n.y * tX.x;
  const tY = normalize({ x: bx, y: by, z: bz });

  const θv = (verticalAngle * Math.PI) / 180;
  const θh = (horizontalAngle * Math.PI) / 180;
  const cosθv = Math.cos(θv), sinθv = Math.sin(θv);
  const cosθh = Math.cos(θh), sinθh = Math.sin(θh);

  const dx = cosθv * sinθh;
  const dy = -sinθv;
  const dz = cosθv * cosθh;

  const raw = {
    x: tX.x * dx + tY.x * dy + n.x * dz,
    y: tX.y * dx + tY.y * dy + n.y * dz,
    z: tX.z * dx + tY.z * dy + n.z * dz,
  };

  const dir = normalize(raw);

  if (airOrientation === 'outflow') {
    return { x: round5(-dir.x), y: round5(-dir.y), z: round5(-dir.z) };
  }
  return { x: round5(dir.x), y: round5(dir.y), z: round5(dir.z) };
}
