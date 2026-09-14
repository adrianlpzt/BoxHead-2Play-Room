import * as THREE from 'three';
import { lerp, clamp } from './Collision.js';

/**
 * Soporte de cámara para uno o varios objetivos. Con un solo objetivo se comporta
 * como un seguimiento suave clásico; con dos encuadra el punto medio y aleja la
 * cámara según la separación, que es lo que hará falta para el cooperativo local.
 */
export class CameraRig {
  constructor(camera, { height = 27, back = 15.6, maxZoom = 1.9, spreadRef = 30 } = {}) {
    this.camera = camera;
    this.targets = [];
    this.offset = new THREE.Vector3(0, height, back);
    this.focus = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.zoom = 1;
    this.maxZoom = maxZoom;
    this.spreadRef = spreadRef;
  }

  addTarget(t) {
    this.targets.push(t);
  }

  removeTarget(t) {
    const i = this.targets.indexOf(t);
    if (i >= 0) this.targets.splice(i, 1);
  }

  update(dt, trauma = 0) {
    if (!this.targets.length) return;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const t of this.targets) {
      minX = Math.min(minX, t.position.x);
      maxX = Math.max(maxX, t.position.x);
      minZ = Math.min(minZ, t.position.z);
      maxZ = Math.max(maxZ, t.position.z);
    }
    this.focus.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);

    const spread = Math.max(maxX - minX, maxZ - minZ);
    const wanted = clamp(1 + spread / this.spreadRef, 1, this.maxZoom);
    this.zoom = lerp(this.zoom, wanted, Math.min(1, 2.5 * dt));

    this.desired.copy(this.offset).multiplyScalar(this.zoom).add(this.focus);
    this.camera.position.lerp(this.desired, Math.min(1, 6 * dt));

    // Screen shake cuadrático: los golpes pequeños apenas se notan.
    const s = trauma * trauma;
    if (s > 0) {
      this.camera.position.x += (Math.random() - 0.5) * 2.2 * s;
      this.camera.position.y += (Math.random() - 0.5) * 1.4 * s;
      this.camera.position.z += (Math.random() - 0.5) * 2.2 * s;
    }
    this.camera.lookAt(this.focus.x, 1, this.focus.z);
  }
}
