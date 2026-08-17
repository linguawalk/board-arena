// quiz-diagram-renderer.js
//
// "정답 수순을 숫자로 표시한 단일 다이어그램" — 바둑책에서 흔히 쓰는 방식.
// 애니메이션 없이도 학습자가 수순 전체를 한눈에 볼 수 있어, 기본(fallback) 해설 이미지로 사용합니다.
//
// schema/quiz-problem-schema.md 의 문제 데이터를 그대로 입력으로 받습니다.

function intersectionCoord(size, pad, step, v) {
  return pad + v * step;
}

/**
 * 교차점형(바둑/장기/샹치) 숫자 매김 다이어그램.
 * @param {object} problem - schema의 문제 객체
 * @param {number} answerIndex - correctAnswers 배열 중 어떤 정답을 그릴지 (기본 0 = isPrimary)
 * @param {number} size - svg 픽셀 크기
 */
export function renderMoveSequenceDiagram(problem, answerIndex = 0, size = 320) {
  const { boardSize, initialStones = [], correctAnswers } = problem;
  const answer = correctAnswers[answerIndex];
  if (!answer) throw new Error(`renderMoveSequenceDiagram: correctAnswers[${answerIndex}] 없음`);

  const cols = boardSize, rows = boardSize;
  const pad = size * 0.06;
  const step = (size - pad * 2) / (cols - 1);
  const cx = (x) => intersectionCoord(size, pad, step, x);
  const cy = (y) => intersectionCoord(size, pad, step, y);
  const r = step * 0.44;

  // 1) 격자
  let grid = '';
  for (let c = 0; c < cols; c++) {
    grid += `<line x1="${cx(c)}" y1="${cy(0)}" x2="${cx(c)}" y2="${cy(rows - 1)}" stroke="var(--board-line,#555)" stroke-width="1"/>`;
  }
  for (let rIdx = 0; rIdx < rows; rIdx++) {
    grid += `<line x1="${cx(0)}" y1="${cy(rIdx)}" x2="${cx(cols - 1)}" y2="${cy(rIdx)}" stroke="var(--board-line,#555)" stroke-width="1"/>`;
  }

  // 2) 초기 배치 돌 (번호 없음)
  let initialSvg = '';
  for (const s of initialStones) {
    initialSvg += stoneSvg(cx(s.x), cy(s.y), r, s.color, null);
  }

  // 3) 정답 수순 — 순서대로 번호 매겨서 그리기
  let seqSvg = '';
  answer.sequence.forEach((step, i) => {
    const { x, y, color } = step.move;
    seqSvg += stoneSvg(cx(x), cy(y), r, color, i + 1);
  });

  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="var(--board-bg,#dcb35c)"/>
    ${grid}
    ${initialSvg}
    ${seqSvg}
  </svg>`;
}

function stoneSvg(x, y, r, color, number) {
  const fill = color === 'black' ? 'var(--piece-black,#1a1a1a)' : 'var(--piece-white,#f5f5f5)';
  const stroke = color === 'white' ? 'var(--piece-white-stroke,#333)' : 'none';
  const textColor = color === 'black' ? '#fff' : '#111';
  let svg = `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  if (number) {
    svg += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${r * 1.05}" font-weight="700" fill="${textColor}">${number}</text>`;
  }
  return svg;
}

/**
 * 문제 카드 전체(다이어그램 + 해설 텍스트 + 정답 선택 탭)를 컨테이너에 그립니다.
 * 애니메이션 플레이어(kifu-step-player.js)가 준비되면 이 함수의 다이어그램 부분만 교체하면 됩니다.
 */
export function mountQuizAnswerPanel(container, problem) {
  let currentAnswerIndex = problem.correctAnswers.findIndex((a) => a.isPrimary);
  if (currentAnswerIndex < 0) currentAnswerIndex = 0;

  function render() {
    const answer = problem.correctAnswers[currentAnswerIndex];
    const svg = renderMoveSequenceDiagram(problem, currentAnswerIndex, 320);

    const tabsHtml = problem.correctAnswers.length > 1
      ? `<div class="quiz-answer-tabs">
          ${problem.correctAnswers.map((a, i) => `
            <button class="quiz-answer-tab ${i === currentAnswerIndex ? 'active' : ''}" data-idx="${i}">
              ${escapeHtml(a.label || `정답 ${i + 1}`)}
            </button>
          `).join('')}
        </div>`
      : '';

    const movesHtml = answer.sequence.map((s, i) => `
      <div class="quiz-move-comment">
        <span class="quiz-move-number">${i + 1}.</span> ${escapeHtml(s.comment)}
      </div>
    `).join('');

    container.innerHTML = `
      <div class="quiz-answer-panel">
        <div class="quiz-answer-diagram">${svg}</div>
        <div class="quiz-answer-detail">
          ${tabsHtml}
          <div class="quiz-explanation">${escapeHtml(problem.explanation)}</div>
          <div class="quiz-move-comments">${movesHtml}</div>
        </div>
      </div>
    `;

    container.querySelectorAll('.quiz-answer-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentAnswerIndex = Number(btn.dataset.idx);
        render();
      });
    });
  }

  render();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
