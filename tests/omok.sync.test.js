const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "omok.html"), "utf8");
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://omok.test/" });
const records = dom.window.OmokRecords;

assert.ok(records && typeof records.mergeSnapshot === "function", "record sync bridge must be exposed");

const sharedWin = { moves: 21, seconds: 42, noItem: true, itemUses: 0, adRefills: 0, at: 1000 };
records.mergeSnapshot({
  unlocked: 5,
  streak: 2,
  bestStreak: 3,
  title: "인간계 정복자",
  updatedAt: 100,
  levels: { "1": { attempts: 4, wins: [sharedWin] } }
});

const merged = records.mergeSnapshot({
  unlocked: 11,
  streak: 4,
  bestStreak: 6,
  title: "신계 입문자",
  updatedAt: 200,
  levels: {
    "1": { attempts: 7, wins: [sharedWin, { moves: 19, seconds: 39, noItem: false, itemUses: 1, adRefills: 0, at: 2000 }] },
    "10": { attempts: 2, wins: [{ moves: 31, seconds: 70, noItem: true, itemUses: 0, adRefills: 0, at: 3000 }] }
  }
});

assert.strictEqual(merged.unlocked, 11, "higher unlock progress must win");
assert.strictEqual(merged.levels["1"].attempts, 7, "attempts must not double on repeated sync");
assert.strictEqual(merged.levels["1"].wins.length, 2, "duplicate wins must be removed");
assert.strictEqual(merged.levels["1"].wins[0].moves, 19, "best move record must be retained first");
assert.strictEqual(merged.bestStreak, 6, "best streak must use the maximum");
assert.strictEqual(merged.title, "신계 입문자", "newer profile choice must win");

console.log("Omok cloud merge checks passed (unlock, dedupe, attempts, streak, title)");

// 브릿지가 없는 웹에서는 로그인 선택 화면 자체가 뜨지 않아야 한다.
assert.ok(dom.window.document.getElementById("accountGate").hidden,
  "the web build must never show the account gate");

const bannerCalls = [];
const leaderboardCalls = [];
const publishCalls = [];
const onlineCalls = [];
const nativeDom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "file:///android_asset/web/omok.html",
  beforeParse(window) {
    window.__OMOK_TEST_FAST__ = true;
    window.scrollTo = () => {};
    window.OmokAccount = {
      getStatus() {},
      fetchProfile() {},
      fetchLeaderboard(kind, level) { leaderboardCalls.push({ kind, level }); },
      publishProfile(json) { publishCalls.push(json); },
    };
    window.OmokAds = { setBannerVisible(visible) { bannerCalls.push(visible); } };
    window.OmokOnline = {
      findRandom(nickname) { onlineCalls.push(["findRandom", nickname]); },
      createInvite(nickname) { onlineCalls.push(["createInvite", nickname]); },
      joinInvite(code, nickname) { onlineCalls.push(["joinInvite", code, nickname]); },
      move(r, c) { onlineCalls.push(["move", r, c]); },
      finish(winner, reason) { onlineCalls.push(["finish", winner, reason]); },
      claimTimeout() { onlineCalls.push(["claimTimeout"]); },
      leave() { onlineCalls.push(["leave"]); },
    };
  },
});
const nativeDom_window = nativeDom.window;
const nativeDoc = nativeDom.window.document;
assert.ok(nativeDoc.body.classList.contains("native-app"), "native bridge must enable the Android-only layout");

// ---- 첫 실행 로그인 선택 ----
const gate = nativeDoc.getElementById("accountGate");
assert.ok(!gate.hidden, "the app must ask how to keep records on first launch");
assert.ok(nativeDoc.getElementById("gateGoogleBtn") && nativeDoc.getElementById("gateGuestBtn"),
  "both signing in and playing without an account must be offered");
nativeDoc.getElementById("gateGuestBtn").click();
assert.ok(gate.hidden, "choosing guest play must close the gate");

// 로그인이 되면 게이트는 다시 묻지 않는다.
nativeDom_window.onOmokAccountChanged({ signedIn: true, anonymous: false, name: "테스터", email: "" });
assert.ok(gate.hidden, "a linked account must not be asked again");

// ---- 하단 배너는 대국 중에만 사라진다 ----
assert.strictEqual(bannerCalls[0], true, "the banner must be requested on the boss select screen");
bannerCalls.length = 0;
nativeDoc.querySelector(".boss-card").click();
assert.ok(nativeDoc.body.classList.contains("battle-active"), "battle must switch to the compact board-first layout");
assert.strictEqual(bannerCalls.pop(), false, "the banner must be hidden while a match is on the board");
nativeDoc.getElementById("backBtn").click();
assert.ok(!nativeDoc.body.classList.contains("battle-active"), "leaving battle must restore native navigation");
assert.strictEqual(bannerCalls.pop(), true, "leaving a match must bring the banner back");

nativeDoc.querySelector('.tab-btn[data-tab="records"]').click();
assert.strictEqual(bannerCalls.pop(), true, "the records room must show the banner");
nativeDoc.querySelector('.tab-btn[data-tab="guide"]').click();
assert.strictEqual(bannerCalls.pop(), false, "other tabs must not show the banner");

// 앱이 file:// 로 열리면 jsdom에는 localStorage가 없다(게임은 try/catch로 버틴다).
// 선택을 실제로 기억하는지는 저장이 되는 오리진에서 따로 확인한다.
const storedDom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "https://omok.test/app",
  beforeParse(window) {
    window.__OMOK_TEST_FAST__ = true;
    window.scrollTo = () => {};
    window.OmokAccount = { getStatus() {} };
  },
});
const storedGate = storedDom.window.document.getElementById("accountGate");
assert.ok(!storedGate.hidden, "the gate must open when no choice has been stored yet");
storedDom.window.document.getElementById("gateGuestBtn").click();
assert.strictEqual(storedDom.window.localStorage.getItem("omok-account-choice-v1"), "guest",
  "the choice must be remembered so the gate is asked only once");

const returningDom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "https://omok.test/app",
  beforeParse(window) {
    window.__OMOK_TEST_FAST__ = true;
    window.scrollTo = () => {};
    window.OmokAccount = { getStatus() {} };
    window.localStorage.setItem("omok-account-choice-v1", "guest");
  },
});
assert.ok(returningDom.window.document.getElementById("accountGate").hidden,
  "a returning player must not be asked again");

// ---- 전체 명예의 전당 ----
// 웹에는 순위가 없다.
nativeDoc.querySelector('.tab-btn[data-tab="records"]').click();
assert.match(dom.window.document.getElementById("hallNote").textContent, /Android 앱에서/,
  "the web build must say the public hall lives in the app");

// 게스트로 남으면 순위표가 열리지 않는다. (앞선 게이트 검사에서 연결해 둔 상태를 되돌린다)
nativeDom_window.onOmokAccountChanged({ signedIn: true, anonymous: true, name: "", email: "" });
nativeDom_window.onOmokProfile({ linked: false, nickname: "" });
assert.ok(nativeDoc.getElementById("hallControls").hidden,
  "a guest must not see the leaderboard controls");
assert.match(nativeDoc.getElementById("hallNote").textContent, /Google 계정을 연결하면/,
  "a guest must be told how to join the hall");

// 계정을 연결하면 순위표가 열린다.
nativeDom_window.onOmokAccountChanged({ signedIn: true, anonymous: false, name: "테스터", email: "" });
nativeDom_window.onOmokProfile({ linked: true, nickname: "돌부처", ok: true });
assert.ok(!nativeDoc.getElementById("hallControls").hidden, "a linked player must see the leaderboard controls");
assert.strictEqual(nativeDoc.getElementById("hallNickInput").value, "돌부처",
  "the stored nickname must be shown back");

// 서버가 준 줄만 그대로 그린다 — 지어낸 비율이나 추정치는 넣지 않는다.
nativeDom_window.onOmokLeaderboard({
  ok: true,
  kind: "level",
  rows: [
    { nickname: "천지창조", maxLevel: 30, clears: 30, noItemClears: 12, me: false },
    { nickname: "돌부처", maxLevel: 18, clears: 17, noItemClears: 3, me: true },
  ],
});
const hallRows = nativeDoc.getElementById("hallBody").querySelectorAll("tr");
assert.strictEqual(hallRows.length, 2, "every row the server returned must be drawn");
assert.strictEqual(hallRows[0].children[1].textContent, "천지창조", "the top row must keep the server order");
assert.ok(hallRows[1].classList.contains("me-row"), "my own row must be marked");
assert.strictEqual(hallRows[1].children[2].textContent, "18단계", "reached level must come from the server row");

// 타임어택으로 바꾸면 단계 선택이 열리고 표 머리도 바뀐다.
nativeDoc.getElementById("hallKindTime").click();
assert.ok(!nativeDoc.getElementById("hallLevelSelect").hidden, "time attack must let you pick a level");
nativeDom_window.onOmokLeaderboard({
  ok: true, kind: "time", level: 3,
  rows: [{ nickname: "번개", seconds: 65, moves: 11, me: false }],
});
const timeRow = nativeDoc.getElementById("hallBody").querySelector("tr");
assert.strictEqual(timeRow.children[2].textContent, "1분 05초", "time attack must show the recorded time");
assert.strictEqual(timeRow.children[3].textContent, "11수", "time attack must show the moves of that same win");

// 기록 올리기는 닉네임과 요약을 그대로 브릿지에 넘긴다.
publishCalls.length = 0;
nativeDoc.getElementById("hallNickInput").value = "돌부처";
nativeDoc.getElementById("hallPublishBtn").click();
assert.strictEqual(publishCalls.length, 1, "publishing must reach the native bridge once");
const published = JSON.parse(publishCalls[0]);
assert.strictEqual(published.nickname, "돌부처", "the chosen nickname must be sent");
assert.ok(typeof published.maxLevel === "number" && typeof published.levels === "object",
  "the payload must carry the summary the leaderboard needs");

// 너무 짧은 닉네임은 올리지 않고 그 자리에서 알린다.
publishCalls.length = 0;
nativeDoc.getElementById("hallNickInput").value = "가";
nativeDoc.getElementById("hallPublishBtn").click();
assert.strictEqual(publishCalls.length, 0, "an invalid nickname must never be published");
assert.match(nativeDoc.getElementById("hallNote").textContent, /2자 이상/,
  "an invalid nickname must say why");

// 아직 아무도 없으면 빈 표 대신 안내를 보여준다.
nativeDom_window.onOmokLeaderboard({ ok: true, kind: "level", rows: [] });
assert.ok(nativeDoc.getElementById("hallTableWrap").hidden, "an empty leaderboard must not draw an empty table");
assert.match(nativeDoc.getElementById("hallNote").textContent, /아직 올라온 기록이 없습니다/,
  "an empty leaderboard must say so plainly");

console.log("Omok hall of fame checks passed (guest gate, server rows only, time attack)");

// ---- 온라인 대국 ----
// 웹에는 온라인이 없다.
assert.ok(dom.window.document.getElementById("onlineEnterBtn"), "the entry button exists everywhere");

// 계정을 연결하고 닉네임이 있어야 시작할 수 있다.
nativeDoc.querySelector('.tab-btn[data-tab="game"]').click();
nativeDoc.getElementById("onlineEnterBtn").click();
assert.ok(nativeDoc.getElementById("onlineView").classList.contains("active"),
  "the online lobby must open");
assert.strictEqual(bannerCalls.pop(), false, "the online lobby is not one of the banner screens");

onlineCalls.length = 0;
nativeDom_window.onOmokAccountChanged({ signedIn: true, anonymous: true, name: "", email: "" });
nativeDoc.getElementById("onlineRandomBtn").click();
assert.strictEqual(onlineCalls.length, 0, "a guest must not be able to start an online match");
assert.match(nativeDoc.getElementById("onlineStatus").textContent, /Google 계정/,
  "a guest must be told why online play is unavailable");

nativeDom_window.onOmokAccountChanged({ signedIn: true, anonymous: false, name: "테스터", email: "" });
nativeDom_window.onOmokProfile({ linked: true, nickname: "돌부처", ok: true });
nativeDoc.getElementById("onlineRandomBtn").click();
assert.deepStrictEqual(onlineCalls.pop(), ["findRandom", "돌부처"],
  "random matchmaking must carry my nickname");
nativeDoc.getElementById("onlineInviteBtn").click();
assert.deepStrictEqual(onlineCalls.pop(), ["createInvite", "돌부처"], "invites must carry my nickname");

// 코드는 여섯 자리여야 한다.
onlineCalls.length = 0;
nativeDoc.getElementById("onlineCodeInput").value = "AB1";
nativeDoc.getElementById("onlineJoinBtn").click();
assert.strictEqual(onlineCalls.length, 0, "a short invite code must not be sent");
nativeDoc.getElementById("onlineCodeInput").value = "abc123";
nativeDoc.getElementById("onlineJoinBtn").click();
assert.deepStrictEqual(onlineCalls.pop(), ["joinInvite", "ABC123", "돌부처"],
  "invite codes must be sent in upper case");

// 대국이 시작되면 보드로 넘어간다.
const started = {
  phase: "playing", myColor: "black", myTurn: true, opponent: "번개",
  turnSeconds: 60, adPauseLeft: 3, adPaused: null,
  turnStartedAt: Date.now(), now: Date.now(), moves: [],
};
nativeDom_window.onOmokMatchState(started);
assert.ok(nativeDoc.getElementById("battleView").classList.contains("active"),
  "an online match must open the board");
assert.ok(!nativeDoc.getElementById("onlineBar").hidden, "the online bar must show who I am playing");
assert.match(nativeDoc.getElementById("onlineWho").textContent, /번개/, "the opponent name must show");
assert.strictEqual(bannerCalls.pop(), false, "the banner must stay down during an online match");

// 온라인에서는 되돌리기를 쓸 수 없다.
assert.ok(nativeDoc.getElementById("undoBtn").disabled, "undo must be disabled online");

// 내 차례에 두면 서버로 보낸다. 화면은 서버가 준 수순으로만 그린다.
onlineCalls.length = 0;
nativeDoc.querySelector('.cell[data-r="7"][data-c="7"]').click();
assert.deepStrictEqual(onlineCalls.pop(), ["move", 7, 7], "my stone must be sent to the server");
assert.strictEqual(nativeDoc.querySelectorAll("#board .stone").length, 0,
  "the board must wait for the server instead of drawing the stone locally");

// 서버가 수순을 돌려주면 그때 그린다.
nativeDom_window.onOmokMatchState({
  ...started, myTurn: false,
  moves: [{ r: 7, c: 7, mine: true }],
});
assert.strictEqual(nativeDoc.querySelectorAll("#board .stone").length, 1,
  "the server's move list must be drawn");

// 상대 차례에는 둘 수 없다.
onlineCalls.length = 0;
nativeDoc.querySelector('.cell[data-r="8"][data-c="8"]').click();
assert.strictEqual(onlineCalls.length, 0, "I must not be able to play on my opponent's turn");

// 광고를 보는 동안에는 시계가 멈췄다고 알린다.
nativeDom_window.onOmokMatchState({
  ...started, myTurn: false, adPaused: "opponent",
  moves: [{ r: 7, c: 7, mine: true }],
});
assert.match(nativeDoc.getElementById("onlineClock").textContent, /광고/,
  "a paused clock must say the opponent is watching an ad");

// 판이 끝나면 결과가 뜬다.
nativeDom_window.onOmokMatchState({
  ...started, phase: "done", result: "win", endReason: "resign",
  moves: [{ r: 7, c: 7, mine: true }],
});
assert.match(nativeDoc.getElementById("turnInfo").textContent, /승리/, "the result must be shown");
assert.match(nativeDoc.getElementById("turnInfo").textContent, /기권/, "the reason must be shown");

// ---- 온라인 등급 ----
// 상대 등급이 대국 바에 뜨고, 등급이 걸리지 않는 판은 그렇다고 알린다.
nativeDom_window.onOmokMatchState({
  ...started, myTurn: true, ranked: true, myRating: 1450, opponentRating: 1620,
  moves: [{ r: 7, c: 7, mine: true }],
});
assert.match(nativeDoc.getElementById("onlineWho").textContent, /명인/,
  "the opponent's tier must be shown from their rating");

nativeDom_window.onOmokMatchState({
  ...started, myTurn: true, ranked: false, myRating: 1450, opponentRating: 1200,
  moves: [{ r: 7, c: 7, mine: true }],
});
assert.match(nativeDoc.getElementById("onlineWho").textContent, /연습/,
  "an unranked (friend) match must say so");

// 등급 순위표
nativeDoc.querySelector('.tab-btn[data-tab="records"]').click();
nativeDoc.getElementById("hallKindRating").click();
nativeDom_window.onOmokLeaderboard({
  ok: true, kind: "rating",
  rows: [
    { nickname: "절대신", rating: 2050, me: false },
    { nickname: "돌부처", rating: 1310, me: true },
  ],
});
const ratingRows = nativeDoc.getElementById("hallBody").querySelectorAll("tr");
assert.strictEqual(ratingRows[0].children[2].textContent, "신선",
  "2000점 이상은 가장 높은 등급으로 보인다");
assert.strictEqual(ratingRows[1].children[2].textContent, "숙련자",
  "등급 이름은 점수 구간을 따른다");
assert.strictEqual(ratingRows[1].children[3].textContent, "1310",
  "점수는 서버 값 그대로 보여준다");

// 온라인 시계(setInterval)가 남으면 테스트 프로세스가 끝나지 않는다. 판을 닫아 정리한다.
nativeDom_window.onOmokMatchState({
  ...started, phase: "done", result: "win", endReason: "five",
  moves: [{ r: 7, c: 7, mine: true }],
});

console.log("Omok rating checks passed (tiers, unranked friend match, rating board)");

console.log("Omok online match checks passed (guest gate, invite codes, server-driven board, ad pause)");

console.log("Omok Android layout checks passed (native shell, account gate, banner, compact battle mode)");

// jsdom 창을 닫지 않으면 남은 타이머 때문에 node가 그대로 떠 있는다.
[dom, nativeDom, storedDom, returningDom].forEach((instance) => {
  try { instance.window.close(); } catch (e) { /* 이미 닫혔으면 그만이다 */ }
});
