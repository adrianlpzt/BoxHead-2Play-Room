import * as THREE from 'three';
import { distXZ } from '../core/Collision.js';

const tmpDir = new THREE.Vector3();

/**
 * Explosión radial compartida por barriles y zombis bomba.
 * Centraliza daño, cadena, decals y sacudida para que todo reviente igual.
 */
export function explodeAt(game, pos, opts = {}) {
  const radius = opts.radius ?? 6.5;
  const damage = opts.damage ?? 160;
  const playerDamage = opts.playerDamage ?? 45;
  const color = opts.color ?? 0xffb13b;
  const shake = opts.shake ?? 0.6;
  const chain = opts.chain !== false;
  const freeze = opts.freeze ?? 0.055;

  game.particles.burst(pos, color, 24, { power: 16, size: 0.3, ttl: 0.8 });
  game.particles.burst(pos, 0x3a3a3a, 16, { power: 9, size: 0.22, ttl: 1.5 });
  if (game.shockwaves) {
    game.shockwaves.spawn(pos, color, { from: 0.5, to: radius * 1.1, ttl: 0.4, opacity: 0.7 });
  }
  game.flashLight(pos, color, 90, 0.4);
  game.shake(shake);
  game.audio.explosion(radius / 6.5);
  // Hitstop: congelar la simulación 40-60 ms multiplica la contundencia del golpe.
  game.freeze(freeze);
  game.decals.burn(pos, radius * 0.6);

  for (const z of game.zombies) {
    if (z.dead) continue;
    const d = distXZ(z.position, pos);
    if (d > radius) continue;
    const f = 1 - d / radius;
    tmpDir.set(z.position.x - pos.x, 0, z.position.z - pos.z);
    if (tmpDir.lengthSq() < 1e-6) tmpDir.set(1, 0, 0);
    tmpDir.normalize();
    z.takeDamage(damage * f, game, tmpDir, {
      explosive: true,
      knock: 16 * f,
      gib: true,
    });
  }

  for (const b of game.barrels) {
    if (b.dead) continue;
    const d = distXZ(b.position, pos);
    if (d > radius * 1.2) continue;
    if (chain) b.prime(0.1 + Math.random() * 0.09);
    // Aunque no explote todavía, la onda lo desplaza.
    tmpDir.set(b.position.x - pos.x, 0, b.position.z - pos.z);
    if (tmpDir.lengthSq() > 1e-6) b.push(tmpDir.normalize(), 9 * (1 - d / (radius * 1.2)));
  }

  if (chain && game.mines) {
    for (const m of game.mines) {
      if (m.dead) continue;
      if (distXZ(m.position, pos) <= radius * 1.1) m.explode(game);
    }
  }

  game.arena.damageCrates(pos, radius, damage * 0.55, game);

  const dp = distXZ(game.player.position, pos);
  if (dp < radius) {
    game.player.takeDamage(Math.round(playerDamage * (1 - dp / radius)), game);
  }
}
