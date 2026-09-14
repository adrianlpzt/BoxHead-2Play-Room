import * as THREE from 'three';

/**
 * Estado de teclado/ratón. `endFrame()` debe llamarse al final de cada frame
 * para limpiar los eventos de un solo disparo (justPressed).
 */
export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseNDC = new THREE.Vector2(0, 0);
    this.fireDown = false;
    this.fireTapped = false;
    this.altTapped = false; // clic derecho

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    dom.addEventListener('mousemove', (e) => {
      const r = dom.getBoundingClientRect();
      this.mouseNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouseNDC.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    });

    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.fireDown = true;
        this.fireTapped = true;
      }
      if (e.button === 2) this.altTapped = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireDown = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.fireDown = false;
    });
  }

  pressed(code) {
    return this.keys.has(code);
  }

  tapped(code) {
    return this.justPressed.has(code);
  }

  /** Vector de movimiento normalizado en XZ a partir de WASD. */
  moveVector(out) {
    let x = 0;
    let z = 0;
    if (this.pressed('KeyW') || this.pressed('ArrowUp')) z -= 1;
    if (this.pressed('KeyS') || this.pressed('ArrowDown')) z += 1;
    if (this.pressed('KeyA') || this.pressed('ArrowLeft')) x -= 1;
    if (this.pressed('KeyD') || this.pressed('ArrowRight')) x += 1;
    out.set(x, 0, z);
    if (out.lengthSq() > 0) out.normalize();
    return out;
  }

  endFrame() {
    this.justPressed.clear();
    this.fireTapped = false;
    this.altTapped = false;
  }
}
