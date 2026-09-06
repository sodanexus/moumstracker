// ─── CONSTANTES CENTRALES ─────────────────────────────────────────────────────
// Source de vérité unique pour tous les types et labels.
// Ne plus écrire 'Livret', 'CTO' etc. en dur dans le code — utiliser ces objets.

// Types de comptes avec solde fixe (pas des positions de marché)
const FIXED_ACCOUNT_TYPES = new Set(['Livret', 'Immo', 'Autre']);

// Tag CSS par type de compte
const TAG_CLASS_MAP = {
  PEA: 'tag-pea', CTO: 'tag-cto', PEE: 'tag-pee', PER: 'tag-per',
  AV: 'tag-av', Crypto: 'tag-crypto', Immo: 'tag-immo',
  Livret: 'tag-livret', Autre: 'tag-autre',
};

// Libellés des catégories de prélèvements
const PREL_CAT_LABELS = {
  courtage: 'Courtage', frais: 'Frais gestion', credit: 'Crédit',
  abonnement: 'Abonnement', autre: 'Autre',
};

// Coefficient mensuel par fréquence de prélèvement
const PREL_FREQ_MONTHLY = { mensuel: 1, trimestriel: 1 / 3, annuel: 1 / 12 };

// ─── GESTION D'ERREURS GLOBALE ────────────────────────────────────────────────
// Capture toutes les erreurs JS non gérées et les affiche proprement
// plutôt que de laisser l'app silencieusement cassée.

window.onerror = function(message, source, lineno, colno, error) {
  console.error('[Moumix] Erreur non gérée', { message, source, lineno, colno, error });
  // Affiche le banner offline avec le message d'erreur
  const b = document.getElementById('offlineBanner');
  if (b) {
    b.textContent = '⚠️ Une erreur est survenue — rechargez la page si l\'app ne répond plus.';
    b.classList.remove('warn');
    b.classList.remove('hidden');
    setTimeout(() => b.classList.add('hidden'), 8000);
  }
  return false; // false = le navigateur logue aussi dans sa console
};

window.addEventListener('unhandledrejection', function(event) {
  // Ignore les erreurs réseau bénignes (fetch annulé, timeout Yahoo Finance…)
  const reason = event.reason;
  const msg = reason?.message || String(reason);
  if (msg.includes('NetworkError') || msg.includes('Failed to fetch') || msg.includes('AbortError')) return;
  console.error('[Moumix] Promise non gérée', reason);
});

// ─── SUPABASE INIT ────────────────────────────────────────────────────────────
const SUPA_URL = 'https://tjmbrwazzuhbsufxbjpu.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqbWJyd2F6enVoYnN1ZnhianB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTAwNTAsImV4cCI6MjA4Nzc4NjA1MH0.d4tplwCcMvcelCqqTMA6oh4Ur2phngwamrIJOjBXxog';
// Le SDK renouvelle les sessions expirées. Ne pas supprimer leurs refresh tokens
// ni ceux d'une autre application hébergée sur la même origine GitHub Pages.
const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentUser = null;
let accounts = [];
let prelevements = [];
let positions = [];
let positionHistory = {};
let patrimoineHistory = [];
let transactions = [];
let selectedTicker = null;
let searchTimeout = null;
let suggestionsIndex = -1;
let tickerSearchSeq = 0;
let _mobileRowData = {};      // données mobile des lignes de position
let _tickerSuggestions = [];  // suggestions ticker courantes (évite les attributs HTML encodés)
let currentChartPeriod = '1S';
let _eurUsdInterval = null;
let _priceRefreshInterval = null;
let _lastRenderedTotal = null;
let _totalAnimationToken = 0;
const ALLOC_COLORS = ['#00e5a0','#0070f3','#ffb400','#ff4466','#c27aff','#00cfff','#ff9a3c'];

// ─── ONGLETS ─────────────────────────────────────────────────────────────────
const TAB_ORDER = ['overview', 'details', 'simulator'];
let currentTabName = 'overview';

function switchTab(name, btn) {
  if (name === currentTabName) return;
  const current = document.querySelector('.tab-panel.active');
  const currentIdx = TAB_ORDER.indexOf(currentTabName);
  const nextIdx = TAB_ORDER.indexOf(name);
  const goingRight = nextIdx > currentIdx;

  // Sortie de l'onglet actuel
  if (current) {
    current.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
    current.style.opacity = '0';
    current.style.transform = goingRight ? 'translateX(-14px)' : 'translateX(14px)';
  }

  setTimeout(() => {
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.remove('active', 'slide-left');
      p.style.opacity = '';
      p.style.transform = '';
      p.style.transition = '';
      p.style.animation = '';
    });
    document.querySelectorAll('#mainTabs .tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    const next = document.getElementById('tab-' + name);
    if (!goingRight) next.classList.add('slide-left');
    next.classList.add('active');
    if (btn) {
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
    }
    currentTabName = name;
    if (name === 'overview') renderGoals();
    if (name === 'details') { renderAccounts(); renderPositions(); renderPrelevements(); }
    if (name === 'simulator') {
      requestAnimationFrame(() => {
        simUpdate();
        // Sur mobile, forcer le mode tableau
        if (window.innerWidth <= 768) {
          const btnTable = document.getElementById('simViewTable');
          if (btnTable) simSetView('table', btnTable);
        }
      });
    }
  }, current ? TIMING_TAB_TRANSITION : 0);
}

// ─── ANIMATION TIMING CONSTANTS ─────────────────────────────────────────────────────────────────────────────────────
const TIMING_TOAST_CLOSE     = 5000; // durée affichage toast (banner offline)
const TIMING_TOAST_SUCCESS   = 2500; // durée toast succès
const TIMING_TOAST_ERROR     = 4000; // durée toast erreur
const TIMING_TOAST_FADE      = 300;  // durée fade-out toast
const TIMING_BANNER_AUTO     = 8000; // durée affichage banner erreur
const TIMING_DOG_BUBBLE      = 6000; // durée bulle du chien
const TIMING_DOG_WAF         = 1800; // durée bulle "waf"
const TIMING_DOG_WAF_FADE    = 300;  // durée fade-out waf
const TIMING_DOG_SHOW        = 400;  // délai apparition chien au login
const TIMING_INDEX_UPDATE    = 400;  // durée animation index pill
const TIMING_RESIZE_DEBOUNCE = 80;   // debounce resize
const TIMING_SIM_DEBOUNCE    = 80;   // debounce simulateur
const TIMING_TICKER_SEARCH   = 300;  // debounce recherche ticker
const TIMING_TICKER_TIMEOUT  = 3000; // timeout abort recherche ticker
const TIMING_LIVRET_FOCUS    = 50;   // délai focus input livret
const TIMING_HISTORY_CLOSE   = 1800; // délai auto-fermeture modale historique après import
const TIMING_TAB_TRANSITION  = 160;  // durée animation sortie d'onglet avant affichage suivant
const TIMING_LOAD_TIMEOUT    = 12000; // laisse les lectures mobiles lentes aboutir sans attente infinie
const TIMING_SUPABASE_RETRY  = 1000; // délai avant retry Supabase après timeout
const JWT_RETRY_DELAYS       = [750, 1500, 3000, 6000, 10000]; // reprise bornée, sans recréer de JWT
const TIMING_PROXY_FETCH     = 5000; // timeout fetch via proxy CORS (Yahoo Finance & RSS)

// ─── AUTH ─────────────────────────────────────────────────────────────────────
let _authSubmitTask = null;
let _appInitTask = null;
let _appReadyTask = null;
let _authUser = null;          // session SDK, distincte des données réellement chargées
let _authEventVersion = 0;
let _failedLoad = null;

function canRetryDataLoad() {
  return _failedLoad && _failedLoad.kind !== 'auth_required' &&
    document.getElementById('auth-email').value.trim().toLowerCase() === _failedLoad.email.toLowerCase();
}

function syncAuthSubmitButton() {
  const busy = Boolean(_authSubmitTask || _appInitTask);
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = busy;
  btn.setAttribute('aria-busy', String(busy));
  btn.textContent = _appInitTask ? 'Chargement…' : _authSubmitTask ? 'Connexion…' :
    canRetryDataLoad() ? 'Réessayer' : 'Se connecter';
}

function setAuthLoadStatus(message) {
  document.getElementById('loadingStatus').textContent = message;
  const status = document.getElementById('auth-error');
  status.style.color = 'var(--text)';
  status.textContent = message;
}

async function submitAuth() {
  if (_authSubmitTask || _appInitTask) return;
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.color = 'var(--loss)';
  errEl.textContent = '';
  if (!email || (!password && !canRetryDataLoad())) { errEl.textContent = 'Email et mot de passe requis'; return; }
  const task = {};
  _authSubmitTask = task;
  syncAuthSubmitButton();
  try {
    // Après un échec de lecture, réutiliser la session : recréer un JWT ne ferait
    // que recommencer l'attente si son horodatage est momentanément rejeté.
    if (canRetryDataLoad()) {
      const { data, error } = await sb.auth.getSession();
      if (_authSubmitTask !== task) return;
      if (!error && data.session?.user?.id === _failedLoad?.userId) {
        _authUser = data.session.user;
        await initApp(data.session.user);
        return;
      }
      if (!password) { errEl.textContent = 'Veuillez saisir votre mot de passe pour vous reconnecter.'; return; }
    }
    const res = await sb.auth.signInWithPassword({ email, password });
    if (_authSubmitTask !== task) return;
    if (res.error) throw res.error;
    if (!res.data.session?.user) throw new Error('Session indisponible — veuillez réessayer.');
    _authUser = res.data.session.user;
    // Même point d'entrée que le démarrage et les événements SDK ; un seul
    // chargement peut tourner pour cet utilisateur.
    await initApp(res.data.session.user);
  } catch(e) {
    if (_authSubmitTask !== task) return;
    errEl.style.color = 'var(--loss)';
    const msg = e.message || 'Erreur réseau — veuillez réessayer.';
    errEl.textContent = /Invalid login/i.test(msg) ? 'Email ou mot de passe incorrect' :
      /fetch|network|load failed/i.test(msg) ? 'Erreur réseau — veuillez réessayer.' : msg;
  } finally {
    if (_authSubmitTask === task) {
      _authSubmitTask = null;
      syncAuthSubmitButton();
    }
  }
}

let userMenuOpen = false;
function toggleUserMenu() {
  userMenuOpen = !userMenuOpen;
  document.getElementById('userDropdown').classList.toggle('hidden', !userMenuOpen);
  document.querySelector('#userMenu .user-btn')?.setAttribute('aria-expanded', String(userMenuOpen));
}
document.addEventListener('click', e => {
  if (!document.getElementById('userMenu')?.contains(e.target)) {
    userMenuOpen = false;
    const dd = document.getElementById('userDropdown');
    if (dd) dd.classList.add('hidden');
    document.querySelector('#userMenu .user-btn')?.setAttribute('aria-expanded', 'false');
  }
});
async function signOut() {
  try {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  } catch(e) {
    console.error('[Moumix] signOut error:', e.message);
    showToast('Déconnexion impossible pour le moment. Réessayez.', 'error');
  }
}

function updateUserUI(user) {
  const email = user.email || '';
  const initials = email.slice(0,2).toUpperCase();
  document.getElementById('userAvatar').textContent = initials;
  const name = email.split('@')[0];
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  document.getElementById('userDisplayName').textContent = displayName;
  document.getElementById('userEmailDisplay').textContent = email;
  const mobileAvatar = document.getElementById('mobileUserAvatar');
  const mobileName = document.getElementById('mobileUserName');
  const mobileEmail = document.getElementById('mobileUserEmail');
  if (mobileAvatar) mobileAvatar.textContent = initials;
  if (mobileName) mobileName.textContent = displayName;
  if (mobileEmail) mobileEmail.textContent = email;
}

// ─── MENU D'ACTIONS MOBILE ──────────────────────────────────────────────────
const mobileActionsMedia = window.matchMedia('(max-width:768px)');
let mobileActionsPreviousInert = false;

function openMobileActions() {
  const overlay = document.getElementById('mobileActionsModal');
  const app = document.getElementById('mainApp');
  if (!overlay || !app || !mobileActionsMedia.matches || !currentUser ||
      app.classList.contains('hidden') || document.querySelector('.modal-overlay.open')) return;
  updateUserUI(currentUser);
  userMenuOpen = false;
  document.getElementById('userDropdown').classList.add('hidden');
  document.querySelector('#userMenu .user-btn')?.setAttribute('aria-expanded', 'false');
  overlay.inert = false;
  document.getElementById('mobileActionsBtn').setAttribute('aria-expanded', 'true');
  showDialog(overlay, '#mobileAddPositionBtn');
  _dialogReturnFocus = document.getElementById('mobileActionsBtn');
  mobileActionsPreviousInert = app.inert;
  app.inert = true;
}

function closeMobileActions() {
  const overlay = document.getElementById('mobileActionsModal');
  if (!overlay?.classList.contains('open')) return;
  document.getElementById('mainApp').inert = mobileActionsPreviousInert;
  document.getElementById('mobileActionsBtn').setAttribute('aria-expanded', 'false');
  hideDialog(overlay);
  overlay.inert = true;
}

function runMobileAction(action) {
  if (!document.getElementById('mobileActionsModal')?.classList.contains('open')) return;
  if (!['position', 'account', 'history', 'export', 'signout'].includes(action)) return;
  closeMobileActions();
  if (action === 'position' || action === 'account') openModal(action);
  else if (action === 'history') openHistoryImport();
  else if (action === 'export') exportDataBackup();
  else if (action === 'signout') signOut();
}

mobileActionsMedia.addEventListener('change', event => {
  if (!event.matches && document.getElementById('mobileActionsModal')?.classList.contains('open')) {
    closeMobileActions();
    document.getElementById('openAccountBtn')?.focus({ preventScroll: true });
  }
});

function exportDataBackup() {
  const payload = {
    format: 'moumix-finance-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts,
    positions,
    prelevements,
    transactions,
    patrimoineHistory,
    goals
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `moumix-backup-${parisDateKey()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  userMenuOpen = false;
  document.getElementById('userDropdown').classList.add('hidden');
  document.querySelector('#userMenu .user-btn')?.setAttribute('aria-expanded', 'false');
  showToast('✅ Sauvegarde JSON téléchargée', 'success');
}

// ─── DB LOAD ──────────────────────────────────────────────────────────────────
function dataLoadError(kind, queryErrors = []) {
  const error = new Error(`load_failed: ${kind}`);
  error.kind = kind;
  error.queryErrors = queryErrors;
  return error;
}

function canceledDataLoad() {
  return new DOMException('Chargement annulé', 'AbortError');
}

async function loadAllData(uid, signal) {
  if (signal.aborted) throw canceledDataLoad();
  const controller = new AbortController();
  let timer;
  let onAbort;
  const stopped = new Promise((_, reject) => {
    onAbort = () => { reject(canceledDataLoad()); controller.abort(); };
    signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { reject(dataLoadError('timeout')); controller.abort(); }, TIMING_LOAD_TIMEOUT);
  });
  const tables = ['accounts', 'positions', 'prelevements', 'transactions', 'patrimoine_history', 'goals'];
  try {
    // Seulement des lectures. Le timeout annule les requêtes encore en cours.
    const results = await Promise.race([
      Promise.all(tables.map(table => sb.from(table).select('*').eq('user_id', uid)
        .order(table === 'transactions' ? 'ts' : table === 'patrimoine_history' ? 'date' : 'created_at',
          { ascending: table !== 'transactions' })
        .abortSignal(controller.signal))),
      stopped
    ]);
    if (signal.aborted) throw canceledDataLoad();
    const errors = results.flatMap((response, i) => {
      if (!response.error && Array.isArray(response.data)) return [];
      return [{ table: tables[i], status: response.status || response.error?.status || 0,
        code: response.error?.code || '', message: response.error?.message || 'Réponse inattendue' }];
    });
    if (errors.length) {
      // PostgREST met le statut HTTP sur la réponse, pas sur response.error.
      const futureJwt = errors.every(e => (e.status === 401 || e.code === 'PGRST303') && /JWT issued at future/i.test(e.message));
      const temporary = errors.every(e => e.status === 0 || e.status >= 500);
      const kind = futureJwt ? 'jwt_future' : temporary ? 'network' :
        errors.every(e => e.status === 401) ? 'auth_required' : 'database';
      throw dataLoadError(kind, errors);
    }
    const [accRes, posRes, prelRes, txRes, histRes, goalsRes] = results;
    // Aucune affectation globale ici : l'appelant doit encore vérifier que la
    // session n'a pas changé. Toutes les tables sont validées avant le commit.
    return {
      accounts: accRes.data.map(a => ({ id: a.id, name: a.name, type: a.type, solde: a.solde })),
      positions: posRes.data.map(p => ({
        id: p.id, symbol: p.symbol, name: p.name, exchange: p.exchange,
        currency: p.currency, accountId: p.account_id, qty: p.qty,
        price: p.price, current: p.current, change: p.change,
        changePercent: p.change_percent, lastUpdated: p.last_updated
      })),
      prelevements: prelRes.data.map(p => ({
        id: p.id, name: p.name, amount: p.amount, freq: p.freq, cat: p.cat, split: p.split || 1
      })),
      transactions: txRes.data.map(t => ({
        id: t.id, type: t.type, symbol: t.symbol, name: t.name,
        qty: t.qty, price: t.price, accountName: t.account_name, ts: t.ts,
        ...(t.old_qty !== undefined && t.old_qty !== null ? { oldQty: t.old_qty } : {}),
        ...(t.old_price !== undefined && t.old_price !== null ? { oldPrice: t.old_price } : {}),
      })),
      patrimoineHistory: histRes.data.map(h => ({ date: h.date, value: h.value })),
      goals: goalsRes.data.map(g => ({
        id: g.id, name: g.name, target: g.target, current: g.current,
        emoji: g.emoji, createdAt: new Date(g.created_at).getTime()
      }))
    };
  } catch (error) {
    if (signal.aborted) throw canceledDataLoad();
    if (!error.kind && /fetch|network|load failed/i.test(error.message || '')) throw dataLoadError('network');
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    controller.abort();
  }
}

function waitForDataRetry(ms, signal) {
  if (signal.aborted) return Promise.reject(canceledDataLoad());
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(canceledDataLoad()); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ─── DB SAVE ──────────────────────────────────────────────────────────────────
// Chaque écriture cible uniquement la ligne concernée. On ne déduit jamais une
// suppression de l'état local complet : un onglet ancien ne peut donc plus
// supprimer des données ajoutées depuis un autre appareil.
function accountDbRow(a) {
  return { id: a.id, user_id: currentUser.id, name: a.name, type: a.type, solde: a.solde ?? null };
}

async function saveAccount(account) {
  const { error } = await sb.from('accounts').upsert(accountDbRow(account));
  if (error) throw error;
}

function positionDbRow(p) {
  return {
    id: p.id, user_id: currentUser.id, symbol: p.symbol, name: p.name,
    exchange: p.exchange || '', currency: p.currency || 'EUR',
    account_id: p.accountId, qty: p.qty, price: p.price,
    current: p.current ?? 0, change: p.change ?? null,
    change_percent: p.changePercent ?? null, last_updated: p.lastUpdated ?? null
  };
}

async function savePosition(position) {
  const { error } = await sb.from('positions').upsert(positionDbRow(position));
  if (error) throw error;
}

async function savePositionPrices(changedPositions, userId) {
  if (!userId) throw new Error('Session absente pendant l’actualisation');
  const results = await MoumixCore.mapWithConcurrency(changedPositions, 4, async p => {
    const { data, error } = await sb
      .from('positions')
      .update({
        current: p.current ?? 0,
        change: p.change ?? null,
        change_percent: p.changePercent ?? null,
        last_updated: p.lastUpdated ?? null
      })
      .eq('id', p.id)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();
    return { id: p.id, data, error };
  });

  // Une ligne absente n'est pas une panne : elle a pu être supprimée depuis
  // un autre onglet/appareil pendant la récupération des cotations. On ne la
  // recrée surtout pas ; l'appelant la retire simplement de son état local.
  const errors = results.map(result => result.error).filter(Boolean);
  if (errors.length) throw errors[0];
  return {
    updatedIds: results.filter(result => result.data).map(result => result.id),
    missingIds: results.filter(result => !result.data).map(result => result.id),
  };
}

async function savePrelevement(prelevement) {
  const { error } = await sb.from('prelevements').upsert({
    id: prelevement.id, user_id: currentUser.id, name: prelevement.name,
    amount: prelevement.amount, freq: prelevement.freq, cat: prelevement.cat,
    split: prelevement.split || 1
  });
  if (error) throw error;
}

function transactionDbRow(tx) {
  const row = {
    id: tx.id, user_id: currentUser.id, type: tx.type,
    symbol: tx.symbol, name: tx.name, qty: tx.qty,
    price: tx.price, account_name: tx.accountName, ts: tx.ts
  };
  if (tx.oldQty  !== undefined) row.old_qty   = tx.oldQty;
  if (tx.oldPrice !== undefined) row.old_price = tx.oldPrice;
  return row;
}

async function saveTransaction(tx) {
  const row = transactionDbRow(tx);
  const { error } = await sb.from('transactions').insert(row);
  if (error) throw error;
}

// La migration V2 optionnelle ajoute cette RPC transactionnelle. Tant qu'elle
// n'est pas installée, le flux de compensation existant reste utilisé.
async function tryAtomicTrade(position, tx, deletePosition = false) {
  const { error } = await sb.rpc('moumix_apply_trade', {
    p_position: positionDbRow(position),
    p_transaction: transactionDbRow(tx),
    p_delete_position: deletePosition,
  });
  if (!error) return true;
  const unavailable = error.code === 'PGRST202' || error.code === '42883' ||
    /moumix_apply_trade|schema cache|function .* does not exist/i.test(error.message || '');
  if (unavailable) return false;
  throw error;
}

async function savePatrimoineHistory() {
  const uid = currentUser.id;
  const last = patrimoineHistory[patrimoineHistory.length - 1];
  if (!last) return;
  const { error } = await sb.from('patrimoine_history').upsert({
    user_id: uid, date: last.date, value: last.value
  }, { onConflict: 'user_id,date' });
  if (error) throw error;
}

async function deleteAccountDB(id) {
  const { data, error } = await sb.from('accounts').delete().eq('id', id).eq('user_id', currentUser.id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Suppression du compte non confirmée');
}
async function deletePositionDB(id) {
  const { data, error } = await sb.from('positions').delete().eq('id', id).eq('user_id', currentUser.id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Suppression de la position non confirmée');
}
async function deletePrelDB(id) {
  const { data, error } = await sb.from('prelevements').delete().eq('id', id).eq('user_id', currentUser.id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Suppression du prélèvement non confirmée');
}
async function deleteTransactionDB(id) {
  const { data, error } = await sb.from('transactions').delete().eq('id', id).eq('user_id', currentUser.id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Suppression de la transaction non confirmée');
}

// ─── YAHOO FINANCE API (via Cloudflare Worker proxy) ─────────────────────────
const YF_WORKER = 'https://yf-proxy.viqmusic-promo.workers.dev';
const YF_BASE   = 'https://query1.finance.yahoo.com';

const CORS_PROXIES = [
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

const QUOTE_CACHE_TTL = 60 * 1000;
const quoteCache = new Map();
const quoteRequests = new Map();

async function yfFetch(path) {
  const url = YF_BASE + path;
  try {
    const res = await fetch(`${YF_WORKER}?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(TIMING_PROXY_FETCH)
    });
    if (res.ok) {
      const text = await res.text();
      try { return JSON.parse(text); } catch(e) {}
    }
  } catch(e) {}
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal: AbortSignal.timeout(TIMING_PROXY_FETCH) });
      if (!res.ok) continue;
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch(e) { continue; }
      if (json?.contents) { try { json = JSON.parse(json.contents); } catch(e) { continue; } }
      return json;
    } catch(e) { continue; }
  }
  throw new Error('yfFetch: tous les proxies ont échoué');
}

let eurRates = {};
const fxFallbackCurrencies = new Set();
const EUR_FALLBACKS = { USD: 1.08, GBP: 0.86, CHF: 0.98, JPY: 160, CAD: 1.48, AUD: 1.65 };

async function fetchEurRate(currency) {
  if (currency === 'EUR') return 1;
  if (eurRates[currency]) return eurRates[currency];
  try {
    const d = await yfFetch(`/v8/finance/chart/EUR${currency}=X?interval=1d&range=1d`);
    const rate = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (rate) {
      eurRates[currency] = rate;
      fxFallbackCurrencies.delete(currency);
      return rate;
    }
  } catch(e) { console.error('[Moumix] fetchEurRate error:', e); }
  fxFallbackCurrencies.add(currency);
  return EUR_FALLBACKS[currency] || 1;
}

async function toEur(price, currency) {
  if (!currency || currency === 'EUR') return price;
  const rate = await fetchEurRate(currency);
  return price / rate;
}

async function fetchQuote(symbol, forceRefresh = false) {
  const cached = quoteCache.get(symbol);
  if (!forceRefresh && cached && Date.now() - cached.cachedAt < QUOTE_CACHE_TTL) return cached.value;
  if (quoteRequests.has(symbol)) return quoteRequests.get(symbol);

  const request = (async () => {
    try {
      const data = await yfFetch(`/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) return null;
      const price = Number(meta.regularMarketPrice ?? meta.previousClose);
      const prevClose = Number(meta.chartPreviousClose || meta.previousClose || price);
      if (!Number.isFinite(price) || price <= 0) return null;
      const normalized = MoumixCore.normalizeQuoteCurrency(meta.currency || 'USD');
      const rawPrice = price * normalized.unitFactor;
      const rawPrevious = prevClose * normalized.unitFactor;
      const rawChange = rawPrice - rawPrevious;
      const changePercent = rawPrevious ? rawChange / rawPrevious * 100 : 0;
      const priceEur = await toEur(rawPrice, normalized.currency);
      const changeEur = await toEur(rawChange, normalized.currency);
      const value = {
        symbol,
        price,
        currency: normalized.rawCurrency,
        priceEur,
        change: changeEur,
        changePercent,
      };
      quoteCache.set(symbol, { cachedAt: Date.now(), value });
      return value;
    } catch(e) {
      console.warn('[Moumix] cotation indisponible:', symbol, e?.message || e);
      return null;
    } finally {
      quoteRequests.delete(symbol);
    }
  })();
  quoteRequests.set(symbol, request);
  return request;
}

async function fetchHistory(symbol) {
  const attempts = [
    `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`,
    `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
  ];
  for (const path of attempts) {
    try {
      const data = await yfFetch(path);
      const result = data?.chart?.result?.[0];
      if (!result) continue;
      const closes = result.indicators?.quote?.[0]?.close || [];
      const valid = closes.filter(v => v != null);
      if (valid.length < 2) continue;
      const normalized = MoumixCore.normalizeQuoteCurrency(result.meta?.currency || 'USD');
      const rate = await fetchEurRate(normalized.currency);
      return valid.map(v => v * normalized.unitFactor / rate);
    } catch(e) { continue; }
  }
  return null;
}

async function searchTickers(query, seq) {
  try {
    const data = await yfFetch(`/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=7&newsCount=0&listsCount=0`);
    const quotes = data?.quotes || data?.finance?.result?.[0]?.quotes || [];

    // Filtrer d'abord
    const filtered = quotes.filter(q =>
      q.symbol && !['OPTION','FUTURE','INDEX'].includes(q.quoteType || '')
    ).slice(0, 5);

    if (filtered.length === 0) return null;

    // Afficher immédiatement sans attendre les prix
    const results = filtered.map(q => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      price: null, currency: q.currency || 'USD',
      exchange: q.exchDisp || q.exchange || '',
      priceEur: null
    }));

    // Charger les prix en parallèle en arrière-plan
    MoumixCore.mapWithConcurrency(filtered, 2, async (q, i) => {
      try {
        const pr = await fetchQuote(q.symbol);
        if (pr) {
          results[i].price = pr.price;
          results[i].currency = pr.currency || results[i].currency;
          results[i].priceEur = pr.priceEur;
        }
      } catch(e) {}
    }).then(() => {
      // Re-render suggestions avec les prix mis à jour — uniquement si la requête est toujours la dernière
      const currentInput = document.getElementById('pos-ticker-input').value;
      if (seq === tickerSearchSeq && currentInput === query) renderSuggestions(results);
    });

    return results;
  } catch(e) { console.error('searchTickers ERROR:', e.message, e.stack); return null; }
}

// ─── TICKER INPUT ─────────────────────────────────────────────────────────────
function onTickerInput(val) {
  clearTimeout(searchTimeout);
  selectedTicker = null;
  document.getElementById('selectedTickerBox').classList.add('hidden');
  document.getElementById('addPosBtn').disabled = true;
  suggestionsIndex = -1;

  if (val.length < 2) {
    hideSuggestions();
    return;
  }
  showSearchStatus('Recherche en cours…');

  // Empêche les réponses "en retard" d'écraser les résultats plus récents
  const seq = ++tickerSearchSeq;

  searchTimeout = setTimeout(async () => { // délai = TIMING_TICKER_SEARCH
    try {
      // Timeout agressif de 3s pour éviter que l'UI se fige si les proxies traînent
      const raceResult = await Promise.race([
        searchTickers(val, seq),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMING_TICKER_TIMEOUT))
      ]);
      if (seq !== tickerSearchSeq) return; // une nouvelle recherche a été lancée
      if (!raceResult || raceResult.length === 0) {
        showSearchStatus('Aucun résultat trouvé');
        return;
      }
      renderSuggestions(raceResult);
    } catch(e) {
      if (seq !== tickerSearchSeq) return;
      if (e.message === 'timeout') {
        showSearchStatus('⏱ Délai dépassé — réessayez');
      } else {
        showSearchStatus('Erreur de recherche');
      }
    }
  }, TIMING_TICKER_SEARCH);
}

function showSearchStatus(msg) {
  const el = document.getElementById('tickerSuggestions');
  el.classList.remove('hidden');
  const isLoading = msg.includes('cours') || msg.includes('Recherche');
  el.innerHTML = `<div class="search-status">${isLoading ? '<span class="spin"></span>' : '<span style="font-size:0.8rem">⚠️</span>'}${msg}</div>`;
}

function hideSuggestions() {
  document.getElementById('tickerSuggestions').classList.add('hidden');
}

function renderSuggestions(results) {
  const el = document.getElementById('tickerSuggestions');
  el.classList.remove('hidden');
  // Stocker dans une variable JS pour éviter l'encodage JSON dans les attributs HTML
  _tickerSuggestions = results;
  el.innerHTML = results.map((r, i) => {
    const priceStr = r.priceEur != null ? fmtEur(r.priceEur) : (r.price != null ? `${fmt(r.price)} ${r.currency}` : '—');
    return `<div class="ticker-suggestion" data-index="${i}" onclick="selectTickerByIndex(${i})">
      <div class="sug-left">
        <div class="sug-sym">${_esc(r.symbol)}</div>
        <div class="sug-name">${_esc(r.name)}</div>
      </div>
      <div class="sug-right">
        <div class="sug-price">${priceStr}</div>
        <div class="sug-exch">${r.exchange || ''}</div>
      </div>
    </div>`;
  }).join('');
}

function onTickerKeydown(e) {
  const el = document.getElementById('tickerSuggestions');
  const items = el.querySelectorAll('.ticker-suggestion');
  if (e.key === 'ArrowDown') { suggestionsIndex = Math.min(suggestionsIndex+1, items.length-1); highlightSuggestion(items); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { suggestionsIndex = Math.max(suggestionsIndex-1, 0); highlightSuggestion(items); e.preventDefault(); }
  else if (e.key === 'Enter' && suggestionsIndex >= 0) { selectTickerByIndex(suggestionsIndex); e.preventDefault(); }
  else if (e.key === 'Escape') { hideSuggestions(); }
}

function highlightSuggestion(items) {
  items.forEach((it,i) => it.classList.toggle('active', i === suggestionsIndex));
  if (items[suggestionsIndex]) items[suggestionsIndex].scrollIntoView({block:'nearest'});
}

function selectTickerByIndex(i) {
  const r = _tickerSuggestions[i];
  if (r) selectTicker(r);
}

function selectTicker(r) {
  selectedTicker = r;
  hideSuggestions();
  document.getElementById('pos-ticker-input').value = `${r.symbol} — ${r.name}`;
  document.getElementById('stbSym').textContent = r.symbol;
  document.getElementById('stbName').textContent = r.name;
  const priceStr = r.priceEur != null ? fmtEur(r.priceEur) : (r.price != null ? `${fmt(r.price)} ${r.currency}` : '—');
  document.getElementById('stbPrice').textContent = priceStr;
  document.getElementById('stbExch').textContent = r.exchange || '';
  document.getElementById('selectedTickerBox').classList.remove('hidden');
  checkExistingPos();
  checkAddPosReady();
  document.getElementById('pos-qty').oninput = checkAddPosReady;
  document.getElementById('pos-price').oninput = checkAddPosReady;
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
let posSide = 'buy'; // 'buy' | 'sell'

function setPosSide(side) {
  posSide = side;
  const buyBtn = document.getElementById('toggleBuy');
  const sellBtn = document.getElementById('toggleSell');
  const priceInput = document.getElementById('pos-price');
  const priceLabel = document.getElementById('pos-price-label');
  const priceHint = document.getElementById('pos-price-hint');
  if (side === 'buy') {
    buyBtn.className = 'btn btn-primary btn-buy-active'; buyBtn.style.flex = '1'; buyBtn.style.fontSize = '0.82rem';
    sellBtn.className = 'btn'; sellBtn.style.flex = '1'; sellBtn.style.fontSize = '0.82rem';
    document.getElementById('pos-price-row').classList.remove('hidden');
    document.getElementById('pos-qty-label').textContent = 'Quantité achetée';
    priceLabel.textContent = 'PRU — Prix de Revient Unitaire (€)';
    priceHint.textContent = 'Le PRU moyen sera recalculé automatiquement si la position existe déjà';
    priceInput.placeholder = 'ex: 180.50';
    if (priceInput.dataset.autofilled === 'true') priceInput.value = '';
    delete priceInput.dataset.autofilled;
  } else {
    sellBtn.className = 'btn btn-sell btn-sell-active'; sellBtn.style.flex = '1'; sellBtn.style.fontSize = '0.82rem';
    buyBtn.className = 'btn'; buyBtn.style.flex = '1'; buyBtn.style.fontSize = '0.82rem';
    document.getElementById('pos-price-row').classList.remove('hidden');
    document.getElementById('pos-qty-label').textContent = 'Quantité vendue';
    priceLabel.textContent = 'Prix de vente unitaire (€)';
    priceHint.textContent = 'Prérempli avec le dernier cours disponible — modifiez-le avec le prix réellement exécuté.';
    priceInput.placeholder = 'ex: 185.20';
  }
  checkExistingPos();
  checkAddPosReady();
}

function onPosAccountChange() {
  checkExistingPos();
  checkAddPosReady();
}

function getExistingPos() {
  if (!selectedTicker) return null;
  const accountId = document.getElementById('pos-account').value;
  if (!accountId) return null;
  return positions.find(p => p.symbol === selectedTicker.symbol && p.accountId === accountId) || null;
}

function checkExistingPos() {
  const infoEl = document.getElementById('existingPosInfo');
  const textEl = document.getElementById('existingPosText');
  const hintEl = document.getElementById('pos-qty-hint');
  const existing = getExistingPos();

  if (existing) {
    if (posSide === 'buy') {
      textEl.innerHTML = existing.price > 0
        ? `<span style="color:#5ba4ff">↑ Position existante</span> — ${existing.qty} titre${existing.qty>1?'s':''} à PRU ${fmtPrice(existing.price)}. Le PRU sera recalculé automatiquement.`
        : `<span style="color:#5ba4ff">↑ Position existante</span> — ${existing.qty} titre${existing.qty>1?'s':''}, PRU précédent inconnu. Le PRU restera inconnu après l’achat.`;
    } else {
      textEl.innerHTML = `<span style="color:#5ba4ff">Position actuelle</span> — ${existing.qty} titre${existing.qty>1?'s':''} à PRU ${fmtPrice(existing.price)} · Valeur ${fmtEur(existing.qty * existing.current)}`;
      hintEl.textContent = `Max : ${existing.qty} titre${existing.qty>1?'s':''}`;
      hintEl.classList.remove('hidden');
      const qtyInput = document.getElementById('pos-qty');
      qtyInput.max = existing.qty;
      const priceInput = document.getElementById('pos-price');
      if (!priceInput.value || priceInput.dataset.autofilled === 'true') {
        priceInput.value = existing.current > 0 ? existing.current : '';
        priceInput.dataset.autofilled = 'true';
      }
    }
    infoEl.classList.remove('hidden');
  } else {
    infoEl.classList.add('hidden');
    hintEl.classList.add('hidden');
    const qtyInput = document.getElementById('pos-qty');
    qtyInput.removeAttribute('max');
    const priceInput = document.getElementById('pos-price');
    if (posSide === 'sell' && priceInput.dataset.autofilled === 'true') {
      priceInput.value = '';
      delete priceInput.dataset.autofilled;
    }
  }
}

function checkAddPosReady() {
  const qty = parseFloat(document.getElementById('pos-qty').value);
  const pru = document.getElementById('pos-price').value;
  const accountId = document.getElementById('pos-account').value;
  const btn = document.getElementById('addPosBtn');

  if (!selectedTicker || !qty || !accountId) { btn.disabled = true; return; }

  if (posSide === 'buy') {
    btn.disabled = !pru;
  } else {
    // Vente : vérifier qu'on a bien une position et que qty <= position.qty
    const existing = getExistingPos();
    if (!existing) { btn.disabled = true; return; }
    const sellPrice = parseFloat(document.getElementById('pos-price').value);
    btn.disabled = qty <= 0 || qty > existing.qty || !sellPrice || sellPrice <= 0;
  }
}

// ─── BANNER HORS-LIGNE ────────────────────────────────────────────────────────
function showOfflineBanner(msg, type = 'error') {
  const b = document.getElementById('offlineBanner');
  if (!b) return;
  b.textContent = msg || '📡 Problème de connexion — synchronisation indisponible.';
  b.className = type === 'warn' ? 'warn' : '';
  b.classList.remove('hidden');
  if (type === 'warn') {
    setTimeout(() => b.classList.add('hidden'), TIMING_TOAST_CLOSE);
  }
}
function hideOfflineBanner() {
  const b = document.getElementById('offlineBanner');
  if (b) b.classList.add('hidden');
}

// Détection réseau navigateur
window.addEventListener('online', () => {
  hideOfflineBanner();
  showToast('✅ Connexion rétablie', 'success');
  if (currentUser && positions.length > 0) refreshAllPrices();
});
window.addEventListener('offline', () => {
  showOfflineBanner('📡 Hors-ligne — reconnectez-vous pour synchroniser les données.');
});
if (!navigator.onLine) {
  showOfflineBanner('📡 Hors-ligne — reconnectez-vous pour synchroniser les données.');
}

// Alias global pour ouvrir la modal position depuis n'importe quel onglet
function openAddPosition() {
  openModal('position');
}

let _dialogReturnFocus = null;
function showDialog(element, focusSelector) {
  if (!element) return;
  _dialogReturnFocus = document.activeElement;
  element.classList.add('open');
  element.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    const target = (focusSelector && element.querySelector(focusSelector)) ||
      element.querySelector('input:not([type="hidden"]),select,textarea,button,[tabindex]:not([tabindex="-1"])');
    target?.focus();
  });
}

function hideDialog(element) {
  if (!element) return;
  element.classList.remove('open');
  element.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal-overlay.open')) document.body.classList.remove('modal-open');
  const returnFocus = _dialogReturnFocus;
  _dialogReturnFocus = null;
  returnFocus?.focus?.();
}

let _confirmResolver = null;
function appConfirm(message, options = {}) {
  if (_confirmResolver) _confirmResolver(false);
  const modal = document.getElementById('confirmModal');
  document.getElementById('confirmModalTitle').textContent = options.title || 'Confirmer l’action';
  document.getElementById('confirmModalMessage').textContent = message;
  const button = document.getElementById('confirmModalButton');
  button.textContent = options.confirmLabel || 'Confirmer';
  button.classList.toggle('btn-danger', options.danger !== false);
  showDialog(modal, '#confirmModalButton');
  return new Promise(resolve => { _confirmResolver = resolve; });
}

function resolveAppConfirm(confirmed) {
  const resolver = _confirmResolver;
  _confirmResolver = null;
  hideDialog(document.getElementById('confirmModal'));
  resolver?.(Boolean(confirmed));
}

function openModal(type) {
  if (type === 'position') {
    const marketAccounts = accounts.filter(a => !FIXED_ACCOUNT_TYPES.has(a.type));
    if (marketAccounts.length === 0) {
      showToast('Créez d’abord un compte de marché (PEA, CTO, PEE, PER, AV ou Crypto).', 'error');
      if (currentTabName !== 'details') document.getElementById('nav-details')?.click();
      openModal('account');
      return;
    }
    const sel = document.getElementById('pos-account');
    sel.innerHTML = '<option value="">— choisir —</option>';
    marketAccounts.forEach(a => {
      const o = document.createElement('option');
      o.value = a.id; o.textContent = `${a.name} · ${a.type}`; sel.appendChild(o);
    });
    // Reset complet
    setPosSide('buy'); // setPosSide() assigne déjà posSide
    selectedTicker = null;
    document.getElementById('pos-ticker-input').value = '';
    document.getElementById('selectedTickerBox').classList.add('hidden');
    document.getElementById('addPosBtn').disabled = true;
    document.getElementById('pos-qty').value = '';
    document.getElementById('pos-price').value = '';
    document.getElementById('existingPosInfo').classList.add('hidden');
    document.getElementById('pos-qty-hint').classList.add('hidden');
    hideSuggestions();
  }
  const focusSelector = type === 'account' ? '#acc-name' : '#pos-ticker-input';
  showDialog(document.getElementById(type + 'Modal'), focusSelector);
}
function closeModal(type) { hideDialog(document.getElementById(type + 'Modal')); }

// ─── ADD ACCOUNT ──────────────────────────────────────────────────────────────
function onAccTypeChange(val) {
  document.getElementById('acc-solde-row').classList.toggle('hidden', !FIXED_ACCOUNT_TYPES.has(val));
}

async function addAccount() {
  const name = document.getElementById('acc-name').value.trim();
  const type = document.getElementById('acc-type').value;
  if (!name) { showToast('Veuillez saisir un nom pour ce compte.', 'error'); return; }
  const solde = FIXED_ACCOUNT_TYPES.has(type) ? (parseFloat(document.getElementById('acc-solde').value) || 0) : null;
  if (solde !== null && solde < 0) { showToast('Le solde ne peut pas être négatif.', 'error'); return; }
  const btn = document.getElementById('createAccountBtn');
  btn.disabled = true;
  const _newAcc = { id: crypto.randomUUID(), name, type, solde };
  accounts.push(_newAcc);
  const _typeAdded = filteredTypes && !filteredTypes.includes(type);
  if (_typeAdded) filteredTypes.push(type);
  try {
    await saveAccount(_newAcc);
  } catch(e) {
    console.error('[Moumix] addAccount error:', e);
    accounts = accounts.filter(a => a.id !== _newAcc.id);
    if (_typeAdded) filteredTypes = filteredTypes.filter(t => t !== type);
    showToast('Erreur : impossible de sauvegarder le compte.', 'error');
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
  closeModal('account');
  document.getElementById('acc-name').value = '';
  document.getElementById('acc-solde').value = '';
  document.getElementById('acc-solde-row').classList.add('hidden');
  document.getElementById('acc-type').value = 'PEA';
  renderAll();
}

// ─── CONFIRM POSITION (achat / vente) ─────────────────────────────────────────
async function confirmPosition() {
  if (!selectedTicker) return;
  const accountId = document.getElementById('pos-account').value;
  const qty = parseFloat(document.getElementById('pos-qty').value);
  if (!qty || qty <= 0) { showToast('Saisissez une quantité positive.', 'error'); return; }
  const acc = accounts.find(a => a.id === accountId);
  if (!acc) { showToast('Veuillez choisir un compte.', 'error'); return; }
  const accName = acc ? acc.name : '—';
  const btn = document.getElementById('addPosBtn');
  btn.disabled = true;
  let successMessage = '';

  try {
    if (posSide === 'buy') {
      const pru = parseFloat(document.getElementById('pos-price').value);
      if (!pru || pru <= 0) throw new Error('PRU invalide');
      const currentEur = selectedTicker.priceEur ?? selectedTicker.price ?? 0;
      const existing = positions.find(p => p.symbol === selectedTicker.symbol && p.accountId === accountId);
      const previous = existing ? { ...existing } : null;
      const target = existing || {
        id: crypto.randomUUID(), symbol: selectedTicker.symbol, name: selectedTicker.name,
        exchange: selectedTicker.exchange || '', currency: selectedTicker.currency || 'EUR',
        accountId, qty, price: pru, current: currentEur, lastUpdated: Date.now()
      };

      if (existing) {
        const newPRU = existing.price > 0
          ? (existing.qty * existing.price + qty * pru) / (existing.qty + qty)
          : 0;
        existing.qty = parseFloat((existing.qty + qty).toFixed(8));
        existing.price = parseFloat(newPRU.toFixed(10));
        existing.current = currentEur;
        existing.lastUpdated = Date.now();
      }

      const tx = { id: crypto.randomUUID(), type: 'buy', symbol: selectedTicker.symbol, name: selectedTicker.name, qty, price: pru, accountName: accName, ts: Date.now() };
      let positionSaved = false;
      let usedAtomicTrade = false;
      try {
        usedAtomicTrade = await tryAtomicTrade(target, tx, false);
        if (!usedAtomicTrade) {
          await savePosition(target);
          positionSaved = true;
          await saveTransaction(tx);
        }
      } catch(e) {
        if (existing) Object.assign(existing, previous);
        if (!usedAtomicTrade && positionSaved) {
          try {
            if (existing) await savePosition(existing);
            else await deletePositionDB(target.id);
          } catch(rollbackError) {
            console.error('[Moumix] rollback achat impossible:', rollbackError);
            showToast('Échec du rétablissement automatique : rechargez la page avant toute autre action.', 'error');
          }
        }
        throw e;
      }

      if (!existing) {
        positions.push(target);
        positionHistory[target.id] = [];
        fetchHistory(target.symbol).then(hist => {
          if (hist && hist.length > 1) { positionHistory[target.id] = hist; renderPositions(); }
        });
      }
      transactions.unshift(tx);
      if (transactions.length > 500) transactions.length = 500;
      successMessage = existing && previous.price <= 0
        ? '✅ Achat enregistré · PRU global toujours inconnu'
        : '✅ Achat enregistré';
    } else {
      const existing = positions.find(p => p.symbol === selectedTicker.symbol && p.accountId === accountId);
      if (!existing) throw new Error('Position introuvable');
      if (qty > existing.qty) throw new Error(`Vente supérieure à la quantité détenue (${existing.qty})`);
      const sellPrice = parseFloat(document.getElementById('pos-price').value);
      if (!sellPrice || sellPrice <= 0) throw new Error('Prix de vente invalide');
      const previous = { ...existing };
      const fullSell = Math.abs(qty - existing.qty) < 0.000001;
      const tx = { id: crypto.randomUUID(), type: 'sell', symbol: existing.symbol, name: existing.name, qty, price: sellPrice, accountName: accName, ts: Date.now() };
      let positionSaved = false;
      let usedAtomicTrade = false;

      try {
        if (!fullSell) existing.qty = parseFloat((existing.qty - qty).toFixed(8));
        usedAtomicTrade = await tryAtomicTrade(existing, tx, fullSell);
        if (!usedAtomicTrade) {
          if (fullSell) await deletePositionDB(existing.id);
          else await savePosition(existing);
          positionSaved = true;
          await saveTransaction(tx);
        }
      } catch(e) {
        Object.assign(existing, previous);
        if (!usedAtomicTrade && positionSaved) {
          try { await savePosition(existing); }
          catch(rollbackError) {
            console.error('[Moumix] rollback vente impossible:', rollbackError);
            showToast('Échec du rétablissement automatique : rechargez la page avant toute autre action.', 'error');
          }
        }
        throw e;
      }

      if (fullSell) {
        positions = positions.filter(p => p.id !== existing.id);
        delete positionHistory[existing.id];
      }
      transactions.unshift(tx);
      if (transactions.length > 500) transactions.length = 500;
      successMessage = '✅ Vente enregistrée';
    }
  } catch(e) {
    console.error('[Moumix] confirmPosition error:', e);
    showToast(e.message && !/failed|network|fetch/i.test(e.message) ? e.message : 'Erreur de sauvegarde de la transaction.', 'error');
    renderAll();
    return;
  } finally {
    btn.disabled = false;
  }

  closeModal('position');
  renderAll();
  showToast(successMessage, 'success');
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
async function deletePosition(id) {
  const p = positions.find(p => p.id === id);
  if (!p) return;
  if (!await appConfirm(`Supprimer la position ${p.symbol} (${p.qty} titre${p.qty > 1 ? 's' : ''}) ?`, { title: 'Supprimer la position', confirmLabel: 'Supprimer' })) return;
  try { await deletePositionDB(id); } catch(e) { console.error('[Moumix] deletePosition error:', e); showToast('Erreur : suppression impossible.', 'error'); return; }
  delete positionHistory[id];
  positions = positions.filter(p => p.id !== id);
  renderPositions(); renderAllocation(); renderByAccount(); renderSummary();
  refreshProjectionIfActive();
}
async function deleteAccount(id) {
  const a = accounts.find(a => a.id === id);
  if (!a) return;
  const posCount = positions.filter(p => p.accountId === id).length;
  const msg = posCount > 0
    ? `Supprimer le compte "${a.name}" et ses ${posCount} position${posCount > 1 ? 's' : ''} ?`
    : `Supprimer le compte "${a.name}" ?`;
  if (!await appConfirm(msg, { title: 'Supprimer le compte', confirmLabel: 'Supprimer' })) return;
  // Une seule suppression côté base : la clé étrangère ON DELETE CASCADE
  // supprime les positions de manière atomique. Si le schéma ne le permet pas,
  // la requête échoue sans suppression locale.
  const orphanPositions = positions.filter(p => p.accountId === id);
  try {
    await deleteAccountDB(id);
  } catch(e) {
    console.error('[Moumix] deleteAccount error:', e);
    showToast('Erreur : suppression impossible.', 'error');
    return;
  }
  // Mutation locale seulement après succès DB
  orphanPositions.forEach(p => { delete positionHistory[p.id]; });
  positions = positions.filter(p => p.accountId !== id);
  accounts = accounts.filter(a => a.id !== id);
  renderPositions(); renderAccounts(); renderAllocation(); renderByAccount(); renderSummary(); renderFilterToggles();
  refreshProjectionIfActive();
}
function editLivretSolde(id) {
  const editDiv = document.getElementById('livret-edit-' + id);
  const input = document.getElementById('livret-input-' + id);
  editDiv.classList.remove('hidden');
  setTimeout(() => { input.focus(); input.select(); }, TIMING_LIVRET_FOCUS);
}
function cancelLivretEdit(id) {
  document.getElementById('livret-edit-' + id).classList.add('hidden');
}
async function confirmLivretSolde(id) {
  const input = document.getElementById('livret-input-' + id);
  const a = accounts.find(a => a.id === id);
  if (a) {
    const newSolde = parseFloat(input.value);
    if (newSolde < 0) { showToast('Le solde ne peut pas être négatif', 'error'); return; }
    const prevSolde = a.solde;
    a.solde = newSolde || 0;
    try {
      await saveAccount(a);
    } catch(e) {
      console.error('[Moumix] confirmLivretSolde error:', e);
      a.solde = prevSolde;
      showToast('⚠️ Erreur sauvegarde', 'error');
      return;
    }
    await snapshotPatrimoine(); // seulement si save OK
    const el = document.getElementById('livret-total-' + id);
    if (el) el.textContent = fmtEur(a.solde);
    renderSummary(); renderByAccount(); renderAllocation();
    refreshProjectionIfActive();
  }
  document.getElementById('livret-edit-' + id).classList.add('hidden');
}

// ─── REFRESH PRICES ───────────────────────────────────────────────────────────
let _isRefreshing = false;
let _lastPriceRefresh = 0; // timestamp du dernier refresh de prix
async function refreshAllPrices() {
  if (positions.length === 0) return;
  if (_isRefreshing) return;
  const refreshUserId = currentUser?.id;
  if (!refreshUserId) return;
  _isRefreshing = true;
  eurRates = {}; // invalider le cache des taux à chaque refresh pour ne pas utiliser des taux périmés
  fxFallbackCurrencies.clear();
  window.App?.renderMarketStatus?.();
  const btn = document.getElementById('refreshBtn');
  const badge = document.getElementById('updateBadge');
  if (btn) {
    btn.disabled = true;
    // lance l'anim glow (et la relance même si on refresh 2 fois de suite)
    btn.classList.remove('refresh-animate');
    void btn.offsetWidth; // reset animation
    btn.classList.add('refresh-animate');
    if (badge) badge.textContent = 'Actualisation…';
  }

  try {
    const uniqueSymbols = [...new Set(positions.map(p => p.symbol))];

    // Limiter la concurrence réduit fortement les refus temporaires Yahoo/Edge.
    const priceResults = await MoumixCore.mapWithConcurrency(uniqueSymbols, 3, async sym => {
      try {
        const data = await fetchQuote(sym, true);
        return [sym, data && data.priceEur != null ? data : null];
      } catch(e) { return [sym, null]; }
    });
    const priceMap = Object.fromEntries(priceResults.filter(([,v]) => v !== null));
    const updatedSymbols = Object.keys(priceMap);

    if (updatedSymbols.length === 0) {
      if (badge) badge.textContent = 'Échec de l’actualisation';
      showToast('Aucun cours n’a pu être récupéré. Les anciennes valeurs sont conservées.', 'error');
      window.App?.renderMarketStatus?.();
      return;
    }

    const quoteTimestamp = Date.now();
    const changedPositions = positions.flatMap(p => {
      if (!priceMap[p.symbol]) return [];
      return [{
        ...p,
        current: priceMap[p.symbol].priceEur ?? p.current,
        change: priceMap[p.symbol].change ?? p.change,
        changePercent: priceMap[p.symbol].changePercent ?? p.changePercent,
        lastUpdated: quoteTimestamp,
      }];
    });

    // Seuls les champs de cotation sont mis à jour : un onglet ancien ne peut
    // pas écraser une quantité ou un PRU modifié ailleurs.
    const { updatedIds, missingIds } = await savePositionPrices(changedPositions, refreshUserId);

    // Si l'utilisateur s'est déconnecté ou a changé de session entre-temps,
    // on ne fusionne pas le résultat de l'ancienne actualisation.
    if (currentUser?.id !== refreshUserId) return;

    const updatedIdSet = new Set(updatedIds);
    const missingIdSet = new Set(missingIds);
    const updatesById = new Map(changedPositions
      .filter(p => updatedIdSet.has(p.id))
      .map(p => [p.id, p]));

    // Fusionne uniquement les cotations dans l'état ACTUEL. Une quantité, un
    // PRU, un ajout ou une suppression effectué pendant le refresh est préservé.
    positions = positions
      .filter(p => !missingIdSet.has(p.id))
      .map(p => {
        const quote = updatesById.get(p.id);
        return quote ? {
          ...p,
          current: quote.current,
          change: quote.change,
          changePercent: quote.changePercent,
          lastUpdated: quote.lastUpdated,
        } : p;
      });
    missingIds.forEach(id => { delete positionHistory[id]; });
    const activePositionIds = new Set(positions.map(p => p.id));
    changedPositions.filter(p => updatedIdSet.has(p.id) && activePositionIds.has(p.id)).forEach(p => {
      if (!positionHistory[p.id]) positionHistory[p.id] = [];
      positionHistory[p.id].push(p.current);
      if (positionHistory[p.id].length > 20) positionHistory[p.id].shift();
    });
    _lastPriceRefresh = Date.now();
    await snapshotPatrimoine();
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const remainingSymbols = [...new Set(positions.map(p => p.symbol))];
    const refreshedSymbols = remainingSymbols.filter(symbol => priceMap[symbol]);
    const unavailableSymbols = remainingSymbols.filter(symbol => !priceMap[symbol]);
    if (badge) badge.textContent = remainingSymbols.length === 0
      ? `Portefeuille synchronisé à ${time}`
      : unavailableSymbols.length === 0
        ? `Actualisé à ${time}`
        : `${refreshedSymbols.length}/${remainingSymbols.length} actualisés à ${time}`;
    if (unavailableSymbols.length > 0) {
      showToast(`${unavailableSymbols.length} cours indisponible(s) : les anciennes valeurs sont conservées.`, 'error');
    }
    if (missingIds.length > 0) {
      showToast(`Synchronisation : ${missingIds.length} position${missingIds.length > 1 ? 's n’étaient' : ' n’était'} plus présente${missingIds.length > 1 ? 's' : ''} dans la base.`, 'success');
    }
    renderAll();

    // Historiques réels en arrière-plan
    MoumixCore.mapWithConcurrency(uniqueSymbols, 2, async sym => {
      const hist = await fetchHistory(sym);
        if (!hist || hist.length < 2) return;
        positions.filter(p => p.symbol === sym).forEach(p => { positionHistory[p.id] = hist; });
        renderPositions();
    }).catch(error => console.warn('[Moumix] historiques partiels:', error?.message || error));
  } catch(e) {
    console.error('[Moumix] refreshAllPrices error:', e);
    if (badge) badge.textContent = 'Échec de l’actualisation';
    showToast('Actualisation impossible : aucune donnée enregistrée n’a été supprimée.', 'error');
    window.App?.renderMarketStatus?.();
  } finally {
    _isRefreshing = false;
    window.App?.renderMarketStatus?.();
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('refresh-animate');
    }
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// ─── HTML ESCAPE (partagé par tous les renders) ───────────────────────────────
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function sparklineSVG(data, color) {
  if (!data||data.length<2) return '';
  const w=60,h=24; const min=Math.min(...data),max=Math.max(...data); const range=max-min||1;
  const pts=data.map((v,i)=>{ const x=(i/(data.length-1))*w; const y=h-((v-min)/range)*(h-2)-1; return `${x},${y}`; });
  return `<svg class="mini-chart" viewBox="0 0 ${w} ${h}"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}
// Formatters Intl mis en cache — évite de recréer l'objet à chaque appel
const _fmtStd    = new Intl.NumberFormat('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2});
const _fmtEur    = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR', maximumFractionDigits:2});
const _fmtEur0   = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR', maximumFractionDigits:0});
const _fmtEur4   = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR', minimumFractionDigits:4, maximumFractionDigits:4});
const _fmtEur6   = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR', minimumFractionDigits:6, maximumFractionDigits:6});
const _fmtEur8   = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR', minimumFractionDigits:8, maximumFractionDigits:8});
const _fmtPct    = new Intl.NumberFormat('fr-FR', {minimumFractionDigits:1, maximumFractionDigits:1});
const _fmtQty    = new Intl.NumberFormat('fr-FR', {maximumFractionDigits:0});
function fmt(n, dec=2) {
  if (dec === 2) return _fmtStd.format(n);
  return new Intl.NumberFormat('fr-FR', {minimumFractionDigits:dec, maximumFractionDigits:dec}).format(n);
}
function fmtEur(n) { return _fmtEur.format(n); }
function fmtPrice(n) {
  if (n === 0) return _fmtEur.format(0);
  const abs = Math.abs(n);
  if (abs < 0.0001) return _fmtEur8.format(n);
  if (abs < 0.01)   return _fmtEur6.format(n);
  if (abs < 1)      return _fmtEur4.format(n);
  return _fmtEur.format(n);
}
function tagClass(type) { return TAG_CLASS_MAP[type] || 'tag-autre'; }
function getAccountName(id) { const a=accounts.find(a=>a.id===id); return a?a.name:'—'; }
function getAccountType(id) { const a=accounts.find(a=>a.id===id); return a?a.type:''; }

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderAccounts() {
  const grid = document.getElementById('accountsGrid');
  if (accounts.length===0) { grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1">Aucun compte — <button type="button" class="empty-action" onclick="openModal('account')">ajouter un compte</button></div>`; return; }
  grid.innerHTML = accounts.map((a, idx) => {
    const animStyle = `animation:popIn 0.4s cubic-bezier(0.34,1.4,0.64,1) ${idx * 0.06}s both;`;
    if (FIXED_ACCOUNT_TYPES.has(a.type)) {
      const solde = a.solde || 0;
      return `<div class="account-card" style="${animStyle}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="account-type">${_esc(a.name)}</div>
          <button class="del-btn" onclick="deleteAccount('${a.id}')">✕</button>
        </div>
        <span class="tag ${tagClass(a.type)}">${_esc(a.type)}</span>
        <div style="margin-top:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="account-total" id="livret-total-${a.id}">${fmtEur(solde)}</div>
            <button onclick="editLivretSolde('${a.id}')" title="Modifier le solde"
              style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:0.8rem;padding:2px 4px;border-radius:4px;transition:color 0.2s;line-height:1"
              onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--muted)'">✏️</button>
          </div>
          <div id="livret-edit-${a.id}" class="hidden" style="margin-top:8px">
            <div class="flex-gap6">
              <input type="number" id="livret-input-${a.id}" value="${solde}" step="any" min="0"
                style="width:120px;padding:5px 9px;font-size:0.82rem;background:var(--bg);border:1px solid var(--accent);border-radius:6px;color:var(--text);font-family:'DM Mono',monospace;outline:none"
                onkeydown="if(event.key==='Enter')confirmLivretSolde('${a.id}');if(event.key==='Escape')cancelLivretEdit('${a.id}')">
              <button onclick="confirmLivretSolde('${a.id}')"
                style="background:var(--accent);border:none;cursor:pointer;color:#000;font-size:0.72rem;padding:5px 9px;border-radius:6px;font-family:'DM Mono',monospace;font-weight:500">✓</button>
              <button onclick="cancelLivretEdit('${a.id}')"
                style="background:none;border:1px solid var(--border);cursor:pointer;color:var(--muted);font-size:0.72rem;padding:5px 9px;border-radius:6px;font-family:'DM Mono',monospace">✕</button>
            </div>
          </div>
        </div>
      </div>`;
    }
    const myPos=positions.filter(p=>p.accountId===a.id);
    const total=myPos.reduce((s,p)=>s+p.current*p.qty,0);
    const myPosWithPRU=myPos.filter(p=>p.price>0);
    const cost=myPosWithPRU.reduce((s,p)=>s+p.price*p.qty,0);
    const posVal=myPosWithPRU.reduce((s,p)=>s+p.current*p.qty,0);
    const pnl=posVal-cost; const pct=cost>0?(pnl/cost*100):0;
    const pnlColor=pnl>=0?'var(--gain)':'var(--loss)';
    return `<div class="account-card" style="${animStyle}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="account-type">${_esc(a.name)}</div>
        <button class="del-btn" onclick="deleteAccount('${a.id}')">✕</button>
      </div>
      <span class="tag ${tagClass(a.type)}">${_esc(a.type)}</span>
      <div style="margin-top:10px">
        <div class="account-total">${fmtEur(total)}</div>
        <div class="account-perf" style="color:${pnlColor}">${pnl>=0?'+':''}${fmtEur(pnl)} (${pnl>=0?'+':''}${fmt(pct)}%)</div>
      </div>
    </div>`;
  }).join('');
}

function renderPositions() {
  const tbody=document.getElementById('posTable');
  const q = (document.getElementById('posSearch')?.value || '').toLowerCase().trim();
  const filtered = q
    ? getSortedPositions().filter(p => p.symbol.toLowerCase().includes(q) || (p.name||'').toLowerCase().includes(q))
    : getSortedPositions();
  if (positions.length===0) { tbody.innerHTML=`<tr><td colspan="11" class="empty-state">Aucune position — <button type="button" class="empty-action" onclick="openModal('position')">ajouter une position</button></td></tr>`; return; }
  if (filtered.length === 0 && q) { tbody.innerHTML='<tr><td colspan="11" class="empty-state">Aucune position ne correspond à "' + q + '"</td></tr>'; return; }
  _mobileRowData = {};
  tbody.innerHTML = filtered.map((p, i) => {
    const value=p.current*p.qty;
    const pnl = p.price > 0 ? (p.current-p.price)*p.qty : null;
    const pct = p.price > 0 ? ((p.current-p.price)/p.price)*100 : null;
    const color = pnl === null ? 'var(--muted)' : pnl>=0?'var(--gain)':'var(--loss)';
    const sparkColor = pnl === null ? 'var(--muted)' : pnl>=0?'#00e5a0':'#ff4466';
    const hist=positionHistory[p.id]||[];
    const type=getAccountType(p.accountId);
    const pnlDisplay = pnl === null
      ? `<span style="color:var(--muted)">—</span>`
      : `<span style="color:${color}">${pnl>=0?'+':''}${fmtEur(pnl)}</span>`;
    const pctDisplay = pct === null
      ? `<span style="color:var(--muted)" title="PRU inconnu">—</span>`
      : `<span style="color:${color}">${pct>=0?'+':''}${fmt(pct)}%</span>`;
    const priceDisplay = p.price > 0 ? fmtPrice(p.price) : `<span style="color:var(--muted)">—</span>`;
    const qtyDisplay = p.qty >= 1000 ? _fmtQty.format(p.qty) : fmt(p.qty, p.qty%1===0?0:p.qty<0.001?8:4);
    const ago = p.lastUpdated ? timeAgo(p.lastUpdated) : '';
    // Détails compacts affichés au toucher sur mobile.
    _mobileRowData[p.id] = {
      account: _esc(getAccountName(p.accountId)), type: _esc(type || '—'),
      typeClass: tagClass(type), qty: qtyDisplay, pru: priceDisplay,
      current: fmtPrice(p.current), pnl: pnlDisplay, trend: sparklineSVG(hist, sparkColor)
    };
    return `<tr style="animation:rowIn 0.3s ease ${i * 0.04}s both" onclick="toggleMobileRow(this,'${p.id}',event)" data-pid="${p.id}">
      <td><div class="ticker-sym">${_esc(p.symbol)}</div><div class="ticker-name">${_esc(p.name||'')}</div></td>
      <td style="font-size:0.75rem">${_esc(getAccountName(p.accountId))}</td>
      <td><span class="tag ${tagClass(type)}">${type||'—'}</span></td>
      <td>${qtyDisplay}</td>
      <td>${priceDisplay}</td>
      <td class="price-cell" id="price-${p.id}">${fmtPrice(p.current)}<div style="font-size:0.6rem;color:var(--muted)">${ago}</div></td>
      <td>${fmtEur(value)}</td>
      <td class="pnl">${pnlDisplay}</td>
      <td>${pctDisplay}</td>
      <td>${sparklineSVG(hist,sparkColor)}</td>
      <td style="display:flex;gap:6px;align-items:center"><button class="del-btn" style="background:rgba(0,229,160,0.08);color:var(--accent);border-color:rgba(0,229,160,0.2)" onclick="openEditPosition('${p.id}');event.stopPropagation()">✏️</button><button class="del-btn" onclick="deletePosition('${p.id}');event.stopPropagation()">✕</button></td>
    </tr>`;
  }).join('');
}

function toggleMobileRow(tr, pid, e) {
  // Ne pas ouvrir si on clique sur un bouton
  if (e && e.target.closest('button')) return;
  // Uniquement sur mobile
  if (window.innerWidth > 768) return;
  const existingDetail = tr.nextElementSibling;
  if (existingDetail && existingDetail.classList.contains('mobile-detail-row')) {
    existingDetail.remove();
    tr.classList.remove('mobile-expanded');
    return;
  }
  // Fermer les autres
  document.querySelectorAll('.mobile-detail-row').forEach(r => r.remove());
  document.querySelectorAll('tr.mobile-expanded').forEach(r => r.classList.remove('mobile-expanded'));
  tr.classList.add('mobile-expanded');
  // Récupérer depuis le store JS
  const rowData = _mobileRowData[pid] || {};
  const trend = rowData.trend || '';
  const detail = document.createElement('tr');
  detail.className = 'mobile-detail-row';
  detail.innerHTML = `<td colspan="11" style="background:rgba(0,229,160,0.04);padding:10px 14px;border-bottom:1px solid var(--border)">
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px;font-size:0.75rem">
      <div><div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px">Compte</div>${rowData.account || '—'} · <span class="tag ${rowData.typeClass || 'tag-autre'}">${rowData.type || '—'}</span></div>
      <div><div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px">Quantité</div>${rowData.qty || '—'}</div>
      <div><div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px">PRU</div>${rowData.pru || '—'}</div>
      <div><div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px">Prix actuel</div>${rowData.current || '—'}</div>
      <div><div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px">P&amp;L</div>${rowData.pnl || '—'}</div>
      ${trend ? `<div><div style="font-size:0.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px">Tendance</div>${trend}</div>` : ''}
    </div>
  </td>`;
  tr.after(detail);
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'à l\'instant';
  if (diff < 3600000) return `il y a ${Math.floor(diff/60000)}min`;
  if (diff < 86400000) return `il y a ${Math.floor(diff/3600000)}h`;
  return `il y a ${Math.floor(diff/86400000)}j`;
}

function renderAllocation() {
  const el=document.getElementById('allocContent');
  const activeAccounts = accounts.filter(a => isTypeActive(a.type));
  const activeAccountIds = new Set(activeAccounts.map(a => a.id));
  const activePositions = positions.filter(p => activeAccountIds.has(p.accountId));
  if (activePositions.length===0 && activeAccounts.filter(a=>FIXED_ACCOUNT_TYPES.has(a.type)).every(a=>!a.solde)) {
    el.innerHTML=`<div class="empty-state">${accounts.length ? 'Aucune valeur dans les filtres actifs' : 'Ajoutez des positions'}</div>`; return;
  }
  const fixedTotalAlloc=activeAccounts.filter(a=>FIXED_ACCOUNT_TYPES.has(a.type)).reduce((s,a)=>s+(a.solde||0),0);
  const total=activePositions.reduce((s,p)=>s+p.current*p.qty,0)+fixedTotalAlloc;
  if (total <= 0) { el.innerHTML='<div class="empty-state">Aucune valeur calculable</div>'; return; }

  // Grouper les positions par symbole
  const map={};
  activePositions.forEach(p=>{
    if(!map[p.symbol]) map[p.symbol]={val:0, name:p.name, accountTypes: new Set()};
    map[p.symbol].val += p.current*p.qty;
    const accType = getAccountType(p.accountId);
    if (accType) map[p.symbol].accountTypes.add(accType);
  });
  activeAccounts.filter(a=>(FIXED_ACCOUNT_TYPES.has(a.type)) && a.solde>0).forEach(a=>{
    const key=a.type+':'+a.id;
    map[key]={val:a.solde, name:a.name, accountTypes: new Set([a.type])};
  });
  const sorted=Object.entries(map).sort((a,b)=>b[1].val-a[1].val);

  // Assign colors
  const coloredSlices = sorted.map(([sym,d],i) => ({
    sym, d,
    pct: d.val/total,
    color: ALLOC_COLORS[i%ALLOC_COLORS.length]
  }));

  // ── Liste items ──
  const listItems=coloredSlices.slice(0,10).map(s=>{
    const isLivret=s.sym.includes(':');
    const label=isLivret?s.d.name:s.sym;
    const sub=isLivret?'':(s.d.name||'');
    const typeTags=[...s.d.accountTypes].map(t=>`<span class="tag ${tagClass(t)}" style="font-size:0.52rem;padding:1px 4px">${t}</span>`).join('');
    const pctVal=(s.pct*100).toFixed(1);
    return `<div style="margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:8px">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1">
          <div style="width:10px;height:10px;border-radius:3px;background:${s.color};flex-shrink:0"></div>
          <div style="min-width:0">
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
              <span style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:0.8rem;white-space:nowrap">${label}</span>
              ${typeTags}
            </div>
            ${sub?`<div style="font-size:0.6rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${sub}</div>`:''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-family:'DM Mono',monospace;font-size:0.75rem">${fmtEur(s.d.val)}</div>
          <div style="font-size:0.62rem;color:var(--muted)">${pctVal}%</div>
        </div>
      </div>
      <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pctVal}%;background:${s.color};border-radius:3px;transition:width 0.6s ease;opacity:0.85"></div>
      </div>
    </div>`;
  }).join('');

  el.innerHTML=`
    <div style="padding-top:4px">${listItems}</div>`;
}

function renderByAccount() {
  const el = document.getElementById('byAccountContent');
  const badgeEl = document.getElementById('milestoneBadge');
  if (!el) return;

  const MILESTONES = [25000, 50000, 75000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000];

  function getMilestoneLabel(v) {
    if (v >= 1000000) return '1 M €';
    if (v >= 1000) return (v / 1000) + ' k €';
    return v + ' €';
  }

  function getMilestoneReachedDate(threshold) {
    const sorted = [...patrimoineHistory].sort((a, b) => a.date < b.date ? -1 : 1);
    const hit = sorted.find(h => parseFloat(h.value) >= threshold);
    return hit ? hit.date : null;
  }

  function formatMilestoneDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  }

  const fixedTotal = accounts.filter(a => FIXED_ACCOUNT_TYPES.has(a.type)).reduce((s, a) => s + (a.solde || 0), 0);
  const current = positions.reduce((s, p) => s + p.current * p.qty, 0) + fixedTotal;

  // Un jalon est "atteint" si la valeur actuelle OU l'historique passé le dépasse
  // → évite qu'une baisse temporaire "décoite" un jalon acquis
  const maxEverReached = Math.max(
    current,
    ...patrimoineHistory.map(h => parseFloat(h.value) || 0)
  );
  const doneList = MILESTONES.filter(m => maxEverReached >= m);
  const nextIdx  = MILESTONES.findIndex(m => current < m);
  const next     = nextIdx >= 0 ? MILESTONES[nextIdx] : null;

  if (badgeEl) badgeEl.textContent = doneList.length + ' / ' + MILESTONES.length;

  let html = '';

  if (next) {
    const prev      = nextIdx > 0 ? MILESTONES[nextIdx - 1] : 0;
    const pct       = Math.min(((current - prev) / (next - prev)) * 100, 100);
    const remaining = next - current;
    html += `<div style="background:var(--surface2);border-radius:10px;padding:12px 14px;margin-bottom:14px">
      <div style="font-size:0.6rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:4px">Prochain jalon</div>
      <div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:2px">${getMilestoneLabel(next)}</div>
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin:8px 0 5px">
        <div style="height:100%;width:${pct.toFixed(1)}%;background:var(--accent);border-radius:3px;transition:width 0.8s cubic-bezier(0.4,0,0.2,1)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.65rem;font-family:'DM Mono',monospace;color:var(--muted)">
        <span>${fmtEur(current)}</span>
        <span>${pct.toFixed(0)}% · encore ${fmtEur(remaining)}</span>
        <span>${getMilestoneLabel(next)}</span>
      </div>
    </div>`;
  } else {
    html += `<div style="background:rgba(0,229,160,0.08);border:1px solid rgba(0,229,160,0.3);border-radius:10px;padding:12px 14px;margin-bottom:14px;text-align:center">
      <div style="font-size:1.4rem;margin-bottom:4px">🏆</div>
      <div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:1rem;color:var(--accent)">1 M € atteint !</div>
    </div>`;
  }

  const doneToShow = doneList.slice(-3);
  const futureList = MILESTONES.filter(m => current < m);
  const toShow     = [...doneToShow, ...futureList];

  if (doneList.length > 3) {
    html += `<div style="font-size:0.62rem;color:var(--muted);margin-bottom:8px;padding-left:26px">…et ${doneList.length - 3} jalon${doneList.length - 3 > 1 ? 's' : ''} précédent${doneList.length - 3 > 1 ? 's' : ''} atteint${doneList.length - 3 > 1 ? 's' : ''}</div>`;
  }

  html += '<div style="display:flex;flex-direction:column;gap:6px">';
  toShow.forEach(m => {
    const isDone    = maxEverReached >= m;
    const isNext    = m === next;
    const everDone  = isDone && current < m; // atteint dans le passé mais pas aujourd'hui
    const dateLabel = isDone ? formatMilestoneDate(getMilestoneReachedDate(m)) : '';
    const dateDisplay = everDone
      ? `<span style="font-size:0.65rem;font-family:'DM Mono',monospace;color:#ffb400" title="Patrimoine actuel en dessous">atteint ↓</span>`
      : `<span style="font-size:0.65rem;font-family:'DM Mono',monospace;color:${isNext ? 'var(--accent2)' : 'var(--muted)'}">${isNext ? 'en cours' : dateLabel}</span>`;
    let iconHtml, labelStyle;
    if (isDone && !everDone) {
      // Atteint et toujours au-dessus
      iconHtml   = `<div style="width:18px;height:18px;border-radius:50%;background:rgba(0,229,160,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:9px;color:var(--accent)">✓</div>`;
      labelStyle = 'text-decoration:line-through;color:var(--muted)';
    } else if (everDone) {
      // Atteint dans le passé mais en dessous actuellement
      iconHtml   = `<div style="width:18px;height:18px;border-radius:50%;background:rgba(255,180,0,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:9px;color:#ffb400" title="Atteint mais patrimoine actuellement en dessous">↓</div>`;
      labelStyle = 'color:#ffb400';
    } else if (isNext) {
      iconHtml   = `<div style="width:18px;height:18px;border-radius:50%;background:rgba(0,112,243,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;color:var(--accent2)">→</div>`;
      labelStyle = 'font-weight:700;color:var(--text)';
    } else {
      iconHtml   = `<div style="width:18px;height:18px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:9px;color:var(--muted)">○</div>`;
      labelStyle = 'color:var(--muted)';
    }
    html += `<div style="display:flex;align-items:center;gap:8px">
      ${iconHtml}
      <span style="font-size:0.78rem;flex:1;${labelStyle}">${getMilestoneLabel(m)}</span>
      ${dateDisplay}
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}
function renderSummary() {
  const activeAccounts = accounts.filter(a => isTypeActive(a.type));
  const activeAccountIds = new Set(activeAccounts.map(a => a.id));
  const fixedTotal = activeAccounts.filter(a => FIXED_ACCOUNT_TYPES.has(a.type)).reduce((s,a)=>s+(a.solde||0),0);
  const activePositions = positions.filter(p => activeAccountIds.has(p.accountId));
  const total = activePositions.reduce((s,p)=>s+p.current*p.qty,0) + fixedTotal;
  // PnL calculé uniquement sur les positions avec un PRU connu (price > 0)
  // Les positions à price=0 (PRU inconnu) sont exclues comme les livrets
  const positionsWithPRU = activePositions.filter(p => p.price > 0);
  const cost = positionsWithPRU.reduce((s,p)=>s+p.price*p.qty,0);
  const positionsValue = positionsWithPRU.reduce((s,p)=>s+p.current*p.qty,0);
  const totalPnl = positionsValue - cost;
  const totalPnlPct = cost>0?(totalPnl/cost*100):0;
  // Animated counter for total
  const totalEl = document.getElementById('totalValue');
  const prevNum = Number.isFinite(_lastRenderedTotal) ? _lastRenderedTotal : 0;
  _lastRenderedTotal = total;
  const animationToken = ++_totalAnimationToken;
  if (prevNum !== total && prevNum > 0) {
    let start = null;
    const duration = 600;
    const step = (ts) => {
      if (animationToken !== _totalAnimationToken) return;
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      totalEl.textContent = fmtEur(prevNum + (total - prevNum) * ease);
      if (progress < 1) requestAnimationFrame(step);
      else {
        totalEl.textContent = fmtEur(total);
        if (total > prevNum) {
          totalEl.style.animation = 'none';
          requestAnimationFrame(() => { totalEl.style.animation = 'glowPulse 1s ease'; });
        }
      }
    };
    requestAnimationFrame(step);
  } else {
    totalEl.textContent = fmtEur(total);
  }
  // Capital investi
  const ciEl = document.getElementById('capitalInvested');
  if (ciEl) { ciEl.textContent = cost > 0 ? fmtEur(cost) : '—'; ciEl.className = 'stat-val'; }

  const tp=document.getElementById('totalPnl');
  const newPnlText = cost > 0 ? ((totalPnl>=0?'+':'')+fmtEur(totalPnl)+' ('+(totalPnl>=0?'+':'')+fmt(totalPnlPct)+'%)') : '—';
  if (tp.textContent !== newPnlText) {
    tp.style.animation = 'none'; tp.offsetHeight;
    tp.style.animation = 'countUp 0.4s ease both';
  }
  tp.textContent = newPnlText;
  tp.className='stat-val '+(totalPnl>=0?'gain-col':'loss-col');

  // Dernière mise à jour des prix
  const luEl = document.getElementById('lastUpdateStat');
  if (luEl) {
    const lastTs = positions.reduce((m, p) => Math.max(m, p.lastUpdated || 0), 0);
    luEl.textContent = lastTs > 0 ? timeAgo(lastTs) : '—';
    luEl.className = 'stat-val';
    luEl.style.color = 'var(--muted)';
  }
  updateBrowserTitle();
  renderPeriodVariation();
}

function refreshProjectionIfActive() {
  if (currentTabName === 'simulator') simUpdate();
}
function renderAll() {
  renderAccounts(); renderPositions(); renderAllocation(); renderByAccount();
  renderSummary(); renderFilterToggles(); renderChart();
  refreshProjectionIfActive();
}

// ─── TITRE NAVIGATEUR ────────────────────────────────────────────────────────
function updateBrowserTitle() {
  const totalEl = document.getElementById('totalValue');
  if (!totalEl || totalEl.textContent === '—') {
    document.title = 'Moumix Finance';
    return;
  }
  // Plus-value totale (PRU connu uniquement)
  const posWithPRU = positions.filter(p => p.price > 0);
  const cost = posWithPRU.reduce((s,p) => s + p.price * p.qty, 0);
  const value = posWithPRU.reduce((s,p) => s + p.current * p.qty, 0);
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost * 100) : 0;
  const sign = pnl >= 0 ? '+' : '';
  const emoji = pnl >= 0 ? '📈' : '📉';
  const pnlStr = sign + (Math.abs(pnl) >= 1000
    ? (pnl/1000).toFixed(1) + 'k'
    : Math.round(pnl) + '') + '€';
  document.title = cost > 0
    ? `${emoji} ${sign}${pnlPct.toFixed(2)}% (${pnlStr}) — Moumix Finance`
    : 'Moumix Finance';
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'error') {
  const old = document.getElementById('saveToast');
  if (old) { clearTimeout(old._t); old.remove(); }
  const toast = document.createElement('div');
  toast.id = 'saveToast';
  const ok = type === 'success';
  toast.className = `save-toast ${ok ? 'success' : 'error'}`;
  toast.setAttribute('role', ok ? 'status' : 'alert');
  toast.setAttribute('aria-live', ok ? 'polite' : 'assertive');
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }));
  toast._t = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(8px)';
    setTimeout(() => toast.remove(), TIMING_TOAST_FADE);
  }, ok ? TIMING_TOAST_SUCCESS : TIMING_TOAST_ERROR);
}

// ─── OBJECTIFS D'ÉPARGNE ─────────────────────────────────────────────────────
let goals = [];
let selectedGoalEmoji = '🏠';

async function persistGoals(goal, isDelete = false) {
  if (!currentUser) return;
  try {
    if (isDelete) {
      const { data, error } = await sb.from('goals').delete().eq('id', goal.id).eq('user_id', currentUser.id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Suppression de l’objectif non confirmée');
    } else {
      const { error } = await sb.from('goals').upsert({
        id: goal.id, user_id: currentUser.id,
        name: goal.name, target: goal.target,
        current: goal.current, emoji: goal.emoji
      });
      if (error) throw error;
    }
  } catch(e) {
    console.error('[Moumix] persistGoals error:', e);
    throw e; // propager aux appelants (saveGoal, deleteGoal) pour rollback
  }
}

function openAddGoal() {
  document.getElementById('goalModalTitle').textContent = 'Nouvel objectif';
  document.getElementById('goal-edit-id').value = '';
  document.getElementById('goal-name').value = '';
  document.getElementById('goal-target').value = '';
  document.getElementById('goal-current').value = '';
  selectedGoalEmoji = '🏠';
  document.querySelectorAll('.goal-emoji-opt').forEach(e => e.classList.toggle('active', e.textContent === '🏠'));
  showDialog(document.getElementById('goalModal'), '#goal-name');
}
function closeGoalModal() { hideDialog(document.getElementById('goalModal')); }
function selectGoalEmoji(el, emoji) {
  selectedGoalEmoji = emoji;
  document.querySelectorAll('.goal-emoji-opt').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}

async function saveGoal() {
  const name = document.getElementById('goal-name').value.trim();
  const target = parseFloat(document.getElementById('goal-target').value);
  if (!name || !target || target <= 0) { showToast('Nom et montant cible requis', 'error'); return; }
  const currentRaw = document.getElementById('goal-current').value;
  const current = currentRaw !== '' ? parseFloat(currentRaw) : computeTotalPatrimoine();
  const editId = document.getElementById('goal-edit-id').value;
  let goal;
  let previousGoal = null;
  if (editId) {
    goal = goals.find(g => g.id === editId);
    if (!goal) { closeGoalModal(); return; } // objectif supprimé entre-temps
    previousGoal = { ...goal };
    goal.name = name; goal.target = target; goal.current = current; goal.emoji = selectedGoalEmoji;
  } else {
    goal = { id: crypto.randomUUID(), name, target, current, emoji: selectedGoalEmoji, createdAt: Date.now() };
    goals.push(goal);
  }
  try { await persistGoals(goal); } catch(e) {
    console.error('[Moumix] saveGoal error:', e);
    if (editId && previousGoal) Object.assign(goal, previousGoal);
    else goals = goals.filter(g => g.id !== goal.id);
    showToast('Erreur : impossible de sauvegarder l’objectif.', 'error');
    return;
  }
  closeGoalModal();
  renderGoals();
}

function editGoal(id) {
  const g = goals.find(g => g.id === id);
  if (!g) return;
  document.getElementById('goalModalTitle').textContent = 'Modifier l\'objectif';
  document.getElementById('goal-edit-id').value = id;
  document.getElementById('goal-name').value = g.name;
  document.getElementById('goal-target').value = g.target;
  document.getElementById('goal-current').value = g.current;
  selectedGoalEmoji = g.emoji || '🎯';
  document.querySelectorAll('.goal-emoji-opt').forEach(e => e.classList.toggle('active', e.textContent === selectedGoalEmoji));
  showDialog(document.getElementById('goalModal'), '#goal-name');
}

async function deleteGoal(id) {
  const goal = goals.find(g => g.id === id);
  if (!goal) return;
  if (!await appConfirm(`Supprimer l’objectif « ${goal.name} » ?`, { title: 'Supprimer l’objectif', confirmLabel: 'Supprimer' })) return;
  const _backup = [...goals];
  goals = goals.filter(g => g.id !== id);
  try { await persistGoals(goal, true); } catch(e) {
    console.error('[Moumix] deleteGoal error:', e);
    goals = _backup;
    showToast('Erreur : impossible de supprimer l\'objectif.', 'error');
    return;
  }
  renderGoals();
}

function renderGoals() {
  const container = document.getElementById('goalsList');
  if (!container) return;
  if (goals.length === 0) {
    container.innerHTML = '<div class="empty-state">Aucun objectif — cliquez sur "+ Objectif"</div>';
    return;
  }
  container.innerHTML = goals.map((g, idx) => {
    const pct = Math.min(100, g.target > 0 ? (g.current / g.target * 100) : 0);
    const remaining = Math.max(0, g.target - g.current);
    const done = pct >= 100;
    const barColor = done ? 'var(--gain)' : pct > 60 ? '#ffb400' : 'var(--accent2)';
    return `<div class="goal-card" style="animation:slideInRight 0.35s cubic-bezier(0.34,1.2,0.64,1) ${idx*0.07}s both">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:1.4rem">${g.emoji || '🎯'}</span>
          <div>
            <div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:0.9rem">${_esc(g.name)}</div>
            <div style="font-size:0.65rem;color:var(--muted);margin-top:1px">Objectif : ${fmtEur(g.target)}</div>
          </div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="del-btn" onclick="editGoal('${g.id}')" title="Modifier" style="color:var(--muted)">✏️</button>
          <button class="del-btn" onclick="deleteGoal('${g.id}')" title="Supprimer">✕</button>
        </div>
      </div>
      <div class="goal-progress-bar">
        <div class="goal-progress-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:0.72rem;color:var(--muted)">
          ${done
            ? `<span style="color:var(--gain);font-weight:600">🎉 Objectif atteint !</span>`
            : `<span style="color:var(--text);font-weight:600">${fmtEur(g.current)}</span> <span style="color:var(--muted)">· encore ${fmtEur(remaining)}</span>`
          }
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:0.78rem;font-weight:600;color:${done ? 'var(--gain)' : 'var(--text)'}">${pct.toFixed(1)}%</div>
      </div>
    </div>`;
  }).join('');
}

// ─── EUR/USD ──────────────────────────────────────────────────────────────────
async function fetchEurUsd() {
  try {
    const data = await yfFetch('/v8/finance/chart/EURUSD=X?interval=1d&range=5d');
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return;
    const eurUsd = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose || meta.previousClose || eurUsd;
    // On affiche USD/EUR = 1 / (EUR/USD)
    const rate = 1 / eurUsd;
    const prevRate = 1 / prev;
    const change = rate - prevRate;
    const changePct = prevRate ? (change / prevRate * 100) : 0;
    const el = document.getElementById('eurusd-rate');
    const ch = document.getElementById('eurusd-change');
    if (el) el.textContent = rate.toFixed(4);
    if (ch) {
      ch.textContent = (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%';
      ch.style.color = changePct >= 0 ? 'var(--gain)' : 'var(--loss)';
    }
  } catch(e) {}
}

// ─── FILTRES PATRIMOINE ───────────────────────────────────────────────────────
let filteredTypes = null;

function getDefaultActiveTypes() {
  return [...new Set(accounts.map(a => a.type))];
}

function ensureFilterInit() {
  if (!filteredTypes) filteredTypes = getDefaultActiveTypes();
}

function isTypeActive(type) {
  ensureFilterInit();
  return filteredTypes.includes(type);
}

function isAllActive() {
  ensureFilterInit();
  const types = [...new Set(accounts.map(a => a.type))];
  return types.every(t => filteredTypes.includes(t));
}

function toggleAll() {
  const types = [...new Set(accounts.map(a => a.type))];
  filteredTypes = isAllActive() ? [] : [...types];
  renderFilterToggles(); renderSummary(); renderByAccount(); renderAllocation();
}

function toggleType(type) {
  ensureFilterInit();
  if (filteredTypes.includes(type)) { filteredTypes = filteredTypes.filter(t => t !== type); }
  else { filteredTypes.push(type); }
  renderFilterToggles(); renderSummary(); renderByAccount(); renderAllocation();
}

function renderFilterToggles() {
  const el = document.getElementById('filterToggles');
  if (!el) return;
  const types = [...new Set(accounts.map(a => a.type))];
  if (types.length === 0) { el.innerHTML = ''; return; }
  ensureFilterInit();
  const allActive = isAllActive();
  const allToggle = `<button type="button" class="filter-toggle ${allActive ? 'active' : ''}" aria-pressed="${allActive}" onclick="toggleAll()" style="font-weight:600"><span class="ft-dot"></span>Tout</button>`;
  const typeToggles = types.map(type => {
    const active = filteredTypes.includes(type);
    return `<button type="button" class="filter-toggle ${active ? 'active' : ''}" aria-pressed="${active}" onclick="toggleType('${type}')"><span class="ft-dot"></span>${_esc(type)}</button>`;
  }).join('');
  el.innerHTML = allToggle + typeToggles;
}

// ─── PATRIMOINE SNAPSHOT ──────────────────────────────────────────────────────
function computeTotalPatrimoine() {
  // Patrimoine TOTAL, tous types confondus — utilisé pour les snapshots historiques
  // (indépendant des filtres actifs pour assurer la cohérence de l'historique)
  const fixed = accounts.filter(a => FIXED_ACCOUNT_TYPES.has(a.type)).reduce((s,a) => s+(a.solde||0), 0);
  return positions.reduce((s,p) => s + p.current * p.qty, 0) + fixed;
}
function computeCurrentPatrimoine() {
  const activeAccounts = accounts.filter(a => isTypeActive(a.type));
  const fixed = activeAccounts.filter(a => FIXED_ACCOUNT_TYPES.has(a.type)).reduce((s,a) => s+(a.solde||0), 0);
  const activeIds = new Set(activeAccounts.map(a => a.id));
  return positions.filter(p => activeIds.has(p.accountId)).reduce((s,p) => s + p.current * p.qty, 0) + fixed;
}

function parisDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function snapshotPatrimoine() {
  const val = computeTotalPatrimoine(); // toujours le total, pas filtré
  if (val <= 0) return;
  const today = parisDateKey();
  const last = patrimoineHistory[patrimoineHistory.length - 1];
  const _snapHistory = [...patrimoineHistory];
  if (last && last.date === today) {
    patrimoineHistory[patrimoineHistory.length - 1].value = val;
  } else {
    patrimoineHistory.push({ date: today, value: val });
  }
  if (patrimoineHistory.length > 730) patrimoineHistory = patrimoineHistory.slice(-730);
  try { await savePatrimoineHistory(); } catch(e) {
    console.error('[Moumix] snapshotPatrimoine error:', e);
    patrimoineHistory = _snapHistory;
    showToast('Cours actualisés, mais le point d’historique du jour n’a pas pu être sauvegardé.', 'error');
    return;
  }
  renderChart();
}

// ─── CHART ────────────────────────────────────────────────────────────────────
window.setChartPeriod = function(period, btn) {
  currentChartPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderChart();
  renderPeriodVariation();
};

function renderPeriodVariation() {
  const labelEl = document.getElementById('periodVarLabel');
  const valEl = document.getElementById('periodVarStat');
  if (!labelEl || !valEl) return;

  const periodLabels = { '1S': '1 sem.', '1M': '1 mois', '3M': '3 mois', '1A': '1 an', 'Tout': 'Tout' };
  labelEl.textContent = 'Variation globale · ' + (periodLabels[currentChartPeriod] || currentChartPeriod);

  const filtered = filterChartData([...patrimoineHistory].sort((a,b) => a.date < b.date ? -1 : 1), currentChartPeriod);
  if (filtered.length < 2) { valEl.textContent = '—'; valEl.className = 'stat-val'; return; }

  const first = parseFloat(filtered[0].value) || 0;
  const last = parseFloat(filtered[filtered.length - 1].value) || 0;
  const delta = last - first;
  const deltaPct = first > 0 ? (delta / first * 100) : 0;

  valEl.textContent = (delta >= 0 ? '+' : '') + fmtEur(delta) + ' (' + (deltaPct >= 0 ? '+' : '') + fmt(deltaPct) + '%)';
  valEl.className = 'stat-val ' + (delta >= 0 ? 'gain-col' : 'loss-col');
}

function filterChartData(data, period) {
  if (period === 'Tout') return data;
  const now = new Date();
  const cutoff = new Date(now);
  if (period === '1S') cutoff.setDate(now.getDate() - 7);
  else if (period === '1M') cutoff.setMonth(now.getMonth() - 1);
  else if (period === '3M') cutoff.setMonth(now.getMonth() - 3);
  else if (period === '1A') cutoff.setFullYear(now.getFullYear() - 1);
  const cutStr = parisDateKey(cutoff);
  return data.filter(d => d.date >= cutStr);
}

// Interpolate between sparse real snapshots to get a daily series
function buildInterpolatedSeries(data, startDate, endDate) {
  if (!data || data.length === 0) return [];
  // Add current patrimoine as "today" if not already present
  const today = parisDateKey();
  const currentVal = computeTotalPatrimoine(); // cohérent avec snapshotPatrimoine qui utilise aussi le total
  let augmented = [...data];
  if (currentVal > 0 && (!augmented.length || augmented[augmented.length-1].date !== today)) {
    augmented = [...augmented, { date: today, value: currentVal, real: true }];
  }
  augmented = augmented.map(d => ({ ...d, real: true }));
  if (augmented.length === 0) return [];

  // Build full daily series by interpolating between real points
  // Use integer timestamps at noon UTC to avoid DST/timezone boundary issues
  const result = [];
  const startMs = new Date((startDate || augmented[0].date) + 'T12:00:00Z').getTime();
  const endMs   = new Date((endDate   || today)             + 'T12:00:00Z').getTime();
  const DAY_MS  = 86400000;

  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    const ds = new Date(ms).toISOString().slice(0, 10);
    const real = augmented.find(p => p.date === ds);
    if (real) { result.push({ date: ds, value: real.value, estimated: false }); continue; }
    // Find surrounding real points
    const before = augmented.findLast(p => p.date < ds); // évite la copie inutile de reverse()
    const after = augmented.find(p => p.date > ds);
    if (before && after) {
      const t0 = new Date(before.date + 'T12:00:00Z').getTime();
      const t1 = new Date(after.date  + 'T12:00:00Z').getTime();
      const ratio = (ms - t0) / (t1 - t0);
      result.push({ date: ds, value: before.value + (after.value - before.value) * ratio, estimated: true });
    } else if (before) {
      result.push({ date: ds, value: before.value, estimated: true });
    }
  }
  return result;
}

function renderChart() {
  const wrap = document.getElementById('chartWrap');
  const emptyEl = document.getElementById('chartEmpty');
  const rawData = filterChartData(patrimoineHistory, currentChartPeriod);

  // Remove old SVG and single-point state
  // (interp note cleanup is handled below via wrap.parentElement.querySelectorAll)
  const oldSvg = wrap.querySelector('svg.chart-svg');
  if (oldSvg) oldSvg.remove();
  const oldSingle = wrap.querySelector('.chart-single-point');
  if (oldSingle) oldSingle.remove();

  if (rawData.length < 1 && computeTotalPatrimoine() <= 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  // Build interpolated series
  const today = parisDateKey();
  const startDate = rawData.length > 0 ? rawData[0].date : today;
  const data = buildInterpolatedSeries(rawData, startDate, today);
  if (data.length < 2) {
    // Si un seul point (premier lancement aujourd'hui), afficher un état "début"
    if (data.length === 1) {
      emptyEl.classList.add('hidden');
      const singleWrap = document.createElement('div');
      singleWrap.className = 'chart-single-point';
      singleWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:160px;gap:8px';
      singleWrap.innerHTML = `
        <div style="font-size:1.6rem">📍</div>
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:1.1rem">${fmtEur(data[0].value)}</div>
        <div style="font-size:0.72rem;color:var(--muted)">Point de départ enregistré — le graphique s'enrichira à chaque visite</div>`;
      wrap.insertBefore(singleWrap, wrap.querySelector('.chart-cursor'));
    } else {
      emptyEl.classList.remove('hidden');
    }
    return;
  }

  const hasEstimated = data.some(d => d.estimated);
  const todayAlreadyInRaw = rawData.some(d => d.date === today); // today déjà défini plus haut
  const realCount = rawData.length + (todayAlreadyInRaw ? 0 : 1); // +1 for today if not already present

  const W = wrap.clientWidth || 800;
  const H = 200;
  const pad = { top: 16, right: 20, bottom: 32, left: W < 400 ? 48 : 60 };
  const iW = W - pad.left - pad.right;
  const iH = H - pad.top - pad.bottom;

  const values = data.map(d => d.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const xScale = (i) => pad.left + (i / (data.length - 1)) * iW;
  const yScale = (v) => pad.top + iH - ((v - minV) / range) * iH;

  const isGain = data[data.length-1].value >= data[0].value;
  const lineColor = isGain ? '#00e5a0' : '#ff4466';
  const gradId = 'chartGrad_' + Date.now();

  // Build path: solid for real segments, dashed for interpolated
  // We split the polyline into segments
  let solidSegments = [];
  let currentSeg = [];
  let estimatedSegs = [];
  let currentEstSeg = [];

  data.forEach((d, i) => {
    const pt = `${xScale(i)},${yScale(d.value)}`;
    if (!d.estimated) {
      currentSeg.push(pt);
      if (currentEstSeg.length > 0) { estimatedSegs.push([...currentEstSeg]); currentEstSeg = []; }
    } else {
      currentEstSeg.push(pt);
      if (currentSeg.length > 0) { solidSegments.push([...currentSeg]); currentSeg = []; }
    }
  });
  if (currentSeg.length > 0) solidSegments.push(currentSeg);
  if (currentEstSeg.length > 0) estimatedSegs.push(currentEstSeg);

  // Build a combined area for gradient background
  const baseY = pad.top + iH;
  const areaPath = `M ${xScale(0)},${baseY} ` + data.map((d,i) => `L ${xScale(i)},${yScale(d.value)}`).join(' ') + ` L ${xScale(data.length-1)},${baseY} Z`;

  // Real snapshots dots — use index directly, no indexOf
  const realDots = data.map((d, i) => {
    if (d.estimated) return '';
    const x = xScale(i); const y = yScale(d.value);
    return `<circle cx="${x}" cy="${y}" r="3.5" fill="${lineColor}" opacity="0.9"/>`;
  }).join('');

  // Y axis labels — format compact si petit écran
  const yTicks = 4;
  const useCompact = W < 400;
  function fmtYAxis(v) {
    if (!useCompact) return fmtEur(v).replace(/\s/g,'\u202F');
    if (Math.abs(v) >= 1000000) return (v/1000000).toFixed(1) + 'M€';
    if (Math.abs(v) >= 1000)    return (v/1000).toFixed(0) + 'k€';
    return Math.round(v) + '€';
  }
  let yAxisHTML = '';
  for (let i = 0; i <= yTicks; i++) {
    const v = minV + (range * i / yTicks);
    const y = yScale(v);
    yAxisHTML += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#5a6478" font-family="DM Mono,monospace">${fmtYAxis(v)}</text>`;
    yAxisHTML += `<line x1="${pad.left}" y1="${y}" x2="${pad.left + iW}" y2="${y}" stroke="#1e2530" stroke-width="1" stroke-dasharray="4,4"/>`;
  }

  // X axis labels
  let xAxisHTML = '';
  const maxXLabels = Math.min(data.length, 6);
  for (let i = 0; i < maxXLabels; i++) {
    const idx = Math.round((i / (maxXLabels - 1)) * (data.length - 1));
    const x = xScale(idx);
    const d = new Date(data[idx].date + 'T12:00:00');
    const label = d.toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
    xAxisHTML += `<text x="${x}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#5a6478" font-family="DM Mono,monospace">${label}</text>`;
  }

  const solidLines = solidSegments.map(seg =>
    `<polyline points="${seg.join(' ')}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
  ).join('');
  const estLines = estimatedSegs.map(seg =>
    `<polyline points="${seg.join(' ')}" fill="none" stroke="${lineColor}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="5,4" opacity="0.45"/>`
  ).join('');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'chart-svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('height', H);
  svg.innerHTML = `
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${yAxisHTML}${xAxisHTML}
    <path d="${areaPath}" fill="url(#${gradId})"/>
    ${estLines}
    ${solidLines}
    ${realDots}
  `;

  // Interaction: tooltip + cursor
  svg.addEventListener('mousemove', (e) => {
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(((mx - pad.left) / iW) * (data.length - 1))));
    const pt = data[idx];
    const x = xScale(idx);
    const delta = pt.value - data[0].value;
    const deltaPct = data[0].value > 0 ? (delta / data[0].value * 100) : 0;

    const cursor = document.getElementById('chartCursor');
    cursor.style.left = x + 'px';
    cursor.style.top = (pad.top) + 'px';
    cursor.style.height = iH + 'px';
    cursor.style.opacity = '1';

    const tt = document.getElementById('chartTooltip');
    const dObj = new Date(pt.date + 'T12:00:00');
    document.getElementById('ttDate').textContent = dObj.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'long', year:'numeric' }) + (pt.estimated ? ' ~' : '');
    document.getElementById('ttVal').textContent = fmtEur(pt.value) + (pt.estimated ? ' (estimé)' : '');
    const ttDelta = document.getElementById('ttDelta');
    ttDelta.textContent = (delta >= 0 ? '+' : '') + fmtEur(delta) + ' (' + (deltaPct >= 0 ? '+' : '') + fmt(deltaPct) + '%)';
    ttDelta.style.color = delta >= 0 ? '#00e5a0' : '#ff4466';
    tt.style.opacity = '1';
    const ttX = Math.min(Math.max(x, 80), W - 80);
    tt.style.left = ttX + 'px';
    tt.style.top = (pad.top + 8) + 'px';
  });
  svg.addEventListener('mouseleave', () => {
    document.getElementById('chartTooltip').style.opacity = '0';
    document.getElementById('chartCursor').style.opacity = '0';
  });

  wrap.insertBefore(svg, wrap.querySelector('.chart-cursor'));

  // Note interpolation — remove any previous note first to avoid duplicates
  wrap.parentElement.querySelectorAll('.chart-interp-note').forEach(el => el.remove());
  if (hasEstimated && realCount < data.length) {
    const note = document.createElement('div');
    note.className = 'chart-interp-note';
    note.style.cssText = 'font-size:0.62rem;color:var(--muted);text-align:right;margin-top:4px;padding:0 4px';
    note.innerHTML = `<span style="opacity:0.6">— — interpolé</span> &nbsp; <span style="border-bottom:1.5px solid currentColor">——</span> mesure réelle · ${realCount} point${realCount>1?'s':''}`;
    wrap.after(note);
  }
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

window.switchPosTab = function(tab) {
  const posPanel = document.getElementById('pos-panel');
  const txPanel = document.getElementById('pos-tx-panel');
  const posBtn = document.getElementById('tab-pos-btn');
  const txBtn = document.getElementById('tab-pos-tx-btn');
  const refreshBtn = document.getElementById('refreshBtn');
  if (tab === 'pos') {
    posPanel.style.display = '';
    txPanel.style.display = 'none';
    posBtn.style.borderBottomColor = 'var(--accent)';
    posBtn.style.color = 'var(--accent)';
    txBtn.style.borderBottomColor = 'transparent';
    txBtn.style.color = 'var(--muted)';
    refreshBtn.style.display = '';
  } else {
    renderTransactions();
    posPanel.style.display = 'none';
    txPanel.style.display = '';
    // Déclenche l'animation du panel
    txPanel.classList.remove('tx-panel-anim');
    void txPanel.offsetWidth; // reflow pour relancer l'animation
    txPanel.classList.add('tx-panel-anim');
    posBtn.style.borderBottomColor = 'transparent';
    posBtn.style.color = 'var(--muted)';
    txBtn.style.borderBottomColor = 'var(--accent)';
    txBtn.style.color = 'var(--accent)';
    refreshBtn.style.display = 'none';
  }
};

function renderTransactions() {
  const el = document.getElementById('txListPos');
  if (!el) return;
  if (transactions.length === 0) {
    el.innerHTML = '<div class="tx-empty">Aucune transaction enregistrée</div>';
    return;
  }
  el.innerHTML = transactions.map((tx, i) => {
    const isEdit = tx.type === 'edit';
    const isBuy = tx.type === 'buy';
    const icon = isEdit ? '✏️' : (isBuy ? '↑' : '↓');
    const iconClass = isEdit ? 'edit' : (isBuy ? 'buy' : 'sell');
    const iconColor = isEdit ? 'var(--accent2)' : (isBuy ? 'var(--gain)' : 'var(--loss)');
    const val = tx.qty * tx.price;
    const d = new Date(tx.ts);
    const dateStr = d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
    const timeStr = d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    const delay = Math.min(i * 45, 400);
    const detail = isEdit
      ? `${tx.qty} titres · PRU ${fmtPrice(tx.price)}${tx.oldQty !== tx.qty ? ` (était ${tx.oldQty})` : ''}${tx.oldPrice !== tx.price ? ` / ${fmtPrice(tx.oldPrice)}` : ''} · ${_esc(tx.accountName)}`
      : `${tx.qty} × ${fmtPrice(tx.price)} · ${_esc(tx.accountName)}`;
    const valHtml = isEdit
      ? `<div class="tx-val" style="color:var(--accent2)">${fmtEur(val)}</div>`
      : `<div class="tx-val" style="color:${iconColor}">${isBuy ? '+' : '-'}${fmtEur(val)}</div>`;
    return `<div class="tx-item" style="animation-delay:${delay}ms">
      <div class="tx-icon ${iconClass}" style="color:${iconColor};${isEdit ? 'background:rgba(0,112,243,0.1);font-size:0.8rem' : ''}">${icon}</div>
      <div class="tx-info">
        <div class="tx-sym">${_esc(tx.symbol)}${isEdit ? ' <span style="font-size:0.62rem;color:var(--accent2);background:rgba(0,112,243,0.12);padding:1px 5px;border-radius:3px;font-weight:500">MODIF</span>' : ''}</div>
        <div class="tx-detail">${detail}</div>
      </div>
      <div class="tx-right">
        ${valHtml}
        <div class="tx-date">${dateStr} ${timeStr}</div>
      </div>
    </div>`;
  }).join('');
}

// ─── PRÉLÈVEMENTS ─────────────────────────────────────────────────────────────
// PREL_FREQ_MONTHLY et PREL_CAT_LABELS définis dans les constantes centrales

function openAddPrel() {
  document.getElementById('prelAddRow').classList.remove('hidden');
  document.getElementById('prel-new-name').focus();
}
function cancelAddPrel() {
  document.getElementById('prelAddRow').classList.add('hidden');
  document.getElementById('prel-new-name').value = '';
  document.getElementById('prel-new-amount').value = '';
  document.getElementById('prel-new-split').value = '';
}
async function confirmAddPrel() {
  const name = document.getElementById('prel-new-name').value.trim();
  const amount = parseFloat(document.getElementById('prel-new-amount').value);
  const freq = document.getElementById('prel-new-freq').value;
  const cat = document.getElementById('prel-new-cat').value;
  const splitRaw = parseInt(document.getElementById('prel-new-split').value);
  const split = splitRaw >= 2 ? splitRaw : 1;
  if (!name || !amount || amount <= 0) { showToast('Saisissez un nom et un montant positif.', 'error'); return; }
  const _newPrel = { id: crypto.randomUUID(), name, amount, freq, cat, split };
  prelevements.push(_newPrel);
  try { await savePrelevement(_newPrel); } catch(e) {
    console.error('[Moumix] confirmAddPrel error:', e);
    prelevements = prelevements.filter(p => p.id !== _newPrel.id);
    showToast('Erreur : impossible d\'ajouter.', 'error');
    return;
  }
  cancelAddPrel(); renderPrelevements();
}
async function deletePrel(id) {
  const prelevement = prelevements.find(p => p.id === id);
  if (!prelevement) return;
  if (!await appConfirm(`Supprimer le prélèvement « ${prelevement.name} » ?`, { title: 'Supprimer le prélèvement', confirmLabel: 'Supprimer' })) return;
  try { await deletePrelDB(id); } catch(e) { console.error('[Moumix] deletePrel error:', e); showToast('Erreur : suppression impossible.', 'error'); return; }
  prelevements = prelevements.filter(p => p.id !== id);
  renderPrelevements();
}
function editPrel(id) {
  const p = prelevements.find(p => p.id === id);
  if (!p) return;
  const row = document.getElementById('prel-row-' + id);
  const safeName = _esc(p.name);
  row.innerHTML = `<td colspan="5" style="padding:8px 10px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <input class="prel-input prel-input-name" type="text" id="prel-edit-name-${id}" value="${safeName}" placeholder="Nom">
      <input class="prel-input prel-input-amount" type="number" id="prel-edit-amount-${id}" value="${p.amount}" step="any" min="0" placeholder="Montant">
      <select class="prel-input prel-input-freq" id="prel-edit-freq-${id}">
        <option value="mensuel" ${p.freq==='mensuel'?'selected':''}>Mensuel</option>
        <option value="trimestriel" ${p.freq==='trimestriel'?'selected':''}>Trimestriel</option>
        <option value="annuel" ${p.freq==='annuel'?'selected':''}>Annuel</option>
      </select>
      <select class="prel-input" style="width:130px" id="prel-edit-cat-${id}">
        <option value="courtage" ${p.cat==='courtage'?'selected':''}>Courtage</option>
        <option value="frais" ${p.cat==='frais'?'selected':''}>Frais gestion</option>
        <option value="credit" ${p.cat==='credit'?'selected':''}>Crédit</option>
        <option value="abonnement" ${p.cat==='abonnement'?'selected':''}>Abonnement</option>
        <option value="autre" ${p.cat==='autre'?'selected':''}>Autre</option>
      </select>
      <input class="prel-input prel-split-input" type="number" id="prel-edit-split-${id}" value="${p.split > 1 ? p.split : ''}" placeholder="÷" min="1" max="99" step="1" title="Partagé entre X personnes au total">
      <button class="btn btn-sm btn-primary" onclick="confirmEditPrel('${id}')">✓</button>
      <button class="btn btn-sm" onclick="renderPrelevements()">✕</button>
    </div>
  </td>`;
}
async function confirmEditPrel(id) {
  const p = prelevements.find(p => p.id === id);
  if (!p) return;
  const previous = { ...p };
  const nextName = document.getElementById('prel-edit-name-' + id).value.trim();
  const nextAmount = parseFloat(document.getElementById('prel-edit-amount-' + id).value);
  if (!nextName || !nextAmount || nextAmount <= 0) {
    showToast('Nom et montant positif requis.', 'error');
    return;
  }
  p.name = nextName;
  p.amount = nextAmount;
  p.freq = document.getElementById('prel-edit-freq-' + id).value;
  p.cat = document.getElementById('prel-edit-cat-' + id).value;
  const splitRaw = parseInt(document.getElementById('prel-edit-split-' + id).value);
  p.split = splitRaw >= 2 ? splitRaw : 1;
  try {
    await savePrelevement(p);
  } catch(e) {
    console.error('[Moumix] confirmEditPrel error:', e);
    Object.assign(p, previous);
    showToast('Erreur modification : les anciennes valeurs sont conservées.', 'error');
  }
  renderPrelevements();
}
function renderPrelevements() {
  const el = document.getElementById('prelList');
  const summary = document.getElementById('prelSummary');
  if (prelevements.length === 0) {
    el.innerHTML = '<div class="empty-state">Aucun prélèvement — cliquez sur "+ Ajouter"</div>';
    summary.classList.add('hidden'); return;
  }
  let totalMonthly = 0;
  prelevements.forEach(p => {
    const split = p.split > 1 ? p.split : 1;
    totalMonthly += (p.amount / split) * (PREL_FREQ_MONTHLY[p.freq] || 1);
  });

  const rows = prelevements.map(p => {
    const split = p.split > 1 ? p.split : 1;
    const myShare = p.amount / split;
    const monthly = myShare * (PREL_FREQ_MONTHLY[p.freq] || 1);
    const catLabel = PREL_CAT_LABELS[p.cat] || p.cat;
    const shareHtml = split > 1
      ? `<span class="prel-share-badge" style="font-size:0.55rem;padding:1px 5px;margin-left:4px">÷${split}</span>`
      : '';
    const myPartHtml = split > 1
      ? `<div style="font-size:0.65rem;color:#ff9a3c;margin-top:1px">Ma part : ${fmtEur(myShare)}</div>`
      : '';
    return `<tr id="prel-row-${p.id}" style="transition:background 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
      <td style="padding:8px 10px">
        <div style="display:flex;align-items:center">
          <span style="font-weight:600;font-size:0.8rem">${_esc(p.name)}</span>${shareHtml}
        </div>
        <div style="font-size:0.62rem;color:var(--muted);margin-top:1px">${catLabel}</div>
      </td>
      <td style="padding:8px 10px;color:var(--muted);font-size:0.68rem;white-space:nowrap">
        <span style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:3px">${p.freq}</span>
      </td>
      <td style="padding:8px 10px;text-align:right;white-space:nowrap">
        <div style="font-family:'DM Mono',monospace;font-size:0.75rem;color:var(--muted)">≈ ${fmtEur(monthly)}/m</div>
      </td>
      <td style="padding:8px 10px;text-align:right;white-space:nowrap">
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:600;font-size:0.85rem;color:var(--loss)">-${fmtEur(p.amount)}</div>
        ${myPartHtml}
      </td>
      <td style="padding:8px 10px;text-align:right;white-space:nowrap">
        <button class="del-btn" onclick="editPrel('${p.id}')" style="color:var(--muted);margin-right:4px" title="Modifier">✏️</button>
        <button class="del-btn" onclick="deletePrel('${p.id}')" title="Supprimer">✕</button>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `<table class="prel-table" style="width:100%;border-collapse:collapse;font-size:0.78rem">
    <thead>
      <tr>
        <th style="color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;font-size:0.62rem;padding:6px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:400">Nom</th>
        <th style="color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;font-size:0.62rem;padding:6px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:400">Fréquence</th>
        <th style="color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;font-size:0.62rem;padding:6px 10px;text-align:right;border-bottom:1px solid var(--border);font-weight:400">/ Mois</th>
        <th style="color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;font-size:0.62rem;padding:6px 10px;text-align:right;border-bottom:1px solid var(--border);font-weight:400">Montant</th>
        <th style="border-bottom:1px solid var(--border)"></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

  summary.classList.remove('hidden');
  document.getElementById('prelMonthly').textContent = '-' + fmtEur(totalMonthly);
  document.getElementById('prelYearly').textContent = '-' + fmtEur(totalMonthly * 12);
}

// ─── VISIBILITY REFRESH ──────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && positions.length > 0) {
    // Si plus de 2 min depuis le dernier refresh, on relance
    const now = Date.now();
    if (now - _lastPriceRefresh > 2 * 60 * 1000) {
      refreshAllPrices();
    }
  }
});
// ─── CHIEN MASCOTTE ───────────────────────────────────────────────────────────
let dogBubbleTimer = null;
let dogWafTimer = null;

function showDog(user) {
  const widget = document.getElementById('dogWidget');
  const bubble = document.getElementById('dogBubble');
  const svgWrap = document.getElementById('dogSvgWrap');

  widget.classList.remove('hidden');
  svgWrap.className = 'dog-svg-wrap'; // reset, bounce in

  const name = (user.email || '').split('@')[0];
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  // Messages contextuels selon la perf du portefeuille
  const dayChange = positions.reduce((s, p) => s + (p.changePercent || 0) * p.current * p.qty / 100, 0);
  const totalVal = positions.reduce((s, p) => s + p.current * p.qty, 0);
  const dayPct = totalVal > 0 ? (dayChange / totalVal * 100) : null;

  let contextMsg = '';
  if (dayPct !== null && positions.length > 0) {
    if (dayPct >= 2) contextMsg = `📈 Superbe journée ! +${dayPct.toFixed(2)}% aujourd'hui 🚀`;
    else if (dayPct >= 0.5) contextMsg = `📈 Belle journée ! +${dayPct.toFixed(2)}% 🎉`;
    else if (dayPct <= -2) contextMsg = `📉 Dure journée… ${dayPct.toFixed(2)}%. Hodl, ${displayName} ! 🐾`;
    else if (dayPct < -0.5) contextMsg = `📉 Légère baisse (${dayPct.toFixed(2)}%). Ça va remonter ! 💪`;
  }

  const dogGreetings = contextMsg ? [
    `<div class="dog-bubble-name">🐕 ${greeting}, <span>${displayName}</span> !</div><div class="dog-bubble-stat">${contextMsg}</div>`
  ] : [
    `<div class="dog-bubble-name">🐾 ${greeting}, <span>${displayName}</span> !</div><div class="dog-bubble-stat">Content de te voir ! Je veille sur tes finances 👀</div>`,
    `<div class="dog-bubble-name">🌟 ${greeting} <span>${displayName}</span> !</div><div class="dog-bubble-stat">Prêt pour une belle journée d'investissement ?</div>`,
    `<div class="dog-bubble-name">🐕 ${greeting}, <span>${displayName}</span> !</div><div class="dog-bubble-stat">Vos futurs projets vous remercient 🏡</div>`,
    `<div class="dog-bubble-name">🎀 ${greeting} <span>${displayName}</span> ~</div><div class="dog-bubble-stat">Économiser c'est s'offrir demain 💛</div>`,
  ];
  const randomGreet = dogGreetings[Math.floor(Math.random() * dogGreetings.length)];
  bubble.innerHTML = randomGreet;
  bubble.classList.remove('hidden');
  bubble.className = 'dog-welcome-bubble';

  // Bulle disparaît après 6s
  clearTimeout(dogBubbleTimer);
  dogBubbleTimer = setTimeout(() => { // TIMING_DOG_BUBBLE
    bubble.classList.add('hiding');
    setTimeout(() => {
      bubble.classList.add('hidden');
      bubble.classList.remove('hiding');
      svgWrap.className = 'dog-svg-wrap idle';
    }, 300);
  }, TIMING_DOG_BUBBLE);
}

const DOG_PHRASES = [
  'Waf ! 🐾',
  'On économise pour les vacances ? 🌴',
  'Chaque centime compte ! 🐕',
  'Vous êtes trop forts tous les deux 💕',
  'Un petit sou de plus aujourd\'hui ~ 🌸',
  'Je veille sur vos économies 🐾',
  'Vos futurs projets vous remercient ! 🏡',
  'L\'amour et les sous, ça fait deux 💛',
  'Hé, cliquez pas trop fort sur moi 🥺',
  'Je crois en vous ! 🌟',
  'Économiser c\'est s\'offrir demain 🎀',
  'Un bisou pour le courage 💋',
];
let lastDogPhrase = -1;

function dogClick() {
  const svgWrap = document.getElementById('dogSvgWrap');
  const wafContainer = document.getElementById('wafBubble');

  // Shake
  svgWrap.classList.remove('shaking', 'idle');
  void svgWrap.offsetWidth;
  svgWrap.classList.add('shaking');

  // Phrase aléatoire (pas deux fois la même d'affilée)
  let idx;
  do { idx = Math.floor(Math.random() * DOG_PHRASES.length); } while (idx === lastDogPhrase);
  lastDogPhrase = idx;

  if (dogWafTimer) clearTimeout(dogWafTimer);
  // Créer la bulle waf dans le container
  wafContainer.innerHTML = `<div class="waf-bubble">${DOG_PHRASES[idx]}</div>`;
  dogWafTimer = setTimeout(() => {
    const waf = wafContainer.querySelector('.waf-bubble');
    if (waf) {
      waf.classList.add('fade');
      setTimeout(() => { wafContainer.innerHTML = ''; }, TIMING_DOG_WAF_FADE);
    }
  }, TIMING_DOG_WAF);

  setTimeout(() => {
    svgWrap.classList.remove('shaking');
    svgWrap.classList.add('idle');
  }, 500); // dog shake duration
}


// ─── RACCOURCIS CLAVIER ──────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Escape : fermer le modal ouvert
  if (e.key === 'Escape') {
    const openOverlay = document.querySelector('.modal-overlay.open');
    if (openOverlay) {
      const id = openOverlay.id.replace('Modal','').replace('modal','');
      if (openOverlay.id === 'goalModal') closeGoalModal();
      else if (openOverlay.id === 'editPositionModal') closeEditPosition();
      else if (openOverlay.id === 'mobileActionsModal') closeMobileActions();
      else if (openOverlay.id === 'confirmModal') resolveAppConfirm(false);
      else closeModal(id);
      e.preventDefault();
      return;
    }

  }

  // Maintenir le focus dans la boîte de dialogue ouverte.
  if (e.key === 'Tab') {
    const openOverlay = document.querySelector('.modal-overlay.open');
    if (openOverlay) {
      const focusable = [...openOverlay.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
        .filter(el => el.offsetParent !== null);
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
      return;
    }
  }

  // Les raccourcis des onglets ne doivent pas agir derrière le menu mobile.
  if (document.getElementById('mobileActionsModal')?.classList.contains('open')) return;

  // Ignorer les autres raccourcis si focus dans un champ de saisie.
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

  // N : nouvelle position
  if (e.key === 'n' || e.key === 'N') {
    if (!document.querySelector('.modal-overlay.open')) {
      openAddPosition(); e.preventDefault();
    }
    return;
  }

  // R : rafraîchir les prix
  if (e.key === 'r' || e.key === 'R') {
    if (!document.querySelector('.modal-overlay.open')) {
      refreshAllPrices(); e.preventDefault();
    }
    return;
  }

  // 1-4 : changer d'onglet
  if (e.key === '1') switchTabByIndex(0);
  else if (e.key === '2') switchTabByIndex(1);
  else if (e.key === '3') switchTabByIndex(2);

  // / ou F : focus barre de recherche positions
  if ((e.key === '/' || e.key === 'f' || e.key === 'F') && !document.querySelector('.modal-overlay.open')) {
    const searchInput = document.getElementById('posSearch');
    if (searchInput) {
      searchInput.focus();
      e.preventDefault();
    }
  }
});

function switchTabByIndex(i) {
  const btns = document.querySelectorAll('#mainTabs .tab-btn');
  if (btns[i]) btns[i].click();
}

// ─── RIPPLE EFFECT ───────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn');
  if (!btn || btn.disabled) return;
  const r = document.createElement('span');
  r.className = 'btn-ripple';
  const rect = btn.getBoundingClientRect();
  r.style.left = (e.clientX - rect.left) + 'px';
  r.style.top  = (e.clientY - rect.top)  + 'px';
  btn.appendChild(r);
  setTimeout(() => r.remove(), TIMING_TOAST_FADE + 200); // ~500ms ripple
});
// ─── INIT ─────────────────────────────────────────────────────────────────────
function clearLoadedSession() {
  // État en mémoire uniquement ; aucune suppression en base ou de jeton SDK.
  closeMobileActions();
  currentUser = null;
  _appReadyTask = null;
  accounts = []; positions = []; prelevements = []; transactions = []; patrimoineHistory = []; goals = [];
  positionHistory = {};
  clearInterval(_priceRefreshInterval); _priceRefreshInterval = null;
  clearInterval(_eurUsdInterval); _eurUsdInterval = null;
  eurRates = {};
  document.getElementById('dogWidget')?.classList.add('hidden');
  document.getElementById('mainApp').classList.add('hidden');
}

function initApp(user) {
  if (!user?.id) return Promise.resolve(false);
  if (_appReadyTask?.userId === user.id) {
    currentUser = user;
    updateUserUI(user);
    return Promise.resolve(true);
  }
  if (_appInitTask?.userId === user.id) return _appInitTask.promise;
  _appInitTask?.controller.abort();
  clearLoadedSession();
  const task = { userId: user.id, controller: new AbortController(), promise: null };
  _appInitTask = task;
  _failedLoad = null;
  filteredTypes = null;
  _lastRenderedTotal = null;
  _totalAnimationToken++;
  updateUserUI(user);
  hideOfflineBanner();
  setAuthLoadStatus('Connexion établie — chargement des données…');
  if (document.getElementById('loginScreen').classList.contains('hidden')) {
    document.getElementById('loadingOverlay').classList.remove('hidden');
  }
  syncAuthSubmitButton();
  task.promise = (async () => {
    try {
      let loaded;
      let networkRetries = 0;
      // Reprises bornées sur la même session : le refus JWT intermittent peut
      // disparaître seul, sans obliger l'utilisateur à retaper son mot de passe.
      for (let attempt = 0; attempt <= JWT_RETRY_DELAYS.length; attempt++) {
        try {
          loaded = await loadAllData(user.id, task.controller.signal);
          break;
        } catch (error) {
          if (task.controller.signal.aborted || error.name === 'AbortError') throw error;
          const futureJwt = error.kind === 'jwt_future';
          const temporary = error.kind === 'timeout' || error.kind === 'network';
          if (attempt === JWT_RETRY_DELAYS.length || (!futureJwt && (!temporary || networkRetries++ >= 1))) throw error;
          setAuthLoadStatus(futureJwt ?
            `Synchronisation temporaire de la session — nouvelle tentative (${attempt + 2}/${JWT_RETRY_DELAYS.length + 1})…` :
            'Connexion momentanément indisponible — nouvelle tentative…');
          await waitForDataRetry(futureJwt ? JWT_RETRY_DELAYS[attempt] : TIMING_SUPABASE_RETRY, task.controller.signal);
        }
      }
      if (_appInitTask !== task || task.controller.signal.aborted) return false;
      // Commit unique, seulement une fois les six lectures réussies.
      ({ accounts, positions, prelevements, transactions, patrimoineHistory, goals } = loaded);
      positionHistory = {};
      currentUser = _authUser?.id === user.id ? _authUser : user;
      _appReadyTask = task;
      _failedLoad = null;
      hideOfflineBanner();
      document.getElementById('auth-error').textContent = '';
      document.getElementById('loadingOverlay').classList.add('hidden');
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('mainApp').classList.remove('hidden');
      renderAll();
      renderPrelevements();
      renderGoals();
      fetchEurUsd();
      _eurUsdInterval = setInterval(() => { if (_appReadyTask === task) fetchEurUsd(); }, 5 * 60 * 1000);
      setTimeout(() => { if (_appReadyTask === task) showDog(currentUser); }, TIMING_DOG_SHOW);
      if (positions.length > 0) {
        refreshAllPrices();
      }
      prepareMarketIndices();
      _priceRefreshInterval = setInterval(() => {
        if (_appReadyTask === task && positions.length > 0 && document.visibilityState === 'visible') refreshAllPrices();
      }, 5 * 60 * 1000);
      return true;
    } catch (error) {
      if (_appInitTask !== task || task.controller.signal.aborted || error.name === 'AbortError') return false;
      // Pas de jeton, mot de passe ou contenu des comptes dans les diagnostics.
      console.error('[Moumix] loadAllData error:', error.kind || 'unexpected', error.queryErrors?.length ? error.queryErrors : error.message);
      clearLoadedSession();
      _failedLoad = { userId: user.id, email: user.email || '', kind: error.kind || 'unexpected' };
      if (!document.getElementById('auth-email').value) document.getElementById('auth-email').value = user.email || '';
      showLogin();
      const errEl = document.getElementById('auth-error');
      errEl.style.color = 'var(--loss)';
      errEl.textContent = error.kind === 'jwt_future' ?
        'La session est encore refusée temporairement (JWT issued at future). Patientez quelques secondes puis réessayez. Aucune donnée n’a été supprimée.' :
        error.kind === 'auth_required' ? 'Session refusée ou expirée — veuillez vous reconnecter.' :
        error.kind === 'timeout' || error.kind === 'network' ?
        'Le chargement ne répond pas. Vérifiez votre connexion puis réessayez. Vos données sont conservées.' :
        `Impossible de charger les données (${error.queryErrors?.find(e => e.status !== 401)?.code || error.queryErrors?.[0]?.code || 'chargement'}). Aucune donnée n’a été supprimée.`;
      return false;
    } finally {
      if (_appInitTask === task) {
        _appInitTask = null;
        syncAuthSubmitButton();
      }
    }
  })();
  return task.promise;
}

function showLogin() {
  closeMobileActions();
  document.getElementById('loadingOverlay').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('mainApp').classList.add('hidden');
  syncAuthSubmitButton();
}

// Auth state listener — ne jamais attendre une opération SDK dans ce callback :
// Supabase peut encore détenir son verrou de session. Le travail est différé.
document.getElementById('loadingOverlay').classList.remove('hidden');

function handleAuthStateChange(event, session) {
  const version = ++_authEventVersion;
  if (event === 'SIGNED_OUT') {
    _authUser = null;
    _authSubmitTask = null;
    _appInitTask?.controller.abort();
    _appInitTask = null;
    _failedLoad = null;
    clearLoadedSession();
    document.getElementById('auth-error').textContent = '';
    showLogin();
    return;
  }
  if (!session?.user) return;
  _authUser = session.user;
  if ((_appInitTask && _appInitTask.userId !== session.user.id) ||
      (_appReadyTask && _appReadyTask.userId !== session.user.id)) {
    _appInitTask?.controller.abort();
    _appInitTask = null;
    _failedLoad = null;
    clearLoadedSession();
  }
  if (_appReadyTask?.userId === session.user.id) {
    currentUser = session.user;
    updateUserUI(session.user);
    return;
  }
  // Un SIGNED_IN peut être émis au simple retour sur l'onglet : après épuisement
  // des essais, attendre un vrai renouvellement ou le bouton Réessayer.
  if (_failedLoad?.userId === session.user.id && event !== 'TOKEN_REFRESHED') return;
  if (!['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) return;
  setTimeout(() => {
    if (_authEventVersion !== version || _authSubmitTask || document.readyState === 'loading') return;
    initApp(session.user);
  }, 0);
}
sb.auth.onAuthStateChange(handleAuthStateChange);

// getSession attend lui-même l'initialisation du SDK ; aucun délai arbitraire.
window.addEventListener('load', async () => {
  simUpdate(); // initialise le simulateur dès le chargement
  _simApplyDefaultView();
  const version = _authEventVersion;
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    // Une réponse tardive ne doit pas annuler une déconnexion ou une connexion
    // à un autre compte survenue entre-temps.
    const user = version === _authEventVersion ? data.session?.user : _authUser;
    if (_authSubmitTask) return;
    if (user) {
      _authUser = user;
      if (_failedLoad?.userId !== user.id) await initApp(user);
    } else if (!_appInitTask && !_appReadyTask) {
      showLogin();
    }
  } catch(e) {
    if (!_appInitTask && !_appReadyTask && !_authSubmitTask) {
      showLogin();
      const errEl = document.getElementById('auth-error');
      errEl.style.color = 'var(--loss)';
      errEl.textContent = 'Session indisponible — veuillez vous reconnecter.';
    }
  }
});
// ─── RESIZE & RESPONSIVE ─────────────────────────────────────────────────────
function _debouncedRedraw(fn) {
  let t; return () => { clearTimeout(t); t = setTimeout(fn, TIMING_RESIZE_DEBOUNCE); };
}
// ResizeObserver pour les charts — réagit aussi quand un tab devient visible
if (window.ResizeObserver) {
  const chartWrap = document.getElementById('chartWrap');
  if (chartWrap) new ResizeObserver(_debouncedRedraw(renderChart)).observe(chartWrap);
  const simWrap = document.getElementById('sim-graph-wrap');
  if (simWrap) new ResizeObserver(_debouncedRedraw(() => { if (simData.length) simDrawChart(); })).observe(simWrap);
} else {
  // Fallback navigateurs anciens
  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      renderChart();
      if (document.getElementById('tab-simulator')?.classList.contains('active')) simDrawChart();
    }, 150);
  });
}

// ─── DOG SCROLL HIDE (mobile) ────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  if (window.innerWidth > 768) return;
  const dog = document.getElementById('dogWidget');
  if (!dog) return;
  dog.classList.toggle('dog-hidden', window.scrollY > 80);
}, { passive: true });

function timeAgoFromDate(date) {
  const t = date.getTime();
  return isNaN(t) ? '' : timeAgo(t);
}

async function loadNewsIndices() {
  const indices = [
    { sym: '^GSPC',    name: 'S&P 500' },
    { sym: '^NDX',     name: 'NASDAQ 100' },
    { sym: '^STOXX50E',name: 'Euro Stoxx' },
    { sym: '^FCHI',    name: 'CAC 40' },
    { sym: 'BTC-EUR',  name: 'Bitcoin' },
    { sym: 'ETH-EUR',  name: 'Ethereum' },
    { sym: 'GC=F',     name: 'Or' },
    { sym: 'SI=F',     name: 'Silver' },
  ];
  const el = document.getElementById('overviewIndices') || document.getElementById('newsIndices');
  if (!el) return;
  const pillsHTML = indices.map(i =>
    `<div class="index-pill">
      <div class="index-pill-name">${i.name}</div>
      <div class="index-pill-val" id="idx-${i.sym.replace(/[^a-zA-Z0-9]/g,'_')}">…</div>
    </div>`
  ).join('');
  el.innerHTML = pillsHTML;
  // Remplir le clone pour le défilement infini mobile
  const clone = document.getElementById('overviewIndicesClone');
  if (clone) clone.innerHTML = pillsHTML.replace(/id="idx-/g, 'id="idx-clone-');
  await MoumixCore.mapWithConcurrency(indices, 2, async idx => {
    try {
      const data = await yfFetch(`/v8/finance/chart/${encodeURIComponent(idx.sym)}?interval=1d&range=1d`);
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) return;
      const price = meta.regularMarketPrice;
      const prev  = meta.chartPreviousClose || meta.previousClose || price;
      const id    = 'idx-' + idx.sym.replace(/[^a-zA-Z0-9]/g,'_');
      const el2   = document.getElementById(id);
      if (el2) {
        const chg = ((price - prev) / prev * 100);
        const changeHtml = `<span style="font-size:0.62rem;color:${chg>=0?'var(--gain)':'var(--loss)'}">${chg>=0?'+':''}${chg.toFixed(2)}%</span>`;
        const priceStr = price > 1000 ? Math.round(price).toLocaleString('fr-FR') : price.toFixed(2);
        const valHTML = `<span style="font-size:0.75rem">${priceStr}</span> ${changeHtml}`;
        el2.innerHTML = valHTML;
        el2.classList.add('updated');
        setTimeout(() => el2.classList.remove('updated'), TIMING_INDEX_UPDATE);
        // Mettre à jour aussi le clone (défilement infini mobile)
        const el2c = document.getElementById('idx-clone-' + idx.sym.replace(/[^a-zA-Z0-9]/g,'_'));
        if (el2c) el2c.innerHTML = valHTML;
      }
    } catch(e) {}
  });
}

let _marketIndicesLoaded = false;
let _marketDetailsBound = false;
function prepareMarketIndices() {
  const details = document.querySelector('.market-details');
  if (!details) return;
  const loadOnce = () => {
    if (!details.open || _marketIndicesLoaded) return;
    _marketIndicesLoaded = true;
    loadNewsIndices().catch(error => {
      _marketIndicesLoaded = false;
      console.warn('[Moumix] repères de marché indisponibles:', error?.message || error);
    });
  };
  if (!_marketDetailsBound) {
    details.addEventListener('toggle', loadOnce);
    _marketDetailsBound = true;
  }
  loadOnce();
}

let simViewMode = window.innerWidth <= 768 ? 'table' : 'graph';
let simData = [];
let simDataPess = [];
let simDataOpti = [];

// Hypothèses indicatives, modifiables dans l'interface. Elles restent locales à
// la page : aucune valeur de simulation n'est écrite dans Supabase.
const SIM_DEFAULT_ASSUMPTIONS = Object.freeze({
  PEA:    { rate: 7, spread: 4 },
  CTO:    { rate: 7, spread: 4 },
  PEE:    { rate: 5, spread: 3 },
  PER:    { rate: 5, spread: 3 },
  AV:     { rate: 3, spread: 1.5 },
  Crypto: { rate: 8, spread: 10 },
  Livret: { rate: 2, spread: 1 },
  Immo:   { rate: 3, spread: 2 },
  Autre:  { rate: 0, spread: 1 },
});
const SIM_TYPE_LABELS = Object.freeze({
  PEA: 'PEA', CTO: 'CTO', PEE: 'Épargne salariale', PER: 'PER',
  AV: 'Assurance-vie', Crypto: 'Crypto', Livret: 'Livrets',
  Immo: 'Immobilier', Autre: 'Autre',
});
const SIM_TYPE_ORDER = Object.freeze(['PEA','CTO','PEE','PER','AV','Crypto','Livret','Immo','Autre']);
let simRateOverrides = {};
let _simControlsSignature = null;

function simFmt(n) { return _fmtEur0.format(n); }
function simPct(n) { return _fmtPct.format(n) + ' %'; }
function simSignedFmt(n) { return (n > 0 ? '+' : '') + simFmt(n); }
function simTypeLabel(type) { return SIM_TYPE_LABELS[type] || type || 'Autre'; }
function simDomKey(value) {
  return Array.from(String(value || 'Autre')).map(char => char.codePointAt(0).toString(36)).join('-');
}
function simAssumption(type) {
  const fallback = SIM_DEFAULT_ASSUMPTIONS[type] || { rate: 4, spread: 3 };
  const override = simRateOverrides[type];
  return { rate: Number.isFinite(override) ? override : fallback.rate, spread: fallback.spread };
}

function simGetPortfolioBuckets() {
  const grouped = new Map();
  const ensure = rawType => {
    const type = rawType || 'Autre';
    if (!grouped.has(type)) grouped.set(type, { type, label: simTypeLabel(type), value: 0, accountCount: 0, assetCount: 0 });
    return grouped.get(type);
  };

  accounts.forEach(account => {
    const bucket = ensure(account.type);
    bucket.accountCount += 1;
    if (FIXED_ACCOUNT_TYPES.has(account.type)) {
      const balance = Number(account.solde);
      if (Number.isFinite(balance)) bucket.value += balance;
      if (balance > 0) bucket.assetCount += 1;
    }
  });

  const accountsById = new Map(accounts.map(account => [account.id, account]));
  positions.forEach(position => {
    const account = accountsById.get(position.accountId);
    const bucket = ensure(account?.type || 'Autre');
    const value = Number(position.current) * Number(position.qty);
    if (Number.isFinite(value)) bucket.value += value;
    if (value > 0) bucket.assetCount += 1;
  });

  return [...grouped.values()]
    .map(bucket => ({ ...bucket, value: Math.max(0, bucket.value) }))
    .sort((a, b) => {
      const ai = SIM_TYPE_ORDER.indexOf(a.type), bi = SIM_TYPE_ORDER.indexOf(b.type);
      if (ai !== bi) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      return b.value - a.value;
    });
}

function simRenderPortfolioControls(buckets) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  const totalEl = document.getElementById('sim-source-total');
  const metaEl = document.getElementById('sim-source-meta');
  const typesEl = document.getElementById('sim-source-types');
  const emptyEl = document.getElementById('sim-source-empty');
  if (totalEl) totalEl.textContent = simFmt(total);
  if (metaEl) {
    const accountLabel = accounts.length === 1 ? 'compte' : 'comptes';
    const positionLabel = positions.length === 1 ? 'position' : 'positions';
    metaEl.textContent = `${accounts.length} ${accountLabel} · ${positions.length} ${positionLabel} · dernières valorisations disponibles`;
  }
  if (typesEl) {
    const valued = buckets.filter(bucket => bucket.value > 0.005);
    typesEl.innerHTML = valued.length
      ? valued.map(bucket => `<span class="sim-source-chip"><span>${_esc(bucket.label)}</span><strong>${simFmt(bucket.value)}</strong></span>`).join('')
      : '<span class="sim-source-chip">Aucun encours valorisé</span>';
  }
  if (emptyEl) {
    emptyEl.classList.toggle('hidden', total > 0);
    emptyEl.textContent = buckets.length
      ? 'Aucun encours n’est encore valorisé. Vous pouvez néanmoins simuler de futurs versements.'
      : 'Ajoutez au moins un compte ou une position pour obtenir une projection personnalisée.';
  }

  const signature = buckets.map(bucket => bucket.type).join('\u001f');
  const select = document.getElementById('sim-contribution-target');
  const settings = document.getElementById('sim-category-settings');
  if (signature !== _simControlsSignature) {
    const previousTarget = select?.value || 'allocation';
    if (select) {
      select.innerHTML = '<option value="allocation">Selon la répartition actuelle</option>' + buckets.map(bucket =>
        `<option value="${_esc(bucket.type)}">100 % vers ${_esc(bucket.label)}</option>`
      ).join('');
      select.value = buckets.some(bucket => bucket.type === previousTarget) || previousTarget === 'allocation'
        ? previousTarget : 'allocation';
    }
    if (settings) {
      settings.innerHTML = buckets.length ? buckets.map(bucket => {
        const assumption = simAssumption(bucket.type);
        const key = simDomKey(bucket.type);
        return `<div class="sim-category-row">
          <div class="sim-category-name">${_esc(bucket.label)}</div>
          <div class="sim-category-value" id="sim-category-value-${key}">${simFmt(bucket.value)}</div>
          <div class="sim-rate-wrap">
            <input class="sim-category-rate" id="sim-category-rate-${key}" type="number" min="-50" max="100" step="0.5"
              value="${assumption.rate}" data-sim-type="${_esc(bucket.type)}" aria-label="Rendement annuel ${_esc(bucket.label)}"
              oninput="simSetRate(this.dataset.simType,this.value)" onchange="simNormalizeRate(this)">
          </div>
        </div>`;
      }).join('') : '<div class="sim-help" style="padding-top:10px">Les hypothèses apparaîtront dès qu’un compte sera disponible.</div>';
    }
    _simControlsSignature = signature;
  } else {
    buckets.forEach(bucket => {
      const valueEl = document.getElementById('sim-category-value-' + simDomKey(bucket.type));
      if (valueEl) valueEl.textContent = simFmt(bucket.value);
    });
  }
  return total;
}

function simSetRate(type, rawValue) {
  const rate = Number.parseFloat(rawValue);
  if (!Number.isFinite(rate)) return;
  simRateOverrides[type] = Math.max(-50, Math.min(100, rate));
  simUpdate();
}

function simNormalizeRate(input) {
  const type = input?.dataset?.simType || 'Autre';
  const parsed = Number.parseFloat(input?.value);
  if (!Number.isFinite(parsed)) delete simRateOverrides[type];
  else simRateOverrides[type] = Math.max(-50, Math.min(100, parsed));
  if (input) input.value = simAssumption(type).rate;
  simUpdate();
}

function simResetRates() {
  simRateOverrides = {};
  simGetPortfolioBuckets().forEach(bucket => {
    const input = document.getElementById('sim-category-rate-' + simDomKey(bucket.type));
    if (input) input.value = simAssumption(bucket.type).rate;
  });
  simUpdate();
}

function simSetView(mode, btn) {
  simViewMode = mode;
  document.querySelectorAll('.sim-view-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('sim-graph-wrap').style.display = mode === 'graph' ? '' : 'none';
  if (mode === 'graph') requestAnimationFrame(() => simDrawChart());
  document.getElementById('sim-table-wrap').style.display = mode === 'table' ? '' : 'none';
  if (mode === 'table') simDrawTable();
}

function simContributionWeights(buckets, target) {
  const weights = new Map(buckets.map(bucket => [bucket.type, 0]));
  if (!buckets.length) return weights;
  const targetBucket = buckets.find(bucket => bucket.type === target);
  if (target !== 'allocation' && targetBucket) {
    weights.set(targetBucket.type, 1);
    return weights;
  }
  const total = buckets.reduce((sum, bucket) => sum + Math.max(0, bucket.value), 0);
  if (total > 0) buckets.forEach(bucket => weights.set(bucket.type, Math.max(0, bucket.value) / total));
  else buckets.forEach(bucket => weights.set(bucket.type, 1 / buckets.length));
  return weights;
}

function simScenarioRatePct(type, scenario) {
  const assumption = simAssumption(type);
  const delta = scenario === 'pess' ? -assumption.spread : scenario === 'opti' ? assumption.spread : 0;
  return Math.max(-95, Math.min(100, assumption.rate + delta));
}

function simWeightedRatePct(buckets, monthly, years, target, scenario) {
  if (!buckets.length) return 0;
  const weights = simContributionWeights(buckets, target);
  const futureContributions = monthly * 12 * years;
  let basisTotal = 0;
  let weightedTotal = 0;
  buckets.forEach(bucket => {
    // La moitié des versements futurs approxime leur exposition moyenne sur la période.
    const basis = bucket.value + futureContributions * (weights.get(bucket.type) || 0) / 2;
    basisTotal += basis;
    weightedTotal += basis * simScenarioRatePct(bucket.type, scenario);
  });
  return basisTotal > 0 ? weightedTotal / basisTotal : 0;
}

function simComputePortfolio(buckets, monthly, years, scenario, target) {
  const weights = simContributionWeights(buckets, target);
  return MoumixCore.computeProjection({
    buckets,
    monthly,
    years,
    annualRates: Object.fromEntries(buckets.map(bucket => [bucket.type, simScenarioRatePct(bucket.type, scenario)])),
    contributionWeights: Object.fromEntries(weights),
  });
}

let _simUpdateTimer = null;
function simUpdateDebounced() {
  clearTimeout(_simUpdateTimer);
  _simUpdateTimer = setTimeout(simUpdate, TIMING_SIM_DEBOUNCE);
}

function simUpdateContributionHint(buckets, target) {
  const hint = document.getElementById('sim-contribution-hint');
  if (!hint) return;
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  if (target === 'allocation') {
    hint.textContent = total > 0
      ? 'Chaque versement suivra la répartition actuelle du portefeuille.'
      : buckets.length
        ? 'Sans encours valorisé, les versements sont répartis à parts égales.'
        : 'Ajoutez un compte pour définir l’affectation des versements.';
  } else {
    const bucket = buckets.find(item => item.type === target);
    hint.textContent = bucket ? `Tous les nouveaux versements seront projetés vers ${bucket.label}.` : '';
  }
}

function simRenderScenario(prefix, result, weightedRate) {
  const totalEl = document.getElementById('sim-res-total-' + prefix);
  const interestEl = document.getElementById('sim-res-interest-' + prefix);
  const passiveEl = document.getElementById('sim-res-passive-' + prefix);
  const multEl = document.getElementById('sim-res-mult-' + prefix);
  const investedEl = document.getElementById('sim-res-invested-' + prefix);
  const rateEl = document.getElementById('sim-rate-' + prefix);
  if (rateEl) rateEl.textContent = '≈ ' + simPct(weightedRate);
  if (totalEl) totalEl.textContent = simFmt(result.final);
  if (interestEl) interestEl.textContent = simSignedFmt(result.totalInterest) + ' de rendement';
  if (passiveEl) passiveEl.textContent = simSignedFmt(result.monthlyGrowth) + '/mois';
  const multiplier = result.totalInvested > 0 ? result.final / result.totalInvested : 0;
  if (multEl) multEl.textContent = result.totalInvested > 0 ? '×' + multiplier.toFixed(2) + ' le capital investi' : '—';
  if (investedEl) investedEl.textContent = result.totalInvested > 0 ? simFmt(result.totalInvested) : '—';
}

function simRenderBreakdown(result) {
  const container = document.getElementById('sim-projected-breakdown');
  if (!container) return;
  if (!result.finalBreakdown.length) {
    container.innerHTML = '<div class="sim-help">La projection par catégorie apparaîtra ici.</div>';
    return;
  }
  container.innerHTML = result.finalBreakdown.map(item => {
    const delta = item.final - item.invested;
    return `<div class="sim-breakdown-item">
      <div class="sim-breakdown-head"><span>${_esc(item.label)}</span><span>${simPct(item.annualRate * 100)}</span></div>
      <div class="sim-breakdown-value">${simFmt(item.final)}</div>
      <div class="sim-breakdown-delta" style="color:${delta >= 0 ? 'var(--gain)' : 'var(--loss)'}">${simSignedFmt(delta)} de rendement</div>
    </div>`;
  }).join('');
}

function simUpdate() {
  const monthlyInput = document.getElementById('sim-monthly');
  const yearsInput = document.getElementById('sim-years');
  const monthly = Math.max(0, Math.min(100000, Number.parseFloat(monthlyInput?.value) || 0));
  const years = Math.max(1, Math.min(60, Number.parseInt(yearsInput?.value, 10) || 1));
  const buckets = simGetPortfolioBuckets();
  const initial = simRenderPortfolioControls(buckets);
  const target = document.getElementById('sim-contribution-target')?.value || 'allocation';
  simUpdateContributionHint(buckets, target);

  const ratePess = simWeightedRatePct(buckets, monthly, years, target, 'pess');
  const rateReal = simWeightedRatePct(buckets, monthly, years, target, 'real');
  const rateOpti = simWeightedRatePct(buckets, monthly, years, target, 'opti');
  const resPess = simComputePortfolio(buckets, monthly, years, 'pess', target);
  const resReal = simComputePortfolio(buckets, monthly, years, 'real', target);
  const resOpti = simComputePortfolio(buckets, monthly, years, 'opti', target);

  simData     = resReal.data;
  simDataPess = resPess.data;
  simDataOpti = resOpti.data;

  simRenderScenario('pess', resPess, ratePess);
  simRenderScenario('real', resReal, rateReal);
  simRenderScenario('opti', resOpti, rateOpti);
  const weightedEl = document.getElementById('sim-weighted-rate');
  if (weightedEl) weightedEl.textContent = '≈ ' + simPct(rateReal);

  // Jauge composition (réaliste)
  const { final, totalInvested, totalInterest } = resReal;
  const totalMonthly = totalInvested - initial;
  const positiveInterest = Math.max(0, totalInterest);
  const compositionBase = initial + totalMonthly + positiveInterest;
  const pInit = compositionBase > 0 ? initial / compositionBase * 100 : 0;
  const pMonthly = compositionBase > 0 ? totalMonthly / compositionBase * 100 : 0;
  const pInterest = compositionBase > 0 ? positiveInterest / compositionBase * 100 : 0;
  const barInitial = document.getElementById('sim-bar-initial');
  const barMonthly = document.getElementById('sim-bar-monthly');
  const barInterest = document.getElementById('sim-bar-interest');
  if (barInitial) { barInitial.style.flex = '0 0 auto'; barInitial.style.width = pInit + '%'; }
  if (barMonthly) { barMonthly.style.flex = '0 0 auto'; barMonthly.style.width = pMonthly + '%'; }
  if (barInterest) { barInterest.style.flex = '0 0 auto'; barInterest.style.width = pInterest + '%'; }
  document.getElementById('sim-legend-initial').textContent = simFmt(initial) + ' (' + pInit.toFixed(0) + '%)';
  document.getElementById('sim-legend-monthly').textContent = simFmt(totalMonthly) + ' (' + pMonthly.toFixed(0) + '%)';
  const interestLegend = document.getElementById('sim-legend-interest');
  if (interestLegend) {
    interestLegend.textContent = simSignedFmt(totalInterest) + ' (' + (totalInvested > 0 ? (totalInterest / totalInvested * 100).toFixed(0) : 0) + '%)';
    interestLegend.style.color = totalInterest >= 0 ? 'var(--gain)' : 'var(--loss)';
  }
  simRenderBreakdown(resReal);

  if (simViewMode === 'graph') simDrawChart();
  else simDrawTable();
}

// Applique la vue par défaut au premier rendu (mobile = tableau, desktop = graphique)
function _simApplyDefaultView() {
  const graphWrap = document.getElementById('sim-graph-wrap');
  const tableWrap = document.getElementById('sim-table-wrap');
  const btnGraph = document.getElementById('simViewGraph');
  const btnTable = document.getElementById('simViewTable');
  if (!graphWrap || !tableWrap) return;
  if (simViewMode === 'table') {
    graphWrap.style.display = 'none';
    tableWrap.style.display = '';
    if (btnGraph) btnGraph.classList.remove('active');
    if (btnTable) btnTable.classList.add('active');
  } else {
    graphWrap.style.display = '';
    tableWrap.style.display = 'none';
    if (btnGraph) btnGraph.classList.add('active');
    if (btnTable) btnTable.classList.remove('active');
  }
}

function simDrawChart() {
  const svg = document.getElementById('sim-svg');
  if (!svg || !simData.length) return;
  const wrap = document.getElementById('sim-graph-wrap');
  let W = (wrap && wrap.offsetWidth > 0) ? wrap.offsetWidth
        : (svg.parentElement && svg.parentElement.offsetWidth > 0) ? svg.parentElement.offsetWidth
        : 640;
  if (W <= 0) { requestAnimationFrame(() => simDrawChart()); return; }
  const H = 300;
  const pad = { top: 28, right: 24, bottom: 36, left: 72 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('height', H);
  svg.setAttribute('width', W);

  const allVals = [...simData, ...simDataPess, ...simDataOpti].map(d => d.capital);
  const maxVal = Math.max(...allVals);
  const minVal = 0;
  const range = maxVal - minVal || 1;
  const n = simData.length;

  const xScale = i => pad.left + (i / (n - 1)) * (W - pad.left - pad.right);
  const yScale = v => pad.top + (1 - (v - minVal) / range) * (H - pad.top - pad.bottom);

  const pathD = arr => {
    return arr.map((d, i) => {
      const x = xScale(i), y = yScale(d.capital);
      if (i === 0) return `M${x},${y}`;
      const px = xScale(i - 1), py = yScale(arr[i-1].capital);
      const cx = (px + x) / 2;
      return `C${cx},${py} ${cx},${y} ${x},${y}`;
    }).join(' ');
  };

  const areaD = (arr) => {
    const baseY = yScale(0);
    const firstX = xScale(0), lastX = xScale(n - 1);
    const line = pathD(arr);
    return `${line} L${lastX},${baseY} L${firstX},${baseY} Z`;
  };

  const investedPts = simData.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(d.invested)}`).join(' ');

  const uid = 'sg' + (Date.now() % 99999);

  // Y grid + labels
  const yTicks = 5;
  const simCompact = W < 420;
  function fmtY(v) {
    if (simCompact) {
      if (v >= 1e6) return (v/1e6).toFixed(1) + 'M';
      if (v >= 1e3) return (v/1e3).toFixed(0) + 'k';
      return Math.round(v) + '';
    }
    if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
    if (v >= 1e3) return Math.round(v/1e3) + '\u202fk';
    return Math.round(v) + '';
  }

  const yGrid = Array.from({length: yTicks}, (_, i) => {
    const v = minVal + (range * i / (yTicks - 1));
    const y = yScale(v);
    return `
      <line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}"
        stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
      <text x="${pad.left - 10}" y="${y + 4}" font-size="10"
        fill="rgba(90,100,130,0.85)" text-anchor="end"
        font-family="DM Mono,monospace" font-weight="400">${fmtY(v)}</text>`;
  }).join('');

  // X labels
  const xStep = n <= 11 ? 1 : n <= 21 ? 5 : 10;
  const xLabels = simData
    .filter((d, i) => i % xStep === 0 || i === n - 1)
    .map(d => {
      const x = xScale(d.year);
      return `<text x="${x}" y="${H - 8}" font-size="10" fill="rgba(90,100,130,0.8)"
        text-anchor="middle" font-family="DM Mono,monospace">${d.year}a</text>`;
    }).join('');

  // Hover zones (invisible rects per year)
  const colW = (W - pad.left - pad.right) / (n - 1);
  const hoverRects = simData.map((d, i) => {
    const x = xScale(i);
    const pv = (simDataPess[i]?.capital || 0).toFixed(0);
    const rv = d.capital.toFixed(0);
    const ov = (simDataOpti[i]?.capital || 0).toFixed(0);
    const inv = d.invested.toFixed(0);
    return `<rect x="${x - colW/2}" y="${pad.top}" width="${colW}" height="${H - pad.top - pad.bottom}"
      fill="transparent" style="cursor:crosshair"
      data-year="${d.year}" data-pess="${pv}" data-real="${rv}" data-opti="${ov}" data-inv="${inv}"
      onmouseover="simTooltip3(event,${d.year},${pv},${rv},${ov},${inv})"
      onmouseout="simHideTooltip()"/>`;
  }).join('');

  svg.innerHTML = `
    <defs>
      <!-- Optimiste gradient -->
      <linearGradient id="gOpti${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#c27aff" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#c27aff" stop-opacity="0"/>
      </linearGradient>
      <!-- Réaliste gradient -->
      <linearGradient id="gReal${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#00e5a0" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#00e5a0" stop-opacity="0"/>
      </linearGradient>
      <!-- Pessimiste gradient -->
      <linearGradient id="gPess${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ff7070" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#ff7070" stop-opacity="0"/>
      </linearGradient>
      <!-- Glow filters -->
      <filter id="glowGreen${uid}" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="glowPurple${uid}" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    ${yGrid}${xLabels}

    <!-- Areas -->
    <path d="${areaD(simDataOpti)}" fill="url(#gOpti${uid})" stroke="none"/>
    <path d="${areaD(simData)}"     fill="url(#gReal${uid})" stroke="none"/>
    <path d="${areaD(simDataPess)}" fill="url(#gPess${uid})" stroke="none"/>

    <!-- Investi dashed line -->
    <path d="${investedPts}" fill="none" stroke="#3a7bd5" stroke-width="1.5"
      stroke-dasharray="4,4" opacity="0.45"/>

    <!-- Scenario lines -->
    <path d="${pathD(simDataPess)}" fill="none" stroke="#ff7070" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>
    <path d="${pathD(simDataOpti)}" fill="none" stroke="#c27aff" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" opacity="0.85"
      filter="url(#glowPurple${uid})"/>
    <path d="${pathD(simData)}" fill="none" stroke="#00e5a0" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round"
      filter="url(#glowGreen${uid})"/>

    <!-- Crosshair group -->
    <g id="sim-crosshair" style="pointer-events:none;opacity:0;transition:opacity 0.1s">
      <!-- vertical line -->
      <line id="sim-ch-line" x1="0" y1="${pad.top}" x2="0" y2="${H - pad.bottom}"
        stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="2,3"/>
      <!-- horizontal band (subtle) -->
      <!-- dots -->
      <circle id="sim-ch-pess" cx="0" cy="0" r="4" fill="#ff7070"
        stroke="rgba(13,17,25,0.9)" stroke-width="2.5"/>
      <circle id="sim-ch-real" cx="0" cy="0" r="5.5" fill="#00e5a0"
        stroke="rgba(13,17,25,0.9)" stroke-width="2.5"/>
      <circle id="sim-ch-opti" cx="0" cy="0" r="4" fill="#c27aff"
        stroke="rgba(13,17,25,0.9)" stroke-width="2.5"/>
      <!-- outer glow rings -->
      <circle id="sim-ch-real-glow" cx="0" cy="0" r="9" fill="none"
        stroke="#00e5a0" stroke-width="1" opacity="0.3"/>
    </g>

    <!-- Hover rects (on top) -->
    ${hoverRects}
  `;

  svg._simMeta = { xScale, yScale, pad, H }; // simData* sont des globaux, inutile de les dupliquer
}

function simHideTooltip() {
  const tt = document.getElementById('sim-tooltip');
  const ch = document.getElementById('sim-crosshair');
  tt.classList.remove('visible');
  if (ch) ch.style.opacity = '0';
}

function simTooltip3(e, year, pess, real, opti, invested) {
  const tt = document.getElementById('sim-tooltip');
  const svgEl = document.getElementById('sim-svg');
  const svgRect = svgEl.getBoundingClientRect();
  const relX = e.clientX - svgRect.left;
  const relY = e.clientY - svgRect.top;

  document.getElementById('sim-tt-year').textContent =
    year === 0 ? 'Aujourd\'hui' : year === 1 ? 'Année 1' : 'Année ' + year;

  // Update crosshair
  const meta = svgEl._simMeta;
  if (meta) {
    const idx = year;
    const xPos = meta.xScale(idx);
    const yPess = meta.yScale(simDataPess[idx]?.capital || 0);
    const yReal = meta.yScale(simData[idx]?.capital || 0);
    const yOpti = meta.yScale(simDataOpti[idx]?.capital || 0);
    const ch = document.getElementById('sim-crosshair');
    if (ch) {
      ch.style.opacity = '1';
      const chLine = document.getElementById('sim-ch-line');
      chLine.setAttribute('x1', xPos); chLine.setAttribute('x2', xPos);
      const chPess = document.getElementById('sim-ch-pess');
      chPess.setAttribute('cx', xPos); chPess.setAttribute('cy', yPess);
      const chReal = document.getElementById('sim-ch-real');
      chReal.setAttribute('cx', xPos); chReal.setAttribute('cy', yReal);
      const chOpti = document.getElementById('sim-ch-opti');
      chOpti.setAttribute('cx', xPos); chOpti.setAttribute('cy', yOpti);
      const glowR = document.getElementById('sim-ch-real-glow');
      if (glowR) { glowR.setAttribute('cx', xPos); glowR.setAttribute('cy', yReal); }
    }
  }

  // Render tooltip body
  const gain = real - invested;
  const gainPct = invested > 0 ? (gain / invested * 100).toFixed(0) : 0;
  document.getElementById('sim-tt-body').innerHTML = `
    <div class="sim-tt-row">
      <span class="sim-tt-label"><span class="sim-tt-dot" style="background:#c27aff;box-shadow:0 0 6px #c27aff"></span>Favorable</span>
      <span class="sim-tt-val" style="color:#c27aff">${simFmt(opti)}</span>
    </div>
    <div class="sim-tt-row">
      <span class="sim-tt-label"><span class="sim-tt-dot" style="background:#00e5a0;box-shadow:0 0 6px #00e5a0"></span>Réaliste</span>
      <span class="sim-tt-val" style="color:#00e5a0">${simFmt(real)}</span>
    </div>
    <div class="sim-tt-row">
      <span class="sim-tt-label"><span class="sim-tt-dot" style="background:#ff7070"></span>Prudent</span>
      <span class="sim-tt-val" style="color:#ff7070">${simFmt(pess)}</span>
    </div>
    <div class="sim-tt-divider"></div>
    <div class="sim-tt-row">
      <span class="sim-tt-label"><span class="sim-tt-dot" style="background:#3a7bd5;border-radius:2px"></span>Investi</span>
      <span class="sim-tt-val" style="color:#7baee8">${simFmt(invested)}</span>
    </div>
    ${year > 0 ? `<div class="sim-tt-row" style="margin-top:1px">
      <span class="sim-tt-label" style="font-size:0.62rem;opacity:0.6">Plus-value</span>
      <span style="font-size:0.7rem;font-weight:600;color:${gain>=0?'#00e5a0':'#ff7070'}">${gain>=0?'+':''}${simFmt(gain)} (${gain>=0?'+':''}${gainPct}%)</span>
    </div>` : ''}
  `;

  tt.classList.add('visible');

  // Smart positioning
  requestAnimationFrame(() => {
    const ttW = tt.offsetWidth || 172;
    const ttH = tt.offsetHeight || 120;
    const margin = 12;
    let left = relX + margin;
    let top = relY - ttH - margin;
    if (left + ttW > svgRect.width - 4) left = relX - ttW - margin;
    if (top < 4) top = relY + margin;
    tt.style.left = Math.max(4, left) + 'px';
    tt.style.top  = Math.max(4, top)  + 'px';
  });
}


let simTableScenario = 'real'; // 'pess' | 'real' | 'opti'

function simSetTableScenario(scen, btn) {
  simTableScenario = scen;
  document.querySelectorAll('.sim-scen-btn').forEach(b => {
    const isActive = b.dataset.scen === scen;
    b.classList.toggle('active-scen', isActive);
    b.style.fontWeight = isActive ? '600' : '400';
    // Garder la bordure/bg colorée mais renforcer quand actif
    if (b.dataset.scen === 'pess') {
      b.style.background = isActive ? 'rgba(255,112,112,0.18)' : 'rgba(255,112,112,0.08)';
      b.style.borderColor = isActive ? '#ff7070' : 'rgba(255,112,112,0.35)';
    } else if (b.dataset.scen === 'real') {
      b.style.background = isActive ? 'rgba(0,229,160,0.18)' : 'rgba(0,229,160,0.08)';
      b.style.borderColor = isActive ? 'var(--accent)' : 'rgba(0,229,160,0.35)';
    } else {
      b.style.background = isActive ? 'rgba(194,122,255,0.18)' : 'rgba(194,122,255,0.08)';
      b.style.borderColor = isActive ? '#c27aff' : 'rgba(194,122,255,0.35)';
    }
  });
  simDrawTable();
}

function simDrawTable() {
  const tbody = document.getElementById('sim-table-body');
  if (!simData.length) return;
  const isMobile = window.innerWidth <= 768;

  // Affiche/cache le switch scénario mobile
  const switchEl = document.getElementById('sim-table-scenario-switch');
  if (switchEl) switchEl.style.display = isMobile ? 'flex' : 'none';

  const thead = tbody.closest('table').querySelector('thead tr');

  if (isMobile) {
    // En mobile : 3 colonnes seulement — Année, Investi, + le scénario actif
    const scenConf = {
      pess: { label: 'Prudent',    color: '#ff7070' },
      real: { label: 'Réaliste',   color: 'var(--accent)' },
      opti: { label: 'Favorable',  color: '#c27aff' },
    }[simTableScenario];
    thead.innerHTML = `
      <th class="sim-th sim-th-left">Année</th>
      <th class="sim-th sim-th-right">Investi</th>
      <th style="padding:8px 12px;text-align:right;color:${scenConf.color};font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid var(--border);font-weight:400">${scenConf.label}</th>
    `;
    tbody.innerHTML = simData.map((d, i) => {
      const dp = simDataPess[i], do_ = simDataOpti[i];
      if (!dp || !do_) return '';
      const highlight = d.year % 10 === 0 && d.year > 0;
      const scenVal = simTableScenario === 'pess' ? dp.capital : simTableScenario === 'opti' ? do_.capital : d.capital;
      const scenColor = simTableScenario === 'pess' ? '#ff7070' : simTableScenario === 'opti' ? '#c27aff' : 'var(--text)';
      const scenWeight = simTableScenario === 'real' ? '600' : '400';
      return `<tr style="background:${highlight ? 'rgba(0,229,160,0.04)' : (i%2===0?'transparent':'rgba(255,255,255,0.01)')}">
        <td style="padding:8px 12px;font-weight:${highlight?700:400}">${d.year === 0 ? 'Départ' : 'An ' + d.year}</td>
        <td style="padding:8px 12px;text-align:right;font-family:'DM Mono',monospace;color:var(--muted)">${simFmt(d.invested)}</td>
        <td style="padding:8px 12px;text-align:right;font-family:'DM Mono',monospace;color:${scenColor};font-weight:${scenWeight}">${simFmt(scenVal)}</td>
      </tr>`;
    }).join('');
  } else {
    // Desktop : tableau complet 5 colonnes
    thead.innerHTML = `
      <th class="sim-th sim-th-left">Année</th>
      <th class="sim-th sim-th-right">Investi</th>
      <th style="padding:8px 12px;text-align:right;color:#ff7070;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid var(--border);font-weight:400">Prudent</th>
      <th style="padding:8px 12px;text-align:right;color:var(--accent);font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid var(--border);font-weight:400">Réaliste</th>
      <th style="padding:8px 12px;text-align:right;color:#c27aff;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;border-bottom:1px solid var(--border);font-weight:400">Favorable</th>
    `;
    tbody.innerHTML = simData.map((d, i) => {
      const dp = simDataPess[i], do_ = simDataOpti[i];
      if (!dp || !do_) return '';
      const highlight = d.year % 10 === 0 && d.year > 0;
      return `<tr style="background:${highlight ? 'rgba(0,229,160,0.04)' : (i%2===0?'transparent':'rgba(255,255,255,0.01)')}">
        <td style="padding:8px 12px;font-weight:${highlight?700:400}">${d.year === 0 ? 'Départ' : 'An ' + d.year}</td>
        <td style="padding:8px 12px;text-align:right;font-family:'DM Mono',monospace;color:var(--muted)">${simFmt(d.invested)}</td>
        <td style="padding:8px 12px;text-align:right;font-family:'DM Mono',monospace;color:#ff7070">${simFmt(dp.capital)}</td>
        <td style="padding:8px 12px;text-align:right;font-family:'DM Mono',monospace;font-weight:600">${simFmt(d.capital)}</td>
        <td style="padding:8px 12px;text-align:right;font-family:'DM Mono',monospace;color:#c27aff">${simFmt(do_.capital)}</td>
      </tr>`;
    }).join('');
  }
}

// ─── TRI POSITIONS ────────────────────────────────────────────────────────────
let posSort = { key: null, asc: false };
function sortPositions(key) {
  posSort.asc = posSort.key === key ? !posSort.asc : false;
  posSort.key = key;
  document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '');
  document.querySelectorAll('th.sortable').forEach(el => el.classList.remove('sorted'));
  const iconEl = document.getElementById('sort-' + key);
  if (iconEl) { iconEl.textContent = posSort.asc ? '↑' : '↓'; iconEl.closest('th').classList.add('sorted'); }
  renderPositions();
}
function getSortedPositions() {
  if (!posSort.key) return positions;
  return [...positions].sort((a, b) => {
    let va, vb;
    if (posSort.key === 'qty')     { va = a.qty; vb = b.qty; }
    else if (posSort.key === 'current') { va = a.current; vb = b.current; }
    else if (posSort.key === 'value')   { va = a.current*a.qty; vb = b.current*b.qty; }
    else if (posSort.key === 'pnl')     { va = a.price>0?(a.current-a.price)*a.qty:-Infinity; vb = b.price>0?(b.current-b.price)*b.qty:-Infinity; }
    else if (posSort.key === 'pct')     { va = a.price>0?(a.current-a.price)/a.price:-Infinity; vb = b.price>0?(b.current-b.price)/b.price:-Infinity; }
    return posSort.asc ? va-vb : vb-va;
  });
}
// ─── EDIT POSITION ────────────────────────────────────────────────────────────
let editingPositionId = null;

function openEditPosition(id) {
  const p = positions.find(p => p.id === id);
  if (!p) return;
  editingPositionId = id;
  document.getElementById('editPosTitle').textContent = p.symbol + (p.name ? ' — ' + p.name : '');
  document.getElementById('editPosSubtitle').textContent = getAccountName(p.accountId);
  document.getElementById('edit-pos-qty').value = p.qty;
  document.getElementById('edit-pos-price').value = p.price > 0 ? p.price : '';
  showDialog(document.getElementById('editPositionModal'), '#edit-pos-qty');
}

function closeEditPosition() {
  editingPositionId = null;
  hideDialog(document.getElementById('editPositionModal'));
}

async function confirmEditPosition() {
  const p = positions.find(p => p.id === editingPositionId);
  if (!p) return;
  const qty = parseFloat(document.getElementById('edit-pos-qty').value);
  const price = parseFloat(document.getElementById('edit-pos-price').value) || 0;
  if (!qty || qty <= 0) { showToast('Saisissez une quantité positive.', 'error'); return; }
  const btn = document.getElementById('editPositionSaveBtn');
  btn.disabled = true;
  const oldQty = p.qty, oldPrice = p.price;
  p.qty = parseFloat(qty.toFixed(8));
  p.price = parseFloat(price.toFixed(10));
  const accName = getAccountName(p.accountId);
  const tx = { id: crypto.randomUUID(), type: 'edit', symbol: p.symbol, name: p.name, qty: p.qty, price: p.price, oldQty, oldPrice, accountName: accName, ts: Date.now() };
  let positionSaved = false;
  let usedAtomicTrade = false;
  try {
    usedAtomicTrade = await tryAtomicTrade(p, tx, false);
    if (!usedAtomicTrade) {
      await savePosition(p);
      positionSaved = true;
      await saveTransaction(tx);
    }
  } catch(e) {
    console.error('[Moumix] confirmEditPosition error:', e);
    p.qty = oldQty; p.price = oldPrice;
    if (!usedAtomicTrade && positionSaved) {
      try { await savePosition(p); }
      catch(rollbackError) {
        console.error('[Moumix] rollback modification impossible:', rollbackError);
        showToast('Échec du rétablissement automatique : rechargez la page.', 'error');
      }
    }
    showToast('Erreur sauvegarde modification.', 'error');
    btn.disabled = false;
    return;
  }
  transactions.unshift(tx); if (transactions.length > 500) transactions.length = 500;
  btn.disabled = false;
  closeEditPosition();
  renderPositions(); renderAllocation(); renderByAccount(); renderSummary();
  refreshProjectionIfActive();
  showToast('✅ Position mise à jour', 'success');
}

// ─── PWA ────────────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      location.reload();
    });
    navigator.serviceWorker.register('./sw.js').then(registration => {
      const offerUpdate = worker => {
        if (!navigator.serviceWorker.controller || !worker) return;
        showAppUpdatePrompt(() => worker.postMessage({ type: 'SKIP_WAITING' }));
      };
      if (registration.waiting) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') offerUpdate(worker);
        });
      });
      setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(error => console.warn('[Moumix] Service worker indisponible:', error));
  });
}

function showAppUpdatePrompt(onUpdate) {
  if (document.getElementById('appUpdatePrompt')) return;
  const prompt = document.createElement('div');
  prompt.id = 'appUpdatePrompt';
  prompt.className = 'app-update-prompt';
  prompt.setAttribute('role', 'status');
  prompt.innerHTML = `<span>Une nouvelle version de Moumix Finance est prête.</span>
    <button type="button" class="btn btn-sm btn-primary">Mettre à jour</button>`;
  prompt.querySelector('button').addEventListener('click', () => {
    prompt.querySelector('button').disabled = true;
    prompt.querySelector('button').textContent = 'Mise à jour…';
    onUpdate();
  });
  document.body.appendChild(prompt);
}

// ─── App namespace (optional) ───────────────────────────────────────────────
window.App = window.App || {};
window.App.authRecoveryVersion = '2026-08-28.1';
for (const k of ['openMobileActions', 'closeMobileActions', 'runMobileAction']) {
  window.App[k] = window[k];
}
for (const k of ['addAccount', 'cancelAddPrel', 'cancelLivretEdit', 'closeEditPosition', 'closeGoalModal', 'closeModal', 'confirmAddPrel', 'confirmEditPosition', 'confirmEditPrel', 'confirmLivretSolde', 'confirmPosition', 'deleteAccount', 'deleteGoal', 'deletePosition', 'deletePrel', 'dogClick', 'editGoal', 'editLivretSolde', 'editPrel', 'exportDataBackup', 'openAddGoal', 'openAddPrel', 'openEditPosition', 'openModal', 'refreshAllPrices', 'renderPrelevements', 'saveGoal', 'selectGoalEmoji', 'selectTickerByIndex', 'setChartPeriod', 'setPosSide', 'signOut', 'simNormalizeRate', 'simResetRates', 'simSetView', 'sortPositions', 'switchPosTab', 'switchTab', 'toggleAll', 'toggleType', 'toggleUserMenu']) {
  if (typeof window[k] === 'function') window.App[k] = window[k];
}

// ─── IMPORT HISTORIQUE ────────────────────────────────────────────────────────

let hiCurrentTab = 1;
let hiParsedRows = []; // { date, value } utilisé depuis onglet 2

function openHistoryImport() {
  // Pré-remplir avec des lignes vides si rien
  const rowsDiv = document.getElementById('hiRows');
  if (!rowsDiv.children.length) {
    for (let i = 0; i < 3; i++) addHiRow();
  }
  document.getElementById('hiStatus').textContent = '';
  showDialog(document.getElementById('historyImportModal'), '.hi-date');
}

function closeHistoryImport() {
  hideDialog(document.getElementById('historyImportModal'));
}

function switchHiTab(n) {
  hiCurrentTab = n;
  document.getElementById('hiPanel1').style.display = n === 1 ? '' : 'none';
  document.getElementById('hiPanel2').style.display = n === 2 ? '' : 'none';
  document.getElementById('hiTab1').style.background = n === 1 ? 'var(--surface2)' : 'none';
  document.getElementById('hiTab1').style.color = n === 1 ? 'var(--text)' : 'var(--muted)';
  document.getElementById('hiTab2').style.background = n === 2 ? 'var(--surface2)' : 'none';
  document.getElementById('hiTab2').style.color = n === 2 ? 'var(--text)' : 'var(--muted)';
}

function addHiRow(dateVal = '', valueVal = '') {
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:center;margin-bottom:6px';
  div.innerHTML = `
    <input type="date" class="hi-date" value="${dateVal}" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--text);font-family:'Inter',sans-serif;font-size:0.82rem;outline:none">
    <input type="number" class="hi-val" placeholder="ex: 42730.20" value="${valueVal}" step="0.01" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--text);font-family:'DM Mono',monospace;font-size:0.82rem;outline:none">
    <button onclick="this.parentElement.remove()" class="del-btn" title="Supprimer" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:1rem;padding:4px 6px">✕</button>
  `;
  document.getElementById('hiRows').appendChild(div);
}

function splitHistoryLine(line) {
  const trimmed = line.trim();
  const strongDelimiter = trimmed.search(/[\t;]/);
  if (strongDelimiter >= 0) {
    return [trimmed.slice(0, strongDelimiter).trim(), trimmed.slice(strongDelimiter + 1).trim()];
  }

  // Extraire d'abord la date afin de ne jamais confondre la virgule décimale
  // du montant avec le séparateur de colonnes.
  const datePrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}|\d{1,2}[\/-]\d{4}|[a-zéèêëàâäùûüîïôöç.]+[.\-\s]+\d{2,4})/i);
  if (!datePrefix) return null;
  let amount = trimmed.slice(datePrefix[0].length).trim();
  if (amount.startsWith(',')) amount = amount.slice(1).trim();
  if (!amount) return null;
  return [datePrefix[0].trim(), amount];
}

function parseLocaleAmount(raw) {
  let value = String(raw ?? '')
    .replace(/[€$£]/g, '')
    .replace(/[\s\u00a0\u202f']/g, '')
    .replace(/[^0-9,\.\-+]/g, '');
  if (!value) return NaN;

  const commaCount = (value.match(/,/g) || []).length;
  const dotCount = (value.match(/\./g) || []).length;
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');

  if (commaCount && dotCount) {
    if (lastComma > lastDot) value = value.replace(/\./g, '').replace(',', '.');
    else value = value.replace(/,/g, '');
  } else if (commaCount > 1) {
    const decimals = value.length - lastComma - 1;
    value = decimals <= 2
      ? value.slice(0, lastComma).replace(/,/g, '') + '.' + value.slice(lastComma + 1)
      : value.replace(/,/g, '');
  } else if (commaCount === 1) {
    value = value.replace(',', '.');
  } else if (dotCount > 1) {
    const decimals = value.length - lastDot - 1;
    value = decimals <= 2
      ? value.slice(0, lastDot).replace(/\./g, '') + '.' + value.slice(lastDot + 1)
      : value.replace(/\./g, '');
  }

  return Number(value);
}

function parseHiPaste() {
  const raw = document.getElementById('hiPaste').value.trim();
  if (!raw) return;
  hiParsedRows = [];
  const lines = raw.split('\n');
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = splitHistoryLine(line);
    if (!parts) { errors.push(`Ligne ${i+1}: format invalide`); continue; }

    // Detect date (try YYYY-MM-DD, MM/YYYY, MM-YYYY, "mai-25" style)
    let dateStr = parts[0];
    let parsedDate = parseFlexDate(dateStr);
    if (!parsedDate) { errors.push(`Ligne ${i+1}: date non reconnue (${dateStr})`); continue; }

    const valStr = parts[1];
    const val = parseLocaleAmount(valStr);
    if (!Number.isFinite(val) || val <= 0) { errors.push(`Ligne ${i+1}: montant invalide (${valStr})`); continue; }

    hiParsedRows.push({ date: parsedDate, value: val });
  }

  // Show preview
  const preview = document.getElementById('hiPastePreview');
  const countEl = document.getElementById('hiPasteCount');
  const tableEl = document.getElementById('hiPasteTable');
  preview.style.display = '';
  countEl.textContent = `${hiParsedRows.length} entrée(s) détectée(s)${errors.length ? ` — ⚠️ ${errors.length} ligne(s) ignorée(s)` : ' ✓'}`;
  if (errors.length) countEl.textContent += ' : ' + errors.join(', ');

  if (hiParsedRows.length) {
    tableEl.innerHTML = `<table style="width:100%;font-size:0.75rem;border-collapse:collapse">
      <tr><th style="text-align:left;padding:4px 8px;color:var(--muted);font-weight:400;border-bottom:1px solid var(--border)">Date</th><th style="text-align:right;padding:4px 8px;color:var(--muted);font-weight:400;border-bottom:1px solid var(--border)">Total</th></tr>
      ${hiParsedRows.map(r => `<tr><td style="padding:4px 8px;font-family:'DM Mono',monospace">${r.date}</td><td style="text-align:right;padding:4px 8px;font-family:'DM Mono',monospace;color:var(--gain)">${r.value.toLocaleString('fr-FR', {minimumFractionDigits:2})} €</td></tr>`).join('')}
    </table>`;
  }
}

function parseFlexDate(s) {
  s = s.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // MM/YYYY or MM-YYYY → use 1st of month
  m = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2,'0')}-01`;
  // "mai-25", "juin-25", "juil.-25", "août-25" etc.
  const frMonths = {jan:1,fév:2,feb:2,mar:3,'avr':4,apr:4,mai:5,may:5,jun:6,'juin':6,
    jul:7,'juil':7,août:8,aug:8,sep:9,oct:10,nov:11,déc:12,dec:12};
  m = s.toLowerCase().match(/^([a-zéûî\.]+)[.\-\s]+(\d{2,4})$/);
  if (m) {
    const key = m[1].replace('.','');
    const mo = frMonths[key] || frMonths[key.slice(0,3)];
    if (mo) {
      let yr = parseInt(m[2]);
      if (yr < 100) yr += 2000;
      return `${yr}-${String(mo).padStart(2,'0')}-01`;
    }
  }
  return null;
}

async function saveHistoryImport() {
  if (!currentUser) { showToast('Vous devez être connecté.', 'error'); return; }
  const btn = document.getElementById('hiSaveBtn');
  const statusEl = document.getElementById('hiStatus');
  btn.disabled = true;
  statusEl.style.color = 'var(--muted)';
  statusEl.textContent = '⏳ Enregistrement en cours...';

  let rows = [];

  if (hiCurrentTab === 1) {
    // Collect from manual rows
    document.querySelectorAll('#hiRows > div').forEach(row => {
      const d = row.querySelector('.hi-date')?.value;
      const v = parseFloat(row.querySelector('.hi-val')?.value);
      if (d && !isNaN(v) && v > 0) rows.push({ date: d, value: v });
    });
  } else {
    rows = [...hiParsedRows];
  }

  if (!rows.length) {
    statusEl.style.color = 'var(--loss)';
    statusEl.textContent = '⚠️ Aucune donnée valide à enregistrer.';
    btn.disabled = false;
    return;
  }

  // Deduplicate by date (keep last)
  const byDate = {};
  rows.forEach(r => { byDate[r.date] = r.value; });
  const toUpsert = Object.entries(byDate).map(([date, value]) => ({
    user_id: currentUser.id, date, value
  }));
  const replacedDates = toUpsert.filter(row => patrimoineHistory.some(item => item.date === row.date));
  if (replacedDates.length > 0 && !await appConfirm(
    `${replacedDates.length} date(s) existent déjà et seront remplacées. Continuer ?`,
    { title: 'Remplacer les dates existantes', confirmLabel: 'Remplacer' }
  )) {
    statusEl.style.color = 'var(--muted)';
    statusEl.textContent = 'Import annulé — aucune donnée modifiée.';
    btn.disabled = false;
    return;
  }

  try {
    const { error } = await sb.from('patrimoine_history').upsert(toUpsert, { onConflict: 'user_id,date' });
    if (error) throw error;

    // Update local state
    toUpsert.forEach(({ date, value }) => {
      const idx = patrimoineHistory.findIndex(h => h.date === date);
      if (idx >= 0) patrimoineHistory[idx].value = value;
      else patrimoineHistory.push({ date, value });
    });
    patrimoineHistory.sort((a, b) => a.date.localeCompare(b.date));
    renderChart();

    statusEl.style.color = 'var(--gain)';
    statusEl.textContent = `✓ ${toUpsert.length} entrée(s) enregistrée(s) avec succès !`;
    setTimeout(() => closeHistoryImport(), TIMING_HISTORY_CLOSE);
  } catch (err) {
    statusEl.style.color = 'var(--loss)';
    statusEl.textContent = '✗ Erreur : ' + (err.message || err);
  }
  btn.disabled = false;
}
