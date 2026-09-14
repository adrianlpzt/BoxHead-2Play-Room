import { WEAPON_ORDER, WEAPONS } from '../systems/Weapons.js';

/**
 * Ruleta de selección de arma (estilo GTA). Overlay SVG radial dividido en un
 * sector por arma; el sector bajo el cursor se resalta y se elige al cerrar.
 *
 * Nota de diseño: el "blur" de GTA real necesita postprocesado (EffectComposer),
 * que este proyecto no tiene. En su lugar oscurecemos y viñeteamos por CSS sobre
 * el canvas mientras la ruleta está abierta — se lee premium sin tocar el
 * pipeline de render. El slowmo sí es real (main.js escala el dt).
 */
const R_OUT = 210;
const R_IN = 90;
const CX = 240;
const CY = 240;

export class WeaponWheel {
  constructor() {
    this.open = false;
    this.hovered = null;

    this.root = document.createElement('div');
    this.root.id = 'wheel';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="wheel-scrim"></div>`;

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', '0 0 480 480');
    this.svg.classList.add('wheel-svg');
    this.root.appendChild(this.svg);

    this.centerLabel = document.createElement('div');
    this.centerLabel.className = 'wheel-center';
    this.root.appendChild(this.centerLabel);

    document.getElementById('hud').appendChild(this.root);
    this.sectors = [];
  }

  /** (Re)construye los sectores según las armas desbloqueadas del jugador. */
  #build(game) {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    this.sectors = [];

    // Solo entran las armas desbloqueadas — la ruleta refleja lo que puedes usar.
    const ids = WEAPON_ORDER.filter((id) => game.unlocked.has(id));
    const n = ids.length;
    if (n === 0) return;

    const step = (Math.PI * 2) / n;
    // Empezamos arriba (-90°) para que el primer sector quede centrado en vertical.
    const start = -Math.PI / 2 - step / 2;

    ids.forEach((id, i) => {
      const a0 = start + i * step;
      const a1 = a0 + step;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', this.#sectorPath(a0, a1));
      path.setAttribute('class', 'wheel-sector');
      this.svg.appendChild(path);

      // Etiqueta en el punto medio del sector, a radio intermedio.
      const mid = (a0 + a1) / 2;
      const rl = (R_OUT + R_IN) / 2;
      const tx = CX + Math.cos(mid) * rl;
      const ty = CY + Math.sin(mid) * rl;
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', tx);
      label.setAttribute('y', ty);
      label.setAttribute('class', 'wheel-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.textContent = `${i + 1}`;
      this.svg.appendChild(label);

      this.sectors.push({ id, a0, a1, path });
    });
  }

  #sectorPath(a0, a1) {
    const p = (r, a) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
    const [x0o, y0o] = p(R_OUT, a0);
    const [x1o, y1o] = p(R_OUT, a1);
    const [x1i, y1i] = p(R_IN, a1);
    const [x0i, y0i] = p(R_IN, a0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return [
      `M ${x0o} ${y0o}`,
      `A ${R_OUT} ${R_OUT} 0 ${large} 1 ${x1o} ${y1o}`,
      `L ${x1i} ${y1i}`,
      `A ${R_IN} ${R_IN} 0 ${large} 0 ${x0i} ${y0i}`,
      'Z',
    ].join(' ');
  }

  show(game) {
    this.#build(game);
    this.open = true;
    this.root.hidden = false;
    this.hovered = game.weapon;
  }

  /** @param {{x:number,y:number}} ndc coordenadas normalizadas del ratón (-1..1). */
  update(ndc, game) {
    if (!this.open || this.sectors.length === 0) return;

    // Ángulo del cursor respecto al centro. ndc.y va hacia arriba, invertimos
    // para trabajar en el mismo sistema que los sectores (y hacia abajo).
    const ang = Math.atan2(-ndc.y, ndc.x);
    const dead = Math.hypot(ndc.x, ndc.y) < 0.12; // zona muerta central

    let hit = dead ? game.weapon : null;
    if (!dead) {
      for (const s of this.sectors) {
        // Normalizamos el ángulo dentro del rango del sector.
        let a = ang;
        while (a < s.a0) a += Math.PI * 2;
        while (a > s.a0 + Math.PI * 2) a -= Math.PI * 2;
        if (a >= s.a0 && a <= s.a1) { hit = s.id; break; }
      }
    }

    this.hovered = hit;
    for (const s of this.sectors) {
      s.path.classList.toggle('hot', s.id === hit);
      s.path.classList.toggle('current', s.id === game.weapon);
    }

    const w = hit ? WEAPONS[hit] : null;
    if (w) {
      const ammo = game.ammo[hit];
      const ammoTxt = ammo === Infinity ? '∞' : ammo;
      this.centerLabel.innerHTML = `<span class="wc-name">${w.name}</span><span class="wc-ammo">${ammoTxt}</span>`;
    } else {
      this.centerLabel.textContent = '';
    }
  }

  /** Cierra la ruleta y devuelve el arma elegida (o null si nada válido). */
  close() {
    this.open = false;
    this.root.hidden = true;
    return this.hovered;
  }
}
