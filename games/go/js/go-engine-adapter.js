/**
 * go-engine-adapter.js
 *
 * 지금 단계: 진짜 KataGo WASM 대신 가벼운 휴리스틱 AI로 동작.
 *   - 합법수 중에서 "따낼 수 있으면 따내기 > 활로 넓은 곳 > 무작위" 순으로 우선순위를 매기는 정도의 간단한 규칙.
 *   - 메인 스레드에서 바로 계산 가능할 만큼 가벼워서 별도 Worker 없이 동작.
 *
 * 나중에 KataGo WASM을 구하면:
 *   - EngineLoader(shared/js/engine-loader.js)로 감싼 Worker 기반 엔진으로 교체
 *   - 이 파일의 requestMove()의 내부 구현만 바꾸면 되고, 호출부(play.html)는 그대로 유지
 */

import { tryPlaceStone } from './go-rules.js';

// 급수 구간별 난이도. 실제 기력 차등이 아니라 "실수 확률"로 흉내낸 임시 체계입니다.
// (진짜 KataGo 엔진으로 교체되면 이 표는 각 급수/단에 맞는 플레이아웃/깊이 설정으로 대체될 예정)
export const AI_LEVELS = buildLevels();

function buildLevels() {
  const kyuLevels = [];
  for (let k = 18; k >= 1; k--) {
    kyuLevels.push({ id: `k${k}`, label: `${k}급` });
  }
  const danLevels = [];
  for (let d = 1; d <= 9; d++) {
    danLevels.push({ id: `d${d}`, label: `${d}단` });
  }
  const all = [...kyuLevels, ...danLevels]; // 총 27단계, 약한 순 -> 강한 순
  const start = 0.95; // 18급의 실수 확률
  const end = 0.0;     // 9단의 실수 확률
  const n = all.length;
  return all.map((lvl, i) => ({
    ...lvl,
    mistakeRate: start + (end - start) * (i / (n - 1)),
  }));
}

function levelById(id) {
  return AI_LEVELS.find((l) => l.id === id) || AI_LEVELS[AI_LEVELS.length - 1];
}

export class GoEngineAdapter {
  constructor({ level = 'd9' } = {}) {
    this.level = levelById(level);
    this.mode = 'heuristic'; // 추후 'worker'로 교체 예정 (KataGo WASM 준비되면)
  }

  /**
   * @param {Array<Array<string|null>>} state - 현재 보드 상태
   * @param {string} color - STONE.BLACK | STONE.WHITE (AI가 둘 색)
   * @param {number} width, height - 보드 크기
   * @param {Array<Array<string|null>>|null} koState - 패 검사를 위한 직전 상태
   * @returns {Promise<{x:number,y:number}|{pass:true}>}
   */
  async requestMove(state, color, width, height, koState) {
    await new Promise((r) => setTimeout(r, 150)); // 약간의 "생각하는 시간" 연출

    const candidates = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const result = tryPlaceStone(state, x, y, color, width, height, koState);
        if (result.valid) {
          candidates.push({ x, y, captured: result.captured.length });
        }
      }
    }

    if (candidates.length === 0) {
      return { pass: true };
    }

    // 급수가 낮을수록(mistakeRate가 높을수록) 최선수 대신 무작위수를 선택할 확률이 높음
    if (Math.random() < this.level.mistakeRate) {
      return pickRandom(candidates);
    }

    // 따내는 수 우선, 없으면 무작위
    const capturingMoves = candidates.filter((c) => c.captured > 0);
    if (capturingMoves.length > 0) {
      capturingMoves.sort((a, b) => b.captured - a.captured);
      return capturingMoves[0];
    }
    return pickRandom(candidates);
  }
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
