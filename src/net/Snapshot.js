/**
 * Serialización/deserialización del estado del mundo para el multijugador.
 *
 * El host manda snapshots a ~15Hz. Cada snapshot contiene el estado completo
 * de todo lo visible — no deltas, porque con DataChannel unreliable (ordered:
 * false, maxRetransmits: 0) un paquete perdido no debe dejar al guest con
 * estado corrupto. A 150 zombis × ~9 bytes + overhead ≈ 2-3KB por snapshot ×
 * 15/s ≈ 35-45KB/s, una fracción de cualquier conexión.
 *
 * Las posiciones se cuantizan a 2 decimales (centímetros) para ahorrar bytes
 * en la serialización JSON. La rotación se reduce a 1 decimal (suficiente
 * para el giro visual).
 */

const R2 = (v) => Math.round(v * 100) / 100;
const R1 = (v) => Math.round(v * 10) / 10;

/** Empaqueta el estado del mundo desde el game del host. */
export function packSnapshot(game) {
  const p1 = game.player;
  const p2 = game.player2; // null en singleplayer

  const snap = {
    t: Date.now(),
    // Estado de partida.
    wave: game.waves.wave,
    score: game.score,
    mult: game.multiplier,
    decay: R2(game.decay),
    essence: Math.round(game.essence),
    night: game.night,
    state: game.state,
    // Jugador 1 (host).
    p1: packPlayer(p1),
    // Jugador 2 (guest), si existe.
    p2: p2 ? packPlayer(p2) : null,
    // Entidades.
    z: game.zombies.map(packZombie),
    b: game.barrels.map(packBarrel),
    m: game.mines.map(packMine),
    tu: game.turrets.map(packTurret),
    pk: game.pickups.map(packPickup),
    co: game.corpses.map(packCorpse),
  };
  return snap;
}

function packPlayer(p) {
  return {
    x: R2(p.position.x), z: R2(p.position.z), r: R1(p.group.rotation.y),
    hp: Math.round(p.hp), dead: p.dead, dash: p.dashTime > 0,
  };
}

function packZombie(z) {
  return {
    id: z._netId, type: z.type,
    x: R2(z.position.x), z: R2(z.position.z), r: R1(z.group.rotation.y),
    hp: Math.round(z.hp), fr: z.frozen, dead: z.dead,
  };
}

function packBarrel(b) {
  return {
    id: b._netId,
    x: R2(b.position.x), z: R2(b.position.z),
    hp: Math.round(b.hp), fuse: b.fuse >= 0,
  };
}

function packMine(m) {
  return {
    id: m._netId,
    x: R2(m.position.x), z: R2(m.position.z),
    armed: m.armTimer <= 0, dead: m.dead,
  };
}

function packTurret(t) {
  return {
    id: t._netId,
    x: R2(t.position.x), z: R2(t.position.z),
    aim: R1(t.aimAngle), hp: Math.round(t.hp), ammo: t.ammo, dead: t.dead,
    heavy: t.heavy,
  };
}

function packPickup(pk) {
  return {
    id: pk._netId, kind: pk.kind,
    x: R2(pk.position.x), z: R2(pk.position.z),
  };
}

function packCorpse(c) {
  return {
    id: c._netId,
    x: R2(c.position.x), z: R2(c.position.z),
    fuse: R2(c.fuse),
  };
}

/**
 * Formato del input del guest enviado al host.
 * Se manda cada frame (~60Hz) pero es muy pequeño (~60 bytes).
 */
export function packInput(moveX, moveZ, aimAngle, fire, weapon, spell, dash) {
  return {
    type: 'input',
    mx: R2(moveX), mz: R2(moveZ),
    aim: R1(aimAngle),
    f: fire ? 1 : 0,
    w: weapon,
    sp: spell || null,
    d: dash ? 1 : 0,
  };
}
