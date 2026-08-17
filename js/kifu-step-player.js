// kifu-step-player.js
//
// quiz-diagram-renderer.js의 "숫자 다이어그램"을 대체할 수 있는 애니메이션 버전.
// 같은 문제 데이터(schema/quiz-problem-schema.md)를 그대로 사용하며, 재생/일시정지/이전/다음 버튼을 제공합니다.
//
// ⚠️ 이미 사이트에 kifu-player.js가 있다면 이 파일은 참고용이고, 기존 파일에
//   "정답 수순 재생" 모드만 추가하는 편이 스타일 일관성 面에서 낫습니다.

export function mountKifuStepPlayer(container, problem, answerIndex = null) {
  let idx = answerIndex ?? problem.correctAnswers.findIndex((a) => a.isPrimary);
  if (idx < 0) idx = 0;
  const answer = problem.correctAnswers[idx];

  let step = 0; // 0 = 초기 배치만, 1..n = sequence[0..step-1]까지 둔 상태
  let playing = false;
  let timer = null;

  const boardSize = problem.boardSize;
  const size = 320;
  const pad = size * 0.06;
  const cellStep = (size - pad * 2) / (boardSize - 1);
  const r = cellStep * 0.44;

  container.innerHTML = `
    <div class="kifu-player">
      <div class="kifu-player-board" data-role="board"></div>
      <div class="kifu-player-controls">
        <button data-action="prev">◀ 이전</button>
        <button data-action="playpause">▶ 재생</button>
        <button data-action="next">다음 ▶</button>
        <span class="kifu-player-step" data-role="step-label"></span>
      </div>
      <div class="kifu-player-comment" data-role="comment"></div>
    </div>
  `;

  const els = {
    board: container.querySelector('[data-role="board"]'),
    stepLabel: container.querySelector('[data-role="step-label"]'),
    comment: container.querySelector('[data-role="comment"]'),
    playpause: container.querySelector('[data-action="playpause"]')
  };

  container.querySelector('[data-action="prev"]').addEventListener('click', () => goTo(step - 1));
  container.querySelector('[data-action="next"]').addEventListener('click', () => goTo(step + 1));
  els.playpause.addEventListener('click', togglePlay);

  function togglePlay() {
    playing = !playing;
    els.playpause.textContent = playing ? '⏸ 일시정지' : '▶ 재생';
    if (playing) {
      timer = setInterval(() => {
        if (step >= answer.sequence.length) {
          togglePlay();
          return;
        }
        goTo(step + 1);
      }, 1200);
    } else {
      clearInterval(timer);
    }
  }

  function goTo(newStep) {
    step = Math.max(0, Math.min(answer.sequence.length, newStep));
    render();
  }

  function render() {
    const cx = (x) => pad + x * cellStep;
    const cy = (y) => pad + y * cellStep;

    let grid = '';
    for (let c = 0; c < boardSize; c++) {
      grid += `<line x1="${cx(c)}" y1="${cy(0)}" x2="${cx(c)}" y2="${cy(boardSize - 1)}" stroke="var(--board-line,#555)" stroke-width="1"/>`;
    }
    for (let rIdx = 0; rIdx < boardSize; rIdx++) {
      grid += `<line x1="${cx(0)}" y1="${cy(rIdx)}" x2="${cx(boardSize - 1)}" y2="${cy(rIdx)}" stroke="var(--board-line,#555)" stroke-width="1"/>`;
    }

    let stones = '';
    for (const s of problem.initialStones) {
      stones += stoneSvg(cx(s.x), cy(s.y), r, s.color);
    }
    for (let i = 0; i < step; i++) {
      const { x, y, color } = answer.sequence[i].move;
      stones += stoneSvg(cx(x), cy(y), r, color, i === step - 1);
    }

    els.board.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="var(--board-bg,#dcb35c)"/>
      ${grid}${stones}
    </svg>`;

    els.stepLabel.textContent = `${step} / ${answer.sequence.length}수`;
    els.comment.textContent = step === 0
      ? problem.prompt
      : answer.sequence[step - 1].comment;
  }

  function stoneSvg(x, y, r, color, isLast = false) {
    const fill = color === 'black' ? 'var(--piece-black,#1a1a1a)' : 'var(--piece-white,#f5f5f5)';
    const stroke = isLast ? 'var(--highlight-color,#e0b234)' : (color === 'white' ? 'var(--piece-white-stroke,#333)' : 'none');
    const strokeWidth = isLast ? 3 : 1.5;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  }

  render();

  return {
    destroy: () => clearInterval(timer)
  };
}
