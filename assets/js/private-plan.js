/* Interface et persistance du plan patrimonial privé. */
(function privatePlanModule(root) {
  'use strict';

  const TABLE = 'private_projection_plan';
  const RECORD_FIELDS = 'user_id, baseline_date, plan, baseline_note, change_log, updated_at';
  const ASSUMPTION_LABELS = Object.freeze({
    CASH: 'Épargne sécurisée', PEA: 'PEA', CTO: 'CTO', AV: 'Assurance-vie',
    Crypto: 'Bitcoin / Crypto', PROPERTY: 'Immobilier',
  });
  const TYPE_LABELS = Object.freeze({
    HOUSE: 'Apport maison', PEA: 'PEA', CTO: 'CTO', PEE: 'Épargne salariale',
    PER: 'PER', AV: 'Assurance-vie', Crypto: 'Bitcoin / Crypto',
    Livret: 'Épargne sécurisée', Immo: 'Immobilier', Autre: 'Autre',
  });
  const TYPE_COLORS = Object.freeze({
    HOUSE: '#00e5a0', PEA: '#00e5a0', CTO: '#5ba4ff', PEE: '#00c864',
    PER: '#64b4ff', AV: '#ffb400', Crypto: '#ff7070', Livret: '#00c8ff',
    Immo: '#c27aff', Autre: '#aaa',
  });

  const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  let record = null;
  let loadVersion = 0;
  let editorPlan = null;
  let currentView = 'global';

  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const setText = (id, value) => { const element = byId(id); if (element) element.textContent = value; };
  const clone = value => JSON.parse(JSON.stringify(value));
  const app = () => root.App;
  const core = () => root.MoumixPrivatePlanCore;
  const context = () => app()?.getProjectionContext?.() || { user: null, buckets: [] };
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  function isTransient(error) {
    return /JWT issued at future|Failed to fetch|NetworkError|Load failed|timeout/i.test(`${error?.message || ''} ${error?.details || ''}`);
  }

  async function readRecord(client, userId, attempts = 3) {
    let lastResult = { data: null, error: null };
    for (let attempt = 0; attempt < attempts; attempt++) {
      lastResult = await client.from(TABLE).select(RECORD_FIELDS).eq('user_id', userId).maybeSingle();
      if (!lastResult.error || ['42P01', 'PGRST205'].includes(lastResult.error.code) || !isTransient(lastResult.error)) return lastResult;
      if (attempt < attempts - 1) await wait(500 * (attempt + 1));
    }
    return lastResult;
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function rowMatches(row, payload) {
    return row && row.baseline_date === payload.baseline_date &&
      row.baseline_note === payload.baseline_note &&
      stableStringify(row.plan) === stableStringify(payload.plan) &&
      stableStringify(row.change_log) === stableStringify(payload.change_log);
  }

  function formatMonth(value) {
    const index = core().monthIndex(value);
    if (index === null) return 'Non atteint sur l’horizon';
    const year = Math.floor(index / 12);
    const month = index % 12;
    const result = monthFormatter.format(new Date(year, month, 1));
    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  function formatDate(value) {
    if (!value) return 'Point zéro non daté';
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return value;
    return dateFormatter.format(new Date(year, month - 1, day));
  }

  function definitionRows(rows) {
    return rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  }

  function setMode(enabled) {
    byId('privatePlanRoot')?.classList.toggle('hidden', !enabled);
    byId('standardProjectionContent')?.classList.toggle('hidden', enabled);
  }

  async function load(user) {
    const version = ++loadVersion;
    record = null;
    setMode(false);
    if (!user?.id) return false;
    const client = app()?.getSupabaseClient?.();
    if (!client) return false;

    const { data, error } = await readRecord(client, user.id);
    if (version !== loadVersion || context().user?.id !== user.id) return false;
    if (error) {
      // Une table pas encore installée ne doit jamais empêcher l'app de fonctionner.
      if (!['42P01', 'PGRST205'].includes(error.code)) console.warn('[Moumix] Lecture du plan privé refusée:', error.message);
      return false;
    }
    if (!data) return false; // RLS ou absence de ligne : l'ancienne projection reste intacte.
    record = {
      ...data,
      plan: core().normalizePlan(data.plan),
      change_log: Array.isArray(data.change_log) ? data.change_log : [],
    };
    setMode(true);
    render();
    return true;
  }

  function reset() {
    loadVersion++;
    record = null;
    editorPlan = null;
    setMode(false);
    const modal = byId('privatePlanModal');
    if (modal?.classList.contains('open')) app()?.hideDialog?.(modal);
  }

  function simulations() {
    if (!record) return null;
    const buckets = context().buckets || [];
    const input = { plan: record.plan, buckets, startDate: new Date() };
    return {
      pess: core().simulate({ ...input, scenario: 'pess' }),
      real: core().simulate({ ...input, scenario: 'real' }),
      opti: core().simulate({ ...input, scenario: 'opti' }),
    };
  }

  function render() {
    if (!record || !core()) return;
    const results = simulations();
    if (!results) return;
    const { plan } = results.real;

    setText('privatePlanBaselineDate', `Point zéro · ${formatDate(record.baseline_date)}`);
    const updated = record.updated_at ? dateFormatter.format(new Date(record.updated_at)) : 'jamais modifié';
    setText('privatePlanUpdatedAt', `Mis à jour le ${updated}`);
    setText('privatePersonalTotal', euro.format(results.real.personalTotal));
    setText('privateHouseholdTotal', euro.format(results.real.householdTotal));
    setText('privateMonthlyBefore', `${euro.format(results.real.monthlyBefore)}/mois`);
    setText('privateMonthlyBeforeDetail', `${euro.format(results.real.monthlyBefore * 12)} par an`);
    setText('privateMonthlyAfter', `${euro.format(results.real.monthlyAfter)}/mois`);
    setText('privateHorizon', `${plan.projection.horizonYears} ans`);

    renderFlows(plan);
    renderRules(plan);
    renderContext(plan);
    renderHouse(results.real);
    renderLongTerm(results);
    renderBaseline();
    switchView(currentView);
  }

  function renderFlows(plan) {
    const flows = plan.contributions;
    const starts = flows.map(flow => flow.startMonth).filter(Boolean).sort();
    setText('privatePlanStart', starts.length ? `À partir de ${formatMonth(starts[0]).toLowerCase()}` : 'Actif immédiatement');
    const container = byId('privatePlanFlows');
    if (!container) return;
    container.innerHTML = flows.length ? flows.map(flow => `
      <div class="private-plan-flow">
        <div class="private-plan-flow-name"><i style="background:${TYPE_COLORS[flow.type] || '#aaa'}"></i><span>${escapeHtml(flow.label)}</span></div>
        <span class="private-plan-flow-start">${flow.startMonth ? formatMonth(flow.startMonth) : 'Dès maintenant'}</span>
        <strong>${euro.format(flow.before)}/mois</strong>
      </div>`).join('') : '<div class="empty-state">Aucun versement programmé.</div>';
  }

  function renderRules(plan) {
    const inheritance = plan.household.inheritanceEnabled
      ? `Héritage hypothétique activé dans ${integer.format(plan.household.inheritanceAfterYears)} ans.`
      : 'Héritage volontairement exclu de tous les calculs.';
    byId('privatePlanRules').innerHTML = [
      'PEA et investissements de long terme non utilisés pour financer l’apport.',
      `${euro.format(plan.household.reserveMinimum)} minimum restent disponibles après l’achat.`,
      'L’apport est alimenté uniquement par l’épargne sécurisée.',
      inheritance,
    ].map(rule => `<li>${escapeHtml(rule)}</li>`).join('');
  }

  function renderContext(plan) {
    const income = plan.profile.personalIncomeAnnual + plan.profile.partnerIncomeAnnual + plan.profile.partnerBonusAnnual;
    byId('privatePlanContext').innerHTML = [
      ['Âge', plan.profile.age ? `${integer.format(plan.profile.age)} ans` : 'À renseigner'],
      ['Revenus bruts du foyer', income ? `${euro.format(income)}/an` : 'À renseigner'],
      ['Logement actuel', `${euro.format(plan.profile.currentHousingMonthly)}/mois`],
      ['Situation de dette', 'Aucun crédit déclaré'],
    ].map(([label, value]) => `<div class="private-plan-context-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }

  function renderHouse(result) {
    const { plan } = result;
    const target = plan.house.targetDownPayment;
    const secured = Math.min(target, result.mobilizableNow);
    const progress = target > 0 ? Math.min(100, secured / target * 100) : 0;
    const extraHousing = result.payment + plan.house.insuranceMonthly + plan.house.propertyTaxMonthly + plan.house.maintenanceMonthly;
    const deltaHousing = extraHousing - plan.profile.currentHousingMonthly;
    const houseFlow = plan.contributions.filter(flow => flow.type === 'HOUSE').reduce((sum, flow) => sum + flow.before, 0);
    const purchaseDelay = result.purchaseMonth ? core().monthIndex(result.purchaseMonth) - core().monthIndex(result.startMonth) : null;
    const purchaseAge = purchaseDelay === null || !plan.profile.age ? '' : plan.profile.age + purchaseDelay / 12;

    setText('privateMobilizableNow', euro.format(result.mobilizableNow));
    setText('privateDownPaymentRemaining', euro.format(result.remainingDownPayment));
    setText('privateDownPaymentTarget', `Pour atteindre ${euro.format(target)}`);
    setText('privatePurchaseDate', formatMonth(result.purchaseMonth));
    setText('privateMortgagePayment', `${euro.format(result.payment)}/mois`);
    setText('privateHouseProgressValue', `${euro.format(secured)} sur ${euro.format(target)}`);
    setText('privateHouseProgressPct', `${progress.toFixed(0)} %`);
    byId('privateHouseProgressBar').style.width = `${progress}%`;
    setText('privateLiquidDetail', `${euro.format(result.householdLiquid)} de liquidités actuelles`);
    setText('privateReserveDetail', `${euro.format(plan.household.reserveMinimum)} conservés`);

    byId('privateHouseDetails').innerHTML = definitionRows([
      ['Prix du bien', euro.format(plan.house.price)],
      ['Frais estimés', euro.format(result.projectFees)],
      ['Coût total du projet', euro.format(result.projectTotal)],
      ['Apport visé', euro.format(target)],
      ['Prêt envisagé', euro.format(plan.house.loanAmount)],
      ['Taux et durée', `${plan.house.annualRate.toFixed(2).replace('.', ',')} % · ${integer.format(plan.house.durationYears)} ans`],
      ['Âge estimé à l’achat', purchaseAge ? `${integer.format(Math.floor(purchaseAge))} ans` : '—'],
      ['Objectif personnel', `${euro.format(plan.house.personalTarget)} · ${formatMonth(result.personalTargetMonth)}`],
    ]);
    byId('privateAfterPurchaseDetails').innerHTML = definitionRows([
      ['Crédit hors assurance', `${euro.format(result.payment)}/mois`],
      ['Assurance emprunteur', `${euro.format(plan.house.insuranceMonthly)}/mois`],
      ['Taxe foncière provisionnée', `${euro.format(plan.house.propertyTaxMonthly)}/mois`],
      ['Entretien provisionné', `${euro.format(plan.house.maintenanceMonthly)}/mois`],
      ['Coût logement estimé', `${euro.format(extraHousing)}/mois`],
      ['Écart avec aujourd’hui', `${deltaHousing >= 0 ? '+' : ''}${euro.format(deltaHousing)}/mois`],
      ['Investissements maintenus', `${euro.format(result.monthlyAfter)}/mois`],
    ]);
    const incomplete = plan.house.insuranceMonthly + plan.house.propertyTaxMonthly + plan.house.maintenanceMonthly === 0;
    byId('privateHouseWarning').textContent = incomplete
      ? 'Pour une estimation réellement utile après l’achat, renseignez l’assurance, la taxe foncière et une provision d’entretien. La mensualité bancaire seule sous-estime le coût de la maison.'
      : `Le seuil d’achat repose sur ${euro.format(houseFlow)}/mois vers l’apport et ne signifie pas qu’un bien adapté sera disponible à cette date.`;
  }

  function renderLongTerm(results) {
    const labels = { pess: 'Prudent', real: 'Central', opti: 'Favorable' };
    byId('privatePlanScenarios').innerHTML = ['pess', 'real', 'opti'].map(key => {
      const result = results[key];
      return `<article class="private-plan-scenario ${key}"><span>${labels[key]}</span><strong>${escapeHtml(euro.format(result.final.netWorth))}</strong><small>${escapeHtml(euro.format(result.final.financialAssets))} d’actifs financiers</small></article>`;
    }).join('');
    drawChart(results);

    const central = results.real;
    byId('privateRetirementDetails').innerHTML = definitionRows([
      ['Âge en fin de projection', central.plan.profile.age ? `${integer.format(central.plan.profile.age + central.plan.projection.horizonYears)} ans` : '—'],
      ['Patrimoine net estimé', euro.format(central.final.netWorth)],
      ['Pouvoir d’achat actuel', `${euro.format(central.finalRealNetWorth)} · inflation ${central.plan.projection.inflationRate.toFixed(1).replace('.', ',')} %`],
      ['Actifs financiers', euro.format(central.final.financialAssets)],
      ['Valeur de la maison', central.final.propertyValue ? euro.format(central.final.propertyValue) : 'Achat non atteint'],
      ['Capital restant dû', central.final.mortgageBalance ? euro.format(central.final.mortgageBalance) : '—'],
      ['Valeur nette immobilière', central.final.propertyValue ? euro.format(central.final.propertyEquity) : '—'],
      ['Date d’achat simulée', formatMonth(central.purchaseMonth)],
    ]);
    byId('privateProjectionRules').innerHTML = [
      'Les comptes Moumix fournissent les valeurs de départ actuelles.',
      'Chaque destination reçoit son propre versement avant et après l’achat.',
      'Les frais d’acquisition réduisent réellement le patrimoine net au moment de l’achat.',
      'Le crédit est amorti mois par mois ; la résidence et chaque catégorie ont leurs propres hypothèses.',
      'Les versements restent constants et sont supposés soutenables après paiement du logement.',
      'Les valeurs principales sont nominales ; le résultat central indique aussi leur pouvoir d’achat actuel.',
      'Les scénarios sont indicatifs et ne constituent ni une prédiction ni un conseil financier.',
    ].map(rule => `<li>${escapeHtml(rule)}</li>`).join('');
  }

  function drawChart(results) {
    const svg = byId('privatePlanChart');
    if (!svg) return;
    const width = 760, height = 280;
    const pad = { top: 20, right: 18, bottom: 32, left: 68 };
    const series = ['pess', 'real', 'opti'].map(key => results[key].records);
    const values = series.flatMap(records => records.map(point => point.netWorth));
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    const range = max - min || 1;
    const length = Math.max(...series.map(records => records.length));
    const x = index => pad.left + index / Math.max(1, length - 1) * (width - pad.left - pad.right);
    const y = value => pad.top + (1 - (value - min) / range) * (height - pad.top - pad.bottom);
    const path = records => records.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.netWorth).toFixed(1)}`).join(' ');
    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = min + range * index / 4;
      const yy = y(value);
      return `<line x1="${pad.left}" x2="${width - pad.right}" y1="${yy}" y2="${yy}" stroke="rgba(255,255,255,.05)"/><text x="${pad.left - 9}" y="${yy + 4}" text-anchor="end" fill="#5a6478" font-size="10" font-family="DM Mono">${escapeHtml(compactNumber(value))}</text>`;
    }).join('');
    const realRecords = results.real.records;
    const labels = realRecords.map((point, index) => ({ point, index })).filter(({ point, index }) => index === 0 || index === realRecords.length - 1 || point.year % 5 === 0).map(({ point, index }) =>
      `<text x="${x(index)}" y="${height - 8}" text-anchor="middle" fill="#5a6478" font-size="10" font-family="DM Mono">${Math.round(point.year)}a</text>`).join('');
    svg.innerHTML = `${grid}${labels}
      <path d="${path(results.pess.records)}" fill="none" stroke="#ff7070" stroke-width="2" opacity=".8"/>
      <path d="${path(results.opti.records)}" fill="none" stroke="#c27aff" stroke-width="2" opacity=".85"/>
      <path d="${path(results.real.records)}" fill="none" stroke="#00e5a0" stroke-width="2.8"/>
      <circle cx="${x(results.real.records.length - 1)}" cy="${y(results.real.final.netWorth)}" r="4" fill="#00e5a0"/>`;
  }

  function compactNumber(value) {
    const absolute = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (absolute >= 1e6) return `${sign}${(absolute / 1e6).toFixed(1).replace('.', ',')} M`;
    if (absolute >= 1e3) return `${sign}${Math.round(absolute / 1e3)} k`;
    return `${Math.round(value)}`;
  }

  function renderBaseline() {
    setText('privatePlanBaselineNote', record.baseline_note || 'Aucune situation de référence enregistrée.');
    const changes = [...record.change_log].reverse();
    byId('privatePlanChangeLog').innerHTML = `<h4>Historique</h4>` + (changes.length
      ? changes.slice(0, 20).map(item => `<div class="private-plan-update"><time>${escapeHtml(formatDate(item.date))}</time><p>${escapeHtml(item.note || 'Situation mise à jour')}</p></div>`).join('')
      : '<div class="private-plan-update"><p>Aucune modification enregistrée depuis le point zéro.</p></div>');
  }

  function switchView(view) {
    if (!['global', 'house', 'retirement'].includes(view)) view = 'global';
    currentView = view;
    document.querySelectorAll('[data-private-view]').forEach(button => {
      const selected = button.dataset.privateView === view;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    document.querySelectorAll('[data-private-panel]').forEach(panel => {
      const selected = panel.dataset.privatePanel === view;
      panel.hidden = !selected;
      panel.classList.toggle('active', selected);
    });
  }

  function getPath(object, path) {
    return path.split('.').reduce((value, key) => value?.[key], object);
  }

  function setPath(object, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const parent = keys.reduce((value, key) => value[key] ||= {}, object);
    parent[last] = value;
  }

  function openEditor() {
    if (!record) return;
    editorPlan = clone(record.plan);
    document.querySelectorAll('[data-private-field]').forEach(input => {
      const value = getPath(editorPlan, input.dataset.privateField);
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = value ?? '';
    });
    byId('privatePlanBaselineDateInput').value = record.baseline_date || '';
    byId('privatePlanBaselineNoteInput').value = record.baseline_note || '';
    byId('privatePlanChangeNoteInput').value = '';
    byId('privatePlanFormError').textContent = '';
    renderFlowEditor();
    renderAssumptionEditor();
    app()?.showDialog?.(byId('privatePlanModal'), '[data-private-field="profile.age"]');
  }

  function closeEditor() {
    editorPlan = null;
    app()?.hideDialog?.(byId('privatePlanModal'));
  }

  function readEditor() {
    const next = clone(editorPlan || record.plan);
    document.querySelectorAll('[data-private-field]').forEach(input => {
      const value = input.type === 'checkbox' ? input.checked : input.type === 'month' ? input.value : Number(input.value || 0);
      setPath(next, input.dataset.privateField, value);
    });
    next.assumptions ||= {};
    document.querySelectorAll('[data-private-assumption]').forEach(input => {
      const type = input.dataset.privateAssumption;
      const key = input.dataset.privateAssumptionKey;
      next.assumptions[type] ||= {};
      next.assumptions[type][key] = Number(input.value || 0);
    });
    next.contributions = [...document.querySelectorAll('.private-plan-flow-edit-row')].map(row => ({
      id: row.dataset.flowId,
      label: row.querySelector('[data-flow-key="label"]').value,
      type: row.querySelector('[data-flow-key="type"]').value,
      before: Number(row.querySelector('[data-flow-key="before"]').value || 0),
      after: Number(row.querySelector('[data-flow-key="after"]').value || 0),
      startMonth: row.querySelector('[data-flow-key="startMonth"]').value,
      endMonth: row.querySelector('[data-flow-key="endMonth"]').value,
    }));
    return core().normalizePlan(next);
  }

  function renderFlowEditor() {
    const container = byId('privatePlanFlowEditor');
    const options = core().TYPES.map(type => `<option value="${type}">${escapeHtml(TYPE_LABELS[type] || type)}</option>`).join('');
    container.innerHTML = editorPlan.contributions.map(flow => `<div class="private-plan-flow-edit-row" data-flow-id="${escapeHtml(flow.id)}">
      <label>Destination<input type="text" maxlength="80" data-flow-key="label" value="${escapeHtml(flow.label)}"></label>
      <label>Catégorie<select data-flow-key="type">${options}</select></label>
      <label>Avant achat<input type="number" min="0" step="1" data-flow-key="before" value="${flow.before}"></label>
      <label>Après achat<input type="number" min="0" step="1" data-flow-key="after" value="${flow.after}"></label>
      <label>Début<input type="month" data-flow-key="startMonth" value="${escapeHtml(flow.startMonth)}"></label>
      <label>Fin facultative<input type="month" data-flow-key="endMonth" value="${escapeHtml(flow.endMonth)}"></label>
      <button type="button" class="private-plan-flow-delete" data-delete-flow="${escapeHtml(flow.id)}" aria-label="Supprimer ${escapeHtml(flow.label)}">×</button>
    </div>`).join('');
    container.querySelectorAll('.private-plan-flow-edit-row').forEach((row, index) => {
      row.querySelector('[data-flow-key="type"]').value = editorPlan.contributions[index].type;
    });
  }

  function renderAssumptionEditor() {
    byId('privatePlanAssumptionEditor').innerHTML = Object.entries(ASSUMPTION_LABELS).map(([type, label]) => {
      const assumption = editorPlan.assumptions[type];
      return `<div class="private-plan-assumption"><strong>${escapeHtml(label)}</strong>
        <label>Central (%)<input type="number" min="-95" max="100" step="0.5" data-private-assumption="${type}" data-private-assumption-key="rate" value="${assumption.rate}"></label>
        <label>Écart scénario<input type="number" min="0" max="100" step="0.5" data-private-assumption="${type}" data-private-assumption-key="spread" value="${assumption.spread}"></label>
      </div>`;
    }).join('');
  }

  function addFlow() {
    editorPlan = readEditor();
    editorPlan.contributions.push({
      id: root.crypto?.randomUUID?.() || `flow-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: 'Nouvelle destination', type: 'Autre',
      before: 0, after: 0, startMonth: core().currentMonth(), endMonth: '',
    });
    renderFlowEditor();
    byId('privatePlanFlowEditor').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function deleteFlow(id) {
    editorPlan = readEditor();
    editorPlan.contributions = editorPlan.contributions.filter(flow => flow.id !== id);
    renderFlowEditor();
  }

  async function saveEditor(event) {
    event.preventDefault();
    if (!record) return;
    const plan = readEditor();
    const errorElement = byId('privatePlanFormError');
    const saveButton = byId('privatePlanSaveBtn');
    const totalProject = plan.house.price + plan.house.notaryFees + plan.house.guaranteeFees + plan.house.brokerageFees + plan.house.applicationFees;
    if (!plan.house.price || !plan.house.targetDownPayment || plan.house.targetDownPayment > totalProject) {
      errorElement.textContent = 'Vérifiez le prix du bien et le montant de l’apport.';
      return;
    }
    const financingGap = totalProject - plan.house.targetDownPayment - plan.house.loanAmount;
    if (Math.abs(financingGap) > 5) {
      errorElement.textContent = `Le prêt et l’apport ne couvrent pas exactement le coût total du projet (écart de ${euro.format(Math.abs(financingGap))}).`;
      return;
    }
    if (!plan.contributions.length) {
      errorElement.textContent = 'Ajoutez au moins une ligne de versement.';
      return;
    }
    const user = context().user;
    if (!user?.id || user.id !== record.user_id) {
      errorElement.textContent = 'La session a changé. Fermez cette fenêtre puis réessayez.';
      return;
    }

    const baselineDate = byId('privatePlanBaselineDateInput').value || record.baseline_date;
    const baselineNote = byId('privatePlanBaselineNoteInput').value.trim();
    const changeNote = byId('privatePlanChangeNoteInput').value.trim();
    const changeLog = [...record.change_log];
    changeLog.push({
      date: new Date().toISOString().slice(0, 10),
      note: changeNote || 'Situation et hypothèses mises à jour',
    });
    while (changeLog.length > 50) changeLog.shift();

    saveButton.disabled = true;
    saveButton.textContent = 'Enregistrement…';
    errorElement.textContent = '';
    try {
      const client = app().getSupabaseClient();
      const payload = { plan, baseline_date: baselineDate, baseline_note: baselineNote, change_log: changeLog };
      const expectedUpdatedAt = record.updated_at;
      let data = null;
      let lastError = null;
      for (let attempt = 0; attempt < 2 && !data; attempt++) {
        let update = client.from(TABLE).update(payload).eq('user_id', user.id);
        if (expectedUpdatedAt) update = update.eq('updated_at', expectedUpdatedAt);
        const result = await update.select(RECORD_FIELDS).maybeSingle();
        if (result.data) {
          data = result.data;
          break;
        }
        lastError = result.error;
        if (!result.error || !isTransient(result.error)) break;
        await wait(500 * (attempt + 1));
        const latest = await readRecord(client, user.id, 1);
        if (!latest.error && rowMatches(latest.data, payload)) {
          data = latest.data; // La première écriture a réussi mais sa réponse s'est perdue.
          break;
        }
        if (!latest.error && latest.data?.updated_at !== expectedUpdatedAt) {
          const conflict = new Error('Situation modifiée depuis un autre appareil');
          conflict.code = 'plan_conflict';
          throw conflict;
        }
      }
      if (!data) {
        const latest = await readRecord(client, user.id, 1);
        if (!latest.error && rowMatches(latest.data, payload)) data = latest.data;
      }
      if (!data) {
        if (lastError) throw lastError;
        const conflict = new Error('Situation modifiée depuis un autre appareil');
        conflict.code = 'plan_conflict';
        throw conflict;
      }
      record = { ...data, plan: core().normalizePlan(data.plan), change_log: Array.isArray(data.change_log) ? data.change_log : [] };
      closeEditor();
      render();
      app()?.showToast?.('✅ Situation patrimoniale mise à jour', 'success');
    } catch (error) {
      console.error('[Moumix] Sauvegarde du plan privé impossible:', error.message);
      errorElement.textContent = error.code === 'plan_conflict'
        ? 'Cette situation a été modifiée depuis un autre appareil. Fermez puis rouvrez cet écran avant de recommencer.'
        : 'Impossible de confirmer l’enregistrement. Vos données précédentes restent disponibles.';
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Enregistrer les modifications';
    }
  }

  function bind() {
    byId('privatePlanEditBtn')?.addEventListener('click', openEditor);
    byId('privatePlanCancelBtn')?.addEventListener('click', closeEditor);
    byId('privatePlanForm')?.addEventListener('submit', saveEditor);
    byId('privatePlanAddFlowBtn')?.addEventListener('click', addFlow);
    byId('privatePlanFlowEditor')?.addEventListener('click', event => {
      const button = event.target.closest('[data-delete-flow]');
      if (button) deleteFlow(button.dataset.deleteFlow);
    });
    byId('privatePlanModal')?.addEventListener('click', event => {
      if (event.target === byId('privatePlanModal')) closeEditor();
    });
    document.querySelectorAll('[data-private-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.privateView)));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && byId('privatePlanModal')?.classList.contains('open')) closeEditor();
    });
  }

  function refreshFromPortfolio() {
    if (record) render();
  }

  function getExportData() {
    return record ? clone({ baseline_date: record.baseline_date, plan: record.plan, baseline_note: record.baseline_note, change_log: record.change_log, updated_at: record.updated_at }) : null;
  }

  root.MoumixPrivatePlan = Object.freeze({ load, reset, render, refreshFromPortfolio, getExportData });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})(typeof globalThis !== 'undefined' ? globalThis : window);
