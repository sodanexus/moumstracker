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
  if (!currentUser) { alert('Non connecté'); return; }
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
  try {
    assertLiveWrite();
    toUpsert.forEach(row => MoobankCore.validateHistoryRecord(row));
  } catch (error) {
    statusEl.style.color = 'var(--loss)';
    statusEl.textContent = '✗ ' + (error.message || 'Données invalides');
    btn.disabled = false;
    return;
  }
  const replacedDates = toUpsert.filter(row => patrimoineHistory.some(item => item.date === row.date));
  if (replacedDates.length > 0 && !confirm(
    `${replacedDates.length} date(s) existent déjà et seront remplacées. Continuer ?`
  )) {
    statusEl.style.color = 'var(--muted)';
    statusEl.textContent = 'Import annulé — aucune donnée modifiée.';
    btn.disabled = false;
    return;
  }

  try {
    await retryDbWrite(async () => {
      const { error } = await sb.from('patrimoine_history').upsert(toUpsert, { onConflict: 'user_id,date' });
      if (error) throw error;
    });

    // Update local state
    toUpsert.forEach(({ date, value }) => {
      const idx = patrimoineHistory.findIndex(h => h.date === date);
      if (idx >= 0) patrimoineHistory[idx].value = value;
      else patrimoineHistory.push({ date, value });
    });
    patrimoineHistory.sort((a, b) => a.date.localeCompare(b.date));
    renderChart();
    scheduleDataCacheWrite();

    statusEl.style.color = 'var(--gain)';
    statusEl.textContent = `✓ ${toUpsert.length} entrée(s) enregistrée(s) avec succès !`;
    setTimeout(() => closeHistoryImport(), TIMING_HISTORY_CLOSE);
  } catch (err) {
    statusEl.style.color = 'var(--loss)';
    statusEl.textContent = '✗ Erreur : ' + (err.message || err);
  }
  btn.disabled = false;
}
