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

const userId = 'f723f2c9-ccf1-498a-b3e2-999020b4848a';

function account(overrides = {}) {
  return {
    id: '66fcf296-3c74-43ff-9b2c-f501c34100c3',
    user_id: userId,
    name: 'BoursoBank',
    type: 'PEA',
    solde: null,
    ...overrides,
  };
}

function position(overrides = {}) {
  return {
    id: '7041514b-ae4d-4b20-98ce-3cd1e59575ee',
    user_id: userId,
    account_id: account().id,
    symbol: 'ESE.PA',
    name: 'BNP Paribas Easy S&P 500',
    qty: 100,
    price: 25,
    current: 27,
    change: 0.2,
    change_percent: 0.75,
    last_updated: 1788800000000,
    ...overrides,
  };
}

test('parcours connexion : une lecture Supabase temporairement refusée est retentée', async () => {
  let attempts = 0;
  const session = await core.retryOperation(async () => {
    attempts++;
    if (attempts < 3) {
      const error = new Error('JWT issued at future');
      error.kind = 'jwt_future';
      throw error;
    }
    return { user: { id: userId } };
  }, {
    attempts: 4,
    delays: [0, 0, 0],
    shouldRetry: error => ['jwt_future', 'network', 'timeout'].includes(error.kind),
  });

  assert.equal(session.user.id, userId);
  assert.equal(attempts, 3);
});

test('parcours ajout : un compte valide est écrit une seule fois avec le même identifiant', async () => {
  const rows = new Map();
  const row = account({ type: 'Livret A', solde: 6000 });
  core.validateAccountRecord(row);

  await core.retryOperation(async () => {
    rows.set(row.id, structuredClone(row));
  }, { attempts: 4, delays: [0], shouldRetry: () => true });

  assert.equal(rows.size, 1);
  assert.deepEqual(rows.get(row.id), row);
});

test('parcours modification : la position et son mouvement sont validés puis enregistrés', async () => {
  const positions = new Map([[position().id, position()]]);
  const transactions = new Map();
  const edited = position({ qty: 125, price: 25.4 });
  const tx = {
    id: 'fd17bc94-4fcb-4c09-8ab9-b96848df9bb4',
    user_id: userId,
    type: 'edit',
    symbol: edited.symbol,
    qty: edited.qty,
    price: edited.price,
    ts: 1788800001000,
    old_qty: 100,
    old_price: 25,
  };

  core.validatePositionRecord(edited);
  core.validateTransactionRecord(tx);
  await core.runCompensatedOperation({
    commit: async () => positions.set(edited.id, structuredClone(edited)),
    audit: async () => transactions.set(tx.id, structuredClone(tx)),
    rollback: async () => positions.set(position().id, position()),
  });

  assert.equal(positions.get(edited.id).qty, 125);
  assert.equal(transactions.size, 1);
});

test('parcours suppression : une réponse perdue après le commit reste idempotente', async () => {
  const rows = new Map([[position().id, position()]]);
  let attempts = 0;
  let confirmedDeletes = 0;

  await core.retryOperation(async () => {
    attempts++;
    if (attempts === 1) {
      if (rows.delete(position().id)) confirmedDeletes++;
      const error = new Error('service indisponible');
      error.status = 503;
      throw error;
    }
    if (rows.delete(position().id)) confirmedDeletes++;
  }, {
    attempts: 4,
    delays: [0, 0, 0],
    shouldRetry: error => error.status >= 500,
  });

  assert.equal(attempts, 2);
  assert.equal(confirmedDeletes, 1);
  assert.equal(rows.size, 0);
});

test('parcours actualisation : seuls les champs de cotation sont fusionnés', () => {
  const concurrentState = [{
    id: position().id,
    symbol: 'ESE.PA',
    accountId: account().id,
    qty: 130,
    price: 25.6,
    current: 27,
  }];
  const refreshed = [{
    id: position().id,
    current: 28.5,
    change: 1.5,
    changePercent: 5.55,
    lastUpdated: 1788800002000,
  }];

  const merged = core.mergePositionPriceUpdates(concurrentState, refreshed);
  assert.equal(merged[0].qty, 130);
  assert.equal(merged[0].price, 25.6);
  assert.equal(merged[0].current, 28.5);
  assert.equal(merged[0].changePercent, 5.55);
});

test('le dernier état valide reste isolé par utilisateur et refuse les données corrompues', () => {
  const data = {
    accounts: [{ id: account().id, name: 'BoursoBank', type: 'PEA', solde: null }],
    positions: [{ id: position().id, accountId: account().id, symbol: 'ESE.PA', qty: 100, price: 25, current: 27 }],
    prelevements: [{ id: 'prel-1', name: 'Abonnement', amount: 12, freq: 'mensuel', cat: 'abonnement', split: 2 }],
    transactions: [{ id: 'tx-1', type: 'buy', symbol: 'ESE.PA', qty: 100, price: 25, ts: 1788800000000 }],
    patrimoineHistory: [{ date: '2026-09-08', value: 84000 }],
    goals: [{ id: 'goal-1', name: 'Apport', target: 50000, current: 6000 }],
  };
  const now = 1788800005000;
  const envelope = core.createDataCacheEnvelope(userId, data, now - 1000);

  const parsed = core.parseDataCacheEnvelope(JSON.stringify(envelope), userId, 5000, now);
  assert.equal(parsed.data.accounts[0].type, 'PEA');
  assert.throws(() => core.parseDataCacheEnvelope(envelope, 'another-user', 5000, now), /utilisateur/);
  assert.throws(() => core.validateCachedDataset({ ...data, patrimoineHistory: [{ date: 'hier', value: 84000 }] }), /historique/);
});
