import * as THREE from 'three';
import { pointInBox, distXZ, rand } from '../core/Collision.js';

export const WEAPONS = {
  pistol: {
    name: 'Pistola', auto: false, cooldown: 0.2, damage: 34, pellets: 1,
    spread: 0.015, speed: 52, life: 1.4, shake: 0.05, knock: 3,
    tracer: 0xfff0a8, unlockAt: 0,
  },
  shotgun: {
    // A quemarropa los cinco perdigones suman ~30 de empuje: manda la horda al suelo.
    name: 'Escopeta', auto: false, cooldown: 0.72, damage: 28, pellets: 5,
    spread: 0.17, speed: 42, life: 0.42, shake: 0.22, knock: 6,
    tracer: 0xffc766, unlockAt: 3,
  },
  uzi: {
    name: 'Uzi', auto: true, cooldown: 0.072, damage: 17, pellets: 1,
    spread: 0.065, speed: 58, life: 1.2, shake: 0.035, knock: 1.1,
    tracer: 0xbfe7ff, unlockAt: 6,
  },
  barrel: { name: 'Barril', placeable: true, cooldown: 0.45, unlockAt: 2 },
};

export const WEAPON_ORDER = ['pistol', 'shotgun', 'uzi', 'barrel'];

const BULLET_GEO = new THREE.BoxGeometry(0.12, 0.12, 0.75);
const SHELL = { x: 0.1, y: 0.1, z: 0.22 };
const side = new THREE.Vector3();

export class WeaponSystem {
  constructor(scene, maxBullets = 240) {
    this.scene = scene;
    this.cooldown = 0;
    this.bullets = [];
    this.cursor = 0;
    this.materials = new Map();

    for (let i = 0; i < maxBullets; i++) {
      const mesh = new THREE.Mesh(BULLET_GEO, this.#material(0xffffff));
      mesh.visible = false;
      scene.add(mesh);
      this.bullets.push({ mesh, dir: new THREE.Vector3(), speed: 0, damage: 0, knock: 0, life: 0 });
    }

    // La luz vive siempre en la escena con intensidad 0: ocultarla cambiaría el
    // número de luces y forzaría a three a recompilar shaders en mitad del tiroteo.
    this.muzzle = new THREE.PointLight(0xffd070, 0, 10, 2);
    scene.add(this.muzzle);
    this.muzzleTimer = 0;
  }

  #material(color) {
    if (!this.materials.has(color)) {
      this.materials.set(color, new THREE.MeshBasicMaterial({ color }));
    }
    return this.materials.get(color);
  }

  #take() {
    const b = this.bullets[this.cursor];
    this.cursor = (this.cursor + 1) % this.bullets.length;
    return b;
  }

  canFire() {
    return this.cooldown <= 0;
  }

  fire(game, weaponId, origin, aimDir) {
    const w = WEAPONS[weaponId];
    if (!w || w.placeable || this.cooldown > 0) return false;

    const baseAngle = Math.atan2(aimDir.x, aimDir.z);
    for (let i = 0; i < w.pellets; i++) {
      const a = baseAngle + (Math.random() - 0.5) * 2 * w.spread;
      const b = this.#take();
      b.mesh.material = this.#material(w.tracer);
      b.mesh.position.copy(origin);
      b.mesh.position.y = 1.15;
      b.mesh.rotation.set(0, a, 0);
      b.mesh.visible = true;
      b.dir.set(Math.sin(a), 0, Math.cos(a));
      b.speed = w.speed;
      b.damage = w.damage;
      b.knock = w.knock;
      b.life = w.life;
    }

    // Casquillo persistente: sale por el lateral derecho del arma.
    side.set(aimDir.z, 0, -aimDir.x);
    game.shells.spawn(
      new THREE.Vector3(origin.x, 1.1, origin.z),
      SHELL,
      0xc9a227,
      side.clone().multiplyScalar(rand(2.5, 4.5)).setY(rand(2, 3.6)),
      { persist: true, ttl: 999 }
    );

    this.cooldown = w.cooldown;
    game.audio.shot(weaponId);
    this.muzzle.position.copy(origin);
    this.muzzle.color.setHex(w.tracer);
    this.muzzle.intensity = w.pellets > 1 ? 28 : 14;
    this.muzzleTimer = 0.06;
    game.shake(w.shake);
    return true;
  }

  update(dt, game) {
    if (this.cooldown > 0) this.cooldown -= dt;

    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      this.muzzle.intensity *= 0.5;
      if (this.muzzleTimer <= 0) this.muzzle.intensity = 0;
    }

    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }

      const total = b.speed * dt;
      const steps = Math.max(1, Math.ceil(total / 0.5));
      const step = total / steps;
      let consumed = false;

      for (let s = 0; s < steps && !consumed; s++) {
        b.mesh.position.addScaledVector(b.dir, step);
        const p = b.mesh.position;

        for (const w of game.walls) {
          if (!pointInBox(p.x, p.z, w)) continue;
          game.particles.burst(p, 0x9aa0ab, 4, { power: 4, size: 0.12, ttl: 0.45 });
          game.flashLight(p, 0xffd9a0, 4, 0.06);
          if (w.crate) w.crate.damage(b.damage, game, b.dir);
          else game.decals.scorch(p, 0.35);
          consumed = true;
          break;
        }
        if (consumed) break;

        const nearby = game.grid.near(p.x, p.z, 1);
        for (let n = 0; n < nearby.length; n++) {
          const z = nearby[n];
          if (z.dead) continue;
          if (distXZ(p, z.position) >= z.radius + 0.2) continue;

          const result = z.takeDamage(b.damage, game, b.dir, { knock: b.knock });
          if (result === 'block') {
            // Rebote en la placa frontal: la bala sale despedida y sigue siendo letal.
            const f = z.facing();
            b.dir.reflect(f).normalize();
            b.dir.x += rand(-0.25, 0.25);
            b.dir.z += rand(-0.25, 0.25);
            b.dir.normalize();
            b.damage *= 0.6;
            b.life = Math.min(b.life, 0.5);
            p.x = z.position.x + b.dir.x * (z.radius + 0.35);
            p.z = z.position.z + b.dir.z * (z.radius + 0.35);
            b.mesh.rotation.y = Math.atan2(b.dir.x, b.dir.z);
          } else {
            game.flashLight(p, 0xff6a4a, 5, 0.06);
            consumed = true;
          }
          break;
        }
        if (consumed) break;

        for (const bar of game.barrels) {
          if (bar.dead) continue;
          if (distXZ(p, bar.position) < bar.radius + 0.2) {
            bar.push(b.dir, 3.5);
            bar.takeDamage(b.damage, game);
            consumed = true;
            break;
          }
        }
      }

      if (consumed) {
        b.life = 0;
        b.mesh.visible = false;
      }
    }
  }

  clear() {
    for (const b of this.bullets) {
      b.life = 0;
      b.mesh.visible = false;
    }
    this.cooldown = 0;
    this.muzzle.intensity = 0;
  }
}
