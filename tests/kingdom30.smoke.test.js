// kingdom30.html 스모크 테스트 — jsdom으로 실제 DOM을 띄우고 하루를 진행시킨다.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "kingdom30.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

const dom = new JSDOM(html, {
  url: "https://example.test/kingdom30.html?s=424242",
  runScripts: "dangerously",
  pretendToBeVisual: true
});
const { window } = dom;
const doc = window.document;
const $ = id => doc.getElementById(id);
const fail = [];
const ok = m => console.log("  ok  " + m);
const check = (cond, msg) => { if (cond) ok(msg); else { fail.push(msg); console.log("  FAIL " + msg); } };
const wait = ms => new Promise(r => window.setTimeout(r, ms));

(async () => {
  console.log("[1] 타이틀 화면");
  check($("title").classList.contains("on"), "타이틀 화면이 먼저 보인다");
  check(/424242/.test($("seedNote").textContent), "URL의 시드가 화면에 반영된다");
  check(/도전장/.test($("seedNote").textContent), "?s= 로 들어오면 도전장 안내가 뜬다");

  console.log("[2] 즉위");
  $("btnStart").click();
  check($("game").classList.contains("on"), "게임 화면으로 전환된다");
  check($("dayLabel").textContent.includes("1일차"), "1일차로 시작");
  check($("say").textContent.length > 10, "사건 본문이 렌더된다");
  check(!!($("cL").textContent && $("cR").textContent), "선택지 두 개가 렌더된다");
  const nums = [...$("gauges").querySelectorAll(".num")].map(n => n.textContent);
  check(nums.join(",") === "50,50,50,50", "자원 4개가 50에서 시작 (" + nums.join(",") + ")");

  console.log("[3] 선택 → 다음 날");
  const firstText = $("say").textContent;
  $("cL").click();
  check($("result").classList.contains("on"), "결과 자막이 뜬다");
  const after = [...$("gauges").querySelectorAll(".num")].map(n => +n.textContent);
  check(after.some(v => v !== 50), "선택이 자원을 바꾼다 (" + after.join(",") + ")");
  await wait(1500);
  check($("dayLabel").textContent.includes("2일차"), "하루가 지난다");
  check($("say").textContent !== firstText, "새 사건이 나온다");

  console.log("[4] 시드 재현성");
  const dom2 = new JSDOM(html, {
    url: "https://example.test/kingdom30.html?s=424242",
    runScripts: "dangerously", pretendToBeVisual: true
  });
  dom2.window.document.getElementById("btnStart").click();
  check(dom2.window.document.getElementById("say").textContent === firstText,
    "같은 운명 번호 = 같은 첫 사건");
  dom2.window.close();

  console.log("[5] 파멸 판정");
  check(window.eval("S.people = 0; deathCheck()") === "revolt", "민심 0 → 반란");
  check(window.eval("S.people = 50; S.gold = 100; deathCheck()") === "corrupt", "국고 100 → 부패");
  check(window.eval("S.gold = 50; deathCheck()") === null, "정상 범위에서는 파멸 없음");
  // 생존 엔딩은 수치가 아니라 "무엇을 선택했는가"(플래그)가 먼저 가른다
  check(window.eval("S.flags.clear(); S.flags.add('vassal_pact'); survivalEnding()") === "puppet",
    "흑랑에 도장을 넘겼으면 속국의 왕");
  check(window.eval("S.flags.clear(); S.flags.add('heukrang_war'); S.army=60; survivalEnding()") === "unify",
    "전쟁을 치르고 군을 지켰으면 정복왕");
  check(window.eval("S.flags.clear(); S.flags.add('heukrang_war'); S.army=20; survivalEnding()") !== "unify",
    "같은 전쟁이라도 군을 잃었으면 정복왕이 아니다");
  check(window.eval("S.flags.clear(); S.food=50;S.army=50;S.people=50;S.gold=50; survivalEnding()") === "golden",
    "아무 색깔도 남기지 않고 자원이 고르면 태평성대");
  check(window.eval("S.food=10; survivalEnding()") === "fragile",
    "자원 하나가 바닥이면 위태로운 왕좌");

  console.log("[6] 되돌리기 — 죽은 순간에만, 판당 한 번");
  // 죽을 수밖에 없는 상황을 만들고 실제로 선택을 눌러 죽인다
  window.eval("S.flags.clear(); S.undoUsed = false; S.day = 12; S.food = 50; S.army = 50; S.people = 50; S.gold = 50");
  const dayBefore = window.eval("S.day");
  const cardBefore = $("say").textContent;
  const goldBefore = window.eval("S.gold");
  // 어느 쪽을 고르든 죽도록 자원 하나를 벼랑 끝에 둔다
  window.eval("S.food = 1");
  const killIdx = window.eval("S.cur.choices[0].effects.food < 0 ? 0 : 1");
  window.eval(`S.cur.choices[${killIdx}].effects.food = -18`);
  (killIdx === 0 ? $("cL") : $("cR")).click();
  await wait(1500);
  check($("undoAsk").classList.contains("on"), "죽으면 되돌리기 제안이 뜬다");
  check(!$("ending").classList.contains("on"), "제안 중에는 엔딩으로 넘어가지 않는다");
  check(/굶주린 왕국/.test($("undoWhy").textContent), "무엇 때문에 죽었는지 보여준다");
  check(window.eval("choose(0); S.asking === true"), "제안이 떠 있는 동안에는 선택이 먹지 않는다");

  $("btnUndo").click();
  check(!$("undoAsk").classList.contains("on"), "되돌리면 제안이 닫힌다");
  check(window.eval("S.day") === dayBefore, "그날로 돌아간다");
  check($("say").textContent === cardBefore, "같은 사건 카드가 다시 나온다");
  check(window.eval("S.gold") === goldBefore, "자원이 선택 직전으로 복구된다");
  check(window.eval("S.undoUsed") === true, "되돌리기는 한 판에 한 번만");
  const marked = doc.querySelectorAll(".choice.fatal");
  check(marked.length === 1 && marked[0].id === (killIdx === 0 ? "cL" : "cR"),
    "죽음을 부른 선택지에 표시가 남는다");

  // 두 번째 죽음은 제안 없이 그대로 끝난다
  window.eval("S.food = 1");
  (killIdx === 0 ? $("cL") : $("cR")).click();
  await wait(1500);
  check(!$("undoAsk").classList.contains("on"), "두 번째 죽음에는 제안이 없다");
  await wait(900);   // 사망 연출 1250ms + 엔딩 전환 700ms
  check($("ending").classList.contains("on"), "두 번째 죽음은 바로 엔딩으로 간다");
  check(/굶주린 왕국/.test($("endName").textContent), "되돌린 뒤 두 번째 죽음이 엔딩으로 남는다");

  console.log("[7] 엔딩 저장/도감");
  window.eval("S.flags.clear(); S.flags.add('shrine_built'); S.flags.add('spy_refused')");
  window.eval("finish('survive')");
  await wait(900);
  check($("ending").classList.contains("on"), "엔딩 화면이 뜬다");
  check($("endName").textContent === "살아남은 왕", "엔딩 이름이 표시된다");
  const saved = JSON.parse(window.localStorage.getItem("kingdom30-v1"));
  check(saved.endings.includes("survive"), "엔딩이 localStorage에 수집된다");
  check(/왕의 일지/.test($("journal").textContent), "일지가 남는다");
  check(/그 뒤의 이야기/.test($("epilogue").textContent), "세운 플래그에 맞는 후일담이 붙는다");
  check($("epilogue").querySelectorAll("p").length === 2, "세운 플래그 수만큼만 후일담이 나온다");
  $("btnCodex2").click();
  check($("codex").classList.contains("on"), "도감으로 이동한다");
  const cells = [...doc.querySelectorAll("#codexGrid .cx")];
  const unlocked = cells.filter(c => !c.classList.contains("locked"));
  check(unlocked.length === saved.endings.length,
    "본 엔딩만 공개된다 (" + unlocked.length + "종 / 저장 " + saved.endings.length + "종)");
  check(cells.length - unlocked.length > 0, "못 본 엔딩은 ??? 로 잠겨 있다");
  check(cells.length === window.eval("ENDINGS.length"),
    "도감에 엔딩 " + cells.length + "종이 모두 자리한다");

  console.log("");
  console.log(fail.length ? `실패 ${fail.length}건: ` + fail.join(" / ") : "전부 통과");
  window.close();
  process.exit(fail.length ? 1 : 0);
})();
