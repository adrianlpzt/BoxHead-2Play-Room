/**
 * Audio sintético procedural optimizado con Web Audio API.
 * - Compresor en master para pegada y control de picos.
 * - Secuenciador a 16 pasos con compás real (130 BPM) y capas dinámicas.
 * - Transitorios percusivos mejorados (ataque ultra-rápido en kick y armas).
 */
export class AudioKit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.noise = null;
    this.muted = false;
    this.last = new Map();

    // Motor rítmico acompasado
    this.musicBus = null;
    this.musicOn = false;
    this.intensity = 0;
    this.targetIntensity = 0;

    this.bpm = 130;
    this.stepDuration = 60 / this.bpm / 4; // Duración de una semicorchea (16th note)
    this.stepClock = 0;
    this.currentStep = 0;

    // Escala menor armónica/dórica para el bajo rítmico (A1, C2, D2, E2, G2)
    this.bassNotes = [55, 65.4, 73.4, 82.4, 98];
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    this.ctx = new AC();

    // Master bus con compresor para evitar distorsión y pegar la mezcla
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.4;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.1;

    this.master.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    // Buffer de ruido blanco
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Bus de música independiente
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.45;
    this.musicBus.connect(this.master);

    this.musicOn = true;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.4;
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

  /** Ráfaga de ruido con decaimiento rápido */
  #burst({ gain = 0.5, dur = 0.1, type = 'bandpass', from = 1000, to = 200, q = 2 }) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.01);
  }

  /** Generador de tono percusivo con curva de tono agresiva */
  #tone({ type = 'sine', from = 200, to = 40, dur = 0.15, gain = 0.35, delay = 0, pitchDecay = 0.04 }) {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;

    // Caída rápida inicial para el "click/punch" y luego descenso sostenido
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to * 1.5), t + pitchDecay);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  // ============================================================ EFECTOS (SFX)
  shot(weapon) {
    if (!this.#ready('shot', 0.03)) return;

    if (weapon === 'shotgun') {
      // Doble transitorio: impacto percusivo grave + cuerpo ruidoso saturado
      this.#tone({ type: 'sawtooth', from: 240, to: 38, dur: 0.28, gain: 0.6, pitchDecay: 0.02 });
      this.#burst({ gain: 0.85, dur: 0.26, type: 'lowpass', from: 3800, to: 180, q: 3 });
    } else if (weapon === 'uzi') {
      // Disparo rápido y seco con ataque metálico
      this.#tone({ type: 'square', from: 480, to: 90, dur: 0.04, gain: 0.2, pitchDecay: 0.01 });
      this.#burst({ gain: 0.3, dur: 0.05, type: 'highpass', from: 2200, to: 1200, q: 2 });
    } else if (weapon === 'rocket') {
      // Tono descendente ruidoso con cola larga
      this.#tone({ type: 'triangle', from: 180, to: 40, dur: 0.4, gain: 0.45, pitchDecay: 0.08 });
      this.#burst({ gain: 0.6, dur: 0.45, type: 'lowpass', from: 2000, to: 120, q: 2.5 });
    } else {
      // Pistola básica: pegada corta y clara
      this.#tone({ type: 'triangle', from: 360, to: 55, dur: 0.09, gain: 0.35, pitchDecay: 0.02 });
      this.#burst({ gain: 0.4, dur: 0.08, type: 'bandpass', from: 1800, to: 400, q: 2 });
    }
  }

  explosion(scale = 1) {
    if (!this.#ready('boom', 0.05)) return;
    const dur = 0.7 * scale;

    // Sub-bass sweep muy profundo (impacto de presión)
    this.#tone({ type: 'sine', from: 160, to: 24, dur: dur, gain: 0.75, pitchDecay: 0.06 });
    // Estruendo expansivo de frecuencias medias-bajas
    this.#burst({ gain: 0.9, dur: dur * 0.9, type: 'lowpass', from: 1800, to: 50, q: 4 });
    // Detonación inicial rápida
    this.#burst({ gain: 0.4, dur: 0.12, type: 'highpass', from: 3000, to: 800 });
  }

  ricochet() {
    if (!this.#ready('ric', 0.04)) return;
    this.#tone({ type: 'sawtooth', from: 2800 + Math.random() * 800, to: 450, dur: 0.14, gain: 0.18, pitchDecay: 0.05 });
    this.#burst({ gain: 0.2, dur: 0.06, type: 'bandpass', from: 4000, to: 2000, q: 8 });
  }

  hit() {
    if (!this.#ready('hit', 0.02)) return;
    this.#burst({ gain: 0.25, dur: 0.05, type: 'bandpass', from: 2200, to: 400, q: 4 });
  }

  gib() {
    if (!this.#ready('gib', 0.04)) return;
    this.#burst({ gain: 0.45, dur: 0.14, type: 'lowpass', from: 1200, to: 180, q: 3 });
    this.#tone({ type: 'sawtooth', from: 160, to: 35, dur: 0.1, gain: 0.25, pitchDecay: 0.02 });
  }

  shatter() {
    if (!this.#ready('shatter', 0.04)) return;
    this.#burst({ gain: 0.5, dur: 0.18, type: 'highpass', from: 6000, to: 2500, q: 5 });
    this.#tone({ type: 'sine', from: 2200, to: 3500, dur: 0.08, gain: 0.2 });
  }

  frostNova() {
    if (!this.#ready('nova', 0.15)) return;
    this.#burst({ gain: 0.55, dur: 0.35, type: 'bandpass', from: 3500, to: 200, q: 2 });
    this.#tone({ type: 'triangle', from: 600, to: 80, dur: 0.3, gain: 0.35, pitchDecay: 0.1 });
  }

  titanStomp() {
    if (!this.#ready('stomp', 0.2)) return;
    this.#tone({ type: 'sine', from: 130, to: 28, dur: 0.35, gain: 0.7, pitchDecay: 0.03 });
    this.#burst({ gain: 0.65, dur: 0.25, type: 'lowpass', from: 700, to: 60, q: 3 });
  }

  hurt() {
    if (!this.#ready('hurt', 0.1)) return;
    this.#tone({ type: 'sawtooth', from: 280, to: 90, dur: 0.16, gain: 0.28, pitchDecay: 0.04 });
  }

  dash() {
    if (!this.#ready('dash', 0.08)) return;
    this.#burst({ gain: 0.32, dur: 0.18, type: 'bandpass', from: 400, to: 2800, q: 2 });
  }

  fireball() {
    if (!this.#ready('fire', 0.08)) return;
    this.#burst({ gain: 0.35, dur: 0.25, type: 'lowpass', from: 1100, to: 180, q: 2 });
    this.#tone({ type: 'sawtooth', from: 360, to: 110, dur: 0.2, gain: 0.18, pitchDecay: 0.06 });
  }

  place() {
    if (!this.#ready('place', 0.06)) return;
    this.#tone({ type: 'triangle', from: 200, to: 80, dur: 0.08, gain: 0.25, pitchDecay: 0.02 });
  }

  pickup() {
    if (!this.#ready('pick', 0.05)) return;
    this.#tone({ type: 'sine', from: 587.33, to: 587.33, dur: 0.05, gain: 0.18 });
    this.#tone({ type: 'sine', from: 880, to: 880, dur: 0.08, gain: 0.18, delay: 0.05 });
  }

  wave() {
    if (!this.#ready('wave', 0.3)) return;
    this.#tone({ type: 'sawtooth', from: 110, to: 110, dur: 0.15, gain: 0.22 });
    this.#tone({ type: 'sawtooth', from: 164.81, to: 164.81, dur: 0.25, gain: 0.22, delay: 0.14 });
  }

  unlockWeapon() {
    if (!this.#ready('unlock', 0.2)) return;
    this.#tone({ type: 'square', from: 440, to: 440, dur: 0.07, gain: 0.15 });
    this.#tone({ type: 'square', from: 659.25, to: 659.25, dur: 0.12, gain: 0.15, delay: 0.07 });
  }

  // ============================================================ MOTOR RÍTMICO
  /** Bombo con transitorio punchy (click inicial rápido + cola sub) */
  #playKick(gain = 0.35) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc.type = 'sine';
    // Barrido de 160 Hz a 45 Hz en 30ms para pegada contundente
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.035);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.18);

    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

    osc.connect(g).connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  /** Charles cerrado sintetizado con ruido filtrado en agudos */
  #playHiHat(gain = 0.08) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7500;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

    src.connect(filter).connect(g).connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.04);
  }

  /** Nota de bajo sintetizado conectada al patrón rítmico */
  #playBassNote(freq, dur = 0.12, gain = 0.2) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    // Filtro dinámico que se abre con la intensidad
    filter.type = 'lowpass';
    const cutoff = 250 + this.intensity * 900;
    filter.frequency.setValueAtTime(cutoff * 1.5, t);
    filter.frequency.exponentialRampToValueAtTime(cutoff, t + dur);

    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(filter).connect(g).connect(this.musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /**
   * Actualiza el reloj musical por semicorcheas en compás 4/4 a 130 BPM.
   * Añade elementos según la intensidad:
   * - Nivel bajo: Kick en los pulsos 0, 4, 8, 12 (four-on-the-floor suave) y bajo sordo.
   * - Nivel medio: Entran Hi-Hats a contratiempo (pasos 2, 6, 10, 14).
   * - Nivel alto: Línea de bajo arpegiada activa y Hi-Hats continuos en semicorcheas.
   */
  updateMusic(dt, pressure) {
    if (!this.musicOn || this.muted || !this.ctx) return;

    this.targetIntensity = Math.max(0, Math.min(1, pressure));
    this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, dt * 0.8);

    this.stepClock += dt;

    while (this.stepClock >= this.stepDuration) {
      this.stepClock -= this.stepDuration;
      const step = this.currentStep;

      // 1. Kick: en pulsos principales (0, 4, 8, 12)
      if (step % 4 === 0) {
        const kickVol = 0.28 + this.intensity * 0.18;
        this.#playKick(kickVol);
      }

      // 2. Hi-Hats: entran a contratiempo y luego en semicorcheas
      if (this.intensity > 0.25) {
        const isOffbeat = step % 4 === 2;
        const isDense = this.intensity > 0.65;
        if (isOffbeat || (isDense && step % 2 === 0)) {
          this.#playHiHat(0.05 + this.intensity * 0.05);
        }
      }

      // 3. Bajo secuenciado: patrón rítmico dinámico
      if (step % 2 === 0) {
        const noteIndex = Math.floor((step / 2) % this.bassNotes.length);
        const freq = this.bassNotes[noteIndex];
        const bassGain = 0.12 + this.intensity * 0.14;
        this.#playBassNote(freq, this.stepDuration * 1.6, bassGain);
      }

      this.currentStep = (this.currentStep + 1) % 16;
    }
  }

  waveCleared() {
    if (!this.ctx || this.muted) return;
    const notes = [220, 277.18, 329.63, 440, 554.37];
    notes.forEach((f, i) => {
      this.#tone({ type: 'sine', from: f, to: f, dur: 0.4, gain: 0.15, delay: i * 0.08 });
    });
  }
}
