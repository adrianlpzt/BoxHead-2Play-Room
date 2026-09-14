import * as THREE from 'three';
import { makeBox, distXZ, circleHitsBox } from '../core/Collision.js';
import { explodeAt } from '../systems/Explosion.js';

const RADIUS = 0.6;
const FRICTION = 3.2;

export class Barrel {
  constructor(scene, position) {
    this.radius = RADIUS;
    this.hp = 35;
    this.dead = false;
    this.fuse = -1;
    this.pulse = 0;
    this.vel = new THREE.Vector3();
    this.roll = 0;

    this.mat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
    this.matBand = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });

    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.position.y = 0;

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.35, 1.05), this.mat);
    body.position.y = 0.68;
    const bandA = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.16, 1.12), this.matBand);
    bandA.position.y = 0.4;
    const bandB = bandA.clone();
    bandB.position.y = 1.0;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), this.matBand);
    lid.position.y = 1.4;

    for (const m of [body, bandA, bandB, lid]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    this.body = body;

    scene.add(this.group);
    this.box = makeBox(position.x, position.z, RADIUS * 2, RADIUS * 2);
  }

  get position() {
    return this.group.position;
  }

  /** Empuje físico: disparos, explosiones y patadas del jugador lo deslizan. */
  push(dir, force) {
    if (this.dead) return;
    this.vel.addScaledVector(dir, force);
  }

  takeDamage(amount, game) {
    if (this.dead || this.fuse >= 0) return;
    this.hp -= amount;
    if (this.hp <= 0) this.prime(0.05);
  }

  prime(delay = 0.12) {
    if (this.dead || this.fuse >= 0) return;
    this.fuse = delay;
  }

  explode(game) {
    if (this.dead) return;
    this.dead = true;
    const p = new THREE.Vector3(this.position.x, 0.8, this.position.z);
    game.particles.burst(p, 0xc0392b, 18, { power: 12, size: 0.26 });
    explodeAt(game, p, { radius: 6.5, damage: 160, playerDamage: 45, shake: 0.65 });
  }

  update(dt, game) {
    if (this.dead) return;

    if (this.vel.lengthSq() > 0.0004) {
      const prevX = this.position.x;
      const prevZ = this.position.z;
      this.position.x += this.vel.x * dt;
      this.position.z += this.vel.z * dt;

      // Choque contra muros: se para en seco y deja marca.
      for (const w of game.walls) {
        if (circleHitsBox(this.position.x, this.position.z, this.radius, w)) {
          this.position.x = prevX;
          this.position.z = prevZ;
          this.vel.multiplyScalar(-0.25);
          game.audio.place();
          break;
        }
      }

      this.box = makeBox(this.position.x, this.position.z, RADIUS * 2, RADIUS * 2);

      // Un barril rodando atropella lo que pilla.
      const speed = this.vel.length();
      if (speed > 4) {
        for (const z of game.zombies) {
          if (z.dead) continue;
          if (distXZ(z.position, this.position) < this.radius + z.radius + 0.1) {
            const dir = this.vel.clone().normalize();
            z.takeDamage(speed * 2.2, game, dir, { knock: speed * 0.6 });
          }
        }
      }

      this.roll += speed * dt * 2;
      this.body.rotation.x = this.roll;
      this.vel.multiplyScalar(Math.max(0, 1 - FRICTION * dt));
    } else {
      this.vel.set(0, 0, 0);
    }

    if (this.fuse >= 0) {
      this.fuse -= dt;
      this.pulse += dt * 24;
      const k = (Math.sin(this.pulse) * 0.5 + 0.5) * 0.9;
      this.mat.emissive.setRGB(k, k * 0.5, 0);
      if (this.fuse <= 0) this.explode(game);
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    this.mat.dispose();
    this.matBand.dispose();
  }
}

export const BARREL_RADIUS = RADIUS;
