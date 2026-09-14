import { WEAPON_ORDER, WEAPONS } from '../systems/Weapons.js';
import { MAPS, MAP_ORDER } from '../world/Maps.js';

/**
 * Menú de inicio y sus subpantallas. Overlay DOM puro sobre el canvas. Expone
 * callbacks (onPlay) que main.js conecta a la lógica del juego. Gestiona su
 * propia navegación entre pantallas (principal / ranking / instrucciones /
 * multiplayer).
 */
export class Menu {
  constructor(ranking, { onPlay }) {
    this.ranking = ranking;
    this.onPlay = onPlay;
    this.visible = true;
    this.mapId = localStorage.getItem('boxhead3d.map') || 'box';
    if (!MAP_ORDER.includes(this.mapId)) this.mapId = 'box';

    this.root = document.createElement('div');
    this.root.id = 'menu';
    document.getElementById('hud').appendChild(this.root);
    this.#renderMain();
  }

  show() {
    this.visible = true;
    this.root.hidden = false;
    this.#renderMain();
  }

  hide() {
    this.visible = false;
    this.root.hidden = true;
  }

  #clear() {
    this.root.innerHTML = '';
  }

  #renderMain() {
    this.#clear();
    const best = this.ranking.best;
    const mapChips = MAP_ORDER.map((id) =>
      `<button data-map="${id}" class="map-chip${id === this.mapId ? ' sel' : ''}">${MAPS[id].name}</button>`
    ).join('');
    this.root.innerHTML = `
      <div class="menu-panel">
        <h1 class="menu-title">BOXHEAD<span>3D</span></h1>
        <p class="menu-sub">2Play Room${best ? ` · récord ${best}` : ''}</p>
        <nav class="menu-nav">
          <button data-act="play" class="menu-btn primary">Partida nueva</button>
          <button data-act="rank" class="menu-btn">Ranking</button>
          <button data-act="multi" class="menu-btn">Multijugador</button>
          <button data-act="help" class="menu-btn">Instrucciones</button>
        </nav>
        <div class="map-select">
          <p class="map-label">Mapa</p>
          <div class="map-chips">${mapChips}</div>
        </div>
      </div>`;
    this.root.querySelector('[data-act="play"]').onclick = () => this.#play();
    this.root.querySelector('[data-act="rank"]').onclick = () => this.#renderRanking();
    this.root.querySelector('[data-act="multi"]').onclick = () => this.#renderMulti();
    this.root.querySelector('[data-act="help"]').onclick = () => this.#renderHelp();
    for (const chip of this.root.querySelectorAll('.map-chip')) {
      chip.onclick = () => {
        this.mapId = chip.dataset.map;
        localStorage.setItem('boxhead3d.map', this.mapId);
        for (const c of this.root.querySelectorAll('.map-chip')) c.classList.toggle('sel', c === chip);
      };
    }
  }

  #play() {
    const stored = localStorage.getItem('boxhead3d.name') || '';
    if (stored) {
      this.hide();
      this.onPlay(stored, this.mapId);
      return;
    }
    // Primera vez: pide un nombre para el ranking (se recuerda después).
    this.#clear();
    this.root.innerHTML = `
      <div class="menu-panel">
        <h2 class="menu-h2">¿Cómo te llamas?</h2>
        <div id="nameentry">
          <input id="name-input" maxlength="12" placeholder="TU NOMBRE" autocomplete="off" />
          <button data-act="go" class="menu-btn primary">Empezar</button>
        </div>
        ${this.#backButton()}
      </div>`;
    const input = this.root.querySelector('#name-input');
    input.focus();
    const go = () => {
      const name = (input.value || 'ANÓNIMO').trim().slice(0, 12).toUpperCase();
      localStorage.setItem('boxhead3d.name', name);
      this.hide();
      this.onPlay(name, this.mapId);
    };
    this.root.querySelector('[data-act="go"]').onclick = go;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    this.#wireBack();
  }

  #backButton() {
    return `<button data-act="back" class="menu-btn ghost">← Volver</button>`;
  }

  #wireBack() {
    const b = this.root.querySelector('[data-act="back"]');
    if (b) b.onclick = () => this.#renderMain();
  }

  #renderRanking() {
    this.#clear();
    const rows = this.ranking.list();
    const body = rows.length
      ? rows.map((e, i) => `
          <li class="rank-row${i === 0 ? ' top' : ''}">
            <span class="rank-pos">${i + 1}</span>
            <span class="rank-name">${this.#esc(e.name)}</span>
            <span class="rank-wave">ol. ${e.wave}</span>
            <span class="rank-score">${e.score}</span>
          </li>`).join('')
      : '<li class="rank-empty">Aún no hay puntuaciones. ¡Juega una partida!</li>';
    this.root.innerHTML = `
      <div class="menu-panel">
        <h2 class="menu-h2">Ranking</h2>
        <ol class="rank-list">${body}</ol>
        ${this.#backButton()}
      </div>`;
    this.#wireBack();
  }

  #renderMulti() {
    this.#clear();
    this.root.innerHTML = `
      <div class="menu-panel">
        <h2 class="menu-h2">Multijugador</h2>
        <p class="menu-text">
          El cooperativo online por <b>ID de sala</b> está en camino. Funcionará
          creando o uniéndote a una sala con un código corto para jugar la misma
          arena con un amigo.
        </p>
        <p class="menu-text dim">Próximamente en una actualización.</p>
        ${this.#backButton()}
      </div>`;
    this.#wireBack();
  }

  #renderHelp() {
    this.#clear();
    const weapons = WEAPON_ORDER
      .map((id, i) => `${i + 1}. ${WEAPONS[id].name}`)
      .join(' · ');
    this.root.innerHTML = `
      <div class="menu-panel menu-help">
        <h2 class="menu-h2">Instrucciones</h2>
        <div class="help-grid">
          <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><div>Moverte</div>
          <div>Ratón</div><div>Apuntar</div>
          <div>Clic / <kbd>Espacio</kbd></div><div>Disparar, lanzar o colocar</div>
          <div><kbd>1</kbd>–<kbd>9</kbd></div><div>Cambiar de arma</div>
          <div><kbd>Tab</kbd></div><div>Ruleta de armas (mantén pulsado)</div>
          <div><kbd>B</kbd> / clic dcho.</div><div>Soltar barril</div>
          <div><kbd>Q</kbd> · <kbd>E</kbd></div><div>Pisar del Titán · Nova de Hielo</div>
          <div><kbd>Shift</kbd></div><div>Esquiva (patea barriles)</div>
          <div><kbd>L</kbd> · <kbd>M</kbd></div><div>Linterna · Silenciar</div>
          <div><kbd>R</kbd></div><div>Reiniciar al morir</div>
        </div>
        <p class="menu-text dim">
          Encadena bajas para subir el multiplicador: desbloquea armas y magias, y
          rellena munición. Desde la oleada 6 la luz se corta sola: usa la linterna.
        </p>
        <p class="menu-text dim">Arsenal: ${weapons}</p>
        ${this.#backButton()}
      </div>`;
    this.#wireBack();
  }

  #esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}
