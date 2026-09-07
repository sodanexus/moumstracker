const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'trajectory-core.js'), 'utf8');
const sandbox = { module: { exports: {} } };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'trajectory-core.js' });
const trajectory = sandbox.module.exports;

test('une poche sans rendement additionne exactement capital et versements', () => {
  const result = trajectory.computePortfolio(
    [{ type: 'Autre', label: 'Projet', value: 1000 }],
    new Map([['Autre', 100]]),
    2,
    'real'
  );
  assert.equal(result.totalInvested, 3400);
  assert.equal(result.final, 3400);
  assert.equal(result.totalInterest, 0);
  assert.equal(result.data.length, 3);
});

test('les scénarios restent ordonnés pour une poche actions', () => {
  const buckets = [{ type: 'PEA', label: 'PEA', value: 72000 }];
  const monthly = new Map([['PEA', 400]]);
  const pess = trajectory.computePortfolio(buckets, monthly, 15, 'pess');
  const real = trajectory.computePortfolio(buckets, monthly, 15, 'real');
  const opti = trajectory.computePortfolio(buckets, monthly, 15, 'opti');
  assert.ok(pess.final < real.final);
  assert.ok(real.final < opti.final);
});

test('la valeur en euros constants tient compte de l’inflation', () => {
  assert.equal(trajectory.presentValue(100000, 0, 20), 100000);
  assert.ok(trajectory.presentValue(100000, 2, 20) < 70000);
});

test('les hypothèses personnalisées sont bornées', () => {
  assert.equal(trajectory.assumptionFor('PEA', { PEA: 500 }).rate, 100);
  assert.equal(trajectory.assumptionFor('PEA', { PEA: -500 }).rate, -50);
});
