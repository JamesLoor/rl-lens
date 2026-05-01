// @ts-check

/** @type {import('../../src/preload').RLStatsAPI} */
const api = window.rlStats;

// ── DOM refs ──────────────────────────────────────────
const statusDot  = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const views = {
  onboarding: document.getElementById('view-onboarding'),
  listening:  document.getElementById('view-listening'),
  capturing:  document.getElementById('view-capturing'),
  report:     document.getElementById('view-report'),
};
const reportMeta     = document.getElementById('report-meta');
const statsTable     = document.getElementById('stats-table');
const btnDemo        = document.getElementById('btn-demo');
const btnSetup       = document.getElementById('btn-setup');

// ── State ─────────────────────────────────────────────
let socketConnected = false;

// ── Helpers ───────────────────────────────────────────
function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    if (el) el.classList.toggle('active', key === name);
  });
}

function relativeTime(ts) {

  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'hace menos de un minuto';
  if (diffMin === 1) return 'hace 1 minuto';
  if (diffMin < 60) return `hace ${diffMin} minutos`;
  const diffH = Math.floor(diffMin / 60);
  return `hace ${diffH} hora${diffH !== 1 ? 's' : ''}`;
}

function playlistLabel(playlist) {
  const labels = {
    ranked_duels:    '1v1',
    ranked_doubles:  '2v2',
    ranked_standard: '3v3',
    default:         'Ranked',
  };
  return labels[playlist] || playlist;
}

// ── Render report ─────────────────────────────────────
function renderReport(result) {
  if (!reportMeta || !statsTable) return;

  const resultLabel = result.won === true
    ? '<span class="result-win">Victoria</span>'
    : result.won === false
    ? '<span class="result-loss">Derrota</span>'
    : '<span class="result-draw">Partido</span>';

  const matchLabel = result.matchNumber > 0 ? `Match #${result.matchNumber}` : 'Demo';
  const s = result.stats;
  const b = result.baselines;

  reportMeta.innerHTML = `
    <div class="report-match-line">${matchLabel} · ${playlistLabel(result.playlist)} · ${resultLabel}</div>
    <div class="report-score">${result.ownScore} – ${result.oppScore}</div>
    <div class="report-time">${relativeTime(result.playedAt)}</div>
  `;

  const shootingPct = s.shots > 0 ? s.goals / s.shots : 0;

  // [label, youVal, sslVal, displayYou, displaySsl, direction, barMax]
  // barMax defines the 100% point of the progress bar
  const defs = [
    ['Precisión de tiro', shootingPct,              b.shooting_pct,        pct(shootingPct),                       `~${pct(b.shooting_pct)}`,        'higher', 0.60],
    ['Goles',             s.goals,                  b.goals_per_match,     s.goals,                                `~${b.goals_per_match}`,          'higher', Math.max(s.goals, b.goals_per_match) * 1.5],
    ['Tiros',             s.shots,                  b.shots_per_match,     s.shots,                                `~${b.shots_per_match}`,          'neutral', Math.max(s.shots, b.shots_per_match) * 1.5],
    ['Paradas',           s.saves,                  b.saves_per_match,     s.saves,                                `~${b.saves_per_match}`,          'higher', Math.max(s.saves, b.saves_per_match) * 1.5],
    ['Boost promedio',    s.avgBoost,               b.avg_boost,           s.avgBoost >= 0 ? s.avgBoost.toFixed(0) : '—', `~${b.avg_boost}`,         'higher', 100],
    ['Tiempo sin boost',  s.boostStarvationPct,     b.boost_starvation_pct, s.boostStarvationPct >= 0 ? pct(s.boostStarvationPct) : '—', `~${pct(b.boost_starvation_pct)}`, 'lower', 0.80],
    ['Supersónico',       s.supersonicPct,          b.supersonic_pct,      s.supersonicPct >= 0 ? pct(s.supersonicPct) : '—', `~${pct(b.supersonic_pct)}`,    'higher', 0.50],
    ['Demos',             s.demosInflicted,         b.demos_per_match,     s.demosInflicted,                       `~${b.demos_per_match}`,          'neutral', Math.max(s.demosInflicted, b.demos_per_match) * 1.5],
  ];

  const rows = defs.map(([label, you, ssl, dispYou, dispSsl, dir, barMax]) => {
    const hasData = typeof you === 'number' && you >= 0;
    const v = hasData ? verdict(you, ssl, dir) : 'neutral';
    const barPct    = hasData ? Math.min(you / barMax, 1) : 0;
    const markerPct = Math.min(ssl / barMax, 1);
    return statRow(label, dispYou, dispSsl, v, barPct, markerPct, hasData);
  });

  statsTable.innerHTML = `
    <div class="stats-table">
      <div class="stats-header">
        <span></span>
        <span class="col-you">Tú</span>
        <span class="col-ssl">${b.label}</span>
      </div>
      ${rows.join('')}
    </div>
  `;

  showView('report');
}

function statRow(label, you, ssl, v, barPct, markerPct, hasData) {
  const bar = hasData ? `
    <div class="stat-bar-wrap">
      <div class="stat-bar-track">
        <div class="stat-bar-fill verdict-${v}" style="width:${(barPct * 100).toFixed(1)}%"></div>
        <div class="stat-bar-marker" style="left:${(markerPct * 100).toFixed(1)}%"></div>
      </div>
    </div>` : '';
  return `
    <div class="stat-row verdict-${v}">
      <span class="col-label">${label}</span>
      <span class="col-you">${you}</span>
      <span class="col-ssl">${ssl}</span>
      ${bar}
    </div>`;
}

function verdict(you, ssl, direction) {
  const ratio = direction === 'higher' ? you / ssl : ssl / you;
  if (ratio >= 0.88) return 'good';
  if (ratio >= 0.65) return 'warning';
  return 'bad';
}

function pct(n) { return (n * 100).toFixed(0) + '%'; }

// ── Socket status ─────────────────────────────────────
if (api) {
  api.onSocketStatus(({ status, port }) => {
    socketConnected = status === 'connected';

    const labels = {
      connecting:   `Conectando al puerto ${port}…`,
      connected:    'Conectado',
      disconnected: 'Desconectado',
      error:        `Sin respuesta en puerto ${port}`,
    };

    if (statusDot) {
      statusDot.className = `status-dot ${status}`;
    }
    if (statusText) {
      statusText.textContent = labels[status] || status;
    }

    if (status === 'connected') {
      showView('listening');
    } else {
      showView('onboarding');
    }
  });

  api.onMatchState((state) => {
    if (state === 'capturing' || state === 'analyzing') {
      showView('capturing');
    } else if (state === 'idle') {
      showView(socketConnected ? 'listening' : 'onboarding');
    }
  });

  api.onMatchResult((result) => {
    renderReport(result);
  });
}

btnDemo?.addEventListener('click', () => {
  if (api) api.requestDemo();
});

btnSetup?.addEventListener('click', () => {
  if (api) api.runSetup();
});
