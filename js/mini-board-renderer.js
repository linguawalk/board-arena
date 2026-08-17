// mini-board-renderer.js
//
// AI 해석 결과의 "하이라이트 수순"을 작은 정적 이미지로 보여주기 위한 렌더러입니다.
// 규칙 설명 페이지에서 이미 쓰신 SVG 미니 다이어그램(작은 보드 + 점 표시)과 같은 톤으로 맞췄습니다.
//
// ⚠️ 이미 IntersectionPieceBoard / SquareBoard 컴포넌트가 있다면, 이 파일 대신 그 컴포넌트를
//    "정적 스냅샷 모드"로 재사용하는 게 더 낫습니다. 이 파일은 그게 당장 여의치 않을 때 쓸 수 있는
//    독립형(dependency-free) 폴백이자, 두 갈래(교차점형/칸형) 구조를 보여주는 참조 구현입니다.
//
// 공통 포지션 포맷:
//   intersection: { cols, rows, pieces:[{x,y,glyph,color}], lastMove?:{from:{x,y},to:{x,y}} }
//   square:       { cols, rows, pieces:[{col,row,glyph,color}], lastMove?:{from:{col,row},to:{col,row}} }
//
// glyph: 보드에 그릴 문자(한 글자 권장) — 예) 바둑은 필요없음(돌만), 장기 "車""包", 체스 "♞" 등
// color: 'black' | 'white' | 'red' | 'blue' 등 CSS 변수 매핑에 쓰는 팀 구분자

const DEFAULT_SIZE = 200;

function pieceFill(color) {
  // 사이트 전역 CSS 변수를 우선 사용하고, 없으면 안전한 기본값으로 폴백
  const map = {
    black: 'var(--piece-black, #1a1a1a)',
    white: 'var(--piece-white, #f5f5f5)',
    red:   'var(--piece-red, #c0392b)',
    blue:  'var(--piece-blue, #2c5cc5)'
  };
  return map[color] || 'var(--piece-neutral, #888)';
}

function pieceStroke(color) {
  return color === 'white' ? 'var(--piece-white-stroke, #333)' : 'none';
}

/**
 * 교차점형 보드 렌더링 (바둑/장기/샹치).
 * 돌/기물을 "선의 교차점" 위에 그립니다.
 */
export function renderIntersectionMiniSVG(position, size = DEFAULT_SIZE) {
  const { cols, rows, pieces = [], lastMove } = position;
  const pad = size * 0.08;
  const innerW = size - pad * 2;
  const innerH = size - pad * 2;
  const stepX = innerW / (cols - 1);
  const stepY = innerH / (rows - 1);
  const px = (x) => pad + x * stepX;
  const py = (y) => pad + y * stepY;
  const r = Math.min(stepX, stepY) * 0.42;

  let lines = '';
  for (let c = 0; c < cols; c++) {
    lines += `<line x1="${px(c)}" y1="${py(0)}" x2="${px(c)}" y2="${py(rows - 1)}" stroke="var(--board-line, #555)" stroke-width="1" />`;
  }
  for (let rIdx = 0; rIdx < rows; rIdx++) {
    lines += `<line x1="${px(0)}" y1="${py(rIdx)}" x2="${px(cols - 1)}" y2="${py(rIdx)}" stroke="var(--board-line, #555)" stroke-width="1" />`;
  }

  let pieceSvg = '';
  for (const p of pieces) {
    const cx = px(p.x), cy = py(p.y);
    pieceSvg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${pieceFill(p.color)}" stroke="${pieceStroke(p.color)}" stroke-width="1.5" />`;
    if (p.glyph) {
      pieceSvg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${r * 1.1}" fill="${p.color === 'white' ? '#111' : '#fff'}">${escapeXml(p.glyph)}</text>`;
    }
  }

  let lastMoveSvg = '';
  if (lastMove) {
    const { from, to } = lastMove;
    if (from) {
      lastMoveSvg += `<circle cx="${px(from.x)}" cy="${py(from.y)}" r="${r * 1.35}" fill="none" stroke="var(--highlight-color, #e0b234)" stroke-width="2" stroke-dasharray="3,2" />`;
    }
    lastMoveSvg += `<circle cx="${px(to.x)}" cy="${py(to.y)}" r="${r * 1.35}" fill="none" stroke="var(--highlight-color, #e0b234)" stroke-width="2.5" />`;
  }

  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect x="0" y="0" width="${size}" height="${size}" fill="var(--board-bg, #dcb35c)" />
    ${lines}
    ${pieceSvg}
    ${lastMoveSvg}
  </svg>`;
}

/**
 * 칸형 보드 렌더링 (체스/쇼기).
 * 기물을 "칸의 중앙"에 그립니다. 체스는 격자 무늬, 쇼기는 균일한 배경을 씁니다.
 */
export function renderSquareMiniSVG(position, size = DEFAULT_SIZE, opts = {}) {
  const { cols, rows, pieces = [], lastMove } = position;
  const checker = opts.checker !== false; // 기본값: 체스처럼 체크무늬
  const cellW = size / cols;
  const cellH = size / rows;

  let cells = '';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const isDark = checker ? ((row + col) % 2 === 1) : false;
      const fill = isDark ? 'var(--square-dark, #7a6248)' : 'var(--square-light, #e8d9b8)';
      cells += `<rect x="${col * cellW}" y="${row * cellH}" width="${cellW}" height="${cellH}" fill="${fill}" stroke="var(--board-line, rgba(0,0,0,0.08))" stroke-width="0.5" />`;
    }
  }

  let pieceSvg = '';
  for (const p of pieces) {
    const cx = (p.col + 0.5) * cellW;
    const cy = (p.row + 0.5) * cellH;
    const fs = Math.min(cellW, cellH) * 0.7;
    pieceSvg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="${pieceFill(p.color)}" stroke="${p.color === 'white' ? '#333' : 'none'}" stroke-width="0.5">${escapeXml(p.glyph || '')}</text>`;
  }

  let lastMoveSvg = '';
  if (lastMove) {
    const { from, to } = lastMove;
    if (from) {
      lastMoveSvg += `<rect x="${from.col * cellW}" y="${from.row * cellH}" width="${cellW}" height="${cellH}" fill="none" stroke="var(--highlight-color, #e0b234)" stroke-width="2" stroke-dasharray="3,2" />`;
    }
    lastMoveSvg += `<rect x="${to.col * cellW}" y="${to.row * cellH}" width="${cellW}" height="${cellH}" fill="none" stroke="var(--highlight-color, #e0b234)" stroke-width="2.5" />`;
  }

  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    ${cells}
    ${pieceSvg}
    ${lastMoveSvg}
  </svg>`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** game 문자열로 어떤 렌더러를 쓸지 자동 선택 */
export function renderMiniBoard(game, position, size) {
  const intersectionGames = ['go', 'janggi', 'xiangqi'];
  const squareGames = ['chess', 'shogi'];
  if (intersectionGames.includes(game)) return renderIntersectionMiniSVG(position, size);
  if (squareGames.includes(game)) return renderSquareMiniSVG(position, size, { checker: game === 'chess' });
  throw new Error(`알 수 없는 게임: ${game}`);
}
