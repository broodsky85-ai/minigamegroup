const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const html = read("omok.html");
const activity = read("android", "app", "src", "main", "java", "com", "broodsky85", "omokchallenge", "MainActivity.java");
const manifest = read("android", "app", "src", "main", "AndroidManifest.xml");
const build = read("android", "app", "build.gradle.kts");

assert.match(html, /window\.OmokAds[\s\S]*showRewarded\(type\)/, "web game must request a native rewarded ad");
assert.match(html, /window\.grantOmokItemReward\s*=\s*function/, "web game must expose the reward callback");
assert.match(html, /window\.setOmokAdMessage\s*=\s*function/, "native ad status must be visible in the game UI");

assert.match(activity, /@JavascriptInterface\s+public void showRewarded\(String type\)/, "Android bridge must expose showRewarded");
assert.match(activity, /file:\/\/\/android_asset\/web\/omok\.html/, "Android must load the packaged game asset");
assert.match(activity, /setAllowUniversalAccessFromFileURLs\(false\)/, "local WebView must not gain universal file URL access");
assert.match(activity, /BuildConfig\.REWARDED_AD_UNIT_ID/, "rewarded ads must use the build-specific unit ID");
for (const type of ["hint", "undo", "danger", "future"]) {
  assert.ok(activity.includes(`"${type}"`), `Android bridge must allow ${type}`);
}

assert.match(manifest, /\$\{admobAppId\}/, "manifest must use the build-specific AdMob app ID");
assert.match(manifest, /android\.permission\.INTERNET/, "ads require internet permission");
assert.match(build, /play-services-ads:25\.4\.0/, "Google Mobile Ads dependency must be pinned");
assert.match(build, /ca-app-pub-3940256099942544\/5224354917/, "debug builds must use Google's rewarded test unit");
assert.match(build, /ca-app-pub-7962806628383813\/6058105442/, "release builds must use the production rewarded unit");
assert.match(build, /ca-app-pub-7962806628383813~6236666471/, "release builds must use the production AdMob app ID");
assert.match(build, /include\("\*\.html"\)/, "web files must be copied into the app during preBuild");

const icon = fs.readFileSync(path.join(root, "android", "app", "src", "main", "res", "drawable-nodpi", "omok_icon.png"));
assert.deepStrictEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "Android icon must be a PNG");

console.log("Android package checks passed (reward bridge, test ads, local assets, permissions, icon)");
