/**
 * intersection-piece-board.js
 * 장기·샹치처럼 "선의 교차점에 기물을 놓고 이동시키는" 게임들의 공용 렌더링 컴포넌트.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

export class IntersectionPieceBoard {
  constructor({
    container, width = 9, height = 10, interactive = true, onPointClick = null,
    pieceGlyphs = {}, palaces = [], riverGap = null, pieceColorClasses = null, starPoints = [],
  }) {
    this.container = container;
    this.width = width;
    this.height = height;
    this.interactive = interactive;
    this.onPointClick = onPointClick;
    this.pieceGlyphs = pieceGlyphs;
    this.palaces = palaces;
    this.riverGap = riverGap; // {yTop, yBottom} - 이 사이 구간의 세로선을 끊어서 강을 표현
    this.pieceColorClasses = pieceColorClasses || { light: 'ipb-piece-disk-red', dark: 'ipb-piece-disk-blue' };
    this.starPoints = starPoints; // [{x,y}] - 바둑판 화점처럼 위치 파악용 작은 점

    this.pieces = new Map();
    this.selected = null;
    this.legalTargets = [];
    this.lastMove = null;

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

  setSelection(point, legalTargets) {
    this.selected = point;
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

  render() {
    const margin = 32;
    const cellPx = 48;
    const boardW = margin * 2 + cellPx * (this.width - 1);
    const boardH = margin * 2 + cellPx * (this.height - 1);

    this.container.innerHTML = '';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${boardW} ${boardH}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.classList.add('ipb-svg');

    const px = (x) => margin + x * cellPx;
    const py = (y) => margin + y * cellPx;

    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', 0);
    bg.setAttribute('y', 0);
    bg.setAttribute('width', boardW);
    bg.setAttribute('height', boardH);
    bg.setAttribute('class', 'ipb-bg');
    svg.appendChild(bg);

    for (let x = 0; x < this.width; x++) {
      if (this.riverGap) {
        const l1 = document.createElementNS(SVG_NS, 'line');
        l1.setAttribute('x1', px(x));
        l1.setAttribute('y1', py(0));
        l1.setAttribute('x2', px(x));
        l1.setAttribute('y2', py(this.riverGap.yTop));
        l1.setAttribute('class', 'ipb-line');
        svg.appendChild(l1);
        const l2 = document.createElementNS(SVG_NS, 'line');
        l2.setAttribute('x1', px(x));
        l2.setAttribute('y1', py(this.riverGap.yBottom));
        l2.setAttribute('x2', px(x));
        l2.setAttribute('y2', py(this.height - 1));
        l2.setAttribute('class', 'ipb-line');
        svg.appendChild(l2);
      } else {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', px(x));
        line.setAttribute('y1', py(0));
        line.setAttribute('x2', px(x));
        line.setAttribute('y2', py(this.height - 1));
        line.setAttribute('class', 'ipb-line');
        svg.appendChild(line);
      }
    }
    for (let y = 0; y < this.height; y++) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', px(0));
      line.setAttribute('y1', py(y));
      line.setAttribute('x2', px(this.width - 1));
      line.setAttribute('y2', py(y));
      line.setAttribute('class', 'ipb-line');
      svg.appendChild(line);
    }
    for (const pal of this.palaces) {
      for (const [dx1, dy1, dx2, dy2] of [[-1, -1, 1, 1], [-1, 1, 1, -1]]) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', px(pal.cx + dx1));
        line.setAttribute('y1', py(pal.cy + dy1));
        line.setAttribute('x2', px(pal.cx + dx2));
        line.setAttribute('y2', py(pal.cy + dy2));
        line.setAttribute('class', 'ipb-line');
        svg.appendChild(line);
      }
    }

    for (const sp of this.starPoints) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', px(sp.x));
      dot.setAttribute('cy', py(sp.y));
      dot.setAttribute('r', cellPx * 0.09);
      dot.setAttribute('class', 'ipb-star-point');
      svg.appendChild(dot);
    }

    if (this.lastMove) {
      for (const pt of [this.lastMove.from, this.lastMove.to]) {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', px(pt.x));
        c.setAttribute('cy', py(pt.y));
        c.setAttribute('r', cellPx * 0.5);
        c.setAttribute('class', 'ipb-last-move');
        svg.appendChild(c);
      }
    }

    if (this.selected) {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', px(this.selected.x));
      c.setAttribute('cy', py(this.selected.y));
      c.setAttribute('r', cellPx * 0.46);
      c.setAttribute('class', 'ipb-selected');
      svg.appendChild(c);
    }

    for (const [key, piece] of this.pieces.entries()) {
      const [x, y] = key.split(',').map(Number);
      const isRed = /^[A-Z]$/.test(piece);
      const disk = document.createElementNS(SVG_NS, 'circle');
      disk.setAttribute('cx', px(x));
      disk.setAttribute('cy', py(y));
      disk.setAttribute('r', cellPx * 0.42);
      disk.setAttribute('class', isRed ? this.pieceColorClasses.light : this.pieceColorClasses.dark);
      svg.appendChild(disk);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', px(x));
      text.setAttribute('y', py(y));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('class', 'ipb-piece-glyph');
      text.textContent = piece in this.pieceGlyphs ? this.pieceGlyphs[piece] : '?';
      svg.appendChild(text);
    }

    for (const t of this.legalTargets) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', px(t.x));
      dot.setAttribute('cy', py(t.y));
      dot.setAttribute('r', this.pieces.has(`${t.x},${t.y}`) ? cellPx * 0.44 : cellPx * 0.14);
      dot.setAttribute('class', this.pieces.has(`${t.x},${t.y}`) ? 'ipb-legal-capture' : 'ipb-legal-dot');
      svg.appendChild(dot);
    }

    if (this.interactive) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const hit = document.createElementNS(SVG_NS, 'rect');
          hit.setAttribute('x', px(x) - cellPx / 2);
          hit.setAttribute('y', py(y) - cellPx / 2);
          hit.setAttribute('width', cellPx);
          hit.setAttribute('height', cellPx);
          hit.setAttribute('class', 'ipb-hit-area');
          hit.addEventListener('click', () => {
            if (this.onPointClick) this.onPointClick(x, y);
          });
          svg.appendChild(hit);
        }
      }
    }

    this.container.appendChild(svg);
  }
}
