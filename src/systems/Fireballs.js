import * as THREE from 'three';
import { pointInBox, distXZ } from '../core/Collision.js';

const GEO = new THREE.BoxGeometry(0.42, 0.42, 0.42);

/**
 * Proyectiles de los demonios. Pool fijo, igual que las balas, pero más lentos y
 * con estela: tienen que ser esquivables para que la parada de disparo del demonio
 * se lea como una ventana táctica y no como un impuesto.
 */
export class Fireballs {
  constructor(scene, max = 32) {
    this.pool = [];
    this.cursor = 0;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xff7a2b });

    for (let i = 0; i < max; i++) {
      const mesh = new THREE.Mesh(GEO, this.mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, dir: new THREE.Vector3(), speed: 0, damage: 0, life: 0 });
    }
  }

  spawn(origin, dir, speed = 13, damage = 18) {
    const f = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    f.mesh.position.set(origin.x, 1.2, origin.z);
    f.mesh.visible = true;
    f.dir.copy(dir).setY(0).normalize();
    f.speed = speed;
    f.damage = damage;
    f.life = 2.6;
    return f;
  }

  #impact(f, game, hitPlayer) {
    const p = f.mesh.position;
    game.particles.burst(p, 0xff7a2b, 12, { power: 9, size: 0.22, ttl: 0.6 });
    game.particles.burst(p, 0x3a2a20, 6, { power: 6, size: 0.18, ttl: 0.9 });
    game.flashLight(p, 0xff7a2b, 18, 0.15);
    game.decals.burn(p, 1.3);
    game.audio.fireball();
    if (hitPlayer) {
      game.player.takeDamage(f.damage, game);
      game.freeze(0.03);
    }
    f.life = 0;
    f.mesh.visible = false;
  }

  update(dt, game) {
    for (const f of this.pool) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.visible = false;
        continue;
      }

      const total = f.speed * dt;
      const steps = Math.max(1, Math.ceil(total / 0.4));
      const step = total / steps;
      let done = false;

      for (let s = 0; s < steps && !done; s++) {
        f.mesh.position.addScaledVector(f.dir, step);
        const p = f.mesh.position;
        f.mesh.rotation.x += dt * 9;
        f.mesh.rotation.y += dt * 7;

        if (distXZ(p, game.player.position) < game.player.radius + 0.35) {
          this.#impact(f, game, true);
          done = true;
          break;
        }
        for (const w of game.walls) {
          if (!pointInBox(p.x, p.z, w)) continue;
          if (w.crate) w.crate.damage(30, game, f.dir);
          this.#impact(f, game, false);
          done = true;
          break;
        }
      }

      if (f.life > 0 && Math.random() < 0.6) {
        game.particles.burst(f.mesh.position, 0xff9a3b, 1, {
          power: 1.5, size: 0.12, ttl: 0.35, up: 0.3, spread: 0.15,
        });
      }
    }
  }

  clear() {
    for (const f of this.pool) {
      f.life = 0;
      f.mesh.visible = false;
    }
  }
}
