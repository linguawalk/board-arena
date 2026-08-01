/**
 * go-board.js
 * BoardCore를 상속하여 바둑판을 SVG로 렌더링.
 * 9x9 / 13x13 / 15x15 / 19x19 등 임의의 정사각 크기를 지원.
 */

import { BoardCore, BOARD_KIND } from '../../../shared/js/board-core.js';
import { STONE, tryPlaceStone, getHandicapPoints } from './go-rules.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class GoBoard extends BoardCore {
  constructor({ container, size = 19, onMove = () => {}, interactive = true }) {
    super({ kind: BOARD_KIND.INTERSECTION, width: size, height: size, container });
    this.turn = STONE.BLACK;
    this.koState = null;
    this.onMove = onMove;
    this.interactive = interactive; // false면 클릭 비활성 (학습 페이지 예시 다이어그램용)
    this.render();
  }

  /**
   * 학습 페이지 등에서 임의의 국면을 정적으로 보여줄 때 사용.
   * @param {Array<{x:number,y:number,color:string}>} stones
   */
  loadPosition(stones) {
    this.state = this._createEmptyState();
    for (const { x, y, color } of stones) {
      if (this.inBounds(x, y)) this.state[y][x] = color;
    }
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
    this.resize(newSize, newSize);
  }

  render() {
    const size = this.width;
    const margin = 30;
    const cellPx = 32;
    const boardPx = margin * 2 + cellPx * (size - 1);

    this.container.innerHTML = '';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${boardPx} ${boardPx}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.classList.add('go-board-svg');

    // 배경
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('width', boardPx);
    bg.setAttribute('height', boardPx);
    bg.setAttribute('class', 'go-board-bg');
    svg.appendChild(bg);

    // 격자선
    for (let i = 0; i < size; i++) {
      const pos = margin + i * cellPx;
      const hLine = document.createElementNS(SVG_NS, 'line');
      hLine.setAttribute('x1', margin);
      hLine.setAttribute('y1', pos);
      hLine.setAttribute('x2', margin + cellPx * (size - 1));
      hLine.setAttribute('y2', pos);
      hLine.setAttribute('class', 'go-grid-line');
      svg.appendChild(hLine);

      const vLine = document.createElementNS(SVG_NS, 'line');
      vLine.setAttribute('x1', pos);
      vLine.setAttribute('y1', margin);
      vLine.setAttribute('x2', pos);
      vLine.setAttribute('y2', margin + cellPx * (size - 1));
      vLine.setAttribute('class', 'go-grid-line');
      svg.appendChild(vLine);
    }

    // 화점(성점) - 크기별로 다르게 계산
    const starCount = size >= 13 ? 9 : size >= 9 ? 5 : 0;
    for (const [hx, hy] of getHandicapPoints(size, size, starCount)) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', margin + hx * cellPx);
      dot.setAttribute('cy', margin + hy * cellPx);
      dot.setAttribute('r', 3.5);
      dot.setAttribute('class', 'go-star-point');
      svg.appendChild(dot);
    }

    // 돌
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const stone = this.state[y][x];
        if (!stone) continue;
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', margin + x * cellPx);
        circle.setAttribute('cy', margin + y * cellPx);
        circle.setAttribute('r', cellPx * 0.46);
        circle.setAttribute('class', stone === STONE.BLACK ? 'go-stone-black' : 'go-stone-white');
        svg.appendChild(circle);
      }
    }

    // 클릭 히트영역 (교차점마다 투명 원) - interactive 모드에서만 생성
    if (this.interactive) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const hit = document.createElementNS(SVG_NS, 'circle');
          hit.setAttribute('cx', margin + x * cellPx);
          hit.setAttribute('cy', margin + y * cellPx);
          hit.setAttribute('r', cellPx * 0.48);
          hit.setAttribute('class', 'go-hit-area');
          hit.addEventListener('click', () => this.handleInput(x, y));
          svg.appendChild(hit);
        }
      }
    }

    this.container.appendChild(svg);
    this._svgEl = svg;
    this._margin = margin;
    this._cellPx = cellPx;
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
      const cx = this._margin + x * this._cellPx;
      const cy = this._margin + y * this._cellPx;

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

  handleInput(x, y) {
    const result = tryPlaceStone(this.state, x, y, this.turn, this.width, this.height, this.koState);
    if (!result.valid) {
      this.onMove({ valid: false, reason: result.reason });
      return;
    }

    this.koState = this.state; // 착수 전 상태를 다음 패 검사용으로 보관
    this.state = result.nextState;
    this.history.push({ x, y, color: this.turn, captured: result.captured });
    this.turn = this.turn === STONE.BLACK ? STONE.WHITE : STONE.BLACK;

    this.render();
    this.onMove({ valid: true, x, y, captured: result.captured, nextTurn: this.turn });
  }

  pass() {
    this.history.push({ pass: true, color: this.turn });
    this.koState = null;
    this.turn = this.turn === STONE.BLACK ? STONE.WHITE : STONE.BLACK;
    this.onMove({ valid: true, pass: true, nextTurn: this.turn });
  }
}
