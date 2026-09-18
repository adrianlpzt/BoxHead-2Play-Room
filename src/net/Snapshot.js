/**
 * Serialización compacta del estado del mundo para el multijugador.
 *
 * CLAVE: los snapshots se serializan como ARRAYS PLANOS, no objetos con claves.
 * Un objeto {id, type, x, z, r, hp, fr, dead} repite esas 8 claves por cada uno
 * de los 150 zombis -> ~15KB, que revienta el limite de ~16KB de un mensaje
 * DataChannel (y falla EN SILENCIO). Un array plano [id, t, x, z, r, hp, fl]
 * ocupa ~4x menos: el mismo mundo baja a ~4KB, con margen de sobra.
 */

const R2 = (v) => Math.round(v * 100) / 100;
const R1 = (v) => Math.round(v * 10) / 10;

const ZTYPE = ['zombie', 'devil', 'armored', 'bomber'];
const ZTYPE_IDX = { zombie: 0, devil: 1, armored: 2, bomber: 3 };

export const WEAPON_IDX = {
  pistol: 0, shotgun: 1, uzi: 2, barrel: 3, mine: 4,
  barricade: 5, turret: 6, grenade: 7, rocket: 8,
};
export const IDX_WEAPON = Object.keys(WEAPON_IDX);

const EV = { shot: 0, hit: 1, shatter: 2, kill: 3 };
const EV_NAME = ['shot', 'hit', 'shatter', 'kill'];

const PK_TYPES = ['shotgun', 'uzi', 'barrel', 'mine', 'barricade', 'turret', 'grenade', 'rocket', 'essence', 'health'];
const PK_IDX = Object.fromEntries(PK_TYPES.map((k, i) => [k, i]));

export function packSnapshot(game) {
  const p1 = game.player;
  const p2 = game.player2;
  let flags = 0;
  if (game.night) flags |= 1;

  return {
    s: 1,
    w: game.waves.wave,
    sc: game.score,
    mu: game.multiplier,
    de: R2(game.decay),
    es: Math.round(game.essence),
    fl: flags,
    p1: packPlayer(p1),
    p2: p2 ? packPlayer(p2) : 0,
    z: game.zombies.map(packZombie),
    b: game.barrels.map(packBarrel),
    m: game.mines.map(packMine),
    tu: game.turrets.map(packTurret),
    pk: game.pickups.map(packPickup),
    co: game.corpses.map(packCorpse),
    bl: packBullets(game.weapons),
    ev: game.netEvents ? game.netEvents.splice(0).map(packEvent) : [],
    un: [...game.unlocked].map((w) => WEAPON_IDX[w] ?? -1).filter((i) => i >= 0),
    up: [...game.upgraded].map((w) => WEAPON_IDX[w] ?? -1).filter((i) => i >= 0),
    sp: [...game.unlockedSpells],
  };
}

function packPlayer(p) {
  let f = 0;
  if (p.dead) f |= 1;
  if (p.dashTime > 0) f |= 2;
  return [R2(p.position.x), R2(p.position.z), R1(p.group.rotation.y), Math.round(p.hp), f];
}
function packZombie(z) {
  let f = 0;
  if (z.frozen) f |= 1;
  if (z.dead) f |= 2;
  return [z._netId, ZTYPE_IDX[z.type] ?? 0, R2(z.position.x), R2(z.position.z), R1(z.group.rotation.y), Math.round(z.hp), f];
}
function packBarrel(b) {
  return [b._netId, R2(b.position.x), R2(b.position.z), Math.round(b.hp), b.fuse >= 0 ? 1 : 0];
}
function packMine(m) {
  let f = 0;
  if (m.armTimer <= 0) f |= 1;
  if (m.dead) f |= 2;
  return [m._netId, R2(m.position.x), R2(m.position.z), f];
}
function packTurret(t) {
  let f = 0;
  if (t.dead) f |= 1;
  if (t.heavy) f |= 2;
  return [t._netId, R2(t.position.x), R2(t.position.z), R1(t.aimAngle), Math.round(t.hp), t.ammo, f];
}
function packPickup(pk) {
  return [pk._netId, PK_IDX[pk.kind] ?? 0, R2(pk.position.x), R2(pk.position.z)];
}
function packCorpse(c) {
  return [c._netId, R2(c.position.x), R2(c.position.z), R2(c.fuse)];
}
function packBullets(weapons) {
  const out = [];
  for (const b of weapons.bullets) {
    if (b.life > 0) {
      out.push([R2(b.mesh.position.x), R2(b.mesh.position.z), R1(b.mesh.rotation.y), b.mesh.material.color.getHex()]);
    }
  }
  return out;
}
function packEvent(e) {
  if (e.k === 'shot') return [EV.shot, R2(e.x), R2(e.z), WEAPON_IDX[e.w] ?? 0];
  if (e.k === 'kill') return [EV.kill, R2(e.x), R2(e.z), e.c];
  return [EV[e.k], R2(e.x), R2(e.z), e.c, e.b];
}

export function unpackSnapshot(snap) {
  return {
    wave: snap.w, score: snap.sc, mult: snap.mu, decay: snap.de,
    essence: snap.es, night: (snap.fl & 1) !== 0,
    p1: unpackPlayer(snap.p1),
    p2: snap.p2 ? unpackPlayer(snap.p2) : null,
    zombies: snap.z.map(unpackZombie),
    barrels: snap.b.map(unpackBarrel),
    mines: snap.m.map(unpackMine),
    turrets: snap.tu.map(unpackTurret),
    pickups: snap.pk.map(unpackPickup),
    corpses: snap.co.map(unpackCorpse),
    bullets: snap.bl.map(unpackBullet),
    events: snap.ev.map(unpackEvent),
    unlocked: (snap.un || []).map((i) => IDX_WEAPON[i]).filter(Boolean),
    upgraded: (snap.up || []).map((i) => IDX_WEAPON[i]).filter(Boolean),
    spells: snap.sp || [],
  };
}

function unpackPlayer(a) {
  return { x: a[0], z: a[1], r: a[2], hp: a[3], dead: (a[4] & 1) !== 0, dash: (a[4] & 2) !== 0 };
}
function unpackZombie(a) {
  return { id: a[0], type: ZTYPE[a[1]], x: a[2], z: a[3], r: a[4], hp: a[5], fr: (a[6] & 1) !== 0, dead: (a[6] & 2) !== 0 };
}
function unpackBarrel(a) {
  return { id: a[0], x: a[1], z: a[2], hp: a[3], fuse: a[4] === 1 };
}
function unpackMine(a) {
  return { id: a[0], x: a[1], z: a[2], armed: (a[3] & 1) !== 0, dead: (a[3] & 2) !== 0 };
}
function unpackTurret(a) {
  return { id: a[0], x: a[1], z: a[2], aim: a[3], hp: a[4], ammo: a[5], dead: (a[6] & 1) !== 0, heavy: (a[6] & 2) !== 0 };
}
function unpackPickup(a) {
  return { id: a[0], kind: PK_TYPES[a[1]], x: a[2], z: a[3] };
}
function unpackCorpse(a) {
  return { id: a[0], x: a[1], z: a[2], fuse: a[3] };
}
function unpackBullet(a) {
  return { x: a[0], z: a[1], r: a[2], c: a[3] };
}
function unpackEvent(a) {
  const k = EV_NAME[a[0]];
  if (k === 'shot') return { k, x: a[1], z: a[2], w: IDX_WEAPON[a[3]] };
  if (k === 'kill') return { k, x: a[1], z: a[2], c: a[3] };
  return { k, x: a[1], z: a[2], c: a[3], b: a[4] };
}

export function packInput(moveX, moveZ, aimAngle, fire, weapon, spell, dash, tap) {
  let f = 0;
  if (fire) f |= 1;
  if (dash) f |= 2;
  if (tap) f |= 4;
  const sp = spell === 'stomp' ? 1 : spell === 'frostnova' ? 2 : 0;
  return { i: 1, a: [R2(moveX), R2(moveZ), R1(aimAngle), f, WEAPON_IDX[weapon] ?? 0, sp] };
}

export function unpackInput(msg) {
  const a = msg.a;
  return {
    mx: a[0], mz: a[1], aim: a[2],
    fire: (a[3] & 1) !== 0, dash: (a[3] & 2) !== 0, tap: (a[3] & 4) !== 0,
    weapon: IDX_WEAPON[a[4]] || 'pistol',
    spell: a[5] === 1 ? 'stomp' : a[5] === 2 ? 'frostnova' : null,
  };
}
