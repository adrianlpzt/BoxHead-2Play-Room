import * as THREE from 'three';
import { rand } from '../core/Collision.js';

const GRAVITY = -26;
const GEO = new THREE.BoxGeometry(1, 1, 1);

/**
 * Pool fijo de cubitos. Se reutilizan siempre los mismos meshes: si se agotan,
 * se recicla el más viejo en lugar de crear geometría nueva en mitad del combate.
 */
export class Particles {
  constructor(scene, max = 700) {
    this.scene = scene;
    this.pool = [];
    this.cursor = 0;
    this.materials = new Map();

    for (let i = 0; i < max; i++) {
      const mesh = new THREE.Mesh(GEO, this.#material(0xffffff));
      mesh.visible = false;
      mesh.castShadow = false;
      scene.add(mesh);
      this.pool.push({
        mesh,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0,
        ttl: 1,
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
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    return p;
  }

  /**
   * @param {THREE.Vector3} origin
   * @param {number} color
   * @param {number} count
   * @param {{ power?: number, size?: number, spread?: number, ttl?: number, up?: number }} opts
   */
  burst(origin, color, count, opts = {}) {
    const power = opts.power ?? 8;
    const size = opts.size ?? 0.22;
    const spread = opts.spread ?? 0.5;
    const ttl = opts.ttl ?? 1.1;
    const up = opts.up ?? 1;
    const mat = this.#material(color);

    for (let i = 0; i < count; i++) {
      const p = this.#take();
      const s = size * rand(0.55, 1.45);
      p.mesh.material = mat;
      p.mesh.scale.set(s, s, s);
      p.mesh.position.set(
        origin.x + rand(-spread, spread),
        origin.y + rand(-spread, spread) + 0.4,
        origin.z + rand(-spread, spread)
      );
      p.mesh.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
      p.mesh.visible = true;
      p.vel.set(rand(-1, 1), rand(0.25, 1.15) * up, rand(-1, 1))
        .normalize()
        .multiplyScalar(power * rand(0.35, 1));
      p.spin.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
      p.ttl = ttl * rand(0.7, 1.3);
      p.life = p.ttl;
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vel.y += GRAVITY * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;

      const floor = p.mesh.scale.y / 2;
      if (p.mesh.position.y < floor) {
        p.mesh.position.y = floor;
        p.vel.y *= -0.32;
        p.vel.x *= 0.72;
        p.vel.z *= 0.72;
        p.spin.multiplyScalar(0.6);
      }
      // Fundido por escala al final de la vida.
      if (p.life < 0.25) {
        const k = p.life / 0.25;
        p.mesh.scale.setScalar(Math.max(0.01, p.mesh.scale.x * (0.92 + 0.08 * k)));
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
