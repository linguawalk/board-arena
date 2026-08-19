/**
 * intersection-board-coords.js
 * IntersectionPieceBoard(장기/샹치 등 교차점형 보드)의 실제 렌더링 상수(margin=32, cellPx=48)를
 * 그대로 반영해서, 보드 바깥에 파일(a,b,c...)/랭크(1,2,3...) 좌표를 정확한 픽셀 위치에 표시합니다.
 *
 * intersection-piece-board.js를 수정하지 않고 바깥에서 감싸는 방식이라, 그 컴포넌트가
 * 업데이트되어도 margin/cellPx 값만 맞춰주면 계속 정확합니다.
 */

const MARGIN = 32;
const CELL_PX = 48;

export function boardPixelSize(width, height) {
  return {
    w: MARGIN * 2 + CELL_PX * (width - 1),
    h: MARGIN * 2 + CELL_PX * (height - 1),
  };
}

/**
 * wrapperEl 안에 있는 boardColEl(교차점 보드가 렌더링되는 컨테이너)을 좌표 라벨로 감쌉니다.
 * boardColEl의 width/height를 보드의 실제 픽셀 크기로 고정시킵니다(교차점 위치와 어긋나지 않도록).
 *
 * @param {HTMLElement} boardColEl - IntersectionPieceBoard가 렌더링될 컨테이너 (예: #board-col)
 * @param {number} width - 보드 가로 교차점 수 (샹치 9, 장기 9)
 * @param {number} height - 보드 세로 교차점 수 (샹치 10, 장기 10)
 * @param {string[]} fileLabels - 왼쪽→오른쪽 파일 라벨 (예: ['a'..'i'])
 * @param {string[]} rankLabels - 위→아래 랭크 라벨 (예: ['10','9',...,'1'])
 */
export function mountIntersectionCoords(boardColEl, width, height, fileLabels, rankLabels) {
  const { w: boardW, h: boardH } = boardPixelSize(width, height);

  boardColEl.style.width = `${boardW}px`;
  boardColEl.style.height = `${boardH}px`;

  // 이미 감싸져 있다면(게임/문제를 다시 시작해서 재호출된 경우) 원래 자리로 되돌린 뒤 새로 감쌉니다.
  // (그냥 다시 감싸면 wrap이 계속 중첩되는 버그가 생기므로 반드시 이렇게 처리)
  let targetParent = boardColEl.parentElement;
  if (targetParent && targetParent.classList.contains('ipb-coord-wrap')) {
    const grandParent = targetParent.parentElement;
    grandParent.insertBefore(boardColEl, targetParent);
    targetParent.remove();
    targetParent = grandParent;
  }

  const wrap = document.createElement('div');
  wrap.className = 'ipb-coord-wrap';
  wrap.style.cssText = `position:relative; width:${boardW + 24}px; height:${boardH + 22}px;`;

  targetParent.insertBefore(wrap, boardColEl);
  wrap.appendChild(boardColEl);
  boardColEl.style.position = 'absolute';
  boardColEl.style.left = '24px';
  boardColEl.style.top = '0';

  fileLabels.forEach((label, x) => {
    const px = MARGIN + x * CELL_PX;
    const span = document.createElement('span');
    span.className = 'ipb-file-label';
    span.textContent = label;
    span.style.cssText = `position:absolute; left:${24 + px}px; top:${boardH + 4}px; transform:translateX(-50%); font-size:12px; color:#888;`;
    wrap.appendChild(span);
  });

  rankLabels.forEach((label, y) => {
    const py = MARGIN + y * CELL_PX;
    const span = document.createElement('span');
    span.className = 'ipb-rank-label';
    span.textContent = label;
    span.style.cssText = `position:absolute; left:0; top:${py}px; transform:translateY(-50%); font-size:12px; color:#888; width:20px; text-align:center;`;
    wrap.appendChild(span);
  });
}

/** 표준 샹치/장기(9x10) 좌표 라벨 세트 */
export function standardFileLabels(width) {
  return Array.from({ length: width }, (_, i) => String.fromCharCode(97 + i));
}
export function standardRankLabels(height) {
  // 위(랭크 height)에서 아래(랭크 1)로
  return Array.from({ length: height }, (_, i) => String(height - i));
}
