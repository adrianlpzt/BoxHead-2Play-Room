import * as THREE from 'three';
import { makeBox, rand } from '../core/Collision.js';

const VOXEL = 1.25;
const VEL = new THREE.Vector3(); // vector de trabajo: Debris.spawn copia los valores

/** Distancia de un punto a un AABB en XZ (0 si está dentro). */
function distToBox(x, z, b) {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

/**
 * Cobertura destructible: un bloque de vóxeles con vida propia. Según baja la
 * vida se van cayendo cubos sueltos, y al agotarse desaparece también su colisión.
 */
class Crate {
  constructor(group, cx, cz, sx, sz, layers, color) {
    this.alive = true;
    this.voxels = [];
    this.color = color;
    this.mat = new THREE.MeshLambertMaterial({ color });
    this.geo = new THREE.BoxGeometry(VOXEL * 0.98, VOXEL * 0.98, VOXEL * 0.98);

    const nx = Math.max(1, Math.round(sx / VOXEL));
    const nz = Math.max(1, Math.round(sz / VOXEL));

    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        for (let iy = 0; iy < layers; iy++) {
          const m = new THREE.Mesh(this.geo, this.mat);
          m.position.set(
            cx + (ix - (nx - 1) / 2) * VOXEL,
            VOXEL / 2 + iy * VOXEL,
            cz + (iz - (nz - 1) / 2) * VOXEL
          );
          m.castShadow = true;
          m.receiveShadow = true;
          group.add(m);
          this.voxels.push(m);
        }
      }
    }

    // Pila preordenada de arriba a abajo: arrancar un cubo es un pop(), no un
    // filter() + sort() sobre los 32 vóxeles en cada balazo.
    this.stack = this.voxels.slice().sort((a, b) => a.position.y - b.position.y);
    this.group = group;
    this.maxHp = this.voxels.length * 26;
    this.hp = this.maxHp;
    this.box = makeBox(cx, cz, nx * VOXEL, nz * VOXEL);
    this.box.crate = this;
  }

  #popVoxel(game, impactDir) {
    // Se desmorona desde la cima, con un salto aleatorio corto para no ser perfecto.
    let idx = this.stack.length - 1 - Math.floor(Math.random() * Math.min(4, this.stack.length));
    if (idx < 0) return;
    const v = this.stack.splice(idx, 1)[0];
    if (!v) return;
    v.visible = false;

    const vel = VEL.set(
      (impactDir?.x ?? rand(-1, 1)) * rand(1, 4) + rand(-2, 2),
      rand(3, 7),
      (impactDir?.z ?? rand(-1, 1)) * rand(1, 4) + rand(-2, 2)
    );
    game.debris.spawn(v.position, { x: VOXEL, y: VOXEL, z: VOXEL }, this.color, vel, {
      ttl: rand(5, 8),
    });
    game.particles.burst(v.position, this.color, 5, { power: 6, size: 0.14, ttl: 0.6 });
  }

  damage(amount, game, impactDir = null) {
    if (!this.alive) return;
    this.hp -= amount;

    // Mantiene la proporción de cubos visibles igual a la de vida restante.
    const wanted = Math.max(0, Math.ceil((this.hp / this.maxHp) * this.voxels.length));
    let guard = 0;
    while (this.stack.length > wanted && guard++ < 12) this.#popVoxel(game, impactDir);

    if (this.hp <= 0) this.destroy(game);
  }

  destroy(game) {
    if (!this.alive) return;
    this.alive = false;
    while (this.stack.length) this.#popVoxel(game, null);
    const center = new THREE.Vector3(
      (this.box.minX + this.box.maxX) / 2,
      0,
      (this.box.minZ + this.box.maxZ) / 2
    );
    game.decals.scorch(center, 2.2);
    game.shake(0.12);

    const i = game.arena.walls.indexOf(this.box);
    if (i >= 0) game.arena.walls.splice(i, 1);
  }
}

export class Arena {
  constructor(scene, size = 56) {
    this.size = size;
    this.half = size / 2;
    this.walls = [];
    this.crates = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    this.#buildFloor();
    this.#buildWalls();
    this.#buildCrates();

    this.spawnPoints = [
      new THREE.Vector3(-this.half + 4, 0, -this.half + 4),
      new THREE.Vector3(this.half - 4, 0, -this.half + 4),
      new THREE.Vector3(-this.half + 4, 0, this.half - 4),
      new THREE.Vector3(this.half - 4, 0, this.half - 4),
    ];
  }

  #tileTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#2b2f38';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
      const s = 4 + Math.random() * 16;
      g.fillRect(Math.random() * 128, Math.random() * 128, s, s);
    }
    g.strokeStyle = '#1a1d24';
    g.lineWidth = 6;
    g.strokeRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.size / 4, this.size / 4);
    tex.magFilter = THREE.NearestFilter;
    return tex;
  }

  #buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size, this.size),
      new THREE.MeshLambertMaterial({ map: this.#tileTexture() })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    this.floor = floor;
  }

  #addWallBox(cx, cz, sx, sy, sz, color = 0x555b66) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(cx, sy / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.walls.push(makeBox(cx, cz, sx, sz));
    return mesh;
  }

  #buildWalls() {
    const t = 2;
    const h = 3.2;
    const s = this.size;
    const o = this.half + t / 2;
    this.#addWallBox(0, -o, s + t * 2, h, t);
    this.#addWallBox(0, o, s + t * 2, h, t);
    this.#addWallBox(-o, 0, t, h, s + t * 2);
    this.#addWallBox(o, 0, t, h, s + t * 2);
    // Pilares centrales de hormigón: indestructibles, dan estructura al mapa.
    this.#addWallBox(0, -9, 8, 2.6, 2.5, 0x4d525c);
    this.#addWallBox(0, 9, 8, 2.6, 2.5, 0x4d525c);
  }

  #buildCrates() {
    const spots = [
      [-14, -14, 5, 5],
      [14, -14, 5, 5],
      [-14, 14, 5, 5],
      [14, 14, 5, 5],
    ];
    for (const [x, z, sx, sz] of spots) {
      const crate = new Crate(this.group, x, z, sx, sz, 2, 0x7a6a4f);
      this.crates.push(crate);
      this.walls.push(crate.box);
    }
  }

  /** Daño de área a todas las coberturas dentro del radio. */
  damageCrates(pos, radius, amount, game) {
    for (const c of this.crates) {
      if (!c.alive) continue;
      const d = distToBox(pos.x, pos.z, c.box);
      if (d > radius) continue;
      const dir = new THREE.Vector3(
        (c.box.minX + c.box.maxX) / 2 - pos.x,
        0,
        (c.box.minZ + c.box.maxZ) / 2 - pos.z
      );
      if (dir.lengthSq() > 1e-6) dir.normalize();
      c.damage(amount * (1 - d / radius), game, dir);
    }
  }

  randomSpawn(playerPos) {
    let best = this.spawnPoints[0];
    let bestD = -1;
    for (const p of this.spawnPoints) {
      const d = p.distanceToSquared(playerPos) * (0.6 + Math.random());
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    return new THREE.Vector3(
      best.x + (Math.random() - 0.5) * 5,
      0,
      best.z + (Math.random() - 0.5) * 5
    );
  }
}
