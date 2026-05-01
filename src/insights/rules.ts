export type InsightVerdict = 'good' | 'warning' | 'bad';

export interface Insight {
  id: string;
  title: string;
  description: string;
  verdict: InsightVerdict;
  delta: number;
}

export interface MatchStats {
  shots: number;
  goals: number;
  saves: number;
  assists: number;
  demosInflicted: number;
  demosReceived: number;
  touches: number;
  durationSeconds: number;
  boostStarvationPct: number;
  demoGoalCorrelation: number;
  playlist: string;
}

export interface HistoricalAverages {
  avgShootingPct: number | null;
  avgBoostStarvation: number | null;
  avgTouchesPerMin: number | null;
  avgSaves: number | null;
  matchCount: number;
  bestShootingPct: number | null;
}

export interface Baselines {
  label: string;
  shooting_pct: number;
  boost_starvation_pct: number;
  saves_per_match: number;
  touches_per_min: number;
  demos_per_match: number;
}

type InsightRule = (
  stats: MatchStats,
  history: HistoricalAverages,
  baselines: Baselines
) => Insight | null;

const pct = (n: number) => (n * 100).toFixed(0) + '%';

export const shootingEfficiency: InsightRule = (stats, history, baselines) => {
  if (stats.shots < 2) return null;
  const ratio = stats.goals / stats.shots;
  const sslRatio = baselines.shooting_pct;
  const delta = ratio - sslRatio;

  let verdict: InsightVerdict;
  if (ratio >= sslRatio * 0.85) verdict = 'good';
  else if (ratio >= sslRatio * 0.55) verdict = 'warning';
  else verdict = 'bad';

  const histLine =
    history.avgShootingPct !== null
      ? ` · Tu promedio: ${pct(history.avgShootingPct)}`
      : '';

  const title =
    verdict === 'good'
      ? 'Buen % de conversión'
      : verdict === 'warning'
      ? 'Tiro mejorable'
      : 'Tiraste mucho, metiste poco';

  return {
    id: 'shooting_efficiency',
    title,
    description: `${stats.shots} disparos, ${stats.goals} gol${stats.goals !== 1 ? 'es' : ''} (${pct(ratio)})${histLine} · ${baselines.label}: ~${pct(sslRatio)}`,
    verdict,
    delta: Math.abs(delta),
  };
};

export const boostStarvation: InsightRule = (stats, history, baselines) => {
  if (stats.boostStarvationPct < 0) return null;
  const ratio = stats.boostStarvationPct;
  const sslRatio = baselines.boost_starvation_pct;
  const delta = ratio - sslRatio;

  let verdict: InsightVerdict;
  if (ratio <= sslRatio * 1.2) verdict = 'good';
  else if (ratio <= sslRatio * 1.8) verdict = 'warning';
  else verdict = 'bad';

  const histLine =
    history.avgBoostStarvation !== null
      ? ` · Tu promedio: ${pct(history.avgBoostStarvation)}`
      : '';

  const title =
    verdict === 'good'
      ? 'Boost bien gestionado'
      : verdict === 'warning'
      ? 'Boost starvation moderado'
      : 'Boost starvation severo';

  return {
    id: 'boost_starvation',
    title,
    description: `${pct(ratio)} del partido con menos de 25 boost${histLine} · ${baselines.label}: ~${pct(sslRatio)}`,
    verdict,
    delta: Math.abs(delta),
  };
};

export const passivity: InsightRule = (stats, history, baselines) => {
  if (stats.durationSeconds < 60 || history.avgTouchesPerMin === null) return null;
  const touchesPerMin = stats.touches / (stats.durationSeconds / 60);
  const histTpm = history.avgTouchesPerMin;
  const deltaPct = (touchesPerMin - histTpm) / Math.max(histTpm, 0.1);

  if (Math.abs(deltaPct) < 0.15) return null;

  let verdict: InsightVerdict;
  if (touchesPerMin >= histTpm * 0.85) verdict = 'good';
  else if (touchesPerMin >= histTpm * 0.65) verdict = 'warning';
  else verdict = 'bad';

  const title =
    verdict === 'good'
      ? 'Presencia activa en el juego'
      : verdict === 'warning'
      ? 'Menos activo que de costumbre'
      : 'Muy pasivo este partido';

  return {
    id: 'passivity',
    title,
    description: `${touchesPerMin.toFixed(1)} toques/min · Tu promedio: ${histTpm.toFixed(1)} · ${baselines.label}: ~${baselines.touches_per_min}`,
    verdict,
    delta: Math.abs(deltaPct),
  };
};

export const defensiveSolidity: InsightRule = (stats, history) => {
  if (history.avgSaves === null || history.matchCount < 3) return null;
  const avg = history.avgSaves;
  const delta = stats.saves - avg;
  const deltaPct = Math.abs(delta) / Math.max(avg, 0.5);

  if (deltaPct < 0.25) return null;

  const verdict: InsightVerdict = delta >= 0 ? 'good' : 'warning';
  const title = delta >= 0 ? 'Defensa sólida' : 'Menos saves que de costumbre';

  return {
    id: 'defensive_solidity',
    title,
    description: `${stats.saves} save${stats.saves !== 1 ? 's' : ''} · Tu promedio: ${avg.toFixed(1)}`,
    verdict,
    delta: deltaPct,
  };
};

export const historicalComparison: InsightRule = (stats, history) => {
  if (history.matchCount < 5 || history.bestShootingPct === null) return null;
  if (stats.shots < 2) return null;
  const ratio = stats.goals / stats.shots;
  const best = history.bestShootingPct;

  if (ratio <= best * 0.4) {
    return {
      id: 'historical_comparison',
      title: 'Tu peor % de tiro reciente',
      description: `${pct(ratio)} esta partida vs tu mejor ${pct(best)} (últimos ${history.matchCount} partidos)`,
      verdict: 'bad',
      delta: best - ratio,
    };
  }
  return null;
};

export const ALL_RULES: InsightRule[] = [
  shootingEfficiency,
  boostStarvation,
  passivity,
  defensiveSolidity,
  historicalComparison,
];
