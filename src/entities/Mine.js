import * as THREE from 'three';
import { makeBox, distXZ } from '../core/Collision.js';
import { explodeAt } from '../systems/Explosion.js';

const RADIUS = 0.42;
const TRIGGER_RADIUS = 1.15;
const ARM_TIME = 1;
const BLAST = { radius: 4, damage: 110, playerDamage: 32, color: 0xff5a3b };

/**
 * Mina de proximidad: disco plano en el suelo. Inerte durante ARM_TIME tras
 * colocarla (para que el propio jugador pueda alejarse), luego detona en
 * cuanto cualquier zombi —o el jugador, si se descuida— entra en su radio.
 */
export class Mine {
  constructor(scene, position) {
    this.radius = RADIUS;
    this.dead = false;
    this.armTimer = ARM_TIME;
    this.pulse = 0;

    this.matBody = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
    this.matLed = new THREE.MeshBasicMaterial({ color: 0x661410 });

    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.position.y = 0;

    const body = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS, RADIUS, 0.12, 12), this.matBody);
    body.position.y = 0.06;
    body.castShadow = true;
    body.receiveShadow = true;
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), this.matLed);
    led.position.y = 0.13;

    this.group.add(body, led);
    this.led = led;
    scene.add(this.group);
    this.box = makeBox(position.x, position.z, RADIUS * 2, RADIUS * 2);
  }

  get position() {
    return this.group.position;
  }

  takeDamage(amount, game) {
    // Un disparo o una explosión cercana también la hace saltar.
    if (!this.dead) this.explode(game);
  }

  explode(game) {
    if (this.dead) return;
    this.dead = true;
    const p = new THREE.Vector3(this.position.x, 0.3, this.position.z);
    game.particles.burst(p, 0xff5a3b, 12, { power: 8, size: 0.16 });
    explodeAt(game, p, BLAST);
  }

  update(dt, game) {
    if (this.dead) return;

    if (this.armTimer > 0) {
      this.armTimer -= dt;
      this.pulse += dt * 6; // parpadeo lento mientras arma
      this.matLed.color.setRGB(0.4 + Math.sin(this.pulse) * 0.2, 0.08, 0.06);
      return;
    }

    this.pulse += dt * 16; // parpadeo rápido una vez armada
    this.matLed.color.setRGB(1, 0.15 + Math.sin(this.pulse) * 0.15, 0.1);

    if (distXZ(this.position, game.player.position) < game.player.radius + TRIGGER_RADIUS) {
      this.explode(game);
      return;
    }
    const nearby = game.grid.near(this.position.x, this.position.z, TRIGGER_RADIUS);
    for (let i = 0; i < nearby.length; i++) {
      const z = nearby[i];
      if (z.dead) continue;
      if (distXZ(this.position, z.position) < z.radius + TRIGGER_RADIUS) {
        this.explode(game);
        return;
      }
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    this.matBody.dispose();
    this.matLed.dispose();
  }
}

export const MINE_RADIUS = RADIUS;
