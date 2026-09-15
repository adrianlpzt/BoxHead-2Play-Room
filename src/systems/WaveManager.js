import { Zombie, ENEMY_TYPES } from '../entities/Zombie.js';
import { distXZ } from '../core/Collision.js';

const INTERMISSION = 4;
const MAX_ALIVE = 150;

/**
 * Control de rondas, reescrito para mantener un flujo SOSTENIDO de zombis
 * cerca del jugador en todo momento — que es lo que permite combos largos.
 *
 * El modelo viejo soltaba todo el presupuesto a intervalo fijo desde las
 * esquinas; los zombis tardaban ~12s en cruzar el mapa, creando un ciclo de
 * atracón-y-vacío. El nuevo tiene dos mecanismos simultáneos:
 *
 *  1. El spawn clásico por presupuesto (esquinas + bordes), que marca el
 *     grueso de la oleada.
 *  2. Un **trickle** que vigila la densidad cerca del jugador y rellena
 *     desde puntos a media distancia si no hay bastantes enemigos a su
 *     alrededor. Es lo que "tapona el hueco" y mantiene el combo vivo.
 */
export class WaveManager {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.wave = 0;
    this.state = 'intermission';
    this.timer = 2.5;
    this.budget = 0;
    this.spawnTimer = 0;
    this.trickleTimer = 0;
  }

  /** Presupuesto total de la oleada: crece más agresivamente en oleadas altas. */
  #waveBudget(n) {
    if (n <= 10) return 6 + Math.round(n * 5);
    if (n <= 25) return 56 + Math.round((n - 10) * 7);
    return 161 + Math.round((n - 25) * 10); // oleadas altas: 10 más por ronda
  }

  /** Intervalo base de spawn (el del presupuesto clásico). */
  get spawnInterval() {
    return Math.max(0.08, 1.2 - this.wave * 0.07);
  }

  /** Nº de zombis mínimos que deberían estar CERCA del jugador (<14 u). */
  get nearbyTarget() {
    if (this.wave < 5) return 3;
    if (this.wave < 15) return 5 + Math.floor(this.wave * 0.4);
    return Math.min(20, 10 + Math.floor(this.wave * 0.3));
  }

  /** Mezcla de arquetipos: cada uno entra en juego en una oleada distinta. */
  #pickType() {
    const w = this.wave;
    const devil = Math.min(0.32, Math.max(0, (w - 3) * 0.05));
    const armored = Math.min(0.22, Math.max(0, (w - 4) * 0.035));
    const bomber = Math.min(0.24, Math.max(0, (w - 2) * 0.045));
    const roll = Math.random();
    if (roll < devil) return 'devil';
    if (roll < devil + armored) return 'armored';
    if (roll < devil + armored + bomber) return 'bomber';
    return 'zombie';
  }

  #startWave() {
    this.wave += 1;
    this.budget = this.#waveBudget(this.wave);
    this.spawnTimer = 0;
    this.trickleTimer = 0;
    this.state = 'active';
    this.game.onWaveStart(this.wave);
  }

  #spawnAt(pos) {
    const { game } = this;
    const type = this.#pickType();
    game.zombies.push(new Zombie(game.scene, type, pos));
    game.particles.burst(pos, ENEMY_TYPES[type].skin, 6, { power: 5, size: 0.18, ttl: 0.5 });
  }

  /** Cuántos zombis vivos hay a menos de `radius` del jugador. */
  #countNearby(radius) {
    const p = this.game.player.position;
    let n = 0;
    for (const z of this.game.zombies) {
      if (!z.dead && distXZ(z.position, p) < radius) n++;
    }
    return n;
  }

  update(dt) {
    if (this.state === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0) this.#startWave();
      return;
    }

    const { game } = this;
    const alive = game.zombies.length;

    // 1) Spawn clásico por presupuesto: desde las esquinas/bordes.
    if (this.budget > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && alive < MAX_ALIVE) {
        const pos = game.arena.randomSpawn(game.player.position);
        this.#spawnAt(pos);
        this.budget -= 1;
        this.spawnTimer = this.spawnInterval;
      }
    }

    // 2) Trickle de densidad: si hay pocos zombis CERCA del jugador, rellena
    //    desde puntos a media distancia (10-18u) por detrás/laterales. No gasta
    //    presupuesto: es un spawn "gratis" para mantener el flujo. Solo se activa
    //    si la oleada ya empezó a soltar (para no arruinar la intro de ronda) y
    //    si no hemos superado el tope de vivos.
    if (alive < MAX_ALIVE && this.budget < this.#waveBudget(this.wave) * 0.8) {
      this.trickleTimer -= dt;
      if (this.trickleTimer <= 0) {
        const nearby = this.#countNearby(14);
        if (nearby < this.nearbyTarget) {
          const angle = game.player.group.rotation.y;
          const pos = game.arena.nearSpawn(game.player.position, angle);
          this.#spawnAt(pos);
          // Intervalo del trickle: más rápido cuanto mayor es el déficit.
          const deficit = this.nearbyTarget - nearby;
          this.trickleTimer = Math.max(0.15, 0.6 - deficit * 0.06);
        } else {
          this.trickleTimer = 0.5; // hay suficientes cerca, recheck en medio segundo
        }
      }
    }

    // Fin de oleada: se agota el presupuesto y no queda nadie vivo ni con mecha.
    if (this.budget <= 0 && alive === 0 && game.corpses.length === 0) {
      this.state = 'intermission';
      this.timer = INTERMISSION;
      game.onWaveCleared(this.wave);
    }
  }
}
