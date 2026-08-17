// review-interpret-panel.js
//
// "복기용으로 저장"된 개인 대국을 불러온 뒤, AI 해석을 요청하는 UI 패널.
// 바둑/체스/장기/쇼기/샹치 5개 게임 페이지에 공통으로 붙입니다.
//
// 이 모듈은 각 게임의 리플레이 엔진(chess.js / ffish-es6)을 직접 알지 못합니다.
// 대신 페이지 쪽에서 두 개의 콜백만 넘겨주면 됩니다:
//   - getMoveList(): 현재 불러온 복기의 수순 배열 (문자열 배열, 예: ['e4','e5','Nf3',...])
//   - getPositionAtMove(moveIndex): 해당 수까지 재생한 뒤의 포지션 객체
//        (position-adapters.js 의 positionFromChessJs / positionFromFfish 결과를 그대로 리턴하면 됨)
//
// 사용 예 (바둑 복기 페이지 하단):
//
//   import { mountReviewInterpretPanel } from '/js/review-interpret-panel.js';
//
//   mountReviewInterpretPanel(document.getElementById('ai-interpret-panel'), {
//     game: 'go',
//     getMoveList: () => currentReview.moves,
//     getPositionAtMove: (idx) => positionFromFfish(replayEngineToMove(idx), { cols: 19, rows: 19, glyphs: {} }),
//   });

import { ensureLogin, getIdToken, getCreditBalance, onAuthChange, logout } from './auth.js';
import { renderMiniBoard } from './mini-board-renderer.js';

// 게임별 하이라이트 티어. 바둑만 5개/10개 두 단계, 나머지는 5개 고정.
const TIER_CONFIG = {
  go: [
    { count: 5, credits: 1, label: '5수 하이라이트 (1크레딧)' },
    { count: 10, credits: 2, label: '10수 하이라이트 (2크레딧)' }
  ],
  chess: [{ count: 5, credits: 1, label: '5수 하이라이트 (1크레딧)' }],
  janggi: [{ count: 5, credits: 1, label: '5수 하이라이트 (1크레딧)' }],
  shogi: [{ count: 5, credits: 1, label: '5수 하이라이트 (1크레딧)' }],
  xiangqi: [{ count: 5, credits: 1, label: '5수 하이라이트 (1크레딧)' }]
};

export function mountReviewInterpretPanel(container, { game, getMoveList, getPositionAtMove }) {
  const tiers = TIER_CONFIG[game];
  if (!tiers) throw new Error(`mountReviewInterpretPanel: 지원하지 않는 game 값입니다: ${game}`);

  let selectedTier = tiers[0];
  let lastResult = null;

  container.innerHTML = `
    <div class="ai-interpret-box">
      <div class="ai-interpret-header">
        <span class="ai-interpret-title">AI 해석</span>
        <span class="ai-interpret-credits" data-role="credits">로그인 필요</span>
      </div>

      ${tiers.length > 1 ? `
        <div class="ai-interpret-tiers" data-role="tiers">
          ${tiers.map((t, i) => `
            <label class="ai-tier-option">
              <input type="radio" name="ai-tier-${game}" value="${i}" ${i === 0 ? 'checked' : ''} />
              ${t.label}
            </label>
          `).join('')}
        </div>
      ` : `<div class="ai-interpret-tiers-fixed">${tiers[0].label}</div>`}

      <button class="ai-interpret-btn" data-role="submit">AI 해석 요청</button>
      <div class="ai-interpret-status" data-role="status"></div>
      <div class="ai-interpret-result" data-role="result"></div>
    </div>
  `;

  const els = {
    credits: container.querySelector('[data-role="credits"]'),
    tiers: container.querySelector('[data-role="tiers"]'),
    submit: container.querySelector('[data-role="submit"]'),
    status: container.querySelector('[data-role="status"]'),
    result: container.querySelector('[data-role="result"]')
  };

  if (els.tiers) {
    els.tiers.addEventListener('change', (e) => {
      selectedTier = tiers[Number(e.target.value)];
    });
  }

  async function refreshCreditDisplay() {
    const balance = await getCreditBalance();
    els.credits.textContent = balance === null ? '로그인 필요' : `보유 크레딧: ${balance}`;
  }

  onAuthChange(async (user) => {
    if (user) await refreshCreditDisplay();
    else els.credits.textContent = '로그인 필요';
  });

  els.submit.addEventListener('click', async () => {
    els.status.textContent = '';
    els.result.innerHTML = '';

    const moves = getMoveList();
    if (!moves || moves.length === 0) {
      els.status.textContent = '먼저 복기할 대국을 불러와 주세요.';
      return;
    }

    els.submit.disabled = true;
    els.status.textContent = '로그인 확인 중...';

    try {
      await ensureLogin();
      await refreshCreditDisplay();

      els.status.textContent = `AI 해석 요청 중... (${selectedTier.credits}크레딧 차감)`;
      const idToken = await getIdToken();

      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          game,
          moves,
          highlightCount: selectedTier.count
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'INSUFFICIENT_CREDITS') {
          els.status.textContent = `크레딧이 부족합니다. (필요: ${data.required}, 보유: ${data.balance}) 관리자에게 충전을 요청해 주세요.`;
        } else {
          els.status.textContent = `해석 요청 실패: ${data.message || '알 수 없는 오류'}`;
        }
        return;
      }

      lastResult = data;
      renderResult(data);
      await refreshCreditDisplay();
      els.status.textContent = `완료 (남은 크레딧: ${data.remainingCredits})`;
    } catch (err) {
      console.error(err);
      els.status.textContent = `오류: ${err.message}`;
    } finally {
      els.submit.disabled = false;
    }
  });

  function renderResult(data) {
    const { summary, highlights } = data;

    const summaryHtml = `<p class="ai-summary-text">${escapeHtml(summary)}</p>`;

    const highlightsHtml = highlights.map((h) => {
      let boardSvg = '';
      try {
        const position = getPositionAtMove(h.moveIndex);
        boardSvg = renderMiniBoard(game, position, 160);
      } catch (err) {
        console.warn('하이라이트 국면 렌더 실패:', err);
        boardSvg = `<div class="ai-board-fallback">보드 렌더 실패</div>`;
      }
      return `
        <div class="ai-highlight-card">
          <div class="ai-highlight-board">${boardSvg}</div>
          <div class="ai-highlight-text">
            <div class="ai-highlight-move">${h.moveIndex}수 — ${escapeHtml(h.moveNotation)}</div>
            <div class="ai-highlight-comment">${escapeHtml(h.comment)}</div>
          </div>
        </div>
      `;
    }).join('');

    els.result.innerHTML = `
      <div class="ai-summary">${summaryHtml}</div>
      <div class="ai-highlights">${highlightsHtml}</div>
    `;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return { getLastResult: () => lastResult };
}
