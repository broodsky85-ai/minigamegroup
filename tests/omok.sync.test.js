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
