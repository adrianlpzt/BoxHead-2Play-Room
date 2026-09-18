import * as THREE from 'three';
import { Player } from '../entities/Player.js';
import { packSnapshot, unpackInput, packEvents } from './Snapshot.js';

const SNAPSHOT_INTERVAL = 1 / 22; // 22 snapshots/s (movimiento más fino)

/**
 * Sesión del host: es quien simula el mundo. El guest solo pinta lo que
 * este le manda.
 */
export class HostSession {
  constructor(game, net, scene) {
    this.game = game;
    this.net = net;
    this.scene = scene;
    this.timer = 0;
    this.guestInput = { mx: 0, mz: 0, aim: 0, fire: false, dash: false, tap: false, weapon: 'pistol', spell: null };
    this.idCounter = 0;

    this.player2 = new Player(scene);
    this.player2.group.position.set(3, 0, 3);
    game.player2 = this.player2;
    if (game.rig) game.rig.addTarget(this.player2);

    // Escucha inputs del guest (formato compacto: {i:1, a:[...]}).
    net.onData = (msg) => {
      if (msg && msg.i === 1) {
        this.guestInput = unpackInput(msg);
      }
    };

    this.#assignIds();
  }

  #assignIds() {
    const lists = [
      this.game.zombies, this.game.barrels, this.game.mines,
      this.game.turrets, this.game.pickups, this.game.corpses,
    ];
    for (const list of lists) {
      for (const e of list) {
        if (e._netId == null) e._netId = ++this.idCounter;
      }
    }
  }

  update(dt) {
    this.#assignIds();

    const p2 = this.player2;
    const gi = this.guestInput;
    if (!p2.dead) {
      const moveDir = new THREE.Vector3(gi.mx, 0, gi.mz);
      const aimPoint = new THREE.Vector3(
        p2.position.x + Math.sin(gi.aim) * 50,
        0,
        p2.position.z + Math.cos(gi.aim) * 50
      );
      p2.update(dt, moveDir, aimPoint, this.game);
      if (gi.dash) {
        p2.dash(moveDir, this.game);
        gi.dash = false;
      }
    }

    this.timer += dt;
    if (this.timer >= SNAPSHOT_INTERVAL && this.net.connected && this.net.canSend()) {
      this.timer = 0;
      this.net.send(packSnapshot(this.game));
    }

    // Eventos (disparos, golpes, muertes): se mandan CADA frame en su propio
    // mensaje, no dentro del snapshot. Así un evento no espera al próximo
    // snapshot ni se pierde si ese snapshot se pierde — cada uno es ~30 bytes.
    const ev = this.game.netEvents;
    if (ev.length && this.net.connected && this.net.canSend()) {
      this.net.send({ e: 1, ev: packEvents(ev.splice(0)) });
    }
  }

  dispose() {
    if (this.player2) {
      this.scene.remove(this.player2.group);
      if (this.game.rig) this.game.rig.removeTarget(this.player2);
      this.game.player2 = null;
    }
  }
}
