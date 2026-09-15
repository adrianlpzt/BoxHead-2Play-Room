import * as THREE from 'three';
import { resolveCircleBox, lerp, distXZ } from '../core/Collision.js';

const SPEED = 9.5;
const ACCEL = 55;
const DASH_SPEED = 30;
const DASH_TIME = 0.17;
const DASH_COOLDOWN = 1.5;

const box = (w, h, d, color) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));

export class Player {
  constructor(scene) {
    this.radius = 0.55;
    this.maxHp = 100;
    this.hp = this.maxHp;
    this.dead = false;
    this.hurtCooldown = 0;
    this.timeSinceHurt = 0; // segundos sin recibir daño (para la regeneración)
    this.flash = 0;
    this.walkPhase = 0;
    this.vel = new THREE.Vector3();

    this.dashTime = 0;
    this.dashCd = 0;
    this.dashDir = new THREE.Vector3(0, 0, 1);
    this.invuln = 0;

    this.group = new THREE.Group();
    this.#build();
    this.#buildFlashlight();
    scene.add(this.group);
  }

  #build() {
    const skin = 0xe8c39e;
    const torso = box(0.95, 0.95, 0.6, 0xd9dde4);
    torso.position.y = 1.15;
    const head = box(0.82, 0.75, 0.78, skin);
    head.position.y = 1.98;
    const hair = box(0.86, 0.2, 0.82, 0x2a2118);
    hair.position.y = 2.42;
    const armL = box(0.26, 0.8, 0.26, skin);
    armL.position.set(-0.62, 1.25, 0);
    const armR = armL.clone();
    armR.position.x = 0.62;
    const legL = box(0.32, 0.78, 0.32, 0x3b4250);
    legL.position.set(-0.24, 0.39, 0);
    const legR = legL.clone();
    legR.position.x = 0.24;
    const gun = box(0.2, 0.2, 0.85, 0x23262c);
    gun.position.set(0.62, 1.15, 0.55);

    this.parts = [torso, head, hair, armL, armR, legL, legR, gun];
    for (const m of this.parts) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    this.armL = armL;
    this.legL = legL;
    this.legR = legR;
  }

  #buildFlashlight() {
    // Montada en el arma. Vive siempre en la escena con intensidad 0 para no
    // alterar el recuento de luces salvo cuando se enciende de verdad.
    const spot = new THREE.SpotLight(0xfff0cf, 0, 34, 0.5, 0.45, 1.2);
    spot.position.set(0.62, 1.3, 0.7);
    spot.castShadow = false;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = 36;
    spot.shadow.bias = -0.002;

    const target = new THREE.Object3D();
    target.position.set(0.62, 0.9, 14);
    this.group.add(target);
    spot.target = target;
    this.group.add(spot);

    // Halo corto para no quedar completamente a ciegas alrededor del jugador.
    const halo = new THREE.PointLight(0xffe2b0, 0, 7, 2);
    halo.position.set(0, 1.4, 0);
    this.group.add(halo);

    this.spot = spot;
    this.halo = halo;
  }

  setFlashlight(on) {
    this.spot.intensity = on ? 130 : 0;
    this.spot.castShadow = on;
    this.halo.intensity = on ? 9 : 0;
  }

  get position() {
    return this.group.position;
  }

  muzzle(out = new THREE.Vector3()) {
    this.group.updateMatrixWorld();
    out.set(0.62, 1.15, 1.05);
    this.group.localToWorld(out);
    return out;
  }

  get dashReady() {
    return this.dashCd <= 0 && !this.dead;
  }

  /** Esquiva rápida con i-frames: la salida de las esquinas bloqueadas. */
  dash(dir, game) {
    if (!this.dashReady) return false;
    const d = dir.lengthSq() > 0.01
      ? dir.clone().normalize()
      : new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
    this.dashDir.copy(d);
    this.dashTime = DASH_TIME;
    this.dashCd = DASH_COOLDOWN;
    this.invuln = DASH_TIME + 0.08;
    game.shake(0.08);
    game.audio.dash();
    return true;
  }

  reset() {
    this.hp = this.maxHp;
    this.dead = false;
    this.hurtCooldown = 0;
    this.timeSinceHurt = 0;
    this.flash = 0;
    this.dashTime = 0;
    this.dashCd = 0;
    this.invuln = 0;
    this.vel.set(0, 0, 0);
    this.group.position.set(0, 0, 0);
    this.group.rotation.y = 0;
    this.#applyFlash(0);
  }

  takeDamage(amount, game) {
    if (this.dead || this.hurtCooldown > 0 || this.invuln > 0) return;
    this.hp -= amount;
    this.hurtCooldown = 0.35;
    this.timeSinceHurt = 0; // reinicia la cuenta para volver a regenerar
    this.flash = 0.28;
    game.shake(0.18);
    game.audio.hurt();
    game.freeze(amount >= 18 ? 0.05 : 0.03);
    game.decals.blood(this.position, 0.5, '150,18,14');
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      game.particles.burst(this.position, 0xd9dde4, 34, { power: 11 });
      game.decals.blood(this.position, 2, '150,18,14');
      game.onPlayerDeath();
    }
  }

  #applyFlash(k) {
    for (const m of this.parts) {
      m.material.emissive?.setRGB(k * 0.85, 0, 0);
    }
  }

  update(dt, moveDir, aimPoint, game) {
    if (this.dead) return;

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vel.set(this.dashDir.x * DASH_SPEED, 0, this.dashDir.z * DASH_SPEED);
      game.particles.burst(this.position, 0x9fd8ff, 2, {
        power: 2, size: 0.16, ttl: 0.35, up: 0.2,
      });
    } else {
      const tx = moveDir.x * SPEED;
      const tz = moveDir.z * SPEED;
      const k = Math.min(1, (ACCEL * dt) / SPEED);
      this.vel.x = lerp(this.vel.x, tx, k);
      this.vel.z = lerp(this.vel.z, tz, k);
    }

    this.position.x += this.vel.x * dt;
    this.position.z += this.vel.z * dt;

    for (const w of game.walls) resolveCircleBox(this.position, this.radius, w);
    for (const b of game.barrels) {
      if (this.dashTime > 0 && distXZ(this.position, b.position) < this.radius + b.radius + 0.4) {
        // Patada en carrera: el barril sale rodando hacia la horda.
        b.push(this.dashDir, 20);
      } else {
        resolveCircleBox(this.position, this.radius, b.box);
      }
    }

    // Clamp duro de límites: el dash no puede sacar al jugador del mapa.
    const lim = game.arena.half - this.radius - 0.1;
    this.position.x = Math.max(-lim, Math.min(lim, this.position.x));
    this.position.z = Math.max(-lim, Math.min(lim, this.position.z));

    const dx = aimPoint.x - this.position.x;
    const dz = aimPoint.z - this.position.z;
    if (dx * dx + dz * dz > 0.01) {
      const wanted = Math.atan2(dx, dz);
      let diff = wanted - this.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.group.rotation.y += diff * Math.min(1, 16 * dt);
    }

    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.4) {
      this.walkPhase += dt * speed * 1.5;
      const sw = Math.sin(this.walkPhase) * 0.55;
      this.legL.rotation.x = sw;
      this.legR.rotation.x = -sw;
      this.armL.rotation.x = -sw * 0.6;
      this.group.position.y = Math.abs(Math.sin(this.walkPhase * 2)) * 0.06;
    } else {
      this.legL.rotation.x = lerp(this.legL.rotation.x, 0, 12 * dt);
      this.legR.rotation.x = lerp(this.legR.rotation.x, 0, 12 * dt);
      this.armL.rotation.x = lerp(this.armL.rotation.x, 0, 12 * dt);
      this.group.position.y = lerp(this.group.position.y, 0, 12 * dt);
    }

    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtCooldown > 0) this.hurtCooldown -= dt;

    // Regeneración de vida: tras 5 s sin recibir daño, recupera 5 de vida/s.
    if (!this.dead) {
      this.timeSinceHurt += dt;
      if (this.timeSinceHurt >= 5 && this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + 5 * dt);
      }
    }
    if (this.flash > 0) {
      this.flash -= dt;
      this.#applyFlash(Math.max(0, this.flash / 0.28));
    }
  }
}

export const DASH_COOLDOWN_TIME = DASH_COOLDOWN;
