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

/**
 * Distancia² del punto (px,pz) al segmento (ax,az)-(bx,bz), en el plano XZ.
 * Distancia punto-a-segmento en XZ (colisión de rayo/haz contra círculos).
 * Devuelve también `t` (0..1), la proyección a lo largo del segmento, útil para
 * ordenar impactos por cercanía al origen.
 */
export function segPointDist2(ax, az, bx, bz, px, pz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  const ex = px - cx;
  const ez = pz - cz;
  return { d2: ex * ex + ez * ez, t };
}

/** Punto donde un rayo (origen + dir·t) corta el primer muro AABB, o `maxDist`. */
export function rayWallDist(ox, oz, dx, dz, walls, maxDist) {
  let best = maxDist;
  for (const w of walls) {
    // Slab test 2D contra el AABB.
    let tmin = 0;
    let tmax = best;
    let ok = true;
    for (const axis of [0, 1]) {
      const o = axis === 0 ? ox : oz;
      const d = axis === 0 ? dx : dz;
      const lo = axis === 0 ? w.minX : w.minZ;
      const hi = axis === 0 ? w.maxX : w.maxZ;
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { ok = false; break; }
      } else {
        let t1 = (lo - o) / d;
        let t2 = (hi - o) / d;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin >= 0 && tmin < best) best = tmin;
  }
  return best;
}
