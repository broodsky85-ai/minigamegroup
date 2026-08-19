# 오목 챌린지 테스트 업데이트 안내서

작성일: 2026-08-02

## 1. 현재 Google Play 상태

현재 테스터들이 사용하는 곳은 내부 테스트가 아니라 **비공개 테스트 `Alpha` 트랙**이다.

- 비공개 테스트 `Alpha`: 활성
- 현재 버전: `1 (1.0.0)`
- 게시일: 2026년 7월 30일 오후 6:44
- 상태: `선택한 테스터에게 제공됩니다`
- 국가/지역: 177개
- 새 버전 2의 임시 초안이 열려 있음

따라서 기존 Alpha 테스터가 Google Play에서 설치했다면, 같은 Alpha 트랙에
`2 (1.1.0)`을 출시한 뒤 Play 스토어에서 업데이트를 받는 것이 맞다.

내부 테스트에 만들어 둔 초안은 사용하지 않는다. 프로덕션도 변경하지 않는다.

## 2. 이번 수정본

- 패키지명: `com.broodsky85.omokchallenge`
- 버전 코드: `2`
- 표시 버전: `1.1.0`
- 기존 버전보다 버전 코드가 높으므로 서명이 같다면 덮어쓰기 업데이트 가능

주요 수정:

- 신계를 20단계까지 확장하고 보스 AI 강화
- 같은 구석 수법을 반복하는 공략 방어
- 보드 확대·축소: 두 손가락, 마우스 휠, `+`·`-` 버튼
- 착점 돋보기와 모바일 터치 정확도 개선
- 흑·백 착수 효과음, 마지막 수 충격 연출, 승패별 음악 추가

전체 자동 테스트를 통과했고 Android 빌드도 완료했다.

## 3. 준비된 파일 두 개의 차이

### 휴대폰에서 직접 설치하는 파일: APK

파일:

`C:\Users\khs04\OneDrive\바탕 화면\claude\android\app\build\outputs\apk\release\app-release.apk`

용도:

- 카카오톡, 메일, 드라이브 등으로 현재 테스터에게 직접 전달
- 휴대폰에서 파일을 눌러 설치
- 기존 앱과 패키지명·서명이 같고 기존 버전 코드가 1이면 앱을 지우지 않고 업데이트됨

주의:

- 기존 앱을 다른 키로 서명한 APK로 설치했다면 바로 덮어쓸 수 없다.
- 이때는 기존 앱을 한 번 삭제하고 새 APK를 설치해야 하며, 삭제하면 기기 안의 기록이 사라질 수 있다.
- 따라서 먼저 본인 휴대폰 한 대에서 APK를 눌러 `업데이트`가 뜨는지 확인한다.

### Google Play Console에 올리는 파일: AAB

파일:

`C:\Users\khs04\OneDrive\바탕 화면\claude\android\app\build\outputs\bundle\release\app-release.aab`

용도:

- Google Play Console의 테스트 트랙에 업로드
- AAB 자체는 휴대폰에서 실행하거나 설치하는 파일이 아님
- Play Console에 출시한 뒤 해당 테스트에 참여한 계정이 Play 스토어에서 설치·업데이트함

## 4. 지금 20명에게 수정본을 주는 올바른 방법

현재 Alpha 테스터들에게는 APK를 따로 보낼 필요가 없다. 아래 순서로 처리한다.

1. 기존 비공개 테스트 `Alpha`의 새 버전 초안을 연다.
2. `app-release.aab`를 업로드한다.
3. 출시명과 출시 노트를 입력한다.
4. `다음`을 눌러 오류와 경고를 확인한다.
5. 비공개 테스트 Alpha로 출시한다.
6. Play 처리 완료 후 테스터가 기존에 참여한 Google 계정으로 Play 스토어를 연다.
7. 오목 챌린지 페이지에서 `업데이트`를 누른다. 자동 업데이트가 켜졌다면 자동 설치될 수도 있다.

APK는 Play 트랙과 별개로 직접 설치가 꼭 필요한 비상용 파일이다. Alpha 테스터에게 APK를
혼용하면 설치 출처와 서명이 헷갈릴 수 있으므로 이번 정상 업데이트에는 AAB만 사용한다.

## 5. 이번 Alpha 업데이트에 입력할 내용

출시명:

`오목 챌린지 2 (1.1.0)`

출시 노트:

```text
<ko-KR>
• 신계 20단계 확장 및 보스 AI 강화
• 반복 구석 공략 방어 개선
• 보드 확대·축소와 착점 돋보기 추가
• 착수 효과음, 마지막 수 연출, 결과 음악 추가
• 모바일 보드 크기와 터치 정확도 개선
</ko-KR>
```

## 6. Chrome에서 Codex가 AAB 업로드를 계속하려면

Chrome 확장 프로그램이 로컬 파일을 선택할 수 있도록 한 번만 권한을 켜야 한다.

1. Chrome 주소창에 `chrome://extensions` 입력
2. ChatGPT 브라우저 확장 프로그램의 `세부정보` 클릭
3. **파일 URL에 대한 액세스 허용** 켜기
4. Codex에 `파일 권한 켰어. 기존 Alpha 업데이트 계속해줘`라고 알리기

그 전에는 Codex가 Play Console 화면을 조작할 수는 있어도 컴퓨터의 AAB 파일을 선택할 수 없다.

## 7. 다음 업데이트부터의 전체 순서

1. `omok.html` 등 게임 파일 수정
2. 전체 테스트 실행

```powershell
cd "C:\Users\khs04\OneDrive\바탕 화면\claude\tests"
npm.cmd test
```

3. `android\app\build.gradle.kts`의 `versionCode`를 이전보다 1 올림
4. 필요한 경우 `versionName`도 `1.2.0`처럼 변경
5. AAB와 APK 빌드

```powershell
cd "C:\Users\khs04\OneDrive\바탕 화면\claude\android"
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat bundleRelease assembleRelease --no-daemon
```

6. 직접 전달이면 APK, Google Play 배포면 AAB 사용
7. 본인 휴대폰에서 먼저 업데이트와 기록 보존을 확인
8. 테스터들에게 배포

## 8. 꼭 기억할 것

- APK는 휴대폰에 직접 설치하는 파일이다.
- AAB는 Play Console에 제출하는 파일이다.
- `versionCode`는 업데이트마다 반드시 증가해야 한다.
- 같은 패키지명, 더 높은 버전 코드, 같은 서명이어야 기존 앱 위에 업데이트된다.
- 현재 사용 중인 트랙은 비공개 테스트 `Alpha`다.
- 기존 Alpha에 새 AAB를 출시해야 같은 테스터들에게 Play 스토어 업데이트가 제공된다.
- 내부 테스트 초안이나 새 트랙을 따로 만들지 않는다.
