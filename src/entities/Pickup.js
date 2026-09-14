import * as THREE from 'three';
import { distXZ } from '../core/Collision.js';

export const PICKUP_TYPES = {
  shotgun: { color: 0xffc766, label: 'cartuchos', amount: 8 },
  uzi: { color: 0xbfe7ff, label: 'munición de uzi', amount: 45 },
  barrel: { color: 0xc0392b, label: 'barril', amount: 1 },
  mine: { color: 0x995a4a, label: 'mina', amount: 1 },
  grenade: { color: 0x8fae4a, label: 'granada', amount: 1 },
  rocket: { color: 0xff6a3b, label: 'cohete', amount: 1 },
  health: { color: 0x62d67a, label: 'botiquín', amount: 30 },
};

const GEO = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const MATS = new Map();
const mat = (color) => {
  if (!MATS.has(color)) MATS.set(color, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
  return MATS.get(color);
};

/**
 * Recogida que sueltan los enemigos. Existe para cortar la espiral de munición:
 * si pierdes el combo y te quedas seco, el juego te devuelve balas en lugar de
 * obligarte a kitear cinco minutos con la pistola.
 */
export class Pickup {
  constructor(scene, position, kind) {
    this.kind = kind;
    this.cfg = PICKUP_TYPES[kind];
    this.dead = false;
    this.life = 22;
    this.phase = Math.random() * 6.28;

    this.mesh = new THREE.Mesh(GEO, mat(this.cfg.color));
    this.mesh.position.set(position.x, 0.6, position.z);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
  }

  get position() {
    return this.mesh.position;
  }

  update(dt, game) {
    if (this.dead) return;
    this.life -= dt;
    this.phase += dt * 3;
    this.mesh.rotation.y += dt * 2.2;
    this.mesh.position.y = 0.6 + Math.sin(this.phase) * 0.12;

    const d = distXZ(this.position, game.player.position);
    // Imán corto: recoger no debería exigir precisión de píxel.
    if (d < 3.2) {
      const k = (1 - d / 3.2) * 14 * dt;
      this.mesh.position.x += (game.player.position.x - this.position.x) * k;
      this.mesh.position.z += (game.player.position.z - this.position.z) * k;
    }
    if (d < 1.1) this.collect(game);

    if (this.life <= 0) this.dead = true;
    else if (this.life < 4) this.mesh.visible = Math.floor(this.life * 8) % 2 === 0;
  }

  collect(game) {
    this.dead = true;
    if (this.kind === 'health') {
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + this.cfg.amount);
    } else {
      game.unlocked.add(this.kind);
      game.ammo[this.kind] += this.cfg.amount;
    }
    game.particles.burst(this.position, this.cfg.color, 10, { power: 6, size: 0.14, ttl: 0.5 });
    game.audio.pickup();
  }

  dispose(scene) {
    scene.remove(this.mesh);
  }
}
