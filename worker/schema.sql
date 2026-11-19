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
