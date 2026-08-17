# 퀴즈 문제 JSON 스키마 (바둑 기준, 다른 게임도 동일 구조 재사용)

## 설계 목표 (과거 실패 사례 해결)
1. 정답이 "수 하나"로 고정되지 않도록 — `correctAnswers`가 배열이며, 각 답은 다시
   상대 응수에 따른 `branches`를 가질 수 있음 (트리 구조).
2. 정답만 던지고 끝나지 않도록 — 문제 전체 `explanation`과, 정답 수순의 각 수마다
   `comment`가 필수.
3. "다이어그램에 숫자 매기기" 방식과 "한 수씩 재생 애니메이션" 방식을 모두
   같은 데이터로 렌더링할 수 있도록 — 좌표 시퀀스 하나로 두 렌더러(diagram/player)에
   그대로 먹임.

## 최상위 필드

```jsonc
{
  "id": "go-life-death-0001",
  "game": "go",
  "stage": "life_death",          // life_death | opening | middlegame | endgame
  "source": "engine",             // engine | sgf
  "sourceRef": null,              // stage가 sgf 기반일 때만: 퍼블릭 도메인 SGF 식별자/출처
  "boardSize": 19,

  // 문제 출제 시점의 초기 배치. 좌표는 0-index (x: 0~boardSize-1, y: 0~boardSize-1)
  "initialStones": [
    { "x": 3, "y": 3, "color": "black" },
    { "x": 3, "y": 4, "color": "white" }
  ],

  "toMove": "black",
  "difficulty": 3,                // 1(쉬움) ~ 5(어려움)
  "prompt": "흑 차례입니다. 백 대마를 잡는 최선의 첫 수는?",

  // 다중 정답 + 분기 트리
  "correctAnswers": [
    {
      "label": "정수(定手)",           // 여러 정답 중 이름표 (예: "정수", "변화 A")
      "isPrimary": true,               // 가장 표준적인 정답이면 true
      "sequence": [
        {
          "move": { "x": 5, "y": 3, "color": "black" },
          "comment": "이 수로 백의 궁도를 좁히면서 동시에 자신의 두점머리를 지킵니다."
        },
        {
          "move": { "x": 5, "y": 4, "color": "white" },
          "comment": "백이 최선으로 버텨도"
        },
        {
          "move": { "x": 6, "y": 3, "color": "black" },
          "comment": "흑이 계속 조여가면 백은 결국 두 집을 낼 수 없습니다."
        }
      ],
      // 정답 수 이후, 상대가 다르게 응수했을 때의 추가 분기 (재귀적으로 같은 구조)
      "branches": [
        {
          "afterMoveIndex": 0,             // sequence의 0번째 수(첫 정답) 다음에 갈리는 분기
          "opponentMove": { "x": 4, "y": 5, "color": "white" },
          "label": "백이 반대쪽으로 버틸 경우",
          "sequence": [
            {
              "move": { "x": 4, "y": 6, "color": "black" },
              "comment": "이렇게 두어도 결과는 같습니다 — 백은 두 집을 만들 공간이 없습니다."
            }
          ]
        }
      ]
    },
    {
      "label": "변화 B (동등한 정답)",
      "isPrimary": false,
      "sequence": [
        {
          "move": { "x": 6, "y": 4, "color": "black" },
          "comment": "이 수도 결과적으로 동일하게 백을 잡습니다. 다만 수순이 한 수 더 필요합니다."
        }
      ]
    }
  ],

  // 오답 예시 (선택 사항) — "왜 틀렸는지"까지 설명하면 학습 효과가 큼
  "commonWrongAnswers": [
    {
      "move": { "x": 5, "y": 5, "color": "black" },
      "why": "이 수는 백에게 궁도를 넓힐 여지를 주어 백이 두 집을 내며 삽니다."
    }
  ],

  "explanation": "이 문제는 백 대마의 궁도사활을 묻는 문제입니다. 핵심은 백이 실질적으로 만들 수 있는 두 집의 공간을 먼저 계산하고, 그 공간을 좁히는 순서를 정확히 지키는 것입니다..."
}
```

## 렌더링 방식과의 매핑
- `initialStones` + `correctAnswers[i].sequence` → `renderMoveSequenceDiagram()` (숫자 매김 단일 이미지, 기본)
- 동일한 데이터 → `mountKifuStepPlayer()` (한 수씩 재생 애니메이션, 확장)
- `branches`는 플레이어 UI에서 "다른 변화 보기" 토글로 노출 (기본은 `isPrimary`의 sequence만 자동 재생)

## 게임별 차이
- 체스/쇼기(칸형): `initialStones`/`move` 안의 `{x,y}` 대신 `{col,row}` 사용, 그 외 구조 동일.
- 장기/샹치(교차점형, 비정사각 보드): `boardSize` 대신 `{cols, rows}` 사용.
