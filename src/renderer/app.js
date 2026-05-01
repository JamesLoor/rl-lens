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
const insightsList   = document.getElementById('insights-list');
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

function verdictEmoji(verdict) {
  if (verdict === 'good')    return '✅';
  if (verdict === 'warning') return '⚠️';
  return '❌';
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
  if (!reportMeta || !insightsList) return;

  const resultLabel = result.won === true
    ? '<span class="result-win">Victoria</span>'
    : result.won === false
    ? '<span class="result-loss">Derrota</span>'
    : '<span class="result-draw">Partido</span>';

  const matchLabel = result.matchNumber > 0
    ? `Match #${result.matchNumber}`
    : 'Demo';

  reportMeta.innerHTML = `
    <div class="report-match-line">
      ${matchLabel} · ${playlistLabel(result.playlist)} · ${resultLabel}
    </div>
    <div class="report-score">${result.ownScore} – ${result.oppScore}</div>
    <div class="report-time">${relativeTime(result.playedAt)}</div>
  `;

  if (!result.insights || result.insights.length === 0) {
    insightsList.innerHTML = '<div class="no-insights">Partido sin insights significativos.<br>¡Todo dentro del promedio!</div>';
    return;
  }

  insightsList.innerHTML = result.insights.map(ins => `
    <div class="insight-card verdict-${ins.verdict}">
      <div class="insight-header">
        <span class="insight-emoji">${verdictEmoji(ins.verdict)}</span>
        <span class="insight-title">${ins.title}</span>
      </div>
      <div class="insight-desc">${ins.description}</div>
    </div>
  `).join('');

  showView('report');
}

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
