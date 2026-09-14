/**
 * Audio sintético con Web Audio API. Cero archivos, cero dependencias: todo sale
 * de osciladores y de un buffer de ruido blanco generado con Math.random().
 *
 * El AudioContext no se crea hasta el primer gesto del usuario (política de
 * autoplay de los navegadores): main.js llama a unlock() en el primer clic o tecla.
 */
export class AudioKit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.muted = false;
    this.last = new Map(); // antirrebote por tipo de sonido

    // Motor de música: bus propio, capas persistentes y estado de intensidad.
    this.musicBus = null;
    this.music = null;
    this.musicOn = false;
    this.intensity = 0;      // 0..1, sube con la presión de enemigos
    this.targetIntensity = 0;
    this.beatClock = 0;
    this.beat = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.3;
    this.master.connect(this.ctx.destination);

    // Un segundo de ruido blanco reutilizado por todos los efectos percusivos.
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Bus de música, más bajo que los efectos para que no tape el gameplay.
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);
    this.#startMusic();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.3;
    return this.muted;
  }

  #ready(key, minGap) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    const prev = this.last.get(key) ?? -1;
    if (now - prev < minGap) return false;
    this.last.set(key, now);
    return true;
  }

  /** Ráfaga de ruido filtrado: la base de disparos, explosiones y golpes. */
  #burst({ gain = 0.5, dur = 0.12, type = 'highpass', from = 800, to = 400, q = 1 }) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** Tono con barrido de frecuencia: cuerpo grave o silbido metálico. */
  #tone({ type = 'sine', from = 200, to = 60, dur = 0.15, gain = 0.35, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  shot(weapon) {
    if (!this.#ready('shot', 0.02)) return;
    if (weapon === 'shotgun') {
      this.#burst({ gain: 0.8, dur: 0.28, type: 'lowpass', from: 4200, to: 220 });
      this.#tone({ type: 'triangle', from: 180, to: 45, dur: 0.22, gain: 0.5 });
    } else if (weapon === 'uzi') {
      this.#burst({ gain: 0.32, dur: 0.07, type: 'highpass', from: 1600, to: 900 });
      this.#tone({ type: 'square', from: 320, to: 130, dur: 0.05, gain: 0.16 });
    } else if (weapon === 'rocket') {
      this.#burst({ gain: 0.55, dur: 0.35, type: 'lowpass', from: 2200, to: 300 });
      this.#tone({ type: 'sawtooth', from: 140, to: 60, dur: 0.32, gain: 0.32 });
    } else {
      this.#burst({ gain: 0.5, dur: 0.11, type: 'highpass', from: 1100, to: 500 });
      this.#tone({ type: 'triangle', from: 260, to: 80, dur: 0.09, gain: 0.28 });
    }
  }

  /** Rebote en la placa del acorazado: silbido metálico descendente. */
  ricochet() {
    if (!this.#ready('ric', 0.04)) return;
    this.#tone({ type: 'triangle', from: 2600 + Math.random() * 900, to: 620, dur: 0.16, gain: 0.24 });
    this.#burst({ gain: 0.18, dur: 0.09, type: 'bandpass', from: 3200, to: 1800, q: 6 });
  }

  /** Crujido de huesos al desmembrar. */
  gib() {
    if (!this.#ready('gib', 0.05)) return;
    this.#burst({ gain: 0.42, dur: 0.16, type: 'bandpass', from: 900, to: 240, q: 2.5 });
    this.#tone({ type: 'square', from: 130, to: 48, dur: 0.12, gain: 0.16 });
  }

  hit() {
    if (!this.#ready('hit', 0.03)) return;
    this.#burst({ gain: 0.2, dur: 0.07, type: 'bandpass', from: 1400, to: 600, q: 3 });
  }

  /** Crítico garantizado sobre un enemigo congelado por la Nova de Hielo. */
  shatter() {
    if (!this.#ready('shatter', 0.04)) return;
    this.#burst({ gain: 0.45, dur: 0.22, type: 'highpass', from: 5200, to: 2800, q: 4 });
    this.#tone({ type: 'triangle', from: 1800, to: 3200, dur: 0.12, gain: 0.18 });
  }

  /** Onda expansiva de la Nova de Hielo: silbido grave descendente y corto. */
  frostNova() {
    if (!this.#ready('nova', 0.15)) return;
    this.#burst({ gain: 0.5, dur: 0.4, type: 'lowpass', from: 3000, to: 400 });
    this.#tone({ type: 'sine', from: 900, to: 220, dur: 0.35, gain: 0.28 });
  }

  /** Pisotón del Titán: impacto sordo con un breve estruendo de suelo. */
  titanStomp() {
    if (!this.#ready('stomp', 0.2)) return;
    this.#burst({ gain: 0.7, dur: 0.3, type: 'lowpass', from: 900, to: 90 });
    this.#tone({ type: 'sine', from: 70, to: 32, dur: 0.28, gain: 0.5 });
  }

  explosion(scale = 1) {
    if (!this.#ready('boom', 0.05)) return;
    this.#burst({ gain: 0.95, dur: 0.65 * scale, type: 'lowpass', from: 1400, to: 70 });
    this.#tone({ type: 'sine', from: 90, to: 26, dur: 0.75 * scale, gain: 0.6 });
    this.#burst({ gain: 0.3, dur: 0.28, type: 'highpass', from: 2600, to: 700 });
  }

  hurt() {
    if (!this.#ready('hurt', 0.12)) return;
    this.#tone({ type: 'sawtooth', from: 340, to: 110, dur: 0.2, gain: 0.3 });
    this.#burst({ gain: 0.25, dur: 0.14, type: 'lowpass', from: 900, to: 200 });
  }

  dash() {
    if (!this.#ready('dash', 0.1)) return;
    this.#burst({ gain: 0.3, dur: 0.22, type: 'bandpass', from: 320, to: 2400, q: 1.5 });
  }

  fireball() {
    if (!this.#ready('fire', 0.08)) return;
    this.#burst({ gain: 0.34, dur: 0.32, type: 'lowpass', from: 900, to: 260 });
    this.#tone({ type: 'sawtooth', from: 420, to: 150, dur: 0.28, gain: 0.16 });
  }

  place() {
    if (!this.#ready('place', 0.08)) return;
    this.#tone({ type: 'square', from: 150, to: 70, dur: 0.1, gain: 0.22 });
  }

  pickup() {
    if (!this.#ready('pick', 0.05)) return;
    this.#tone({ type: 'sine', from: 660, to: 660, dur: 0.07, gain: 0.22 });
    this.#tone({ type: 'sine', from: 990, to: 990, dur: 0.1, gain: 0.22, delay: 0.07 });
  }

  wave() {
    if (!this.#ready('wave', 0.4)) return;
    this.#tone({ type: 'sawtooth', from: 110, to: 110, dur: 0.22, gain: 0.2 });
    this.#tone({ type: 'sawtooth', from: 165, to: 165, dur: 0.3, gain: 0.2, delay: 0.2 });
  }

  unlockWeapon() {
    if (!this.#ready('unlock', 0.3)) return;
    this.#tone({ type: 'square', from: 520, to: 520, dur: 0.09, gain: 0.2 });
    this.#tone({ type: 'square', from: 780, to: 780, dur: 0.14, gain: 0.2, delay: 0.09 });
  }

  // ----------------------------------------------------------- MÚSICA
  /**
   * Música de fondo 100% sintética, en dos capas persistentes:
   *  - un drone grave (dos osciladores desafinados) que da la base ominosa,
   *  - un filtro sobre el drone cuya apertura sube con la intensidad, así el
   *    "brillo" del fondo crece cuando hay más enemigos sin cambiar de nota.
   * Encima, un pulso rítmico (kick sintetizado) cuya frecuencia de golpe también
   * escala con la intensidad. No es una melodía — es tensión de arena, honesto
   * con lo que la síntesis pura puede dar bien.
   */
  #startMusic() {
    if (this.musicOn || !this.ctx) return;
    const t = this.ctx.currentTime;

    // Drone: dos ondas graves ligeramente desafinadas → batido lento, inquietante.
    const oscA = this.ctx.createOscillator();
    const oscB = this.ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = 'sawtooth';
    oscA.frequency.value = 55;   // La grave
    oscB.frequency.value = 55.4; // leve desafine

    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 220;
    droneFilter.Q.value = 6;

    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.5;

    oscA.connect(droneFilter);
    oscB.connect(droneFilter);
    droneFilter.connect(droneGain).connect(this.musicBus);
    oscA.start(t);
    oscB.start(t);

    this.music = { oscA, oscB, droneFilter, droneGain };
    this.musicOn = true;
  }

  /** Kick sintetizado para el pulso rítmico del fondo. */
  #kick(gain) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
    osc.connect(g).connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /**
   * Se llama cada frame desde main.js con la "presión" actual (0..1), típicamente
   * derivada del número de enemigos vivos. Suaviza la intensidad y avanza el pulso.
   */
  updateMusic(dt, pressure) {
    if (!this.musicOn || this.muted) return;
    this.targetIntensity = Math.max(0, Math.min(1, pressure));
    // Suavizado: la música no debe dar bandazos cuando el conteo oscila.
    this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, dt * 0.6);

    // Brillo del drone: de apagado (240 Hz) a tenso (1200 Hz) con la intensidad.
    const cutoff = 240 + this.intensity * 960;
    this.music.droneFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.3);

    // Pulso: entre 1 golpe/1.1s en calma y ~1 golpe/0.4s en pánico.
    const period = 1.1 - this.intensity * 0.7;
    this.beatClock += dt;
    if (this.beatClock >= period) {
      this.beatClock = 0;
      this.beat++;
      this.#kick(0.18 + this.intensity * 0.22);
    }
  }

  /** Cambio de ronda: acorde ascendente corto sobre la base. */
  waveCleared() {
    if (!this.ctx || this.muted) return;
    const notes = [220, 277, 330, 440];
    notes.forEach((f, i) => {
      this.#tone({ type: 'triangle', from: f, to: f, dur: 0.5, gain: 0.16, delay: i * 0.12 });
    });
  }
}
