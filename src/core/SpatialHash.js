/**
 * Cuadrícula espacial 2D sobre XZ. Sustituye al bucle anidado O(n²) de separación:
 * con celdas del tamaño del diámetro típico de un enemigo, cada uno solo compara
 * contra los de su celda y las 8 vecinas, así que el coste pasa a ser lineal.
 */
export class SpatialHash {
  constructor(cell = 2) {
    this.cell = cell;
    this.map = new Map();
    this.scratch = [];
  }

  #key(ix, iz) {
    // Clave numérica (más rápida que concatenar strings) con offset para negativos.
    return (ix + 4096) * 8192 + (iz + 4096);
  }

  clear() {
    this.map.clear();
  }

  /** Reconstruye la cuadrícula con la lista dada. Asigna `_gi` como índice estable. */
  build(items) {
    this.map.clear();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it._gi = i;
      const ix = Math.floor(it.position.x / this.cell);
      const iz = Math.floor(it.position.z / this.cell);
      const k = this.#key(ix, iz);
      let bucket = this.map.get(k);
      if (!bucket) {
        bucket = [];
        this.map.set(k, bucket);
      }
      bucket.push(it);
    }
  }

  /**
   * Devuelve (en un array reutilizado) los elementos de las celdas que cubren el
   * radio pedido alrededor de un punto. No copiar el resultado: se sobrescribe.
   */
  near(x, z, radius = 0) {
    const out = this.scratch;
    out.length = 0;
    const r = Math.max(1, Math.ceil(radius / this.cell));
    const ix = Math.floor(x / this.cell);
    const iz = Math.floor(z / this.cell);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const bucket = this.map.get(this.#key(ix + dx, iz + dz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    return out;
  }

  /**
   * Recorre cada par de vecinos exactamente una vez (filtrando por índice `_gi`
   * para no procesar A-B y B-A).
   */
  forEachPair(items, cb) {
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      const list = this.near(a.position.x, a.position.z, this.cell);
      for (let j = 0; j < list.length; j++) {
        const b = list[j];
        if (b._gi <= a._gi) continue;
        cb(a, b);
      }
    }
  }
}
