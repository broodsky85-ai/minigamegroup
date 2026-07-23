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

const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
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

// ---------- 1. 초기 상태: 1단계만 해금 ----------
const cards = doc.querySelectorAll(".boss-card");
check("보스 카드 10장", cards.length === 10, cards.length + "장");
check("처음엔 9명이 잠김", doc.querySelectorAll(".boss-card.locked").length === 9);
check("1단계는 열림", !cards[0].classList.contains("locked"));
check("10단계는 잠김", cards[9].classList.contains("locked"));
check("잠긴 카드는 disabled", cards[9].disabled === true);

// ---------- 2. 1단계 시작 ----------
cards[0].click();
check("대국 화면 전환", $("battleView").classList.contains("active"));
check("보스 배너에 이름", $("bossBanner").textContent.includes("새싹"));
check("보드 225칸", doc.querySelectorAll("#board .cell").length === 225);
check("아이템 4종 각 1회", ["hintCount","undoCount","dangerCount","futureCount"].every((id) => $(id).textContent === "1"));
check("되돌리기는 처음엔 비활성", $("undoBtn").disabled === true);
check("수읽기는 처음엔 활성", $("hintBtn").disabled === false);

// ---------- 3. 수읽기 (빈 보드에서는 중앙 한 곳만 후보다) ----------
$("hintBtn").click();
check("빈 보드 수읽기는 중앙 1곳", suggests() === 1, suggests() + "곳");
  check("수읽기 잔여 0", $("hintCount").textContent === "0");
  check("소진된 수읽기에 광고 충전 표시", $("hintBtn").classList.contains("ad-refill") && $("hintBtn").textContent.includes("광고 보고"));

// ---------- 4. 착수 → 추천 표시 사라짐, AI 응수 ----------
cell(7, 7).click();
check("착수 후 추천 표시 제거", suggests() === 0);
check("내 돌 1개", stones() === 1);

(async () => {
  await clock();
  check("AI 응수 완료", stones() === 2, stones() + "개");
  check("마지막 수 표시는 항상 1개", lastMarks() === 1, lastMarks() + "개");
  check("되돌리기 활성화됨", $("undoBtn").disabled === false);
  check("착수 카운터 2", $("liveMoves").textContent === "2", $("liveMoves").textContent);

  // ---------- 5. 되돌리기 ----------
  $("undoBtn").click();
  check("되돌리기 후 돌 0개", stones() === 0, stones() + "개");
  check("되돌리기 후 착수 0", $("liveMoves").textContent === "0", $("liveMoves").textContent);
  check("되돌리기 잔여 0", $("undoCount").textContent === "0");
  check("소진된 되돌리기에 광고 충전 표시", $("undoBtn").classList.contains("ad-refill") && $("undoBtn").textContent.includes("광고 보고"));
  check("소진 후 광고 충전 버튼 유지", $("undoBtn").disabled === false);
  check("되돌리기 안내 문구", $("turnInfo").textContent.includes("이전 차례로"));

  cell(7, 7).click();
  check("되돌린 자리에 재착수 가능", stones() === 1, stones() + "개");
  await clock();
  check("AI 다시 응수", stones() === 2);

  // ---------- 6. 반복 되돌리기에도 상태가 어긋나지 않는지 ----------
  let sane = true;
  for (let i = 0; i < 2; i++) {
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
  check("소진되어도 광고 충전 가능", $("undoBtn").disabled === false);

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
  check("기록실 표 15행", rows.length === 15, rows.length + "행");
  check("요약 카드 4개", doc.querySelectorAll(".summary-card").length === 4);
  if (won) {
    check("승리 후 13행만 잠김", doc.querySelectorAll("#recordsBody tr.locked-row").length === 13);
    check("1단계 최소 수 기록됨", !rows[0].children[4].textContent.includes("—"), rows[0].children[4].textContent);
    check("1단계 무아이템 기록됨", !rows[0].children[6].textContent.includes("—"), rows[0].children[6].textContent);
  }

  console.log("\n===== 통과 (" + ok.length + ") =====");
  ok.forEach((s) => console.log("  OK  " + s));
  if (bad.length) {
    console.log("\n===== 실패 (" + bad.length + ") =====");
    bad.forEach((s) => console.log("  X   " + s));
  }
  console.log("");
  process.exit(bad.length ? 1 : 0);
})();
