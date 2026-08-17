# board-arena — 개인 복기 AI 해석 기능 (1단계)

퀴즈/복기 재생은 기존처럼 완전 무료·로그인 불필요합니다.
이 패키지는 **"AI 해석" 버튼 한 개**에만 관여합니다: 로그인 → 크레딧 확인/차감 → Claude 호출 → 결과 표시.

## 폴더 구조

```
firebase/firestore.rules          Firestore 보안 규칙
public/js/firebase-init.js        Firebase 클라이언트 초기화 (API 키 채워넣기)
public/js/auth.js                 Google 로그인 + 크레딧 조회
public/js/mini-board-renderer.js  하이라이트 국면 미니 SVG (교차점형/칸형)
public/js/position-adapters.js    chess.js / ffish-es6 FEN → 렌더러 입력 변환
public/js/review-interpret-panel.js  "AI 해석 요청" UI 패널 본체
public/js/ai-interpret-panel.css  패널 기본 스타일
api/interpret.js                  Vercel 서버리스 함수 (인증·차감·Claude 호출)
package.json                      firebase-admin 의존성
```

## 설정 순서

### 1. Firebase 프로젝트 생성 (board-arena 전용, mind-arena와 별도)
1. https://console.firebase.google.com → 프로젝트 추가 → 이름 예: `board-arena`
2. Authentication → 로그인 방법 → Google 사용 설정
3. Firestore Database → 데이터베이스 만들기 (프로덕션 모드)
4. Firestore → 규칙 탭에 `firebase/firestore.rules` 내용 붙여넣고 게시
5. 프로젝트 설정 → 일반 → 내 앱 → 웹 앱 추가 → 여기서 나온 설정값을 `public/js/firebase-init.js`의 `firebaseConfig`에 채워넣기
6. 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** → JSON 파일 다운로드 (이건 절대 저장소에 커밋하지 말 것)

### 2. Vercel 환경변수 설정
board-arena Vercel 프로젝트 → Settings → Environment Variables 에 추가:

| 변수명 | 값 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | 1-6에서 받은 JSON 파일 전체 내용을 한 줄 문자열로 |
| `ANTHROPIC_API_KEY` | console.anthropic.com에서 발급한 키 |

### 3. 의존성 설치
기존 `package.json`이 없다면 이 폴더의 `package.json`을 그대로 쓰고,
이미 있다면 `dependencies`에 `"firebase-admin": "^12.6.0"`만 추가 후 `npm install`.

### 4. 5개 게임 페이지에 패널 연결
각 게임의 복기(리플레이) 페이지 `<head>`에 CSS 추가:
```html
<link rel="stylesheet" href="/js/ai-interpret-panel.css">
```

패널을 붙일 위치에 컨테이너 하나:
```html
<div id="ai-interpret-panel"></div>
```

페이지 하단에 모듈 스크립트로 연결 (바둑 예시):
```html
<script type="module">
  import { mountReviewInterpretPanel } from '/js/review-interpret-panel.js';
  import { positionFromFfish } from '/js/position-adapters.js';

  mountReviewInterpretPanel(document.getElementById('ai-interpret-panel'), {
    game: 'go',
    getMoveList: () => currentReview.moves, // 기존 "복기용 저장" 데이터에서 가져오기
    getPositionAtMove: (moveIndex) => {
      // 기존 리플레이 로직으로 moveIndex까지 재생 → FEN 추출은 기존 코드 재사용
      const fen = replayToMoveAndGetFen(moveIndex); // 기존 함수명에 맞게 교체
      return positionFromFfish(fen, { cols: 19, rows: 19, glyphs: {} });
    }
  });
</script>
```

체스는 `positionFromChessJs(chessInstance)`, 장기/쇼기/샹치는 각 보드 크기에 맞춰
`positionFromFfish(fen, { cols, rows, glyphs })`를 사용하면 됩니다
(장기·샹치: cols 9 rows 10 / 쇼기: cols 9 rows 9).

`getMoveList`와 `getPositionAtMove`는 이미 "복기 재생" 기능이 갖고 있는 로직을 그대로
재사용하는 콜백일 뿐이므로, 실제로 새로 구현해야 하는 로직은 거의 없습니다.

### 5. 크레딧 수동 지급 (관리자)
Firestore 콘솔 → `users/{uid}` 문서 → `credits` 필드 값을 직접 수정.
(결제 연동은 이번 범위에서 제외했으므로, 지금은 이 방식이 유일한 충전 경로입니다.)

## 크레딧 단가 (기본값)

| 게임 | 하이라이트 수 | 크레딧 |
|---|---|---|
| 바둑 | 5개 | 1 |
| 바둑 | 10개 | 2 |
| 체스/장기/쇼기/샹치 | 5개(고정) | 1 |

단가를 바꾸려면 `public/js/review-interpret-panel.js`의 `TIER_CONFIG`와
`api/interpret.js`의 `CREDIT_COST` **둘 다** 동일하게 수정해야 합니다 (프론트 표시용과
서버 실제 차감 로직이 분리되어 있음).

## 이번 범위에 포함되지 않은 것 (다음 단계)
- 실제 결제(PG) 연동 — 크레딧 구매 버튼
- 마이페이지에서 해석 히스토리 조회 UI (데이터는 `interpretations` 컬렉션에 이미 쌓임)
- 2번(퀴즈), 3번(유명 기보) 콘텐츠 — 다음 세션에서 별도로 설계
