const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCore() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'core.js'), 'utf8');
  const sandbox = { module: { exports: {} }, console, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'core.js' });
  return sandbox.module.exports;
}

const core = loadCore();

test('la limite de concurrence est respectée et l’ordre est conservé', async () => {
  let active = 0;
  let maximum = 0;
  const values = await core.mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async value => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 4));
    active--;
    return value * 2;
  });
  assert.equal(maximum, 3);
  assert.deepEqual(Array.from(values), [2, 4, 6, 8, 10, 12]);
});

test('les cotations britanniques en pence sont ramenées en livres', () => {
  assert.deepEqual({ ...core.normalizeQuoteCurrency('GBp') }, { currency: 'GBP', unitFactor: 0.01, rawCurrency: 'GBp' });
  assert.deepEqual({ ...core.normalizeQuoteCurrency('GBX') }, { currency: 'GBP', unitFactor: 0.01, rawCurrency: 'GBX' });
  assert.deepEqual({ ...core.normalizeQuoteCurrency('EUR') }, { currency: 'EUR', unitFactor: 1, rawCurrency: 'EUR' });
});

test('la fraîcheur des cours distingue complet, partiel et ancien', () => {
  const now = 1_000_000;
  assert.equal(core.getQuoteFreshness([now - 1_000, now - 2_000], { now, freshForMs: 10_000 }).level, 'fresh');
  assert.equal(core.getQuoteFreshness([now - 1_000, now - 20_000], { now, freshForMs: 10_000 }).level, 'partial');
  assert.equal(core.getQuoteFreshness([now - 20_000], { now, freshForMs: 10_000 }).level, 'stale');
});

test('une projection à rendement nul sépare correctement capital et versements', () => {
  const result = core.computeProjection({
    buckets: [{ type: 'PEA', label: 'PEA', value: 10_000 }],
    monthly: 100,
    years: 1,
    annualRates: { PEA: 0 },
    contributionWeights: { PEA: 1 },
  });
  assert.equal(result.data.length, 2);
  assert.ok(Math.abs(result.final - 11_200) < 1e-8);
  assert.ok(Math.abs(result.totalInvested - 11_200) < 1e-8);
  assert.ok(Math.abs(result.totalInterest) < 1e-8);
});

test('une projection positive reste supérieure au capital investi', () => {
  const result = core.computeProjection({
    buckets: [{ type: 'PEA', label: 'PEA', value: 20_000 }],
    monthly: 300,
    years: 10,
    annualRates: { PEA: 7 },
    contributionWeights: { PEA: 1 },
  });
  assert.ok(result.final > result.totalInvested);
  assert.equal(result.finalBreakdown.length, 1);
});
