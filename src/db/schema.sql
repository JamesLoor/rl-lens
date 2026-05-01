CREATE TABLE IF NOT EXISTS matches (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id            TEXT    NOT NULL,
  playlist            TEXT    NOT NULL DEFAULT 'unknown',
  won                 INTEGER,
  own_score           INTEGER NOT NULL DEFAULT 0,
  opp_score           INTEGER NOT NULL DEFAULT 0,
  duration_seconds    REAL    NOT NULL DEFAULT 0,
  played_at           INTEGER NOT NULL,
  shots               INTEGER NOT NULL DEFAULT 0,
  goals               INTEGER NOT NULL DEFAULT 0,
  saves               INTEGER NOT NULL DEFAULT 0,
  assists             INTEGER NOT NULL DEFAULT 0,
  demos_inflicted     INTEGER NOT NULL DEFAULT 0,
  demos_received      INTEGER NOT NULL DEFAULT 0,
  touches             INTEGER NOT NULL DEFAULT 0,
  boost_starvation_pct REAL   NOT NULL DEFAULT -1
);
