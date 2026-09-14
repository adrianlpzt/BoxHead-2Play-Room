import * as THREE from 'three';
import './style.css';

import { Arena } from './world/Arena.js';
import { Player } from './entities/Player.js';
import { Barrel } from './entities/Barrel.js';
import { Pickup } from './entities/Pickup.js';
import { WeaponSystem, WEAPONS, WEAPON_ORDER } from './systems/Weapons.js';
import { WaveManager } from './systems/WaveManager.js';
import { Particles } from './systems/Particles.js';
import { Debris } from './systems/Debris.js';
import { Decals } from './systems/Decals.js';
import { Fireballs } from './systems/Fireballs.js';
import { AudioKit } from './systems/Audio.js';
import { Input } from './core/Input.js';
import { HUD } from './core/HUD.js';
import { CameraRig } from './core/CameraRig.js';
import { SpatialHash } from './core/SpatialHash.js';
import { circleHitsBox, distXZ } from './core/Collision.js';

const ARENA_SIZE = 56;
const MAX_HITSTOP = 0.075; // tope duro: encadenar congelaciones sentiría lag, no impacto

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);
scene.fog = new THREE.Fog(0x0b0d12, 50, 110);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 300);
const rig = new CameraRig(camera, { height: 27, back: 15.6 });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------ luces
const ambient = new THREE.AmbientLight(0x50607a, 1.1);
const hemi = new THREE.HemisphereLight(0x5b6a86, 0x14161c, 0.5);
scene.add(ambient, hemi);

const sun = new THREE.DirectionalLight(0xfff1d6, 1.5);
sun.position.set(24, 46, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -42;
sun.shadow.camera.right = 42;
sun.shadow.camera.top = 42;
sun.shadow.camera.bottom = -42;
sun.shadow.camera.near = 5;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

const flashPool = [];
for (let i = 0; i < 8; i++) {
  const l = new THREE.PointLight(0xff8c2b, 0, 22, 2);
  scene.add(l);
  flashPool.push({ light: l, life: 0, ttl: 1 });
}
let flashCursor = 0;

// ------------------------------------------------------------------ juego
const arena = new Arena(scene, ARENA_SIZE);
const decals = new Decals(scene, ARENA_SIZE, 1024);
const particles = new Particles(scene, 900);
const debris = new Debris(scene, 420);
const shells = new Debris(scene, 150);
const weapons = new WeaponSystem(scene, 240);
const fireballs = new Fireballs(scene, 32);
const player = new Player(scene);
const input = new Input(canvas);
const hud = new HUD();
const audio = new AudioKit();
const grid = new SpatialHash(2);

rig.addTarget(player);

// El AudioContext solo puede nacer de un gesto del usuario.
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

let hitstop = 0;

const game = {
  scene, arena, decals, particles, debris, shells, weapons, fireballs,
  player, audio, grid,
  walls: arena.walls,
  zombies: [],
  barrels: [],
  corpses: [],
  pickups: [],
  score: 0,
  combo: 0,
  comboWindow: 3.2,
  comboTimer: 0,
  multiplier: 1,
  weapon: 'pistol',
  unlocked: new Set(['pistol']),
  ammo: { pistol: Infinity, shotgun: 12, uzi: 90, barrel: 2 },
  bestMultiplier: 1,
  state: 'playing',
  trauma: 0,
  night: false,
  crowded: false,

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  },

  /** Hitstop: congela la simulación unos milisegundos sin parar el render. */
  freeze(seconds) {
    hitstop = Math.min(MAX_HITSTOP, Math.max(hitstop, seconds));
  },

  flashLight(pos, color, intensity, ttl) {
    const f = flashPool[flashCursor];
    flashCursor = (flashCursor + 1) % flashPool.length;
    f.light.position.set(pos.x, Math.max(pos.y, 0.8), pos.z);
    f.light.color.setHex(color);
    f.light.intensity = intensity;
    f.life = ttl;
    f.ttl = ttl;
  },

  registerKill(zombie) {
    this.combo += 1;
    this.comboTimer = this.comboWindow;
    this.multiplier = Math.min(10, this.combo);
    this.score += zombie.cfg.points * this.multiplier;

    if (this.combo % 2 === 0) this.ammo.shotgun += 1;
    this.ammo.uzi += 3;
    if (this.combo % 6 === 0) this.ammo.barrel += 1;

    if (this.multiplier > this.bestMultiplier) this.bestMultiplier = this.multiplier;
    unlockByMultiplier(this.multiplier);
    maybeDrop(zombie);
  },

  onWaveStart(n) {
    hud.showBanner(`Oleada ${n}`, 1.8);
    audio.wave();
  },

  onWaveCleared(n) {
    this.score += 50 * n;
    this.ammo.shotgun += 6;
    this.ammo.uzi += 40;
    this.ammo.barrel += 2;
    hud.showBanner(`Oleada ${n} despejada`, 2);
  },

  onPlayerDeath() {
    this.state = 'over';
    this.shake(0.8);
    hud.showGameOver(this);
  },
};

const waves = new WaveManager(game);
game.waves = waves;

function unlockByMultiplier(mult) {
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    if (!game.unlocked.has(id) && mult >= w.unlockAt) {
      game.unlocked.add(id);
      hud.showBanner(`${w.name} desbloqueada`, 1.6);
      audio.unlockWeapon();
    }
  }
}

/**
 * Sueltas ponderadas por escasez. Es el seguro contra la espiral de munición:
 * cuanto más seco estás, más probable es que caiga justo lo que te falta.
 */
function maybeDrop(zombie) {
  const dry = game.ammo.shotgun < 6 && game.ammo.uzi < 25;
  const chance = dry ? 0.5 : 0.14;
  if (Math.random() > chance) return;

  let kind;
  if (game.player.hp < 45 && Math.random() < 0.3) kind = 'health';
  else if (game.ammo.uzi < 25) kind = 'uzi';
  else if (game.ammo.shotgun < 6) kind = 'shotgun';
  else kind = Math.random() < 0.25 ? 'barrel' : Math.random() < 0.5 ? 'shotgun' : 'uzi';

  game.pickups.push(new Pickup(scene, zombie.position, kind));
}

// ----------------------------------------------------------- modo nocturno
function setNight(on) {
  game.night = on;
  ambient.intensity = on ? 0.16 : 1.1;
  hemi.intensity = on ? 0.1 : 0.5;
  sun.intensity = on ? 0.12 : 1.5;
  sun.color.setHex(on ? 0x9fb4ff : 0xfff1d6);
  scene.background.setHex(on ? 0x05060a : 0x0b0d12);
  scene.fog.color.setHex(on ? 0x05060a : 0x0b0d12);
  scene.fog.near = on ? 26 : 50;
  scene.fog.far = on ? 64 : 110;
  player.setFlashlight(on);
  hud.setNight(on);
}

// --------------------------------------------------------- apuntado y tiro
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const aimPoint = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const aimDir = new THREE.Vector3();
const forward = new THREE.Vector3();

function updateAim() {
  raycaster.setFromCamera(input.mouseNDC, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, aimPoint)) {
    aimPoint.set(player.position.x, 0, player.position.z + 5);
  }
}

function selectWeapon(id) {
  if (game.unlocked.has(id)) game.weapon = id;
}

function placeBarrel() {
  if (!game.unlocked.has('barrel') || game.ammo.barrel <= 0 || weapons.cooldown > 0) return;

  forward.set(Math.sin(player.group.rotation.y), 0, Math.cos(player.group.rotation.y));
  const pos = player.position.clone().addScaledVector(forward, 1.7);
  pos.y = 0;

  for (const w of game.walls) if (circleHitsBox(pos.x, pos.z, 0.7, w)) return;
  for (const b of game.barrels) if (distXZ(b.position, pos) < 1.35) return;

  game.barrels.push(new Barrel(scene, pos));
  game.ammo.barrel -= 1;
  weapons.cooldown = WEAPONS.barrel.cooldown;
  audio.place();
}

function handleShooting() {
  const id = game.weapon;
  const w = WEAPONS[id];
  if (w.placeable) {
    if (input.fireTapped || input.tapped('Space')) placeBarrel();
    return;
  }

  const wantsFire = w.auto
    ? input.fireDown || input.pressed('Space')
    : input.fireTapped || input.tapped('Space');
  if (!wantsFire || !weapons.canFire() || game.ammo[id] <= 0) return;

  aimDir.set(aimPoint.x - player.position.x, 0, aimPoint.z - player.position.z);
  if (aimDir.lengthSq() < 0.001) return;
  aimDir.normalize();

  player.muzzle(muzzlePos);
  if (weapons.fire(game, id, muzzlePos, aimDir) && game.ammo[id] !== Infinity) {
    game.ammo[id] -= 1;
    if (game.ammo[id] <= 0) selectWeapon('pistol');
  }
}

/** Separación por cuadrícula espacial: lineal en el número de enemigos. */
function separateZombies() {
  grid.build(game.zombies);
  grid.forEachPair(game.zombies, (a, b) => {
    const dx = b.position.x - a.position.x;
    const dz = b.position.z - a.position.z;
    const min = a.radius + b.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-6) return;
    const d = Math.sqrt(d2);
    const push = (min - d) * 0.5;
    const nx = dx / d;
    const nz = dz / d;
    a.position.x -= nx * push;
    a.position.z -= nz * push;
    b.position.x += nx * push;
    b.position.z += nz * push;
    if (a.knock.lengthSq() > 4) b.knock.addScaledVector(a.knock, 0.18);
    if (b.knock.lengthSq() > 4) a.knock.addScaledVector(b.knock, 0.18);
  });
}

function sweep(list) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].dead) {
      list[i].dispose(scene);
      list.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------------ reset
function resetGame() {
  for (const list of [game.zombies, game.barrels, game.corpses, game.pickups]) {
    for (const e of list) e.dispose(scene);
    list.length = 0;
  }

  weapons.clear();
  fireballs.clear();
  particles.clear();
  debris.clear();
  shells.clear();
  decals.clear();
  player.reset();

  game.score = 0;
  game.combo = 0;
  game.comboTimer = 0;
  game.multiplier = 1;
  game.bestMultiplier = 1;
  game.weapon = 'pistol';
  game.unlocked = new Set(['pistol']);
  game.ammo = { pistol: Infinity, shotgun: 12, uzi: 90, barrel: 2 };
  game.trauma = 0;
  game.state = 'playing';
  hitstop = 0;

  waves.reset();
  hud.hideGameOver();
}

// -------------------------------------------------------------------- loop
const clock = new THREE.Clock();

function tick() {
  const raw = Math.min(clock.getDelta(), 0.05);

  // Hitstop: dt = 0 para la simulación, pero el render y la sacudida siguen vivos.
  let dt = raw;
  if (hitstop > 0) {
    hitstop -= raw;
    dt = 0;
  }

  if (input.tapped('KeyL')) setNight(!game.night);
  if (input.tapped('KeyM')) hud.showBanner(audio.toggleMute() ? 'Sonido apagado' : 'Sonido activo', 1.2);

  if (game.state === 'over') {
    if (input.tapped('KeyR')) resetGame();
  } else if (dt > 0) {
    game.crowded = game.zombies.length > 60;
    updateAim();
    input.moveVector(moveDir);

    WEAPON_ORDER.forEach((id, i) => {
      if (input.tapped(`Digit${i + 1}`)) selectWeapon(id);
    });
    if (input.tapped('KeyB') && game.unlocked.has('barrel')) {
      if (game.weapon === 'barrel') placeBarrel();
      else selectWeapon('barrel');
    }
    if (input.altTapped) placeBarrel();
    if (input.tapped('ShiftLeft') || input.tapped('ShiftRight')) player.dash(moveDir, game);

    player.update(dt, moveDir, aimPoint, game);
    handleShooting();

    // La cuadrícula se reconstruye antes de mover balas y bolas de fuego, para
    // que las consultas de impacto sean O(vecinos) y no O(enemigos).
    grid.build(game.zombies);
    weapons.update(dt, game);
    fireballs.update(dt, game);

    for (const z of game.zombies) z.update(dt, game);
    separateZombies();
    for (const b of game.barrels) b.update(dt, game);
    for (const c of game.corpses) c.update(dt, game);
    for (const pk of game.pickups) pk.update(dt, game);

    sweep(game.zombies);
    sweep(game.barrels);
    sweep(game.corpses);
    sweep(game.pickups);

    if (game.comboTimer > 0) {
      game.comboTimer -= dt;
      if (game.comboTimer <= 0) {
        game.comboTimer = 0;
        game.combo = 0;
        game.multiplier = 1;
      }
    }

    waves.update(dt);
  }

  particles.update(dt);
  debris.update(dt);
  shells.update(dt);
  decals.update(raw);

  for (const f of flashPool) {
    if (f.life <= 0) continue;
    f.life -= raw;
    f.light.intensity *= Math.pow(0.02, raw / f.ttl);
    if (f.life <= 0) f.light.intensity = 0;
  }

  game.trauma = Math.max(0, game.trauma - raw * 1.6);
  rig.update(raw, game.trauma);

  sun.position.set(player.position.x + 24, 46, player.position.z + 18);
  sun.target.position.copy(player.position);
  sun.target.updateMatrixWorld();

  hud.update(game, raw);
  renderer.render(scene, camera);
  input.endFrame();
}

renderer.setAnimationLoop(tick);
window.__game = game;
