const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);

export function validateScorePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: '잘못된 요청입니다.' };
  }

  const allowed = new Set(['sessionId', 'turnstileToken', 'name', 'score', 'timeSec', 'char', 'diff']);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: '허용되지 않은 항목이 있습니다.' };
  }

  const sessionId = typeof value.sessionId === 'string' ? value.sessionId.trim() : '';
  const turnstileToken = typeof value.turnstileToken === 'string' ? value.turnstileToken.trim() : '';
  const rawName = typeof value.name === 'string' ? value.name.normalize('NFC') : '';
  const name = rawName.trim();
  const score = value.score;
  const timeSec = value.timeSec;
  const char = value.char;
  const diff = value.diff;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    return { ok: false, error: '게임 세션이 올바르지 않습니다.' };
  }
  if (!turnstileToken || turnstileToken.length > 2048) {
    return { ok: false, error: '보안 확인이 필요합니다.' };
  }
  if (name.length < 1 || name.length > 10 || /[\u0000-\u001f\u007f]/u.test(rawName)) {
    return { ok: false, error: '이름은 제어문자 없이 1~10자로 입력해 주세요.' };
  }
  if (!Number.isInteger(score) || score < 0 || score > 20000) {
    return { ok: false, error: '점수가 올바르지 않습니다.' };
  }
  if (typeof timeSec !== 'number' || !Number.isFinite(timeSec) || timeSec < 20 || timeSec > 900) {
    return { ok: false, error: '기록 시간이 올바르지 않습니다.' };
  }
  if (!Number.isInteger(char) || char < 0 || char > 3) {
    return { ok: false, error: '캐릭터가 올바르지 않습니다.' };
  }
  if (typeof diff !== 'string' || !DIFFICULTIES.has(diff)) {
    return { ok: false, error: '난이도가 올바르지 않습니다.' };
  }

  return {
    ok: true,
    value: {
      sessionId,
      turnstileToken,
      name,
      score,
      timeSec: Math.round(timeSec * 100) / 100,
      char,
      diff
    }
  };
}

export function parseAllowedList(value) {
  return new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean));
}
