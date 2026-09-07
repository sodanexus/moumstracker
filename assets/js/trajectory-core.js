/* Moteur de trajectoire pur : aucun DOM, aucun stockage et aucune écriture
   Supabase. Le calcul peut ainsi être vérifié indépendamment de l'interface. */
(function exposeMoumixTrajectory(root) {
  'use strict';

  const DEFAULT_ASSUMPTIONS = Object.freeze({
    PEA:    Object.freeze({ rate: 7, spread: 4 }),
    CTO:    Object.freeze({ rate: 7, spread: 4 }),
    PEE:    Object.freeze({ rate: 5, spread: 3 }),
    PER:    Object.freeze({ rate: 5, spread: 3 }),
    AV:     Object.freeze({ rate: 3, spread: 1.5 }),
    Crypto: Object.freeze({ rate: 8, spread: 10 }),
    Livret: Object.freeze({ rate: 2, spread: 1 }),
    Immo:   Object.freeze({ rate: 3, spread: 2 }),
    Autre:  Object.freeze({ rate: 0, spread: 1 }),
  });

  const TYPE_LABELS = Object.freeze({
    PEA: 'PEA', CTO: 'CTO', PEE: 'Épargne salariale', PER: 'PER',
    AV: 'Assurance-vie', Crypto: 'Crypto', Livret: 'Livrets',
    Immo: 'Immobilier', Autre: 'Autre',
  });

  const TYPE_ORDER = Object.freeze(['PEA', 'CTO', 'PEE', 'PER', 'AV', 'Crypto', 'Livret', 'Immo', 'Autre']);

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function contributionFor(monthlyByType, type) {
    const raw = typeof monthlyByType?.get === 'function' ? monthlyByType.get(type) : monthlyByType?.[type];
    const amount = Number(raw);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }

  function assumptionFor(type, overrides = {}) {
    const fallback = DEFAULT_ASSUMPTIONS[type] || { rate: 4, spread: 3 };
    const override = Number(overrides?.[type]);
    return {
      rate: Number.isFinite(override) ? clamp(override, -50, 100) : fallback.rate,
      spread: fallback.spread,
    };
  }

  function scenarioRatePct(type, scenario, overrides = {}) {
    const assumption = assumptionFor(type, overrides);
    const delta = scenario === 'pess' ? -assumption.spread : scenario === 'opti' ? assumption.spread : 0;
    return clamp(assumption.rate + delta, -95, 100);
  }

  function weightedRatePct(buckets, monthlyByType, years, scenario, overrides = {}) {
    const duration = clamp(Number(years) || 1, 1, 60);
    let basisTotal = 0;
    let weightedTotal = 0;
    for (const bucket of Array.from(buckets || [])) {
      // La moitié des versements futurs approxime leur durée moyenne investie.
      const futureContributions = contributionFor(monthlyByType, bucket.type) * 12 * duration;
      const basis = Math.max(0, Number(bucket.value) || 0) + futureContributions / 2;
      basisTotal += basis;
      weightedTotal += basis * scenarioRatePct(bucket.type, scenario, overrides);
    }
    return basisTotal > 0 ? weightedTotal / basisTotal : 0;
  }

  function computePortfolio(buckets, monthlyByType, years, scenario, overrides = {}) {
    const duration = Math.round(clamp(Number(years) || 1, 1, 60));
    const states = Array.from(buckets || []).map(bucket => {
      const start = Math.max(0, Number(bucket.value) || 0);
      const annualRate = scenarioRatePct(bucket.type, scenario, overrides) / 100;
      return {
        type: bucket.type,
        label: bucket.label || TYPE_LABELS[bucket.type] || bucket.type || 'Autre',
        start,
        capital: start,
        contributed: 0,
        annualRate,
        monthlyRate: Math.pow(1 + annualRate, 1 / 12) - 1,
        monthlyContribution: contributionFor(monthlyByType, bucket.type),
      };
    });

    const initial = states.reduce((sum, state) => sum + state.start, 0);
    const appliedMonthly = states.reduce((sum, state) => sum + state.monthlyContribution, 0);
    let totalInvested = initial;
    const data = [{ year: 0, capital: initial, invested: initial, interest: 0 }];

    for (let year = 1; year <= duration; year++) {
      for (let month = 0; month < 12; month++) {
        for (const state of states) {
          state.capital = state.capital * (1 + state.monthlyRate) + state.monthlyContribution;
          state.contributed += state.monthlyContribution;
        }
        totalInvested += appliedMonthly;
      }
      const capital = states.reduce((sum, state) => sum + state.capital, 0);
      data.push({ year, capital, invested: totalInvested, interest: capital - totalInvested });
    }

    const final = states.reduce((sum, state) => sum + state.capital, 0);
    const finalBreakdown = states.map(state => ({
      type: state.type,
      label: state.label,
      start: state.start,
      contributed: state.contributed,
      invested: state.start + state.contributed,
      final: state.capital,
      annualRate: state.annualRate,
    })).sort((a, b) => b.final - a.final);
    const monthlyGrowth = states.reduce((sum, state) => sum + state.capital * state.monthlyRate, 0);

    return {
      data,
      final,
      totalInvested,
      totalInterest: final - totalInvested,
      monthlyGrowth,
      finalBreakdown,
    };
  }

  function presentValue(futureValue, inflationPct, years) {
    const value = Number(futureValue) || 0;
    const inflation = clamp(Number(inflationPct) || 0, 0, 20) / 100;
    const duration = clamp(Number(years) || 1, 1, 60);
    return value / Math.pow(1 + inflation, duration);
  }

  const api = Object.freeze({
    DEFAULT_ASSUMPTIONS,
    TYPE_LABELS,
    TYPE_ORDER,
    assumptionFor,
    scenarioRatePct,
    weightedRatePct,
    computePortfolio,
    presentValue,
  });

  root.MoumixTrajectory = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
