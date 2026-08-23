/*
 * 오목 챌린지 — 게임 동작 검증
 *
 * jsdom으로 omok.html을 실제로 띄우고 클릭으로 게임을 둔다.
 * 실행: cd tests && npm install && node omok.game.test.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const FILE = path.join(__dirname, "..", "omok.html");
const html = fs.readFileSync(FILE, "utf8");
const levelStart = html.indexOf("const LEVELS = [");
const levelEnd = html.indexOf("\n  ];", levelStart) + 5;
const LEVELS = new Function(html.slice(levelStart, levelEnd) + "; return LEVELS;")();

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.__OMOK_TEST_FAST__ = true;
    window.scrollTo = () => {};
    window.confirm = () => true;
  },
});
const { window } = dom;
const doc = window.document;

const ok = [];
const bad = [];
function check(name, cond, extra) {
  (cond ? ok : bad).push(name + (extra ? " → " + extra : ""));
}

const $ = (id) => doc.getElementById(id);
const stones = () => doc.querySelectorAll("#board .stone").length;
const suggests = () => doc.querySelectorAll("#board .cell.suggest").length;
const lastMarks = () => doc.querySelectorAll("#board .stone.last").length;
const cell = (r, c) => doc.querySelector('#board .cell[data-r="' + r + '"][data-c="' + c + '"]');
const clock = () => new Promise((res) => setTimeout(res, 400));
function dispatchTouch(el, type, touches) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "changedTouches", { value: touches });
  el.dispatchEvent(event);
}

// ---------- 1. 초기 상태: 1단계만 해금 ----------
const cards = doc.querySelectorAll(".boss-card");
check("보스 카드 10장", cards.length === 10, cards.length + "장");
check("처음엔 9명이 잠김", doc.querySelectorAll(".boss-card.locked").length === 9);
check("1단계는 열림", !cards[0].classList.contains("locked"));
check("10단계는 잠김", cards[9].classList.contains("locked"));
check("잠긴 카드는 disabled", cards[9].disabled === true);
const initialTraitMismatches = Array.from(cards).flatMap((card, i) =>
  card.querySelector(".boss-trait").textContent === "성향 · " + LEVELS[i].tag ? [] : [i + 1]);
check("잠긴 보스를 포함해 인간계 성향 공개", initialTraitMismatches.length === 0,
  initialTraitMismatches.join(", "));
const initialLockedCopyMismatches = Array.from(cards).flatMap((card, i) =>
  card.querySelector(".tagline").textContent === LEVELS[i].tagline &&
  (i === 0 || card.querySelector(".unlock-note")) ? [] : [i + 1]);
check("잠긴 보스도 전체 소개와 별도 해금 조건 표시", initialLockedCopyMismatches.length === 0,
  initialLockedCopyMismatches.join(", "));

const guideCards = Array.from(doc.querySelectorAll("#guideLevels .level-card"));
const guideMismatches = guideCards.flatMap((card, i) => {
  const lv = LEVELS[i];
  return card.querySelector(".level-tag").textContent === lv.tag &&
    card.querySelector(".level-analysis > span").textContent === lv.desc &&
    card.querySelector(".level-tip span").textContent === lv.tip ? [] : [i + 1];
});
check("공략집 30단계 성향 분석과 공략 팁 분리", guideCards.length === 30 && guideMismatches.length === 0,
  guideMismatches.join(", "));

const workerSource = window.__OMOK_TEST_BUILD_AI_WORKER_SOURCE__();
let workerSourceCompiles = true;
try { new Function(workerSource); } catch (_) { workerSourceCompiles = false; }
check("백그라운드 AI Worker에 동일한 전술 코어 포함", workerSourceCompiles &&
  workerSource.includes("CRITICAL_SCORE = 400000") &&
  workerSource.includes("findForcingSequenceMove") && workerSource.includes("self.onmessage"));
check("AI Worker 응답 유실 시 대국 정지 방지", html.includes("job.watchdog = setTimeout") &&
  html.includes("Math.max(5000, thinkBudget + 3000)") && html.includes("if (job.watchdog) clearTimeout"));

const replayMoves = [
  { r: 7, c: 7, player: 1 }, { r: 7, c: 8, player: 2 },
  { r: 6, c: 7, player: 1 }, { r: 8, c: 8, player: 2 },
];
const replay = window.__OMOK_TEST_BUILD_LOSS_REVIEW__(replayMoves);
check("패배 복기판 15×15와 전체 수순 표시", replay.querySelectorAll(".review-cell").length === 225 &&
  replay.querySelectorAll(".review-cell.black,.review-cell.white").length === replayMoves.length);
replay.querySelector('[aria-label="이전 수"]').click();
check("패배 복기 이전 수 이동", replay.querySelectorAll(".review-cell.black,.review-cell.white").length === 3 &&
  replay.querySelector(".review-status").textContent.startsWith("3/4수"));
const replayRange = replay.querySelector(".review-range");
replayRange.value = "1";
replayRange.dispatchEvent(new window.Event("input", { bubbles: true }));
check("패배 복기 슬라이더로 원하는 수순 이동", replay.querySelectorAll(".review-cell.black,.review-cell.white").length === 1 &&
  replay.querySelector(".review-status").textContent.startsWith("1/4수"));

// ---------- 2. 1단계 시작 ----------
cards[0].click();
check("대국 화면 전환", $("battleView").classList.contains("active"));
check("보스 배너에 이름", $("bossBanner").textContent.includes("새싹"));
check("대국 배너에 성향과 행동 설명", $("bossBanner").querySelector(".boss-trait").textContent === LEVELS[0].tag &&
  $("bossBanner").querySelector(".boss-behavior").textContent === LEVELS[0].tagline);
check("보드 225칸", doc.querySelectorAll("#board .cell").length === 225);
check("무료 아이템 3종은 1회씩", ["hintCount","dangerCount","futureCount"].every((id) => $(id).textContent === "1"));
check("되돌리기는 무료분 없음", $("undoCount").textContent === "0");
check("되돌릴 수가 없으면 되돌리기 비활성", $("undoBtn").disabled === true);
check("수읽기는 처음엔 활성", $("hintBtn").disabled === false);
check("자유룰과 금수 없음 안내", doc.querySelector(".rule-note").textContent.includes("장목 승리") &&
  doc.querySelector(".rule-note").textContent.includes("금수 없음"));
check("보드 확대 조절 버튼 3개", ["zoomOutBtn", "zoomResetBtn", "zoomInBtn"].every((id) => $(id)));
check("보드 기본 배율 100%", $("zoomResetBtn").textContent === "100%");
check("길게 누르는 착점 돋보기 제공", $("boardMagnifier") && $("magnifierGrid") &&
  doc.querySelector(".board-gesture-hint").textContent.includes("돋보기"));
$("zoomInBtn").click();
check("보드 확대 버튼은 125%", $("zoomResetBtn").textContent === "125%");
check("확대 시 셀 크기 적용", $("board").style.getPropertyValue("--cell").endsWith("px"));
$("zoomResetBtn").click();
check("보드 배율 초기화", $("zoomResetBtn").textContent === "100%" && $("zoomOutBtn").disabled);

// ---------- 3. 수읽기 (빈 보드에서는 중앙 한 곳만 후보다) ----------
$("hintBtn").click();
check("빈 보드 수읽기는 중앙 1곳", suggests() === 1, suggests() + "곳");
  check("수읽기 잔여 0", $("hintCount").textContent === "0");
  check("소진된 수읽기에 광고 충전 표시", $("hintBtn").classList.contains("ad-refill") && $("hintBtn").textContent.includes("광고 보고"));

// ---------- 4. 착수 → 추천 표시 사라짐, AI 응수 ----------
cell(7, 7).click();
check("착수 후 추천 표시 제거", suggests() === 0);
check("내 돌 1개", stones() === 1);
check("1~15단계 도전자는 검은돌 선공", cell(7, 7).querySelector(".stone.black") !== null &&
  $("ruleNote").textContent.includes("당신 흑 선공"));
check("1단계부터 AI 생각 연출", $("turnInfo").classList.contains("thinking") &&
  $("turnInfo").textContent.includes("다음 수를 읽는 중"));

(async () => {
  await clock();
  check("AI 응수 완료", stones() === 2, stones() + "개");
  check("Worker 미지원 환경은 동일 AI 코어로 안전 대체", $("turnInfo").dataset.engine === "main");
  check("마지막 수 표시는 항상 1개", lastMarks() === 1, lastMarks() + "개");
  check("되돌리기 활성화됨", $("undoBtn").disabled === false);
  check("착수 카운터 2", $("liveMoves").textContent === "2", $("liveMoves").textContent);
  const timeBeforePause = $("liveTime").textContent;
  window.pauseOmokGame();
  await new Promise((res) => setTimeout(res, 1100));
  check("백그라운드 동안 대국 시간 정지", $("liveTime").textContent === timeBeforePause,
    $("liveTime").textContent);
  window.resumeOmokGame();

  // ---------- 4-1. 길게 눌러 착점 돋보기 ----------
  $("board").getBoundingClientRect = () => ({ left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300 });
  const centerTouch = { clientX: 150, clientY: 150 };
  dispatchTouch(cell(7, 7), "touchstart", [centerTouch]);
  await new Promise((res) => setTimeout(res, 230));
  check("길게 누르면 착점 돋보기 표시", !$("boardMagnifier").hidden &&
    $("boardMagnifier").classList.contains("visible"));
  check("돋보기는 주변 5×5칸 표시", $("magnifierGrid").children.length === 25,
    $("magnifierGrid").children.length + "칸");
  check("이미 돌이 있는 칸은 돋보기에서 경고", $("boardMagnifier").classList.contains("invalid"));
  dispatchTouch(cell(7, 7), "touchend", []);
  check("손을 떼면 돋보기 닫힘", $("boardMagnifier").hidden);
  check("차 있는 칸에는 잘못 놓이지 않음", stones() === 2, stones() + "개");
  await new Promise((res) => setTimeout(res, 380));

  // ---------- 5. 되돌리기 — 무료분이 없고 광고 보상으로만 얻는다 ----------
  check("되돌릴 수가 생기면 광고 충전 버튼", $("undoBtn").classList.contains("ad-refill") &&
    $("undoBtn").textContent.includes("광고 보고"));
  $("undoBtn").click();
  check("충전 전에는 되돌아가지 않음", stones() === 2, stones() + "개");
  window.grantOmokItemReward("undo");
  check("광고 보상으로 되돌리기 1회 충전", $("undoCount").textContent === "1");
  $("undoBtn").click();
  check("되돌리기 후 돌 0개", stones() === 0, stones() + "개");
  check("되돌리기 후 착수 0", $("liveMoves").textContent === "0", $("liveMoves").textContent);
  check("되돌리기 잔여 0", $("undoCount").textContent === "0");
  check("되돌릴 수가 없으면 광고 버튼도 열리지 않음", $("undoBtn").disabled === true);
  check("되돌리기 안내 문구", $("turnInfo").textContent.includes("이전 차례로"));

  cell(7, 7).click();
  check("되돌린 자리에 재착수 가능", stones() === 1, stones() + "개");
  await clock();
  check("AI 다시 응수", stones() === 2);

  // ---------- 6. 반복 되돌리기에도 상태가 어긋나지 않는지 ----------
  let sane = true;
  for (let i = 0; i < 2; i++) {
    window.grantOmokItemReward("undo");   // 되돌릴 때마다 광고 한 번
    $("undoBtn").click();
    if (stones() !== Number($("liveMoves").textContent)) sane = false;
    let placed = false;
    for (let r = 5; r < 10 && !placed; r++) {
      for (let c = 5; c < 10 && !placed; c++) {
        const el = cell(r, c);
        if (!el.classList.contains("has-stone")) { el.click(); placed = true; }
      }
    }
    await clock();
    if (stones() !== Number($("liveMoves").textContent)) sane = false;
  }
  check("반복 되돌리기 후 돌 수 = 착수 수", sane);
  check("되돌리기 소진", $("undoCount").textContent === "0", "잔여 " + $("undoCount").textContent);
  // 되돌리기는 판당 광고 3회까지. 위에서 이미 3회를 썼으므로 네 번째는 거부된다.
  window.grantOmokItemReward("undo");
  check("광고 한도를 넘겨 충전되지 않음", $("undoCount").textContent === "0", "잔여 " + $("undoCount").textContent);
  check("한도 소진 안내", $("itemNote").textContent.includes("한도"));
  check("한도 소진 버튼 표시", $("undoBtn").classList.contains("ad-exhausted") &&
    !$("undoBtn").classList.contains("ad-refill"));
  check("한도 소진 후 버튼 비활성", $("undoBtn").disabled === true);
  // 수읽기는 상한이 5회로 더 넉넉하다 — 되돌리기가 소진된 뒤에도 아직 충전된다.
  window.grantOmokItemReward("hint");
  check("수읽기는 아직 충전 가능", $("hintCount").textContent === "1", "잔여 " + $("hintCount").textContent);
  $("hintBtn").click();
  check("충전한 수읽기 사용됨", $("hintCount").textContent === "0");

  $("hintBtn").click();
  check("소진 아이템은 광고 안내", $("itemNote").textContent.includes("안드로이드 배포판"));

  // ---------- 7. 실제로 1단계를 이겨본다 (AI가 막으면 재시도) ----------
  let won = false;
  for (let attempt = 0; attempt < 40 && !won; attempt++) {
    $("resetBtn").click();
    for (let c = 0; c < 5; c++) {
      const el = cell(0, c);
      if (el.classList.contains("has-stone")) break;
      el.click();
      if (!$("overlay").hidden) break;
      await clock();
      if (!$("overlay").hidden) break;
    }
    await new Promise((r) => setTimeout(r, 1300));
    if (!$("overlay").hidden && $("verdictText").textContent === "승리") won = true;
  }
  check("1단계 승리 재현", won, won ? "" : "40판 안에 못 이김");

  if (won) {
    const t = $("resultCard").textContent;
    check("승리 문구 표시", t.includes("첫 번째 관문을 통과했습니다"));
    check("해금 배지 표시", t.includes("2단계 수습생") && t.includes("해금"));
    check("아이템 미사용 표기", t.includes("미사용"));
    check("완벽한 승리 배지", t.includes("완벽한 승리"));
    check("다음 상대 버튼", t.includes("다음 상대"));
    check("기록 문구 복사 버튼", t.includes("기록 문구 복사"));
    check("승부를 낸 마지막 돌에 피니시 효과", doc.querySelectorAll("#board .stone.finisher").length === 1);
    check("결과별 효과음과 BGM 정의", html.includes('playEffect("finish-" + result)') &&
      html.includes("queueResultMusic(result)"));
    check("canvas 없어도 결과 화면 뜸", $("resultCard").querySelector(".result-actions") !== null);

    $("resultCard").querySelectorAll(".btn").forEach((b) => {
      if (b.textContent.includes("상대 선택")) b.click();
    });
    check("승리 후 8명만 잠김", doc.querySelectorAll(".boss-card.locked").length === 8);
    check("1단계 카드에 클리어 표시",
      doc.querySelectorAll(".boss-card")[0].textContent.includes("클리어"));
  }

  // ---------- 8. 기록실 ----------
  doc.querySelector('.tab-btn[data-tab="records"]').click();
  check("기록실 탭 활성", $("recordsTab").classList.contains("active"));
  const rows = doc.querySelectorAll("#recordsBody tr");
  check("기록실 표 30행", rows.length === 30, rows.length + "행");
  check("요약 카드 4개", doc.querySelectorAll(".summary-card").length === 4);
  if (won) {
    check("승리 후 28행만 잠김", doc.querySelectorAll("#recordsBody tr.locked-row").length === 28);
    check("1단계 최소 수 기록됨", !rows[0].children[4].textContent.includes("—"), rows[0].children[4].textContent);
    check("1단계 무아이템 기록됨", !rows[0].children[6].textContent.includes("—"), rows[0].children[6].textContent);
  }

  // ---------- 9. 신계 심층은 보스가 천원에 선공 ----------
  window.OmokRecords.mergeSnapshot({ unlocked: 30, updatedAt: Date.now() + 1000, levels: {} });
  doc.querySelector('.tab-btn[data-tab="game"]').click();

  const realmStarts = { human: 0, divine: 10, war: 20 };
  const profileMismatches = [];
  const bannerMismatches = [];
  for (const realm of ["human", "divine", "war"]) {
    doc.querySelector('.realm-btn[data-realm="' + realm + '"]').click();
    for (let i = 0; i < 10; i++) {
      const levelIndex = realmStarts[realm] + i;
      const lv = LEVELS[levelIndex];
      const card = doc.querySelectorAll(".boss-card")[i];
      if (card.querySelector(".boss-trait").textContent !== "성향 · " + lv.tag ||
          card.querySelector(".tagline").textContent !== lv.tagline) {
        profileMismatches.push(levelIndex + 1);
      }
      card.click();
      if ($("bossBanner").querySelector(".boss-trait").textContent !== lv.tag ||
          $("bossBanner").querySelector(".boss-behavior").textContent !== lv.tagline) {
        bannerMismatches.push(levelIndex + 1);
      }
      $("backBtn").click();
    }
  }
  check("보스 카드 30장이 성향과 소개를 정확히 표시", profileMismatches.length === 0,
    profileMismatches.join(", "));
  check("대국 배너 30장이 성향과 행동 설명을 정확히 표시", bannerMismatches.length === 0,
    bannerMismatches.join(", "));

  doc.querySelector('.realm-btn[data-realm="divine"]').click();
  const divineCards = doc.querySelectorAll(".boss-card");
  check("신계 보스 카드 10장", divineCards.length === 10, divineCards.length + "장");
  divineCards[5].click();
  check("16단계 선수신 대국 진입", $("bossBanner").textContent.includes("선수신"));
  check("선수신이 천원에 먼저 둠", stones() === 1 && cell(7, 7).classList.contains("has-stone"),
    stones() + "개");
  check("선공도 착수 수에 포함", $("liveMoves").textContent === "1", $("liveMoves").textContent);
  check("보스 선공만은 되돌릴 수 없음", $("undoBtn").disabled === true);
  check("선공 안내 문구", $("itemNote").textContent.includes("흑돌로 선공") && $("itemNote").textContent.includes("천원"));
  check("16단계 보스 돌은 검은돌로 표시", cell(7, 7).querySelector(".stone.black") !== null);
  check("16단계 도전자는 백 후공으로 표시", $("turnInfo").textContent.includes("⚪") &&
    $("ruleNote").textContent.includes("당신 백 후공"));

  // ---------- 10. 신들의 전쟁은 별도 세계 10단계 ----------
  $("backBtn").click();
  doc.querySelector('.realm-btn[data-realm="war"]').click();
  const warCards = doc.querySelectorAll(".boss-card");
  check("신들의 전쟁 보스 카드 10장", warCards.length === 10, warCards.length + "장");
  check("21단계부터 30단계까지 표시", warCards[0].textContent.includes("21단계") &&
    warCards[9].textContent.includes("30단계") && warCards[9].textContent.includes("절대신"));
  warCards[0].click();
  check("21단계 전쟁의 전령 대국 진입", $("bossBanner").textContent.includes("전쟁의 전령") &&
    $("bossBanner").textContent.includes("21단계"));
  check("전쟁 보스도 천원에 먼저 둠", stones() === 1 && cell(7, 7).classList.contains("has-stone"),
    stones() + "개");

  const playerMove = Array.from(doc.querySelectorAll("#board .cell")).find((el) =>
    !el.classList.contains("has-stone"));
  playerMove.click();
  window.confirm = () => false;
  $("resetBtn").click();
  check("착수 후 재시작 취소 시 현재 대국 유지", $("battleView").classList.contains("active") && stones() === 2);
  $("backBtn").click();
  check("착수 후 상대 선택 취소 시 현재 대국 유지", $("battleView").classList.contains("active") && stones() === 2);
  window.confirm = () => true;
  $("resetBtn").click();
  await clock();
  check("AI 생각 중 재시작해도 이전 수가 뒤늦게 놓이지 않음", stones() === 1, stones() + "개");

  console.log("\n===== 통과 (" + ok.length + ") =====");
  ok.forEach((s) => console.log("  OK  " + s));
  if (bad.length) {
    console.log("\n===== 실패 (" + bad.length + ") =====");
    bad.forEach((s) => console.log("  X   " + s));
  }
  console.log("");
  process.exit(bad.length ? 1 : 0);
})();
