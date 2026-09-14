import * as THREE from 'three';
import { segPointDist2, rayWallDist } from '../core/Collision.js';

const MAX_DIST = 60;
const DAMAGE = 120;
const BEAM_W = 0.35;
const BEAM_LIFE = 0.09;

const vDir = new THREE.Vector3();

/**
 * Rifle de plasma: hitscan puro (no proyectil). Un único rayo instantáneo que
 * atraviesa a TODOS los enemigos en línea recta hasta chocar con un muro. Sin
 * dispersión, daño enorme; derrite las placas de los acorazados de un tiro
 * porque el daño va marcado como explosivo (ignora el rebote frontal).
 *
 * El haz visual es un plano fino que aparece un instante y se desvanece — vive
 * en un pool de 1 (solo puede haber un disparo a la vez a esta cadencia).
 */
export class PlasmaBeam {
  constructor(scene) {
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x86f5ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // Plano unitario (largo en X) que orientamos en Y y escalamos por disparo.
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, BEAM_W), this.mat);
    this.mesh.position.y = 1.15;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.life = 0;
  }

  /**
   * Dispara el rayo desde `origin` en dirección `dir` (normalizada, XZ).
   * @returns {boolean} true si el disparo salió (para descontar munición).
   */
  fire(game, origin, dir) {
    // Longitud del rayo: hasta el primer muro o MAX_DIST.
    const len = rayWallDist(origin.x, origin.z, dir.x, dir.z, game.walls, MAX_DIST);
    const ex = origin.x + dir.x * len;
    const ez = origin.z + dir.z * len;

    // Daña a cada enemigo cuyo centro esté a < radio del segmento origen→fin.
    // No hay orden de impacto que importe: el rayo atraviesa a todos por igual.
    for (const z of game.zombies) {
      if (z.dead) continue;
      const { d2 } = segPointDist2(origin.x, origin.z, ex, ez, z.position.x, z.position.z);
      const r = z.radius + BEAM_W * 0.5;
      if (d2 <= r * r) {
        vDir.copy(dir);
        // explosive:true → ignora la placa frontal del acorazado (la "derrite").
        z.takeDamage(DAMAGE, game, vDir, { knock: 4, explosive: true });
      }
    }

    // Los barriles en la línea también detonan.
    for (const b of game.barrels) {
      if (b.dead) continue;
      const { d2 } = segPointDist2(origin.x, origin.z, ex, ez, b.position.x, b.position.z);
      const r = b.radius + BEAM_W * 0.5;
      if (d2 <= r * r) b.takeDamage(DAMAGE, game);
    }

    // Coloca el haz visual: centrado en el punto medio, escalado a la longitud,
    // orientado según el ángulo del disparo.
    const midX = (origin.x + ex) / 2;
    const midZ = (origin.z + ez) / 2;
    this.mesh.position.set(midX, 1.15, midZ);
    this.mesh.scale.x = Math.max(0.01, len);
    // El plano mira hacia arriba (tumbado en X) y gira en Y hacia la dirección.
    this.mesh.rotation.set(-Math.PI / 2, Math.atan2(dir.x, dir.z) - Math.PI / 2, 0);
    this.mesh.visible = true;
    this.mat.opacity = 0.9;
    this.life = BEAM_LIFE;

    game.flashLight(new THREE.Vector3(origin.x, 1.15, origin.z), 0x86f5ff, 18, 0.1);
    game.flashLight(new THREE.Vector3(ex, 1.15, ez), 0x86f5ff, 12, 0.12);
    game.particles.burst(new THREE.Vector3(ex, 1.0, ez), 0x86f5ff, 8, { power: 6, size: 0.14, ttl: 0.4 });
    game.shake(0.14);
    game.audio.plasma();
    return true;
  }

  update(dt) {
    if (this.life <= 0) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.mesh.visible = false;
      this.mat.opacity = 0;
      return;
    }
    this.mat.opacity = 0.9 * (this.life / BEAM_LIFE);
  }

  clear() {
    this.life = 0;
    this.mesh.visible = false;
    this.mat.opacity = 0;
  }
}
