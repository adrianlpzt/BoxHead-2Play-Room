// Colisiones 2D sobre el plano XZ. Todo el juego es plano, así que ignoramos la Y.

export function makeBox(cx, cz, sx, sz) {
  return {
    minX: cx - sx / 2,
    maxX: cx + sx / 2,
    minZ: cz - sz / 2,
    maxZ: cz + sz / 2,
  };
}

export function pointInBox(x, z, b) {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

export function circleHitsBox(x, z, r, b) {
  const nx = Math.max(b.minX, Math.min(x, b.maxX));
  const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - nx;
  const dz = z - nz;
  return dx * dx + dz * dz < r * r;
}

/**
 * Empuja el círculo fuera del AABB. Muta `pos` (Vector3) y devuelve true si hubo contacto.
 */
export function resolveCircleBox(pos, r, b) {
  const nx = Math.max(b.minX, Math.min(pos.x, b.maxX));
  const nz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
  const dx = pos.x - nx;
  const dz = pos.z - nz;
  const d2 = dx * dx + dz * dz;

  if (d2 > r * r) return false;

  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    pos.x = nx + (dx / d) * r;
    pos.z = nz + (dz / d) * r;
  } else {
    // El centro quedó dentro del box: salimos por la cara más cercana.
    const left = pos.x - b.minX;
    const right = b.maxX - pos.x;
    const front = pos.z - b.minZ;
    const back = b.maxZ - pos.z;
    const m = Math.min(left, right, front, back);
    if (m === left) pos.x = b.minX - r;
    else if (m === right) pos.x = b.maxX + r;
    else if (m === front) pos.z = b.minZ - r;
    else pos.z = b.maxZ + r;
  }
  return true;
}

export function distXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (min, max) => min + Math.random() * (max - min);
