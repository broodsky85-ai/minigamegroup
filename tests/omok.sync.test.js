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
const nativeDom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "file:///android_asset/web/omok.html",
  beforeParse(window) {
    window.__OMOK_TEST_FAST__ = true;
    window.scrollTo = () => {};
    window.OmokAccount = { getStatus() {} };
    window.OmokAds = { setBannerVisible(visible) { bannerCalls.push(visible); } };
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

console.log("Omok Android layout checks passed (native shell, account gate, banner, compact battle mode)");
