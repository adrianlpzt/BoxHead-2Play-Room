import * as THREE from 'three';
import { Player } from '../entities/Player.js';
import { packSnapshot } from './Snapshot.js';

const SNAPSHOT_INTERVAL = 1 / 15; // 15 snapshots/s

/**
 * Sesión del host: es quien simula el mundo. El guest solo pinta lo que
 * este le manda. Responsabilidades:
 *  - Crear Player2 (el avatar del guest en la simulación del host).
 *  - Cada 1/15s, serializar el mundo y mandarlo por el DataChannel.
 *  - Recibir los inputs del guest y aplicarlos a Player2.
 */
export class HostSession {
  constructor(game, net, scene) {
    this.game = game;
    this.net = net;
    this.scene = scene;
    this.timer = 0;
    this.guestInput = { mx: 0, mz: 0, aim: 0, f: 0, w: 'pistol', sp: null, d: 0 };
    this.idCounter = 0;

    // Player2: el avatar del guest en el mundo del host.
    this.player2 = new Player(scene);
    this.player2.group.position.set(3, 0, 3); // spawn un poco separado del host
    game.player2 = this.player2;
    // La cámara encuadra a ambos jugadores.
    if (game.rig) game.rig.addTarget(this.player2);

    // Escucha inputs del guest.
    net.onData = (msg) => {
      if (msg.type === 'input') {
        this.guestInput = msg;
      }
    };

    // Asigna IDs de red a entidades existentes.
    this.#assignIds();
  }

  /** Asigna _netId incrementales a entidades que no lo tengan. */
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

  /**
   * Se llama cada frame desde main.js DESPUÉS de actualizar el mundo.
   * Aplica los inputs del guest a Player2 y envía el snapshot.
   */
  update(dt) {
    // Asignar IDs a entidades nuevas (zombis recién spawneados, etc.).
    this.#assignIds();

    // Aplicar inputs del guest a Player2.
    const p2 = this.player2;
    const gi = this.guestInput;
    if (!p2.dead) {
      const moveDir = new THREE.Vector3(gi.mx, 0, gi.mz);
      // Convertir el ángulo de apuntado del guest en un punto de mundo lejano
      // para que Player.update apunte hacia ahí.
      const aimPoint = new THREE.Vector3(
        p2.position.x + Math.sin(gi.aim) * 50,
        0,
        p2.position.z + Math.cos(gi.aim) * 50
      );
      p2.update(dt, moveDir, aimPoint, this.game);

      // Dash del guest.
      if (gi.d) {
        p2.dash(moveDir, this.game);
        gi.d = 0; // consumir el tap
      }
    }

    // Enviar snapshot a intervalo fijo.
    this.timer += dt;
    if (this.timer >= SNAPSHOT_INTERVAL && this.net.connected) {
      this.timer = 0;
      const snap = packSnapshot(this.game);
      snap.type = 'snapshot';
      this.net.send(snap);
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
