import * as THREE from 'three';
import { makeBox, distXZ, rand } from '../core/Collision.js';

const RADIUS = 0.55;
const RANGE = 16;
const FIRE_CD = 0.12;      // cadencia de la ráfaga
const AMMO = 60;           // disparos antes de agotarse
const HP = 90;
const BULLET_DMG = 14;
const TURN_RATE = 7;       // rad/s de giro del cabezal

const vAim = new THREE.Vector3();

/**
 * Torreta desplegable. Bloque estático con un cabezal que gira buscando al
 * enemigo más cercano en rango y dispara ráfagas hasta agotar munición o hasta
 * que los zombis la derriban a golpes. Reutiliza el pool de balas del
 * WeaponSystem vía game.weapons.spawnBullet (no crea proyectiles propios).
 */
export class Turret {
  constructor(scene, position) {
    this.radius = RADIUS;
    this.hp = HP;
    this.ammo = AMMO;
    this.dead = false;
    this.fireCd = 0.5; // breve gracia al desplegarse
    this.aimAngle = 0;

    this.matBase = new THREE.MeshLambertMaterial({ color: 0x394251 });
    this.matHead = new THREE.MeshLambertMaterial({ color: 0x5a6678 });
    this.matBarrel = new THREE.MeshLambertMaterial({ color: 0x23262c });

    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.position.y = 0;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS, RADIUS * 1.15, 0.4, 10), this.matBase);
    base.position.y = 0.2;
    base.castShadow = true;
    base.receiveShadow = true;

    // El cabezal es un subgrupo que rota en Y; el cañón cuelga de él.
    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    const dome = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), this.matHead);
    dome.castShadow = true;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.9), this.matBarrel);
    barrel.position.set(0, 0.05, 0.55);
    this.head.add(dome, barrel);

    this.group.add(base, this.head);
    scene.add(this.group);
    this.box = makeBox(position.x, position.z, RADIUS * 2, RADIUS * 2);
  }

  get position() {
    return this.group.position;
  }

  takeDamage(amount, game) {
    if (this.dead) return;
    this.hp -= amount;
    game.particles.burst(
      new THREE.Vector3(this.position.x, 0.7, this.position.z),
      0x8a94a4, 3, { power: 4, size: 0.12, ttl: 0.4 }
    );
    if (this.hp <= 0) this.destroy(game);
  }

  destroy(game) {
    if (this.dead) return;
    this.dead = true;
    const p = new THREE.Vector3(this.position.x, 0.6, this.position.z);
    game.particles.burst(p, 0x8a94a4, 14, { power: 9, size: 0.2 });
    game.decals.scorch(this.position, 1.4);
    game.shake(0.15);
  }

  #findTarget(game) {
    // El enemigo vivo más cercano dentro de rango, vía cuadrícula espacial.
    const near = game.grid.near(this.position.x, this.position.z, RANGE);
    let best = null;
    let bestD = RANGE;
    for (let i = 0; i < near.length; i++) {
      const z = near[i];
      if (z.dead) continue;
      const d = distXZ(this.position, z.position);
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    return best;
  }

  update(dt, game) {
    if (this.dead) return;

    this.fireCd -= dt;
    const target = this.#findTarget(game);

    if (target) {
      // Giro suave del cabezal hacia el objetivo.
      const wanted = Math.atan2(target.position.x - this.position.x, target.position.z - this.position.z);
      let diff = wanted - this.aimAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.aimAngle += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
      this.head.rotation.y = this.aimAngle;

      // Dispara solo si ya está razonablemente encarada.
      if (Math.abs(diff) < 0.25 && this.fireCd <= 0 && this.ammo > 0) {
        vAim.set(Math.sin(this.aimAngle), 0, Math.cos(this.aimAngle));
        const muzzle = new THREE.Vector3(
          this.position.x + vAim.x * 0.7, 1.0, this.position.z + vAim.z * 0.7
        );
        game.weapons.spawnBullet(game, muzzle, vAim, {
          damage: BULLET_DMG, speed: 55, life: RANGE / 55 + 0.1, knock: 1.5, tracer: 0x9fd8ff,
        });
        game.flashLight(muzzle, 0xbfe7ff, 8, 0.05);
        game.audio.shot('uzi');
        this.fireCd = FIRE_CD;
        this.ammo -= 1;
        if (this.ammo <= 0) {
          // Sin munición: se apaga (queda como obstáculo hasta que la derriben).
          this.matHead.color.setHex(0x2c3038);
        }
      }
    } else {
      // Sin objetivo: barrido lento de vigilancia.
      this.aimAngle += dt * 0.6;
      this.head.rotation.y = this.aimAngle;
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    this.matBase.dispose();
    this.matHead.dispose();
    this.matBarrel.dispose();
  }
}

export const TURRET_RADIUS = RADIUS;
