# 오목 챌린지 Android

웹 게임을 앱 내부 자산으로 포함하는 WebView 배포판이다. 빌드할 때 저장소 루트의 HTML, PWA 파일, 아이콘을 `app/src/main/assets/web`으로 자동 복사한다.

## 현재 광고 설정

- Google Mobile Ads SDK: `25.4.0`
- 테스트 App ID: `ca-app-pub-3940256099942544~3347511713`
- 테스트 보상형 광고 ID: `ca-app-pub-3940256099942544/5224354917`
- 광고를 끝까지 보면 선택한 아이템이 1회 충전된다.

테스트 ID는 실제 수익이 발생하지 않는다. Play 스토어 출시 전 `AndroidManifest.xml`의 App ID와 `MainActivity.java`의 보상형 광고 ID를 실제 AdMob 값으로 교체해야 한다.

## 빌드 준비

1. Android Studio와 Android SDK Platform 36.1을 설치한다.
2. Android Studio에서 이 `android` 폴더를 연다.
3. Gradle JDK를 17 이상으로 지정한다.
4. `app` 실행 또는 `assembleDebug`로 테스트 APK를 만든다.

실제 광고를 사용하기 전에는 개인정보 동의 흐름(UMP), 개인정보처리방침, Play Console 데이터 보안 양식을 추가로 준비해야 한다.
