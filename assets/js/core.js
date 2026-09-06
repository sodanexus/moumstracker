/* Fonctions pures et primitives techniques partagées par l'interface et les tests. */
(function exposeMoumixCore(root) {
  'use strict';

  const APP_VERSION = '2.0.0';

  async function mapWithConcurrency(items, limit, mapper) {
    const list = Array.from(items || []);
    const concurrency = Math.max(1, Math.min(list.length || 1, Number(limit) || 1));
    const results = new Array(list.length);
    let cursor = 0;

    async function worker() {
      while (cursor < list.length) {
        const index = cursor++;
        results[index] = await mapper(list[index], index, list);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
  }

  function normalizeQuoteCurrency(rawCurrency) {
    const raw = String(rawCurrency || 'EUR');
    const upper = raw.toUpperCase();
    if (raw === 'GBp' || upper === 'GBX') {
      return { currency: 'GBP', unitFactor: 0.01, rawCurrency: raw };
    }
    return { currency: upper, unitFactor: 1, rawCurrency: raw };
  }

  function getQuoteFreshness(timestamps, options = {}) {
    const now = Number(options.now) || Date.now();
    const freshForMs = Number(options.freshForMs) || 15 * 60 * 1000;
    const valid = Array.from(timestamps || []).map(Number).filter(Number.isFinite).filter(value => value > 0);
    if (!valid.length) return { level: 'stale', latest: 0, freshCount: 0, total: 0 };
    const latest = Math.max(...valid);
    const freshCount = valid.filter(value => now - value <= freshForMs).length;
    return {
      level: freshCount === valid.length ? 'fresh' : freshCount > 0 ? 'partial' : 'stale',
      latest,
      freshCount,
      total: valid.length,
    };
  }

  function readJsonStorage(storage, key, fallback = null) {
    try {
      const raw = storage?.getItem?.(key);
      if (!raw) return fallback;
      const value = JSON.parse(raw);
      return value && typeof value === 'object' ? value : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJsonStorage(storage, key, value) {
    try {
      storage?.setItem?.(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function computeProjection({ buckets = [], monthly = 0, years = 1, annualRates = {}, contributionWeights = {} } = {}) {
    const duration = Math.max(1, Math.min(60, Math.trunc(Number(years) || 1)));
    const contribution = Math.max(0, Number(monthly) || 0);
    const states = buckets.map(bucket => {
      const annualRatePct = Math.max(-95, Math.min(100, Number(annualRates[bucket.type]) || 0));
      const annualRate = annualRatePct / 100;
      return {
        type: bucket.type,
        label: bucket.label || bucket.type,
        start: Math.max(0, Number(bucket.value) || 0),
        capital: Math.max(0, Number(bucket.value) || 0),
        contributed: 0,
        annualRate,
        monthlyRate: Math.pow(1 + annualRate, 1 / 12) - 1,
        monthlyContribution: contribution * Math.max(0, Number(contributionWeights[bucket.type]) || 0),
      };
    });
    const initial = states.reduce((sum, state) => sum + state.start, 0);
    const appliedMonthly = states.reduce((sum, state) => sum + state.monthlyContribution, 0);
    let totalInvested = initial;
    const data = [{ year: 0, capital: initial, invested: initial, interest: 0 }];

    for (let year = 1; year <= duration; year++) {
      for (let month = 0; month < 12; month++) {
        states.forEach(state => {
          state.capital = state.capital * (1 + state.monthlyRate) + state.monthlyContribution;
          state.contributed += state.monthlyContribution;
        });
        totalInvested += appliedMonthly;
      }
      const capital = states.reduce((sum, state) => sum + state.capital, 0);
      data.push({ year, capital, invested: totalInvested, interest: capital - totalInvested });
    }

    const final = states.reduce((sum, state) => sum + state.capital, 0);
    return {
      data,
      final,
      totalInvested,
      totalInterest: final - totalInvested,
      monthlyGrowth: states.reduce((sum, state) => sum + state.capital * state.monthlyRate, 0),
      finalBreakdown: states.map(state => ({
        type: state.type,
        label: state.label,
        start: state.start,
        contributed: state.contributed,
        invested: state.start + state.contributed,
        final: state.capital,
        annualRate: state.annualRate,
      })).sort((a, b) => b.final - a.final),
    };
  }

  const api = Object.freeze({
    APP_VERSION,
    mapWithConcurrency,
    normalizeQuoteCurrency,
    getQuoteFreshness,
    computeProjection,
    readJsonStorage,
    writeJsonStorage,
  });

  root.MoumixCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
