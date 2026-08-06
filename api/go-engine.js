// api/go-engine.js
// Vercel 서버리스 함수: 요청마다 정적 GNU Go 바이너리를 새로 띄워서
// 지금까지의 수순을 재생하고, genmove(다음 수) 또는 status(사활 판정)를 반환한다.
// 서버리스 함수는 요청마다 상태가 초기화되므로, 매번 전체 히스토리를 replay한다.

const { spawn } = require('child_process');
const path = require('path');

const GNUGO_PATH = path.join(process.cwd(), 'api', 'bin', 'gnugo');
const LETTERS = 'ABCDEFGHJKLMNOPQRST'; // GTP 좌표 (I 제외)

function xyToVertex(x, y, size) {
  return `${LETTERS[x]}${size - y}`;
}

function vertexToXY(vertex, size) {
  const col = vertex[0].toUpperCase();
  const row = parseInt(vertex.slice(1), 10);
  const x = LETTERS.indexOf(col);
  const y = size - row;
  return { x, y };
}

/** GTP 서브프로세스와 명령어 목록을 순서대로 주고받고, 각 응답을 배열로 반환 */
function runGtpCommands(commands, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(GNUGO_PATH, ['--mode', 'gtp', '--quiet']);
    let buffer = '';
    const responses = [];
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        reject(new Error('GNU Go timeout'));
      }
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        responses.push(raw.replace(/^=\s*/, '').trim());
        if (responses.length === commands.length) {
          resolved = true;
          clearTimeout(timer);
          proc.stdin.end();
          proc.kill();
          resolve(responses);
        }
      }
    });

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    proc.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(responses);
      }
    });

    for (const c of commands) {
      proc.stdin.write(c + '\n');
    }
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다' });
    return;
  }

  try {
    const { size = 9, komi = 6.5, history = [], action, color, targetX, targetY } = req.body;

    const commands = [
      `boardsize ${size}`,
      'clear_board',
      `komi ${komi}`,
    ];
    for (const mv of history) {
      if (mv.pass) continue;
      const vertex = xyToVertex(mv.x, mv.y, size);
      commands.push(`play ${mv.color === 'B' ? 'black' : 'white'} ${vertex}`);
    }

    if (action === 'genmove') {
      const mvColor = color === 'B' ? 'black' : 'white';
      commands.push(`genmove ${mvColor}`);
    } else if (action === 'status') {
      const vertex = xyToVertex(targetX, targetY, size);
      commands.push(`owl_attack ${vertex}`);
      commands.push(`owl_defend ${vertex}`);
    } else {
      res.status(400).json({ error: 'action은 genmove 또는 status여야 합니다' });
      return;
    }

    const responses = await runGtpCommands(commands);
    const last = responses.slice(-(action === 'status' ? 2 : 1));

    if (action === 'genmove') {
      const mv = last[0].trim();
      if (mv.toUpperCase() === 'PASS' || mv.toUpperCase() === 'RESIGN') {
        res.status(200).json({ pass: true });
      } else {
        const { x, y } = vertexToXY(mv, size);
        res.status(200).json({ x, y });
      }
    } else {
      const [attackRaw, defendRaw] = last;
      const attackParts = attackRaw.trim().split(/\s+/);
      const defendParts = defendRaw.trim().split(/\s+/);
      res.status(200).json({
        attackCode: parseInt(attackParts[0], 10) || 0,
        attackPoint: attackParts[1] || null,
        defendCode: parseInt(defendParts[0], 10) || 0,
        defendPoint: defendParts[1] || null,
      });
    }
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
