/*
 * 오목 챌린지 — 보스 성격 검증
 *
 * omok.html에서 AI 코어 원문을 그대로 떼어내 세 가지 판을 각각 60번 두게 하고,
 * 보스 이름과 실제로 두는 수가 맞는지 센다. jsdom도 브라우저도 필요 없다.
 *
 * 실행: node omok.persona.test.js
 *
 * 핵심 불변 조건: 어떤 성격을 주더라도 3단계 이상은 상대의 열린 3을 막아야 한다.
 * 공격형(defBias < 1)이 상대의 4목을 깎아 보면 몇 수 앞까지만 읽는 탐색이
 * "맞불도 해볼 만하다"고 착각해 지는 수를 둔다. omok.html의 CRITICAL_SCORE가 이를 막는다.
 */
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "omok.html"), "utf8");

const ls = src.indexOf("const LEVELS = [");
const le = src.indexOf("\n  ];", ls) + 5;
const LEVELS = new Function(src.slice(ls, le) + "; return LEVELS;")();

const a = src.indexOf("function inBounds");
const b = src.indexOf("function placeStone");
const core = src.slice(a, b);

const prelude = `
  const SIZE = 15, EMPTY = 0, BLACK = 1, WHITE = 2;
  const DIRS = [[0,1],[1,0],[1,1],[1,-1]];
  const WIN_SCORE = 1e12;
  let board = [], cellEls = [], history = [], lastAiDecisionReason = "search";
  const boardEl = { innerHTML: "", appendChild() {} };
  const document = { createElement: () => ({ classList: { add() {} }, dataset: {}, appendChild() {} }) };
`;
const api = new Function("LEVELS",
  prelude + core + `; return {
    chooseAiMove,
    orderedCandidates,
    findWinningLine,
    findForcingMove,
    findForcingSequenceMove,
    setPersona,
    setBoard: (b) => { board = b; },
    setHistory: (h) => { history = h; }
  };`
)(LEVELS);

const empty = () => Array.from({ length: 15 }, () => new Array(15).fill(0));
const near = (mv, cells, d) => cells.some(([r, c]) =>
  Math.abs(mv[0] - r) <= d && Math.abs(mv[1] - c) <= d);

const TRIALS = 60;

function run(makeBoard, classify) {
  const rows = [];
  for (let L = 1; L <= 10; L++) {
    const tally = {};
    for (let t = 0; t < TRIALS; t++) {
      api.setBoard(makeBoard());
      const mv = api.chooseAiMove(L);
      const k = mv ? classify(mv) : "그외";
      tally[k] = (tally[k] || 0) + 1;
    }
    rows.push({ L, lv: LEVELS[L - 1], tally });
  }
  return rows;
}

function table(title, rows, keys) {
  console.log("\n" + title);
  console.log("단계  이름       defBias  " + keys.map((k) => k.padStart(6)).join(""));
  console.log("-".repeat(40 + keys.length * 6));
  for (const { L, lv, tally } of rows) {
    console.log(
      String(L).padStart(3) + "   " + lv.name.padEnd(8) + "  " +
      String(lv.persona.defBias).padStart(5) + "   " +
      keys.map((k) => String(tally[k] || 0).padStart(6)).join("")
    );
  }
}

const t = [];
const check = (name, cond, detail) =>
  t.push((cond ? "OK  " : "X   ") + name + (detail ? " → " + detail : ""));
const g = (rows, n) => rows.find((r) => r.lv.name === n).tally;

const copyIssues = [];
LEVELS.forEach((lv, i) => {
  for (const field of ["tag", "tagline", "desc", "tip"]) {
    if (typeof lv[field] !== "string" || !lv[field].trim()) copyIssues.push(`${i + 1}단계:${field}`);
  }
  if (lv.desc === lv.tagline || (typeof lv.desc === "string" && lv.desc.trim().length < 40)) {
    copyIssues.push(`${i + 1}단계:공략집 전용 desc`);
  }
});
check("30단계 성향·소개·분석·공략 데이터가 모두 정의됨",
  LEVELS.length === 30 && copyIssues.length === 0,
  copyIssues.join(", "));

/* ---------- 가: 조용한 판. 급한 위협이 없으니 성격이 드러난다 ---------- */
const 흑돌 = [[7, 7], [7, 8]];
const 백돌 = [[3, 3], [3, 4]];
const rowsA = run(() => {
  const bd = empty();
  흑돌.forEach(([r, c]) => (bd[r][c] = 1));
  백돌.forEach(([r, c]) => (bd[r][c] = 2));
  return bd;
}, (mv) => {
  const 내쪽 = near(mv, 백돌, 1);
  const 상대쪽 = near(mv, 흑돌, 1);
  if (내쪽 && !상대쪽) return "내모양";
  if (상대쪽 && !내쪽) return "견제";
  return "그외";
});
table("[가] 조용한 판 — 자기 모양을 키우나, 상대를 견제하나", rowsA, ["내모양", "견제", "그외"]);

const 방패가 = g(rowsA, "방패"), 철벽가 = g(rowsA, "철벽");
const 맹공가 = g(rowsA, "맹공"), 추격자가 = g(rowsA, "추격자");

check("방패는 견제를 더 많이 한다", (방패가.견제 || 0) > (방패가.내모양 || 0),
  `견제 ${방패가.견제 || 0} vs 내모양 ${방패가.내모양 || 0}`);
check("추격자는 자기 모양을 더 키운다", (추격자가.내모양 || 0) > (추격자가.견제 || 0),
  `내모양 ${추격자가.내모양 || 0} vs 견제 ${추격자가.견제 || 0}`);
check("방패가 추격자보다 견제 성향이 강하다", (방패가.견제 || 0) > (추격자가.견제 || 0),
  `방패 ${방패가.견제 || 0} vs 추격자 ${추격자가.견제 || 0}`);
check("맹공은 조용한 판에서 자기 모양을 키운다", (맹공가.내모양 || 0) > (맹공가.견제 || 0),
  `내모양 ${맹공가.내모양 || 0} vs 견제 ${맹공가.견제 || 0}`);
// 철벽도 조용한 판에서는 뻗는다. 상대의 열린 2를 막아 얻는 값보다
// 자기 2를 3으로 늘리는 값이 100배 크기 때문이다. 방어 능력은 [나]에서 잰다.
check("철벽은 조용한 판에서 유효한 수를 둔다",
  (철벽가.내모양 || 0) + (철벽가.견제 || 0) === TRIALS,
  `내모양 ${철벽가.내모양 || 0} / 견제 ${철벽가.견제 || 0}`);

/* ---------- 나: 상대만 열린 3. 성격과 무관하게 막아야 한다 ---------- */
const rowsB = run(() => {
  const bd = empty();
  [[5, 5], [5, 6], [5, 7]].forEach(([r, c]) => (bd[r][c] = 1));
  [[10, 5], [10, 6]].forEach(([r, c]) => (bd[r][c] = 2));
  return bd;
}, (mv) => (mv[0] === 5 && (mv[1] === 4 || mv[1] === 8)) ? "막음" : "안막음");
table("[나] 상대만 열린 3 — 반드시 막아야 하는 판", rowsB, ["막음", "안막음"]);

// 낮은 단계는 설계상 무작위로 두는 비율이 있으니 그만큼 기준을 낮춘다.
for (const name of ["방패", "추격자", "함정술사", "맹공", "철벽", "심판자", "지배자", "오목왕"]) {
  const r = g(rowsB, name);
  const lv = LEVELS.find((l) => l.name === name);
  const 최소 = (1 - lv.randomChance) * 0.95;
  check(`${name}은(는) 열린 3을 막는다 (기준 ${Math.round(최소 * 100)}%)`,
    (r.막음 || 0) >= TRIALS * 최소, `${r.막음 || 0}/${TRIALS}`);
}
check("철벽은 한 번도 놓치지 않는다", (g(rowsB, "철벽").안막음 || 0) === 0);
check("새싹은 자주 놓친다 (의도된 약점)", (g(rowsB, "새싹").안막음 || 0) > 0,
  `놓침 ${g(rowsB, "새싹").안막음 || 0}/${TRIALS}`);

/* ---------- 다: 한 수로 두 방향에 위협을 세울 수 있는 판 ---------- */
const rowsC = run(() => {
  const bd = empty();
  bd[7][5] = 2; bd[7][6] = 2;
  bd[5][7] = 2; bd[6][7] = 2;
  bd[0][0] = 1; bd[0][1] = 1;
  return bd;
}, (mv) => (mv[0] === 7 && mv[1] === 7) ? "이중위협" : "그외");
table("[다] 한 수로 두 방향에 위협을 세울 수 있는 판", rowsC, ["이중위협", "그외"]);

const 함정다 = g(rowsC, "함정술사"), 새싹다 = g(rowsC, "새싹");
check("함정술사는 이중 위협 자리를 잡는다", (함정다.이중위협 || 0) >= TRIALS * 0.8,
  `${함정다.이중위협 || 0}/${TRIALS}`);
check("새싹은 이중 위협을 잘 못 본다", (새싹다.이중위협 || 0) < (함정다.이중위협 || 0),
  `새싹 ${새싹다.이중위협 || 0} vs 함정술사 ${함정다.이중위협 || 0}`);

/* ---------- 라: 신계는 완성 직전의 양수를 반드시 만들고 막는다 ---------- */
const divineNames = ["문지기", "천리안", "파괴신", "운명신", "오목신", "선수신", "변화신", "봉쇄신", "인과신", "천원신"];
check("신계 보스 10명이 모두 정의됨",
  divineNames.every((name, i) => LEVELS[10 + i] && LEVELS[10 + i].name === name));
const warNames = ["전쟁의 전령", "창조신", "거울신", "시간신", "전쟁신", "공허신", "질서신", "혼돈신", "종말신", "절대신"];
check("신들의 전쟁 보스 10명이 모두 정의됨",
  warNames.every((name, i) => LEVELS[20 + i] && LEVELS[20 + i].name === name));
check("신들의 전쟁은 무작위 실수 없이 연속 강제 수순을 읽음",
  LEVELS.slice(20).every((lv) => lv.randomChance === 0 && lv.war &&
    lv.war.attackDepth >= 3 && lv.war.defenseDepth >= 3 && lv.war.safeCandidates >= 4));
const warLevels = LEVELS.slice(20);
const neverDrops = (pick) => warLevels.every((lv, i) => i === 0 || pick(lv) >= pick(warLevels[i - 1]));
check("21~30단계 난이도 손잡이가 뒤 단계에서 약해지지 않음",
  neverDrops((lv) => lv.depth) && neverDrops((lv) => lv.divine.tacticalCand) &&
  neverDrops((lv) => lv.war.attackDepth) && neverDrops((lv) => lv.war.defenseDepth) &&
  neverDrops((lv) => lv.war.safeCandidates) && neverDrops((lv) => lv.war.thinkMs));
check("21단계는 20단계보다 재귀 연쇄·안전 후보 검사가 추가됨",
  !LEVELS[19].war && LEVELS[20].war.attackDepth === 3 &&
  LEVELS[20].war.defenseDepth === 3 && LEVELS[20].war.safeCandidates === 4);
check("30단계 절대신이 전쟁 영역의 모든 탐색 상한을 사용함",
  LEVELS[29].depth === Math.max(...warLevels.map((lv) => lv.depth)) &&
  LEVELS[29].divine.tacticalCand === Math.max(...warLevels.map((lv) => lv.divine.tacticalCand)) &&
  LEVELS[29].war.attackDepth === Math.max(...warLevels.map((lv) => lv.war.attackDepth)) &&
  LEVELS[29].war.defenseDepth === Math.max(...warLevels.map((lv) => lv.war.defenseDepth)) &&
  LEVELS[29].war.safeCandidates === Math.max(...warLevels.map((lv) => lv.war.safeCandidates)));

for (let L = 11; L <= 30; L++) {
  const attack = empty();
  [[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]].forEach(([r, c]) => (attack[r][c] = 2));
  attack[0][0] = 1; attack[0][1] = 1;
  api.setBoard(attack);
  const attackMove = api.chooseAiMove(L);
  check(`${LEVELS[L - 1].name}은(는) 필승 양수를 만든다`,
    attackMove && attackMove[0] === 7 && attackMove[1] === 7,
    attackMove ? attackMove.join(",") : "착수 없음");

  const defense = empty();
  [[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]].forEach(([r, c]) => (defense[r][c] = 1));
  defense[0][0] = 2; defense[0][1] = 2;
  api.setBoard(defense);
  const defenseMove = api.chooseAiMove(L);
  check(`${LEVELS[L - 1].name}은(는) 상대의 필승 양수를 막는다`,
    defenseMove && defenseMove[0] === 7 && defenseMove[1] === 7,
    defenseMove ? defenseMove.join(",") : "착수 없음");
}

/* ---------- 마: 신계와 신들의 전쟁 일반 탐색 응답시간 ---------- */
for (let L = 11; L <= 30; L++) {
  const bd = empty();
  [[7, 7], [6, 6], [8, 8], [6, 8]].forEach(([r, c], i) => (bd[r][c] = i % 2 ? 2 : 1));
  api.setBoard(bd);
  const started = Date.now();
  const move = api.chooseAiMove(L);
  const elapsed = Date.now() - started;
  check(`${LEVELS[L - 1].name} 일반 탐색은 3초 안에 응답한다`, !!move && elapsed < 3000, `${elapsed}ms`);
}

/* ---------- 바: 한 번짜리 검사로 안 보이는 3단계 강제 연쇄 ---------- */
const chainBoard = empty();
[
  [7, 4], [7, 5], [4, 7], [5, 7],
  [8, 6], [9, 6], [10, 6], [8, 5], [9, 4],
].forEach(([r, c]) => (chainBoard[r][c] = 2));
[[11, 6], [10, 3], [7, 3], [3, 7], [6, 3], [11, 8], [4, 8], [0, 0]]
  .forEach(([r, c]) => (chainBoard[r][c] = 1));
api.setPersona(LEVELS[20].persona);
const shallowChain = api.findForcingMove(chainBoard, 2, 28);
const deepChain = api.findForcingSequenceMove(chainBoard, 2, 28, 3);
check("21단계부터 얕은 검사에 안 보이는 3단계 강제 연쇄를 찾는다",
  !shallowChain && !!deepChain,
  `얕은 수 ${shallowChain ? shallowChain.join(",") : "없음"} · 깊은 수 ${deepChain ? deepChain.join(",") : "없음"}`);

/* ---------- 사: 구석 첫수로 AI 후보를 구석에 가둘 수 없어야 한다 ---------- */
for (let L = 11; L <= 15; L++) {
  const bd = empty();
  bd[0][0] = 1;
  api.setBoard(bd);
  api.setHistory([{ r: 0, c: 0, player: 1 }]);
  const move = api.chooseAiMove(L);
  const escapedCorner = move && move[0] >= 3 && move[0] <= 11 && move[1] >= 3 && move[1] <= 11;
  check(`${LEVELS[L - 1].name}은(는) 구석 첫수에 갇히지 않고 중앙권을 고른다`,
    escapedCorner, move ? move.join(",") : "착수 없음");
}

/* ---------- 아: 실제 한 판 반복 공략에서 최종 보스가 무너지지 않는다 ---------- */
function playHeuristicMatch(level, policy, maxTurns) {
  const bd = empty();
  const moves = [];
  const cfg = LEVELS[level - 1];
  if (cfg.initiative) {
    bd[7][7] = 2;
    moves.push({ r: 7, c: 7, player: 2 });
  }

  for (let turn = 0; turn < maxTurns; turn++) {
    api.setBoard(bd);
    api.setHistory(moves);
    api.setPersona(policy);
    const blackMove = !cfg.initiative && turn === 0
      ? [0, 0]
      : api.orderedCandidates(bd, 1, 16)[0];
    if (!blackMove) return { winner: 0, plies: moves.length };
    bd[blackMove[0]][blackMove[1]] = 1;
    moves.push({ r: blackMove[0], c: blackMove[1], player: 1 });
    if (api.findWinningLine(bd, blackMove[0], blackMove[1], 1)) {
      return { winner: 1, plies: moves.length };
    }

    api.setBoard(bd);
    api.setHistory(moves);
    const whiteMove = api.chooseAiMove(level);
    if (!whiteMove) return { winner: 0, plies: moves.length };
    bd[whiteMove[0]][whiteMove[1]] = 2;
    moves.push({ r: whiteMove[0], c: whiteMove[1], player: 2 });
    if (api.findWinningLine(bd, whiteMove[0], whiteMove[1], 2)) {
      return { winner: 2, plies: moves.length };
    }
  }
  return { winner: 0, plies: moves.length };
}

const cornerPolicy = { defBias: 0.55, forkWeight: 2.2, centerWeight: 0 };
const patientPolicy = { defBias: 1.5, forkWeight: 1.5, centerWeight: 0 };
const oldFinalMatch = playHeuristicMatch(15, cornerPolicy, 60);
check("오목신은 구석 시작 반복 공략 한 판을 끝까지 방어한다",
  oldFinalMatch.winner !== 1, `승자 ${oldFinalMatch.winner || "없음"} · ${oldFinalMatch.plies}수`);
const finalMatch = playHeuristicMatch(20, patientPolicy, 24);
check("천원신은 후공형 반복 공략 한 판을 끝까지 방어한다",
  finalMatch.winner !== 1, `승자 ${finalMatch.winner || "없음"} · ${finalMatch.plies}수`);

console.log("\n===== 판정 =====");
t.forEach((s) => console.log("  " + s));
const failed = t.filter((s) => s.startsWith("X")).length;
console.log(failed ? `\n실패 ${failed}개` : "\n전부 통과");
process.exit(failed ? 1 : 0);
