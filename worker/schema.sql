CREATE TABLE IF NOT EXISTS sled_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 10),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 20000),
  time_sec REAL NOT NULL CHECK (time_sec BETWEEN 20 AND 900),
  char INTEGER NOT NULL CHECK (char BETWEEN 0 AND 3),
  diff TEXT NOT NULL CHECK (diff IN ('easy', 'normal', 'hard')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sled_scores_rank
  ON sled_scores(score DESC, time_sec ASC, created_at ASC);

CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_expiry
  ON game_sessions(expires_at);

CREATE TABLE IF NOT EXISTS rate_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('session', 'submit')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_events_lookup
  ON rate_events(ip_hash, action, created_at);

-- 결승 트리에 거는 빈티지 크리스마스 카드
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 12),
  to_name TEXT NOT NULL DEFAULT '모두에게' CHECK (length(trim(to_name)) BETWEEN 1 AND 12),
  message TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 140),
  theme TEXT NOT NULL CHECK (theme IN ('cream', 'kraft', 'sage', 'ruby')),
  stamp TEXT NOT NULL CHECK (stamp IN ('tree', 'bell', 'santa', 'star')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_recent
  ON cards(id DESC);

-- 카드 등록 레이트리밋 (기존 rate_events의 action CHECK 제약을 건드리지 않도록 분리)
CREATE TABLE IF NOT EXISTS card_rate_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_card_rate_events_lookup
  ON card_rate_events(ip_hash, created_at);
