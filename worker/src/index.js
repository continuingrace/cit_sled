import { parseAllowedList, validateCardPayload, validateScorePayload } from './validation.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
};

const DEFAULT_ORIGIN = 'https://continuingrace.github.io';
const DEFAULT_HOSTNAME = 'continuingrace.github.io';

function json(body, status = 200, origin = '') {
  const headers = new Headers(JSON_HEADERS);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = parseAllowedList(env.ALLOWED_ORIGINS || DEFAULT_ORIGIN);
  return allowed.has(origin) ? origin : '';
}

function preflight(request, env) {
  const origin = allowedOrigin(request, env);
  if (!origin) return json({ error: '허용되지 않은 출처입니다.' }, 403);
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      'Vary': 'Origin'
    }
  });
}

async function hashIp(request, env) {
  if (!env.IP_HASH_SALT || env.IP_HASH_SALT.length < 32) throw new Error('IP_HASH_SALT is not configured');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const bytes = new TextEncoder().encode(`${env.IP_HASH_SALT}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function verifyTurnstile(token, request, env) {
  if (!env.TURNSTILE_SECRET_KEY) return false;
  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  form.set('remoteip', request.headers.get('CF-Connecting-IP') || '');
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form
  });
  if (!response.ok) return false;
  const result = await response.json();
  const allowed = parseAllowedList(env.ALLOWED_HOSTNAMES || DEFAULT_HOSTNAME);
  return result.success === true && allowed.has(result.hostname);
}

async function rateLimited(db, ipHash, action, now) {
  const shortWindow = now - 10 * 60;
  const dayWindow = now - 24 * 60 * 60;
  const shortMax = action === 'session' ? 10 : 5;
  const dayMax = action === 'session' ? 40 : 20;
  const result = await db.prepare(`
    SELECT
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS short_count,
      COUNT(*) AS day_count
    FROM rate_events
    WHERE ip_hash = ? AND action = ? AND created_at >= ?
  `).bind(shortWindow, ipHash, action, dayWindow).first();
  return Number(result?.short_count || 0) >= shortMax || Number(result?.day_count || 0) >= dayMax;
}

async function createSession(request, env, origin) {
  const now = Math.floor(Date.now() / 1000);
  const ipHash = await hashIp(request, env);
  if (await rateLimited(env.DB, ipHash, 'session', now)) {
    return json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429, origin);
  }
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO game_sessions (id, ip_hash, started_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(id, ipHash, now, now + 20 * 60),
    env.DB.prepare("INSERT INTO rate_events (ip_hash, action, created_at) VALUES (?, 'session', ?)")
      .bind(ipHash, now),
    env.DB.prepare('DELETE FROM game_sessions WHERE expires_at < ?').bind(now - 24 * 60 * 60),
    env.DB.prepare('DELETE FROM rate_events WHERE created_at < ?').bind(now - 2 * 24 * 60 * 60)
  ]);
  return json({ sessionId: id, expiresIn: 1200 }, 201, origin);
}

async function listScores(env, origin) {  const result = await env.DB.prepare(`
    SELECT name, score, time_sec AS timeSec, char, diff
    FROM sled_scores
    ORDER BY score DESC, time_sec ASC, created_at ASC
    LIMIT 30
  `).all();
  return json({ scores: result.results || [] }, 200, origin);
}

async function submitScore(request, env, origin) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 4096) return json({ error: '요청 크기가 너무 큽니다.' }, 413, origin);

  let raw;
  try {
    const text = await request.text();
    if (text.length > 4096) return json({ error: '요청 크기가 너무 큽니다.' }, 413, origin);
    raw = JSON.parse(text);
  } catch {
    return json({ error: 'JSON 요청만 허용됩니다.' }, 400, origin);
  }
  const checked = validateScorePayload(raw);
  if (!checked.ok) return json({ error: checked.error }, 400, origin);

  const now = Math.floor(Date.now() / 1000);
  const ipHash = await hashIp(request, env);
  if (await rateLimited(env.DB, ipHash, 'submit', now)) {
    return json({ error: '등록 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429, origin);
  }
  if (!(await verifyTurnstile(checked.value.turnstileToken, request, env))) {
    return json({ error: '보안 확인에 실패했습니다. 다시 시도해 주세요.' }, 403, origin);
  }

  const session = await env.DB.prepare(`
    SELECT id, started_at AS startedAt, expires_at AS expiresAt, used_at AS usedAt, ip_hash AS ipHash
    FROM game_sessions WHERE id = ?
  `).bind(checked.value.sessionId).first();
  if (!session || session.ipHash !== ipHash || session.usedAt || session.expiresAt < now) {
    return json({ error: '만료되었거나 이미 사용한 게임 세션입니다.' }, 409, origin);
  }
  const elapsed = now - session.startedAt;
  if (elapsed + 12 < checked.value.timeSec || elapsed > 20 * 60) {
    return json({ error: '게임 시간 검증에 실패했습니다.' }, 400, origin);
  }

  const consumed = await env.DB.prepare('UPDATE game_sessions SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .bind(now, session.id).run();
  if (Number(consumed.meta?.changes || 0) !== 1) {
    return json({ error: '이미 등록된 게임 세션입니다.' }, 409, origin);
  }

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO sled_scores (name, score, time_sec, char, diff, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      checked.value.name,
      checked.value.score,
      checked.value.timeSec,
      checked.value.char,
      checked.value.diff,
      now
    ),
    env.DB.prepare("INSERT INTO rate_events (ip_hash, action, created_at) VALUES (?, 'submit', ?)")
      .bind(ipHash, now)
  ]);
  return json({ ok: true }, 201, origin);
}

// ---------- 빈티지 크리스마스 카드 ----------
const CARD_LIST_LIMIT = 100;

async function listCards(env, origin) {
  const rows = await env.DB.prepare(`
    SELECT id, name, to_name AS toName, message, theme, stamp, created_at AS createdAt
    FROM cards
    ORDER BY id DESC
    LIMIT ${CARD_LIST_LIMIT}
  `).all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM cards').first();
  return json({ cards: rows.results || [], total: Number(total?.n || 0) }, 200, origin);
}

async function cardRateLimited(db, ipHash, now) {
  const shortWindow = now - 10 * 60;
  const dayWindow = now - 24 * 60 * 60;
  const result = await db.prepare(`
    SELECT
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS short_count,
      COUNT(*) AS day_count
    FROM card_rate_events
    WHERE ip_hash = ? AND created_at >= ?
  `).bind(shortWindow, ipHash, dayWindow).first();
  return Number(result?.short_count || 0) >= 3 || Number(result?.day_count || 0) >= 12;
}

async function submitCard(request, env, origin) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 4096) return json({ error: '요청 크기가 너무 큽니다.' }, 413, origin);

  let raw;
  try {
    const text = await request.text();
    if (text.length > 4096) return json({ error: '요청 크기가 너무 큽니다.' }, 413, origin);
    raw = JSON.parse(text);
  } catch {
    return json({ error: 'JSON 요청만 허용됩니다.' }, 400, origin);
  }
  const checked = validateCardPayload(raw);
  if (!checked.ok) return json({ error: checked.error }, 400, origin);

  const now = Math.floor(Date.now() / 1000);
  const ipHash = await hashIp(request, env);
  if (await cardRateLimited(env.DB, ipHash, now)) {
    return json({ error: '카드 등록 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429, origin);
  }
  if (!(await verifyTurnstile(checked.value.turnstileToken, request, env))) {
    return json({ error: '보안 확인에 실패했습니다. 다시 시도해 주세요.' }, 403, origin);
  }

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO cards (name, to_name, message, theme, stamp, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(checked.value.name, checked.value.toName, checked.value.message, checked.value.theme, checked.value.stamp, now),
    env.DB.prepare('INSERT INTO card_rate_events (ip_hash, created_at) VALUES (?, ?)').bind(ipHash, now),
    env.DB.prepare('DELETE FROM card_rate_events WHERE created_at < ?').bind(now - 2 * 24 * 60 * 60)
  ]);
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM cards').first();
  return json({ ok: true, total: Number(total?.n || 0) }, 201, origin);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') return preflight(request, env);

      const origin = allowedOrigin(request, env);
      if (!origin) return json({ error: '허용되지 않은 출처입니다.' }, 403);

      if (request.method === 'GET' && url.pathname === '/v1/scores') return listScores(env, origin);
      if (request.method === 'GET' && url.pathname === '/v1/cards') return listCards(env, origin);
      if (request.method === 'POST' && url.pathname === '/v1/cards') return submitCard(request, env, origin);
      if (request.method === 'POST' && url.pathname === '/v1/session') return createSession(request, env, origin);
      if (request.method === 'POST' && url.pathname === '/v1/scores') return submitScore(request, env, origin);
      return json({ error: '찾을 수 없습니다.' }, 404, origin);
    } catch (error) {
      console.error('request_failed', error instanceof Error ? error.message : 'unknown');
      return json({ error: '서버 오류가 발생했습니다.' }, 500, allowedOrigin(request, env));
    }
  }
};
