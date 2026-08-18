// api/chess-engine.js
// Vercel 서버리스 함수: 요청마다 Stockfish WASM을 새로 초기화해서(상태 없음)
// 지금까지의 수순을 반영하고 다음 최선의 수를 반환한다.
//
// [수정] bestmove를 받은 뒤 UCI 표준 종료 명령 'quit'을 추가로 보내서
// 엔진 내부 탐색 스레드/상태가 정리되도록 함. (warm container 재사용 시
// 메모리가 누적되는 문제의 근본 해결은 아닐 수 있지만, 프로토콜상 안전한 조치)

// Node 18+의 전역 fetch가 emscripten 로더의 로컬 파일 로딩과 충돌하는 문제 회피
delete global.fetch;

const path = require('path');
const initEngine = require(path.join(__dirname, '..', 'engines', 'chess', 'sf-loader.js'));
const ENGINE_PATH = path.join(__dirname, '..', 'engines', 'chess', 'stockfish-18-lite-single.js');

function runStockfish(commands, timeoutMs = 15000) {
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
      // [임시 진단] 실제로 어떤 줄이 오는지 원래 console.log로도 남김 (Vercel Logs에서 확인용)
      originalLog('[ENGINE OUT]', line);
      if (line.startsWith('bestmove')) {
        const bestmove = line.split(' ')[1];
        finish(() => resolve(bestmove));
      }
    };

    // [임시 진단] 명령을 실제로 보내기 직전/직후도 로그로 남김
    originalLog('[ENGINE CMDS]', JSON.stringify(commands));

    initEngine(ENGINE_PATH)
      .then((engine) => {
        originalLog('[ENGINE] 로드 완료, 명령 전송 시작');
        for (const c of commands) {
          originalLog('[ENGINE SEND]', c);
          engine.sendCommand(c);
        }
        // bestmove 수신 후 엔진에 종료를 알림 (UCI 표준 명령)
        // finish()가 이미 console.log를 원상복구했을 수 있으니 별도 타이머로 살짝 지연
        setTimeout(() => {
          try { engine.sendCommand('quit'); } catch (e) { /* 무시 */ }
        }, 50);
      })
      .catch((err) => {
        originalLog('[ENGINE] 로드 자체 실패:', err && err.message);
        finish(() => reject(err));
      });
  });
}

module.exports = async (req, res) => {
  // warm container 재사용 시 WASM 엔진의 내부 상태(리스너, 메모리 등)가 남아
  // 다음 요청을 멈추게 만드는 문제가 확인되어, 응답이 실제로 전송 완료된 직후
  // 프로세스를 강제 종료합니다. 다음 요청은 항상 새 컨테이너(cold start)에서
  // 시작되어 조금 느려지지만 확실히 응답합니다.
  res.on('finish', () => process.exit(0));

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다' });
    return;
  }

  try {
    const { moves = [], depth = 12, fen = null } = req.body;

    const positionCmd = fen
      ? `position fen ${fen}${moves.length ? ' moves ' + moves.join(' ') : ''}`
      : `position startpos${moves.length ? ' moves ' + moves.join(' ') : ''}`;

    const commands = ['uci', 'isready', positionCmd, `go depth ${depth} movetime 8000`];

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
