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
  baselines: Baselines;
  insights: Insight[];
}

export function analyzeMatch(
  buffer: MatchBuffer,
  history: HistoricalAverages
): MatchResult {
  const stats = extractStats(buffer);
  const allBaselines = baselines as Record<string, Baselines>;
  const playlistBaselines = allBaselines[buffer.playlist] ?? allBaselines['default'];

  const insights = ALL_RULES
    .map(rule => rule(stats, history, playlistBaselines))
    .filter((r): r is Insight => r !== null)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);

  const { ownScore, oppScore, won } = computeScore(buffer);
  const durationSeconds = (Date.now() - buffer.startTime) / 1000;

  return {
    matchId: buffer.matchId,
    playlist: buffer.playlist,
    won,
    ownScore,
    oppScore,
    durationSeconds,
    playedAt: buffer.startTime,
    matchNumber: 0,
    stats,
    baselines: playlistBaselines,
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

  const boostStarvationPct    = computeBoostStarvation(buffer, localName);
  const avgBoost              = computeAvgBoost(buffer, localName);
  const supersonicPct         = computeSupersonicPct(buffer, localName);
  const demoGoalCorrelation   = computeDemoGoalCorrelation(buffer, localName);
  const durationSeconds       = (Date.now() - buffer.startTime) / 1000;

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
    avgBoost,
    supersonicPct,
    demoGoalCorrelation,
    playlist: buffer.playlist,
  };
}

function countStatfeed(buffer: MatchBuffer, eventName: string, localName: string | null): number {
  return buffer.statfeedEvents.filter(
    e => e.eventName === eventName && (!localName || e.mainTarget.Name === localName)
  ).length;
}

function pickLocalSamples(buffer: MatchBuffer, localName: string | null) {
  return buffer.stateSamples.map(s =>
    localName ? s.players.find(p => p.name === localName) : s.players[0]
  );
}

function computeBoostStarvation(buffer: MatchBuffer, localName: string | null): number {
  const vals = pickLocalSamples(buffer, localName)
    .map(p => p?.boost)
    .filter((b): b is number => b !== undefined);
  if (vals.length === 0) return -1;
  return vals.filter(b => b < 25).length / vals.length;
}

function computeAvgBoost(buffer: MatchBuffer, localName: string | null): number {
  const vals = pickLocalSamples(buffer, localName)
    .map(p => p?.boost)
    .filter((b): b is number => b !== undefined);
  if (vals.length === 0) return -1;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function computeSupersonicPct(buffer: MatchBuffer, localName: string | null): number {
  // bSupersonic is absent (undefined) when false — treat undefined as false
  const samples = pickLocalSamples(buffer, localName).filter(p => p !== undefined);
  if (samples.length === 0) return -1;
  return samples.filter(p => p!.bSupersonic === true).length / samples.length;
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

  // Game.Teams[x].Score is a performance metric, not goal count.
  // Sum individual player goals by team from the final UpdateState instead.
  let ownScore = 0;
  let oppScore = 0;

  const lastSample = buffer.stateSamples.at(-1);
  if (lastSample && lastSample.players.length > 0) {
    ownScore = lastSample.players
      .filter(p => p.teamNum === localTeam)
      .reduce((sum, p) => sum + p.goals, 0);
    oppScore = lastSample.players
      .filter(p => p.teamNum !== localTeam)
      .reduce((sum, p) => sum + p.goals, 0);
  } else {
    ownScore = buffer.goals.filter(g => g.teamNum === localTeam).length;
    oppScore = buffer.goals.filter(g => g.teamNum !== localTeam).length;
  }

  let won: boolean | null = null;
  if (buffer.winnerTeamNum !== null) {
    won = buffer.winnerTeamNum === localTeam;
  } else if (ownScore !== oppScore) {
    won = ownScore > oppScore;
  }

  return { ownScore, oppScore, won };
}

export function buildDemoResult(): MatchResult {
  const demoBaselines = (baselines as Record<string, Baselines>)['ranked_doubles'];
  return {
    matchId: 'demo',
    playlist: 'ranked_doubles',
    won: false,
    ownScore: 2,
    oppScore: 3,
    durationSeconds: 300,
    playedAt: Date.now() - 2 * 60 * 1000,
    matchNumber: 0,
    baselines: demoBaselines,
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
      avgBoost: 38,
      supersonicPct: 0.12,
      demoGoalCorrelation: 0.5,
      playlist: 'ranked_doubles',
    },
    insights: [],
  };
}
