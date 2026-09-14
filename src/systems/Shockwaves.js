import * as THREE from 'three';

/**
 * Anillos de onda expansiva planos sobre el suelo. Geometría propia (un anillo
 * que crece y se desvanece), no partículas — da una lectura de "onda" mucho más
 * limpia para magias y explosiones. Pool fijo, como todo lo demás.
 */
const GEO = new THREE.RingGeometry(0.85, 1, 40);

export class Shockwaves {
  constructor(scene, max = 12) {
    this.pool = [];
    this.cursor = 0;

    for (let i = 0; i < max; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(GEO, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.05;
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, mat, life: 0, ttl: 1, from: 1, to: 6 });
    }
  }

  #take() {
    const w = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    return w;
  }

  /**
   * @param {THREE.Vector3} pos centro en el suelo
   * @param {number} color
   * @param {{ from?: number, to?: number, ttl?: number, opacity?: number, y?: number }} opts
   */
  spawn(pos, color, opts = {}) {
    const w = this.#take();
    w.from = opts.from ?? 1;
    w.to = opts.to ?? 6;
    w.ttl = opts.ttl ?? 0.5;
    w.life = w.ttl;
    w.baseOpacity = opts.opacity ?? 0.8;
    w.mat.color.setHex(color);
    w.mat.opacity = w.baseOpacity;
    w.mesh.position.set(pos.x, opts.y ?? 0.05, pos.z);
    w.mesh.scale.setScalar(w.from);
    w.mesh.visible = true;
  }

  update(dt) {
    for (const w of this.pool) {
      if (w.life <= 0) continue;
      w.life -= dt;
      if (w.life <= 0) {
        w.mesh.visible = false;
        w.mat.opacity = 0;
        continue;
      }
      const t = 1 - w.life / w.ttl; // 0 → 1
      const eased = 1 - (1 - t) * (1 - t); // easeOut: rápido al principio
      w.mesh.scale.setScalar(w.from + (w.to - w.from) * eased);
      w.mat.opacity = w.baseOpacity * (1 - t);
    }
  }

  clear() {
    for (const w of this.pool) {
      w.life = 0;
      w.mesh.visible = false;
      w.mat.opacity = 0;
    }
  }
}
