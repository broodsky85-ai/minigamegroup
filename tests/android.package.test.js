const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const html = read("omok.html");
const activity = read("android", "app", "src", "main", "java", "com", "broodsky85", "omokchallenge", "MainActivity.java");
const manifest = read("android", "app", "src", "main", "AndroidManifest.xml");
const build = read("android", "app", "build.gradle.kts");
const privacy = read("privacy.html");

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

// ---- 온라인 대국 ----
const online = read("android", "app", "src", "main", "java", "com", "broodsky85", "omokchallenge", "OnlineMatch.java");
assert.match(activity, /@JavascriptInterface\s+public void findRandom\(String nickname\)/,
  "Android bridge must expose random matchmaking");
assert.match(activity, /@JavascriptInterface\s+public void createInvite\(String nickname\)/,
  "Android bridge must expose friend invites");
assert.match(activity, /@JavascriptInterface\s+public void joinInvite\(String code, String nickname\)/,
  "Android bridge must let a friend join by code");
assert.match(activity, /@JavascriptInterface\s+public void move\(int r, int c\)/,
  "Android bridge must relay a stone to the server");
assert.match(html, /window\.onOmokMatchState\s*=\s*function/, "the game must receive live match state");
assert.match(html, /window\.onOmokMatchMessage\s*=\s*function/, "the game must receive match messages");
assert.match(html, /window\.OmokOnline && typeof window\.OmokOnline\.findRandom === "function"/,
  "the online bridge must be guarded so the web build keeps working");
assert.match(activity, /addJavascriptInterface\(new ShareBridge\(\), "OmokShare"\)/,
  "Android must expose the friend invite share bridge");
assert.match(activity, /@JavascriptInterface\s+public void shareInvite\(String rawCode\)/,
  "the share bridge must only send an invite after an explicit user action");
assert.match(html, /window\.OmokShare && typeof window\.OmokShare\.shareInvite === "function"/,
  "invite sharing must fall back safely in the web build");
assert.match(html, /window\.openOmokInvite\s*=\s*function[\s\S]*onlineCodeInputEl\.value = code/,
  "an incoming invite link must prefill the validated six-character code");
assert.match(html, /launchParams\.get\("online"\) === "1"\) openOnlineLobby\(\)/,
  "the public promo deep link must open the online lobby directly");
assert.match(html, /undoBtn\.hidden = online/,
  "online play must hide undo instead of offering an action the server cannot honor");
assert.match(html, /\.online-bar\[hidden\] \{ display:none; \}/,
  "the online status bar must stay absent during AI battles");
assert.match(html, /if \(onlineState\.active\) \{[\s\S]*leaveOnline\(false\);[\s\S]*closeOnlineLobby\(\);/,
  "the visible back button must leave the online match instead of silently entering AI selection");
assert.match(html, /const mine = online && onlineState\.myColor === "white" \? WHITE : BLACK;/,
  "online hint calculations must use the player's real stone color");
assert.match(manifest, /android:autoVerify="true"[\s\S]*android:host="broodsky85-ai\.github\.io"[\s\S]*android:path="\/minigamegroup\/omok\.html"/,
  "the Android app must declare the public HTTPS invite link");
assert.match(activity, /onNewIntent\(Intent intent\)[\s\S]*deliverPendingInvite\(\)/,
  "an invite opened while the app is already running must reach the web game");

// ---- 성과 측정과 인앱 리뷰 ----
assert.match(build, /implementation\("com\.google\.firebase:firebase-analytics"\)/,
  "Android must include Firebase Analytics so acquisition funnels can be measured");
assert.match(build, /implementation\("com\.google\.android\.play:review:2\.0\.2"\)/,
  "Android must include the official Play in-app review library");
assert.match(activity, /addJavascriptInterface\(new AnalyticsBridge\(\), "OmokAnalytics"\)/,
  "Android must expose the analytics bridge under the stable OmokAnalytics name");
assert.match(activity, /addJavascriptInterface\(new ReviewBridge\(\), "OmokReview"\)/,
  "Android must expose the review bridge under the stable OmokReview name");
assert.match(activity, /ANALYTICS_EVENTS\.contains\(name\)/,
  "native analytics must reject arbitrary event names");
assert.match(activity, /ANALYTICS_NUMBER_PARAMETERS\.contains\(key\)[\s\S]*ANALYTICS_STRING_PARAMETERS\.contains\(key\)/,
  "native analytics must reject arbitrary parameter names that could contain personal data");
assert.match(activity, /text\.matches\("\[a-z0-9_\]\{1,32\}"\)/,
  "analytics string parameters must reject invite codes, nicknames, and free-form text");
assert.match(manifest, /google_analytics_adid_collection_enabled"\s+android:value="false"/,
  "Firebase Analytics must not collect the advertising ID");
assert.match(manifest, /google_analytics_default_allow_ad_personalization_signals"\s+android:value="false"/,
  "Firebase Analytics data must not be eligible for personalized advertising by default");
assert.match(privacy, /Google Analytics for Firebase[\s\S]*앱 인스턴스 식별자[\s\S]*초대 코드[\s\S]*넣지 않습니다/,
  "the public privacy policy must disclose analytics collection and its personal-data safeguards");
assert.match(activity, /review_requested_version_[\s\S]*requestReviewFlow\(\)[\s\S]*launchReviewFlow/,
  "in-app review must be rate-limited per app version and use the official flow");
assert.match(html, /!window\.OmokAnalytics \|\| typeof window\.OmokAnalytics\.logEvent !== "function"\) return;/,
  "analytics calls must be guarded so the web build keeps working");
assert.match(html, /!window\.OmokReview \|\| typeof window\.OmokReview\.request !== "function"\) return;/,
  "review calls must be guarded so the web build keeps working");
for (const eventName of ["online_lobby_view", "matchmaking_started", "match_found", "first_move",
  "match_completed", "invite_created", "invite_joined", "boss_started", "boss_win",
  "share_clicked", "rewarded_ad_completed"]) {
  assert.ok(html.includes(`"${eventName}"`), `web game must track ${eventName}`);
}
assert.match(html, /onlineState\.result === "win"\) requestOmokReview\("online_win"\)/,
  "an online win is a suitable positive moment for the review prompt");

// 광고를 보는 동안에는 내 시계가 멈춰야 한다. 광고를 볼수록 불리하면 아무도 보지 않는다.
assert.match(activity, /onlineMatch\.beginAdPause\(\)/, "watching a rewarded ad must pause the online clock");
assert.match(activity, /pausedForAd && onlineMatch != null\) onlineMatch\.endAdPause\(\)/,
  "the clock must resume once the ad is over");
assert.match(online, /AD_PAUSE_LIMIT = 3/, "ad pauses must be capped so nobody stalls forever");
assert.match(online, /TURN_SECONDS = 60/, "a turn must give 60 seconds");
assert.match(online, /myAdPauses >= AD_PAUSE_LIMIT/, "the cap must actually be checked");

// 온라인에서는 되돌리기가 없다 — 상대가 이미 본 수다.
assert.match(html, /type !== "undo" \|\| \(!online && history\.length >= 2\)/,
  "undo must be unavailable in an online match");

assert.match(rules, /match \/matches\/\{matchId\}/, "security rules must cover online matches");
assert.match(rules, /match \/matchQueue\/\{userId\}/, "security rules must cover the matchmaking queue");
assert.match(rules, /match \/invites\/\{code\}/, "security rules must cover invite codes");
assert.match(rules, /resource\.data\.turn == request\.auth\.uid/,
  "security rules must reject a stone played out of turn");
assert.match(rules, /moves\[0:resource\.data\.moves\.size\(\)\] == resource\.data\.moves/,
  "security rules must keep already-played stones from being rewritten");
assert.match(rules, /resource\.data\.moves\.size\(\) == 0[\s\S]*moves\[0:resource\.data\.moves\.size\(\)\]/,
  "the first online stone and an empty-board resignation must bypass the invalid empty slice");
assert.match(rules, /resource\.data\.adPausedBy == request\.auth\.uid[\s\S]*request\.resource\.data\.adPausedBy == null/,
  "the player who paused for an ad must be able to resume the clock");
assert.match(html, /data\.reason === "permission"[\s\S]*data\.reason === "index"/,
  "leaderboard server configuration errors must not be mislabeled as the player's network problem");

// ---- 온라인 등급 ----
// 등급은 조작 대상이라 규칙과 코드 양쪽에서 조인다.
assert.match(online, /ELO_K = 32/, "rating must move by a bounded Elo step");
assert.match(online, /RATING_TOLERANCE = 200/, "similar rating must be defined");
assert.match(online, /nearMatch != null \? nearMatch : anyMatch/,
  "matchmaking must fall back to anyone waiting when no similar rating is queued");
assert.match(online, /attemptedMatchIds\.add\(targetMatchId\)[\s\S]*searchQueue\(operation\)/,
  "a stale queue row must be skipped instead of splitting two players into separate rooms");
assert.match(online, /operationId\+\+[\s\S]*isOperationActive\(long operation\)/,
  "a cancelled asynchronous search must not create a ghost room after its callback arrives");
assert.match(online, /PRESENCE_INTERVAL_MS[\s\S]*PRESENCE_STALE_MS[\s\S]*isPresenceFresh/,
  "waiting hosts must heartbeat and stale queue or invite entries must be ignored after a hard process stop");
assert.match(online, /finishCancelledJoin\(ref, me\)/,
  "a join transaction that wins the cancellation race must not leave the opponent stuck");
assert.match(online, /if \("playing"\.equals\(status\) \|\| "done"\.equals\(status\)\) \{[\s\S]*clearMyQueueEntry\(\)/,
  "the host must remove their own queue row as soon as a match starts");
assert.match(online, /publishQueue[\s\S]*매칭 대기열에 들어가지 못했습니다/,
  "a failed queue write must be reported instead of pretending that matchmaking is active");
assert.match(online, /ranked = false;/, "friend invites must not count toward rating");
assert.match(online, /if \(!agreed\)/, "rating must only move when both players agree on the result");
assert.match(online, /ensureMyResultClaim\(snap\)[\s\S]*claims\." \+ me/,
  "the player receiving a finished match must add their own result claim so rating agreement can complete");
assert.match(online, /clearInviteEntryAfterStart\(snap, me\)/,
  "a used invite code must be removed as soon as its match starts");
assert.match(online, /starter\.put\("nickname", nickname\)[\s\S]*starter\.put\("rating", START_RATING\)/,
  "a linked player without a leaderboard row must receive a valid starter rating profile");
assert.match(online, /long remaining[\s\S]*resumedStart[\s\S]*new Timestamp\(new Date\(resumedStart\)\)/,
  "ending an ad pause must resume the remaining turn time instead of granting a fresh 60 seconds");
assert.match(rules, /endReason != 'timeout'[\s\S]*request\.time >= resource\.data\.turnStartedAt \+ duration\.value\(60, 's'\)/,
  "an opponent must not be able to claim timeout before 60 server seconds have elapsed");
assert.match(rules, /isMyMove\(\)[\s\S]*affectedKeys\(\)[\s\S]*hasOnly\(\['moves', 'turn', 'turnStartedAt', 'adPausedBy', 'adPausedUntil'\]\)/,
  "a move write must not change unrelated match fields");
assert.match(online, /claims\." \+ me/, "each player must only write their own result claim");
assert.match(rules, /affectedKeys\(\)\s*\.hasOnly\(\[request\.auth\.uid\]\)/,
  "security rules must stop a player from editing the other's claim");
assert.match(rules, /hasOnly\(\['claims'\]\)/,
  "a late claim must not be able to change anything else in the match");
assert.match(rules, /request\.resource\.data\.rating - resource\.data\.rating <= 40/,
  "security rules must cap how far rating can move in one write");
assert.match(html, /function tierName\(rating\)/, "the game must name tiers from the rating");

assert.match(manifest, /\$\{admobAppId\}/, "manifest must use the build-specific AdMob app ID");
assert.match(manifest, /android\.permission\.INTERNET/, "ads require internet permission");
assert.match(build, /play-services-ads:25\.4\.0/, "Google Mobile Ads dependency must be pinned");
assert.match(build, /androidx\.activity:activity:1\.13\.0/, "predictive back support must use a pinned AndroidX Activity version");
assert.match(build, /user-messaging-platform:4\.0\.0/, "Google UMP dependency must be pinned");
assert.match(activity, /requestConsentInfoUpdate[\s\S]*loadAndShowConsentFormIfRequired[\s\S]*canRequestAds\(\)/,
  "ads must wait for the current UMP consent state");
assert.match(build, /versionCode = 9[\s\S]*versionName = "1\.4\.0"/,
  "the next Play upload must use version code 9 and version name 1.4.0");
assert.match(build, /ca-app-pub-3940256099942544\/5224354917/, "debug builds must use Google's rewarded test unit");
assert.match(build, /ca-app-pub-7962806628383813\/6058105442/, "release builds must use the production rewarded unit");
assert.match(build, /ca-app-pub-7962806628383813~6236666471/, "release builds must use the production AdMob app ID");
assert.match(build, /ca-app-pub-7962806628383813\/4417889552/, "release builds must use the production banner unit");
assert.match(build, /include\("omok\.html"\)/, "the omok game must be copied into the app during preBuild");
assert.doesNotMatch(build, /include\("\*\.html"\)/, "the dedicated Android app must not package the minigame index or other games");

const icon = fs.readFileSync(path.join(root, "android", "app", "src", "main", "res", "drawable-nodpi", "omok_icon.png"));
assert.deepStrictEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "Android icon must be a PNG");

console.log("Android package checks passed (reward bridge, test ads, local assets, permissions, icon)");
