/*
 * 멸망까지 30일 — 밸런스 검증
 *
 * kingdom30.html을 "텍스트로" 읽어 사건 카드 / 엔딩 / 판정 함수의 원문 구간만 떼어내고,
 * 카드 뽑기(drawEvent)와 선택 처리는 순수 노드로 다시 구현해 전략별 10,000판을 돌린다.
 * jsdom으로 실제 DOM을 돌리면 한 판에 카드마다 1.25초 타이머가 걸려 수만 판을 볼 수 없다.
 *
 * 실행: node kingdom30.balance.test.js
 *
 * 이 스크립트는 kingdom30.html을 읽기만 한다. 수치 조정은 사람이 한다.
 * 카드 장수에 의존하는 하드코딩은 없다 — 8장이든 70장이든 그대로 돈다.
 */
const fs = require("fs");
const path = require("path");

const HTML_PATH = path.join(__dirname, "..", "kingdom30.html");
const src = fs.readFileSync(HTML_PATH, "utf8");

const GAMES = 10000;   // 전략당 판수
const SEED = 20260724; // 고정 시드 — 같은 코드 + 같은 html이면 항상 같은 수치가 나온다

/* ==================================================================
   1) 원문에서 필요한 구간만 떼어내기
   ================================================================== */
function chunk(from, startNeedle, endNeedle, what) {
  const a = from.indexOf(startNeedle);
  if (a < 0) throw new Error(`kingdom30.html에서 ${what} 시작을 찾지 못했다 (${startNeedle})`);
  const b = from.indexOf(endNeedle, a + startNeedle.length);
  if (b < 0) throw new Error(`kingdom30.html에서 ${what} 끝을 찾지 못했다`);
  return from.slice(a, b + endNeedle.length);
}

const cardFrom = src.indexOf("사건 카드 데이터 시작");
const cardTo = src.indexOf("사건 카드 데이터 끝");
if (cardFrom < 0 || cardTo < 0 || cardTo < cardFrom) {
  throw new Error("사건 카드 데이터 주석 구간(시작/끝)을 찾지 못했다");
}
const cardRegion = src.slice(cardFrom, cardTo);

const eventsSrc = chunk(cardRegion, "const KINGDOM_EVENTS = [", "\n];", "사건 카드");
const resSrc = chunk(src, "const RES = [", "\n];", "자원 정의");
const maxDaySrc = chunk(src, "const MAX_DAY =", ";", "MAX_DAY");
const endingsSrc = chunk(src, "const ENDINGS = [", "\n];", "엔딩 목록");
const rngSrc = chunk(src, "function mulberry32(a) {", "\n}", "시드 난수");
const deathSrc = chunk(src, "function deathCheck() {", "\n}", "파멸 판정");
const survSrc = chunk(src, "function survivalEnding() {", "\n}", "생존 엔딩 판정");

// 떼어낸 원문을 한 스코프에 모아 그대로 실행한다(템플릿 리터럴로 감싸면 카드 본문의
// 백틱 하나에 무너지므로 문자열 연결로만 붙인다).
const api = new Function([
  resSrc,
  maxDaySrc,
  endingsSrc,
  eventsSrc,
  rngSrc,
  "let S = null;",
  deathSrc,
  survSrc,
  "return {",
  "  RES: RES, MAX_DAY: MAX_DAY, ENDINGS: ENDINGS, EVENTS: KINGDOM_EVENTS,",
  "  mulberry32: mulberry32, deathCheck: deathCheck, survivalEnding: survivalEnding,",
  "  setState: function (s) { S = s; }",
  "};"
].join("\n"))();

const RES = api.RES;
const KEYS = RES.map(r => r.key);
const MAX_DAY = api.MAX_DAY;
const ENDINGS = api.ENDINGS;
const EVENTS = api.EVENTS;
const END_BY_ID = {};
ENDINGS.forEach(e => { END_BY_ID[e.id] = e; });

/* 파멸 엔딩 8종을 원문 deathCheck로부터 역산한다 — 목록을 손으로 적지 않는다 */
const DOOMS = [];
for (const r of RES) {
  for (const edge of [0, 100]) {
    const probe = { food: 50, army: 50, people: 50, gold: 50 };
    probe[r.key] = edge;
    api.setState(probe);
    const id = api.deathCheck();
    if (id) DOOMS.push({ id, res: r, edge, label: `${r.icon} ${r.name} ${edge}` });
  }
}
const DOOM_IDS = DOOMS.map(d => d.id);
const SURV_IDS = ENDINGS.map(e => e.id).filter(id => !DOOM_IDS.includes(id));

/* ==================================================================
   2) 출력 도구 (한글·이모지는 두 칸으로 세어 표를 맞춘다)
   ================================================================== */
function vw(s) {
  let n = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    // 이형 선택자·ZWJ·피부색 수식자는 폭이 없다 (⚔️ 🏳️ 같은 글자가 한 칸씩 밀리는 걸 막는다)
    if (c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f) || (c >= 0x1f3fb && c <= 0x1f3ff)) continue;
    const wide =
      (c >= 0x1100 && c <= 0x115f) || (c >= 0x2600 && c <= 0x27bf) ||
      (c >= 0x2b00 && c <= 0x2bff) || (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f000);
    n += wide ? 2 : 1;
  }
  return n;
}
const padR = (s, n) => String(s) + " ".repeat(Math.max(0, n - vw(s)));
const padL = (s, n) => " ".repeat(Math.max(0, n - vw(s))) + String(s);
const pct = (n, d) => (d ? (n / d) * 100 : 0);
const p1 = v => v.toFixed(1) + "%";

const checks = [];
const warns = [];
const check = (name, cond, detail) =>
  checks.push({ ok: !!cond, line: (cond ? "OK  " : "X   ") + name + (detail ? " → " + detail : "") });
const warn = (msg) => warns.push(msg);

/* ==================================================================
   3) 데이터 무결성
   ================================================================== */
console.log("=".repeat(72));
console.log("멸망까지 30일 · 밸런스 검증");
console.log(`덱 ${EVENTS.length}장 · 엔딩 ${ENDINGS.length}종(파멸 ${DOOM_IDS.length} / 생존 ${SURV_IDS.length})` +
  ` · 전략당 ${GAMES.toLocaleString("en-US")}판 · 시드 ${SEED}`);
console.log("=".repeat(72));

console.log("\n[1] 데이터 무결성");

const errs = [];
const seenIds = new Set();
const dupIds = [];
const setFlags = new Set();     // 어떤 카드가 세우는 플래그
const reqFlags = new Map();     // 플래그 → 그것을 require 하는 카드 id들
const forbidFlags = new Map();  // 플래그 → 그것을 forbid 하는 카드 id들
const freeLunch = [];           // 순이득 선택지

const addTo = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };

for (const e of EVENTS) {
  const id = e.id === undefined ? "(id 없음)" : String(e.id);
  if (seenIds.has(id)) dupIds.push(id); else seenIds.add(id);

  const chs = Array.isArray(e.choices) ? e.choices : [];
  if (chs.length !== 2) errs.push(`${id}: 선택지가 ${chs.length}개 (2개여야 한다)`);

  chs.forEach((c, ci) => {
    const ef = c && c.effects;
    if (!ef || typeof ef !== "object") {
      errs.push(`${id}[${ci}]: effects가 없다`);
      return;
    }
    const missing = KEYS.filter(k => !(k in ef));
    if (missing.length) errs.push(`${id}[${ci}]: effects에 ${missing.join("/")} 키가 없다`);
    for (const k of KEYS) {
      if (!(k in ef)) continue;
      const v = ef[k];
      if (typeof v !== "number" || !isFinite(v)) errs.push(`${id}[${ci}].${k}: 숫자가 아니다 (${v})`);
      else if (v < -18 || v > 18) errs.push(`${id}[${ci}].${k} = ${v} — 허용 범위 -18~18을 벗어났다`);
    }
    const unknown = Object.keys(ef).filter(k => !KEYS.includes(k));
    if (unknown.length) warn(`${id}[${ci}]: 자원이 아닌 effects 키 ${unknown.join("/")} — 조용히 무시된다`);

    const vals = KEYS.map(k => ef[k] || 0);
    if (vals.every(v => v >= 0) && vals.some(v => v > 0)) {
      freeLunch.push(`${id}[${ci}] "${(c.label || "").trim()}" (${KEYS.map((k, i) => `${k} ${vals[i] >= 0 ? "+" : ""}${vals[i]}`).join(", ")})`);
    }
    (c.flags || []).forEach(f => setFlags.add(f));
  });

  (e.require || []).forEach(f => addTo(reqFlags, f, id));
  (e.forbid || []).forEach(f => addTo(forbidFlags, f, id));
}

/* 엔딩 판정문이 직접 읽는 플래그(예: survivalEnding의 vassal_pact)도 "소비자"로 친다.
   flags.has("x") 꼴만 찾으면 지역 별칭(const has = k => S.flags.has(k))을 쓴 판정문을
   통째로 놓친다. 그래서 생존 엔딩 판정문 안의 문자열 리터럴은 전부 소비로 보되,
   반환값인 엔딩 id만 빼낸다. */
const endingFlagUse = new Set();
String(src).replace(/flags\.has\(\s*["'`]([^"'`]+)["'`]\s*\)/g, (m, f) => { endingFlagUse.add(f); return m; });
const endingIds = new Set(ENDINGS.map(e => e.id));
String(survSrc).replace(/["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]/g, (m, s) => {
  if (!endingIds.has(s)) endingFlagUse.add(s);
  return m;
});
/* 후일담(EPILOGUES)이 읽는 플래그도 소비다. 카드는 flags: [...] 복수형,
   후일담은 flag: "..." 단수형이라 이 한 줄로 정확히 갈린다. */
String(src).replace(/\bflag:\s*["'`]([^"'`]+)["'`]/g, (m, f) => { endingFlagUse.add(f); return m; });

/* 죽은 플래그 */
const deadReq = [...reqFlags.keys()].filter(f => !setFlags.has(f));
const deadForbid = [...forbidFlags.keys()].filter(f => !setFlags.has(f));
for (const f of deadReq) {
  errs.push(`죽은 플래그 "${f}" — 아무 카드도 세우지 않는데 ${reqFlags.get(f).join(", ")}가 require 한다 (그 카드는 영원히 안 나온다)`);
}
for (const f of deadForbid) {
  errs.push(`죽은 플래그 "${f}" — 아무 카드도 세우지 않는데 ${forbidFlags.get(f).join(", ")}가 forbid 한다 (조건이 무의미하다)`);
}

/* 고아 플래그 */
const orphanFlags = [...setFlags].filter(f =>
  !reqFlags.has(f) && !forbidFlags.has(f) && !endingFlagUse.has(f));

[...new Set(dupIds)].forEach(id => errs.push(`id 중복 "${id}" — 뒤 카드가 앞 카드를 가린다(used 집합이 id 기준이다)`));

check("id 중복 없음", dupIds.length === 0, dupIds.length ? `중복 ${[...new Set(dupIds)].join(", ")}` : `${EVENTS.length}장 모두 고유`);
check("모든 카드의 선택지가 정확히 2개", !errs.some(m => /선택지가/.test(m)));
check("effects에 자원 4키가 모두 있고 값이 -18~18 안", !errs.some(m => /effects|허용 범위|숫자가 아니다/.test(m)));
check("죽은 플래그 없음", deadReq.length === 0 && deadForbid.length === 0,
  (deadReq.length + deadForbid.length) ? `${[...deadReq, ...deadForbid].join(", ")}` : "require/forbid에 쓰인 플래그를 모두 누군가 세운다");

if (errs.length) {
  console.log(`  X   무결성 오류 ${errs.length}건`);
  errs.forEach(m => console.log("        · " + m));
} else {
  console.log(`  ok  카드 ${EVENTS.length}장 · id/선택지/effects/플래그 연결 이상 없음`);
}
if (orphanFlags.length) {
  console.log(`  !   고아 플래그 ${orphanFlags.length}개 (세우기만 하고 아무도 안 받는다): ${orphanFlags.join(", ")}`);
  orphanFlags.forEach(f => warn(`고아 플래그 "${f}" — flags로 세우지만 require/forbid/엔딩판정 어디서도 쓰이지 않는다`));
} else {
  console.log("  ok  고아 플래그 없음");
}
if (freeLunch.length) {
  console.log(`  !   순이득 선택지 ${freeLunch.length}개 (잃는 것 없이 얻기만 한다)`);
  freeLunch.forEach(m => console.log("        · " + m));
  freeLunch.forEach(m => warn(`순이득 선택지: ${m}`));
} else {
  console.log("  ok  순이득 선택지 없음 — 모든 선택이 무언가를 잃는다");
}

/* ==================================================================
   4) 시뮬레이터 — drawEvent / 선택 처리 재구현
   ================================================================== */
const clamp = v => Math.max(0, Math.min(100, v));
function phaseOf(day) { return day <= 10 ? "early" : day <= 20 ? "mid" : "late"; }

function eligible(S, e) {
  if (S.used.has(e.id)) return false;
  if ((e.require || []).some(f => !S.flags.has(f))) return false;
  if ((e.forbid || []).some(f => S.flags.has(f))) return false;
  return true;
}

function drawEvent(S) {
  const ph = phaseOf(S.day);
  let pool = EVENTS.filter(e => eligible(S, e) && (e.phase === ph || e.phase === "any"));
  if (!pool.length) pool = EVENTS.filter(e => eligible(S, e));          // 단계 무시하고 재시도
  if (!pool.length) { S.used.clear(); pool = EVENTS.slice(); }           // 그래도 없으면 덱 재사용
  const chained = pool.filter(e => (e.require || []).length > 0);
  if (chained.length && S.rand() < 0.75) pool = chained;
  const ev = pool[Math.floor(S.rand() * pool.length)];
  S.used.add(ev.id);
  return ev;
}

function preview(S, ch) {
  const ef = (ch && ch.effects) || {};
  const out = {};
  for (const k of KEYS) out[k] = clamp(S[k] + (ef[k] || 0));
  return out;
}
const devSq = st => KEYS.reduce((n, k) => n + (st[k] - 50) * (st[k] - 50), 0);
const lowest = st => Math.min(...KEYS.map(k => st[k]));

/* 점수가 높은 쪽을 고르고, 같으면 동전을 던진다(한쪽으로 쏠린 판정을 피한다) */
function bestOf(S, ev, rnd, score) {
  if (!ev.choices || ev.choices.length < 2) return 0;
  const a = score(preview(S, ev.choices[0]));
  const b = score(preview(S, ev.choices[1]));
  if (a > b) return 0;
  if (b > a) return 1;
  return rnd() < 0.5 ? 0 : 1;
}

const STRATEGIES = [
  {
    key: "random", name: "무작위", desc: "두 선택지 중 아무거나",
    pick: (S, ev, rnd) => (rnd() < 0.5 ? 0 : 1)
  },
  {
    key: "balanced", name: "균형", desc: "선택 후 50에서 덜 벗어나는 쪽(편차 제곱합)",
    pick: (S, ev, rnd) => bestOf(S, ev, rnd, st => -devSq(st))
  },
  {
    key: "greedy_survival", name: "벼랑끝회피", desc: "선택 후 가장 낮은 자원이 더 높은 쪽",
    pick: (S, ev, rnd) => bestOf(S, ev, rnd, st => lowest(st))
  }
];

const seenCards = new Set();

function play(strategy, gameIdx, stratIdx) {
  const S = {
    day: 1, food: 50, army: 50, people: 50, gold: 50,
    flags: new Set(), used: new Set(),
    rand: api.mulberry32(SEED + gameIdx)   // 사건 순서는 전략과 무관하게 같은 시드에서 출발
  };
  const pickRand = api.mulberry32((SEED * 31 + gameIdx * 7919 + stratIdx * 104729) | 0);

  for (;;) {
    const ev = drawEvent(S);
    seenCards.add(ev.id);
    const idx = strategy.pick(S, ev, pickRand);
    const ch = ev.choices[Math.min(idx, ev.choices.length - 1)] || { effects: {} };

    for (const k of KEYS) S[k] = clamp(S[k] + ((ch.effects || {})[k] || 0));
    (ch.flags || []).forEach(f => S.flags.add(f));

    api.setState(S);
    const dead = api.deathCheck();
    if (dead) return { day: S.day, ending: dead, survived: false };
    if (S.day >= MAX_DAY) return { day: S.day, ending: api.survivalEnding(), survived: true };
    S.day++;
  }
}

function runStrategy(strategy, stratIdx) {
  const r = {
    strategy, survived: 0, days: 0, best: 0,
    hist: new Array(Math.ceil(MAX_DAY / 5)).fill(0),
    deaths: {}, endings: {}
  };
  DOOM_IDS.forEach(id => { r.deaths[id] = 0; });
  ENDINGS.forEach(e => { r.endings[e.id] = 0; });

  for (let i = 0; i < GAMES; i++) {
    const g = play(strategy, i, stratIdx);
    r.days += g.day;
    r.best = Math.max(r.best, g.day);
    r.hist[Math.min(r.hist.length - 1, Math.floor((g.day - 1) / 5))]++;
    if (g.survived) r.survived++;
    else r.deaths[g.ending] = (r.deaths[g.ending] || 0) + 1;
    r.endings[g.ending] = (r.endings[g.ending] || 0) + 1;
  }
  r.rate = pct(r.survived, GAMES);
  r.avgDay = r.days / GAMES;
  r.deadTotal = GAMES - r.survived;
  return r;
}

const t0 = Date.now();
const runs = STRATEGIES.map((s, i) => runStrategy(s, i));
const elapsed = Date.now() - t0;
const byKey = {};
runs.forEach(r => { byKey[r.strategy.key] = r; });

/* ==================================================================
   5) 결과 출력
   ================================================================== */
console.log(`\n[2] 전략별 성적 (각 ${GAMES.toLocaleString("en-US")}판, ${elapsed}ms)`);
console.log(padR("전략", 18) + padR("성향", 44) + padL("생존율", 9) + padL("평균 생존일", 14) + padL("최장", 8));
console.log("-".repeat(93));
for (const r of runs) {
  console.log(
    padR(`${r.strategy.key}`, 18) +
    padR(r.strategy.desc, 44) +
    padL(p1(r.rate), 9) +
    padL(r.avgDay.toFixed(1) + "일", 14) +
    padL(r.best + "일", 8));
}

console.log("\n[3] 생존일수 분포 (5일 단위)");
console.log(padR("구간", 10) + runs.map(r => padL(r.strategy.key, 17)).join(""));
console.log("-".repeat(10 + runs.length * 17));
for (let b = 0; b < runs[0].hist.length; b++) {
  const lo = b * 5 + 1, hi = Math.min(MAX_DAY, b * 5 + 5);
  const label = `${String(lo).padStart(2, "0")}-${String(hi).padStart(2, "0")}일`;
  console.log(padR(label, 10) + runs.map(r => {
    const n = r.hist[b];
    const p = pct(n, GAMES);
    return padL(`${n} (${p.toFixed(1)}%)`, 17);
  }).join(""));
}
console.log(padR("└ 30일 생존", 10) + runs.map(r => padL(`${r.survived} (${p1(r.rate)})`, 17)).join(""));

console.log("\n[4] 사망 원인 — 어느 자원이 어느 쪽 끝으로 터졌나 (사망 판수 대비 %)");
console.log(padR("원인", 20) + padR("엔딩", 22) + runs.map(r => padL(r.strategy.key, 17)).join(""));
console.log("-".repeat(42 + runs.length * 17));
for (const d of DOOMS) {
  const end = END_BY_ID[d.id];
  console.log(
    padR(d.label, 20) +
    padR(`${end ? end.icon + " " + end.name : d.id}`, 22) +
    runs.map(r => {
      const n = r.deaths[d.id] || 0;
      return padL(`${n} (${pct(n, r.deadTotal).toFixed(1)}%)`, 17);
    }).join(""));
}
console.log(padR("합계", 42) + runs.map(r => padL(String(r.deadTotal), 17)).join(""));

/* 사망 편중: 전 전략을 합친 "전체 사망"과, 편향 없는 random을 각각 본다 */
const pooledDeaths = {};
let pooledTotal = 0;
DOOM_IDS.forEach(id => { pooledDeaths[id] = 0; });
runs.forEach(r => DOOM_IDS.forEach(id => { pooledDeaths[id] += r.deaths[id] || 0; pooledTotal += r.deaths[id] || 0; }));

console.log("\n[5] 도달한 엔딩 (판수 대비 %)");
console.log(padR("엔딩", 26) + padR("조건", 12) + runs.map(r => padL(r.strategy.key, 17)).join(""));
console.log("-".repeat(38 + runs.length * 17));
for (const e of ENDINGS) {
  console.log(
    padR(`${e.icon} ${e.name}`, 26) +
    padR(e.kind, 12) +
    runs.map(r => {
      const n = r.endings[e.id] || 0;
      return padL(`${n} (${pct(n, GAMES).toFixed(1)}%)`, 17);
    }).join(""));
}

const unusedCards = EVENTS.filter(e => !seenCards.has(e.id)).map(e => e.id);
console.log(`\n[6] 카드 등장 — ${GAMES.toLocaleString("en-US")}판 × ${runs.length}전략에서 한 번도 안 나온 카드`);
if (unusedCards.length) {
  console.log(`  !   ${unusedCards.length}장 / ${EVENTS.length}장: ${unusedCards.join(", ")}`);
  warn(`한 번도 등장하지 않은 카드 ${unusedCards.length}장: ${unusedCards.join(", ")}`);
} else {
  console.log(`  ok  ${EVENTS.length}장 전부 등장했다`);
}

/* ==================================================================
   6) 판정
   ================================================================== */
const rnd = byKey.random, bal = byKey.balanced;

check("random 생존율이 3~25% 안에 있다 (너무 쉽지도 잔인하지도 않다)",
  rnd.rate >= 3 && rnd.rate <= 25, p1(rnd.rate));

check("balanced 생존율이 50% 이상이다 (실력이 보상받는다)",
  bal.rate >= 50, p1(bal.rate));

const worstPooled = DOOMS
  .map(d => ({ d, n: pooledDeaths[d.id] || 0, p: pct(pooledDeaths[d.id] || 0, pooledTotal) }))
  .sort((a, b) => b.p - a.p)[0];
const worstRandom = DOOMS
  .map(d => ({ d, n: rnd.deaths[d.id] || 0, p: pct(rnd.deaths[d.id] || 0, rnd.deadTotal) }))
  .sort((a, b) => b.p - a.p)[0];
check("사망 원인이 한 곳으로 쏠리지 않는다 (전체 사망의 40% 이하)",
  worstPooled.p <= 40 && worstRandom.p <= 40,
  `최다 — 전체합산 ${worstPooled.d.label} ${worstPooled.p.toFixed(1)}% / random ${worstRandom.d.label} ${worstRandom.p.toFixed(1)}%`);

/* random 이외 전략의 쏠림은 전략 성향 탓일 수 있어 경고로만 남긴다 */
for (const r of runs) {
  if (r.strategy.key === "random" || !r.deadTotal) continue;
  const top = DOOMS.map(d => ({ d, p: pct(r.deaths[d.id] || 0, r.deadTotal) })).sort((a, b) => b.p - a.p)[0];
  if (top.p > 40) warn(`${r.strategy.key} 전략은 사망의 ${top.p.toFixed(1)}%가 "${top.d.label}"에 몰린다 (전략 성향일 수 있어 경고만)`);
}

const missingDoom = DOOMS.filter(d => !(rnd.deaths[d.id] > 0));
check(`파멸 엔딩 ${DOOMS.length}종이 random ${GAMES.toLocaleString("en-US")}판에서 모두 나온다`,
  missingDoom.length === 0,
  missingDoom.length ? `안 나온 엔딩: ${missingDoom.map(d => `${END_BY_ID[d.id] ? END_BY_ID[d.id].name : d.id}(${d.label})`).join(", ")}` : "8종 전부 등장");

const unreachable = ENDINGS.filter(e => runs.every(r => !(r.endings[e.id] > 0)));
if (unreachable.length) {
  unreachable.forEach(e => warn(`도달 불가 엔딩: ${e.icon} ${e.name} (${e.kind}) — 세 전략 ${(GAMES * runs.length).toLocaleString("en-US")}판 어디에서도 안 나왔다`));
}

console.log("\n===== 판정 =====");
checks.forEach(c => console.log("  " + c.line));

if (warns.length) {
  console.log(`\n===== 경고 ${warns.length}건 (실패는 아니다) =====`);
  warns.forEach(m => console.log("  !   " + m));
}

const failed = checks.filter(c => !c.ok).length;
console.log("");
console.log(failed ? `실패 ${failed}개 — 밸런스 수치 조정이 필요하다` : "전부 통과");
process.exit(failed ? 1 : 0);
