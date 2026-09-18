import * as THREE from 'three';
import { Zombie, ENEMY_TYPES } from '../entities/Zombie.js';
import { Barrel } from '../entities/Barrel.js';
import { Mine } from '../entities/Mine.js';
import { Turret } from '../entities/Turret.js';
import { Pickup } from '../entities/Pickup.js';
import { BomberCorpse } from '../entities/Zombie.js';
import { packInput, unpackSnapshot, unpackEvents } from './Snapshot.js';
import { lerp } from '../core/Collision.js';

/** Interpola ángulos por el camino más corto (evita el giro de 360°). */
function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/**
 * Sesión del guest: NO simula el mundo. Recibe snapshots del host y mueve/
 * crea/destruye las entidades visuales para que coincidan con el estado del
 * host. Envía sus inputs (movimiento, apuntado, disparo) al host cada frame.
 *
 * El guest tiene su propio `Player` local para la respuesta inmediata del
 * movimiento (predicción local básica: se mueve solo y se corrige con el
 * snapshot). Todo lo demás (zombis, barriles, etc.) se interpola suavemente
 * entre snapshots en vez de saltar.
 */
export class GuestSession {
  constructor(game, net, scene, input) {
    this.game = game;
    this.net = net;
    this.scene = scene;
    this.input = input;
    this.lastSnap = null;

    // Mapas de entidades ghost, indexados por _netId.
    this.ghosts = {
      zombies: new Map(),
      barrels: new Map(),
      mines: new Map(),
      turrets: new Map(),
      pickups: new Map(),
      corpses: new Map(),
    };

    // Player2 ghost (el avatar del host visto por el guest).
    this.hostPlayer = this.#createGhostPlayer();

    // Escucha snapshots del host (formato compacto: {s:1, ...}).
    net.onData = (msg) => {
      if (msg && msg.s === 1) this.#onSnapshot(unpackSnapshot(msg));
      else if (msg && msg.e === 1) this.#onEvents(unpackEvents(msg.ev));
      else if (msg && msg.go === 1) this.#onGameOver(msg);
    };
  }

  /** Eventos recibidos en su propio mensaje (disparos, golpes, muertes). */
  #onEvents(events) {
    for (const e of events) this.#applyEvent(e);
  }

  #onGameOver(msg) {
    if (this.onGameOver_) this.onGameOver_(msg);
  }

  #createGhostPlayer() {
    // Reutilizamos el modelo del Player (es el mismo cubo vóxel).
    const p = new THREE.Group();
    const box = (w, h, d, color) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color })
      );
      m.castShadow = true;
      return m;
    };
    const skin = 0xe8c39e;
    const torso = box(0.95, 0.95, 0.6, 0xb8c4d0); // ligeramente distinto al player local
    torso.position.y = 1.15;
    const head = box(0.82, 0.75, 0.78, skin);
    head.position.y = 1.98;
    const hair = box(0.86, 0.2, 0.82, 0x5a3820); // pelo más claro para distinguirlo
    hair.position.y = 2.42;
    const gun = box(0.2, 0.2, 0.85, 0x23262c);
    gun.position.set(0.62, 1.15, 0.55);
    p.add(torso, head, hair, gun);
    p._tx = 0; p._tz = 0; p._tr = 0;
    this.scene.add(p);
    return p;
  }

  #onSnapshot(snap) {
    this.lastSnap = snap;

    // Actualizar estado del juego (para el HUD del guest).
    this.game.score = snap.score;
    this.game.multiplier = snap.mult;
    this.game.decay = snap.decay;
    this.game.essence = snap.essence;
    if (this.game.waves) this.game.waves.wave = snap.wave;

    // Progresión: sin esto el guest se queda con solo la pistola para siempre.
    if (snap.unlocked) this.game.unlocked = new Set(snap.unlocked);
    if (snap.upgraded) this.game.upgraded = new Set(snap.upgraded);
    if (snap.spells) this.game.unlockedSpells = new Set(snap.spells);

    // Player del host (el "otro" jugador visto por el guest). Guarda objetivo.
    if (snap.p1) {
      this.hostPlayer._tx = snap.p1.x;
      this.hostPlayer._tz = snap.p1.z;
      this.hostPlayer._tr = snap.p1.r;
      this.hostPlayer.visible = !snap.p1.dead;
    }

    // Player del guest (corregir con el snapshot del host).
    if (snap.p2) {
      const p = this.game.player;
      // Corrección suave: si la diferencia es grande, saltar; si es pequeña, interpolar.
      const dx = snap.p2.x - p.position.x;
      const dz = snap.p2.z - p.position.z;
      if (dx * dx + dz * dz > 4) {
        // Diferencia > 2 unidades: corrección dura.
        p.position.x = snap.p2.x;
        p.position.z = snap.p2.z;
      } else {
        // Corrección suave.
        p.position.x += dx * 0.15;
        p.position.z += dz * 0.15;
      }
      p.hp = snap.p2.hp;
      p.dead = snap.p2.dead;
    }

    // Sincronizar entidades ghost.
    this.#syncList('zombies', snap.zombies, this.#createZombie.bind(this), this.#updateZombie.bind(this));
    this.#syncList('barrels', snap.barrels, this.#createBarrel.bind(this), this.#updateBarrel.bind(this));
    this.#syncList('mines', snap.mines, this.#createMine.bind(this), this.#updateMine.bind(this));
    this.#syncList('turrets', snap.turrets, this.#createTurret.bind(this), this.#updateTurret.bind(this));
    this.#syncList('pickups', snap.pickups, this.#createPickup.bind(this), this.#updatePickup.bind(this));
    this.#syncList('corpses', snap.corpses, this.#createCorpse.bind(this), this.#updateCorpse.bind(this));

    // Balas activas: reutilizamos el pool local de WeaponSystem SOLO como
    // superficie de dibujo — el guest nunca llama a weapons.fire(), así que
    // este pool está siempre libre para que lo pisemos con lo que diga el host.
    this.#syncBullets(snap.bullets || []);
  }

  #syncBullets(list) {
    const pool = this.game.weapons.bullets;
    const n = Math.min(list.length, pool.length);
    for (let i = 0; i < n; i++) {
      const b = list[i];
      const mesh = pool[i].mesh;
      mesh.position.set(b.x, 1.15, b.z);
      mesh.rotation.set(0, b.r, 0);
      // Material por color desde el caché compartido — mutar `.color` en un
      // material que otras balas también referencian teñiría a todas a la vez.
      mesh.material = this.game.weapons.colorMaterial(b.c);
      mesh.visible = true;
    }
    // Oculta el resto del pool: balas que ya no existen en este snapshot.
    for (let i = n; i < pool.length; i++) pool[i].mesh.visible = false;
  }

  /** Reproduce localmente el efecto visual/sonoro de algo que pasó en el host. */
  #applyEvent(e) {
    const g = this.game;
    const pos = new THREE.Vector3(e.x, e.k === 'shot' ? 1.1 : 1.2, e.z);
    switch (e.k) {
      case 'shot':
        g.audio.shot(e.w);
        g.flashLight(pos, 0xffd070, 10, 0.05);
        break;
      case 'hit':
        g.particles.burst(pos, e.c, 3, { power: 5, size: 0.15, ttl: 0.6 });
        g.decals.blood(new THREE.Vector3(e.x, 0, e.z), 0.5, e.b);
        g.audio.hit();
        break;
      case 'shatter':
        g.particles.burst(pos, 0xbfeaf5, 8, { power: 7, size: 0.17, ttl: 0.6 });
        g.audio.shatter();
        break;
      case 'kill': {
        // Dispara el desmembramiento REAL del ghost correspondiente (cubos con
        // física), no una nubecita genérica. Viene por evento fiable con el id.
        const ghost = this.ghosts.zombies.get(e.id);
        if (ghost && !ghost.dead) {
          try { ghost.die(g, null, { fromNet: true }); }
          catch { ghost.dead = true; if (ghost.group) ghost.group.visible = false; }
        }
        break;
      }
    }
  }

  /**
   * Sincroniza una lista de entidades ghost con el snapshot. Crea nuevas,
   * actualiza existentes, y destruye las que ya no existen en el snapshot.
   */
  #syncList(key, snapList, createFn, updateFn) {
    const map = this.ghosts[key];
    const seen = new Set();

    for (const data of snapList) {
      seen.add(data.id);
      let ghost = map.get(data.id);
      if (!ghost) {
        ghost = createFn(data);
        ghost._netId = data.id;
        map.set(data.id, ghost);
      }
      updateFn(ghost, data);
    }

    // Eliminar ghosts que ya no existen en el snapshot.
    for (const [id, ghost] of map) {
      if (!seen.has(id)) {
        if (ghost.dispose) ghost.dispose(this.scene);
        else if (ghost.group) this.scene.remove(ghost.group);
        map.delete(id);
      }
    }
  }

  // ---- Factories y updaters para cada tipo de entidad ghost ----

  #createZombie(data) {
    const pos = new THREE.Vector3(data.x, 0, data.z);
    const z = new Zombie(this.scene, data.type, pos);
    z._tx = data.x; z._tz = data.z; z._tr = data.r;
    return z;
  }
  #updateZombie(ghost, data) {
    // Guarda la posición/rotación OBJETIVO; la interpolación real ocurre cada
    // frame en #interpolate, no aquí (que solo corre 15 veces/s).
    ghost._tx = data.x; ghost._tz = data.z; ghost._tr = data.r;
    ghost.hp = data.hp;
    if (data.fr && !ghost.frozen) ghost.freeze(99);
    if (!data.fr && ghost.frozen) {
      ghost.frozen = false;
      for (const p of Object.values(ghost.parts)) {
        if (p.userData && p.userData.base) p.material = p.userData.base;
      }
    }
    // La muerte/desmembramiento la dispara el evento 'kill' (canal fiable con id),
    // no el flag del snapshot. Aquí solo ocultamos por si el evento se perdió y
    // el zombi sigue marcado como muerto varios snapshots.
    if (data.dead && !ghost.dead) {
      ghost.dead = true;
      if (ghost.group) ghost.group.visible = false;
    }
  }

  #createBarrel(data) {
    const b = new Barrel(this.scene, new THREE.Vector3(data.x, 0, data.z));
    b._tx = data.x; b._tz = data.z;
    return b;
  }
  #updateBarrel(ghost, data) {
    ghost._tx = data.x; ghost._tz = data.z;
    ghost.hp = data.hp;
    if (data.fuse && ghost.fuse < 0) ghost.prime(0.5);
  }

  #createMine(data) {
    return new Mine(this.scene, new THREE.Vector3(data.x, 0, data.z));
  }
  #updateMine(ghost, data) {
    if (data.armed) ghost.armTimer = 0;
    if (data.dead && !ghost.dead) {
      ghost.dead = true;
      ghost.group.visible = false;
    }
  }

  #createTurret(data) {
    return new Turret(this.scene, new THREE.Vector3(data.x, 0, data.z), data.heavy);
  }
  #updateTurret(ghost, data) {
    ghost.head.rotation.y = data.aim;
    ghost.hp = data.hp;
    ghost.ammo = data.ammo;
    if (data.dead && !ghost.dead) {
      ghost.dead = true;
      ghost.group.visible = false;
    }
  }

  #createPickup(data) {
    return new Pickup(this.scene, new THREE.Vector3(data.x, 0, data.z), data.kind);
  }
  #updatePickup(ghost, data) {
    ghost.position.x = data.x;
    ghost.position.z = data.z;
  }

  #createCorpse(data) {
    const c = new BomberCorpse(this.scene, new THREE.Vector3(data.x, 0, data.z));
    return c;
  }
  #updateCorpse(ghost, data) {
    ghost.fuse = data.fuse;
    if (data.fuse <= 0 && !ghost.dead) {
      ghost.dead = true;
      ghost.group.visible = false;
    }
  }

  /**
   * Interpolación por frame (60fps) hacia las posiciones objetivo del último
   * snapshot (15Hz). Sin esto, los ghosts solo se mueven 15 veces/s y se ven a
   * tirones. El factor es exponencial y dependiente de dt para ser fluido a
   * cualquier framerate.
   */
  #interpolate(dt) {
    const k = 1 - Math.pow(0.001, dt); // ~suave; a 60fps ≈ 0.11 por frame

    // Zombis: interpolar posición + animar las piernas si se están moviendo.
    for (const z of this.ghosts.zombies.values()) {
      if (z._tx == null) continue;
      const dx = z._tx - z.position.x;
      const dz = z._tz - z.position.z;
      const moving = dx * dx + dz * dz > 0.0004; // umbral pequeño
      z.position.x = lerp(z.position.x, z._tx, k);
      z.position.z = lerp(z.position.z, z._tz, k);
      if (z._tr != null && z.group) {
        z.group.rotation.y = lerpAngle(z.group.rotation.y, z._tr, k);
      }
      if (z.animate) z.animate(dt, moving);
    }

    // Resto de ghosts (barriles, minas...): solo interpolar posición.
    for (const [key, map] of Object.entries(this.ghosts)) {
      if (key === 'zombies') continue;
      for (const ghost of map.values()) {
        if (ghost._tx == null) continue;
        ghost.position.x = lerp(ghost.position.x, ghost._tx, k);
        ghost.position.z = lerp(ghost.position.z, ghost._tz, k);
      }
    }

    // Avatar del host.
    const hp = this.hostPlayer;
    if (hp._tx != null) {
      hp.position.x = lerp(hp.position.x, hp._tx, k);
      hp.position.z = lerp(hp.position.z, hp._tz, k);
      hp.rotation.y = lerpAngle(hp.rotation.y, hp._tr, k);
    }
  }

  /**
   * Se llama cada frame desde main.js. Interpola los ghosts y envía inputs.
   */
  update(dt) {
    this.#interpolate(dt);
    if (!this.net.connected) return;

    const inp = this.input;
    const dead = this.game.player.dead;
    const moveDir = new THREE.Vector3();
    if (!dead) inp.moveVector(moveDir);
    const aim = this.game.player.group.rotation.y;
    // Muerto: no manda disparo, magia ni dash.
    const fireDown = !dead && (inp.fireDown || inp.pressed('Space'));
    const fireTap = !dead && (inp.fireTapped || inp.tapped('Space'));
    const weapon = this.game.weapon;
    const spell = dead ? null : (inp.tapped('KeyQ') ? 'stomp' : inp.tapped('KeyE') ? 'frostnova' : null);
    const dash = !dead && (inp.tapped('ShiftLeft') || inp.tapped('ShiftRight'));

    const msg = packInput(moveDir.x, moveDir.z, aim, fireDown, weapon, spell, dash, fireTap);
    this.net.send(msg);
  }

  dispose() {
    // Limpiar todos los ghosts.
    for (const [key, map] of Object.entries(this.ghosts)) {
      for (const [id, ghost] of map) {
        if (ghost.dispose) ghost.dispose(this.scene);
        else if (ghost.group) this.scene.remove(ghost.group);
      }
      map.clear();
    }
    if (this.hostPlayer) this.scene.remove(this.hostPlayer);
  }
}
