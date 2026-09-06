// Snapshot quotidien du patrimoine, enregistré dans patrimoine_history.
// Les cours Yahoo Finance sont convertis en EUR et aucun total partiel n'est
// écrit si une cotation ou un taux de change manque.

import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.SUPA_URL;
const SUPA_KEY = process.env.SUPA_KEY;
const USER_IDS = (process.env.USER_IDS || process.env.SNAPSHOT_USER_IDS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const YF_WORKER = 'https://yf-proxy.viqmusic-promo.workers.dev';
const YF_BASE = 'https://query1.finance.yahoo.com';
const FIXED_ACCOUNT_TYPES = new Set(['Livret', 'Immo', 'Autre']);
const FETCH_TIMEOUT_MS = 8000;
const FETCH_ATTEMPTS = 3;

function parisDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: values.hour
  };
}

const parisNow = parisDateTime();
const today = parisNow.date;

if (!SUPA_URL || !SUPA_KEY) {
  console.error('SUPA_URL ou SUPA_KEY manquant');
  process.exit(1);
}
if (USER_IDS.length === 0) {
  console.error('SNAPSHOT_USER_IDS (ou USER_IDS) manquant ou vide');
  process.exit(1);
}

// Le workflow est déclenché à 22 h et 23 h UTC pour couvrir heure d'été et
// heure d'hiver. Une seule exécution correspond à minuit à Paris.
if (process.env.GITHUB_EVENT_NAME === 'schedule' && parisNow.hour !== '00') {
  console.log(`Exécution ignorée : il est ${parisNow.hour} h à Paris.`);
  process.exit(0);
}

const sb = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchYahoo(path) {
  const target = YF_BASE + path;
  let lastError;

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${YF_WORKER}?url=${encodeURIComponent(target)}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS) await wait(400 * attempt);
    }
  }

  throw lastError || new Error('Yahoo Finance indisponible');
}

async function fetchQuote(symbol) {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const data = await fetchYahoo(path);
  const result = data?.chart?.result?.[0];
  const meta = result?.meta || {};
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const fallbackClose = [...closes].reverse().find(value => Number.isFinite(value));
  const price = Number(meta.regularMarketPrice ?? fallbackClose);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`prix introuvable pour ${symbol}`);
  }
  if (!meta.currency) {
    throw new Error(`devise introuvable pour ${symbol}`);
  }

  return { price, currency: meta.currency };
}

const fxCache = new Map([['EUR', 1]]);

async function fxToEur(currency) {
  const baseCurrency = String(currency || 'EUR').toUpperCase();
  if (fxCache.has(baseCurrency)) return fxCache.get(baseCurrency);

  const quote = await fetchQuote(`${baseCurrency}EUR=X`);
  if (!Number.isFinite(quote.price) || quote.price <= 0) {
    throw new Error(`taux ${baseCurrency}/EUR introuvable`);
  }
  fxCache.set(baseCurrency, quote.price);
  return quote.price;
}

async function quoteInEur(symbol) {
  const quote = await fetchQuote(symbol);
  const rawCurrency = String(quote.currency || 'EUR');
  const isPence = rawCurrency === 'GBp' || rawCurrency.toUpperCase() === 'GBX';
  const currency = isPence ? 'GBP' : rawCurrency.toUpperCase();
  const rate = await fxToEur(currency);
  const priceEur = quote.price * (isPence ? 0.01 : 1) * rate;

  if (!Number.isFinite(priceEur) || priceEur <= 0) {
    throw new Error(`conversion EUR impossible pour ${symbol}`);
  }
  return { ...quote, priceEur };
}

async function snapshotUser(userId) {
  const { data: accounts = [], error: accountsError } = await sb
    .from('accounts')
    .select('id, type, solde')
    .eq('user_id', userId);
  if (accountsError) throw new Error(`accounts: ${accountsError.message}`);

  const fixedTotal = accounts
    .filter(account => FIXED_ACCOUNT_TYPES.has(account.type))
    .reduce((sum, account) => sum + (Number(account.solde) || 0), 0);
  const fixedIds = new Set(
    accounts.filter(account => FIXED_ACCOUNT_TYPES.has(account.type)).map(account => account.id)
  );

  const { data: positions = [], error: positionsError } = await sb
    .from('positions')
    .select('symbol, qty, account_id')
    .eq('user_id', userId);
  if (positionsError) throw new Error(`positions: ${positionsError.message}`);

  const quantities = new Map();
  positions
    .filter(position => !fixedIds.has(position.account_id))
    .forEach(position => {
      quantities.set(position.symbol, (quantities.get(position.symbol) || 0) + (Number(position.qty) || 0));
    });

  const symbols = [...quantities.keys()];
  console.log(`  ${symbols.length} cotation(s) : ${symbols.join(', ') || 'aucune'}`);

  // Si un seul cours ou taux échoue, Promise.all s'arrête avant l'upsert :
  // le dernier snapshot valide est donc conservé.
  const quotes = new Map(await Promise.all(
    symbols.map(async symbol => [symbol, await quoteInEur(symbol)])
  ));

  let marketTotal = 0;
  for (const [symbol, qty] of quantities) {
    marketTotal += quotes.get(symbol).priceEur * qty;
  }

  const totalValue = Math.round((marketTotal + fixedTotal) * 100) / 100;
  const { error: upsertError } = await sb
    .from('patrimoine_history')
    .upsert(
      { user_id: userId, date: today, value: totalValue },
      { onConflict: 'user_id,date' }
    );
  if (upsertError) throw new Error(`patrimoine_history: ${upsertError.message}`);

  console.log(`✓ ${userId.slice(0, 8)}… → ${totalValue.toLocaleString('fr-FR')} € (${today})`);
  console.log(`  marché : ${Math.round(marketTotal).toLocaleString('fr-FR')} € | fixe : ${Math.round(fixedTotal).toLocaleString('fr-FR')} €`);
}

async function main() {
  console.log(`Snapshot du ${today} pour ${USER_IDS.length} utilisateur(s)…\n`);
  let succeeded = 0;

  for (const userId of USER_IDS) {
    try {
      await snapshotUser(userId);
      succeeded++;
    } catch (error) {
      console.error(`✗ ${userId.slice(0, 8)}… → ${error.message}`);
    }
  }

  console.log(`\n${succeeded}/${USER_IDS.length} snapshot(s) OK`);
  if (succeeded < USER_IDS.length) process.exitCode = 1;
}

await main();
