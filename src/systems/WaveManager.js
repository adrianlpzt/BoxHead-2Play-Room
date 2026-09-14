import { Zombie, ENEMY_TYPES } from '../entities/Zombie.js';

const INTERMISSION = 4;
const MAX_ALIVE = 150; // la cuadrícula espacial es lo que permite subir de 34 a 150

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
  }

  get spawnInterval() {
    return Math.max(0.12, 1.4 - this.wave * 0.085);
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
    this.budget = 6 + Math.round(this.wave * 4.5);
    this.spawnTimer = 0;
    this.state = 'active';
    this.game.onWaveStart(this.wave);
  }

  #spawnOne() {
    const { game } = this;
    const type = this.#pickType();
    const pos = game.arena.randomSpawn(game.player.position);
    game.zombies.push(new Zombie(game.scene, type, pos));
    game.particles.burst(pos, ENEMY_TYPES[type].skin, 6, { power: 5, size: 0.18, ttl: 0.5 });
  }

  update(dt) {
    if (this.state === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0) this.#startWave();
      return;
    }

    if (this.budget > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.game.zombies.length < MAX_ALIVE) {
        this.#spawnOne();
        this.budget -= 1;
        this.spawnTimer = this.spawnInterval;
      }
    } else if (this.game.zombies.length === 0 && this.game.corpses.length === 0) {
      this.state = 'intermission';
      this.timer = INTERMISSION;
      this.game.onWaveCleared(this.wave);
    }
  }
}
