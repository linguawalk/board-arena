// api/variant-engine.js
// 장기, 샹치, 쇼기, 막룩 등 Fairy-Stockfish가 지원하는 모든 변형게임을 공용으로 처리하는 서버리스 함수.
// 요청의 variant 값만 바꾸면 같은 엔진으로 다른 게임을 둘 수 있다.

delete global.fetch;

const path = require('path');
const Stockfish = require(path.join(__dirname, '..', 'engines', 'variant', 'stockfish.js'));

const SUPPORTED_VARIANTS = new Set([
  'janggi', 'janggicasual', 'janggimodern', 'janggitraditional',
  'xiangqi', 'minixiangqi',
  'shogi', 'minishogi', 'kyotoshogi', 'euroshogi',
  'makruk', 'ai-wok', 'asean', 'cambodian', 'karouk',
  'shatranj', 'sittuyin', 'shatar', 'chaturanga',
]);

function runFairyStockfish(commands, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Fairy-Stockfish timeout'));
      }
    }, timeoutMs);

    Stockfish()
      .then((engine) => {
        engine.addMessageListener((line) => {
          if (typeof line === 'string' && line.startsWith('bestmove')) {
            const bestmove = line.split(' ')[1];
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              try { engine.terminate(); } catch (e) {}
              resolve(bestmove);
            }
          }
        });
        for (const c of commands) {
          engine.postMessage(c);
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다' });
    return;
  }

  try {
    const { variant, moves = [], depth = 10, fen = null } = req.body;

    if (!variant || !SUPPORTED_VARIANTS.has(variant)) {
      res.status(400).json({ error: `지원하지 않는 variant입니다: ${variant}` });
      return;
    }

    const positionCmd = fen
      ? `position fen ${fen}${moves.length ? ' moves ' + moves.join(' ') : ''}`
      : `position startpos${moves.length ? ' moves ' + moves.join(' ') : ''}`;

    const commands = [
      'uci',
      `setoption name UCI_Variant value ${variant}`,
      'isready',
      positionCmd,
      `go depth ${depth}`,
    ];

    const bestmove = await runFairyStockfish(commands);

    if (!bestmove || bestmove === '(none)') {
      res.status(200).json({ gameOver: true });
      return;
    }

    res.status(200).json({ uci: bestmove });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
