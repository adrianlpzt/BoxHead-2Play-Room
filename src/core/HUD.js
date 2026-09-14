import { WEAPON_ORDER, WEAPONS } from '../systems/Weapons.js';
import { SPELL_ORDER, SPELLS } from '../systems/Spells.js';
import { DASH_COOLDOWN_TIME } from '../entities/Player.js';

export class HUD {
  constructor() {
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.comboMult = document.getElementById('combo-mult');
    this.comboFill = document.getElementById('combo-fill');
    this.kills = document.getElementById('kills');
    this.wave = document.getElementById('wave');
    this.score = document.getElementById('score');
    this.alive = document.getElementById('alive');
    this.banner = document.getElementById('banner');
    this.gameover = document.getElementById('gameover');
    this.finalWave = document.getElementById('final-wave');
    this.finalScore = document.getElementById('final-score');
    this.rankResult = document.getElementById('rank-result');
    this.help = document.getElementById('help');
    this.dashFill = document.getElementById('dash-fill');
    this.dashText = document.getElementById('dash-text');

    this.nightTag = document.createElement('p');
    this.nightTag.id = 'night-tag';
    this.nightTag.textContent = 'linterna';
    document.getElementById('hud').appendChild(this.nightTag);

    this.bannerTimer = 0;
    this.helpTimer = 12;

    const host = document.getElementById('weapons');
    this.slots = {};
    WEAPON_ORDER.forEach((id, i) => {
      const w = WEAPONS[id];
      const el = document.createElement('div');
      el.className = 'slot locked';
      el.innerHTML = `<span class="num">${i + 1}</span><span class="name">${w.name}</span><span class="ammo">—</span>`;
      host.appendChild(el);
      this.slots[id] = { root: el, ammo: el.querySelector('.ammo') };
    });

    this.essenceFill = document.getElementById('essence-fill');
    const spellHost = document.getElementById('spells');
    this.spellSlots = {};
    SPELL_ORDER.forEach((id) => {
      const s = SPELLS[id];
      const el = document.createElement('div');
      el.className = 'spell locked';
      el.innerHTML = `<span class="key">${s.key}</span><span class="name">${s.name}</span><span class="cost">${s.cost}</span>`;
      spellHost.appendChild(el);
      this.spellSlots[id] = el;
    });
  }

  showBanner(text, seconds = 2) {
    this.banner.textContent = text;
    this.banner.classList.add('show');
    this.bannerTimer = seconds;
  }

  update(game, dt) {
    const p = game.player;
    const hp = Math.max(0, p.hp);
    this.healthFill.style.transform = `scaleX(${hp / p.maxHp})`;
    this.healthText.textContent = Math.ceil(hp);

    this.comboMult.textContent = `x${game.multiplier}`;
    this.comboMult.classList.toggle('cold', game.combo === 0);
    this.comboFill.style.transform = `scaleX(${game.comboTimer / game.comboWindow})`;
    this.kills.textContent = game.combo;

    const dashK = game.player.dashCd > 0 ? 1 - game.player.dashCd / DASH_COOLDOWN_TIME : 1;
    this.dashFill.style.transform = `scaleX(${Math.max(0, Math.min(1, dashK))})`;
    const ready = game.player.dashReady;
    this.dashText.textContent = ready ? 'Esquiva lista' : 'Esquiva recargando';
    this.dashText.classList.toggle('ready', ready);

    this.wave.textContent = game.waves.wave;
    this.score.textContent = game.score;
    this.alive.textContent = game.zombies.length;

    for (const id of WEAPON_ORDER) {
      const s = this.slots[id];
      const unlocked = game.unlocked.has(id);
      const ammo = game.ammo[id];
      s.root.classList.toggle('locked', !unlocked);
      s.root.classList.toggle('active', unlocked && game.weapon === id);
      s.root.classList.toggle('empty', unlocked && ammo === 0);
      s.ammo.textContent = !unlocked ? '—' : ammo === Infinity ? '∞' : ammo;
    }

    this.essenceFill.style.transform = `scaleX(${game.essence / game.maxEssence})`;
    for (const id of SPELL_ORDER) {
      const cfg = SPELLS[id];
      const el = this.spellSlots[id];
      const unlocked = game.unlockedSpells.has(id);
      const cooling = game.spellCooldowns[id] > 0;
      const affordable = game.essence >= cfg.cost;
      el.classList.toggle('locked', !unlocked);
      el.classList.toggle('cooling', unlocked && (cooling || !affordable));
      el.classList.toggle('ready', unlocked && !cooling && affordable);
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
    if (this.helpTimer > 0) {
      this.helpTimer -= dt;
      if (this.helpTimer <= 0) this.help.classList.add('faded');
    }
  }

  setNight(on) {
    document.body.classList.toggle('night', on);
    this.nightTag.classList.toggle('on', on);
  }

  showGameOver(game, rank = -1, best = 0) {
    this.finalWave.textContent = game.waves.wave;
    this.finalScore.textContent = game.score;
    if (rank === 0) {
      this.rankResult.textContent = `¡Nuevo récord! (${best} puntos)`;
      this.rankResult.hidden = false;
    } else if (rank > 0) {
      this.rankResult.textContent = `Entras en el ranking, puesto #${rank + 1}`;
      this.rankResult.hidden = false;
    } else {
      this.rankResult.hidden = true;
    }
    this.gameover.hidden = false;
  }

  hideGameOver() {
    this.gameover.hidden = true;
  }
}
