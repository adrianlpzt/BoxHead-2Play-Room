import * as THREE from 'three';
import './style.css';

import { Arena } from './world/Arena.js';
import { MAPS, MAP_ORDER } from './world/Maps.js';
import { Player } from './entities/Player.js';
import { Barrel } from './entities/Barrel.js';
import { Mine } from './entities/Mine.js';
import { Turret } from './entities/Turret.js';
import { Pickup } from './entities/Pickup.js';
import { FloatingBars } from './entities/FloatingBars.js';
import { WeaponSystem, WEAPONS, WEAPON_ORDER, effWeapon } from './systems/Weapons.js';
import { WaveManager } from './systems/WaveManager.js';
import { Particles } from './systems/Particles.js';
import { Debris } from './systems/Debris.js';
import { Decals } from './systems/Decals.js';
import { Fireballs } from './systems/Fireballs.js';
import { Grenades } from './systems/Grenades.js';
import { Shockwaves } from './systems/Shockwaves.js';
import { SPELLS, SPELL_ORDER, SPELL_CAST } from './systems/Spells.js';
import { AudioKit } from './systems/Audio.js';
import { Input } from './core/Input.js';
import { HUD } from './core/HUD.js';
import { WeaponWheel } from './core/WeaponWheel.js';
import { Menu } from './core/Menu.js';
import { Ranking } from './core/Ranking.js';
import { TouchControls } from './core/TouchControls.js';
import { Net } from './core/Net.js';
import { HostSession } from './net/HostSession.js';
import { GuestSession } from './net/GuestSession.js';
import { CameraRig } from './core/CameraRig.js';
import { SpatialHash } from './core/SpatialHash.js';
import { circleHitsBox, distXZ, resolveCircleBox } from './core/Collision.js';

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
let currentMap = localStorage.getItem('boxhead3d.map') || 'box';
if (!MAP_ORDER.includes(currentMap)) currentMap = 'box';
const decals = new Decals(scene, ARENA_SIZE, 1024);
const particles = new Particles(scene, 900);
const debris = new Debris(scene, 420);
const shells = new Debris(scene, 150);
const weapons = new WeaponSystem(scene, 240);
const fireballs = new Fireballs(scene, 32);
const grenades = new Grenades(scene, 16);
const shockwaves = new Shockwaves(scene, 14);
const player = new Player(scene);
const floatingBars = new FloatingBars(scene);
const input = new Input(canvas);
const touch = new TouchControls(input);
const isTouch = TouchControls.isTouch();
if (isTouch) touch.enable();
const hud = new HUD();
const wheel = new WeaponWheel();
const ranking = new Ranking();
const net = new Net();
let pendingName = localStorage.getItem('boxhead3d.name') || '';
let netSession = null; // HostSession | GuestSession | null
let isGuest = false;

const menu = new Menu(ranking, net, {
  onPlay: (name, mapId) => {
    pendingName = name;
    isGuest = false;
    netSession = null;
    if (mapId && MAP_ORDER.includes(mapId)) {
      currentMap = mapId;
      localStorage.setItem('boxhead3d.map', mapId);
    }
    startGame();
  },
  onPlayMulti: (role, mapId) => {
    pendingName = localStorage.getItem('boxhead3d.name') || '';
    if (mapId && MAP_ORDER.includes(mapId)) {
      currentMap = mapId;
      localStorage.setItem('boxhead3d.map', mapId);
    }
    isGuest = role === 'guest';
    startGame();
    // Crear la sesión de red DESPUÉS de startGame (que resetea el mundo).
    if (role === 'host') {
      netSession = new HostSession(game, net, scene);
    } else {
      netSession = new GuestSession(game, net, scene, input);
    }
  },
});

// Botones de la pantalla de fin de partida.
document.getElementById('btn-retry').onclick = () => {
  if (game.state === 'over') resetGame();
};
document.getElementById('btn-menu').onclick = () => {
  if (game.state === 'over') returnToMenu();
};
const audio = new AudioKit();
const grid = new SpatialHash(2);

rig.addTarget(player);

// El AudioContext solo puede nacer de un gesto del usuario.
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

let hitstop = 0;

const game = {
  scene, arena, decals, particles, debris, shells, weapons, fireballs, grenades, shockwaves,
  player, audio, grid, rig,
  netEvents: [], // disparos/golpes/muertes desde el último snapshot (solo host)
  walls: arena.walls,
  player2: null,   // segundo jugador (gestionado por HostSession en multi)
  weapon2: 'pistol',
  zombies: [],
  barrels: [],
  mines: [],
  turrets: [],
  corpses: [],
  pickups: [],
  score: 0,
  combo: 0,
  multiplier: 1,
  decay: 0,        // barra de mantenimiento del multiplicador, 0..1
  maxMultiplier: 99,
  weapon: 'pistol',
  unlocked: new Set(['pistol']),
  upgraded: new Set(),
  ammo: { pistol: Infinity, shotgun: 12, uzi: 90, barrel: 2, mine: 2, barricade: 2, turret: 1, grenade: 3, rocket: 1 },
  essence: 20,
  maxEssence: 100,
  unlockedSpells: new Set(),
  spellCooldowns: { stomp: 0, frostnova: 0 },
  bestMultiplier: 1,
  state: 'menu',
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
    // Cada baja sube el multiplicador y rellena la barra de mantenimiento.
    this.multiplier = Math.min(this.maxMultiplier, this.multiplier + 1);
    this.decay = 1;
    this.score += zombie.cfg.points * this.multiplier;

    // Munición como recompensa de racha (ligada al combo, no al multiplicador,
    // para que siga fluyendo aunque el multiplicador se estabilice).
    if (this.combo % 2 === 0) this.ammo.shotgun += 1;
    this.ammo.uzi += 3;
    if (this.combo % 6 === 0) this.ammo.barrel += 1;
    if (this.combo % 5 === 0) this.ammo.mine += 1;
    if (this.combo % 8 === 0) this.ammo.barricade += 1;
    if (this.combo % 15 === 0) this.ammo.turret += 1;
    if (this.combo % 7 === 0) this.ammo.grenade += 1;
    if (this.combo % 12 === 0) this.ammo.rocket += 1;

    if (this.multiplier > this.bestMultiplier) this.bestMultiplier = this.multiplier;
    unlockByMultiplier(this.multiplier);
    unlockSpellByMultiplier(this.multiplier);
    this.essence = Math.min(this.maxEssence, this.essence + 2 + this.multiplier * 0.4);
    maybeDrop(zombie);
  },

  /** Velocidad de drenaje de la barra de multiplicador: crece con la altura.
   *  A x1 la barra dura ~4s; a x50 apenas ~1s. Mantener un multiplicador alto
   *  exige matar sin parar, justo como el Boxhead original. */
  decayRate() {
    return 0.25 + this.multiplier * 0.015;
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
    this.ammo.mine += 1;
    this.ammo.barricade += 1;
    if (n % 3 === 0) this.ammo.turret += 1;
    this.ammo.grenade += 2;
    this.ammo.rocket += 1;
    hud.showBanner(`Oleada ${n} despejada`, 2);
    audio.waveCleared();
  },

  onPlayerDeath() {
    this.state = 'over';
    this.shake(0.8);
    // Registra la puntuación en el ranking local antes de mostrar el game over.
    const rank = ranking.qualifies(this.score)
      ? ranking.add(pendingName, this.score, this.waves.wave)
      : -1;
    hud.showGameOver(this, rank, ranking.best);
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
    // Upgrade de arma al alcanzar su milestone (escopeta→auto-shotty, uzi→minigun).
    if (w.upgrade && game.unlocked.has(id) && !game.upgraded.has(id) && mult >= w.upgradeAt) {
      game.upgraded.add(id);
      hud.showBanner(`¡${w.upgrade.name}! Arma mejorada`, 2);
      audio.unlockWeapon();
    }
  }
}

function unlockSpellByMultiplier(mult) {
  for (const id of SPELL_ORDER) {
    const s = SPELLS[id];
    if (!game.unlockedSpells.has(id) && mult >= s.unlockAt) {
      game.unlockedSpells.add(id);
      hud.showBanner(`${s.name} desbloqueada`, 1.6);
      audio.unlockWeapon();
    }
  }
}

/**
 * Sueltas ponderadas por escasez. Es el seguro contra la espiral de munición:
 * cuanto más seco estás, más probable es que caiga justo lo que te falta.
 */
function maybeDrop(zombie) {
  // Los orbes de esencia son un roll aparte y más generoso: la magia se
  // alimenta de jugar bien, no de la escasez como la munición.
  if (Math.random() < 0.22) {
    game.pickups.push(new Pickup(scene, zombie.position, 'essence'));
  }

  const dry = game.ammo.shotgun < 6 && game.ammo.uzi < 25;
  const chance = dry ? 0.5 : 0.14;
  if (Math.random() > chance) return;

  let kind;
  if (game.player.hp < 45 && Math.random() < 0.3) kind = 'health';
  else if (game.ammo.uzi < 25) kind = 'uzi';
  else if (game.ammo.shotgun < 6) kind = 'shotgun';
  else {
    const pool = ['barrel', 'shotgun', 'uzi', 'mine', 'barricade', 'grenade', 'rocket'];
    kind = pool[Math.floor(Math.random() * pool.length)];
  }

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

// --------------------------------------------------- apagones automáticos
// A partir de cierta oleada, la luz se corta sola cada cierto tiempo durante
// unos segundos, obligando a depender de la linterna. Máquina de estados:
// clear → warn (parpadeo de aviso) → blackout (a oscuras) → clear.
const BLACKOUT = {
  firstWave: 6,     // no ocurre antes de esta oleada
  interval: 42,     // segundos entre apagones
  warnTime: 2.5,    // aviso previo
  duration: 24,     // cuánto dura la oscuridad
};
const blackout = { state: 'clear', timer: BLACKOUT.interval, flicker: 0, manual: false };

function updateBlackout(dt) {
  // Si el jugador ha forzado la noche con L, el sistema automático no interfiere.
  if (blackout.manual) return;

  switch (blackout.state) {
    case 'clear':
      if (game.waves.wave >= BLACKOUT.firstWave && game.waves.state === 'active') {
        blackout.timer -= dt;
        if (blackout.timer <= 0) {
          blackout.state = 'warn';
          blackout.timer = BLACKOUT.warnTime;
          hud.showBanner('Se va la luz…', 2);
          audio.wave();
        }
      }
      break;
    case 'warn':
      // Parpadeo nervioso de las luces antes del corte.
      blackout.timer -= dt;
      blackout.flicker -= dt;
      if (blackout.flicker <= 0) {
        blackout.flicker = 0.12 + Math.random() * 0.1;
        const dim = Math.random() < 0.5;
        ambient.intensity = dim ? 0.4 : 1.1;
        sun.intensity = dim ? 0.5 : 1.5;
      }
      if (blackout.timer <= 0) {
        setNight(true);
        blackout.state = 'blackout';
        blackout.timer = BLACKOUT.duration;
      }
      break;
    case 'blackout':
      blackout.timer -= dt;
      if (blackout.timer <= 0) {
        setNight(false);
        blackout.state = 'clear';
        blackout.timer = BLACKOUT.interval;
        hud.showBanner('Vuelve la luz', 1.5);
      }
      break;
  }
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

function placeMine() {
  if (!game.unlocked.has('mine') || game.ammo.mine <= 0 || weapons.cooldown > 0) return;

  forward.set(Math.sin(player.group.rotation.y), 0, Math.cos(player.group.rotation.y));
  const pos = player.position.clone().addScaledVector(forward, 1.4);
  pos.y = 0;

  for (const w of game.walls) if (circleHitsBox(pos.x, pos.z, 0.5, w)) return;
  for (const m of game.mines) if (distXZ(m.position, pos) < 1) return;

  game.mines.push(new Mine(scene, pos));
  game.ammo.mine -= 1;
  weapons.cooldown = WEAPONS.mine.cooldown;
  audio.place();
}

function placeBarricade() {
  if (!game.unlocked.has('barricade') || game.ammo.barricade <= 0 || weapons.cooldown > 0) return;

  forward.set(Math.sin(player.group.rotation.y), 0, Math.cos(player.group.rotation.y));
  const pos = player.position.clone().addScaledVector(forward, 2.2);
  pos.y = 0;

  // No colocar encima de un muro/caja existente, de otra barricada, ni sobre el jugador.
  for (const w of game.walls) if (circleHitsBox(pos.x, pos.z, 1.5, w)) return;
  if (distXZ(pos, player.position) < 1.6) return;

  game.arena.spawnBarricade(pos.x, pos.z);
  game.ammo.barricade -= 1;
  weapons.cooldown = WEAPONS.barricade.cooldown;
  audio.place();
  game.shake(0.06);
}

function placeTurret() {
  if (!game.unlocked.has('turret') || game.ammo.turret <= 0 || weapons.cooldown > 0) return;

  forward.set(Math.sin(player.group.rotation.y), 0, Math.cos(player.group.rotation.y));
  const pos = player.position.clone().addScaledVector(forward, 1.8);
  pos.y = 0;

  for (const w of game.walls) if (circleHitsBox(pos.x, pos.z, 0.7, w)) return;
  for (const t of game.turrets) if (distXZ(t.position, pos) < 1.4) return;

  game.turrets.push(new Turret(scene, pos, game.upgraded.has('turret')));
  game.ammo.turret -= 1;
  weapons.cooldown = WEAPONS.turret.cooldown;
  audio.place();
}

function throwGrenade() {
  const w = effWeapon(game, 'grenade');
  if (game.ammo.grenade <= 0 || weapons.cooldown > 0) return;

  aimDir.set(aimPoint.x - player.position.x, 0, aimPoint.z - player.position.z);
  if (aimDir.lengthSq() < 0.001) return;
  aimDir.normalize();

  player.muzzle(muzzlePos);
  grenades.spawn(muzzlePos, aimDir, w);
  game.ammo.grenade -= 1;
  weapons.cooldown = w.cooldown;
  audio.place();
  game.shake(0.1);
  if (game.ammo.grenade <= 0) selectWeapon('pistol');
}

function castSpell(id) {
  const s = SPELLS[id];
  if (!game.unlockedSpells.has(id)) return;
  if (game.spellCooldowns[id] > 0 || game.essence < s.cost) return;
  game.essence -= s.cost;
  game.spellCooldowns[id] = s.cooldown;
  SPELL_CAST[id](game);
}

function handleShooting() {
  const id = game.weapon;
  const w = effWeapon(game, id);

  if (w.placeable) {
    if (input.fireTapped || input.tapped('Space')) {
      if (id === 'mine') placeMine();
      else if (id === 'barricade') placeBarricade();
      else if (id === 'turret') placeTurret();
      else placeBarrel();
    }
    return;
  }

  if (w.thrown) {
    if (input.fireTapped || input.tapped('Space')) throwGrenade();
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
  for (const list of [game.zombies, game.barrels, game.mines, game.turrets, game.corpses, game.pickups]) {
    for (const e of list) e.dispose(scene);
    list.length = 0;
  }

  weapons.clear();
  fireballs.clear();
  grenades.clear();
  shockwaves.clear();
  particles.clear();
  debris.clear();
  shells.clear();
  decals.clear();
  player.reset();
  // En mapas con obstáculo central (Reactor), (0,0) puede caer dentro de un
  // pilar. Empujamos al jugador fuera de cualquier muro antes de empezar.
  for (const w of game.walls) resolveCircleBox(player.position, player.radius, w);

  game.score = 0;
  game.combo = 0;
  game.decay = 0;
  game.multiplier = 1;
  game.bestMultiplier = 1;
  game.weapon = 'pistol';
  game.unlocked = new Set(['pistol']);
  game.upgraded = new Set();
  game.ammo = { pistol: Infinity, shotgun: 12, uzi: 90, barrel: 2, mine: 2, barricade: 2, turret: 1, grenade: 3, rocket: 1 };
  game.essence = 20;
  game.unlockedSpells = new Set();
  game.netEvents.length = 0;
  game.spellCooldowns = { stomp: 0, frostnova: 0 };
  game.trauma = 0;
  game.state = 'playing';
  hitstop = 0;

  waves.reset();
  if (game.night) setNight(false);
  blackout.state = 'clear';
  blackout.timer = BLACKOUT.interval;
  blackout.manual = false;
  hud.hideGameOver();
}

/** Arranca una partida nueva desde el menú. */
function startGame() {
  menu.hide();
  // Reconstruye la arena con el mapa elegido (reutiliza los arrays walls/crates).
  arena.rebuild(MAPS[currentMap]);
  decals.clear();
  resetGame();
}

/** Vuelve al menú principal desde el game over. */
function returnToMenu() {
  hud.hideGameOver();
  if (netSession) {
    netSession.dispose();
    netSession = null;
    net.disconnect('Vuelve al menú');
  }
  isGuest = false;
  game.state = 'menu';
  menu.show();
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

  // Vuelca el estado de los joysticks táctiles en el Input (si hay táctil).
  if (isTouch) {
    touch.apply();
    touch.root.classList.toggle('playing', game.state === 'playing');
  }

  // Ruleta de armas: mantener Tab la abre y ralentiza el tiempo; soltar selecciona.
  const wantWheel = input.pressed('Tab') && game.state === 'playing';
  if (wantWheel && !wheel.open) wheel.show(game);
  if (wheel.open) {
    wheel.update(input.mouseNDC, game);
    if (!wantWheel) {
      const picked = wheel.close();
      if (picked) selectWeapon(picked);
    } else {
      // Slowmo real mientras la ruleta está abierta (no congelado del todo).
      dt = raw * 0.2;
    }
  }

  if (input.tapped('KeyL')) {
    blackout.manual = !game.night;
    setNight(!game.night);
    if (!blackout.manual) {
      // Al volver a la luz manualmente, rearmamos el ciclo automático desde cero.
      blackout.state = 'clear';
      blackout.timer = BLACKOUT.interval;
    }
  }
  if (input.tapped('KeyM')) hud.showBanner(audio.toggleMute() ? 'Sonido apagado' : 'Sonido activo', 1.2);

  if (game.state === 'menu') {
    // Solo se renderiza el fondo; el menú es DOM y gestiona sus clics.
  } else if (game.state === 'over') {
    if (input.tapped('KeyR')) resetGame();
  } else if (dt > 0) {
    game.crowded = game.zombies.length > 60;
    updateAim();
    input.moveVector(moveDir);

    if (isGuest) {
      // --- GUEST: solo mueve su player (predicción local) y envía inputs ---
      // No simula zombis, oleadas, colisiones de balas ni nada del mundo.
      WEAPON_ORDER.forEach((id, i) => {
        if (input.tapped(`Digit${i + 1}`)) selectWeapon(id);
      });
      player.update(dt, moveDir, aimPoint, game);
      if (netSession) netSession.update(dt);
    } else {
      // --- HOST (o singleplayer): simulación completa ---
      WEAPON_ORDER.forEach((id, i) => {
        if (input.tapped(`Digit${i + 1}`)) selectWeapon(id);
      });
      if (input.tapped('KeyB') && game.unlocked.has('barrel')) {
        if (game.weapon === 'barrel') placeBarrel();
        else selectWeapon('barrel');
      }
      if (input.altTapped) placeBarrel();
      if (input.tapped('ShiftLeft') || input.tapped('ShiftRight')) player.dash(moveDir, game);
      if (input.tapped('KeyQ')) castSpell('stomp');
      if (input.tapped('KeyE')) castSpell('frostnova');

      player.update(dt, moveDir, aimPoint, game);
      if (!wheel.open) handleShooting();

      // Player2 disparo: el host también maneja el disparo del guest.
      if (game.player2 && !game.player2.dead && netSession instanceof HostSession) {
        const gi = netSession.guestInput;
        if (gi.w) game.weapon2 = gi.w;
        if (gi.f && weapons.canFire() && game.ammo[gi.w] > 0) {
          const p2 = game.player2;
          const p2muzzle = p2.muzzle();
          const p2dir = new THREE.Vector3(Math.sin(gi.aim), 0, Math.cos(gi.aim));
          const w = effWeapon(game, gi.w);
          if (w && !w.placeable && !w.thrown && !w.beam) {
            weapons.fire(game, gi.w, p2muzzle, p2dir);
          }
        }
        if (gi.sp) {
          castSpell(gi.sp);
          gi.sp = null;
        }
      }

      grid.build(game.zombies);
      weapons.update(dt, game);
      fireballs.update(dt, game);
      grenades.update(dt, game);

      for (const z of game.zombies) z.update(dt, game);
      separateZombies();
      for (const b of game.barrels) b.update(dt, game);
      for (const m of game.mines) m.update(dt, game);
      for (const t of game.turrets) t.update(dt, game);
      for (const c of game.corpses) c.update(dt, game);
      for (const pk of game.pickups) pk.update(dt, game);

      sweep(game.zombies);
      sweep(game.barrels);
      sweep(game.mines);
      sweep(game.turrets);
      sweep(game.corpses);
      sweep(game.pickups);

      if (game.multiplier > 1) {
        game.decay -= game.decayRate() * dt;
        if (game.decay <= 0) {
          game.multiplier = Math.max(1, game.multiplier - 1);
          game.decay = game.multiplier > 1 ? 0.55 : 0;
          if (game.multiplier === 1) game.combo = 0;
        }
      } else {
        game.decay = 0;
        game.combo = 0;
      }

      for (const id of SPELL_ORDER) {
        if (game.spellCooldowns[id] > 0) game.spellCooldowns[id] -= dt;
      }

      waves.update(dt);
      updateBlackout(dt);

      // Host: actualiza la sesión de red (envía snapshot, aplica inputs del guest).
      if (netSession) netSession.update(dt);
    }
  }

  particles.update(dt);
  debris.update(dt);
  shells.update(dt);
  shockwaves.update(raw);
  decals.update(raw);

  // Intensidad musical: presión de enemigos + un plus si estamos a oscuras.
  const pressure = Math.min(1, game.zombies.length / 40) * 0.85 + (game.night ? 0.15 : 0);
  audio.updateMusic(raw, game.state === 'playing' ? pressure : 0.1);

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

  floatingBars.setVisible(game.state === 'playing');
  if (game.state === 'playing') floatingBars.update(player, game, camera);

  hud.update(game, raw);
  renderer.render(scene, camera);
  input.endFrame();
}

renderer.setAnimationLoop(tick);
window.__game = game;
