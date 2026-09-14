/**
 * Ranking local persistente. Guarda las mejores puntuaciones en localStorage.
 * Cuando exista el online, esto convivirá con un ranking remoto por servidor;
 * de momento es la tabla local del navegador.
 */
const KEY = 'boxhead3d.scores.v1';
const MAX_ENTRIES = 10;

export class Ranking {
  constructor() {
    this.entries = this.#load();
  }

  #load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return []; // localStorage bloqueado o JSON corrupto: ranking vacío, sin romper
    }
  }

  #save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.entries));
    } catch {
      // Modo incógnito o almacenamiento lleno: seguimos sin persistir.
    }
  }

  /** Devuelve true si la puntuación entra en el top. */
  qualifies(score) {
    if (this.entries.length < MAX_ENTRIES) return score > 0;
    return score > this.entries[this.entries.length - 1].score;
  }

  add(name, score, wave) {
    const entry = { name: (name || 'ANÓNIMO').slice(0, 12), score, wave, date: Date.now() };
    this.entries.push(entry);
    this.entries.sort((a, b) => b.score - a.score);
    this.entries = this.entries.slice(0, MAX_ENTRIES);
    this.#save();
    return this.entries.indexOf(entry);
  }

  get best() {
    return this.entries.length ? this.entries[0].score : 0;
  }

  list() {
    return this.entries;
  }
}
