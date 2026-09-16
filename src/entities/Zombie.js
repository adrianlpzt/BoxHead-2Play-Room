import * as THREE from 'three';
import { resolveCircleBox, distXZ, rand } from '../core/Collision.js';
import { explodeAt } from '../systems/Explosion.js';

export const ENEMY_TYPES = {
  zombie: {
    hp: 42, speed: 2.9, damage: 9, points: 10, scale: 1, radius: 0.55,
    skin: 0x6f9a42, cloth: 0x4a4436, hair: 0x24301c, blood: '150,18,14',
  },
  devil: {
    // Ya no es solo un zombi con estadísticas altas: se para y lanza fuego.
    hp: 130, speed: 5.0, damage: 20, points: 40, scale: 1.28, radius: 0.72,
    skin: 0xb8301f, cloth: 0x5d1410, hair: 0x2c0b09, blood: '120,14,10',
    ranged: { cooldown: 3, windup: 0.45, min: 6.5, max: 24, damage: 18, speed: 13 },
  },
  bomber: {
    hp: 58, speed: 3.4, damage: 10, points: 25, scale: 1.1, radius: 0.62,
    skin: 0xc7d24a, cloth: 0x6b6b25, hair: 0x3b3f14, blood: '128,140,30',
  },
  armored: {
    hp: 95, speed: 2.4, damage: 14, points: 30, scale: 1.12, radius: 0.66,
    skin: 0x8d9096, cloth: 0x3c4148, hair: 0x22262b, blood: '150,18,14',
  },
};

// Materiales compartidos por tipo. Con 150 enemigos en pantalla, instanciar tres
// materiales por bicho multiplicaba objetos y trabajo del recolector de basura.
const SHARED = {};
for (const [type, cfg] of Object.entries(ENEMY_TYPES)) {
  SHARED[type] = {
    skin: new THREE.MeshLambertMaterial({ color: cfg.skin }),
    cloth: new THREE.MeshLambertMaterial({ color: cfg.cloth }),
    hair: new THREE.MeshLambertMaterial({ color: cfg.hair }),
    plate: new THREE.MeshLambertMaterial({ color: 0xb9c0c8 }),
  };
}
// Material único de destello: el impacto se marca cambiando de material, no
// tocando el emissive de un material propio por enemigo.
const FLASH = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xff5544 });
// Congelado: tinte cian traslúcido. Prioridad visual sobre el destello de golpe
// mientras dura, porque estar congelado ya comunica "esto acaba de recibir algo".
const FROZEN = new THREE.MeshLambertMaterial({
  color: 0xaee4f2, emissive: 0x1c4a5a, emissiveIntensity: 0.5,
});

const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

// Vectores de trabajo reutilizados: nada de `new THREE.Vector3()` por balazo.
const vHit = new THREE.Vector3();
const vDir = new THREE.Vector3();
const vVel = new THREE.Vector3();
const vFace = new THREE.Vector3();
const vBoom = new THREE.Vector3(); // centro de explosión: nunca lo pisa takeDamage

export class Zombie {
  constructor(scene, type, position) {
    const cfg = ENEMY_TYPES[type];
    this.type = type;
    this.cfg = cfg;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.speed = cfg.speed * rand(0.88, 1.12);
    this.radius = cfg.radius;
    this.dead = false;
    this.attackCd = 0;
    this.flash = 0;
    this.flashing = false;
    this.frozen = false;
    this.frozenUntil = 0;
    this.bleedTimer = 0;
    this.walkPhase = rand(0, 6.28);
    this.knock = new THREE.Vector3();

    // Rodeo de obstáculos sin pathfinding: lado de deslizamiento y detector de atasco.
    this.slideSign = Math.random() < 0.5 ? 1 : -1;
    this.stuckTimer = 0;
    this.slideDir = new THREE.Vector3(); // dirección fija de rodeo mientras dura el atasco
    this.sliding = false;
    this.desperation = 0; // atasco acumulado; supera el umbral → empujón directo de rescate

    this.fireCd = cfg.ranged ? rand(1.5, cfg.ranged.cooldown) : 0;
    this.castTimer = 0;
    this.shadowOn = true;

    this.mats = SHARED[type];
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.scale.setScalar(cfg.scale);
    this.#build();
    scene.add(this.group);
  }

  #build() {
    const m = this.mats;
    const torso = box(0.9, 0.9, 0.55, m.cloth);
    torso.position.y = 1.1;
    const head = box(0.75, 0.7, 0.72, m.skin);
    head.position.y = 1.9;
    const hair = box(0.79, 0.16, 0.76, m.hair);
    hair.position.y = 2.3;
    const armL = box(0.24, 0.24, 0.85, m.skin);
    armL.position.set(-0.58, 1.35, 0.42);
    const armR = box(0.24, 0.24, 0.85, m.skin);
    armR.position.set(0.58, 1.35, 0.42);
    const legL = box(0.3, 0.72, 0.3, m.cloth);
    legL.position.set(-0.22, 0.36, 0);
    const legR = box(0.3, 0.72, 0.3, m.cloth);
    legR.position.set(0.22, 0.36, 0);

    this.parts = { torso, head, hair, armL, armR, legL, legR };

    if (this.type === 'armored') {
      const plate = box(1.02, 0.86, 0.18, m.plate);
      plate.position.set(0, 1.15, 0.37);
      this.parts.plate = plate;
      const helm = box(0.82, 0.34, 0.8, m.plate);
      helm.position.y = 2.08;
      this.parts.helm = helm;
    }

    for (const mesh of Object.values(this.parts)) {
      mesh.castShadow = true;
      mesh.userData.base = mesh.material; // para restaurar tras el destello
      this.group.add(mesh);
    }
  }

  get position() {
    return this.group.position;
  }

  facing(out = vFace) {
    return out.set(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
  }

  detach(name, game, dir) {
    const part = this.parts[name];
    if (!part || !part.visible) return false;
    part.visible = false;

    this.group.updateMatrixWorld();
    part.getWorldPosition(vHit);

    const g = part.geometry.parameters;
    const s = this.cfg.scale;
    vVel.set(
      (dir?.x ?? rand(-1, 1)) * rand(2, 7) + rand(-2, 2),
      rand(4, 9),
      (dir?.z ?? rand(-1, 1)) * rand(2, 7) + rand(-2, 2)
    );
    game.debris.spawn(vHit, { x: g.width * s, y: g.height * s, z: g.depth * s },
      part.userData.base.color.getHex(), vVel, { ttl: rand(6, 9) });
    game.particles.burst(vHit, this.cfg.skin, 6, { power: 7, size: 0.16, ttl: 0.7 });
    game.decals.blood(vHit, 0.8, this.cfg.blood);
    return true;
  }

  /** Nova de Hielo: inmoviliza y prepara el shatter-crit en el próximo impacto. */
  freeze(seconds) {
    if (this.dead) return;
    this.frozen = true;
    this.frozenUntil = Math.max(this.frozenUntil, seconds);
    for (const p of Object.values(this.parts)) p.material = FROZEN;
  }

  takeDamage(amount, game, fromDir = null, opts = {}) {
    if (this.dead) return 'hit';

    if (this.type === 'armored' && !this.frozen && !opts.explosive && fromDir && this.parts.plate?.visible) {
      const f = this.facing();
      if (fromDir.x * f.x + fromDir.z * f.z < -0.4) {
        vHit.set(this.position.x, 1.2, this.position.z);
        game.particles.burst(vHit, 0xffe9a8, 5, { power: 8, size: 0.1, ttl: 0.35 });
        game.flashLight(vHit, 0xfff0b0, 6, 0.07);
        game.audio.ricochet();
        return 'block';
      }
    }

    const shatter = this.frozen;
    const dealt = shatter ? amount * 3 : amount;
    this.hp -= dealt;
    if (fromDir) this.knock.addScaledVector(fromDir, opts.knock ?? 3);

    if (shatter) {
      // Congelado y roto: crítico garantizado, partículas de hielo en vez de carne,
      // sin el destello blanco normal (el tinte cian ya comunica "esto acaba de pasar algo").
      vHit.set(this.position.x, 1.2, this.position.z);
      game.particles.burst(vHit, 0xbfeaf5, 8, { power: 7, size: 0.17, ttl: 0.6 });
      game.audio.shatter();
    } else {
      this.#setFlash(true);
      this.flash = 0.1;

      vHit.set(this.position.x, 1.2, this.position.z);
      game.particles.burst(vHit, this.cfg.skin, 3, { power: 5, size: 0.15, ttl: 0.6 });
      if (this.bleedTimer <= 0) {
        game.decals.blood(this.position, 0.5, this.cfg.blood);
        this.bleedTimer = 0.25;
      }
      if (!opts.explosive) game.audio.hit();

      if (this.hp > 0 && amount >= 30 && Math.random() < 0.3) {
        const a = this.parts.armL.visible ? 'armL' : this.parts.armR.visible ? 'armR' : null;
        if (a) {
          this.detach(a, game, fromDir);
          game.audio.gib();
        }
      }
    }

    if (game.netEvents) {
      game.netEvents.push({
        k: shatter ? 'shatter' : 'hit',
        x: Math.round(this.position.x * 100) / 100,
        z: Math.round(this.position.z * 100) / 100,
        c: this.cfg.skin, b: this.cfg.blood,
      });
    }

    if (this.hp <= 0) {
      this.die(game, fromDir, { ...opts, shatter });
      return 'kill';
    }
    return 'hit';
  }

  die(game, dir = null, opts = {}) {
    if (this.dead) return;
    this.dead = true;
    if (!opts.shatter) game.decals.blood(this.position, 1.5 * this.cfg.scale, this.cfg.blood);
    vHit.set(this.position.x, 1, this.position.z);

    const burstColor = opts.shatter ? 0xbfeaf5 : this.cfg.skin;

    if (this.type === 'bomber') {
      game.corpses.push(new BomberCorpse(game.scene, this.position));
      game.particles.burst(vHit, burstColor, 10, { power: 6, size: 0.2 });
    } else {
      game.particles.burst(vHit, burstColor, 12, { power: 9, size: 0.2 });
      const order = ['head', 'hair', 'armL', 'armR', 'legL', 'legR', 'torso', 'plate', 'helm'];
      for (const name of order) this.detach(name, game, dir);
      game.audio.gib();
    }

    if (opts.gib) game.shake(0.05);
    if (game.netEvents) {
      game.netEvents.push({
        k: 'kill',
        x: Math.round(this.position.x * 100) / 100,
        z: Math.round(this.position.z * 100) / 100,
        c: burstColor,
      });
    }
    game.registerKill(this);
  }

  #setFlash(on) {
    if (this.flashing === on) return;
    this.flashing = on;
    for (const p of Object.values(this.parts)) {
      p.material = on ? FLASH : p.userData.base;
    }
  }

  #shootFireball(game) {
    const r = this.cfg.ranged;
    vDir.set(
      game.player.position.x - this.position.x, 0,
      game.player.position.z - this.position.z
    );
    if (vDir.lengthSq() < 1e-4) return;
    vDir.normalize();
    vHit.set(this.position.x + vDir.x * 0.9, 1.2, this.position.z + vDir.z * 0.9);
    game.fireballs.spawn(vHit, vDir, r.speed, r.damage);
    game.flashLight(vHit, 0xff7a2b, 16, 0.14);
    game.audio.fireball();
  }

  update(dt, game) {
    if (this.dead) return;

    if (this.frozen) {
      this.frozenUntil -= dt;
      if (this.frozenUntil <= 0) {
        this.frozen = false;
        for (const p of Object.values(this.parts)) p.material = p.userData.base;
      } else {
        return; // inmóvil mientras dura la congelación
      }
    }

    // En multijugador, persigue al jugador más cercano.
    let target = game.player.position;
    if (game.player2 && !game.player2.dead) {
      const d1 = distXZ(this.position, game.player.position);
      const d2 = distXZ(this.position, game.player2.position);
      if (d2 < d1) target = game.player2.position;
    }
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const d = Math.hypot(dx, dz) || 1;
    this.group.rotation.y = Math.atan2(dx, dz);

    // --- Ataque a distancia del demonio -------------------------------------
    const r = this.cfg.ranged;
    if (r) {
      if (this.castTimer > 0) {
        // Se planta y se hincha: ventana clara para esquivar o priorizarlo.
        this.castTimer -= dt;
        const k = 1 + Math.sin((1 - this.castTimer / r.windup) * Math.PI) * 0.18;
        this.group.scale.setScalar(this.cfg.scale * k);
        if (this.castTimer <= 0) {
          this.group.scale.setScalar(this.cfg.scale);
          this.#shootFireball(game);
          this.fireCd = r.cooldown * rand(0.8, 1.25);
        }
        if (this.flash > 0) {
          this.flash -= dt;
          if (this.flash <= 0) this.#setFlash(false);
        }
        return; // durante el conjuro no se mueve
      }
      this.fireCd -= dt;
      if (this.fireCd <= 0 && d > r.min && d < r.max) {
        this.castTimer = r.windup;
        return;
      }
    }

    // --- Movimiento ---------------------------------------------------------
    const vx = (dx / d) * this.speed + this.knock.x;
    const vz = (dz / d) * this.speed + this.knock.z;
    this.knock.multiplyScalar(Math.max(0, 1 - 7 * dt));

    const fromX = this.position.x;
    const fromZ = this.position.z;
    this.position.x += vx * dt;
    this.position.z += vz * dt;

    for (const w of game.walls) resolveCircleBox(this.position, this.radius, w);
    for (const b of game.barrels) resolveCircleBox(this.position, this.radius, b.box);

    // Deslizamiento por la pared. La clave: la dirección de rodeo se calcula a
    // partir de la NORMAL REAL del obstáculo, no de la perpendicular al jugador.
    // Esa normal la da la diferencia entre el movimiento deseado y el conseguido:
    // lo que la resolución de colisión "se comió" apunta justo hacia dentro del
    // muro, así que su perpendicular corre A LO LARGO de la pared.
    const wanted = Math.hypot(vx * dt, vz * dt);
    const gotX = this.position.x - fromX;
    const gotZ = this.position.z - fromZ;
    const moved = Math.hypot(gotX, gotZ);

    if (wanted > 1e-4 && moved < wanted * 0.6) {
      this.stuckTimer += dt;
      this.desperation += dt;

      // Componente del avance deseado que la colisión bloqueó = normal del muro.
      let nx = vx * dt - gotX;
      let nz = vz * dt - gotZ;
      const nlen = Math.hypot(nx, nz);
      if (nlen > 1e-5) {
        nx /= nlen;
        nz /= nlen;
      } else {
        // Sin normal clara (raro): cae a la perpendicular al jugador.
        nx = dx / d;
        nz = dz / d;
      }

      if (!this.sliding) {
        this.sliding = true;
      } else if (this.stuckTimer > 0.7) {
        this.slideSign *= -1; // el lado elegido no progresa: prueba el otro
        this.stuckTimer = 0;
      }

      // Tangente a la pared = perpendicular a la normal, con el lado elegido.
      this.slideDir.set(-nz, 0, nx).multiplyScalar(this.slideSign);
      const slide = this.speed * dt * 1.1;
      this.position.x += this.slideDir.x * slide;
      this.position.z += this.slideDir.z * slide;
      for (const w of game.walls) resolveCircleBox(this.position, this.radius, w);
      for (const b of game.barrels) resolveCircleBox(this.position, this.radius, b.box);
    } else {
      this.sliding = false;
      if (this.stuckTimer > 0) this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
      this.desperation = Math.max(0, this.desperation - dt * 2);
    }

    // Failsafe persistente: a partir de 4s de atasco acumulado, se empuja hacia
    // el jugador ATRAVESANDO la geometría un poco cada frame, y NO se auto-resetea.
    // Solo la desesperación drena al moverse de verdad (rama else de arriba). Así
    // ningún zombi puede quedar inalcanzable en un vértice: o rodea, o se despega.
    if (this.desperation > 4) {
      const push = this.speed * dt * (0.6 + (this.desperation - 4) * 0.3);
      this.position.x += (dx / d) * push;
      this.position.z += (dz / d) * push;
    }

    // Clamp duro de límites de mundo. Red de seguridad definitiva: pase lo que
    // pase antes (knockback de escopeta/explosión, failsafe de atasco, empujones
    // de la separación), un zombi NUNCA puede salir del rectángulo jugable. Sin
    // esto, un empujón fuerte cerca del borde lo saca por la cara exterior del
    // muro y queda inalcanzable, bloqueando la ronda. Es lo que faltaba.
    const lim = game.arena.half - this.radius - 0.1;
    if (this.position.x > lim) this.position.x = lim;
    else if (this.position.x < -lim) this.position.x = -lim;
    if (this.position.z > lim) this.position.z = lim;
    else if (this.position.z < -lim) this.position.z = -lim;

    // --- Animación y estado -------------------------------------------------
    this.walkPhase += dt * this.speed * 2.2;
    const sw = Math.sin(this.walkPhase) * 0.5;
    if (this.parts.legL.visible) this.parts.legL.rotation.x = sw;
    if (this.parts.legR.visible) this.parts.legR.rotation.x = -sw;

    this.attackCd -= dt;
    if (this.bleedTimer > 0) this.bleedTimer -= dt;

    if (this.attackCd <= 0 && d < this.radius + game.player.radius + 0.25) {
      game.player.takeDamage(this.cfg.damage, game);
      this.attackCd = 0.85;
      game.arena.damageCrates(this.position, this.radius + 1.2, 9, game);
    }
    // También ataca al Player2 si está cerca.
    if (this.attackCd <= 0 && game.player2 && !game.player2.dead) {
      if (distXZ(this.position, game.player2.position) < this.radius + game.player2.radius + 0.25) {
        game.player2.takeDamage(this.cfg.damage, game);
        this.attackCd = 0.85;
      }
    }

    // La horda también machaca las torretas que tenga pegadas.
    if (this.attackCd <= 0 && game.turrets.length) {
      for (const t of game.turrets) {
        if (t.dead) continue;
        if (distXZ(this.position, t.position) < this.radius + t.radius + 0.3) {
          t.takeDamage(this.cfg.damage * 1.5, game);
          this.attackCd = 0.85;
          break;
        }
      }
    }

    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.#setFlash(false);
    }

    // Con multitud, solo proyectan sombra los cercanos: el shadow map es el primer
    // cuello de botella cuando hay más de un centenar de enemigos.
    if (game.crowded) {
      const wantShadow = d < 20;
      if (wantShadow !== this.shadowOn) {
        this.shadowOn = wantShadow;
        for (const p of Object.values(this.parts)) p.castShadow = wantShadow;
      }
    } else if (!this.shadowOn) {
      this.shadowOn = true;
      for (const p of Object.values(this.parts)) p.castShadow = true;
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    // Los materiales son compartidos por tipo: no se liberan aquí.
  }
}

export class BomberCorpse {
  constructor(scene, position) {
    this.fuse = 2;
    this.dead = false;
    this.pulse = 0;
    this.mat = new THREE.MeshLambertMaterial({ color: 0xc7d24a });
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.position.y = 0;

    const belly = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.8, 1.0), this.mat);
    belly.position.y = 0.42;
    belly.castShadow = true;
    this.group.add(belly);
    this.belly = belly;
    scene.add(this.group);
  }

  get position() {
    return this.group.position;
  }

  update(dt, game) {
    if (this.dead) return;
    this.fuse -= dt;
    this.pulse += dt * (10 + (2 - this.fuse) * 14);
    const k = Math.sin(this.pulse) * 0.5 + 0.5;
    this.mat.emissive.setRGB(k * 0.9, k * 0.9, 0);
    const s = 1 + k * 0.22;
    this.belly.scale.set(s, s, s);

    if (this.fuse <= 0) {
      this.dead = true;
      vBoom.set(this.position.x, 0.7, this.position.z);
      explodeAt(game, vBoom, {
        radius: 5, damage: 95, playerDamage: 34, color: 0xd7e34f, shake: 0.45, freeze: 0.04,
      });
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    this.mat.dispose();
  }
}
