// api/chess-engine.js
// Vercel 서버리스 함수: 요청마다 Stockfish WASM을 새로 초기화해서(상태 없음)
// 지금까지의 수순을 반영하고 다음 최선의 수를 반환한다.

// Node 18+의 전역 fetch가 emscripten 로더의 로컬 파일 로딩과 충돌하는 문제 회피
delete global.fetch;

const path = require('path');
const initEngine = require(path.join(__dirname, '..', 'engines', 'chess', 'sf-loader.js'));
const ENGINE_PATH = path.join(__dirname, '..', 'engines', 'chess', 'stockfish-18-lite-single.js');

function runStockfish(commands, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const originalLog = console.log;

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      console.log = originalLog;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error('Stockfish timeout')));
    }, timeoutMs);

    console.log = (...args) => {
      const line = args.join(' ');
      if (line.startsWith('bestmove')) {
        const bestmove = line.split(' ')[1];
        finish(() => resolve(bestmove));
      }
    };

    initEngine(ENGINE_PATH)
      .then((engine) => {
        for (const c of commands) {
          engine.sendCommand(c);
        }
      })
      .catch((err) => {
        finish(() => reject(err));
      });
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다' });
    return;
  }

  try {
    const { moves = [], depth = 12, fen = null } = req.body;

    const positionCmd = fen
      ? `position fen ${fen}${moves.length ? ' moves ' + moves.join(' ') : ''}`
      : `position startpos${moves.length ? ' moves ' + moves.join(' ') : ''}`;

    const commands = ['uci', 'isready', positionCmd, `go depth ${depth}`];

    const bestmove = await runStockfish(commands);

    if (!bestmove || bestmove === '(none)') {
      res.status(200).json({ gameOver: true });
      return;
    }

    // UCI 무브(예: "e2e4", 프로모션은 "e7e8q")를 파싱해서 좌표 형태로도 함께 제공
    const from = bestmove.slice(0, 2);
    const to = bestmove.slice(2, 4);
    const promotion = bestmove.length > 4 ? bestmove[4] : null;

    res.status(200).json({ uci: bestmove, from, to, promotion });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
