import * as THREE from 'three';
import { distXZ, rand } from '../core/Collision.js';

export const SPELLS = {
  stomp: {
    name: 'Pisar del Titán', key: 'Q', cost: 20, cooldown: 0.9, unlockAt: 3,
    radius: 5.5, halfAngleDeg: 55, damage: 45, knock: 14,
  },
  frostnova: {
    name: 'Nova de Hielo', key: 'E', cost: 35, cooldown: 1.4, unlockAt: 7,
    radius: 6, duration: 3,
  },
};

export const SPELL_ORDER = ['stomp', 'frostnova'];

const vDir = new THREE.Vector3();
const vFace = new THREE.Vector3();
const vTile = new THREE.Vector3();

/**
 * Cono frontal de knockback. El jugador salta y aterriza con fuerza; levanta
 * baldosas del suelo en la dirección a la que mira y empuja/daña a todo lo
 * que quede dentro del arco.
 */
export function castStomp(game) {
  const cfg = SPELLS.stomp;
  const p = game.player.position;
  vFace.set(Math.sin(game.player.group.rotation.y), 0, Math.cos(game.player.group.rotation.y));
  const cosHalf = Math.cos((cfg.halfAngleDeg * Math.PI) / 180);

  for (const z of game.zombies) {
    if (z.dead) continue;
    const d = distXZ(p, z.position);
    if (d > cfg.radius || d < 0.01) continue;
    vDir.set(z.position.x - p.x, 0, z.position.z - p.z).normalize();
    if (vDir.dot(vFace) < cosHalf) continue;

    const falloff = 1 - d / cfg.radius;
    z.takeDamage(cfg.damage * falloff, game, vDir, { knock: cfg.knock * falloff });
  }

  // Baldosas del suelo saltando en el cono — puramente decorativo, sin colisión.
  for (let i = 0; i < 10; i++) {
    const a = (Math.random() - 0.5) * ((cfg.halfAngleDeg * Math.PI) / 90);
    const dist = rand(1, cfg.radius);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    vTile.set(
      p.x + (vFace.x * ca - vFace.z * sa) * dist,
      0.06,
      p.z + (vFace.x * sa + vFace.z * ca) * dist
    );
    game.debris.spawn(
      vTile, { x: rand(0.4, 0.8), y: 0.12, z: rand(0.4, 0.8) }, 0x3a3f4a,
      new THREE.Vector3(rand(-1, 1), rand(3, 7), rand(-1, 1)), { ttl: rand(1.4, 2.2) }
    );
  }

  game.particles.burst(p, 0x8a8578, 20, { power: 7, size: 0.2, ttl: 0.6, spread: 1.2 });
  // Onda de polvo + grieta en el suelo dentro del cono.
  const ang = Math.atan2(vFace.x, vFace.z);
  game.shockwaves.spawn(p, 0xb5a98c, { from: 0.5, to: cfg.radius * 1.1, ttl: 0.45, opacity: 0.7 });
  game.decals.crack(p, cfg.radius * 0.8, ang, (cfg.halfAngleDeg * Math.PI) / 180);
  game.shake(0.35);
  game.freeze(0.05);
  game.audio.titanStomp();
}

/** Onda expansiva radial: congela todo lo que pille dentro del radio. */
export function castFrostNova(game) {
  const cfg = SPELLS.frostnova;
  const p = game.player.position;

  for (const z of game.zombies) {
    if (z.dead) continue;
    if (distXZ(p, z.position) > cfg.radius) continue;
    z.freeze(cfg.duration);
    // Esquirlas de escarcha brotando sobre cada enemigo alcanzado.
    vTile.set(z.position.x, 1.2, z.position.z);
    game.particles.burst(vTile, 0xdff5fb, 5, { power: 4, size: 0.14, ttl: 0.7, up: 0.6 });
  }

  // Doble anillo de hielo: uno rápido y fino, otro más lento y ancho.
  game.shockwaves.spawn(p, 0xbfeaf5, { from: 0.5, to: cfg.radius, ttl: 0.4, opacity: 0.85 });
  game.shockwaves.spawn(p, 0x7fd0e8, { from: 0.5, to: cfg.radius * 1.15, ttl: 0.6, opacity: 0.5 });
  game.particles.burst(p, 0xbfeaf5, 30, { power: 9, size: 0.16, ttl: 0.8, spread: 0.3, up: 0.3 });
  game.flashLight(p, 0x9fe0f0, 40, 0.3);
  game.shake(0.2);
  game.audio.frostNova();
}

export const SPELL_CAST = { stomp: castStomp, frostnova: castFrostNova };
