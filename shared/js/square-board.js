/**
 * square-board.js
 * 체스·쇼기처럼 "칸에 기물을 놓고 이동시키는" 게임들의 공용 렌더링 컴포넌트.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

export class SquareBoard {
  constructor({
    container, width = 8, height = 8, interactive = true, onSquareClick = null,
    pieceGlyphs = {}, lightColor = '#f0d9b5', darkColor = '#b58863', colorByCase = false,
  }) {
    this.container = container;
    this.width = width;
    this.height = height;
    this.interactive = interactive;
    this.onSquareClick = onSquareClick;
    this.pieceGlyphs = pieceGlyphs;
    this.lightColor = lightColor;
    this.darkColor = darkColor;
    this.colorByCase = colorByCase; // 쇼기처럼 기물 모양이 같고 색으로만 진영을 구분해야 할 때 사용

    this.pieces = new Map();
    this.selected = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.checkedSquare = null;

    this.render();
  }

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

    if (this.checkedSquare) {
      const hl = document.createElementNS(SVG_NS, 'rect');
      hl.setAttribute('x', px(this.checkedSquare.x));
      hl.setAttribute('y', py(this.checkedSquare.y));
      hl.setAttribute('width', cellPx);
      hl.setAttribute('height', cellPx);
      hl.setAttribute('class', 'square-check');
      svg.appendChild(hl);
    }

    if (this.selected) {
      const hl = document.createElementNS(SVG_NS, 'rect');
      hl.setAttribute('x', px(this.selected.x));
      hl.setAttribute('y', py(this.selected.y));
      hl.setAttribute('width', cellPx);
      hl.setAttribute('height', cellPx);
      hl.setAttribute('class', 'square-selected');
      svg.appendChild(hl);
    }

    for (const [key, piece] of this.pieces.entries()) {
      const [x, y] = key.split(',').map(Number);
      const glyph = this.pieceGlyphs[piece] || '?';
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', px(x) + cellPx / 2);
      text.setAttribute('y', py(y) + cellPx / 2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      let cls = 'square-piece-glyph';
      if (this.colorByCase) {
        const isUpper = /[A-Z]/.test(piece.replace('+', ''));
        cls += isUpper ? ' square-piece-upper' : ' square-piece-lower';
      }
      text.setAttribute('class', cls);
      text.textContent = glyph;
      svg.appendChild(text);
    }

    for (const t of this.legalTargets) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', px(t.x) + cellPx / 2);
      dot.setAttribute('cy', py(t.y) + cellPx / 2);
      dot.setAttribute('r', this.pieces.has(`${t.x},${t.y}`) ? cellPx * 0.42 : cellPx * 0.16);
      dot.setAttribute('class', this.pieces.has(`${t.x},${t.y}`) ? 'square-legal-capture' : 'square-legal-dot');
      svg.appendChild(dot);
    }

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
