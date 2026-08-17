// position-adapters.js
//
// AI가 지목한 "하이라이트 수(moveIndex)"의 실제 보드 국면은 AI에게 맡기지 않고,
// 이미 각 게임에 있는 리플레이 엔진(chess.js / ffish-es6)으로 클라이언트에서 직접 계산합니다.
// (LLM이 국면을 텍스트로 재구성하면 오류가 섞일 수 있어, 엔진이 계산한 실제 국면만 신뢰합니다.)
//
// 사용 흐름 예시 (바둑/체스/장기/쇼기/샹치 공통):
//   1. 저장된 복기 수순을 처음부터 moveIndex까지 엔진에 재생시킨다 (이미 "복기 재생" 기능에 있는 로직 재사용)
//   2. 엔진에서 FEN(또는 이에 준하는 국면 문자열)을 얻는다 — chess.js: game.fen(), ffish-es6: board.fen()
//   3. 아래 parseBoardFEN()으로 좌표별 기물 배열을 얻는다
//   4. mini-board-renderer.js 의 renderMiniBoard(game, {cols, rows, pieces, lastMove})에 넘긴다
//
// ⚠️ ffish-es6의 FEN 필드 순서/기물 표기는 변형마다 조금씩 다를 수 있습니다.
//    아래는 표준 FEN 랭크(rank) 구조('/'로 행 구분, 숫자는 빈칸 수, 알파벳은 기물)를 따르는
//    일반적인 경우를 처리합니다 — 실제 프로젝트에서 각 변형의 FEN 샘플로 한 번 검증해 주세요.

const DEFAULT_GLYPHS = {
  // chess.js 표준 기물 문자 → 유니코드 글리프 (필요시 자유롭게 교체)
  p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚'
};

/**
 * 표준 구조의 FEN 배치 필드를 파싱해 { col, row, glyph, color }[] 로 반환.
 * @param {string} fen - 전체 FEN 또는 배치 필드만(FEN의 첫 " " 앞부분)
 * @param {object} opts
 * @param {number} opts.cols
 * @param {number} opts.rows
 * @param {object} [opts.glyphs] - { 'p': '♟', ... } 소문자 기물기호 → 표시 글리프
 * @param {boolean} [opts.multiCharPieces=false] - 장기/샹치처럼 기물 표기가 여러 글자일 수 있는 경우
 */
export function parseBoardFEN(fen, opts) {
  const { cols, rows, glyphs = DEFAULT_GLYPHS } = opts;
  const placement = fen.split(' ')[0];
  const ranks = placement.split('/');
  if (ranks.length !== rows) {
    console.warn(`parseBoardFEN: 예상 행 수(${rows})와 FEN 행 수(${ranks.length})가 다릅니다. 변형별 FEN 포맷을 확인하세요.`);
  }

  const pieces = [];
  ranks.forEach((rankStr, rowIdx) => {
    let col = 0;
    let i = 0;
    while (i < rankStr.length && col < cols) {
      const ch = rankStr[i];
      if (/\d/.test(ch)) {
        // 숫자는 여러 자리일 수 있음(예: '10' — 큰 보드)
        let num = ch;
        while (i + 1 < rankStr.length && /\d/.test(rankStr[i + 1])) {
          i++;
          num += rankStr[i];
        }
        col += parseInt(num, 10);
      } else {
        const color = ch === ch.toUpperCase() ? 'white' : 'black';
        const key = ch.toLowerCase();
        pieces.push({
          col,
          row: rowIdx,
          x: col,   // 교차점형 렌더러 호환용 별칭
          y: rowIdx,
          color,
          glyph: glyphs[key] || ch
        });
        col += 1;
      }
      i++;
    }
  });

  return pieces;
}

/** chess.js 인스턴스에서 바로 미니보드용 포지션 객체 생성 */
export function positionFromChessJs(chessInstance) {
  return {
    cols: 8,
    rows: 8,
    pieces: parseBoardFEN(chessInstance.fen(), { cols: 8, rows: 8 })
  };
}

/**
 * ffish-es6 board 인스턴스(또는 fen 문자열)에서 미니보드용 포지션 객체 생성.
 * 게임별 보드 크기와 기물 글리프 맵을 넘겨주세요.
 *
 * 예)
 *   janggi:  { cols: 9,  rows: 10 }
 *   xiangqi: { cols: 9,  rows: 10 }
 *   shogi:   { cols: 9,  rows: 9  }
 */
export function positionFromFfish(fenOrBoard, { cols, rows, glyphs }) {
  const fen = typeof fenOrBoard === 'string' ? fenOrBoard : fenOrBoard.fen();
  return {
    cols,
    rows,
    pieces: parseBoardFEN(fen, { cols, rows, glyphs })
  };
}
