# 오목 챌린지 Android

웹 게임을 앱 내부 자산으로 포함하는 WebView 배포판이다. 빌드할 때 저장소 루트의 HTML, PWA 파일, 아이콘을 `app/src/main/assets/web`으로 자동 복사한다.

## 광고 설정

Google Mobile Ads SDK `25.4.0`. 보상형 광고를 끝까지 보면 선택한 아이템이 1회 충전된다.

**광고 ID는 빌드 타입에 따라 자동으로 갈린다. 손으로 바꿀 것이 없다.**

| | App ID | 보상형 광고 단위 |
|---|---|---|
| `debug` | 구글 공식 테스트 ID | 구글 공식 테스트 ID |
| `release` | 실제 AdMob ID | 실제 AdMob ID |

두 값 모두 **`app/build.gradle.kts`의 `buildTypes` 블록 한 곳에만** 있다.
`AndroidManifest.xml`은 `${admobAppId}` 플레이스홀더를, `MainActivity.java`는
`BuildConfig.REWARDED_AD_UNIT_ID`를 받아 쓴다.

**이 두 파일에 광고 ID를 직접 적지 말 것.** 그렇게 하면 debug 빌드에서도 실제 광고가 뜬다.
개발자 본인이 실제 광고를 반복해서 보거나 누르면 AdMob 정책 위반으로 계정이 정지될 수 있다.
**폰 테스트는 항상 debug 빌드로 한다.** 이 규칙은 `tests/android.package.test.js`가 지키고 있어서,
하드코딩하면 테스트가 먼저 깨진다.

## 빌드 준비

1. Android Studio와 Android SDK Platform 36.1을 설치한다.
2. Android Studio에서 이 `android` 폴더를 연다.
3. Gradle JDK를 17 이상으로 지정한다.
4. `app` 실행 또는 `assembleDebug`로 테스트 APK를 만든다.

실제 광고를 사용하기 전에는 개인정보 동의 흐름(UMP), 개인정보처리방침, Play Console 데이터 보안 양식을 추가로 준비해야 한다.
