// api/interpret.js
// Vercel 서버리스 함수. board-arena 레포의 /api/interpret.js 로 그대로 배치하세요.
//
// 필요한 환경변수 (Vercel 프로젝트 설정 → Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT_KEY : Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 →
//                                  "새 비공개 키 생성"으로 받은 JSON 전체를 문자열로 붙여넣기
//   ANTHROPIC_API_KEY            : console.anthropic.com 에서 발급한 API 키
//
// 필요한 의존성 (package.json):
//   { "dependencies": { "firebase-admin": "^12.0.0" } }
//
// ⚠️ 이 파일은 Node.js 런타임(Vercel 기본값)을 전제로 합니다. Edge 런타임으로 바꾸려면
//   firebase-admin 대신 Web Crypto 기반 토큰 검증으로 교체해야 합니다.

import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// 게임별 하이라이트 단가 (프론트 review-interpret-panel.js 의 TIER_CONFIG와 반드시 일치시킬 것)
const CREDIT_COST = {
  go: { 5: 1, 10: 2 },
  chess: { 5: 1 },
  janggi: { 5: 1 },
  shogi: { 5: 1 },
  xiangqi: { 5: 1 }
};

const GAME_LABEL = {
  go: '바둑',
  chess: '체스',
  janggi: '장기',
  shogi: '쇼기',
  xiangqi: '샹치'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'POST만 허용됩니다.' });
  }

  const { idToken, game, moves, highlightCount } = req.body || {};

  if (!idToken || !game || !Array.isArray(moves) || moves.length === 0 || !highlightCount) {
    return res.status(400).json({ code: 'BAD_REQUEST', message: '필수 파라미터가 누락되었습니다.' });
  }

  const cost = CREDIT_COST[game]?.[highlightCount];
  if (cost === undefined) {
    return res.status(400).json({ code: 'BAD_REQUEST', message: `지원하지 않는 game/highlightCount 조합입니다: ${game}/${highlightCount}` });
  }

  // 1) 사용자 인증
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
  }
  const uid = decoded.uid;

  // 2) 크레딧 확인 + 차감 (트랜잭션으로 원자적 처리 — 동시 요청으로 인한 이중 차감 방지)
  const userRef = db.collection('users').doc(uid);
  let remainingCredits;
  try {
    remainingCredits = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const current = snap.exists ? (snap.data().credits ?? 0) : 0;
      if (current < cost) {
        const err = new Error('INSUFFICIENT_CREDITS');
        err.code = 'INSUFFICIENT_CREDITS';
        err.balance = current;
        throw err;
      }
      const next = current - cost;
      tx.set(userRef, { credits: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return next;
    });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_CREDITS') {
      return res.status(402).json({
        code: 'INSUFFICIENT_CREDITS',
        message: '크레딧이 부족합니다.',
        required: cost,
        balance: err.balance
      });
    }
    console.error(err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: '크레딧 처리 중 오류가 발생했습니다.' });
  }

  // 3) Anthropic API 호출 — 구조화된 JSON만 받도록 프롬프트로 강제
  let aiResult;
  try {
    aiResult = await requestInterpretation({ game, moves, highlightCount });
  } catch (err) {
    console.error('Anthropic API 오류:', err);
    // AI 호출이 실패하면 방금 차감한 크레딧을 환불합니다.
    await userRef.set(
      { credits: admin.firestore.FieldValue.increment(cost), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    return res.status(502).json({ code: 'AI_ERROR', message: 'AI 해석 생성에 실패했습니다. 크레딧은 환불되었습니다.' });
  }

  // 4) 요청 로그 저장 (감사/디버깅용, 클라이언트에서는 직접 쓸 수 없음 — firestore.rules 참고)
  try {
    await db.collection('interpretations').add({
      uid,
      game,
      moves,
      highlightCount,
      creditsCost: cost,
      summary: aiResult.summary,
      highlights: aiResult.highlights,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    // 로그 저장 실패는 사용자 응답을 막을 이유가 아니므로 경고만 남김
    console.warn('interpretations 로그 저장 실패:', err);
  }

  return res.status(200).json({
    summary: aiResult.summary,
    highlights: aiResult.highlights,
    remainingCredits
  });
}

async function requestInterpretation({ game, moves, highlightCount }) {
  const label = GAME_LABEL[game] || game;

  const systemPrompt = `당신은 ${label} 전문 해설가입니다. 주어진 대국 수순을 분석해서 반드시 아래 JSON 스키마로만 응답하세요.
텍스트 설명, 마크다운 코드블록, 그 어떤 부가 텍스트도 없이 순수 JSON 객체 하나만 출력하세요.

스키마:
{
  "summary": string,            // 대국 전체 총평, 3~6문장, 한국어
  "highlights": [
    {
      "moveIndex": number,      // 1부터 시작하는 수 번호 (moves 배열의 인덱스+1)
      "moveNotation": string,   // 해당 수의 기보 표기 (입력받은 moves 배열의 값을 그대로 사용)
      "comment": string         // 이 수가 왜 중요한지/좋았는지·나빴는지에 대한 해설, 2~4문장
    }
  ]
}

규칙:
- highlights 배열은 정확히 ${highlightCount}개여야 합니다.
- moveIndex는 실제 입력받은 수순 범위(1~${moves.length}) 안에서만 골라야 합니다.
- 대국 전체 흐름에서 실제로 국면 평가가 바뀌거나 결정적이었던 수 위주로 고르세요(단순히 균등 간격으로 뽑지 마세요).
- comment는 단순히 "정답"이라고 선언하지 말고, 왜 그런지 이유를 설명하세요.`;

  const userPrompt = `다음은 ${label} 한 판의 전체 수순입니다 (인덱스 1부터):
${moves.map((m, i) => `${i + 1}. ${m}`).join('\n')}

이 대국을 분석해서 지정된 JSON 스키마로 응답하세요.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${text}`);
  }

  const data = await response.json();
  const text = data.content.map((b) => (b.type === 'text' ? b.text : '')).join('');

  let parsed;
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`AI 응답 JSON 파싱 실패: ${text.slice(0, 300)}`);
  }

  if (!parsed.summary || !Array.isArray(parsed.highlights)) {
    throw new Error('AI 응답이 스키마를 따르지 않습니다.');
  }

  return parsed;
}
