/* Primitives techniques sans dépendance au DOM, partagées avec les tests. */
(function exposeMoobankCore(root) {
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

  async function runCompensatedOperation({ commit, audit, rollback }) {
    if (typeof commit !== 'function' || typeof audit !== 'function' || typeof rollback !== 'function') {
      throw new TypeError('Opération compensée incomplète');
    }

    const committed = await commit();
    try {
      const audited = await audit(committed);
      return { committed, audited };
    } catch (operationError) {
      try {
        await rollback(committed, operationError);
      } catch (rollbackError) {
        const error = new Error('operation_rollback_failed');
        error.name = 'MoobankRollbackError';
        error.operationError = operationError;
        error.rollbackError = rollbackError;
        throw error;
      }
      throw operationError;
    }
  }

  async function retryOperation(task, options = {}) {
    if (typeof task !== 'function') throw new TypeError('Opération à retenter absente');
    const attempts = Math.max(1, Math.min(5, Number(options.attempts) || 1));
    const delays = Array.isArray(options.delays) ? options.delays : [];
    const shouldRetry = typeof options.shouldRetry === 'function' ? options.shouldRetry : () => true;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await task(attempt);
      } catch (error) {
        if (attempt >= attempts - 1 || !shouldRetry(error, attempt)) throw error;
        const delay = Math.max(0, Number(delays[Math.min(attempt, delays.length - 1)]) || 0);
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  const api = Object.freeze({
    mapWithConcurrency,
    normalizeQuoteCurrency,
    groupMonthlyContributions,
    runCompensatedOperation,
    retryOperation,
  });
  root.MoobankCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
