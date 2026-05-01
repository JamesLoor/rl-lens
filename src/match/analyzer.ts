import { MatchBuffer } from './collector';
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
  const playlistBaselines = (baselines as Record<string, Baselines>)['default'];

  const insights = ALL_RULES
    .map(rule => rule(stats, history, playlistBaselines))
    .filter((r): r is Insight => r !== null)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  const { ownScore, oppScore, won } = computeScore(buffer);
  const durationSeconds = (Date.now() - buffer.startTime) / 1000;

  return {
    matchId: buffer.matchId,
    playlist: 'default',
    won,
    ownScore,
    oppScore,
    durationSeconds,
    playedAt: buffer.startTime,
    matchNumber: 0,
    stats,
    insights,
  };
}

function extractStats(buffer: MatchBuffer): MatchStats {
  const localName = buffer.localPlayerName;
  const lastSample = buffer.stateSamples.at(-1);
  const localFinal = localName
    ? lastSample?.players.find(p => p.name === localName)
    : undefined;

  const shots   = localFinal?.shots   ?? countStatfeed(buffer, 'Shot',   localName);
  const goals   = localFinal?.goals   ?? countStatfeed(buffer, 'Goal',   localName);
  const saves   = localFinal?.saves   ?? countStatfeed(buffer, 'Save',   localName);
  const assists = localFinal?.assists ?? countStatfeed(buffer, 'Assist', localName);
  const touches = localFinal?.touches ?? 0;

  const demosInflicted = buffer.demoEvents.filter(
    d => !localName || d.attacker.Name === localName
  ).length;
  const demosReceived = buffer.demoEvents.filter(
    d => !localName || d.victim.Name === localName
  ).length;

  const boostStarvationPct = computeBoostStarvation(buffer, localName);
  const demoGoalCorrelation = computeDemoGoalCorrelation(buffer, localName);
  const durationSeconds = (Date.now() - buffer.startTime) / 1000;

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
    playlist: 'default',
  };
}

function countStatfeed(buffer: MatchBuffer, eventName: string, localName: string | null): number {
  return buffer.statfeedEvents.filter(
    e => e.eventName === eventName && (!localName || e.mainTarget.Name === localName)
  ).length;
}

function computeBoostStarvation(buffer: MatchBuffer, localName: string | null): number {
  const samples = buffer.stateSamples
    .map(s => {
      const p = localName
        ? s.players.find(p => p.name === localName)
        : s.players[0];
      return p?.boost;
    })
    .filter((b): b is number => b !== undefined);

  if (samples.length === 0) return -1;
  return samples.filter(b => b < 25).length / samples.length;
}

function computeDemoGoalCorrelation(buffer: MatchBuffer, localName: string | null): number {
  const inflicted = buffer.demoEvents.filter(
    d => !localName || d.attacker.Name === localName
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
