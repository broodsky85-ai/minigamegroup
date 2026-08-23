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
assert.match(html, /window\.setOmokPrivacyOptionsAvailable\s*=\s*function/, "native privacy options availability must reach the settings UI");
assert.match(html, /window\.handleOmokAndroidBack\s*=\s*function/, "web game must handle Android back navigation safely");
assert.match(html, /window\.pauseOmokGame\s*=\s*function[\s\S]*window\.resumeOmokGame\s*=\s*function/,
  "web game must pause its match timer while the app is in the background");

assert.match(activity, /@JavascriptInterface\s+public void showRewarded\(String type\)/, "Android bridge must expose showRewarded");
assert.match(activity, /@JavascriptInterface\s+public void showPrivacyOptions\(\)/, "Android bridge must expose privacy options");
assert.match(activity, /file:\/\/\/android_asset\/web\/omok\.html/, "Android must load the packaged game asset");
assert.match(activity, /setAllowUniversalAccessFromFileURLs\(false\)/, "local WebView must not gain universal file URL access");
assert.match(activity, /SYSTEM_UI_FLAG_IMMERSIVE_STICKY[\s\S]*SYSTEM_UI_FLAG_FULLSCREEN[\s\S]*SYSTEM_UI_FLAG_HIDE_NAVIGATION/,
  "Android game must hide status and navigation bars in immersive mode");
assert.match(activity, /controller\.hide\(WindowInsets\.Type\.statusBars\(\) \| WindowInsets\.Type\.navigationBars\(\)\)/,
  "modern Android system bars must also be hidden");
assert.match(activity, /setTextZoom\(100\)/, "Android WebView text scale must stay at the intended mobile size");
assert.match(activity, /setVerticalScrollBarEnabled\(false\)/, "native WebView scrollbar must not cover the game");
assert.match(activity, /FLAG_KEEP_SCREEN_ON/, "the screen must stay awake during a match");
assert.match(activity, /setWebChromeClient\([\s\S]*onJsConfirm[\s\S]*result\.confirm\(\)[\s\S]*result\.cancel\(\)/,
  "Android must show the confirmation dialogs used by restart and opponent selection");
assert.match(activity, /extends ComponentActivity[\s\S]*getOnBackPressedDispatcher\(\)\.addCallback[\s\S]*handleSystemBack/,
  "Android back buttons and predictive back gestures must use the backward-compatible dispatcher");
assert.match(activity, /evaluateJavascript\([\s\S]*handleOmokAndroidBack[\s\S]*showExitConfirmation/,
  "Android back must give the web game a chance to close overlays or leave a match");
assert.match(activity, /showExitConfirmation\(\)[\s\S]*게임을 종료할까요\?[\s\S]*finish\(\)/,
  "Android back on the main screen must ask before exiting");
assert.match(activity, /onPause\(\)[\s\S]*pauseOmokGame[\s\S]*onResume\(\)[\s\S]*resumeOmokGame/,
  "Android lifecycle must pause and resume the web match timer");
assert.match(activity, /if \("file"\.equals\(uri\.getScheme\(\)\)\)[\s\S]*view\.loadUrl\(GAME_URL\)/,
  "local navigation must be forced back to omok instead of opening the minigame index");
assert.match(html, /body\.native-app \.topbar > a[\s\S]*display: none !important/,
  "the Android app must hide the web-only home link");
assert.match(html, /body\.native-app\.battle-active #battleView \.item-grid \{[\s\S]*order: 4;[\s\S]*grid-template-columns: repeat\(4/,
  "the Android battle layout must place four compact items directly before the board");
assert.match(html, /body\.native-app\.battle-active #battleView \.board-shell \{[\s\S]*order: 5;/,
  "the Android battle layout must place the board after the items");
assert.match(html, /body\.native-app\.battle-active #battleView \.board-zoom \{[\s\S]*order: 6;/,
  "the Android battle layout must place board-size controls directly after the board");
assert.match(html, /body\.native-app\.battle-active \.battle-wrap \{[^}]*padding-top: max\(44px/,
  "native battle controls must stay below temporarily visible system bars");
assert.match(html, /body\.native-app\.battle-active \{[^}]*padding-bottom: max\(44px/,
  "native battle content must stay above temporarily visible navigation bars");
assert.match(html, /#board \{[\s\S]*box-sizing: content-box;/,
  "the 15x15 grid must stay inside the wooden board border");
assert.match(activity, /BuildConfig\.REWARDED_AD_UNIT_ID/, "rewarded ads must use the build-specific unit ID");
for (const type of ["hint", "undo", "danger", "future"]) {
  assert.ok(activity.includes(`"${type}"`), `Android bridge must allow ${type}`);
}

// ---- 하단 배너 ----
// 배너는 보스 선택과 기록실에서만 뜬다. 대국 화면을 덮으면 착수를 잘못 누른다.
assert.match(activity, /@JavascriptInterface\s+public void setBannerVisible\(boolean visible\)/,
  "Android bridge must expose setBannerVisible");
assert.match(activity, /BuildConfig\.BANNER_AD_UNIT_ID/, "banner ads must use the build-specific unit ID");
assert.match(activity, /BANNER_AD_UNIT_ID\.isEmpty\(\)\) return;/,
  "an empty banner unit must skip the banner entirely instead of crashing");
assert.match(activity, /boolean show = bannerWanted && bannerLoaded/,
  "the banner must only take space once a real ad has filled it");
assert.match(activity, /bannerAdView\.pause\(\)[\s\S]*bannerAdView\.resume\(\)[\s\S]*bannerAdView\.destroy\(\)/,
  "the banner must follow the activity lifecycle");
assert.match(build, /ca-app-pub-3940256099942544\/6300978111/, "debug builds must use Google's banner test unit");

const releaseBanner = /release \{[\s\S]*?BANNER_AD_UNIT_ID", "\\"([^\\"]*)\\""/.exec(build);
assert.ok(releaseBanner, "release builds must declare a banner unit field");
assert.ok(!releaseBanner[1].startsWith("ca-app-pub-3940256099942544"),
  "release builds must never ship Google's test banner unit");

assert.match(html, /function updateBannerVisibility\(\)/, "the web game must decide when the banner shows");
assert.match(html, /window\.OmokAds\.setBannerVisible/, "the web game must tell the app to show or hide the banner");
assert.match(html, /typeof window\.OmokAds\.setBannerVisible !== "function"\) return;/,
  "calling the banner bridge must be guarded so the web build keeps working");

// ---- 명예의 전당 ----
// 이름이 바뀌면 앱과 웹이 서로를 못 찾는다. 여기서 고정한다.
assert.match(activity, /@JavascriptInterface\s+public void publishProfile\(String json\)/,
  "Android bridge must expose publishProfile");
assert.match(activity, /@JavascriptInterface\s+public void fetchProfile\(\)/,
  "Android bridge must expose fetchProfile");
assert.match(activity, /@JavascriptInterface\s+public void fetchLeaderboard\(String kind, int level\)/,
  "Android bridge must expose fetchLeaderboard");
assert.match(html, /window\.onOmokProfile\s*=\s*function/, "the game must receive its own leaderboard row");
assert.match(html, /window\.onOmokLeaderboard\s*=\s*function/, "the game must receive leaderboard rows");
assert.match(activity, /user\.isAnonymous\(\)\) \{\s*sendAccountMessage\("명예의 전당은 Google 계정/,
  "guests must not be published to the public leaderboard");
assert.match(activity, /leaderboardCollection\(\)\.document\(user\.getUid\(\)\)\.delete\(\)/,
  "deleting an account must remove its public leaderboard row");

const rules = read("firestore.rules");
assert.match(rules, /sign_in_provider != 'anonymous'/,
  "security rules must keep anonymous guests out of the public leaderboard");
assert.match(rules, /match \/leaderboard\/\{userId\}/, "security rules must cover the leaderboard collection");
assert.match(rules, /match \/levelRanks\/\{level\}\/entries\/\{userId\}/,
  "security rules must cover per-level time attack rows");
assert.match(rules, /match \/users\/\{userId\}\/records\/\{recordId\}/,
  "the existing private record backup must keep working");

assert.match(manifest, /\$\{admobAppId\}/, "manifest must use the build-specific AdMob app ID");
assert.match(manifest, /android\.permission\.INTERNET/, "ads require internet permission");
assert.match(build, /play-services-ads:25\.4\.0/, "Google Mobile Ads dependency must be pinned");
assert.match(build, /androidx\.activity:activity:1\.13\.0/, "predictive back support must use a pinned AndroidX Activity version");
assert.match(build, /user-messaging-platform:4\.0\.0/, "Google UMP dependency must be pinned");
assert.match(activity, /requestConsentInfoUpdate[\s\S]*loadAndShowConsentFormIfRequired[\s\S]*canRequestAds\(\)/,
  "ads must wait for the current UMP consent state");
assert.match(build, /versionCode = 7[\s\S]*versionName = "1\.3\.0"/,
  "the next Play upload must use version code 7 and version name 1.3.0");
assert.match(build, /ca-app-pub-3940256099942544\/5224354917/, "debug builds must use Google's rewarded test unit");
assert.match(build, /ca-app-pub-7962806628383813\/6058105442/, "release builds must use the production rewarded unit");
assert.match(build, /ca-app-pub-7962806628383813~6236666471/, "release builds must use the production AdMob app ID");
assert.match(build, /include\("omok\.html"\)/, "the omok game must be copied into the app during preBuild");
assert.doesNotMatch(build, /include\("\*\.html"\)/, "the dedicated Android app must not package the minigame index or other games");

const icon = fs.readFileSync(path.join(root, "android", "app", "src", "main", "res", "drawable-nodpi", "omok_icon.png"));
assert.deepStrictEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "Android icon must be a PNG");

console.log("Android package checks passed (reward bridge, test ads, local assets, permissions, icon)");
