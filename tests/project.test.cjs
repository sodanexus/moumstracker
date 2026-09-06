const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('la connexion privée ne contient aucun parcours d’inscription', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  assert.doesNotMatch(html, /tabSignup|Inscription|switchAuthTab/);
  assert.doesNotMatch(app, /auth\.signUp|tabSignup|switchAuthTab|authTab/);
  assert.match(app, /auth\.signInWithPassword/);
});

test('le HTML ne contient plus de CSS ou JavaScript applicatif intégré', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /<style(?:\s|>)/i);
  assert.doesNotMatch(html, /<script>\s*[\s\S]*?<\/script>/i);
  for (const file of ['assets/css/app.css', 'assets/js/core.js', 'assets/js/private-plan-core.js', 'assets/js/app.js', 'assets/js/private-plan.js', 'assets/js/history-import.js']) {
    assert.match(html, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(fs.existsSync(path.join(root, file)), `${file} doit exister`);
  }
});

test('les identifiants HTML sont uniques', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
});

test('les cotations frontend sont limitées, dédupliquées et mises en cache', () => {
  const app = read('assets/js/app.js');
  assert.match(app, /QUOTE_CONCURRENCY = 3/);
  assert.match(app, /yfResponseCache/);
  assert.match(app, /yfInFlight/);
  assert.match(app, /MoumixCore\.mapWithConcurrency\(uniqueSymbols, QUOTE_CONCURRENCY/);
});

test('le snapshot limite les requêtes et mutualise les cours entre utilisateurs', () => {
  const snapshot = read('scripts/daily-snapshot.js');
  assert.match(snapshot, /FETCH_ATTEMPTS = 4/);
  assert.match(snapshot, /QUOTE_CONCURRENCY = 3/);
  assert.match(snapshot, /rawQuoteCache/);
  assert.match(snapshot, /eurQuoteCache/);
  assert.match(snapshot, /providers\[\(attempt - 1\) % providers\.length\]/);
  assert.match(snapshot, /response\.text\(\)/);
});

test('le service worker couvre les fichiers séparés et attend la validation utilisateur', () => {
  const worker = read('sw.js');
  assert.match(worker, /SKIP_WAITING/);
  assert.doesNotMatch(worker, /cache\.addAll\(APP_SHELL\)[\s\S]{0,80}self\.skipWaiting/);
  for (const file of ['assets/css/app.css', 'assets/js/core.js', 'assets/js/private-plan-core.js', 'assets/js/app.js', 'assets/js/private-plan.js', 'assets/js/history-import.js']) {
    assert.match(worker, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('la version PWA est cohérente dans tous les fichiers publics', () => {
  const packageVersion = JSON.parse(read('package.json')).version;
  const publicVersion = JSON.parse(read('version.json')).version;
  assert.equal(packageVersion, '1.2.0');
  assert.equal(publicVersion, packageVersion);
  assert.match(read('index.html'), new RegExp(`moumix-version" content="${packageVersion.replaceAll('.', '\\.')}"`));
  assert.match(read('sw.js'), new RegExp(`APP_VERSION = '${packageVersion.replaceAll('.', '\\.')}'`));
});

test('le dossier patrimonial privé est optionnel et chargé après les données principales', () => {
  const app = read('assets/js/app.js');
  const privatePlan = read('assets/js/private-plan.js');
  assert.match(app, /renderGoals\(\);\s*window\.MoumixPrivatePlan\?\.load\(currentUser\)/);
  assert.match(privatePlan, /if \(!data\) return false/);
  assert.match(privatePlan, /setMode\(false\)/);
  assert.doesNotMatch(app, /private_projection_plan[^\n]*loadAllData/);
});

test('aucune ligne propriétaire ni donnée d’activation ne fuite dans le dépôt public', () => {
  const publicFiles = [
    'index.html', 'assets/css/app.css', 'assets/js/private-plan-core.js',
    'assets/js/private-plan.js', 'assets/js/app.js', 'README.md', 'supabase_shema.sql',
  ].map(read).join('\n');
  assert.doesNotMatch(publicFiles, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.doesNotMatch(publicFiles, /INSERT\s+INTO\s+public\.private_projection_plan/i);
});

test('la table privée ne donne au navigateur ni création ni suppression', () => {
  const schema = read('supabase_shema.sql');
  assert.match(schema, /ENABLE ROW LEVEL SECURITY/);
  assert.match(schema, /REVOKE ALL ON public\.private_projection_plan FROM anon, authenticated/);
  assert.match(schema, /GRANT SELECT, UPDATE ON public\.private_projection_plan TO authenticated/);
  assert.match(schema, /USING \(\(SELECT auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(schema, /GRANT[^;]*INSERT[^;]*private_projection_plan/i);
  assert.doesNotMatch(schema, /GRANT[^;]*DELETE[^;]*private_projection_plan/i);
});
