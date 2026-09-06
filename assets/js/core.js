/* Primitives techniques sans dépendance au DOM, partagées avec les tests. */
(function exposeMoumixCore(root) {
  'use strict';

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
      return { currency: 'GBP', unitFactor: 0.01 };
    }
    return { currency: upper, unitFactor: 1 };
  }

  const api = Object.freeze({ mapWithConcurrency, normalizeQuoteCurrency });
  root.MoumixCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
