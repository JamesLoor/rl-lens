import Database from 'better-sqlite3';
import { HistoricalAverages } from '../insights/rules';
import type { MatchResult } from '../match/analyzer';
import type { MatchBuffer, StateSample } from '../match/collector';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS matches (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id             TEXT    NOT NULL,
  playlist             TEXT    NOT NULL DEFAULT 'unknown',
  won                  INTEGER,
  own_score            INTEGER NOT NULL DEFAULT 0,
  opp_score            INTEGER NOT NULL DEFAULT 0,
  duration_seconds     REAL    NOT NULL DEFAULT 0,
  played_at            INTEGER NOT NULL,
  shots                INTEGER NOT NULL DEFAULT 0,
  goals                INTEGER NOT NULL DEFAULT 0,
  saves                INTEGER NOT NULL DEFAULT 0,
  assists              INTEGER NOT NULL DEFAULT 0,
  demos_inflicted      INTEGER NOT NULL DEFAULT 0,
  demos_received       INTEGER NOT NULL DEFAULT 0,
  touches              INTEGER NOT NULL DEFAULT 0,
  boost_starvation_pct REAL    NOT NULL DEFAULT -1,
  raw_buffer           TEXT
);
`;

export interface DB {
  insertMatch(result: MatchResult, buffer: MatchBuffer): number;
  getRecentStats(n: number, playlist: string): HistoricalAverages;
}

interface MatchRow {
  shots: number;
  goals: number;
  saves: number;
  touches: number;
  duration_seconds: number;
  boost_starvation_pct: number;
}

// Keep 1 sample per 200ms (5Hz) — enough to accurately capture short events
// like boost dips, supersonic bursts, and air time without aliasing artifacts.
// A 5-min match produces ~1500 samples (~1-2MB).
function subsampleStates(samples: StateSample[]): StateSample[] {
  let lastTs = -Infinity;
  return samples.filter(s => {
    if (s.timestamp - lastTs >= 200) {
      lastTs = s.timestamp;
      return true;
    }
    return false;
  });
}

export function createDB(dbPath: string): DB {
  const db = new Database(dbPath);
  db.exec(SCHEMA);

  // Migration: add raw_buffer to existing installs that predate this column
  try {
    db.exec('ALTER TABLE matches ADD COLUMN raw_buffer TEXT');
  } catch { /* column already exists */ }

  const insertStmt = db.prepare(`
    INSERT INTO matches (
      match_id, playlist, won, own_score, opp_score,
      duration_seconds, played_at,
      shots, goals, saves, assists,
      demos_inflicted, demos_received, touches, boost_starvation_pct,
      raw_buffer
    ) VALUES (
      @match_id, @playlist, @won, @own_score, @opp_score,
      @duration_seconds, @played_at,
      @shots, @goals, @saves, @assists,
      @demos_inflicted, @demos_received, @touches, @boost_starvation_pct,
      @raw_buffer
    )
  `);

  const recentStmt = db.prepare<[string, number], MatchRow>(`
    SELECT shots, goals, saves, touches, duration_seconds, boost_starvation_pct
    FROM matches
    WHERE playlist = ?
    ORDER BY played_at DESC
    LIMIT ?
  `);

  return {
    insertMatch(result: MatchResult, buffer: MatchBuffer): number {
      const subsampled: MatchBuffer = {
        ...buffer,
        stateSamples: subsampleStates(buffer.stateSamples),
      };

      const info = insertStmt.run({
        match_id: result.matchId,
        playlist: result.playlist,
        won: result.won === null ? null : result.won ? 1 : 0,
        own_score: result.ownScore,
        opp_score: result.oppScore,
        duration_seconds: result.durationSeconds,
        played_at: result.playedAt,
        shots: result.stats.shots,
        goals: result.stats.goals,
        saves: result.stats.saves,
        assists: result.stats.assists,
        demos_inflicted: result.stats.demosInflicted,
        demos_received: result.stats.demosReceived,
        touches: result.stats.touches,
        boost_starvation_pct: result.stats.boostStarvationPct,
        raw_buffer: JSON.stringify(subsampled),
      });
      return Number(info.lastInsertRowid);
    },

    getRecentStats(n: number, playlist: string): HistoricalAverages {
      const rows = recentStmt.all(playlist, n);
      if (rows.length === 0) {
        return {
          avgShootingPct: null,
          avgBoostStarvation: null,
          avgTouchesPerMin: null,
          avgSaves: null,
          matchCount: 0,
          bestShootingPct: null,
        };
      }

      const withShots = rows.filter(r => r.shots > 0);
      const withBoost = rows.filter(r => r.boost_starvation_pct >= 0);
      const withDuration = rows.filter(r => r.duration_seconds > 0);

      const avg = (arr: number[]) =>
        arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

      const shootingPcts = withShots.map(r => r.goals / r.shots);
      const bestShootingPct =
        withShots.filter(r => r.shots > 2).length > 0
          ? Math.max(...withShots.filter(r => r.shots > 2).map(r => r.goals / r.shots))
          : null;

      return {
        avgShootingPct: avg(shootingPcts),
        avgBoostStarvation: avg(withBoost.map(r => r.boost_starvation_pct)),
        avgTouchesPerMin: avg(
          withDuration.map(r => r.touches / (r.duration_seconds / 60))
        ),
        avgSaves: avg(rows.map(r => r.saves)),
        matchCount: rows.length,
        bestShootingPct,
      };
    },
  };
}
