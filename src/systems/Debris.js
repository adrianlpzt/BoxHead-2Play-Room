import * as THREE from 'three';
import { rand } from '../core/Collision.js';

const GRAVITY = -30;
const GEO = new THREE.BoxGeometry(1, 1, 1);

/**
 * Trozos grandes con física de rebote: miembros desmembrados, escombros de cajas
 * y casquillos. A diferencia de las partículas, estos se posan en el suelo y se
 * quedan ahí un rato (o para siempre, si persist = true).
 */
export class Debris {
  constructor(scene, max = 260) {
    this.pool = [];
    this.cursor = 0;
    this.materials = new Map();

    for (let i = 0; i < max; i++) {
      const mesh = new THREE.Mesh(GEO, this.#material(0xffffff));
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      this.pool.push({
        mesh,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        size: new THREE.Vector3(1, 1, 1),
        life: 0,
        ttl: 1,
        persist: false,
        resting: false,
      });
    }
  }

  #material(color) {
    if (!this.materials.has(color)) {
      this.materials.set(color, new THREE.MeshLambertMaterial({ color }));
    }
    return this.materials.get(color);
  }

  #take() {
    // Busca un hueco libre; si no hay, recicla el más antiguo.
    for (let i = 0; i < this.pool.length; i++) {
      const idx = (this.cursor + i) % this.pool.length;
      if (this.pool[idx].life <= 0) {
        this.cursor = (idx + 1) % this.pool.length;
        return this.pool[idx];
      }
    }
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    return p;
  }

  /**
   * @param {THREE.Vector3} pos posición de mundo
   * @param {{x:number,y:number,z:number}} size dimensiones del trozo
   * @param {number} color
   * @param {THREE.Vector3} vel velocidad inicial
   */
  spawn(pos, size, color, vel, opts = {}) {
    const p = this.#take();
    p.mesh.material = this.#material(color);
    p.size.set(size.x, size.y, size.z);
    p.mesh.scale.copy(p.size);
    p.mesh.position.copy(pos);
    p.mesh.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
    p.mesh.visible = true;
    p.vel.copy(vel);
    p.spin.set(rand(-10, 10), rand(-10, 10), rand(-10, 10));
    p.persist = opts.persist ?? false;
    p.ttl = opts.ttl ?? 7;
    p.life = p.ttl;
    p.resting = false;
    return p;
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      if (!p.persist) p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }

      if (!p.resting) {
        p.vel.y += GRAVITY * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        p.mesh.rotation.z += p.spin.z * dt;

        const floor = Math.min(p.size.x, p.size.y, p.size.z) / 2;
        if (p.mesh.position.y <= floor) {
          p.mesh.position.y = floor;
          if (Math.abs(p.vel.y) < 2.2) {
            // Se acuesta y se queda quieto: menos coste y mejor lectura visual.
            p.resting = true;
            p.vel.set(0, 0, 0);
            p.spin.set(0, 0, 0);
            p.mesh.rotation.x = 0;
            p.mesh.rotation.z = 0;
          } else {
            p.vel.y *= -0.36;
            p.vel.x *= 0.66;
            p.vel.z *= 0.66;
            p.spin.multiplyScalar(0.55);
          }
        }
      }

      if (!p.persist && p.life < 0.6) {
        const k = Math.max(0.01, p.life / 0.6);
        p.mesh.scale.set(p.size.x * k, p.size.y * k, p.size.z * k);
      }
    }
  }

  clear() {
    for (const p of this.pool) {
      p.life = 0;
      p.mesh.visible = false;
    }
  }
}
