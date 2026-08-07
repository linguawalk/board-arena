/**
 * square-board.js
 * 체스처럼 "칸에 기물을 놓고 이동시키는" 게임들의 공용 렌더링 컴포넌트.
 * 바둑의 GoBoard(교차점 방식)와 짝을 이루는, 칸 방식 게임용 클래스.
 *
 * 이동 규칙 자체는 이 클래스가 모르고, 외부(chess.js 등)에서 계산한
 * "이 기물이 갈 수 있는 칸 목록"을 받아서 강조 표시만 한다.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

export class SquareBoard {
  /**
   * @param {Object} config
   * @param {HTMLElement} config.container
   * @param {number} config.width - 가로 칸 수 (체스=8)
   * @param {number} config.height - 세로 칸 수 (체스=8)
   * @param {boolean} [config.interactive=true]
   * @param {(x:number,y:number)=>void} [config.onSquareClick]
   * @param {Object} [config.pieceGlyphs] - {"wK":"♔", "bK":"♚", ...} 유니코드 기물 매핑
   * @param {string} [config.lightColor]
   * @param {string} [config.darkColor]
   */
  constructor({
    container, width = 8, height = 8, interactive = true, onSquareClick = null,
    pieceGlyphs = {}, lightColor = '#f0d9b5', darkColor = '#b58863',
  }) {
    this.container = container;
    this.width = width;
    this.height = height;
    this.interactive = interactive;
    this.onSquareClick = onSquareClick;
    this.pieceGlyphs = pieceGlyphs;
    this.lightColor = lightColor;
    this.darkColor = darkColor;

    this.pieces = new Map(); // "x,y" -> "wK" 같은 코드
    this.selected = null; // {x,y}
    this.legalTargets = []; // [{x,y}]
    this.lastMove = null; // {from:{x,y}, to:{x,y}}
    this.checkedSquare = null; // {x,y} - 체크 상태인 왕의 위치(있으면)

    this.render();
  }

  /** 전체 국면을 [{x,y,piece:"wK"}] 배열로 설정 */
  loadPosition(pieceList) {
    this.pieces.clear();
    for (const p of pieceList) {
      this.pieces.set(`${p.x},${p.y}`, p.piece);
    }
    this.selected = null;
    this.legalTargets = [];
    this.render();
  }

  setSelection(square, legalTargets) {
    this.selected = square;
    this.legalTargets = legalTargets || [];
    this.render();
  }

  clearSelection() {
    this.selected = null;
    this.legalTargets = [];
    this.render();
  }

  markLastMove(from, to) {
    this.lastMove = { from, to };
  }

  markCheck(square) {
    this.checkedSquare = square;
  }

  render() {
    const margin = 4;
    const cellPx = 52;
    const boardPx = margin * 2 + cellPx * this.width;

    this.container.innerHTML = '';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${boardPx} ${margin * 2 + cellPx * this.height}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.classList.add('square-board-svg');

    const px = (x) => margin + x * cellPx;
    const py = (y) => margin + y * cellPx;

    // 체스판 칸
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', px(x));
        rect.setAttribute('y', py(y));
        rect.setAttribute('width', cellPx);
        rect.setAttribute('height', cellPx);
        const isLight = (x + y) % 2 === 0;
        rect.setAttribute('fill', isLight ? this.lightColor : this.darkColor);
        svg.appendChild(rect);
      }
    }

    // 마지막 수 강조
    if (this.lastMove) {
      for (const sq of [this.lastMove.from, this.lastMove.to]) {
        const hl = document.createElementNS(SVG_NS, 'rect');
        hl.setAttribute('x', px(sq.x));
        hl.setAttribute('y', py(sq.y));
        hl.setAttribute('width', cellPx);
        hl.setAttribute('height', cellPx);
        hl.setAttribute('class', 'square-last-move');
        svg.appendChild(hl);
      }
    }

    // 체크 강조
    if (this.checkedSquare) {
      const hl = document.createElementNS(SVG_NS, 'rect');
      hl.setAttribute('x', px(this.checkedSquare.x));
      hl.setAttribute('y', py(this.checkedSquare.y));
      hl.setAttribute('width', cellPx);
      hl.setAttribute('height', cellPx);
      hl.setAttribute('class', 'square-check');
      svg.appendChild(hl);
    }

    // 선택된 칸
    if (this.selected) {
      const hl = document.createElementNS(SVG_NS, 'rect');
      hl.setAttribute('x', px(this.selected.x));
      hl.setAttribute('y', py(this.selected.y));
      hl.setAttribute('width', cellPx);
      hl.setAttribute('height', cellPx);
      hl.setAttribute('class', 'square-selected');
      svg.appendChild(hl);
    }

    // 기물
    for (const [key, piece] of this.pieces.entries()) {
      const [x, y] = key.split(',').map(Number);
      const glyph = this.pieceGlyphs[piece] || '?';
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', px(x) + cellPx / 2);
      text.setAttribute('y', py(y) + cellPx / 2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('class', 'square-piece-glyph');
      text.textContent = glyph;
      svg.appendChild(text);
    }

    // 합법수 목적지 점 표시
    for (const t of this.legalTargets) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', px(t.x) + cellPx / 2);
      dot.setAttribute('cy', py(t.y) + cellPx / 2);
      dot.setAttribute('r', this.pieces.has(`${t.x},${t.y}`) ? cellPx * 0.42 : cellPx * 0.16);
      dot.setAttribute('class', this.pieces.has(`${t.x},${t.y}`) ? 'square-legal-capture' : 'square-legal-dot');
      svg.appendChild(dot);
    }

    // 클릭 히트영역
    if (this.interactive) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const hit = document.createElementNS(SVG_NS, 'rect');
          hit.setAttribute('x', px(x));
          hit.setAttribute('y', py(y));
          hit.setAttribute('width', cellPx);
          hit.setAttribute('height', cellPx);
          hit.setAttribute('class', 'square-hit-area');
          hit.addEventListener('click', () => {
            if (this.onSquareClick) this.onSquareClick(x, y);
          });
          svg.appendChild(hit);
        }
      }
    }

    this.container.appendChild(svg);
  }
}
