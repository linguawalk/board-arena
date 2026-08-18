// api/analyze-variant.js
// variant-engine.js와 같은 Fairy-Stockfish를 쓰되, MultiPV로 후보수+평가값을 반환.
// 장기(janggi)/샹치(xiangqi)/쇼기(shogi) 모두 이 하나의 엔드포인트로 커버됩니다.

delete global.fetch;

const path = require('path');
const Stockfish = require(path.join(__dirname, '..', 'engines', 'variant', 'stockfish.js'));

const SUPPORTED_VARIANTS = new Set([
  'janggi', 'janggicasual', 'janggimodern', 'janggitraditional',
  'xiangqi', 'minixiangqi',
  'shogi', 'minishogi', 'kyotoshogi', 'euroshogi',
  'makruk', 'ai-wok', 'asean', 'cambodian', 'karouk',
  'shatranj', 'sittuyin', 'shatar', 'chaturanga',
  'kingofthehill', '3check', 'atomic', 'crazyhouse', 'horde', 'racingkings', 'fischerandom',
]);

function runFairyAnalysis(commands, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const linesByRank = new Map();

    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('Fairy-Stockfish analysis timeout')); }
    }, timeoutMs);

    Stockfish().then((engine) => {
      engine.addMessageListener((line) => {
        if (typeof line !== 'string') return;

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
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { engine.terminate(); } catch (e) {}
            resolve({ bestmove, lines: [...linesByRank.values()].sort((a, b) => a.rank - b.rank) });
          }
        }
      });
      for (const c of commands) engine.postMessage(c);
    }).catch((err) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(err); }
    });
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST만 지원합니다' }); return; }
  try {
    const { variant, moves = [], depth = 14, fen = null, multipv = 3 } = req.body;
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
      `setoption name MultiPV value ${multipv}`,
      'isready',
      positionCmd,
      `go depth ${depth} movetime 12000`,
    ];
    const result = await runFairyAnalysis(commands);
    if (!result.bestmove || result.bestmove === '(none)') { res.status(200).json({ gameOver: true }); return; }

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
