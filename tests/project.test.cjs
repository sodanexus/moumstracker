const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('la connexion privée ne contient plus aucun parcours d’inscription', () => {
  const html = read('index.html');
  const js = read('assets/js/app.js');
  assert.doesNotMatch(html, /Créer un compte<\/button>|Inscription|tabSignup/);
  assert.doesNotMatch(js, /auth\.signUp|switchAuthTab|tabSignup/);
  assert.match(html, /Accès privé/);
});

test('les identifiants HTML sont uniques', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
});

test('le shell V2 référence tous ses fichiers locaux', () => {
  const html = read('index.html');
  for (const file of ['assets/css/app.css', 'assets/css/v2.css', 'assets/js/core.js', 'assets/js/app.js', 'assets/js/v2.js']) {
    assert.match(html, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(fs.existsSync(path.join(root, file)), `${file} doit exister`);
  }
});

test('le SDK Supabase est épinglé sur une version exacte', () => {
  const html = read('index.html');
  const packageJson = JSON.parse(read('package.json'));
  assert.match(html, /@supabase\/supabase-js@2\.115\.0(?:["'])/);
  assert.equal(packageJson.dependencies['@supabase/supabase-js'], '2.115.0');
});

test('les confirmations sensibles utilisent la boîte de dialogue de l’application', () => {
  const app = read('assets/js/app.js');
  assert.match(app, /function appConfirm/);
  assert.doesNotMatch(app, /\b(?:alert|confirm)\s*\(/);
});

test('le service worker met en cache tout le shell V2', () => {
  const worker = read('sw.js');
  assert.match(worker, /moumix-shell-\$\{APP_VERSION\}/);
  assert.match(worker, /SKIP_WAITING/);
  for (const file of ['assets/css/app.css', 'assets/css/v2.css', 'assets/js/core.js', 'assets/js/app.js', 'assets/js/v2.js']) {
    assert.match(worker, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('le snapshot mutualise les cotations et limite leur concurrence', () => {
  const snapshot = read('scripts/daily-snapshot.js');
  assert.match(snapshot, /QUOTE_CONCURRENCY = 3/);
  assert.match(snapshot, /rawQuoteCache/);
  assert.match(snapshot, /eurQuoteCache/);
  assert.match(snapshot, /mapWithConcurrency/);
});

test('la migration atomique est additive', () => {
  const sql = read('supabase/migrations/20260906_atomic_trades.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.moumix_apply_trade/i);
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM public\.(?:accounts|transactions|patrimoine_history))\b/i);
});
