const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/private-plan-core.js'), 'utf8');
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(source, sandbox, { filename: 'private-plan-core.js' });
const core = sandbox.module.exports;

const plan = {
  profile: {
    age: 40,
    personalIncomeAnnual: 32000,
    partnerIncomeAnnual: 48000,
    partnerBonusAnnual: 2000,
    currentHousingMonthly: 800,
  },
  household: {
    partnerLiquid: 40000,
    partnerPea: 36000,
    reserveMinimum: 20000,
    inheritanceEnabled: false,
    inheritanceAmount: 100000,
    inheritanceAfterYears: 15,
  },
  house: {
    price: 320000,
    notaryFees: 24000,
    guaranteeFees: 3000,
    brokerageFees: 2000,
    applicationFees: 1000,
    targetDownPayment: 75000,
    personalTarget: 40000,
    personalFund: 0,
    loanAmount: 275000,
    annualRate: 3.2,
    durationYears: 25,
    insuranceMonthly: 0,
    propertyTaxMonthly: 0,
    maintenanceMonthly: 0,
    earliestPurchaseMonth: '2026-10',
  },
  projection: { horizonYears: 20, inflationRate: 2 },
  contributions: [
    { id: 'house', label: 'Apport maison', type: 'HOUSE', before: 900, after: 0, startMonth: '2026-10', endMonth: '' },
    { id: 'pea', label: 'PEA', type: 'PEA', before: 350, after: 350, startMonth: '2026-10', endMonth: '' },
    { id: 'cto', label: 'CTO', type: 'CTO', before: 75, after: 75, startMonth: '2026-10', endMonth: '' },
    { id: 'btc', label: 'Bitcoin', type: 'Crypto', before: 100, after: 100, startMonth: '2026-10', endMonth: '' },
  ],
};

const buckets = [
  { type: 'PEA', value: 60000 },
  { type: 'Livret', value: 10000 },
  { type: 'Crypto', value: 2000 },
  { type: 'CTO', value: 4000 },
  { type: 'AV', value: 1000 },
];

function simulate(scenario = 'real') {
  return core.simulate({ plan, buckets, scenario, startMonth: '2026-09' });
}

test('la mensualité de référence correspond à la simulation immobilière', () => {
  const payment = core.monthlyPayment(275000, 3.2, 25);
  assert.ok(payment > 1325 && payment < 1345, `mensualité obtenue : ${payment}`);
});

test('le point de départ distingue patrimoine personnel, foyer et réserve', () => {
  const result = simulate();
  assert.equal(result.personalTotal, 77000);
  assert.equal(result.householdTotal, 153000);
  assert.equal(result.householdLiquid, 50000);
  assert.equal(result.mobilizableNow, 30000);
  assert.equal(result.remainingDownPayment, 45000);
  assert.equal(result.monthlyBefore, 1425);
  assert.equal(result.monthlyAfter, 525);
  assert.ok(result.finalRealNetWorth < result.final.netWorth);
});

test('le scénario central atteint l’achat sans utiliser les actifs de long terme', () => {
  const result = simulate();
  assert.match(result.purchaseMonth, /^20(29|30|31)-\d{2}$/);
  assert.ok(result.final.financialAssets > 0);
  assert.ok(result.final.propertyValue > 0);
  assert.ok(result.final.mortgageBalance > 0);
  assert.equal(result.inheritanceApplied, false);
});

test('les scénarios restent ordonnés et l’héritage reste exclu par défaut', () => {
  const prudent = simulate('pess');
  const central = simulate('real');
  const favorable = simulate('opti');
  assert.ok(prudent.final.netWorth < central.final.netWorth);
  assert.ok(central.final.netWorth < favorable.final.netWorth);
  assert.equal(prudent.inheritanceApplied, false);
  assert.equal(central.inheritanceApplied, false);
  assert.equal(favorable.inheritanceApplied, false);
});

test('un versement futur ne commence pas avant sa date', () => {
  const delayed = structuredClone(plan);
  delayed.contributions = [{ id: 'pea', label: 'PEA', type: 'PEA', before: 400, after: 400, startMonth: '2027-01', endMonth: '' }];
  delayed.projection.horizonYears = 1;
  delayed.house.targetDownPayment = 0;
  delayed.household.partnerLiquid = 0;
  delayed.household.partnerPea = 0;
  delayed.household.reserveMinimum = 0;
  const result = core.simulate({ plan: delayed, buckets: [], scenario: 'real', startMonth: '2026-09' });
  assert.equal(result.monthlyBefore, 400);
  assert.ok(result.final.financialAssets > 3500 && result.final.financialAssets < 3700);
});
