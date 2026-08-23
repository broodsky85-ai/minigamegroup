# 멸망까지 30일 Android

`kingdom30.html` 하나를 앱 내부 자산으로 감싼 WebView 배포판이다.
빌드할 때 저장소 루트의 `kingdom30.html`을 `app/src/main/assets/web`으로 자동 복사한다.

**오목 앱(`../android/`)과 완전히 별개다.** 패키지도 서명 대상도 스토어 등록도 따로다.
한쪽을 고칠 때 다른 쪽을 건드리지 말 것.

| | 이 앱 | 오목 챌린지 |
|---|---|---|
| applicationId | `com.broodsky85.kingdom30` | `com.broodsky85.omokchallenge` |
| 담는 게임 | `kingdom30.html` | `omok.html` + PWA 파일 |
| 광고 | 없음 | 배너 + 보상형 |
| 계정·네트워크 | 없음 (인터넷 권한도 안 받는다) | Firebase 로그인·Firestore |

## 이 앱이 하는 일

게임이 파일 하나로 완결되고 기록도 `localStorage`에만 남는다. 그래서 `MainActivity.java`가
하는 일은 셋뿐이다.

1. `file:///android_asset/web/kingdom30.html`을 띄운다
2. 뒤로가기를 웹에 먼저 넘긴다 (`window.handleKingdomAndroidBack()`)
3. 웹이 여는 `alert` / `confirm` / `prompt`를 실제 다이얼로그로 보여준다

3번이 없으면 도전장 복사가 마지막에 `prompt`로 떨어질 때 조용히 아무 일도 안 일어난다.

## 웹과 맞물리는 두 자리

둘 다 **웹 쪽 코드(`kingdom30.html`)에 있다.** 여기를 고치면 앱이 깨진다.

- **도전장 링크** — WebView는 `file://`로 열려 `location.origin`이 `"null"`이 된다.
  그래서 http/https가 아닐 때는 `WEB_URL`(GitHub Pages 주소)로 링크를 만든다.
  `location.origin`으로 되돌리면 아무도 못 여는 링크가 나간다.
- **뒤로가기** — `handleKingdomAndroidBack()`이 `true`를 주면 웹이 처리한 것이고,
  `false`면 앱이 종료할지 묻는다. 도감에서는 앞 화면으로 돌아가고,
  **타이틀과 재위 중에는 `false`를 준다** — 진행 중인 30일이 뒤로가기 한 번에 사라지면 안 된다.

이 계약은 `tests/kingdom30.android.test.js`가 고정한다. 이름을 바꾸면 테스트가 먼저 깨진다.

## 빌드

```bash
cd android-kingdom30
./gradlew bundleRelease
```

`java: not found`가 나면 Android Studio의 JBR을 쓰면 된다.

```bash
JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew bundleRelease
```

결과물은 `app/build/outputs/bundle/release/app-release.aab`.
디버그 APK는 `./gradlew assembleDebug` (`app/build/outputs/apk/debug/`).

## 서명

업로드 키는 오목과 같은 것을 재사용한다. Play는 앱마다 업로드 키를 따로 등록하므로
같은 키를 써도 문제없다. 설정은 `keystore.properties`에 있고 **커밋하지 않는다**
(`.gitignore`에 걸려 있다). 이 파일이 없는 환경에서는 서명을 건너뛰고 빌드만 된다.

## 새 버전을 올릴 때

**`versionCode`는 Play에 한 번 올리면 두 번 못 쓴다.** `app/build.gradle.kts`에서
올릴 때마다 1씩 올릴 것. `versionName`은 사람이 읽는 값이라 자유롭게 정한다.

| 올린 버전 | versionCode | versionName |
|---|---|---|
| 최초 | 1 | 1.0.0 |
