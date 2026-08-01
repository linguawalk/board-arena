/**
 * go-rules.js
 * 바둑 규칙 엔진: 착수 유효성, 따내기(capture), 패(ko), 활로(liberty) 계산
 * 보드 크기(9~19 이상)에 관계없이 동작하도록 width/height를 매번 인자로 받는 순수 함수 위주로 구성
 */

export const STONE = { BLACK: 'B', WHITE: 'W' };

/**
 * 좌표 (x,y)의 상하좌우 인접 좌표 반환
 */
function neighbors(x, y, width, height) {
  const candidates = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
  return candidates.filter(([nx, ny]) => nx >= 0 && nx < width && ny >= 0 && ny < height);
}

/**
 * (x,y) 돌이 속한 그룹(연결된 동일 색 돌 집합)과 그 그룹의 활로 수를 계산
 */
function getGroupAndLiberties(state, x, y, width, height) {
  const color = state[y][x];
  if (!color) return { group: [], liberties: 0 };

  const visited = new Set();
  const liberties = new Set();
  const stack = [[x, y]];
  const group = [];

  while (stack.length) {
    const [cx, cy] = stack.pop();
    const key = `${cx},${cy}`;
    if (visited.has(key)) continue;
    visited.add(key);
    group.push([cx, cy]);

    for (const [nx, ny] of neighbors(cx, cy, width, height)) {
      const cell = state[ny][nx];
      if (cell === null) {
        liberties.add(`${nx},${ny}`);
      } else if (cell === color) {
        const nKey = `${nx},${ny}`;
        if (!visited.has(nKey)) stack.push([nx, ny]);
      }
    }
  }

  return { group, liberties: liberties.size };
}

/**
 * 착수 시도. 유효하면 { valid: true, nextState, captured } 반환
 * 유효하지 않으면 { valid: false, reason } 반환
 *
 * @param {Array<Array<string|null>>} state - 현재 보드 상태
 * @param {number} x, y - 착수 좌표
 * @param {string} color - STONE.BLACK | STONE.WHITE
 * @param {number} width, height - 보드 크기
 * @param {Array<Array<string|null>>|null} koState - 직전 패 상태 (패 규칙 검사용, 없으면 null)
 */
export function tryPlaceStone(state, x, y, color, width, height, koState = null) {
  if (state[y][x] !== null) {
    return { valid: false, reason: 'occupied' };
  }

  // 보드 복사 후 임시로 착수
  const nextState = state.map((row) => row.slice());
  nextState[y][x] = color;

  const opponent = color === STONE.BLACK ? STONE.WHITE : STONE.BLACK;
  const captured = [];

  // 상대 돌 그룹 중 활로가 0이 된 그룹 제거
  for (const [nx, ny] of neighbors(x, y, width, height)) {
    if (nextState[ny][nx] === opponent) {
      const { group, liberties } = getGroupAndLiberties(nextState, nx, ny, width, height);
      if (liberties === 0) {
        for (const [gx, gy] of group) {
          nextState[gy][gx] = null;
          captured.push([gx, gy]);
        }
      }
    }
  }

  // 자충수(자살수) 검사: 상대를 못 잡았는데 내 그룹의 활로가 0이면 무효
  const { liberties: myLiberties } = getGroupAndLiberties(nextState, x, y, width, height);
  if (myLiberties === 0 && captured.length === 0) {
    return { valid: false, reason: 'suicide' };
  }

  // 패(ko) 검사: 결과 상태가 직전 상태와 완전히 같으면 무효
  if (koState && statesEqual(nextState, koState)) {
    return { valid: false, reason: 'ko' };
  }

  return { valid: true, nextState, captured };
}

function statesEqual(a, b) {
  for (let y = 0; y < a.length; y++) {
    for (let x = 0; x < a[y].length; x++) {
      if (a[y][x] !== b[y][x]) return false;
    }
  }
  return true;
}

/**
 * 간이 계가(area scoring, 중국식): 각 색 돌 수 + 완전히 둘러싸인 빈 집 수
 * 정식 서비스에서는 종국 합의 로직을 추가로 붙여야 함 (MVP 단계 스텁)
 */
export function estimateScore(state, width, height) {
  let black = 0;
  let white = 0;
  const visited = new Set();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      const cell = state[y][x];
      if (cell === STONE.BLACK) black++;
      else if (cell === STONE.WHITE) white++;
      else if (!visited.has(key)) {
        // 빈 영역 flood fill로 경계 색 판정
        const region = [];
        const borderColors = new Set();
        const stack = [[x, y]];
        while (stack.length) {
          const [cx, cy] = stack.pop();
          const k = `${cx},${cy}`;
          if (visited.has(k)) continue;
          visited.add(k);
          region.push(k);
          for (const [nx, ny] of neighbors(cx, cy, width, height)) {
            const ncell = state[ny][nx];
            if (ncell === null) stack.push([nx, ny]);
            else borderColors.add(ncell);
          }
        }
        if (borderColors.size === 1) {
          if (borderColors.has(STONE.BLACK)) black += region.length;
          else white += region.length;
        }
      }
    }
  }

  return { black, white };
}

/** 핸디캡(치석) 위치 - 보드 크기와 치석 수(1~13)에 따른 배치. 9점까지는 전통 표준, 10~13점은 확장 지점 */
export function getHandicapPoints(width, height, count) {
  if (width !== height || width < 7 || count < 1) return [];

  const edge = width >= 13 ? 3 : 2;
  const mid = Math.floor(width / 2);
  const low = edge;
  const high = width - 1 - edge;

  const corners = [[low, low], [high, low], [low, high], [high, high]];
  const edgeMids = [[mid, low], [mid, high], [low, mid], [high, mid]];
  const center = [mid, mid];

  // 전통 9점 배치를 순서대로 정의 (1~9점 요청 시 앞에서부터 사용)
  const traditionalOrder = {
    1: [center],
    2: [[low, high], [high, low]],
    3: [[low, high], [high, low], [high, high]],
    4: corners,
    5: [...corners, center],
    6: [...corners, [low, mid], [high, mid]],
    7: [...corners, [low, mid], [high, mid], center],
    8: [...corners, ...edgeMids],
    9: [...corners, ...edgeMids, center],
  };

  if (count <= 9) return traditionalOrder[count];

  // 10~13점: 전통 배치를 벗어나므로, 귀와 변 사이 1/4 지점에 추가 배치 (비표준 확장)
  const q1 = low + Math.round((mid - low) / 2);
  const q3 = mid + Math.round((high - mid) / 2);
  const extraPoints = [
    [q1, low], [q3, low], [low, q1], [low, q3],
    [q1, high], [q3, high], [high, q1], [high, q3],
  ];
  const extraNeeded = count - 9;
  return [...traditionalOrder[9], ...extraPoints.slice(0, extraNeeded)];
}
