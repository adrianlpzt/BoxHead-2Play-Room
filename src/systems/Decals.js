import * as THREE from 'three';

/**
 * Persistencia de la arena. En vez de mallas de decal (una por mancha, con
 * z-fighting y draw calls), pintamos sobre un canvas del tamaño de la sala y lo
 * subimos como textura sobre el suelo. Coste fijo: una malla y una subida de
 * textura como mucho cada UPLOAD_INTERVAL segundos.
 */
const UPLOAD_INTERVAL = 0.12;

export class Decals {
  constructor(scene, size, res = 1024) {
    this.size = size;
    this.res = res;
    this.canvas = document.createElement('canvas');
    this.canvas.width = res;
    this.canvas.height = res;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.anisotropy = 4;

    const mat = new THREE.MeshLambertMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.02;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    this.dirty = false;
    this.timer = 0;
  }

  #px(x, z) {
    const k = this.res / this.size;
    return [(x + this.size / 2) * k, (z + this.size / 2) * k];
  }

  blood(pos, scale = 1, color = '150,18,14') {
    const [cx, cy] = this.#px(pos.x, pos.z);
    const g = this.ctx;
    const r = (this.res / this.size) * 0.75 * scale;

    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(${color},0.85)`);
    grad.addColorStop(0.6, `rgba(${color},0.45)`);
    grad.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();

    // Salpicaduras: rompen el círculo perfecto y dan lectura de impacto.
    g.fillStyle = `rgba(${color},0.6)`;
    const drops = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < drops; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = r * (0.6 + Math.random() * 1.5);
      g.beginPath();
      g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.08 + Math.random() * 0.22), 0, Math.PI * 2);
      g.fill();
    }
    this.dirty = true;
  }

  burn(pos, radius) {
    const [cx, cy] = this.#px(pos.x, pos.z);
    const g = this.ctx;
    const r = (this.res / this.size) * radius;

    const grad = g.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    grad.addColorStop(0, 'rgba(12,10,9,0.82)');
    grad.addColorStop(0.55, 'rgba(26,20,16,0.5)');
    grad.addColorStop(1, 'rgba(30,24,18,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();

    g.strokeStyle = 'rgba(70,44,20,0.35)';
    g.lineWidth = r * 0.08;
    g.beginPath();
    g.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
    g.stroke();
    this.dirty = true;
  }

  scorch(pos, scale = 1) {
    const [cx, cy] = this.#px(pos.x, pos.z);
    const g = this.ctx;
    const r = (this.res / this.size) * 0.25 * scale;
    g.fillStyle = 'rgba(20,18,16,0.5)';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    this.dirty = true;
  }

  update(dt) {
    if (!this.dirty) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.texture.needsUpdate = true;
    this.dirty = false;
    this.timer = UPLOAD_INTERVAL;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.res, this.res);
    this.texture.needsUpdate = true;
    this.dirty = false;
  }
}
