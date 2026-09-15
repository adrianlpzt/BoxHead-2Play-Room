import * as THREE from 'three';
import { distXZ, circleHitsBox } from '../core/Collision.js';
import { explodeAt } from './Explosion.js';

const GRAVITY = -18;
const RADIUS = 0.22;
const GEO = new THREE.BoxGeometry(RADIUS * 2, RADIUS * 2, RADIUS * 2);

/**
 * Granadas de mano: a diferencia de las balas planas del WeaponSystem, viven
 * en 3D de verdad (arco en Y) y rebotan en muros y suelo antes de detonar por
 * mecha o por contacto directo con un zombi.
 */
export class Grenades {
  constructor(scene, max = 16) {
    this.mat = new THREE.MeshLambertMaterial({ color: 0x5c6b3a });
    this.pool = [];
    this.cursor = 0;

    for (let i = 0; i < max; i++) {
      const mesh = new THREE.Mesh(GEO, this.mat);
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      this.pool.push({
        mesh,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        fuse: 0,
        life: 0,
        blast: null,
        cluster: 0,
      });
    }
  }

  #take() {
    const g = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    return g;
  }

  spawn(origin, dir, weapon, opts = {}) {
    const g = this.#take();
    g.mesh.position.copy(origin);
    g.mesh.visible = true;
    g.vel.set(dir.x * weapon.throwSpeed, weapon.arcSpeed, dir.z * weapon.throwSpeed);
    g.spin.set(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7);
    g.fuse = opts.fuse ?? weapon.fuse;
    g.life = g.fuse + 2; // red de seguridad: nunca vive más que esto
    g.blast = opts.blast ?? weapon.blast;
    // cluster: nº de submuniciones al detonar (0 = no fragmenta). Las hijas
    // nacen con isChild para que no vuelvan a fragmentar (evita cadena infinita).
    g.cluster = opts.isChild ? 0 : (weapon.cluster ?? 0);
    return g;
  }

  #explode(g, game) {
    explodeAt(game, g.mesh.position, g.blast);
    // Granadas de racimo: esparce submuniciones con mecha corta alrededor.
    if (g.cluster > 0) {
      const childBlast = {
        radius: (g.blast.radius ?? 5.5) * 0.55,
        damage: (g.blast.damage ?? 130) * 0.5,
        playerDamage: (g.blast.playerDamage ?? 38) * 0.4,
        color: g.blast.color ?? 0x8fae4a,
      };
      for (let i = 0; i < g.cluster; i++) {
        const a = (i / g.cluster) * Math.PI * 2 + Math.random();
        const dir = { x: Math.cos(a), z: Math.sin(a) };
        this.spawn(g.mesh.position, dir, { throwSpeed: 6, arcSpeed: 5 }, {
          isChild: true, fuse: 0.4 + Math.random() * 0.35, blast: childBlast,
        });
      }
    }
    g.life = 0;
    g.mesh.visible = false;
  }

  update(dt, game) {
    for (const g of this.pool) {
      if (g.life <= 0) continue;
      g.life -= dt;
      g.fuse -= dt;

      g.vel.y += GRAVITY * dt;
      const prevX = g.mesh.position.x;
      const prevZ = g.mesh.position.z;
      g.mesh.position.addScaledVector(g.vel, dt);
      g.mesh.rotation.x += g.spin.x * dt;
      g.mesh.rotation.y += g.spin.y * dt;
      g.mesh.rotation.z += g.spin.z * dt;

      // Rebote en muros: se deshace el avance en XZ y se invierte la velocidad.
      for (const w of game.walls) {
        if (circleHitsBox(g.mesh.position.x, g.mesh.position.z, RADIUS, w)) {
          g.mesh.position.x = prevX;
          g.mesh.position.z = prevZ;
          g.vel.x *= -0.55;
          g.vel.z *= -0.55;
          game.audio.place();
          break;
        }
      }

      // Rebote en el suelo, con fricción para que no siga botando para siempre.
      if (g.mesh.position.y <= RADIUS) {
        g.mesh.position.y = RADIUS;
        if (g.vel.y < -1) {
          g.vel.y *= -0.42;
          g.vel.x *= 0.75;
          g.vel.z *= 0.75;
        } else {
          g.vel.y = 0;
        }
      }

      // Impacto directo con un zombi: detona al instante, no espera a la mecha.
      const nearby = game.grid.near(g.mesh.position.x, g.mesh.position.z, 1);
      let hit = false;
      for (let i = 0; i < nearby.length; i++) {
        const z = nearby[i];
        if (z.dead) continue;
        if (distXZ(g.mesh.position, z.position) < z.radius + RADIUS) {
          hit = true;
          break;
        }
      }

      if (hit || g.fuse <= 0 || g.life <= 0) {
        this.#explode(g, game);
      }
    }
  }

  clear() {
    for (const g of this.pool) {
      g.life = 0;
      g.mesh.visible = false;
    }
  }
}
