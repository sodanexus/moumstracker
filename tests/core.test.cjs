const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'core.js'), 'utf8');
const sandbox = { module: { exports: {} }, console, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'core.js' });
const core = sandbox.module.exports;

test('la limite de concurrence est respectée et l’ordre reste stable', async () => {
  let running = 0;
  let maximum = 0;
  const values = await core.mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async value => {
    running++;
    maximum = Math.max(maximum, running);
    await new Promise(resolve => setTimeout(resolve, 4));
    running--;
    return value * 2;
  });
  assert.equal(maximum, 2);
  assert.deepEqual(Array.from(values), [2, 4, 6, 8, 10, 12]);
});

test('les cotations britanniques en pence sont normalisées en livres', () => {
  assert.deepEqual({ ...core.normalizeQuoteCurrency('GBp') }, { currency: 'GBP', unitFactor: 0.01 });
  assert.deepEqual({ ...core.normalizeQuoteCurrency('GBX') }, { currency: 'GBP', unitFactor: 0.01 });
  assert.deepEqual({ ...core.normalizeQuoteCurrency('usd') }, { currency: 'USD', unitFactor: 1 });
});

test('le plan mensuel est regroupé correctement par poche', () => {
  const accounts = [
    { id: 'house', type: 'Livret' },
    { id: 'pea', type: 'PEA' },
    { id: 'cto', type: 'CTO' },
    { id: 'btc', type: 'Crypto' },
    { id: 'second-pea', type: 'PEA' },
  ];
  const grouped = core.groupMonthlyContributions(accounts, {
    house: 1000,
    pea: 400,
    cto: 50,
    btc: 108,
    'second-pea': 25,
  });
  assert.deepEqual({ ...grouped }, { Livret: 1000, PEA: 425, CTO: 50, Crypto: 108 });
  assert.equal(Object.values(grouped).reduce((sum, amount) => sum + amount, 0), 1583);
});
