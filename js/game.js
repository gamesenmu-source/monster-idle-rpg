const SAVE_KEY = "monster-idle-rpg-v1";

const ZONES = [
  { name: "辺境の森", monsters: ["ゴブリン斥候", "森の狼", "腐れスライム", "トレントの苗"] },
  { name: "灰色の丘陵", monsters: ["オーク戦士", "丘陵のグリフォン", "石化の蛇", "石巨人"] },
  { name: "忘れられた城塞", monsters: ["骸骨騎士", "幽霊弓兵", "呪われた鎧", "リッチの従者"] },
  { name: "奈落の裂け目", monsters: ["深淵の触手", "影のデーモン", "混沌の使徒", "古き竜の亡霊"] },
];

const UPGRADES = [
  {
    id: "blade",
    title: "研がれた刃",
    desc: "クリックダメージ +1（レベルごとに増加）",
    baseCost: 15,
    costMult: 1.14,
    effect: (lv) => 1 + Math.floor(lv * 1.2),
  },
  {
    id: "merc",
    title: "傭兵の契約",
    desc: "毎秒の自動ダメージ",
    baseCost: 40,
    costMult: 1.16,
    effect: (lv) => Math.max(0, Math.floor(2 + lv * 1.8)),
  },
  {
    id: "bounty",
    title: "懸賞金の看板",
    desc: "撃破ゴールド倍率",
    baseCost: 120,
    costMult: 1.18,
    effect: (lv) => 1 + lv * 0.08,
  },
  {
    id: "fury",
    title: "戦狂の血",
    desc: "全ダメージ乗算（小さく積む）",
    baseCost: 500,
    costMult: 1.22,
    effect: (lv) => 1 + lv * 0.05,
  },
];

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

function zoneDepth(s) {
  return s.zoneIndex * 4 + s.monsterIndex + 1;
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
  const base = 3 + depth * 2;
  return Math.floor(base * bountyMult);
}

function clickDamage(s) {
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
  const b = UPGRADES.find((u) => u.id === "bounty");
  return b.effect(s.upgrades.bounty || 0);
}

function upgradeCost(u, level) {
  return Math.floor(u.baseCost * Math.pow(u.costMult, level));
}

function spawnMonster(s) {
  const depth = zoneDepth(s);
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
      const depth = zoneDepth(s);
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
    const depth = zoneDepth(s);
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
    li.innerHTML = `
      <span class="title">${u.title} <span class="mono" style="color:var(--gold-dim)">Lv.${lv}</span></span>
      <span class="desc">${u.desc}</span>
      <button type="button" data-id="${u.id}">${fmt(cost)} G</button>
    `;
    const btn = li.querySelector("button");
    btn.disabled = state.gold < cost;
    btn.addEventListener("click", () => {
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
  els.clickDmg.textContent = fmt(clickDamage(state));
  els.zoneName.textContent = zoneName(state);
  els.zoneDepth.textContent = String(zoneDepth(state));
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
}

function strike() {
  applyDamage(state, clickDamage(state));
  state.lastTs = Date.now();
  saveState(state);
  render();
}

function gameLoop(now) {
  const dt = Math.min(0.25, (now - (state._lastFrame || now)) / 1000);
  state._lastFrame = now;
  const dps = idleDps(state);
  if (dps > 0 && dt > 0) {
    applyDamage(state, dps * dt);
    state.lastTs = Date.now();
    if (Math.random() < 0.05) saveState(state);
  }
  els.monsterName.textContent = monsterName(state);
  els.zoneName.textContent = zoneName(state);
  els.zoneDepth.textContent = String(zoneDepth(state));
  els.monsterHp.textContent = fmt(Math.max(0, state.monsterHp));
  els.monsterMaxHp.textContent = fmt(state.monsterMaxHp);
  const pct = state.monsterMaxHp > 0 ? (100 * state.monsterHp) / state.monsterMaxHp : 0;
  els.hpBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  els.kills.textContent = fmt(state.kills);
  els.gold.textContent = fmt(state.gold);
  els.dps.textContent = fmt(idleDps(state));
  els.clickDmg.textContent = fmt(clickDamage(state));
  if (state.gold !== lastGoldForUpgrades) {
    lastGoldForUpgrades = state.gold;
    renderUpgrades();
  }
  requestAnimationFrame(gameLoop);
}

function init() {
  const now = Date.now();
  if (state.totalKillsEver == null) state.totalKillsEver = state.kills;
  tickOffline(state, now);
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
