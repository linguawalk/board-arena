/**
 * go-engine-adapter.js (카타고 연동 버전)
 *
 * 기존 인터페이스(requestMove(state, color, width, height, koState) -> {x,y}|{pass:true})는
 * 그대로 유지하되, 내부적으로는 상시 구동 중인 카타고 서버(katago_game_server.py)를 호출합니다.
 *
 * ⚠️ KATAGO_SERVER_URL은 실제 배포 환경(맥미니 등에 띄운 서버 주소)에 맞게 반드시 바꿔주세요.
 *    로컬에서 테스트할 땐 보통 http://localhost:8580 형태입니다.
 */

import { STONE } from './go-rules.js';

const KATAGO_SERVER_URL = 'http://localhost:8580'; // TODO: 실제 서버 주소로 교체

// 급/단 -> 서버에 보낼 rank 문자열. 서버(katago_game_server.py)의 RANK_TABLE과 반드시 맞춰야 합니다.
export const AI_LEVELS = buildLevels();

function buildLevels() {
  const kyuLevels = [];
  for (let k = 18; k >= 1; k--) {
    kyuLevels.push({ id: `k${k}`, label: `${k}급`, serverRank: kyuToServerRank(k) });
  }
  const danLevels = [];
  for (let d = 1; d <= 9; d++) {
    danLevels.push({ id: `d${d}`, label: `${d}단`, serverRank: `${d}d` });
  }
  return [...kyuLevels, ...danLevels];
}

// 서버(katago_game_server.py)의 RANK_TABLE은 15k/12k/10k/8k/5k/3k/1k만 정의되어 있으므로,
// 18~1급을 그 표에 맞춰 근사 매핑합니다. (서버 쪽 표를 세분화하면 이 함수도 같이 넓히면 됩니다)
function kyuToServerRank(k) {
  if (k >= 14) return '15k';
  if (k >= 11) return '12k';
  if (k >= 9) return '10k';
  if (k >= 6) return '8k';
  if (k >= 4) return '5k';
  if (k >= 2) return '3k';
  return '1k';
}

function levelById(id) {
  return AI_LEVELS.find((l) => l.id === id) || AI_LEVELS[AI_LEVELS.length - 1];
}

// go-rules.js의 STONE.BLACK='B'/STONE.WHITE='W'를 그대로 카타고 색 표기로 사용 가능
function colorToKatago(color) {
  return color === STONE.BLACK ? 'B' : 'W';
}

// (x,y) 0-indexed 보드 좌표 -> 카타고 좌표 문자열 (예: x=4,y=4,height=9 -> "E5")
// 카타고는 파일 표기에서 I를 건너뛰고, 랭크는 아래(y=height-1)가 1, 위(y=0)가 height 입니다.
const FILES = 'ABCDEFGHJKLMNOPQRST'; // I 없음
function xyToKatago(x, y, height) {
  const file = FILES[x];
  const rank = height - y;
  return `${file}${rank}`;
}

// 카타고 좌표 문자열 -> (x,y) 0-indexed 보드 좌표
function katagoToXy(coord, height) {
  const m = coord.match(/^([A-Z]+)(\d+)$/);
  const file = m[1];
  const rank = parseInt(m[2], 10);
  const x = FILES.indexOf(file);
  const y = height - rank;
  return { x, y };
}

export class GoEngineAdapter {
  constructor({ level = 'd9' } = {}) {
    this.level = levelById(level);
    this.mode = 'katago';
  }

  /**
   * @param {Array<Array<string|null>>} state - 현재 보드 상태 (state[y][x])
   * @param {string} color - STONE.BLACK | STONE.WHITE (AI가 둘 색)
   * @param {number} width, height - 보드 크기
   * @param {Array<Array<string|null>>|null} koState - (카타고 서버가 패까지 정확히 판정하므로 여기선 미사용)
   * @returns {Promise<{x:number,y:number}|{pass:true}>}
   */
  async requestMove(state, color, width, height, koState) {
    const initialStones = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = state[y][x];
        if (cell) {
          initialStones.push([colorToKatago(cell), xyToKatago(x, y, height)]);
        }
      }
    }

    const body = {
      boardSize: width, // go-rules.js/게임 로직이 정사각형 보드만 다루므로 width==height 가정
      initialStones,
      initialPlayer: colorToKatago(color),
      rank: this.level.serverRank,
    };

    let data;
    try {
      const res = await fetch(`${KATAGO_SERVER_URL}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      data = await res.json();
    } catch (err) {
      throw new Error(`카타고 서버 연결 실패: ${err.message} (KATAGO_SERVER_URL 확인 필요)`);
    }

    if (data.error) {
      throw new Error(`카타고 서버 오류: ${data.error}`);
    }
    if (data.move === 'pass') {
      return { pass: true };
    }
    const { x, y } = katagoToXy(data.move, height);
    return { x, y, winrate: data.winrate, scoreLead: data.scoreLead };
  }

  /**
   * 계가/영역 표시용. play.html에서 "형세 보기" 같은 기능을 붙일 때 사용.
   * @returns {Promise<{ownership:number[], scoreLead:number, winrate:number}>}
   */
  async requestScore(state, width, height) {
    const initialStones = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = state[y][x];
        if (cell) initialStones.push([colorToKatago(cell), xyToKatago(x, y, height)]);
      }
    }
    const res = await fetch(`${KATAGO_SERVER_URL}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardSize: width, initialStones, initialPlayer: 'B' }),
    });
    return res.json();
  }
}
