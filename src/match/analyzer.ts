import { MatchBuffer, PlayerSnapshot } from './collector';
import { MatchStats, Insight, HistoricalAverages, Baselines, ALL_RULES } from '../insights/rules';
import baselines from '../insights/baselines.json';

export interface MatchResult {
  matchId: string;
  playlist: string;
  won: boolean | null;
  ownScore: number;
  oppScore: number;
  durationSeconds: number;
  playedAt: number;
  matchNumber: number;
  stats: MatchStats;
  insights: Insight[];
}

export function analyzeMatch(
  buffer: MatchBuffer,
  history: HistoricalAverages
): MatchResult {
  const stats = extractStats(buffer);
  const playlist = buffer.playlist;
  const playlistBaselines = (baselines as Record<string, Baselines>)[playlist] ?? baselines.default;

  const insights = ALL_RULES
    .map(rule => rule(stats, history, playlistBaselines))
    .filter((r): r is Insight => r !== null)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  const { ownScore, oppScore, won } = computeScore(buffer);

  const durationSeconds =
    buffer.stateSamples.length > 0
      ? (Date.now() - buffer.startTime) / 1000
      : 300;

  return {
    matchId: buffer.matchId,
    playlist,
    won,
    ownScore,
    oppScore,
    durationSeconds,
    playedAt: buffer.startTime,
    matchNumber: 0, // filled by main after DB insert
    stats,
    insights,
  };
}

function extractStats(buffer: MatchBuffer): MatchStats {
  const localId = buffer.localPlayerId;
  const lastSample = buffer.stateSamples.at(-1);
  const localFinal = localId && lastSample ? lastSample.players[localId] : null;

  const resolveFromStatefeed = (eventName: string) =>
    buffer.statfeedEvents.filter(
      e => e.eventName === eventName && (!localId || e.mainTarget.id === localId)
    ).length;

  const shots = localFinal?.shots ?? resolveFromStatefeed('Shot');
  const goals = localFinal?.goals ?? resolveFromStatefeed('Goal');
  const saves = localFinal?.saves ?? resolveFromStatefeed('Save');
  const assists = localFinal?.assists ?? resolveFromStatefeed('Assist');
  const touches = localFinal?.touches ?? 0;

  const demosInflicted = buffer.demoEvents.filter(
    d => !localId || d.attacker.id === localId
  ).length;
  const demosReceived = buffer.demoEvents.filter(
    d => !localId || d.victim.id === localId
  ).length;

  const boostStarvationPct = computeBoostStarvation(buffer, localId);
  const demoGoalCorrelation = computeDemoGoalCorrelation(buffer, localId);

  const durationSeconds =
    buffer.stateSamples.length > 0
      ? (Date.now() - buffer.startTime) / 1000
      : 300;

  return {
    shots,
    goals,
    saves,
    assists,
    demosInflicted,
    demosReceived,
    touches,
    durationSeconds,
    boostStarvationPct,
    demoGoalCorrelation,
    playlist: buffer.playlist,
  };
}

function computeBoostStarvation(
  buffer: MatchBuffer,
  localId: string | null
): number {
  const boostSamples = buffer.stateSamples
    .map(s => {
      if (localId) return s.players[localId]?.boost;
      const me = Object.values(s.players).find(p => p.me);
      return me?.boost;
    })
    .filter((b): b is number => b !== undefined);

  if (boostSamples.length === 0) return -1;
  return boostSamples.filter(b => b < 25).length / boostSamples.length;
}

function computeDemoGoalCorrelation(
  buffer: MatchBuffer,
  localId: string | null
): number {
  const inflicted = buffer.demoEvents.filter(
    d => !localId || d.attacker.id === localId
  );
  if (inflicted.length === 0) return 0;

  const withGoal = inflicted.filter(demo =>
    buffer.goals.some(
      g => g.timestamp > demo.timestamp && g.timestamp <= demo.timestamp + 5000
    )
  );
  return withGoal.length / inflicted.length;
}

function computeScore(buffer: MatchBuffer): {
  ownScore: number;
  oppScore: number;
  won: boolean | null;
} {
  const localTeam = buffer.localPlayerTeam;
  const ownScore = buffer.goals.filter(g => g.teamNum === localTeam).length;
  const oppScore = buffer.goals.filter(g => g.teamNum !== localTeam).length;

  let won: boolean | null = null;
  if (buffer.winnerTeamNum !== null) {
    won = buffer.winnerTeamNum === localTeam;
  } else if (buffer.goals.length > 0) {
    won = ownScore > oppScore;
  }

  return { ownScore, oppScore, won };
}

export function buildDemoResult(): MatchResult {
  return {
    matchId: 'demo',
    playlist: 'ranked_doubles',
    won: false,
    ownScore: 2,
    oppScore: 3,
    durationSeconds: 300,
    playedAt: Date.now() - 2 * 60 * 1000,
    matchNumber: 0,
    stats: {
      shots: 8,
      goals: 1,
      saves: 4,
      assists: 1,
      demosInflicted: 2,
      demosReceived: 1,
      touches: 42,
      durationSeconds: 300,
      boostStarvationPct: 0.47,
      demoGoalCorrelation: 0.5,
      playlist: 'ranked_doubles',
    },
    insights: [
      {
        id: 'boost_starvation',
        title: 'Boost starvation severo',
        description: '47% del partido con menos de 25 boost · Tu promedio: 31% · SSL: ~15%',
        verdict: 'bad',
        delta: 0.32,
      },
      {
        id: 'shooting_efficiency',
        title: 'Tiraste mucho, metiste poco',
        description: '8 disparos, 1 gol (12%) · Tu promedio: 22% · SSL: ~28%',
        verdict: 'bad',
        delta: 0.16,
      },
      {
        id: 'defensive_solidity',
        title: 'Defensa sólida',
        description: '4 saves · Tu promedio: 2.3',
        verdict: 'good',
        delta: 0.2,
      },
    ],
  };
}
