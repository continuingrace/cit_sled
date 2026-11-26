const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);

// 빈티지 카드: 종이 테마와 우표 종류는 이 네 가지만 허용한다.
const CARD_THEMES = new Set(['cream', 'kraft', 'sage', 'ruby']);
const CARD_STAMPS = new Set(['tree', 'bell', 'santa', 'wreath', 'star']);

// 아주 기본적인 비속어·광고/도박/대출 차단 목록 (필요하면 이 배열만 늘리면 된다).
const CARD_BLOCKED_WORDS = [
  '씨발', '시발', 'ㅅㅂ', '병신', 'ㅄ', '개새끼', '좆', '지랄', '꺼져', '엿먹',
  'fuck', 'shit', 'bitch', 'porn', 'sex', 'xxx',
  '카지노', '바카라', '토토', '도박', '스포츠토토', '야동', '성인사이트',
  '대출', '선입금', '계좌이체', '부업', '수익보장', '고수익',
  '광고', '홍보', '카톡', '카카오톡', '텔레그램', '오픈채팅'
];

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

export function validateCardPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: '잘못된 요청입니다.' };
  }

  const allowed = new Set(['turnstileToken', 'name', 'toName', 'message', 'theme', 'stamp']);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { ok: false, error: '허용되지 않은 항목이 있습니다.' };
  }

  const turnstileToken = typeof value.turnstileToken === 'string' ? value.turnstileToken.trim() : '';
  const rawName = typeof value.name === 'string' ? value.name.normalize('NFC') : '';
  const rawMessage = typeof value.message === 'string' ? value.message.normalize('NFC') : '';
  const name = rawName.trim();
  const rawTo = typeof value.toName === 'string' ? value.toName.normalize('NFC') : '';
  const toName = rawTo.trim() || '모두에게';
  const message = rawMessage.replace(/\r\n?/g, '\n').trim();

  if (!turnstileToken || turnstileToken.length > 2048) {
    return { ok: false, error: '보안 확인이 필요합니다.' };
  }
  if (name.length < 1 || name.length > 12 || /[\u0000-\u001f\u007f]/u.test(rawName)) {
    return { ok: false, error: '이름은 제어문자 없이 1~12자로 입력해 주세요.' };
  }
  if (toName.length > 12 || /[\u0000-\u001f\u007f]/u.test(rawTo)) {
    return { ok: false, error: '받는 분은 제어문자 없이 12자까지 입력할 수 있습니다.' };
  }
  if (message.length < 1 || message.length > 140) {
    return { ok: false, error: '카드 내용은 1~140자로 입력해 주세요.' };
  }
  // 줄바꿈(\n)만 허용하고 나머지 제어문자는 거부한다.
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(rawMessage)) {
    return { ok: false, error: '카드 내용에 쓸 수 없는 문자가 있습니다.' };
  }

  const text = `${name}\n${toName}\n${message}`.toLowerCase();
  if (/[<>]/.test(text)) {
    return { ok: false, error: '< > 기호는 사용할 수 없습니다.' };
  }
  if (/(https?:\/\/|www\.)/i.test(text)) {
    return { ok: false, error: '링크 주소는 사용할 수 없습니다.' };
  }
  if (text.includes('@')) {
    return { ok: false, error: '연락처나 링크는 사용할 수 없습니다.' };
  }
  if (/\d{5,}/.test(text)) {
    return { ok: false, error: '전화번호·계좌번호 같은 숫자는 사용할 수 없습니다.' };
  }
  if (/(.)\1{9,}/u.test(text)) {
    return { ok: false, error: '같은 글자를 너무 많이 반복할 수 없습니다.' };
  }
  if (CARD_BLOCKED_WORDS.some((word) => text.includes(word))) {
    return { ok: false, error: '사용할 수 없는 단어가 들어 있습니다.' };
  }
  if (typeof value.theme !== 'string' || !CARD_THEMES.has(value.theme)) {
    return { ok: false, error: '카드 종이가 올바르지 않습니다.' };
  }
  if (typeof value.stamp !== 'string' || !CARD_STAMPS.has(value.stamp)) {
    return { ok: false, error: '우표가 올바르지 않습니다.' };
  }

  return {
    ok: true,
    value: { turnstileToken, name, toName, message, theme: value.theme, stamp: value.stamp }
  };
}

export function parseAllowedList(value) {
  return new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean));
}
