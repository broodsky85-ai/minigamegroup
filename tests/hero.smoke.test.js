// hero.html 스모크 테스트 — jsdom으로 실제 DOM을 띄우고 1장을 끝까지 진행시킨다.
// 데이터 무결성(도트 격자, 지도 크기, 유닛 배치, 죽은 플래그)도 여기서 함께 잡는다.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "hero.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

// jsdom에는 canvas가 없다. getContext가 null을 뱉으며 내는 잡음만 걸러낸다.
const { VirtualConsole } = require("jsdom");
const vc = new VirtualConsole();
vc.on("jsdomError", err => {
  if (!/getContext|scrollTo/.test(err.message)) console.error(err.message);
});

const dom = new JSDOM(html, {
  url: "https://example.test/hero.html",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc
});
const { window } = dom;
const doc = window.document;
const $ = id => doc.getElementById(id);
const ev = code => window.eval(code);
const fail = [];
const ok = m => console.log("  ok  " + m);
const check = (cond, msg) => { if (cond) ok(msg); else { fail.push(msg); console.log("  FAIL " + msg); } };

(async () => {
  console.log("[1] 타이틀 화면");
  check($("title").classList.contains("on"), "타이틀 화면이 먼저 보인다");
  check($("btnCont").disabled === true, "저장이 없으면 이어하기가 잠긴다");
  check(ev("CHAPTERS.length") >= 5, "챕터가 " + ev("CHAPTERS.length") + "장 들어 있다");

  console.log("[2] 도트 데이터 무결성");
  const badSpr = ev(`(() => {
    const bad = [];
    const all = Object.assign({}, SPR, FACE);
    for (const k in all) {
      const rows = all[k];
      if (rows.length !== 16) bad.push(k + ": " + rows.length + "행");
      rows.forEach((r, i) => { if (r.length !== 16) bad.push(k + "[" + i + "]: " + r.length + "자"); });
    }
    return bad;
  })()`);
  check(badSpr.length === 0, "스프라이트·초상화가 전부 16×16 (" + (badSpr.join(", ") || "이상 없음") + ")");

  const badPal = ev(`(() => {
    const bad = [];
    for (const id in CAST) {
      const c = CAST[id];
      if (!CLASSES[c.cls]) { bad.push(id + ": 없는 병종 " + c.cls); continue; }
      if (!P[c.pal]) bad.push(id + ": 없는 팔레트 " + c.pal);
      if (c.face && !FACE[c.face]) bad.push(id + ": 없는 얼굴 " + c.face);
      if (c.face && !FP[c.fpal]) bad.push(id + ": 없는 얼굴 팔레트 " + c.fpal);
    }
    return bad;
  })()`);
  check(badPal.length === 0, "모든 배역이 실재하는 병종·팔레트를 가리킨다 (" + (badPal.join(", ") || "이상 없음") + ")");

  console.log("[3] 지도와 배치");
  const badMap = ev(`(() => {
    const bad = [];
    CHAPTERS.forEach(ch => {
      if (ch.map.length !== H) bad.push(ch.id + "장: " + ch.map.length + "행");
      ch.map.forEach((r, y) => { if (r.length !== W) bad.push(ch.id + "장 " + y + "행: " + r.length + "칸"); });
      ch.map.forEach((r, y) => [...r].forEach((c, x) => { if (!TERRAIN[c]) bad.push(ch.id + "장 (" + x + "," + y + "): 모르는 지형 " + c); }));
    });
    return bad;
  })()`);
  check(badMap.length === 0, "모든 지도가 14×10이고 아는 지형만 쓴다 (" + (badMap.join(", ") || "이상 없음") + ")");

  const badPos = ev(`(() => {
    const bad = [];
    CHAPTERS.forEach(ch => {
      const seen = new Set();
      const all = [].concat(ch.allies || [], ch.npcs || [], ch.foes || [], ch.summons || [],
                            ch.extraFoe ? [ch.extraFoe.unit] : []);
      all.forEach(u => {
        if (!CAST[u.id]) { bad.push(ch.id + "장: 모르는 배역 " + u.id); return; }
        const t = ch.map[u.y] && ch.map[u.y][u.x];
        if (t === undefined) { bad.push(ch.id + "장 " + u.id + ": 지도 밖 (" + u.x + "," + u.y + ")"); return; }
        if (TERRAIN[t] && TERRAIN[t].block) bad.push(ch.id + "장 " + u.id + ": 못 지나는 칸 " + t + " (" + u.x + "," + u.y + ")");
        const k = u.x + "," + u.y;
        if (seen.has(k)) bad.push(ch.id + "장: " + k + " 에 둘이 겹침");
        seen.add(k);
      });
    });
    return bad;
  })()`);
  check(badPos.length === 0, "모든 유닛이 겹치지 않고 통행 가능한 칸에 선다 (" + (badPos.join(", ") || "이상 없음") + ")");

  console.log("[4] 새로 시작 → 챕터 목록");
  $("btnNew").click();
  check($("chapters").classList.contains("on"), "챕터 화면으로 전환된다");
  const cards = [...doc.querySelectorAll(".chcard")];
  check(cards.length === ev("CHAPTERS.length"), "챕터 카드가 " + cards.length + "장 렌더된다");
  check(!cards[0].classList.contains("locked"), "1장은 열려 있다");
  check(cards[1].classList.contains("locked"), "2장은 잠겨 있다");

  console.log("[5] 1장 진입 — 대사와 선택");
  ev("startChapter(0)");
  check($("battle").classList.contains("on"), "전투 화면으로 전환된다");
  check(ev("TALK.open") === true, "도입 대사가 뜬다");
  check(/에일드/.test($("barTitle").textContent), "장 제목이 상단에 붙는다");
  check(ev("skipTalk()") === "choice", "대사를 넘기면 선택지에서 멈춘다");
  const opts = [...doc.querySelectorAll(".copt")];
  check(opts.length === 2, "선택지가 두 개 렌더된다");
  check(/대피/.test(opts[0].textContent), "첫 선택지가 마을 사람 대피다");
  opts[0].click();
  check(ev("G.flags.has('saved_villagers')") === true, "고른 선택이 플래그로 남는다");
  check(ev("skipTalk()") === "closed", "선택 뒤 대사가 끝까지 흐른다");
  check(ev("TALK.open") === false, "대사창이 닫힌다");

  console.log("[6] 전투 시작 상태");
  check(ev("G.turn") === 1 && ev("G.side") === "'ally'".slice(1, -1), "1턴 아군 페이즈로 시작");
  check(ev("G.units.filter(u=>u.side==='ally').length") === 2, "아군 둘로 시작 (아르덴·가르트)");
  check(ev("G.units.filter(u=>u.side==='foe').length") === 4, "적 넷이 배치된다");
  check(ev("movable(G.units[0]).size") > 1, "아르덴의 이동 가능 칸이 계산된다");
  check(ev("G.units.find(u=>u.id==='arden').maxhp") === 26, "1레벨 아르덴의 체력이 기본값 26");

  console.log("[7] 무기 상성과 지형");
  check(ev("tri({wpn:'sword'},{wpn:'axe'})") === 1, "검은 도끼에 유리");
  check(ev("tri({wpn:'axe'},{wpn:'lance'})") === 1, "도끼는 창에 유리");
  check(ev("tri({wpn:'lance'},{wpn:'sword'})") === 1, "창은 검에 유리");
  check(ev("tri({wpn:'sword'},{wpn:'lance'})") === -1, "뒤집으면 불리하다");
  check(ev("tri({wpn:'magic'},{wpn:'sword'})") === 0, "마법은 상성 밖");
  check(ev("T_('T').avo") === 20 && ev("T_('^').cost") === 3, "숲은 회피 +20, 산은 이동비 3");

  console.log("[8] 「자비 없음」 — 아르덴이 사람 악당을 칠 때만");
  check(ev("mercy({id:'arden'},{human:true,evil:true})") === true, "아르덴 → 사람 악당: 발동");
  check(ev("mercy({id:'garth'},{human:true,evil:true})") === false, "가르트 → 사람 악당: 발동 안 함");
  check(ev("mercy({id:'arden'},{human:true,evil:false})") === false, "악당이 아니면 발동 안 함");
  check(ev("mercy({id:'arden'},{human:false,evil:true})") === false, "마물에게는 발동 안 함");

  // 3장의 실제 유닛으로 배수와 반격 차단을 확인한다
  ev("SAVE.cleared = 3; startChapter(2); skipTalk()");
  const mercyCheck = ev(`(() => {
    const a = G.units.find(u => u.id === 'arden');
    const g = G.units.find(u => u.id === 'garth');
    const m = G.units.find(u => u.cls === 'merc');
    a.x = m.x - 1; a.y = m.y;
    g.x = m.x + 1; g.y = m.y;
    const fa = forecast(a, m), fg = forecast(g, m);
    return { mercy: fa.mercy, arden: fa.dmg, garth: fg.dmg,
             counterA: canCounter(a, m), counterG: canCounter(g, m),
             human: m.human, evil: m.evil };
  })()`);
  check(mercyCheck.human && mercyCheck.evil, "용병은 사람이고 악당으로 표시된다");
  check(mercyCheck.mercy === true, "아르덴의 예측에 자비 없음이 뜬다");
  check(mercyCheck.counterA === false, "자비 없음이 걸리면 반격을 받지 않는다");
  check(mercyCheck.counterG === true, "같은 상대라도 가르트는 반격을 받는다");
  check(doc.querySelectorAll("#mercyTag").length === 0, "예측 패널은 대상 지정 전에는 비어 있다");

  console.log("[9] 3장 도입 — 아르덴의 두 얼굴");
  check(ev("G.units.filter(u=>u.evil).length") === 7, "3장 적 일곱이 전부 사람 악당이다");
  check(ev("G.units.find(u=>u.boss).id") === "haiden", "보스는 하이덴 남작");
  check(ev("G.ch.win.type") === "boss", "승리 조건이 보스 격파");

  console.log("[10] 승리 → 저장 → 해금");
  ev("startChapter(0); skipTalk()");
  ev("document.querySelectorAll('.copt')[1].click()");
  ev("skipTalk()");
  check(ev("G.flags.has('struck_first')") === true, "다른 선택지도 플래그를 남긴다");
  check(ev("G.buff") === 3, "「지금 친다」는 첫 턴 위력 +3을 준다");
  ev("G.units.filter(u=>u.side==='foe').forEach(u=>{u.hp=0;u.alive=false}); checkEnd()");
  check(ev("TALK.open") === true, "적을 전멸시키면 종료 대사가 뜬다");
  ev("skipTalk()");
  check($("result").classList.contains("on"), "결과 화면으로 넘어간다");
  check($("rTitle").textContent === "승리", "승리로 판정된다");
  const saved = JSON.parse(window.localStorage.getItem("hero-oath-v1"));
  check(saved.cleared >= 1, "1장 클리어가 저장된다");
  check(saved.flags.indexOf("struck_first") >= 0, "선택이 저장에 남는다");

  console.log("[11] 패배 조건 — 아르덴이 쓰러지면 끝");
  ev("startChapter(0); skipTalk(); document.querySelectorAll('.copt')[0].click(); skipTalk()");
  ev("const a = G.units.find(u=>u.id==='arden'); a.hp = 0; a.alive = false; checkEnd()");
  check($("result").classList.contains("on"), "패배 화면으로 넘어간다");
  check($("rTitle").textContent === "패배", "패배로 판정된다");
  check(/아르덴/.test($("rSub").textContent), "무엇 때문에 졌는지 알려준다");

  console.log("[12] 일행의 대화 — 나란히 서면 열린다");
  ev("startChapter(0); skipTalk(); document.querySelectorAll('.copt')[0].click(); skipTalk()");
  const supBefore = ev("SAVE.supports.length");
  ev(`(() => {
    const a = G.units.find(u => u.id === 'arden');
    const g = G.units.find(u => u.id === 'garth');
    g.x = a.x + 1; g.y = a.y;
    checkSupports(a);
  })()`);
  check(ev("TALK.open") === true, "인접하면 대화가 열린다");
  check(ev("SAVE.supports.length") === supBefore + 1, "본 대화가 저장에 수집된다");
  ev("skipTalk()");
  ev(`(() => {
    const a = G.units.find(u => u.id === 'arden');
    const g = G.units.find(u => u.id === 'garth');
    g.x = a.x + 1; g.y = a.y;
    checkSupports(a);
  })()`);
  check(ev("TALK.open") === false, "같은 대화는 두 번 열리지 않는다");

  console.log("[13] 죽은 데이터 검사");
  const deadFlags = ev(`(() => {
    const set = new Set();
    CHAPTERS.forEach(ch => {
      [].concat(ch.intro || [], ch.outro || []).forEach(l => {
        if (l.choice) l.choice.opts.forEach(o => { if (o.flag) set.add(o.flag); });
      });
    });
    set.add('everyone_home'); set.add('someone_fell');
    return EPILOGUES.filter(e => !set.has(e.flag)).map(e => e.flag);
  })()`);
  check(deadFlags.length === 0, "아무도 세우지 않는 후일담 플래그가 없다 (" + (deadFlags.join(", ") || "이상 없음") + ")");

  const badSup = ev(`SUPPORTS.filter(s => !CAST[s.a] || !CAST[s.b] ||
    !s.lines.every(l => !l.w || CAST[l.w])).map(s => s.key)`);
  check(badSup.length === 0, "일행의 대화가 실재하는 배역만 부른다 (" + (badSup.join(", ") || "이상 없음") + ")");

  const badSpeaker = ev(`(() => {
    const bad = new Set();
    const walk = ls => (ls || []).forEach(l => {
      if (l.choice) l.choice.opts.forEach(o => walk(o.then));
      else if (l.w && !CAST[l.w]) bad.add(l.w);
    });
    CHAPTERS.forEach(ch => {
      walk(ch.intro); walk(ch.outro); walk(ch.retreatLines);
      (ch.triggers || []).forEach(t => walk(t.lines));
    });
    return [...bad];
  })()`);
  check(badSpeaker.length === 0, "모든 대사의 화자가 배역표에 있다 (" + (badSpeaker.join(", ") || "이상 없음") + ")");

  const dupKeys = ev(`(() => {
    const seen = new Set(), dup = [];
    SUPPORTS.forEach(s => { if (seen.has(s.key)) dup.push(s.key); seen.add(s.key); });
    EPILOGUES.forEach(e => { if (seen.has(e.flag)) dup.push(e.flag); seen.add(e.flag); });
    return dup;
  })()`);
  check(dupKeys.length === 0, "대화 키와 후일담 플래그에 중복이 없다");

  console.log("[14] 회상록");
  ev("openMemoir('title')");
  check($("memoir").classList.contains("on"), "회상록이 열린다");
  const epCells = [...doc.querySelectorAll("#epList .mi")];
  const spCells = [...doc.querySelectorAll("#spList .mi")];
  check(epCells.length === ev("EPILOGUES.length"), "후일담 " + epCells.length + "종이 모두 자리한다");
  check(spCells.length === ev("SUPPORTS.length"), "일행의 대화 " + spCells.length + "종이 모두 자리한다");
  check(spCells.filter(c => !c.classList.contains("locked")).length === ev("SAVE.supports.length"),
    "본 대화만 공개된다");
  check(epCells.filter(c => c.classList.contains("locked")).length > 0, "못 본 후일담은 ??? 로 잠겨 있다");

  console.log("[15] 6장 — 선택이 적 수를 바꾼다");
  const foeCount = pick => {
    ev("SAVE.cleared = 9; startChapter(5); skipTalk()");
    ev(`document.querySelectorAll('.copt')[${pick}].click()`);
    ev("skipTalk()");
    return ev("G.units.filter(u=>u.side==='foe').length");
  };
  const obeyed = foeCount(0);
  check(ev("G.flags.has('obeyed_kairen')"), "명령을 따르면 obeyed_kairen");
  const defied = foeCount(1);
  check(ev("G.flags.has('defied_kairen')"), "명령을 어기면 defied_kairen");
  check(ev("G.flags.has('obeyed_kairen')") === false, "갈림길의 반대쪽 플래그는 지워진다");
  check(defied === obeyed + 2, "좌익으로 가면 적이 둘 늘어난다 (" + obeyed + " → " + defied + ")");
  check(ev("G.units.some(u=>u.side==='ally' && u.id==='kairen')"), "6장에서는 카이렌이 손님으로 아군에 선다");

  console.log("[16] 7장 — 생존 승리 조건");
  ev("SAVE.cleared = 9; startChapter(6); skipTalk()");
  check(ev("G.ch.win.type") === "survive", "7장은 생존 조건이다");
  check(ev("G.ch.win.turns") === 8, "여덟 턴을 버텨야 한다");
  check(/남은 8턴/.test($("objLabel").textContent), "남은 턴이 목표에 표시된다");
  ev("G.turn = 5; refresh()");
  check(/남은 4턴/.test($("objLabel").textContent), "턴이 지나면 남은 턴이 줄어든다");
  ev("checkEnd()");
  check(ev("G.over") === false, "아직 8턴이 안 지났으면 끝나지 않는다");
  ev("G.turn = 9; checkEnd()");
  check(ev("TALK.open") === true, "여덟 턴을 버티면 종료 대사가 뜬다");

  console.log("[17] 10장 — 카이렌에게는 자비 없음이 걸리지 않는다");
  ev("SAVE.cleared = 9; startChapter(9); skipTalk()");
  ev("document.querySelectorAll('.copt')[0].click(); skipTalk()");
  const k = ev(`(() => {
    const a = G.units.find(u => u.id === 'arden');
    const kk = G.units.find(u => u.id === 'kairen');
    a.x = kk.x; a.y = kk.y + 1;
    const f = forecast(a, kk);
    return { human: kk.human, evil: kk.evil, boss: kk.boss, mercy: f.mercy, counter: canCounter(a, kk) };
  })()`);
  check(k.boss === true, "10장의 보스는 카이렌");
  check(k.human === true, "카이렌은 사람이다");
  check(k.evil === false, "그러나 악당으로 표시돼 있지 않다 — 착한 척을 한 적이 없다");
  check(k.mercy === false, "그래서 「자비 없음」이 걸리지 않는다");
  check(k.counter === true, "카이렌은 정면으로 반격해 온다");

  console.log("[18] 1장부터 10장까지 완주");
  const resolveTalks = () => {
    let guard = 0;
    while (ev("TALK.open") && guard++ < 40) {
      if (ev("skipTalk()") === "choice") ev("document.querySelectorAll('.copt')[0].click()");
    }
    return guard < 40;
  };
  window.localStorage.clear();
  ev("SAVE = loadSave(); G.flags = new Set(); G.roster = {}; G.fell = new Set()");
  let walked = 0;
  const total = ev("CHAPTERS.length");
  for (let i = 0; i < total; i++) {
    ev("startChapter(" + i + ")");
    if (!resolveTalks()) { check(false, (i + 1) + "장 도입 대사가 끝나지 않는다"); break; }
    const allies = ev("G.units.filter(u=>u.side==='ally'||u.side==='npc').length");
    const foes = ev("G.units.filter(u=>u.side==='foe').length");
    if (allies < 2 || foes < 1) { check(false, (i + 1) + "장 배치가 비었다 (아군 " + allies + " 적 " + foes + ")"); break; }
    ev(`(() => {
      if (G.ch.win.type === 'survive') G.turn = G.ch.win.turns + 1;
      else G.units.filter(u => u.side === 'foe').forEach(u => { u.hp = 0; u.alive = false; });
      checkEnd();
    })()`);
    if (!resolveTalks()) { check(false, (i + 1) + "장 종료 대사가 끝나지 않는다"); break; }
    if (ev("SAVE.cleared") !== i + 1) { check(false, (i + 1) + "장 클리어가 기록되지 않는다"); break; }
    walked++;
  }
  check(walked === total, "열 장을 처음부터 끝까지 완주한다 (" + walked + "/" + total + "장)");
  check($("rTitle").textContent === "여명", "마지막 장을 끝내면 엔딩이 뜬다");
  check(ev("SAVE.cleared_run") === true, "완주가 저장된다");
  check(ev("SAVE.epilogues.length") >= 5, "완주하면 후일담이 " + ev("SAVE.epilogues.length") + "개 수집된다");
  check(ev("G.flags.has('everyone_home')"), "아무도 쓰러지지 않았으면 전원 생환 후일담이 붙는다");
  const lvs = ev("PARTY_ORDER.map(p => (G.roster[p]||{lv:0}).lv)");
  check(lvs[0] >= 1 && lvs.every(v => v >= 1), "완주 뒤 일행 레벨이 남는다 (" + lvs.join("/") + ")");

  console.log("");
  console.log(fail.length ? `실패 ${fail.length}건: ` + fail.join(" / ") : "전부 통과");
  window.close();
  process.exit(fail.length ? 1 : 0);
})();
