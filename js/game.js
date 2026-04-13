const SAVE_KEY = "monster-idle-rpg-v3";

// ─── ゾーン定義 ─────────────────────────────────────────────
const ZONES = [
  // ─ 通常ゾーン (index 0-5) ─
  {
    name: "辺境の森",
    boss: "古の番人",
    monsters: ["ゴブリン斥候", "森の狼", "腐れスライム", "トレントの苗"],
  },
  {
    name: "古城の廃墟",
    boss: "廃城の亡霊王",
    monsters: ["骸骨兵士", "廃城のコウモリ", "石像ゴーレム", "蜘蛛の女王"],
  },
  {
    name: "火炎の洞窟",
    boss: "炎の支配者",
    monsters: ["炎トカゲ", "溶岩スライム", "火炎コウモリ", "岩のトロル"],
  },
  {
    name: "竜の峡谷",
    boss: "竜王",
    monsters: ["幼竜", "峡谷の盗賊", "鉄鱗のリザード", "嵐の鷲"],
  },
  {
    name: "天空の神殿",
    boss: "堕天使",
    monsters: ["下位天使", "聖堂の守護者", "神聖なる鎧", "光の精霊"],
  },
  {
    name: "魔王城",
    boss: "魔王",
    monsters: ["魔王の親衛隊", "暗黒騎士", "漆黒のドラゴン", "闇の僧侶"],
  },
  // ─ 魔界ゾーン (index 6-9) ─ 転生1回で解放 ─
  {
    name: "魔界の門",
    boss: "獄門の守護者",
    monsters: ["獄卒", "地獄の猟犬", "闇の使者", "業火の番人"],
  },
  {
    name: "煉獄の荒野",
    boss: "煉獄の覇者",
    monsters: ["煉獄の亡者", "苦悶の悪鬼", "業火の巨人", "怨霊の騎士"],
  },
  {
    name: "奈落の深淵",
    boss: "奈落の支配者",
    monsters: ["深淵の触手", "混沌の使徒", "虚無の怪物", "次元の裂け目"],
  },
  {
    name: "魔界王の玉座",
    boss: "魔界大王",
    monsters: ["魔王の分身", "破滅の天使", "創造の逆流", "終焉の化身"],
  },
];

const NORMAL_ZONE_COUNT = 6;   // 通常ゾーン数（0〜5）
const MAKAI_START       = 6;   // 魔界ゾーン開始index
const DEMON_KING_ZONE   = 5;   // 魔王城index
const MAX_ZONE          = ZONES.length - 1; // 9

const MOBS_PER_ZONE = 4;       // ゾーン内の雑魚数（→ボス出現）

// ─── ボス設定 ─────────────────────────────────────────────
const BOSS_TIME_LIMIT_MS = 60_000;
const BOSS_HP_MULT       = 6;
const BOSS_GOLD_MULT     = 8;

// ─── ギルド解放条件 ───────────────────────────────────────
const GUILD_UNLOCK_ZONE = 2;   // 火炎の洞窟突破後に解放

// ─── 転生定数 ─────────────────────────────────────────────
// 魔王城で魔王撃破後に転生強制
const REINCARN_KILLS_BASE = 0; // 討伐数要件なし（魔王撃破が条件）

// ─── 詠唱 ─────────────────────────────────────────────────
const CAST_BASE_MS    = 5000;
const CHANNEL_BASE_MS = 5000;

// ─── アップグレード定義 ───────────────────────────────────
// lv70以降は急激なコスト壁、lv99でMAX（将来アップデートで拡張予定）
const UPGRADES = [
  {
    id: "blade",
    title: "魔法攻撃",
    desc: "詠唱一撃の威力のみを高める。詠唱時間・クールダウンは変わらない。",
    baseCost: 20,
    costMult: 1.16,
    effect: (lv) => Math.max(1, Math.floor((15 + lv * 18) * Math.pow(1.07, lv))),
  },
  {
    id: "merc",
    title: "武器強化",
    desc: "武器のオート攻撃（毎秒ダメージ）。放置の主軸。",
    baseCost: 35,
    costMult: 1.13,
    effect: (lv) => Math.max(1, Math.floor((6 + lv * 3) * Math.pow(1.09, lv))),
  },
  {
    id: "bounty",
    title: "冒険者ギルドに投資",
    desc: "撃破ゴールド倍率。火炎の洞窟突破後に解放。",
    baseCost: 150,
    costMult: 1.20,
    effect: (lv) => 1 + lv * 0.04, // 弱体化：lv99でも×4.96止まり
  },
  {
    id: "fury",
    title: "レベルアップ",
    desc: "武器・魔法の両方に掛かる乗算ボーナス。",
    baseCost: 300,
    costMult: 1.22,
    effect: (lv) => 1 + lv * 0.12,
  },
];

const MAX_UPGRADE_LV = 99;

// ─── ユーティリティ ───────────────────────────────────────
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
    ["M", 1e6], ["B", 1e9], ["T", 1e12], ["Qa", 1e15], ["Qi", 1e18],
  ];
  let x = n, u = "";
  for (const [s, v] of units) {
    if (x >= v) { u = s; x = n / v; }
  }
  return (Math.floor(x * 100) / 100).toLocaleString("ja-JP", { maximumFractionDigits: 2 }) + u;
}

// ─── ステート ─────────────────────────────────────────────
function defaultState() {
  return {
    kills:              0,
    gold:               0,
    souls:              0,
    zoneIndex:          0,
    monsterIndex:       0,
    monsterHp:          10,
    monsterMaxHp:       10,
    upgrades:           Object.fromEntries(UPGRADES.map((u) => [u.id, 0])),
    lastTs:             Date.now(),
    totalKillsEver:     0,
    nextCastAt:         0,
    castChannelEnd:     0,
    bossActive:         false,
    bossDeadline:       0,
    defeatedDemonKing:  false, // 魔王撃破フラグ（転生待ち）
    _lastFrame:         0,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    const d = defaultState();
    const merged = { ...d, ...p, upgrades: { ...d.upgrades, ...(p.upgrades || {}) } };
    if (merged.totalKillsEver == null)     merged.totalKillsEver = merged.kills;
    if (merged.nextCastAt == null)         merged.nextCastAt = 0;
    if (merged.castChannelEnd == null)     merged.castChannelEnd = 0;
    if (merged.bossActive == null)         merged.bossActive = false;
    if (merged.bossDeadline == null)       merged.bossDeadline = 0;
    if (merged.defeatedDemonKing == null)  merged.defeatedDemonKing = false;
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

// ─── ゲームロジック ───────────────────────────────────────

function guildUnlocked(s) {
  return (s.zoneIndex || 0) > GUILD_UNLOCK_ZONE;
}

// 魔界ゾーンにアクセスできるか（転生1回以上必要）
function makaiUnlocked(s) {
  return (s.souls || 0) >= 1;
}

// 表示上のゾーン総数（転生前は6、転生後は10）
function visibleZoneCount(s) {
  return makaiUnlocked(s) ? ZONES.length : NORMAL_ZONE_COUNT;
}

// HP：通常ゾーンと魔界で別スケール
function baseMonsterHp(s) {
  const zi = s.zoneIndex || 0;
  if (zi < MAKAI_START) {
    return Math.max(5, Math.floor(15 * Math.pow(2.8, zi)));
  }
  // 魔界：zone 6=50k、以降8倍ずつ
  const md = zi - MAKAI_START;
  return Math.floor(50000 * Math.pow(8, md));
}

// ゴールド：魔界で100倍以上の跳ね上がり
function goldPerKill(s) {
  const zi = s.zoneIndex || 0;
  if (zi < MAKAI_START) {
    return Math.floor(8 * Math.pow(2.2, zi) * bountyMult(s));
  }
  const md = zi - MAKAI_START;
  return Math.floor(80000 * Math.pow(6, md) * bountyMult(s));
}

function bountyMult(s) {
  if (!guildUnlocked(s)) return 1;
  const b = UPGRADES.find((u) => u.id === "bounty");
  return b.effect(s.upgrades.bounty || 0);
}

// lv70以降にコスト壁。lv99でMAX
function upgradeCost(u, level) {
  if (level >= MAX_UPGRADE_LV) return Infinity;
  const base = Math.floor(u.baseCost * Math.pow(u.costMult, level));
  if (level >= 70) {
    // 急激な指数壁（3.5倍/lv）
    return Math.floor(base * Math.pow(3.5, level - 69));
  }
  return base;
}

function soulMult(s) {
  return 1 + (s.souls || 0) * 0.20;
}

function furyMult(s) {
  const fury = UPGRADES.find((u) => u.id === "fury");
  return fury.effect(s.upgrades.fury || 0);
}

function spellDamage(s) {
  const blade = UPGRADES.find((u) => u.id === "blade");
  const lv = s.upgrades.blade || 0;
  return Math.max(1, Math.floor(blade.effect(lv) * furyMult(s) * soulMult(s)));
}

function idleDps(s) {
  const merc = UPGRADES.find((u) => u.id === "merc");
  const lv = s.upgrades.merc || 0;
  return Math.floor(merc.effect(lv) * furyMult(s) * soulMult(s) * 10) / 10;
}

function castCooldownMs(_s) { return CAST_BASE_MS; }
function channelDurationMs(_s) { return CHANNEL_BASE_MS; }

// ─── モンスター管理 ───────────────────────────────────────
function spawnMonster(s) {
  s.monsterMaxHp = baseMonsterHp(s);
  s.monsterHp    = s.monsterMaxHp;
}

function spawnBoss(s) {
  s.bossActive   = true;
  s.bossDeadline = Date.now() + BOSS_TIME_LIMIT_MS;
  s.monsterMaxHp = Math.floor(baseMonsterHp(s) * BOSS_HP_MULT);
  s.monsterHp    = s.monsterMaxHp;
}

function failBoss(s) {
  s.bossActive   = false;
  s.bossDeadline = 0;
  s.monsterIndex = 0;
  spawnMonster(s);
}

function advanceMonster(s) {
  if (s.bossActive) {
    s.bossActive   = false;
    s.bossDeadline = 0;
    s.monsterIndex = 0;

    const zi = s.zoneIndex || 0;

    // 魔王撃破：転生待ちフラグ
    if (zi === DEMON_KING_ZONE) {
      s.defeatedDemonKing = true;
      // ゲームを一時停止（モンスターをスポーンしない）
      return;
    }

    // 通常進行
    const nextZone = zi + 1;
    if (nextZone >= MAKAI_START && !makaiUnlocked(s)) {
      // 魔界ロック中：最終通常ゾーンに留まる（本来は魔王城で止まるはず）
      spawnMonster(s);
      return;
    }
    s.zoneIndex = Math.min(nextZone, MAX_ZONE);
    spawnMonster(s);
    return;
  }

  // 雑魚撃破
  s.monsterIndex = (s.monsterIndex || 0) + 1;
  if (s.monsterIndex >= MOBS_PER_ZONE) {
    s.monsterIndex = 0;
    spawnBoss(s);
    return;
  }
  spawnMonster(s);
}

function applyDamage(s, amt) {
  // 転生待ち中は戦闘停止
  if (s.defeatedDemonKing) return;

  let remaining = amt;
  let guard = 0;
  while (remaining > 0 && guard++ < 100) {
    if (s.monsterHp <= 0) spawnMonster(s);
    if (remaining >= s.monsterHp) {
      remaining -= s.monsterHp;
      const goldMult = s.bossActive ? BOSS_GOLD_MULT : 1;
      s.gold += goldPerKill(s) * goldMult;
      s.kills += 1;
      s.totalKillsEver = (s.totalKillsEver || 0) + 1;
      advanceMonster(s);
      // 転生待ちになったら即停止
      if (s.defeatedDemonKing) break;
    } else {
      s.monsterHp -= remaining;
      remaining = 0;
    }
  }
}

// ─── オフライン処理 ───────────────────────────────────────
function tickOffline(s, now) {
  if (s.defeatedDemonKing) return;
  const last    = s.lastTs || now;
  const elapsed = Math.min(86400_000, Math.max(0, now - last));
  if (elapsed < 1000) return;

  const dps = idleDps(s);
  let simStart = last;

  if (s.bossActive) {
    const deadline  = s.bossDeadline || 0;
    const timeAvail = Math.max(0, (deadline - simStart) / 1000);
    if (dps > 0 && dps * timeAvail >= s.monsterHp) {
      s.gold += goldPerKill(s) * BOSS_GOLD_MULT;
      s.kills += 1;
      s.totalKillsEver = (s.totalKillsEver || 0) + 1;
      simStart = Math.min(simStart + (s.monsterHp / Math.max(dps, 0.001)) * 1000, deadline);
      s.bossActive   = false;
      s.bossDeadline = 0;
      s.monsterIndex = 0;
      // 魔王城ボスをオフライン中に撃破→転生待ち
      if ((s.zoneIndex || 0) === DEMON_KING_ZONE) {
        s.defeatedDemonKing = true;
        return;
      }
      const nextZone = (s.zoneIndex || 0) + 1;
      s.zoneIndex = (nextZone >= MAKAI_START && !makaiUnlocked(s))
        ? s.zoneIndex
        : Math.min(nextZone, MAX_ZONE);
      spawnMonster(s);
    } else {
      failBoss(s);
      simStart = Math.min(deadline, now);
    }
  }

  let remaining = Math.max(0, (now - simStart) / 1000);
  if (dps <= 0 || remaining <= 0) return;

  let guard = 0;
  while (remaining > 0 && guard++ < 500_000) {
    if (s.defeatedDemonKing) break;
    if (s.monsterHp <= 0) spawnMonster(s);
    const timeToKill = s.monsterHp / dps;
    if (timeToKill > remaining) {
      s.monsterHp -= remaining * dps;
      remaining = 0;
      break;
    }
    remaining -= timeToKill;
    s.gold += goldPerKill(s);
    s.kills += 1;
    s.totalKillsEver = (s.totalKillsEver || 0) + 1;
    advanceMonster(s);
    if (s.bossActive) {
      failBoss(s);
    }
  }
}

// ─── 転生処理 ─────────────────────────────────────────────
function doReincarnation(s) {
  s.souls              = (s.souls || 0) + 1;
  s.kills              = 0;
  s.gold               = 0;
  s.zoneIndex          = 0;
  s.monsterIndex       = 0;
  s.bossActive         = false;
  s.bossDeadline       = 0;
  s.defeatedDemonKing  = false;
  s.upgrades           = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
  s.nextCastAt         = 0;
  s.castChannelEnd     = 0;
  spawnMonster(s);
  s.lastTs = Date.now();
}

// ─── 表示ヘルパー ─────────────────────────────────────────
function floorDisplay(s) {
  const zi       = s.zoneIndex || 0;
  const floorNum = zi + 1;
  const total    = visibleZoneCount(s);
  if (s.defeatedDemonKing) return `フロア ${floorNum}/${total} · 転生待ち`;
  if (s.bossActive) return `フロア ${floorNum}/${total} · BOSS戦`;
  const mobNum = (s.monsterIndex || 0) + 1;
  return `フロア ${floorNum}/${total} · 雑魚 ${mobNum}/${MOBS_PER_ZONE}体`;
}

function monsterName(s) {
  if (s.defeatedDemonKing) return "——";
  const z = ZONES[Math.min(s.zoneIndex, MAX_ZONE)];
  if (s.bossActive) return `BOSS ${z.boss}`;
  return z.monsters[s.monsterIndex % z.monsters.length];
}

function zoneName(s) {
  return ZONES[Math.min(s.zoneIndex, MAX_ZONE)].name;
}

// ソウル表示：魔王城到達前は「?」
function soulsDisplay(s) {
  if ((s.souls || 0) === 0 && (s.zoneIndex || 0) < DEMON_KING_ZONE && !s.defeatedDemonKing) {
    return "?";
  }
  return fmt(s.souls || 0);
}

// ─── DOM refs ─────────────────────────────────────────────
const els = {
  kills:               document.getElementById("kills"),
  gold:                document.getElementById("gold"),
  dps:                 document.getElementById("dps"),
  clickDmg:            document.getElementById("clickDmg"),
  soulsDisplay:        document.getElementById("soulsDisplay"),
  zoneName:            document.getElementById("zoneName"),
  zoneDepth:           document.getElementById("zoneDepth"),
  monsterName:         document.getElementById("monsterName"),
  monsterHp:           document.getElementById("monsterHp"),
  monsterMaxHp:        document.getElementById("monsterMaxHp"),
  hpBar:               document.getElementById("hpBar"),
  strikeBtn:           document.getElementById("strikeBtn"),
  strikeLabel:         document.getElementById("strikeLabel"),
  castHint:            document.getElementById("castHint"),
  castBurst:           document.getElementById("castBurst"),
  flameTrail:          document.getElementById("flameTrail"),
  recoverIndicator:    document.getElementById("recoverIndicator"),
  recoverDonutFill:    document.getElementById("recoverDonutFill"),
  recoverSecs:         document.getElementById("recoverSecs"),
  bossTimer:           document.getElementById("bossTimer"),
  bossTimerFill:       document.getElementById("bossTimerFill"),
  bossTimerSecs:       document.getElementById("bossTimerSecs"),
  upgradeList:         document.getElementById("upgradeList"),
  reincarnSection:     document.getElementById("reincarnSection"),
  reincarnPrompt:      document.getElementById("reincarnPrompt"),
  reincarnBtn:         document.getElementById("reincarnBtn"),
  battleSection:       document.getElementById("battleSection"),
  saveBtn:             document.getElementById("saveBtn"),
  wipeBtn:             document.getElementById("wipeBtn"),
};

let state = loadState();
let lastGoldForUpgrades = state.gold;

// ─── レンダリング ─────────────────────────────────────────
function renderUpgrades() {
  els.upgradeList.innerHTML = "";
  for (const u of UPGRADES) {
    const lv   = state.upgrades[u.id] || 0;
    const cost = upgradeCost(u, lv);
    const li   = document.createElement("li");
    li.className = "upgrade-item";

    const guildLocked = u.id === "bounty" && !guildUnlocked(state);
    const isMax = lv >= MAX_UPGRADE_LV;

    if (guildLocked) {
      // 未解放：?表示
      li.innerHTML = `
        <span class="title" style="color:var(--muted)">??? <span class="mono" style="color:var(--border)">Lv.?</span></span>
        <span style="font-size:0.75rem;color:var(--muted);grid-column:1/-1">火炎の洞窟を突破すると解放される</span>
        <button type="button" disabled>???G</button>
      `;
    } else {
      const descText = u.desc;
      const costLabel = isMax ? "MAX" : `${fmt(cost)} G`;
      li.innerHTML = `
        <span class="title">${escHtml(u.title)} <span class="mono" style="color:var(--gold-dim)">Lv.${lv}</span></span>
        <div class="upgrade-tip" tabindex="0" aria-label="${escHtml(u.title)}の説明">
          <span class="upgrade-tip-icon" aria-hidden="true">🔍</span>
          <div class="upgrade-tip-bubble" role="tooltip">${escHtml(descText)}</div>
        </div>
        <button type="button" data-id="${u.id}">${costLabel}</button>
      `;
      const btn = li.querySelector("button");
      btn.disabled = isMax || state.gold < cost || state.defeatedDemonKing;
      if (!isMax) {
        btn.addEventListener("click", () => {
          if (state.defeatedDemonKing) return;
          if (state.gold < cost) return;
          state.gold -= cost;
          state.upgrades[u.id] = lv + 1;
          saveState(state);
          render();
        });
      }
    }
    els.upgradeList.appendChild(li);
  }
}

function render() {
  els.kills.textContent    = fmt(state.kills);
  els.gold.textContent     = fmt(state.gold);
  els.dps.textContent      = fmt(idleDps(state));
  els.clickDmg.textContent = fmt(spellDamage(state));
  els.soulsDisplay.textContent = soulsDisplay(state);

  els.zoneName.textContent  = zoneName(state);
  els.zoneDepth.textContent = floorDisplay(state);

  const name = monsterName(state);
  els.monsterName.textContent = name;
  els.monsterName.classList.toggle("monster-name--boss", !!(state.bossActive));

  const hp  = Math.max(0, state.monsterHp);
  const mhp = state.monsterMaxHp;
  els.monsterHp.textContent    = fmt(hp);
  els.monsterMaxHp.textContent = fmt(mhp);
  const pct = mhp > 0 ? (100 * hp) / mhp : 0;
  els.hpBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;

  // 魔王撃破 → バトルを隠して転生パネルを表示
  const demonDefeated = !!state.defeatedDemonKing;
  els.battleSection.hidden  = demonDefeated;
  els.reincarnSection.hidden = !demonDefeated;

  renderUpgrades();
  updateCastUi();
}

// ─── 詠唱エフェクト ───────────────────────────────────────
function playCastBurst() {
  const trail = els.flameTrail;
  if (trail) {
    trail.classList.remove("flame-trail--active");
    void trail.offsetWidth;
    trail.classList.add("flame-trail--active");
  }
  setTimeout(() => {
    els.monsterName.classList.remove("monster-name--hit");
    void els.monsterName.offsetWidth;
    els.monsterName.classList.add("monster-name--hit");
    setTimeout(() => els.monsterName.classList.remove("monster-name--hit"), 600);
    const el = els.castBurst;
    if (!el) return;
    el.classList.remove("cast-burst--show");
    void el.offsetWidth;
    el.classList.add("cast-burst--show");
    setTimeout(() => el.classList.remove("cast-burst--show"), 720);
  }, 380);
}

function tryFinishSpellChannel(s, wall) {
  if (s.defeatedDemonKing) return false;
  const end = s.castChannelEnd || 0;
  if (end <= 0 || wall < end) return false;
  applyDamage(s, spellDamage(s));
  playCastBurst();
  s.castChannelEnd = 0;
  s.nextCastAt     = wall + castCooldownMs(s);
  s.lastTs         = wall;
  saveState(s);
  return true;
}

function updateCastUi(now = Date.now()) {
  if (state.defeatedDemonKing) return;
  const cd        = castCooldownMs(state);
  const ch        = channelDurationMs(state);
  const channeling = (state.castChannelEnd || 0) > now;
  const recovering = now < (state.nextCastAt || 0);
  els.strikeBtn.disabled = channeling || recovering;

  if (channeling) {
    const left = Math.max(0, (state.castChannelEnd || 0) - now);
    els.strikeLabel.textContent = `詠唱中 ${(left / 1000).toFixed(1)}s`;
    els.recoverIndicator.hidden = true;
    els.castHint.textContent    = `あと ${(left / 1000).toFixed(1)} 秒でダメージ。詠唱時間 ${(ch / 1000).toFixed(1)} 秒。`;
  } else if (recovering) {
    const left     = Math.max(0, (state.nextCastAt || 0) - now);
    const progress = 1 - left / cd;
    const circ     = 2 * Math.PI * 15;
    els.recoverDonutFill.style.strokeDashoffset = circ * (1 - progress);
    els.recoverSecs.textContent     = (left / 1000).toFixed(1) + "s";
    els.recoverIndicator.hidden     = false;
    els.strikeLabel.textContent     = "魔法詠唱";
    els.castHint.textContent        = `発動後のクールダウン ${(cd / 1000).toFixed(1)} 秒。`;
  } else {
    els.recoverIndicator.hidden = true;
    els.strikeLabel.textContent = "魔法詠唱";
    els.castHint.textContent    = `詠唱 ${(ch / 1000).toFixed(0)} 秒 → ダメージ発動 → クールダウン ${(cd / 1000).toFixed(0)} 秒。`;
  }
}

// ─── ゲームループ ─────────────────────────────────────────
function strike() {
  if (state.defeatedDemonKing) return;
  const wall = Date.now();
  if (tryFinishSpellChannel(state, wall)) { render(); return; }
  if (wall < (state.nextCastAt || 0)) return;
  if ((state.castChannelEnd || 0) > wall) return;
  state.castChannelEnd = wall + channelDurationMs(state);
  state.lastTs = wall;
  saveState(state);
  render();
}

function gameLoop(rAfNow) {
  const wall = Date.now();

  if (!state.defeatedDemonKing) {
    if (tryFinishSpellChannel(state, wall)) {
      lastGoldForUpgrades = state.gold;
      render();
    }

    if (state.bossActive && wall > (state.bossDeadline || 0)) {
      failBoss(state);
      saveState(state);
      render();
    }

    const dt  = Math.min(0.25, (rAfNow - (state._lastFrame || rAfNow)) / 1000);
    state._lastFrame = rAfNow;
    const dps = idleDps(state);
    if (dps > 0 && dt > 0) {
      applyDamage(state, dps * dt);
      state.lastTs = wall;
      if (Math.random() < 0.05) saveState(state);
    }

    // 毎フレーム更新
    els.monsterName.textContent = monsterName(state);
    els.monsterName.classList.toggle("monster-name--boss", !!(state.bossActive));
    els.zoneName.textContent  = zoneName(state);
    els.zoneDepth.textContent = floorDisplay(state);
    els.monsterHp.textContent    = fmt(Math.max(0, state.monsterHp));
    els.monsterMaxHp.textContent = fmt(state.monsterMaxHp);
    const pct = state.monsterMaxHp > 0
      ? (100 * state.monsterHp) / state.monsterMaxHp : 0;
    els.hpBar.style.width  = `${Math.max(0, Math.min(100, pct))}%`;
    els.kills.textContent  = fmt(state.kills);
    els.gold.textContent   = fmt(state.gold);
    els.dps.textContent    = fmt(idleDps(state));
    els.clickDmg.textContent = fmt(spellDamage(state));
    els.soulsDisplay.textContent = soulsDisplay(state);

    if (state.bossActive) {
      const remaining = Math.max(0, (state.bossDeadline || 0) - wall);
      els.bossTimer.hidden = false;
      els.bossTimerFill.style.width = `${(remaining / BOSS_TIME_LIMIT_MS) * 100}%`;
      els.bossTimerSecs.textContent = (remaining / 1000).toFixed(1);
    } else {
      els.bossTimer.hidden = true;
    }

    updateCastUi(wall);
  }

  // 魔王撃破で画面切り替えが必要な場合
  if (state.defeatedDemonKing && !els.reincarnSection.hidden === false) {
    render();
  }

  if (state.gold !== lastGoldForUpgrades) {
    lastGoldForUpgrades = state.gold;
    renderUpgrades();
  }

  requestAnimationFrame(gameLoop);
}

// ─── 初期化 ───────────────────────────────────────────────
function init() {
  const now = Date.now();
  if (state.totalKillsEver == null)    state.totalKillsEver = state.kills;
  if (state.nextCastAt == null)        state.nextCastAt = 0;
  if (state.castChannelEnd == null)    state.castChannelEnd = 0;
  if (state.bossActive == null)        state.bossActive = false;
  if (state.bossDeadline == null)      state.bossDeadline = 0;
  if (state.defeatedDemonKing == null) state.defeatedDemonKing = false;

  if (state.bossActive && state.bossDeadline < now) failBoss(state);

  tickOffline(state, now);
  tryFinishSpellChannel(state, now);
  state.lastTs = now;
  if (!state.monsterMaxHp || state.monsterHp == null) spawnMonster(state);
  saveState(state);

  els.strikeBtn.addEventListener("click", strike);
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); strike(); }
  });

  els.reincarnBtn.addEventListener("click", () => {
    if (!state.defeatedDemonKing) return;
    doReincarnation(state);
    saveState(state);
    render();
  });

  els.saveBtn.addEventListener("click", () => {
    saveState(state);
    els.saveBtn.textContent = "保存した";
    setTimeout(() => { els.saveBtn.textContent = "手動セーブ"; }, 1200);
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
