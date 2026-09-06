/* Composants et comportements spécifiques à l'expérience Moumix Finance V2. */
'use strict';

const _openPortfolioAccounts = new Set();
const _openPositionCards = new Set();

function accountMetrics(account) {
  if (FIXED_ACCOUNT_TYPES.has(account.type)) {
    const value = Number(account.solde) || 0;
    return { value, cost: 0, pnl: null, pct: null, positions: [] };
  }
  const accountPositions = positions.filter(position => position.accountId === account.id);
  const value = accountPositions.reduce((sum, position) => sum + Number(position.current || 0) * Number(position.qty || 0), 0);
  const known = accountPositions.filter(position => Number(position.price) > 0);
  const cost = known.reduce((sum, position) => sum + Number(position.price) * Number(position.qty || 0), 0);
  const knownValue = known.reduce((sum, position) => sum + Number(position.current || 0) * Number(position.qty || 0), 0);
  const pnl = cost > 0 ? knownValue - cost : null;
  const pct = cost > 0 ? pnl / cost * 100 : null;
  return { value, cost, pnl, pct, positions: accountPositions };
}

function renderAccountPosition(position) {
  const value = Number(position.current || 0) * Number(position.qty || 0);
  const hasPru = Number(position.price) > 0;
  const pnl = hasPru ? (Number(position.current) - Number(position.price)) * Number(position.qty || 0) : null;
  return `<div class="account-position-row">
    <div style="min-width:0">
      <div class="account-position-symbol">${_esc(position.symbol)}</div>
      <div class="account-position-name">${_esc(position.name || 'Sans libellé')}</div>
    </div>
    <div class="account-position-right">
      <div class="account-position-value">${fmtEur(value)}</div>
      <div class="account-position-pnl ${pnl === null ? 'u-muted' : pnl >= 0 ? 'gain-col' : 'loss-col'}">${pnl === null ? 'PRU inconnu' : `${pnl >= 0 ? '+' : ''}${fmtEur(pnl)}`}</div>
    </div>
  </div>`;
}

function renderPortfolioAccountsV2() {
  const grid = document.getElementById('accountsGrid');
  if (!grid) return;
  if (!accounts.length) {
    grid.innerHTML = `<div class="portfolio-empty">
      <div class="portfolio-empty-step">1</div>
      <div><strong>Créez votre premier compte</strong><p>Vous pourrez ensuite y ajouter vos positions.</p></div>
      <button type="button" class="btn btn-primary" onclick="openModal('account')">Créer un compte</button>
    </div>`;
    return;
  }

  grid.innerHTML = accounts.map(account => {
    const metrics = accountMetrics(account);
    const open = _openPortfolioAccounts.has(account.id);
    const performance = metrics.pnl === null
      ? `<div class="portfolio-account-performance u-muted">${FIXED_ACCOUNT_TYPES.has(account.type) ? 'Solde déclaré' : 'PRU à compléter'}</div>`
      : `<div class="portfolio-account-performance ${metrics.pnl >= 0 ? 'gain-col' : 'loss-col'}">${metrics.pnl >= 0 ? '+' : ''}${fmtEur(metrics.pnl)} · ${metrics.pct >= 0 ? '+' : ''}${fmt(metrics.pct)} %</div>`;
    const body = FIXED_ACCOUNT_TYPES.has(account.type)
      ? `<div class="account-balance-editor">
          <div style="flex:1">
            <div class="position-metric-label">Solde actuel</div>
            <div class="account-total" id="livret-total-${account.id}">${fmtEur(metrics.value)}</div>
          </div>
          <button type="button" class="btn btn-sm btn-quiet" onclick="editLivretSolde('${account.id}')">Modifier</button>
        </div>
        <div id="livret-edit-${account.id}" class="hidden account-balance-editor">
          <input type="number" id="livret-input-${account.id}" value="${metrics.value}" step="any" min="0"
            onkeydown="if(event.key==='Enter')confirmLivretSolde('${account.id}');if(event.key==='Escape')cancelLivretEdit('${account.id}')">
          <button type="button" class="btn btn-sm btn-primary" onclick="confirmLivretSolde('${account.id}')">Valider</button>
          <button type="button" class="btn btn-sm btn-quiet" onclick="cancelLivretEdit('${account.id}')">Annuler</button>
        </div>`
      : `<div class="account-position-list">${metrics.positions.length
          ? metrics.positions.map(renderAccountPosition).join('')
          : '<div class="account-detail-empty">Aucune position dans ce compte.</div>'}
        </div>`;

    return `<article class="portfolio-account${open ? ' open' : ''}" data-account-id="${account.id}">
      <button type="button" class="portfolio-account-summary" aria-expanded="${open}" onclick="togglePortfolioAccount('${account.id}')">
        <div class="portfolio-account-copy">
          <div class="portfolio-account-name">${_esc(account.name)}</div>
          <div class="portfolio-account-meta"><span class="tag ${tagClass(account.type)}">${_esc(account.type)}</span><span class="u-muted">${metrics.positions.length || ''}${metrics.positions.length ? ` position${metrics.positions.length > 1 ? 's' : ''}` : ''}</span></div>
        </div>
        <div><div class="portfolio-account-value">${fmtEur(metrics.value)}</div>${performance}</div>
        <span class="portfolio-account-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="portfolio-account-details">${body}
        <div class="account-detail-actions">
          ${FIXED_ACCOUNT_TYPES.has(account.type) ? '' : `<button type="button" class="btn btn-sm btn-primary" onclick="openPositionForAccount('${account.id}')">+ Opération</button>`}
          <button type="button" class="btn btn-sm btn-quiet" onclick="deleteAccount('${account.id}')">Supprimer le compte</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function togglePortfolioAccount(id) {
  if (_openPortfolioAccounts.has(id)) _openPortfolioAccounts.delete(id);
  else _openPortfolioAccounts.add(id);
  renderPortfolioAccountsV2();
}

function openPositionForAccount(id) {
  openModal('position');
  const select = document.getElementById('pos-account');
  if (select && [...select.options].some(option => option.value === id)) {
    select.value = id;
    onPosAccountChange();
  }
}

function renderPositionCardsV2() {
  const container = document.getElementById('positionCards');
  if (!container) return;
  const query = (document.getElementById('posSearch')?.value || '').toLowerCase().trim();
  const filtered = getSortedPositions().filter(position => !query ||
    position.symbol.toLowerCase().includes(query) || (position.name || '').toLowerCase().includes(query));
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">${positions.length ? 'Aucune position ne correspond à cette recherche.' : 'Aucune position enregistrée.'}</div>`;
    return;
  }

  container.innerHTML = filtered.map(position => {
    const value = Number(position.current || 0) * Number(position.qty || 0);
    const hasPru = Number(position.price) > 0;
    const pnl = hasPru ? (Number(position.current) - Number(position.price)) * Number(position.qty || 0) : null;
    const pct = hasPru ? (Number(position.current) - Number(position.price)) / Number(position.price) * 100 : null;
    const open = _openPositionCards.has(position.id);
    const accountType = getAccountType(position.accountId);
    const qty = position.qty >= 1000 ? _fmtQty.format(position.qty) : fmt(position.qty, position.qty % 1 === 0 ? 0 : position.qty < .001 ? 8 : 4);
    const freshness = position.lastUpdated ? timeAgo(position.lastUpdated) : 'cours non daté';
    return `<article class="position-card${open ? ' open' : ''}" data-position-id="${position.id}">
      <button type="button" class="position-card-summary" aria-expanded="${open}" onclick="togglePositionCard('${position.id}')">
        <div style="min-width:0">
          <div class="position-card-symbol">${_esc(position.symbol)}</div>
          <div class="position-card-name">${_esc(position.name || 'Sans libellé')}</div>
          <div class="position-card-account">${_esc(getAccountName(position.accountId))} · <span class="tag ${tagClass(accountType)}">${_esc(accountType || '—')}</span></div>
        </div>
        <div class="position-card-main">
          <div class="position-card-value">${fmtEur(value)}</div>
          <div class="position-card-pnl ${pnl === null ? 'u-muted' : pnl >= 0 ? 'gain-col' : 'loss-col'}">${pnl === null ? 'PRU inconnu' : `${pnl >= 0 ? '+' : ''}${fmt(pct)} %`}</div>
        </div>
        <span class="position-card-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="position-card-details">
        <div class="position-metrics">
          <div><div class="position-metric-label">Quantité</div><div class="position-metric-value">${qty}</div></div>
          <div><div class="position-metric-label">PRU</div><div class="position-metric-value">${hasPru ? fmtPrice(position.price) : '—'}</div></div>
          <div><div class="position-metric-label">Cours actuel</div><div class="position-metric-value">${fmtPrice(position.current)}</div></div>
          <div><div class="position-metric-label">Dernière cotation</div><div class="position-metric-value">${_esc(freshness)}</div></div>
          <div><div class="position-metric-label">Plus-value</div><div class="position-metric-value ${pnl === null ? 'u-muted' : pnl >= 0 ? 'gain-col' : 'loss-col'}">${pnl === null ? '—' : `${pnl >= 0 ? '+' : ''}${fmtEur(pnl)}`}</div></div>
          <div><div class="position-metric-label">Performance</div><div class="position-metric-value ${pct === null ? 'u-muted' : pct >= 0 ? 'gain-col' : 'loss-col'}">${pct === null ? '—' : `${pct >= 0 ? '+' : ''}${fmt(pct)} %`}</div></div>
        </div>
        <div class="position-card-actions">
          <button type="button" class="btn btn-sm btn-primary" onclick="openEditPosition('${position.id}')">Modifier</button>
          <button type="button" class="btn btn-sm btn-quiet" onclick="deletePosition('${position.id}')">Supprimer</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function togglePositionCard(id) {
  if (_openPositionCards.has(id)) _openPositionCards.delete(id);
  else _openPositionCards.add(id);
  renderPositionCardsV2();
}

function renderMarketStatusV2() {
  const status = document.getElementById('marketStatus');
  const text = document.getElementById('marketStatusText');
  if (!status || !text) return;
  status.classList.remove('partial', 'stale');
  const symbols = [...new Set(positions.map(position => position.symbol))];
  if (!symbols.length) {
    status.classList.add('stale');
    text.textContent = 'Aucune cotation';
    return;
  }
  if (_isRefreshing) {
    text.textContent = 'Actualisation en cours…';
    return;
  }
  const timestamps = positions.map(position => Number(position.lastUpdated)).filter(Number.isFinite);
  const freshness = MoumixCore.getQuoteFreshness(timestamps);
  const available = new Set(positions.filter(position => Number(position.current) > 0).map(position => position.symbol)).size;
  const fallbackFx = typeof fxFallbackCurrencies !== 'undefined' ? fxFallbackCurrencies.size : 0;
  if (available < symbols.length || fallbackFx > 0 || freshness.level === 'partial') status.classList.add('partial');
  else if (freshness.level === 'stale') status.classList.add('stale');
  const base = available === symbols.length ? `${available}/${symbols.length} cours disponibles` : `${available}/${symbols.length} cours valorisés`;
  text.textContent = freshness.latest ? `${base} · ${timeAgo(freshness.latest)}` : base;
  if (fallbackFx > 0) text.textContent += ` · ${fallbackFx} taux indicatif${fallbackFx > 1 ? 's' : ''}`;
}

function selectProjectionScenario(scenario, button) {
  if (!['pess', 'real', 'opti'].includes(scenario)) return;
  const grid = document.querySelector('.sim-scenario-grid');
  if (grid) grid.dataset.activeScenario = scenario;
  document.querySelectorAll('[data-projection-scenario]').forEach(item => {
    const active = item.dataset.projectionScenario === scenario;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
  });
  simTableScenario = scenario;
  if (simViewMode === 'table') simDrawTable();
  persistProjectionPreferences();
}

let _projectionPrefsUser = null;
function projectionPreferencesKey() {
  return currentUser?.id ? `moumix:v2:projection:${currentUser.id}` : null;
}

function applyProjectionPreferences() {
  const key = projectionPreferencesKey();
  if (!key || _projectionPrefsUser === currentUser.id) return null;
  _projectionPrefsUser = currentUser.id;
  const prefs = MoumixCore.readJsonStorage(localStorage, key, {});
  const monthly = document.getElementById('sim-monthly');
  const years = document.getElementById('sim-years');
  if (monthly && Number.isFinite(Number(prefs.monthly))) monthly.value = Math.max(0, Math.min(100000, Number(prefs.monthly)));
  if (years && Number.isFinite(Number(prefs.years))) years.value = Math.max(1, Math.min(60, Number(prefs.years)));
  if (prefs.rates && typeof prefs.rates === 'object') {
    simRateOverrides = Object.fromEntries(Object.entries(prefs.rates)
      .filter(([, value]) => Number.isFinite(Number(value)))
      .map(([type, value]) => [type, Math.max(-50, Math.min(100, Number(value)))]));
  }
  selectProjectionScenario(prefs.scenario || 'real');
  return prefs;
}

function persistProjectionPreferences() {
  const key = projectionPreferencesKey();
  if (!key) return;
  MoumixCore.writeJsonStorage(localStorage, key, {
    version: 1,
    monthly: Number(document.getElementById('sim-monthly')?.value) || 0,
    years: Number(document.getElementById('sim-years')?.value) || 1,
    target: document.getElementById('sim-contribution-target')?.value || 'allocation',
    rates: { ...simRateOverrides },
    scenario: document.querySelector('[data-projection-scenario].active')?.dataset.projectionScenario || 'real',
  });
}

const _renderPositionsV1 = renderPositions;
renderPositions = function renderPositionsV2() {
  _renderPositionsV1();
  renderPositionCardsV2();
};

renderAccounts = renderPortfolioAccountsV2;

const _renderAllV1 = renderAll;
renderAll = function renderAllV2() {
  _renderAllV1();
  renderMarketStatusV2();
};

const _renderPrelevementsV1 = renderPrelevements;
renderPrelevements = function renderPrelevementsV2() {
  _renderPrelevementsV1();
  const compact = document.getElementById('prelSummaryCompact');
  if (!compact) return;
  const monthly = prelevements.reduce((sum, item) => sum + Number(item.amount || 0) * (PREL_FREQ_MONTHLY[item.freq] || 0) / Math.max(1, Number(item.split) || 1), 0);
  compact.textContent = prelevements.length ? `${fmtEur(monthly)} / mois` : 'Aucun prélèvement';
};

const _simUpdateV1 = simUpdate;
simUpdate = function simUpdateV2() {
  const prefs = applyProjectionPreferences();
  _simUpdateV1();
  const select = document.getElementById('sim-contribution-target');
  if (prefs?.target && select && [...select.options].some(option => option.value === prefs.target) && select.value !== prefs.target) {
    select.value = prefs.target;
    _simUpdateV1();
  }
  persistProjectionPreferences();
};

window.togglePortfolioAccount = togglePortfolioAccount;
window.openPositionForAccount = openPositionForAccount;
window.togglePositionCard = togglePositionCard;
window.selectProjectionScenario = selectProjectionScenario;
window.App = Object.assign(window.App || {}, {
  version: MoumixCore.APP_VERSION,
  renderMarketStatus: renderMarketStatusV2,
  selectProjectionScenario,
});
