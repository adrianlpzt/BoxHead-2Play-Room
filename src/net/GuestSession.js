import * as THREE from 'three';
import { Zombie, ENEMY_TYPES } from '../entities/Zombie.js';
import { Barrel } from '../entities/Barrel.js';
import { Mine } from '../entities/Mine.js';
import { Turret } from '../entities/Turret.js';
import { Pickup } from '../entities/Pickup.js';
import { BomberCorpse } from '../entities/Zombie.js';
import { packInput } from './Snapshot.js';
import { lerp } from '../core/Collision.js';

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

    // Escucha snapshots del host.
    net.onData = (msg) => {
      if (msg.type === 'snapshot') this.#onSnapshot(msg);
    };
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

    // Player del host (el "otro" jugador visto por el guest).
    if (snap.p1) {
      this.hostPlayer.position.set(snap.p1.x, 0, snap.p1.z);
      this.hostPlayer.rotation.y = snap.p1.r;
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
    this.#syncList('zombies', snap.z, this.#createZombie.bind(this), this.#updateZombie.bind(this));
    this.#syncList('barrels', snap.b, this.#createBarrel.bind(this), this.#updateBarrel.bind(this));
    this.#syncList('mines', snap.m, this.#createMine.bind(this), this.#updateMine.bind(this));
    this.#syncList('turrets', snap.tu, this.#createTurret.bind(this), this.#updateTurret.bind(this));
    this.#syncList('pickups', snap.pk, this.#createPickup.bind(this), this.#updatePickup.bind(this));
    this.#syncList('corpses', snap.co, this.#createCorpse.bind(this), this.#updateCorpse.bind(this));
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
    return new Zombie(this.scene, data.type, pos);
  }
  #updateZombie(ghost, data) {
    ghost.position.x = lerp(ghost.position.x, data.x, 0.25);
    ghost.position.z = lerp(ghost.position.z, data.z, 0.25);
    ghost.group.rotation.y = data.r;
    ghost.hp = data.hp;
    if (data.fr && !ghost.frozen) ghost.freeze(99);
    if (!data.fr && ghost.frozen) {
      ghost.frozen = false;
      for (const p of Object.values(ghost.parts)) {
        if (p.userData && p.userData.base) p.material = p.userData.base;
      }
    }
    if (data.dead && !ghost.dead) {
      ghost.dead = true;
      ghost.group.visible = false;
    }
  }

  #createBarrel(data) {
    return new Barrel(this.scene, new THREE.Vector3(data.x, 0, data.z));
  }
  #updateBarrel(ghost, data) {
    ghost.position.x = lerp(ghost.position.x, data.x, 0.25);
    ghost.position.z = lerp(ghost.position.z, data.z, 0.25);
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
   * Se llama cada frame desde main.js. Envía los inputs del guest al host.
   * El guest sigue moviendo su Player localmente (predicción) pero la verdad
   * viene del snapshot.
   */
  update(dt) {
    if (!this.net.connected) return;

    const inp = this.input;
    const moveDir = new THREE.Vector3();
    inp.moveVector(moveDir);
    const aim = this.game.player.group.rotation.y;
    const fire = inp.fireDown || inp.pressed('Space');
    const weapon = this.game.weapon;
    const spell = inp.tapped('KeyQ') ? 'stomp' : inp.tapped('KeyE') ? 'frostnova' : null;
    const dash = inp.tapped('ShiftLeft') || inp.tapped('ShiftRight');

    const msg = packInput(moveDir.x, moveDir.z, aim, fire, weapon, spell, dash);
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
