/* 「멸망까지 30일」 Android 배포판(android-kingdom30)의 계약을 고정한다.
 *
 * 이 앱은 오목과 달리 계정도 광고도 네트워크도 없다. 그래서 지킬 것도 적지만,
 * 웹과 네이티브가 이름 하나로 맞물리는 자리(handleKingdomAndroidBack)와
 * 오목 앱과 절대 섞이면 안 되는 것들(패키지명, 자산 목록)은 여기서 못 박는다. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const APP = "android-kingdom30";

const html = read("kingdom30.html");
const activity = read(APP, "app", "src", "main", "java", "com", "broodsky85", "kingdom30", "MainActivity.java");
const manifest = read(APP, "app", "src", "main", "AndroidManifest.xml");
const build = read(APP, "app", "build.gradle.kts");
const omokBuild = read("android", "app", "build.gradle.kts");

const ok = [];
function check(name, fn) {
  fn();
  ok.push(name);
}

/* ---------- 오목 앱과의 분리 ---------- */

check("오목과 다른 패키지다", () => {
  assert.match(build, /applicationId = "com\.broodsky85\.kingdom30"/,
    "kingdom30 앱은 자기 applicationId를 가져야 한다");
  assert.match(build, /namespace = "com\.broodsky85\.kingdom30"/, "namespace도 같이 맞아야 한다");
  const omokId = omokBuild.match(/applicationId = "([^"]+)"/)[1];
  const thisId = build.match(/applicationId = "([^"]+)"/)[1];
  assert.notStrictEqual(thisId, omokId,
    "두 앱이 같은 패키지명을 쓰면 Play에서 서로를 덮어쓴다");
});

check("게임 파일 하나만 패키지에 들어간다", () => {
  assert.match(build, /include\("kingdom30\.html"\)/, "kingdom30.html은 반드시 들어가야 한다");
  for (const other of ["omok.html", "index.html", "hero.html", "baseball.html", "minesweeper.html"]) {
    assert.ok(!build.includes(`include("${other}")`),
      `${other}는 이 앱에 들어가면 안 된다`);
  }
});

check("자산에서 kingdom30을 띄운다", () => {
  assert.match(activity, /file:\/\/\/android_asset\/web\/kingdom30\.html/,
    "패키지된 게임 자산을 로드해야 한다");
});

/* ---------- 웹과 네이티브가 맞물리는 이름 ---------- */

check("뒤로가기 훅 이름이 양쪽에서 같다", () => {
  assert.match(html, /window\.handleKingdomAndroidBack\s*=\s*function/,
    "웹이 안드로이드 뒤로가기를 받을 함수를 내놔야 한다");
  assert.match(activity, /evaluateJavascript\([\s\S]*handleKingdomAndroidBack[\s\S]*showExitConfirmation/,
    "네이티브는 뒤로가기를 먼저 웹에 넘기고, 웹이 안 받으면 종료를 물어야 한다");
});

check("진행 중인 판은 뒤로가기로 사라지지 않는다", () => {
  const hook = html.match(/window\.handleKingdomAndroidBack[\s\S]*?\n\};/)[0];
  assert.ok(!/newGame|show\("game"\)|S\s*=\s*null/.test(hook),
    "뒤로가기 훅이 판을 새로 시작하거나 버리면 안 된다");
  assert.match(hook, /if \(cur\.id === "codex"\)/, "도감에서는 앞 화면으로 돌아가야 한다");
  assert.match(hook, /return false;\s*\};/,
    "타이틀과 재위 중에는 false를 돌려 네이티브가 종료를 묻게 해야 한다");
  assert.match(activity, /showExitConfirmation\(\)[\s\S]*게임을 종료할까요\?[\s\S]*finish\(\)/,
    "종료 전에 반드시 한 번 묻는다");
});

check("도전장 링크는 앱에서도 웹 주소로 나간다", () => {
  // WebView는 file:// 로 열려 location.origin이 "null"이 된다.
  // 그대로 쓰면 아무도 열 수 없는 링크가 만들어진다.
  assert.match(html, /const WEB_URL = "https:\/\/broodsky85-ai\.github\.io\/minigamegroup\/kingdom30\.html"/,
    "앱에서 쓸 웹 주소가 정의돼 있어야 한다");
  assert.match(html, /const onWeb = location\.protocol === "http:" \|\| location\.protocol === "https:"/,
    "웹에서 열렸는지로 갈라야 한다");
  assert.match(html, /const base = onWeb \? location\.origin \+ location\.pathname : WEB_URL/,
    "웹이 아니면 WEB_URL을 써야 한다");
});

check("웹이 여는 다이얼로그가 실제로 뜬다", () => {
  // 도전장 복사가 실패하면 마지막에 prompt로 떨어진다. 안 받으면 조용히 아무 일도 안 일어난다.
  assert.match(activity, /onJsPrompt[\s\S]*result\.confirm\([\s\S]*result\.cancel\(\)/,
    "prompt를 받아야 도전장을 손으로 가져갈 수 있다");
  assert.match(activity, /onJsAlert[\s\S]*result\.confirm\(\)/, "alert도 받아야 한다");
  assert.match(activity, /onJsConfirm[\s\S]*result\.cancel\(\)/, "confirm도 받아야 한다");
});

/* ---------- WebView 안전과 화면 ---------- */

check("기록이 남을 자리가 열려 있다", () => {
  assert.match(activity, /setDomStorageEnabled\(true\)/,
    "기록(kingdom30-v1)이 localStorage에 남으므로 꺼두면 진행이 전부 날아간다");
  assert.match(html, /localStorage\.setItem\(STORE_KEY/, "웹이 실제로 localStorage에 쓴다");
});

check("로컬 파일 접근을 넓히지 않는다", () => {
  assert.match(activity, /setAllowUniversalAccessFromFileURLs\(false\)/,
    "file URL이 아무 곳이나 읽게 두면 안 된다");
  assert.match(activity, /setAllowFileAccessFromFileURLs\(false\)/,
    "게임 파일이 다른 로컬 파일을 읽을 이유가 없다");
  assert.match(activity, /setAllowContentAccess\(false\)/, "content provider도 열어둘 이유가 없다");
});

check("오프라인 게임이므로 네트워크 권한을 받지 않는다", () => {
  assert.ok(!manifest.includes("android.permission.INTERNET"),
    "네트워크를 안 쓰는 게임이 인터넷 권한을 달면 심사에서 설명해야 한다");
  assert.ok(!/OmokAds|OmokAccount|OmokOnline|firebase|admob/i.test(activity),
    "계정·광고·온라인은 이 앱에 없다");
  assert.ok(!/google-services|play-services-ads|firebase/i.test(build),
    "쓰지 않는 SDK를 넣지 않는다");
});

check("전체화면과 세로 고정", () => {
  assert.match(activity, /SYSTEM_UI_FLAG_IMMERSIVE_STICKY[\s\S]*SYSTEM_UI_FLAG_FULLSCREEN[\s\S]*SYSTEM_UI_FLAG_HIDE_NAVIGATION/,
    "상태바와 네비게이션바를 숨겨야 한다");
  assert.match(activity, /controller\.hide\(WindowInsets\.Type\.statusBars\(\) \| WindowInsets\.Type\.navigationBars\(\)\)/,
    "최신 안드로이드에서도 같이 숨겨야 한다");
  assert.match(manifest, /android:screenOrientation="portrait"/, "세로로 만든 화면이다");
  assert.match(activity, /FLAG_KEEP_SCREEN_ON/,
    "카드를 오래 들여다보는 게임이라 화면이 꺼지면 흐름이 끊긴다");
  assert.match(activity, /setTextZoom\(100\)/, "시스템 글꼴 크기가 레이아웃을 무너뜨리지 않게 고정한다");
});

check("아이콘과 이름이 붙어 있다", () => {
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/, "런처 아이콘이 있어야 한다");
  const strings = read(APP, "app", "src", "main", "res", "values", "strings.xml");
  assert.match(strings, /<string name="app_name">멸망까지 30일<\/string>/, "앱 이름이 게임 이름과 같아야 한다");
  for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    for (const f of ["ic_launcher.png", "ic_launcher_foreground.png"]) {
      assert.ok(fs.existsSync(path.join(root, APP, "app", "src", "main", "res", `mipmap-${d}`, f)),
        `mipmap-${d}/${f} 가 있어야 한다`);
    }
  }
});

check("서명 설정이 있고 키는 커밋되지 않는다", () => {
  assert.match(build, /rootProject\.file\("keystore\.properties"\)/,
    "release 서명 정보는 파일로 분리돼 있어야 한다");
  assert.match(build, /if \(hasKeystore\) signingConfig/,
    "키가 없는 환경에서도 빌드는 되어야 한다");
  const ignore = read(".gitignore");
  assert.ok(ignore.includes(`${APP}/keystore.properties`), "키스토어 설정은 커밋되면 안 된다");
  assert.ok(ignore.includes(`${APP}/app/src/main/assets/web/`), "복사된 자산 사본은 커밋하지 않는다");
});

for (const name of ok) console.log("  ok  " + name);
console.log("\n전부 통과");
