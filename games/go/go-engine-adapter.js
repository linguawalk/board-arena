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

export const AI_LEVEL = {
  BEGINNER: 'beginner', // 완전 무작위
  CASUAL: 'casual',     // 따낼 수 있으면 따냄 + 활로 고려
};

export class GoEngineAdapter {
  constructor({ level = AI_LEVEL.CASUAL } = {}) {
    this.level = level;
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
    // 실제 엔진 호출처럼 비동기 인터페이스를 유지 (나중에 Worker로 교체해도 호출부가 안 바뀌게)
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

    if (this.level === AI_LEVEL.BEGINNER) {
      return pickRandom(candidates);
    }

    // CASUAL: 따내는 수 우선, 없으면 무작위
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
