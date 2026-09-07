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

  function groupMonthlyContributions(accounts, plan) {
    const totals = {};
    for (const account of Array.from(accounts || [])) {
      const accountId = String(account?.id || '');
      const type = String(account?.type || 'Autre');
      if (!accountId) continue;
      const rawAmount = Number(plan?.[accountId]);
      const amount = Number.isFinite(rawAmount) ? Math.max(0, Math.min(100000, rawAmount)) : 0;
      totals[type] = (totals[type] || 0) + amount;
    }
    return totals;
  }

  const api = Object.freeze({ mapWithConcurrency, normalizeQuoteCurrency, groupMonthlyContributions });
  root.MoumixCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
