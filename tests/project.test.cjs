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
  for (const file of ['assets/css/app.css', 'assets/css/v2.css', 'assets/js/core.js', 'assets/js/trajectory-core.js', 'assets/js/app.js', 'assets/js/history-import.js']) {
    assert.match(html, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(fs.existsSync(path.join(root, file)), `${file} doit exister`);
  }
});

test('la V2 retire les éléments de trading et la mascotte', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  assert.doesNotMatch(html, /indices-ticker|dogWidget|Shiba|Jalons patrimoniaux/);
  assert.doesNotMatch(app, /loadNewsIndices|showDog|dogClick|MILESTONES/);
  assert.match(html, /USD\/EUR/);
});

test('la synthèse propose une allocation lisible sans vue Comptes redondante', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  for (const label of ['Synthèse', 'Portefeuille', 'Trajectoire']) {
    assert.match(html, new RegExp(label));
  }
  const allocationControls = html.match(/<div class="allocation-mode"[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(allocationControls, />Poches</);
  assert.match(allocationControls, />Actifs</);
  assert.doesNotMatch(allocationControls, />Comptes</);
  assert.match(app, /allocationMode = 'type'/);
  assert.match(app, /\['type', 'asset'\]\.includes\(mode\)/);
  assert.doesNotMatch(app, /allocationMode === 'account'/);
  assert.match(app, /setTrajectoryYears/);
});

test('la nouvelle identité transparente est utilisée par le site et la PWA', () => {
  const html = read('index.html');
  const worker = read('sw.js');
  const mark = read('assets/brand/moobank-mark.svg');
  const manifest = JSON.parse(read('manifest.json'));
  assert.match(html, /assets\/brand\/moobank-mark\.svg/);
  assert.match(worker, /assets\/brand\/moobank-mark\.svg/);
  assert.match(worker, /assets\/css\/v2\.css/);
  assert.doesNotMatch(mark, /<rect\b/i);
  assert.equal(manifest.name, 'Moobank — Patrimoine');
  assert.equal(JSON.parse(read('version.json')).version, '2.3.0');
});

test('la synthèse remplace le doublon des poches par trois actualités non bloquantes', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  assert.match(html, /class="card market-news-card"/);
  assert.match(html, /id="marketNewsContent"/);
  assert.doesNotMatch(html, /id="byAccountContent"|id="accountCountBadge"/);
  assert.match(app, /newsCount=3/);
  assert.match(app, /slice\(0, 3\)/);
  assert.match(app, /actualités indisponibles/);
});

test('la navigation et les actions suivent la nouvelle hiérarchie responsive', () => {
  const html = read('index.html');
  const css = read('assets/css/v2.css');
  const app = read('assets/js/app.js');
  assert.match(html, /header-primary[\s\S]*brand-mark[\s\S]*navigation-bar/);
  assert.match(html, /app-menu-toggle/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.navigation-bar \{[\s\S]*position: fixed/);
  assert.match(css, /padding-bottom: max\(92px, calc\(76px \+ var\(--safe-bottom\)\)\)/);
  assert.doesNotMatch(app, /mobileActionsMedia\.matches/);
  assert.doesNotMatch(html, /id="openAccountBtn"|id="openPositionBtn"|id="userMenu"/);
});

test('la trajectoire explicite inflation, versements et rendement', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  const trajectory = read('assets/js/trajectory-core.js');
  assert.match(html, /id="sim-inflation"/);
  assert.match(html, /id="sim-res-real-today"/);
  assert.match(html, /id="sim-formula-summary"/);
  assert.match(app, /MoobankTrajectory\.presentValue/);
  assert.match(trajectory, /Math\.pow\(1 \+ inflation, duration\)/);
  assert.match(app, /futurs versements/);
});

test('la composition du résultat est fusionnée dans la carte de trajectoire', () => {
  const html = read('index.html');
  const css = read('assets/css/v2.css');
  const cardIndex = html.indexOf('trajectory-main-card');
  const compositionIndex = html.indexOf('trajectory-composition-inline');
  const chartIndex = html.indexOf('trajectory-chart');
  assert.ok(cardIndex >= 0 && compositionIndex > cardIndex && chartIndex > compositionIndex);
  assert.doesNotMatch(html, /class="card trajectory-composition(?:"|\s)/);
  assert.match(css, /\.trajectory-results \{ display: block; align-self: start; \}/);
});

test('le plan mensuel est modifiable par compte et isolé localement par utilisateur', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  assert.match(html, /id="sim-contribution-plan"/);
  assert.match(html, /id="sim-plan-total"/);
  assert.doesNotMatch(html, /id="sim-monthly"|id="sim-contribution-target"/);
  assert.match(app, /SIM_PLAN_STORAGE_PREFIX \+ userId/);
  assert.match(app, /SIM_PLAN_LEGACY_STORAGE_PREFIX \+ userId/);
  assert.match(app, /localStorage\.setItem\(currentKey, stored\)/);
  assert.match(app, /MoobankCore\.groupMonthlyContributions/);
  assert.match(app, /trajectoryPlan: \{ \.\.\.simContributionPlan \}/);
});

test('l’ancien plan privé est absent du runtime et son nettoyage reste optionnel', () => {
  const html = read('index.html');
  const app = read('assets/js/app.js');
  const schema = read('supabase_shema.sql');
  const cleanup = read('scripts/optional/remove-private-projection-plan.sql');
  assert.doesNotMatch(html + app + schema, /private_projection_plan/);
  assert.match(cleanup, /DROP TABLE IF EXISTS public\.private_projection_plan/);
  for (const protectedTable of ['accounts', 'positions', 'transactions', 'prelevements', 'goals', 'patrimoine_history']) {
    assert.doesNotMatch(cleanup, new RegExp(`DROP TABLE[^;]*${protectedTable}`, 'i'));
  }
});

test('le nom public de l’application est Moobank', () => {
  const html = read('index.html');
  const manifest = JSON.parse(read('manifest.json'));
  assert.match(html, /<title>Moobank/);
  assert.equal(manifest.short_name, 'Moobank');
  assert.doesNotMatch(html, /Moumix/i);
});

test('les identifiants HTML sont uniques', () => {
  const html = read('index.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
});

test('toutes les ressources locales déclarées par le HTML existent', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  for (const ref of refs) {
    if (/^(?:https?:|data:|#)/i.test(ref)) continue;
    const localPath = ref.split(/[?#]/, 1)[0].replace(/^\.\//, '');
    assert.ok(fs.existsSync(path.join(root, localPath)), `${ref} doit pointer vers un fichier existant`);
  }
});

test('les cotations frontend sont limitées, dédupliquées et mises en cache', () => {
  const app = read('assets/js/app.js');
  assert.match(app, /QUOTE_CONCURRENCY = 3/);
  assert.match(app, /yfResponseCache/);
  assert.match(app, /yfInFlight/);
  assert.match(app, /MoobankCore\.mapWithConcurrency\(uniqueSymbols, QUOTE_CONCURRENCY/);
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
  for (const file of ['assets/css/app.css', 'assets/css/v2.css', 'assets/js/core.js', 'assets/js/trajectory-core.js', 'assets/js/app.js', 'assets/js/history-import.js']) {
    assert.match(worker, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(worker, /cache: 'no-store'/);
  assert.match(worker, /mustStayFresh/);
});

test('la safe area mobile appartient à l’en-tête et la navigation reste en bas', () => {
  const css = read('assets/css/v2.css');
  assert.match(css, /--safe-top: env\(safe-area-inset-top, 0px\)/);
  assert.match(css, /--safe-bottom: env\(safe-area-inset-bottom, 0px\)/);
  assert.match(css, /\.app > header \{[\s\S]*?top: 0;[\s\S]*?padding: calc\(var\(--safe-top\) \+ 7px\)/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.navigation-bar \{[\s\S]*?position: fixed;[\s\S]*?inset: auto 0 0 0;[\s\S]*?var\(--safe-bottom\)/);
});

test('les versions publiques et les ressources versionnées sont cohérentes', () => {
  const html = read('index.html');
  const worker = read('sw.js');
  const version = JSON.parse(read('version.json')).version;
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(version, '2.3.0');
  assert.equal(pkg.version, version);
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  assert.match(html, new RegExp(`moobank-version" content="${version.replaceAll('.', '\\.')}`));
  assert.match(html, new RegExp(`assets/css/v2\\.css\\?v=${version.replaceAll('.', '\\.')}`));
  assert.match(worker, new RegExp(`APP_VERSION = '${version.replaceAll('.', '\\.')}'`));
});

test('le workflow de snapshot porte le nom Moobank', () => {
  const workflow = read('.github/workflows/daily-snapshot.yml');
  assert.match(workflow, /^name: Moobank — snapshot quotidien/m);
  assert.match(workflow, /group: moobank-daily-patrimoine-snapshot/);
});

test('achat, vente et modification partagent la même compensation technique', () => {
  const app = read('assets/js/app.js');
  assert.ok((app.match(/MoobankCore\.runCompensatedOperation/g) || []).length >= 3);
  assert.match(app, /from\('transactions'\)\.upsert\(row, \{ onConflict: 'id' \}\)/);
  assert.doesNotMatch(app, /from\('transactions'\)\.insert\(row\)/);
});
