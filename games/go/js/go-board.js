/**
 * go-board.js
 * BoardCore를 상속하여 바둑판을 SVG로 렌더링.
 * 9x9 / 13x13 / 15x15 / 19x19 등 임의의 정사각 크기를 지원.
 */

import { BoardCore, BOARD_KIND } from '../../../shared/js/board-core.js';
import { STONE, tryPlaceStone, getHandicapPoints } from './go-rules.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class GoBoard extends BoardCore {
  constructor({ container, size = 19, onMove = () => {}, interactive = true, onPointClick = null, viewRegion = null }) {
    super({ kind: BOARD_KIND.INTERSECTION, width: size, height: size, container });
    this.turn = STONE.BLACK;
    this.koState = null;
    this.onMove = onMove;
    this.interactive = interactive; // false면 클릭 비활성 (학습 페이지 예시 다이어그램용)
    this.onPointClick = onPointClick; // 지정되면 클릭 시 실제 착수 대신 이 콜백 호출 (퀴즈 답변용)
    this.viewRegion = viewRegion; // { minX, maxX, minY, maxY } - 지정 시 해당 영역만 확대해서 렌더링
    this.lastMove = null; // { x, y } - 가장 최근에 착수된 위치 (시각 표시용)
    this.capturedBlack = 0; // 흑돌이 잡힌 총 개수 (= 흑의 사석 수)
    this.capturedWhite = 0; // 백돌이 잡힌 총 개수 (= 백의 사석 수)
    this.moveNumbers = null; // Map<"x,y", number> - 기보 재생 시 수순 번호
    this.highlightedCells = []; // 관심 그룹 하이라이트용 좌표 목록
    this.capturedGhosts = []; // 방금 따내진 자리 표시용 좌표 목록
    this.render();
  }

  /** 문제 풀이 등에서 특정 영역만 확대해서 보고 싶을 때 호출 */
  setViewRegion(region) {
    this.viewRegion = region;
    this.render();
  }

  /**
   * 학습 페이지 등에서 임의의 국면을 정적으로 보여줄 때 사용.
   * @param {Array<{x:number,y:number,color:string}>} stones
   */
  /** KifuPlayer 등에서 실제 규칙으로 시뮬레이션한 보드 상태를 직접 반영할 때 사용 */
  setState(grid, lastMove = null) {
    this.state = grid.map((row) => row.slice());
    this.lastMove = lastMove;
    this.render();
  }

  /** 기보 재생 시 각 돌 위에 수순 번호를 표시 (Map<"x,y", number>) */
  setMoveNumbers(map) {
    this.moveNumbers = map;
    this.render();
  }

  /** 사활 문제 등에서 관심 그룹을 자동으로 하이라이트 */
  highlightGroup(cells) {
    this.highlightedCells = cells || [];
    this.render();
  }

  /** 방금 따내진 돌 자리를 잠깐 표시 (실제 규칙 재생 시 시각적 설명용) */
  markCapturedGhosts(points) {
    this.capturedGhosts = points || [];
    this.render();
  }

  loadPosition(stones) {
    this.state = this._createEmptyState();
    for (const { x, y, color } of stones) {
      if (this.inBounds(x, y)) this.state[y][x] = color;
    }
    this.lastMove = null;
    this.capturedBlack = 0;
    this.capturedWhite = 0;
    this.render();
  }

  /**
   * 접바둑: 흑에게 치석을 배치하고 백부터 두게 함.
   * @param {number} count - 치석 수 (0~9). 0이면 일반 대국(흑이 먼저 둠).
   */
  placeHandicap(count) {
    this.state = this._createEmptyState();
    this.history = [];
    this.koState = null;
    this.lastMove = null;
    this.capturedBlack = 0;
    this.capturedWhite = 0;
    if (count > 0) {
      const points = getHandicapPoints(this.width, this.height, count);
      for (const [x, y] of points) {
        this.setCell(x, y, STONE.BLACK);
      }
      this.turn = STONE.WHITE;
    } else {
      this.turn = STONE.BLACK;
    }
    this.render();
  }

  /** 외부(UI 드롭다운)에서 크기 변경 시 호출 */
  changeSize(newSize) {
    this.turn = STONE.BLACK;
    this.koState = null;
    this.lastMove = null;
    this.capturedBlack = 0;
    this.capturedWhite = 0;
    this.resize(newSize, newSize);
  }

  /** 지정된 영역에 여백을 주고, 정사각형으로 보정한 뒤 보드 경계 안으로 clamp */
  _computeSquareRegion({ minX, maxX, minY, maxY, padding = 2 }) {
    const size = this.width;
    let nMinX = Math.max(0, minX - padding);
    let nMaxX = Math.min(size - 1, maxX + padding);
    let nMinY = Math.max(0, minY - padding);
    let nMaxY = Math.min(size - 1, maxY + padding);

    const spanX = nMaxX - nMinX + 1;
    const spanY = nMaxY - nMinY + 1;
    const span = Math.min(size, Math.max(spanX, spanY, 7)); // 최소 7줄은 보이게

    // X축을 span 크기로 맞춤 (가능하면 중앙 정렬)
    let extraX = span - (nMaxX - nMinX + 1);
    nMinX -= Math.floor(extraX / 2);
    nMaxX += Math.ceil(extraX / 2);
    if (nMinX < 0) { nMaxX += -nMinX; nMinX = 0; }
    if (nMaxX > size - 1) { nMinX -= (nMaxX - (size - 1)); nMaxX = size - 1; nMinX = Math.max(0, nMinX); }

    let extraY = span - (nMaxY - nMinY + 1);
    nMinY -= Math.floor(extraY / 2);
    nMaxY += Math.ceil(extraY / 2);
    if (nMinY < 0) { nMaxY += -nMinY; nMinY = 0; }
    if (nMaxY > size - 1) { nMinY -= (nMaxY - (size - 1)); nMaxY = size - 1; nMinY = Math.max(0, nMinY); }

    return { minX: nMinX, maxX: nMaxX, minY: nMinY, maxY: nMaxY };
  }

  render() {
    const size = this.width;
    const margin = 30;
    const cellPx = 32;

    let minX = 0, maxX = size - 1, minY = 0, maxY = size - 1;
    if (this.viewRegion) {
      ({ minX, maxX, minY, maxY } = this._computeSquareRegion(this.viewRegion));
    }
    const spanX = maxX - minX + 1;
    const spanY = maxY - minY + 1;
    const boardPxW = margin * 2 + cellPx * (spanX - 1);
    const boardPxH = margin * 2 + cellPx * (spanY - 1);
    const px = (x) => margin + (x - minX) * cellPx;
    const py = (y) => margin + (y - minY) * cellPx;

    this.container.innerHTML = '';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${boardPxW} ${boardPxH}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.classList.add('go-board-svg');

    // 배경
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('width', boardPxW);
    bg.setAttribute('height', boardPxH);
    bg.setAttribute('class', 'go-board-bg');
    svg.appendChild(bg);

    // 격자선 (보이는 영역 안에서만)
    for (let y = minY; y <= maxY; y++) {
      const hLine = document.createElementNS(SVG_NS, 'line');
      hLine.setAttribute('x1', px(minX));
      hLine.setAttribute('y1', py(y));
      hLine.setAttribute('x2', px(maxX));
      hLine.setAttribute('y2', py(y));
      hLine.setAttribute('class', 'go-grid-line');
      svg.appendChild(hLine);
    }
    for (let x = minX; x <= maxX; x++) {
      const vLine = document.createElementNS(SVG_NS, 'line');
      vLine.setAttribute('x1', px(x));
      vLine.setAttribute('y1', py(minY));
      vLine.setAttribute('x2', px(x));
      vLine.setAttribute('y2', py(maxY));
      vLine.setAttribute('class', 'go-grid-line');
      svg.appendChild(vLine);
    }

    // 화점(성점) - 보이는 영역 안에 있는 것만
    const starCount = size >= 13 ? 9 : size >= 9 ? 5 : 0;
    for (const [hx, hy] of getHandicapPoints(size, size, starCount)) {
      if (hx < minX || hx > maxX || hy < minY || hy > maxY) continue;
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', px(hx));
      dot.setAttribute('cy', py(hy));
      dot.setAttribute('r', 3.5);
      dot.setAttribute('class', 'go-star-point');
      svg.appendChild(dot);
    }

    // 관심 그룹 하이라이트 (돌 아래 배경으로, 사활 문제에서 위험한 그룹을 자동으로 보여줌)
    for (const cell of this.highlightedCells) {
      const { x, y } = cell;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      const halo = document.createElementNS(SVG_NS, 'circle');
      const { cx, cy } = { cx: px(x), cy: py(y) };
      halo.setAttribute('cx', cx);
      halo.setAttribute('cy', cy);
      halo.setAttribute('r', cellPx * 0.58);
      halo.setAttribute('class', 'go-group-highlight');
      svg.appendChild(halo);
    }

    // 돌 (보이는 영역만 순회)
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const stone = this.state[y][x];
        if (!stone) continue;
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', px(x));
        circle.setAttribute('cy', py(y));
        circle.setAttribute('r', cellPx * 0.46);
        circle.setAttribute('class', stone === STONE.BLACK ? 'go-stone-black' : 'go-stone-white');
        svg.appendChild(circle);
      }
    }

    // 수순 번호 (기보 재생 시 각 돌 위에 몇 수째인지 표시)
    if (this.moveNumbers) {
      for (const [key, num] of this.moveNumbers.entries()) {
        const [nx, ny] = key.split(',').map(Number);
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
        const stoneColor = this.state[ny] ? this.state[ny][nx] : null;
        if (!stoneColor) continue;
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', px(nx));
        text.setAttribute('y', py(ny));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('class', stoneColor === STONE.BLACK ? 'go-move-number-on-black' : 'go-move-number-on-white');
        text.textContent = num;
        svg.appendChild(text);
      }
    }

    // 따낸 자리 표시 (실제 규칙으로 재생될 때 방금 사라진 돌 자리를 살짝 표시)
    for (const g of this.capturedGhosts) {
      if (g.x < minX || g.x > maxX || g.y < minY || g.y > maxY) continue;
      const cx = px(g.x);
      const cy = py(g.y);
      const line1 = document.createElementNS(SVG_NS, 'line');
      line1.setAttribute('x1', cx - cellPx * 0.22);
      line1.setAttribute('y1', cy - cellPx * 0.22);
      line1.setAttribute('x2', cx + cellPx * 0.22);
      line1.setAttribute('y2', cy + cellPx * 0.22);
      line1.setAttribute('class', 'go-captured-ghost');
      svg.appendChild(line1);
      const line2 = document.createElementNS(SVG_NS, 'line');
      line2.setAttribute('x1', cx + cellPx * 0.22);
      line2.setAttribute('y1', cy - cellPx * 0.22);
      line2.setAttribute('x2', cx - cellPx * 0.22);
      line2.setAttribute('y2', cy + cellPx * 0.22);
      line2.setAttribute('class', 'go-captured-ghost');
      svg.appendChild(line2);
    }

    // 마지막 착수 표시 (소리 없이도 AI가 어디 뒀는지 바로 알 수 있게)
    if (this.lastMove) {
      const { x, y } = this.lastMove;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        const stoneColor = this.state[y] ? this.state[y][x] : null;
        if (stoneColor) {
          const marker = document.createElementNS(SVG_NS, 'circle');
          marker.setAttribute('cx', px(x));
          marker.setAttribute('cy', py(y));
          marker.setAttribute('r', cellPx * 0.18);
          marker.setAttribute('class', stoneColor === STONE.BLACK ? 'go-last-move-marker-on-black' : 'go-last-move-marker-on-white');
          svg.appendChild(marker);
        }
      }
    }

    // 클릭 히트영역 (보이는 영역만) - interactive 모드에서만 생성
    if (this.interactive) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const hit = document.createElementNS(SVG_NS, 'circle');
          hit.setAttribute('cx', px(x));
          hit.setAttribute('cy', py(y));
          hit.setAttribute('r', cellPx * 0.48);
          hit.setAttribute('class', 'go-hit-area');
          hit.addEventListener('click', () => {
            if (this.onPointClick) {
              this.onPointClick(x, y);
            } else {
              this.handleInput(x, y);
            }
          });
          svg.appendChild(hit);
        }
      }
    }

    this.container.appendChild(svg);
    this._svgEl = svg;
    this._margin = margin;
    this._cellPx = cellPx;
    this._viewMinX = minX;
    this._viewMinY = minY;
  }

  /** 실제 보드 좌표(x,y)를 현재 렌더링된 SVG 픽셀 좌표로 변환 */
  _toPx(x, y) {
    return {
      cx: this._margin + (x - this._viewMinX) * this._cellPx,
      cy: this._margin + (y - this._viewMinY) * this._cellPx,
    };
  }

  /**
   * 퀴즈 페이지용: 후보수 지점에 A/B/C/D 같은 라벨을 표시.
   * @param {Array<{x:number,y:number,label:string}>} points
   */
  markCandidates(points) {
    if (!this._svgEl) return;
    // 기존 마커 제거
    this._svgEl.querySelectorAll('.go-candidate-marker').forEach((el) => el.remove());

    for (const { x, y, label } of points) {
      const { cx, cy } = this._toPx(x, y);

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', this._cellPx * 0.42);
      circle.setAttribute('class', 'go-candidate-marker go-candidate-circle');
      this._svgEl.appendChild(circle);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', cx);
      text.setAttribute('y', cy);
      text.setAttribute('class', 'go-candidate-marker go-candidate-text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.textContent = label;
      this._svgEl.appendChild(text);
    }
  }

  /**
   * 퀴즈 채점 후 정답 지점(초록)과 사용자가 클릭한 오답 지점(빨강)을 표시.
   * @param {{x:number,y:number}} correct
   * @param {{x:number,y:number}|null} picked - 정답이면 null이거나 correct와 동일해도 됨
   */
  markAnswerFeedback(correct, picked) {
    if (!this._svgEl) return;
    this._svgEl.querySelectorAll('.go-answer-marker').forEach((el) => el.remove());

    const draw = (x, y, cls) => {
      const { cx, cy } = this._toPx(x, y);
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', this._cellPx * 0.4);
      circle.setAttribute('class', `go-answer-marker ${cls}`);
      this._svgEl.appendChild(circle);
    };

    const isWrong = picked && (picked.x !== correct.x || picked.y !== correct.y);
    if (isWrong) {
      draw(picked.x, picked.y, 'go-answer-wrong');
    }
    draw(correct.x, correct.y, 'go-answer-correct');
  }

  handleInput(x, y) {
    const result = tryPlaceStone(this.state, x, y, this.turn, this.width, this.height, this.koState);
    if (!result.valid) {
      this.onMove({ valid: false, reason: result.reason });
      return;
    }

    const mover = this.turn;
    this.koState = this.state; // 착수 전 상태를 다음 패 검사용으로 보관
    this.state = result.nextState;
    this.history.push({ x, y, color: mover, captured: result.captured });
    this.lastMove = { x, y };

    // 사석 집계: 잡힌 돌은 항상 상대 색
    if (mover === STONE.BLACK) {
      this.capturedWhite += result.captured.length;
    } else {
      this.capturedBlack += result.captured.length;
    }

    this.turn = mover === STONE.BLACK ? STONE.WHITE : STONE.BLACK;

    this.render();
    this.onMove({
      valid: true,
      x,
      y,
      captured: result.captured,
      nextTurn: this.turn,
      capturedBlack: this.capturedBlack,
      capturedWhite: this.capturedWhite,
    });
  }

  pass() {
    this.history.push({ pass: true, color: this.turn });
    this.koState = null;
    this.turn = this.turn === STONE.BLACK ? STONE.WHITE : STONE.BLACK;
    this.render();
    this.onMove({
      valid: true,
      pass: true,
      nextTurn: this.turn,
      capturedBlack: this.capturedBlack,
      capturedWhite: this.capturedWhite,
    });
  }
}
