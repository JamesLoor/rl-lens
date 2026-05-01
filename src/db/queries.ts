import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { HistoricalAverages } from '../insights/rules';
import type { MatchResult } from '../match/analyzer';

export interface DB {
  insertMatch(result: MatchResult): number;
  getRecentStats(n: number): HistoricalAverages;
}

interface MatchRow {
  shots: number;
  goals: number;
  saves: number;
  touches: number;
  duration_seconds: number;
  boost_starvation_pct: number;
}

export function createDB(dbPath: string): DB {
  const db = new Database(dbPath);
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  const insertStmt = db.prepare(`
    INSERT INTO matches (
      match_id, playlist, won, own_score, opp_score,
      duration_seconds, played_at,
      shots, goals, saves, assists,
      demos_inflicted, demos_received, touches, boost_starvation_pct
    ) VALUES (
      @match_id, @playlist, @won, @own_score, @opp_score,
      @duration_seconds, @played_at,
      @shots, @goals, @saves, @assists,
      @demos_inflicted, @demos_received, @touches, @boost_starvation_pct
    )
  `);

  const recentStmt = db.prepare<[number], MatchRow>(`
    SELECT shots, goals, saves, touches, duration_seconds, boost_starvation_pct
    FROM matches
    ORDER BY played_at DESC
    LIMIT ?
  `);

  return {
    insertMatch(result: MatchResult): number {
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
      });
      return Number(info.lastInsertRowid);
    },

    getRecentStats(n: number): HistoricalAverages {
      const rows = recentStmt.all(n);
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
