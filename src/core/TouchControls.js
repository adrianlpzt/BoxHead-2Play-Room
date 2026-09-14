/**
 * Controles táctiles para móvil: dos joysticks virtuales.
 *  - Izquierda: movimiento (alimenta un vector normalizado).
 *  - Derecha: apuntado; mientras se arrastra, dispara en esa dirección.
 * Alimenta al Input igual que teclado/ratón, así el resto del juego no cambia.
 *
 * Los joysticks son "flotantes": aparecen donde tocas dentro de su media
 * pantalla, no en una posición fija — mucho más cómodo en móvil.
 */
export class TouchControls {
  constructor(input) {
    this.input = input;
    this.move = { id: null, baseX: 0, baseY: 0, dx: 0, dy: 0 };
    this.aim = { id: null, baseX: 0, baseY: 0, dx: 0, dy: 0 };
    this.maxR = 60; // radio máximo del joystick en px

    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.innerHTML = `
      <div class="stick" id="stick-move"><span></span></div>
      <div class="stick" id="stick-aim"><span></span></div>
      <div class="touch-buttons">
        <button data-key="KeyQ">Q</button>
        <button data-key="KeyE">E</button>
        <button data-key="ShiftLeft">⟿</button>
        <button data-key="wheel">🔁</button>
      </div>`;
    document.getElementById('hud').appendChild(this.root);

    this.moveEl = this.root.querySelector('#stick-move');
    this.aimEl = this.root.querySelector('#stick-aim');
    this.moveKnob = this.moveEl.querySelector('span');
    this.aimKnob = this.aimEl.querySelector('span');

    this.#bindButtons();
    this.#bindTouch();
  }

  #bindButtons() {
    for (const b of this.root.querySelectorAll('.touch-buttons button')) {
      const key = b.dataset.key;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (key === 'wheel') {
          this.input.keys.add('Tab'); // mantener abre la ruleta
        } else {
          this.input.keys.add(key);
          this.input.justPressed.add(key);
        }
      }, { passive: false });
      b.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.input.keys.delete(key === 'wheel' ? 'Tab' : key);
      }, { passive: false });
    }
  }

  #bindTouch() {
    const w = window.innerWidth;

    const start = (t) => {
      // Mitad izquierda → joystick de movimiento; derecha → apuntado/disparo.
      const side = t.clientX < w / 2 ? this.move : this.aim;
      if (side.id !== null) return;
      side.id = t.identifier;
      side.baseX = t.clientX;
      side.baseY = t.clientY;
      side.dx = 0;
      side.dy = 0;
      const el = side === this.move ? this.moveEl : this.aimEl;
      el.style.left = `${t.clientX}px`;
      el.style.top = `${t.clientY}px`;
      el.classList.add('active');
    };

    const move = (t) => {
      for (const side of [this.move, this.aim]) {
        if (side.id !== t.identifier) continue;
        let dx = t.clientX - side.baseX;
        let dy = t.clientY - side.baseY;
        const len = Math.hypot(dx, dy);
        if (len > this.maxR) {
          dx = (dx / len) * this.maxR;
          dy = (dy / len) * this.maxR;
        }
        side.dx = dx;
        side.dy = dy;
        const knob = side === this.move ? this.moveKnob : this.aimKnob;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    };

    const end = (t) => {
      for (const side of [this.move, this.aim]) {
        if (side.id !== t.identifier) continue;
        side.id = null;
        side.dx = 0;
        side.dy = 0;
        const el = side === this.move ? this.moveEl : this.aimEl;
        const knob = side === this.move ? this.moveKnob : this.aimKnob;
        el.classList.remove('active');
        knob.style.transform = 'translate(0,0)';
      }
    };

    window.addEventListener('touchstart', (e) => {
      // Ignora toques sobre botones (los maneja #bindButtons).
      if (e.target.closest('.touch-buttons')) return;
      for (const t of e.changedTouches) start(t);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) move(t);
    }, { passive: true });
    window.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) end(t);
    }, { passive: true });
    window.addEventListener('touchcancel', (e) => {
      for (const t of e.changedTouches) end(t);
    }, { passive: true });
  }

  /** Detecta si el dispositivo es táctil y activa la capa. */
  static isTouch() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  }

  enable() {
    this.root.classList.add('on');
    document.body.classList.add('touch-device');
  }

  /**
   * Vuelca el estado táctil en el Input cada frame:
   *  - move → moveVector (vía input.touchMove)
   *  - aim  → mouseNDC + fireDown mientras se arrastra el joystick derecho
   */
  apply() {
    // Movimiento.
    if (this.move.id !== null && (this.move.dx || this.move.dy)) {
      const len = Math.hypot(this.move.dx, this.move.dy) / this.maxR;
      this.input.touchMove = {
        x: (this.move.dx / this.maxR),
        z: (this.move.dy / this.maxR),
        active: true,
        mag: Math.min(1, len),
      };
    } else {
      this.input.touchMove = { x: 0, z: 0, active: false, mag: 0 };
    }

    // Apuntado + disparo. El joystick derecho define una dirección; mientras se
    // mantiene fuera de la zona muerta, dispara.
    if (this.aim.id !== null && Math.hypot(this.aim.dx, this.aim.dy) > 12) {
      // Convertimos la dirección del stick a un punto NDC alrededor del centro.
      const len = Math.hypot(this.aim.dx, this.aim.dy);
      this.input.mouseNDC.x = (this.aim.dx / len) * 0.6;
      this.input.mouseNDC.y = -(this.aim.dy / len) * 0.6;
      this.input.fireDown = true;
      if (!this.input._touchFiring) {
        this.input.fireTapped = true;
        this.input._touchFiring = true;
      }
    } else {
      if (this.input._touchFiring) this.input.fireDown = false;
      this.input._touchFiring = false;
    }
  }
}
