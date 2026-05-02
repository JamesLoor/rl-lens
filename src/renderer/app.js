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
const reportMeta      = document.getElementById('report-meta');
const statsTable      = document.getElementById('stats-table');
const btnDemo         = document.getElementById('btn-demo');
const btnSetup        = document.getElementById('btn-setup');
const historyItems    = document.getElementById('history-items');
const historyEmpty    = document.getElementById('history-empty');
const historyListPanel   = document.getElementById('history-list-panel');
const historyDetailPanel = document.getElementById('history-detail-panel');
const historyDetailMeta  = document.getElementById('history-detail-meta');
const historyDetailStats = document.getElementById('history-detail-stats');
const historyBack     = document.getElementById('history-back');
const logOutput       = document.getElementById('log-output');

// ── State ─────────────────────────────────────────────
let socketConnected = false;
let lastResult = null;
let activeTab = 'home';
let historyLoaded = false;

// ── Tab switching ──────────────────────────────────────
const tabBtns   = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

function switchTab(tab) {
  activeTab = tab;
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  if (tab === 'history' && !historyLoaded) loadHistory();
  if (tab === 'logs') scrollLogsToBottom();
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

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
  if (diffH < 24) return `hace ${diffH} hora${diffH !== 1 ? 's' : ''}`;
  const diffD = Math.floor(diffH / 24);
  return `hace ${diffD} día${diffD !== 1 ? 's' : ''}`;
}

function playlistLabel(playlist) {
  const labels = {
    ranked_duels:    '1v1',
    ranked_doubles:  '2v2',
    ranked_standard: '3v3',
    hoops:           'Hoops',
    dropshot:        'Dropshot',
    snowday:         'Snow Day',
    rumble:          'Rumble',
    heatseeker:      'Heatseeker',
    default:         'Ranked',
  };
  return labels[playlist] || playlist;
}

function pct(n) { return (n * 100).toFixed(0) + '%'; }

function verdict(you, ssl, direction) {
  const ratio = direction === 'higher' ? you / ssl : ssl / you;
  if (ratio >= 0.88) return 'good';
  if (ratio >= 0.65) return 'warning';
  return 'bad';
}

// ── Stats rendering ───────────────────────────────────
function buildStatsDefs(s, b) {
  const shootingPct = s.shots > 0 ? s.goals / s.shots : 0;
  return [
    ['Precisión de tiro', shootingPct,          b.shooting_pct,         pct(shootingPct),                                `~${pct(b.shooting_pct)}`,         'higher',  0.60],
    ['Goles',             s.goals,              b.goals_per_match,      s.goals,                                         `~${b.goals_per_match}`,           'higher',  Math.max(s.goals, b.goals_per_match) * 1.5 || 1],
    ['Tiros',             s.shots,              b.shots_per_match,      s.shots,                                         `~${b.shots_per_match}`,           'neutral', Math.max(s.shots, b.shots_per_match) * 1.5 || 1],
    ['Paradas',           s.saves,              b.saves_per_match,      s.saves,                                         `~${b.saves_per_match}`,           'higher',  Math.max(s.saves, b.saves_per_match) * 1.5 || 1],
    ['Boost promedio',    s.avgBoost,           b.avg_boost,            s.avgBoost >= 0 ? s.avgBoost.toFixed(0) : '—',   `~${b.avg_boost}`,                 'higher',  100],
    ['Tiempo sin boost',  s.boostStarvationPct, b.boost_starvation_pct, s.boostStarvationPct >= 0 ? pct(s.boostStarvationPct) : '—', `~${pct(b.boost_starvation_pct)}`, 'lower', 0.80],
    ['Supersónico',       s.supersonicPct,      b.supersonic_pct,       s.supersonicPct >= 0 ? pct(s.supersonicPct) : '—', `~${pct(b.supersonic_pct)}`,     'higher',  0.50],
    ['Demos',             s.demosInflicted,     b.demos_per_match,      s.demosInflicted,                                `~${b.demos_per_match}`,           'neutral', Math.max(s.demosInflicted, b.demos_per_match) * 1.5 || 1],
  ];
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

function renderStatsInto(metaEl, tableEl, result) {
  if (!metaEl || !tableEl) return;

  const resultLabel = result.won === true
    ? '<span class="result-win">Victoria</span>'
    : result.won === false
    ? '<span class="result-loss">Derrota</span>'
    : '<span class="result-draw">Partido</span>';

  const matchLabel = result.matchNumber > 0 ? `Match #${result.matchNumber}` : 'Demo';
  const s = result.stats;
  const b = result.baselines;

  metaEl.innerHTML = `
    <div class="report-match-line">${matchLabel} · ${playlistLabel(result.playlist)} · ${resultLabel}</div>
    <div class="report-score">${result.ownScore} – ${result.oppScore}</div>
    <div class="report-time">${relativeTime(result.playedAt)}</div>
  `;

  const defs = buildStatsDefs(s, b);
  const rows = defs.map(([label, you, ssl, dispYou, dispSsl, dir, barMax]) => {
    const hasData = typeof you === 'number' && you >= 0;
    const v = hasData ? verdict(you, ssl, dir) : 'neutral';
    const barPct    = hasData ? Math.min(you / barMax, 1) : 0;
    const markerPct = Math.min(ssl / barMax, 1);
    return statRow(label, dispYou, dispSsl, v, barPct, markerPct, hasData);
  });

  tableEl.innerHTML = `
    <div class="stats-table">
      <div class="stats-header">
        <span></span>
        <span class="col-you">Tú</span>
        <span class="col-ssl">${b.label}</span>
      </div>
      ${rows.join('')}
    </div>
  `;
}

let reportTimeInterval = null;

function renderReport(result) {
  renderStatsInto(reportMeta, statsTable, result);
  showView('report');

  // Refresh relative time every 30 s so it doesn't go stale
  if (reportTimeInterval) clearInterval(reportTimeInterval);
  reportTimeInterval = setInterval(() => {
    const timeEl = reportMeta?.querySelector('.report-time');
    if (timeEl) timeEl.textContent = relativeTime(result.playedAt);
  }, 30_000);
}

// ── History ────────────────────────────────────────────
async function loadHistory() {
  historyLoaded = true;
  if (!historyItems || !historyEmpty) return;

  historyItems.innerHTML = '';
  historyEmpty.style.display = 'none';

  const matches = await api.getMatchHistory();

  if (!matches || matches.length === 0) {
    historyEmpty.style.display = 'block';
    return;
  }

  matches.forEach(match => {
    const won = match.won;
    const badgeClass = won === true ? 'win' : won === false ? 'loss' : 'draw';
    const badgeText  = won === true ? 'V' : won === false ? 'D' : '—';
    const s = match.stats;

    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-item-top">
        <div class="history-match-title">
          <span class="result-badge ${badgeClass}">${badgeText}</span>
          ${playlistLabel(match.playlist)} · ${match.ownScore}–${match.oppScore}
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="history-date">${relativeTime(match.playedAt)}</span>
          <button class="btn-delete-match" title="Borrar partida">×</button>
        </div>
      </div>
      <div class="history-item-stats">
        <span>${s.goals}G</span>
        <span>${s.shots}T</span>
        <span>${s.saves}Sv</span>
        <span>${s.demosInflicted}D</span>
      </div>
    `;
    div.querySelector('.btn-delete-match').addEventListener('click', async (e) => {
      e.stopPropagation();
      await api.deleteMatch(match.matchNumber);
      div.remove();
      if (!historyItems.children.length) historyEmpty.style.display = 'block';
    });
    div.addEventListener('click', () => showHistoryDetail(match));
    historyItems.appendChild(div);
  });
}

function showHistoryList() {
  if (historyListPanel)   historyListPanel.style.display = '';
  if (historyDetailPanel) historyDetailPanel.classList.remove('active');
}

function showHistoryDetail(match) {
  if (historyListPanel)   historyListPanel.style.display = 'none';
  if (historyDetailPanel) historyDetailPanel.classList.add('active');
  renderStatsInto(historyDetailMeta, historyDetailStats, match);
}

historyBack?.addEventListener('click', showHistoryList);


// ── Logs ───────────────────────────────────────────────
function scrollLogsToBottom() {
  if (logOutput) logOutput.scrollTop = logOutput.scrollHeight;
}

function appendLogLine(line) {
  if (!logOutput) return;
  const div = document.createElement('div');
  let cls = 'log-line';
  if (line.includes('[WARN]'))  cls += ' warn';
  if (line.includes('[ERROR]')) cls += ' error';
  div.className = cls;
  div.textContent = line;
  logOutput.appendChild(div);
  // keep at most 400 lines in DOM
  while (logOutput.children.length > 400) logOutput.removeChild(logOutput.firstChild);
  if (activeTab === 'logs') logOutput.scrollTop = logOutput.scrollHeight;
}

// ── Socket / match events ─────────────────────────────
if (api) {
  api.onSocketStatus(({ status, port }) => {
    socketConnected = status === 'connected';

    const labels = {
      connecting:   `Conectando al puerto ${port}…`,
      connected:    'Conectado',
      disconnected: 'Desconectado',
      error:        `Sin respuesta en puerto ${port}`,
    };

    if (statusDot) statusDot.className = `status-dot ${status}`;
    if (statusText) statusText.textContent = labels[status] || status;

    if (!lastResult) {
      showView(status === 'connected' ? 'listening' : 'onboarding');
    }
  });

  api.onMatchState((state) => {
    if (state === 'active') {
      lastResult = null;
      showView('capturing');
    } else if (state === 'capturing' || state === 'analyzing' || state === 'loading') {
      if (!lastResult) showView('capturing');
    } else if (state === 'idle') {
      if (!lastResult) showView(socketConnected ? 'listening' : 'onboarding');
    }
  });

  api.onMatchResult((result) => {
    lastResult = result;
    renderReport(result);
    // refresh history tab if it was already loaded
    if (historyLoaded) {
      historyLoaded = false;
      if (activeTab === 'history') loadHistory();
    }
  });

  api.onLogLine((line) => {
    appendLogLine(line);
  });
}

btnDemo?.addEventListener('click', () => {
  if (api) api.requestDemo();
});

btnSetup?.addEventListener('click', () => {
  if (api) api.runSetup();
});
