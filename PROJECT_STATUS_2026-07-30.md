# 프로젝트 작업 현황

기록일: 2026-07-30 (KST)

이 문서는 Codex 대화 보관 전 현재까지 완료한 작업과 다음 배포 절차를 인수인계하기 위한 기록이다.
비밀번호, 키스토어 비밀번호, 개인 신원·결제·주소 자료는 기록하지 않는다.

## 1. 저장소와 웹 배포

- GitHub 저장소: <https://github.com/broodsky85-ai/minigamegroup>
- GitHub Pages: <https://broodsky85-ai.github.io/minigamegroup/>
- 기본 브랜치: `main`
- 기록 당시 HEAD: `ff6bfbb` (`계정 삭제 안내 페이지 추가`)
- 로컬 `main`과 `origin/main`은 같은 커밋을 가리킨다.
- 추적 파일 변경은 없으며 `tmp/`만 미추적 상태다. 이 폴더는 확인 없이 삭제하거나 커밋하지 않는다.

## 2. 오목 챌린지

### 게임 콘텐츠

- 파일: `omok.html`
- 콘셉트: 인간계를 넘어 신계에 도전하는 다크 네온 보스전
- 인간계 1~10단계:
  새싹, 수습생, 방패, 추격자, 함정술사, 맹공, 철벽, 심판자, 지배자, 오목왕
- 신계 11~15단계:
  문지기, 천리안, 파괴신, 운명신, 오목신
- 오목왕을 격파하면 신계 개방 연출과 세계 전환 버튼이 열린다.
- 신계 AI는 무작위 실수 없이 이중 위협, 강제 수순, 중앙 포석과 더 넓은 후보 수를 단계별로 사용한다.
- `CRITICAL_SCORE = 400000` 보호 로직으로 열린 4와 즉시 패배 위협을 성격과 무관하게 막는다.

### 기록과 아이템

- 웹 기록은 `localStorage`의 `omok-challenge-v1`에 저장한다.
- Android에서는 Firebase Google 로그인과 Firestore 기록 동기화를 추가했다.
- 네이티브 브릿지:
  - `window.OmokAccount`
  - `window.OmokRecords`
  - `window.OmokAds`
- 수읽기와 차례 되돌리기는 판당 한 번씩 사용한다.
- Android에서 아이템을 다 쓰면 보상형 광고를 끝까지 보고 한 번 충전할 수 있다.
- Debug 빌드는 Google 테스트 광고 ID, Release 빌드만 실제 AdMob ID를 사용한다.

### PWA와 Android

- PWA 파일: `manifest.webmanifest`, `sw.js`, `icons/`
- Android 패키지: `com.broodsky85.omokchallenge`
- `minSdk 23`, `targetSdk 36`
- 현재 버전: `versionCode 2`, `versionName 1.0.0`
- `versionCode 1`은 Play 내부 테스트 업로드에 사용되어 재사용할 수 없다.
- 웹 원본은 Android 빌드 전에 `android/app/src/main/assets/web`으로 자동 복사된다.
- Firebase 인증·기록 동기화와 AdMob 보상형 광고를 실제 Android 기기에서 확인했다.
- 개인정보처리방침: `privacy.html`
- 계정 삭제 안내: `delete-account.html`

### 현재 Android 산출물

- Debug APK:
  `android/app/build/outputs/apk/debug/app-debug.apk`
- 과거 미서명 Release APK:
  `android/app/build/outputs/apk/release/app-release-unsigned.apk`
- Play 업로드용 Release AAB:
  `android/app/build/outputs/bundle/release/app-release.aab`
- Release AAB는 2026-07-30에 JAR 서명 검증 명령이 성공했다.
- 실제 `android/keystore.properties`와 키스토어 파일은 Git에서 제외한다. 앱 업데이트를 위해 별도로 안전하게 백업해야 한다.

## 3. Google Play 배포에서 중요한 사실

새 개인 개발자 계정에 적용되는 비공개 테스트 조건:

- 최소 12명의 테스터가 필요하다.
- 12명 모두 최소 14일 연속으로 비공개 테스트 참여 상태를 유지해야 한다.
- 일반 웹게임 주소나 직접 전달한 APK 다운로드 링크는 이 조건에 포함되지 않는다.
- Play Console 비공개 테스트 트랙에서 발급된 **테스트 참여 링크**로 가입하고 Google Play에서 설치해야 인정된다.

진행 순서:

1. Play Console의 비공개 테스트 트랙에 Release AAB를 올린다.
2. 테스터의 Google 계정 12개 이상을 이메일 목록 또는 Google 그룹으로 등록한다.
3. 비공개 테스트 트랙이 검토·활성화되면 Play Console의 참여 링크를 복사한다.
4. 등록한 테스터에게 그 참여 링크를 직접 전달한다.
5. 테스터는 등록된 Google 계정으로 참여를 승인하고 Google Play에서 앱을 설치한다.
6. 최소 12명이 14일 연속 참여를 유지하면서 실제 기능을 사용하고 의견을 남긴다.
7. 조건 충족 후 프로덕션 액세스를 신청하고 테스트 과정에 관한 질문에 답한다.
8. 프로덕션 액세스가 승인되면 정식 출시 심사를 진행한다.

Play Console이 테스터를 자동으로 모집하거나 초대 메시지를 대신 보내주지는 않는다.

## 4. 멸망까지 30일

- 파일: `kingdom30.html`
- 하루 한 장의 사건 카드에 두 선택지 중 하나로 답하는 30일 왕국 생존 게임
- 자원: 식량, 군사, 민심, 국고
- 어느 자원이든 0 또는 100에 도달하면 즉시 파멸한다.
- 사건 카드 78장
- 파멸 엔딩 8종과 생존 엔딩 10종, 총 18종
- 선택 플래그와 사건 연쇄, 최대 3개의 후일담을 지원한다.
- `?s=숫자` 시드 링크로 친구와 같은 사건 순서에 도전할 수 있다.
- 판당 한 번 죽은 순간 되돌리기가 구현되어 있다.
- 기록 키: `kingdom30-v1`
- 무작위·균형·벼랑끝 회피 전략을 합쳐 3만 판 자동 시뮬레이션으로 밸런스를 검사한다.

## 5. 기타 미니게임

- `baseball.html`: 숫자야구
- `minesweeper.html`: 지뢰찾기
- `memory.html`: 카드 짝맞추기
- `rps.html`: 가위바위보
- `tictactoe.html`: 틱택토
- `index.html`: 전체 게임 홈

## 6. 검증 방법

전체 테스트:

```powershell
cd tests
npm install
npm test
```

왕국 게임만:

```powershell
cd tests
npm run test:kingdom
```

Android 빌드:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
cd android
.\gradlew.bat bundleRelease
```

검증 범위:

- 오목 AI 성격과 신계 5단계
- 실제 클릭 기반 승리·해금·기록
- Firebase 네이티브 브릿지가 없는 웹 환경의 안전성
- Android 광고 브릿지 함수명과 Debug/Release 광고 ID 분리
- 왕국 게임 UI 스모크 테스트
- 왕국 게임 3만 판 밸런스 시뮬레이션

## 7. 별도 후속게임 프로젝트

`당겨라! 코어`는 이 미니게임 저장소와 별도 프로젝트다.

- 로컬 폴더: `C:\Users\khs04\OneDrive\바탕 화면\오목후속작업3`
- 비공개 저장소: <https://github.com/broodsky85-ai/core-pull-game>
- 6×6 자석 전략 게임, AI 보스 7명, 아이템 2종, PWA와 Android 패키징 구현
- 게임 규칙·AI 테스트 29개가 작성되어 있다.
- Android 프로토타입 v0.2.0 디버그 APK 프리릴리스를 만들었다.

오목 챌린지와 `당겨라! 코어`는 서로 다른 게임이므로 이후 작업에서도 섞지 않는다.

## 8. 다음 우선 작업

1. 오목 Release AAB와 스토어 등록정보를 최종 확인한다.
2. 비공개 테스트 트랙을 활성화한다.
3. 실제 Google 계정을 가진 테스터 12명 이상을 모집한다.
4. Play Console의 비공개 테스트 참여 링크를 전달한다.
5. 14일 동안 참여 유지와 실제 테스트 의견을 관리한다.
6. 프로덕션 액세스 신청 후 정식 출시 심사를 진행한다.

기존 세부 인수인계는 `OMOK_RELEASE_HANDOFF.md`, 프로젝트 규칙은 `AGENTS.md`를 참고한다.
