// api/analyze-chess.js
// Vercel 서버리스 함수: chess-engine.js와 같은 Stockfish 바이너리를 쓰되,
// "최선수 하나"가 아니라 MultiPV로 "상위 N개 후보수 + 각각의 평가값"을 반환한다.
//
// 용도:
//   - 퀴즈 다중정답 판정: 후보수 중 최선수와 점수 차이가 작은 것들 = 동등한 정답
//   - AI 해석: 대국 전체를 한 수씩 태워서 평가값 변화(승률 그래프)를 추적
//
// chess-engine.js를 건드리지 않고 별도 파일로 분리했습니다 (실시간 AI 대국 기능에 영향 없음).

delete global.fetch;

const path = require('path');
const initEngine = require(path.join(__dirname, '..', 'engines', 'chess', 'sf-loader.js'));
const ENGINE_PATH = path.join(__dirname, '..', 'engines', 'chess', 'stockfish-18-lite-single.js');

/**
 * UCI 엔진에 명령을 보내고, 'bestmove'가 나올 때까지 모든 'info' 라인을 수집해서
 * multipv 순위별 최신 평가값/후보수를 반환한다.
 */
function runAnalysis(commands, multipv, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const originalLog = console.log;
    const linesByRank = new Map(); // multipv 순위 -> {scoreCp, scoreMate, pv}

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      console.log = originalLog;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error('Stockfish analysis timeout')));
    }, timeoutMs);

    console.log = (...args) => {
      const line = args.join(' ');

      if (line.startsWith('info') && line.includes(' pv ')) {
        const rankMatch = line.match(/multipv (\d+)/);
        const rank = rankMatch ? parseInt(rankMatch[1], 10) : 1;

        const cpMatch = line.match(/score cp (-?\d+)/);
        const mateMatch = line.match(/score mate (-?\d+)/);
        const pvMatch = line.match(/ pv (.+)$/);

        if (pvMatch) {
          linesByRank.set(rank, {
            rank,
            scoreCp: cpMatch ? parseInt(cpMatch[1], 10) : null,
            scoreMate: mateMatch ? parseInt(mateMatch[1], 10) : null,
            pv: pvMatch[1].trim().split(' '),
          });
        }
      }

      if (line.startsWith('bestmove')) {
        const bestmove = line.split(' ')[1];
        finish(() => resolve({ bestmove, lines: [...linesByRank.values()].sort((a, b) => a.rank - b.rank) }));
      }
    };

    initEngine(ENGINE_PATH)
      .then((engine) => {
        for (const c of commands) engine.sendCommand(c);
      })
      .catch((err) => finish(() => reject(err)));
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다' });
    return;
  }

  try {
    const { moves = [], depth = 16, fen = null, multipv = 3 } = req.body;

    const positionCmd = fen
      ? `position fen ${fen}${moves.length ? ' moves ' + moves.join(' ') : ''}`
      : `position startpos${moves.length ? ' moves ' + moves.join(' ') : ''}`;

    const commands = [
      'uci',
      `setoption name MultiPV value ${multipv}`,
      'isready',
      positionCmd,
      `go depth ${depth} movetime 12000`,
    ];

    const result = await runAnalysis(commands, multipv);

    if (!result.bestmove || result.bestmove === '(none)') {
      res.status(200).json({ gameOver: true });
      return;
    }

    // 백분율 승률 근사치도 함께 제공 (Stockfish 공식 사이트가 쓰는 근사 공식과 동일 계열)
    const withWinPercent = result.lines.map((l) => ({
      ...l,
      winPercent: l.scoreMate !== null
        ? (l.scoreMate > 0 ? 100 : 0)
        : Math.round(100 / (1 + Math.exp(-0.00368208 * l.scoreCp)) * 10) / 10,
    }));

    res.status(200).json({ bestmove: result.bestmove, lines: withWinPercent });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
