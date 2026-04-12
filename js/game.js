const SAVE_KEY = "monster-idle-rpg-v1";

const ZONES = [
  { name: "辺境の森", monsters: ["ゴブリン斥候", "森の狼", "腐れスライム", "トレントの苗"] },
  { name: "灰色の丘陵", monsters: ["オーク戦士", "丘陵のグリフォン", "石化の蛇", "石巨人"] },
  { name: "忘れられた城塞", monsters: ["骸骨騎士", "幽霊弓兵", "呪われた鎧", "リッチの従者"] },
  { name: "奈落の裂け目", monsters: ["深淵の触手", "影のデーモン", "混沌の使徒", "古き竜の亡霊"] },
];

const CAST_BASE_MS = 5000;
const CAST_MS_PER_MAGIC_LV = -45;
const CAST_MIN_MS = 2000;

const CHANNEL_BASE_MS = 5000;
const CHANNEL_MS_PER_MAGIC_LV = -40;
const CHANNEL_MIN_MS = 2500;

/** 忘れられた城塞を越えて奈落に到達したら true（ギルド投資解放） */
const FORTRESS_ZONE_INDEX = 2;

const UPGRADES = [
  {
    id: "blade",
    title: "魔法攻撃",
    desc: "詠唱一撃の威力（強いが、同じゴールドなら武器強化ほど伸びにくい）",
    baseCost: 18,
    costMult: 1.185,
    effect: (lv) => Math.floor(22 + lv * 26 + lv * lv * 0.35),
  },
  {
    id: "merc",
    title: "武器強化",
    desc: "武器のオート攻撃（毎秒ダメージ）。放置の主軸。",
    baseCost: 32,
    costMult: 1.142,
    effect: (lv) => Math.max(0, Math.floor(8 + lv * 6.1)),
  },
  {
    id: "bounty",
    title: "冒険者ギルドに投資",
    desc: "撃破ゴールド倍率。忘れられた城塞を越え、奈落に到達すると購入可能。",
    baseCost: 95,
    costMult: 1.172,
    effect: (lv) => 1 + lv * 0.072,
  },
  {
    id: "fury",
    title: "レベルアップ",
    desc: "基礎ステが上がり、武器と魔法の両方のダメージが乗算で伸びる",
    baseCost: 500,
    costMult: 1.22,
    effect: (lv) => 1 + lv * 0.05,
  },
];

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n) {
  if (n < 1e6) return Math.floor(n).toLocaleString("ja-JP");
  const units = [
    ["M", 1e6],
    ["B", 1e9],
    ["T", 1e12],
    ["Qa", 1e15],
    ["Qi", 1e18],
  ];
  let x = n;
  let u = "";
  for (const [s, v] of units) {
    if (x >= v) {
      u = s;
      x = n / v;
    }
  }
  return (Math.floor(x * 100) / 100).toLocaleString("ja-JP", { maximumFractionDigits: 2 }) + u;
}

function defaultState() {
  return {
    kills: 0,
    gold: 0,
    souls: 0,
    zoneIndex: 0,
    monsterIndex: 0,
    monsterHp: 10,
    monsterMaxHp: 10,
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    lastTs: Date.now(),
    totalKillsEver: 0,
    nextCastAt: 0,
    castChannelEnd: 0,
    _lastFrame: 0,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    const d = defaultState();
    const merged = { ...d, ...p, upgrades: { ...d.upgrades, ...(p.upgrades || {}) } };
    if (merged.totalKillsEver == null) merged.totalKillsEver = merged.kills;
    if (merged.nextCastAt == null) merged.nextCastAt = 0;
    if (merged.castChannelEnd == null) merged.castChannelEnd = 0;
    return merged;
  } catch {
    return defaultState();
  }
}

function saveState(s) {
  const copy = { ...s };
  delete copy._lastFrame;
  localStorage.setItem(SAVE_KEY, JSON.stringify(copy));
}

function guildUnlocked(s) {
  return (s.zoneIndex || 0) > FORTRESS_ZONE_INDEX;
}

/** 単調な戦闘階層（HP・報酬計算）。撃破数に連動 */
function battleDepth(s) {
  return Math.max(1, (s.kills || 0) + 1);
}

/** UI 用：城塞クリア前は到達目安 12、以降は無限表記 */
function floorDisplay(s) {
  const cur = battleDepth(s);
  const max = guildUnlocked(s) ? "∞" : "12";
  return `${cur} / ${max}`;
}

function monsterName(s) {
  const z = ZONES[Math.min(s.zoneIndex, ZONES.length - 1)];
  return z.monsters[s.monsterIndex % z.monsters.length];
}

function zoneName(s) {
  return ZONES[Math.min(s.zoneIndex, ZONES.length - 1)].name;
}

function baseMonsterHp(depth) {
  return Math.max(5, Math.floor(8 * Math.pow(1.55, depth - 1)));
}

function goldPerKill(depth, bountyMult) {
  const base = 4 + depth * 2.35;
  return Math.floor(base * bountyMult);
}

function castCooldownMs(s) {
  const lv = s.upgrades.blade || 0;
  return Math.max(CAST_MIN_MS, CAST_BASE_MS + lv * CAST_MS_PER_MAGIC_LV);
}

function channelDurationMs(s) {
  const lv = s.upgrades.blade || 0;
  return Math.max(CHANNEL_MIN_MS, CHANNEL_BASE_MS + lv * CHANNEL_MS_PER_MAGIC_LV);
}

function spellDamage(s) {
  const blade = UPGRADES.find((u) => u.id === "blade");
  const fury = UPGRADES.find((u) => u.id === "fury");
  const lvB = s.upgrades.blade || 0;
  const lvF = s.upgrades.fury || 0;
  const soulMult = 1 + (s.souls || 0) * 0.15;
  return Math.max(1, Math.floor(blade.effect(lvB) * fury.effect(lvF) * soulMult));
}

function idleDps(s) {
  const merc = UPGRADES.find((u) => u.id === "merc");
  const fury = UPGRADES.find((u) => u.id === "fury");
  const lvM = s.upgrades.merc || 0;
  const lvF = s.upgrades.fury || 0;
  const soulMult = 1 + (s.souls || 0) * 0.15;
  return Math.floor(merc.effect(lvM) * fury.effect(lvF) * soulMult * 10) / 10;
}

function bountyMult(s) {
  if (!guildUnlocked(s)) return 1;
  const b = UPGRADES.find((u) => u.id === "bounty");
  return b.effect(s.upgrades.bounty || 0);
}

function upgradeCost(u, level) {
  return Math.floor(u.baseCost * Math.pow(u.costMult, level));
}

function spawnMonster(s) {
  const depth = battleDepth(s);
  s.monsterMaxHp = baseMonsterHp(depth);
  s.monsterHp = s.monsterMaxHp;
}

function advanceMonster(s) {
  s.monsterIndex += 1;
  if (s.monsterIndex >= 4) {
    s.monsterIndex = 0;
    s.zoneIndex = Math.min(s.zoneIndex + 1, ZONES.length - 1);
  }
  spawnMonster(s);
}

function applyDamage(s, amt) {
  let remaining = amt;
  while (remaining > 0) {
    if (s.monsterHp <= 0) spawnMonster(s);
    const hp = s.monsterHp;
    if (remaining >= hp) {
      remaining -= hp;
      const depth = battleDepth(s);
      s.gold += goldPerKill(depth, bountyMult(s));
      s.kills += 1;
      s.totalKillsEver = (s.totalKillsEver || 0) + 1;
      advanceMonster(s);
    } else {
      s.monsterHp -= remaining;
      remaining = 0;
    }
  }
}

function tickOffline(s, now) {
  const last = s.lastTs || now;
  const dt = Math.min(86400_000, Math.max(0, now - last));
  if (dt < 1000) return;
  const dps = idleDps(s);
  if (dps <= 0) return;
  let remaining = dt / 1000;
  let guard = 0;
  while (remaining > 0 && guard++ < 500_000) {
    if (s.monsterHp <= 0) spawnMonster(s);
    const need = s.monsterHp;
    const timeToKill = need / dps;
    if (timeToKill > remaining) {
      s.monsterHp -= remaining * dps;
      remaining = 0;
      break;
    }
    remaining -= timeToKill;
    const depth = battleDepth(s);
    s.gold += goldPerKill(depth, bountyMult(s));
    s.kills += 1;
    s.totalKillsEver = (s.totalKillsEver || 0) + 1;
    advanceMonster(s);
  }
}

const els = {
  kills: document.getElementById("kills"),
  gold: document.getElementById("gold"),
  dps: document.getElementById("dps"),
  clickDmg: document.getElementById("clickDmg"),
  zoneName: document.getElementById("zoneName"),
  zoneDepth: document.getElementById("zoneDepth"),
  monsterName: document.getElementById("monsterName"),
  monsterHp: document.getElementById("monsterHp"),
  monsterMaxHp: document.getElementById("monsterMaxHp"),
  hpBar: document.getElementById("hpBar"),
  strikeBtn: document.getElementById("strikeBtn"),
  strikeLabel: document.getElementById("strikeLabel"),
  castHint: document.getElementById("castHint"),
  castBurst: document.getElementById("castBurst"),
  upgradeList: document.getElementById("upgradeList"),
  ascensionSection: document.getElementById("ascensionSection"),
  ascKillsReq: document.getElementById("ascKillsReq"),
  souls: document.getElementById("souls"),
  ascendBtn: document.getElementById("ascendBtn"),
  saveBtn: document.getElementById("saveBtn"),
  wipeBtn: document.getElementById("wipeBtn"),
};

let state = loadState();
const ASC_REQ_BASE = 250;
let lastGoldForUpgrades = state.gold;

function ascensionKillsRequired() {
  return Math.floor(ASC_REQ_BASE * Math.pow(2.2, state.souls || 0));
}

function renderUpgrades() {
  els.upgradeList.innerHTML = "";
  for (const u of UPGRADES) {
    const lv = state.upgrades[u.id] || 0;
    const cost = upgradeCost(u, lv);
    const li = document.createElement("li");
    li.className = "upgrade-item";
    const guildLocked = u.id === "bounty" && !guildUnlocked(state);
    const descText = guildLocked
      ? `${u.desc}（いまはロック中：忘れられた城塞を越えて奈落へ）`
      : u.desc;
    li.innerHTML = `
      <span class="title">${escHtml(u.title)} <span class="mono" style="color:var(--gold-dim)">Lv.${lv}</span></span>
      <div class="upgrade-tip" tabindex="0" aria-label="${escHtml(u.title)}の説明">
        <span class="upgrade-tip-icon" aria-hidden="true">🔍</span>
        <div class="upgrade-tip-bubble" role="tooltip">${escHtml(descText)}</div>
      </div>
      <button type="button" data-id="${u.id}">${fmt(cost)} G</button>
    `;
    const btn = li.querySelector("button");
    btn.disabled = state.gold < cost || guildLocked;
    btn.addEventListener("click", () => {
      if (guildLocked) return;
      if (state.gold < cost) return;
      state.gold -= cost;
      state.upgrades[u.id] = lv + 1;
      saveState(state);
      render();
    });
    els.upgradeList.appendChild(li);
  }
}

function render() {
  els.kills.textContent = fmt(state.kills);
  els.gold.textContent = fmt(state.gold);
  els.dps.textContent = fmt(idleDps(state));
  els.clickDmg.textContent = fmt(spellDamage(state));
  els.zoneName.textContent = zoneName(state);
  els.zoneDepth.textContent = floorDisplay(state);
  els.monsterName.textContent = monsterName(state);
  els.monsterHp.textContent = fmt(Math.max(0, state.monsterHp));
  els.monsterMaxHp.textContent = fmt(state.monsterMaxHp);
  const pct = state.monsterMaxHp > 0 ? (100 * state.monsterHp) / state.monsterMaxHp : 0;
  els.hpBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;

  const req = ascensionKillsRequired();
  const te = state.totalKillsEver || state.kills;
  els.ascensionSection.hidden = te < 35;
  els.ascKillsReq.textContent = fmt(req);
  els.souls.textContent = fmt(state.souls || 0);
  els.ascendBtn.disabled = te < req;
  renderUpgrades();
  updateCastUi();
}

function playCastBurst() {
  const el = els.castBurst;
  if (!el) return;
  el.classList.remove("cast-burst--show");
  void el.offsetWidth;
  el.classList.add("cast-burst--show");
  window.setTimeout(() => el.classList.remove("cast-burst--show"), 720);
}

function tryFinishSpellChannel(s, wall) {
  const end = s.castChannelEnd || 0;
  if (end <= 0 || wall < end) return false;
  applyDamage(s, spellDamage(s));
  playCastBurst();
  s.castChannelEnd = 0;
  s.nextCastAt = wall + castCooldownMs(s);
  s.lastTs = wall;
  saveState(s);
  return true;
}

function updateCastUi(now = Date.now()) {
  const cd = castCooldownMs(state);
  const ch = channelDurationMs(state);
  const channeling = (state.castChannelEnd || 0) > now;
  const recovering = now < (state.nextCastAt || 0);
  els.strikeBtn.disabled = channeling || recovering;

  if (channeling) {
    const left = Math.max(0, (state.castChannelEnd || 0) - now);
    els.strikeLabel.textContent = `詠唱中 ${(left / 1000).toFixed(1)}s`;
    els.castHint.textContent = `あと ${(left / 1000).toFixed(1)} 秒でダメージ。基礎詠唱 ${(ch / 1000).toFixed(1)} 秒（魔法攻撃レベルで短縮）。`;
  } else if (recovering) {
    const left = Math.max(0, (state.nextCastAt || 0) - now);
    els.strikeLabel.textContent = `魔力回復 ${(left / 1000).toFixed(1)}s`;
    els.castHint.textContent = `発動後のディレイ ${(cd / 1000).toFixed(1)} 秒（魔法攻撃レベルで短縮）。`;
  } else {
    els.strikeLabel.textContent = "魔法詠唱";
    els.castHint.textContent = `押すと ${(ch / 1000).toFixed(1)} 秒詠唱してからダメージ。その後 ${(cd / 1000).toFixed(1)} 秒は詠唱不可。`;
  }
}

function strike() {
  const wall = Date.now();
  if (tryFinishSpellChannel(state, wall)) {
    render();
    return;
  }
  if (wall < (state.nextCastAt || 0)) return;
  if ((state.castChannelEnd || 0) > wall) return;
  state.castChannelEnd = wall + channelDurationMs(state);
  state.lastTs = wall;
  saveState(state);
  render();
}

function gameLoop(rAfNow) {
  const wall = Date.now();
  if (tryFinishSpellChannel(state, wall)) {
    lastGoldForUpgrades = state.gold;
    render();
  }
  const dt = Math.min(0.25, (rAfNow - (state._lastFrame || rAfNow)) / 1000);
  state._lastFrame = rAfNow;
  const dps = idleDps(state);
  if (dps > 0 && dt > 0) {
    applyDamage(state, dps * dt);
    state.lastTs = wall;
    if (Math.random() < 0.05) saveState(state);
  }
  els.monsterName.textContent = monsterName(state);
  els.zoneName.textContent = zoneName(state);
  els.zoneDepth.textContent = floorDisplay(state);
  els.monsterHp.textContent = fmt(Math.max(0, state.monsterHp));
  els.monsterMaxHp.textContent = fmt(state.monsterMaxHp);
  const pct = state.monsterMaxHp > 0 ? (100 * state.monsterHp) / state.monsterMaxHp : 0;
  els.hpBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  els.kills.textContent = fmt(state.kills);
  els.gold.textContent = fmt(state.gold);
  els.dps.textContent = fmt(idleDps(state));
  els.clickDmg.textContent = fmt(spellDamage(state));
  updateCastUi(wall);
  if (state.gold !== lastGoldForUpgrades) {
    lastGoldForUpgrades = state.gold;
    renderUpgrades();
  }
  requestAnimationFrame(gameLoop);
}

function init() {
  const now = Date.now();
  if (state.totalKillsEver == null) state.totalKillsEver = state.kills;
  if (state.nextCastAt == null) state.nextCastAt = 0;
  if (state.castChannelEnd == null) state.castChannelEnd = 0;
  tickOffline(state, now);
  tryFinishSpellChannel(state, now);
  state.lastTs = now;
  if (!state.monsterMaxHp || state.monsterHp == null) spawnMonster(state);
  saveState(state);

  els.strikeBtn.addEventListener("click", strike);
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      strike();
    }
  });

  els.ascendBtn.addEventListener("click", () => {
    const req = ascensionKillsRequired();
    if ((state.totalKillsEver || 0) < req) return;
    state.souls = (state.souls || 0) + 1;
    state.kills = 0;
    state.gold = 0;
    state.zoneIndex = 0;
    state.monsterIndex = 0;
    state.upgrades = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
    state.nextCastAt = 0;
    state.castChannelEnd = 0;
    spawnMonster(state);
    state.lastTs = Date.now();
    saveState(state);
    render();
  });

  els.saveBtn.addEventListener("click", () => {
    saveState(state);
    els.saveBtn.textContent = "保存した";
    setTimeout(() => {
      els.saveBtn.textContent = "手動セーブ";
    }, 1200);
  });

  els.wipeBtn.addEventListener("click", () => {
    if (confirm("本当にセーブデータを消しますか？")) {
      localStorage.removeItem(SAVE_KEY);
      state = defaultState();
      spawnMonster(state);
      saveState(state);
      render();
    }
  });

  lastGoldForUpgrades = state.gold;
  render();
  requestAnimationFrame(gameLoop);
  setInterval(() => saveState(state), 15000);
}

init();
