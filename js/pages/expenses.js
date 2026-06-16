// pages/expenses.js — M4 Expense & Travel (petty-cash float model)

import { isAdmin, isManager } from '../auth.js';
import { weekNavHtml, wireWeekNav } from '../components/weekNav.js';
import { setFormatPrefs, getDefaultCurrency, toISODate, todayISO } from '../format.js';
import { supabase } from '../config.js';
import { getProjects } from '../api/projects.js';
import {
  getCategories, upsertCategory, getVehicleRates, upsertVehicleRate,
  submitExpense, recordTopup, getMyTransactions, getAllTransactions, getRunningBalance,
  approveTransaction, rejectTransaction, overrideTransactionStatus,
  updateTransaction,
  previewMileage, submitMileageClaim, getMyTravelClaims, getAllTravelClaims,
  approveTravelClaim, rejectTravelClaim, updateTravelClaim,
  submitTripRequest, getMyTripRequests, getAllTripRequests,
  approveTripRequest, rejectTripRequest, completeTripRequest, overrideTripStatus, updateTripRequest,
  cancelTransaction, cancelTravelClaim, cancelTripRequest,
  submitSettlement, approveSettlement,
  getPettyCashSettings, savePettyCashSettings,
  getPendingReimbursements, markReimbursed,
  postWages, getWagePostings,
} from '../api/expenses.js';

// ── Helpers ───────────────────────────────────────────────────
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const _money = (a, c) => `${Number(a ?? 0).toLocaleString('en',{minimumFractionDigits:2})} ${_esc(c || 'THB')}`;
const _today = () => todayISO();
const _isWeekend = d => { const x = new Date(d + 'T00:00:00').getDay(); return x === 0 || x === 6; };
const _nextWeekday = () => { const d = new Date(); d.setHours(0,0,0,0); while (_isWeekend(toISODate(d))) d.setDate(d.getDate()+1); return toISODate(d); };

const STATUS_LABELS = { pending:'Pending', manager_approved:'Mgr Approved', approved:'Approved', rejected:'Rejected', completed:'Completed', cancelled:'Cancelled' };
const STATUS_CLASS  = { pending:'badge-pending', manager_approved:'badge-warning', approved:'badge-approved', rejected:'badge-rejected', completed:'badge-approved', cancelled:'' };
const _badge   = s => `<span class="badge ${STATUS_CLASS[s]||''}">${_esc(STATUS_LABELS[s]||s)}</span>`;
const _settled = s => ['approved','rejected','completed','cancelled'].includes(s);

// ISO week number
function _isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return week;
}

// ── Module state ──────────────────────────────────────────────
let _admin = false, _manager = false, _profile = null;
let _myEmployee = null;
let _categories = [], _vehicles = [], _projects = [];
let _holidaySet = new Set();   // 'YYYY-MM-DD' public holidays for deadline math
let _monthlyTopup = 6000;      // loaded from petty_cash_settings
let _ptDailyRate  = 550;       // PT/outsource day rate (half-day session = rate / 2)
let _pendingReimb = { txns: [], claims: [] };  // pending reimbursements (for mark-paid handlers)
let _prefillTopupAmt = null;   // pre-fills RECORD TOP-UP amount from the banner quick-button

let _primaryTab = 'my-expenses';
let _travelSub  = 'mileage';
let _approvSub  = 'pending';
let _pendingCat = 'expense';     // Approvals → Pending category sub-tab: expense|mileage|trip|settlement
let _pettyCashSub = 'ledger';    // Petty Cash sub-tab: ledger|topup
let _apWeekStart = null;         // Monday (Date) for the Approvals week filter; null = all dates
let _pcWeekStart = null;         // Monday (Date) for the Petty Cash week filter; null = all dates
let _pendingData = { exp: [], claims: [], trips: [], settlements: [] };  // cached pending fetch
let _reportMode = 'monthly';
let _showPastExp = false, _showPastClaims = false, _showPastTrips = false;
let _pendingApprovals = 0;   // count shown on the APPROVALS tab badge
let _historyItems = [];      // cached for Edit lookups in HISTORY

const _catIn  = () => _categories.filter(c => c.applies_to === 'in'  || c.applies_to === 'both');
const _catOut = () => _categories.filter(c => c.applies_to === 'out' || c.applies_to === 'both');
const _otherCatId = () => _categories.find(c => c.name === 'Other')?.id;
// Office-overhead categories always belong to the in-house "Hubble Engineering Office"
// project; everything else (Import Tax, Shipping & Handling, Other, …) is picked per
// customer project. Names are seeded/stable, so a JS constant suffices (no migration).
const OFFICE_CAT_NAMES = new Set([
  'Engineering Assistant Wage', 'International wire transfer service charge',
  'Municipal Water', 'Electricity', 'Office Cleaning', 'Drink & Beverages',
  'Travel Expense Reimbursement',
]);
// IN (top-up) sources that always fund the in-house office project; Customer
// Working Budget stays a per-project pick.
const OFFICE_IN_CAT_NAMES = new Set([
  'Hubble Engineering Working Budget', 'Engineering Assistant Working Budget',
]);
const _officeProjectId = () => _projects.find(p => p.name === 'Hubble Engineering Office')?.id || '';

// ── FX conversion (api.frankfurter.dev — free, no key required) ──
const _fxCache = {};
async function _fetchFxRate(from, to) {
  if (from === to) return 1;
  const key = `${from}_${to}`;
  if (_fxCache[key]) return _fxCache[key];
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?from=${from}&to=${to}`);
    const j   = await res.json();
    const rate = j.rates?.[to] ?? null;
    if (rate) _fxCache[key] = rate;
    return rate;
  } catch { return null; }
}
function _wireCurrencyConvert(amtId, curId) {
  const curSel = document.getElementById(curId);
  const amtInp = document.getElementById(amtId);
  if (!curSel || !amtInp) return;
  let prev = curSel.value;
  curSel.addEventListener('change', async () => {
    const amt = parseFloat(amtInp.value);
    if (amt > 0 && prev && prev !== curSel.value) {
      const rate = await _fetchFxRate(prev, curSel.value);
      if (rate) {
        amtInp.value = (amt * rate).toFixed(2);
        window.showToast?.(`Converted at 1 ${prev} = ${rate.toFixed(4)} ${curSel.value}`, 'success');
      } else {
        window.showToast?.('Exchange rate unavailable — amount not converted', 'error');
      }
    }
    prev = curSel.value;
  });
}
// Currency select options. Pre-selects `sel` if provided, otherwise the user's default currency.
const _curOpts = (sel) => ['THB','USD','EUR','GBP']
  .map(c => `<option ${c === (sel || getDefaultCurrency()) ? 'selected' : ''}>${c}</option>`)
  .join('');

const _projOptions = (sel) => `<option value="">— Project / Purpose —</option>` +
  _projects.map(p => `<option value="${p.id}" ${sel===p.id?'selected':''}>${_esc(p.name)}</option>`).join('');
// Required variant: no blank option; auto-selects the first project when sel is absent.
// Use wherever a project selection is mandatory (e.g. Trip Request).
const _projOptionsReq = (sel) =>
  _projects.map((p, i) => `<option value="${p.id}" ${(sel ? sel===p.id : i===0)?'selected':''}>${_esc(p.name)}</option>`).join('');

// ── Mileage route location boxes ─────────────────────────────
function _currentRoute() {
  return [...document.querySelectorAll('#ml-route-boxes .ml-loc')].map(i => i.value.trim());
}
// isRound: true → show Start + Destination (return is implied); middle stops removable.
// isRound: false (one-way) → show Start + [stops] + End; middle stops removable.
function _drawRoute(values, isRound) {
  const cont = document.getElementById('ml-route-boxes');
  if (!cont) return;
  const n = values.length;
  cont.innerHTML = values.map((v, i) => {
    const isFirst = i === 0;
    const isLast  = i === n - 1;
    const ph = isFirst ? 'Start point' : (isLast ? 'Destination' : `Stop ${i}`);
    const canRemove = n > 2 && !isFirst && !isLast;
    return `<div style="display:flex;gap:8px;align-items:center;">
      <input class="form-input ml-loc" type="text" value="${_esc(v || '')}" placeholder="${_esc(ph)}" style="flex:1;">
      ${canRemove ? `<button type="button" class="btn btn-ghost btn-sm ml-loc-remove" data-i="${i}" title="Remove stop">✕</button>` : ''}
    </div>`;
  }).join('');
  cont.querySelectorAll('.ml-loc-remove').forEach(b => b.addEventListener('click', () => {
    const vals = _currentRoute();
    vals.splice(parseInt(b.dataset.i), 1);
    _drawRoute(vals, document.getElementById('ml-trip')?.value === 'round_trip');
  }));
}

// Trip length in days, inclusive of both start and end dates.
function _tripDays() {
  const s = document.getElementById('tp-start')?.value, e = document.getElementById('tp-end')?.value;
  if (!s || !e) return 0;
  const d = Math.round((new Date(e) - new Date(s)) / 86400000) + 1;
  return d > 0 ? d : 0;
}

// Render trip cost_items to a short summary string.
// Supports: {label}, {label,perDay,days,amount}, {label,amount,qty,subtotal,qtyLabel}
function _costItemsText(items) {
  if (!items || !items.length) return '';
  return items.map(it => {
    if (!it || typeof it !== 'object') return String(it);
    if (it.perDay != null) return `Daily ฿${Number(it.perDay).toLocaleString()}/day×${it.days}d = ฿${Number(it.amount).toLocaleString()}`;
    if (it.subtotal != null) return `${it.label} ฿${Number(it.amount).toLocaleString()}×${it.qty} = ฿${Number(it.subtotal).toLocaleString()}`;
    return it.label;
  }).join(' · ');
}

// Deadline: the 14th, or the last workday before it if 14th is weekend/holiday.
function _monthlyDeadline(year, month) {
  let d = new Date(year, month - 1, 14);
  while (_isWeekend(toISODate(d)) || _holidaySet.has(toISODate(d))) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}
// Next Monday from a given date (or today).
function _nextMonday(from) {
  const d = from ? new Date(from) : new Date(); d.setHours(0,0,0,0);
  const day = d.getDay();
  const add = day === 1 ? 0 : ((8 - day) % 7 || 7);
  d.setDate(d.getDate() + add);
  return d;
}

// ── Week date-range helpers ────────────────────────────────────
function _weekRange(monday) {
  const from = new Date(monday + 'T00:00:00');
  const to = new Date(from); to.setDate(to.getDate() + 6);
  return { from: toISODate(from), to: toISODate(to) };
}
// True if no week filter is set, or `dateStr` falls within the filter week.
function _inWeek(dateStr, monday) {
  if (!monday) return true;
  if (!dateStr) return false;
  const d = String(dateStr).slice(0,10);
  const { from, to } = _weekRange(monday);
  return d >= from && d <= to;
}
// weekNavHtml / wireWeekNav imported from ../components/weekNav.js

// ── Boot ──────────────────────────────────────────────────────
export async function render(profile) {
  _profile = profile;
  setFormatPrefs(profile);   // seeds getDefaultCurrency() from profile.currency
  _admin = isAdmin();
  _manager = isManager();

  const content = document.getElementById('content');
  content.innerHTML = `<div class="page-loading">Loading…</div>`;

  const [cats, vehicles, projects, emp, pcSettings] = await Promise.all([
    getCategories().catch(() => []),
    getVehicleRates().catch(() => []),
    getProjects().catch(() => []),
    supabase.from('employees').select('id, full_name, employee_id, employment_type_code').eq('user_id', profile.id).maybeSingle().then(r => r.data),
    getPettyCashSettings().catch(() => ({ monthlyTopup: 6000, ptDailyRate: 550 })),
  ]);
  _categories = cats; _vehicles = vehicles; _projects = projects; _myEmployee = emp;
  _monthlyTopup = pcSettings.monthlyTopup;
  _ptDailyRate  = pcSettings.ptDailyRate ?? 550;

  // Public holidays (current year ± boundary) for deadline math — best-effort.
  try {
    const yr = new Date().getFullYear();
    const { data } = await supabase.from('public_holidays').select('date').gte('date', `${yr-1}-12-01`).lte('date', `${yr+1}-01-31`);
    _holidaySet = new Set((data || []).map(h => h.date));
  } catch { _holidaySet = new Set(); }

  await _refreshPendingCount();   // for the APPROVALS tab badge (admin/mgr)
  _renderShell();
}

// Count of items awaiting action (expenses + mileage claims + trip requests + settlements).
async function _refreshPendingCount() {
  if (!(_admin || _manager)) { _pendingApprovals = 0; return 0; }
  try {
    const [{ count: ct }, { count: tc }, { count: tr }, { count: ts }] = await Promise.all([
      supabase.from('cash_transactions').select('id', { count:'exact', head:true }).eq('direction','out').in('status', ['pending','manager_approved']),
      supabase.from('travel_claims').select('id', { count:'exact', head:true }).in('status', ['pending','manager_approved']),
      supabase.from('travel_requests').select('id', { count:'exact', head:true }).in('status', ['pending','manager_approved']),
      supabase.from('travel_requests').select('id', { count:'exact', head:true }).eq('settlement_status', 'submitted'),
    ]);
    _pendingApprovals = (ct || 0) + (tc || 0) + (tr || 0) + (ts || 0);
  } catch { _pendingApprovals = 0; }
  return _pendingApprovals;
}
function _approvalsBadge() {
  return `<span id="exp-approvals-count" class="badge badge-pending" style="margin-left:6px;${_pendingApprovals > 0 ? '' : 'display:none;'}">${_pendingApprovals}</span>`;
}
function _updateApprovalsTabBadge() {
  document.querySelectorAll('#exp-approvals-count, #exp-pending-count').forEach(el => {
    el.textContent = _pendingApprovals;
    el.style.display = _pendingApprovals > 0 ? '' : 'none';
  });
}

function _saveTabState() {
  try {
    sessionStorage.setItem('exp_tab_state', JSON.stringify({
      primaryTab: _primaryTab, travelSub: _travelSub, approvSub: _approvSub,
      pendingCat: _pendingCat, pettyCashSub: _pettyCashSub, reportMode: _reportMode,
    }));
  } catch { /* quota exceeded / private browsing */ }
}

function _renderShell() {
  // Restore tab state from sessionStorage (survives hard refresh, clears on tab close)
  try {
    const saved = JSON.parse(sessionStorage.getItem('exp_tab_state') || 'null');
    if (saved) {
      const canApproveNow = _admin || _manager;
      if (saved.primaryTab === 'my-expenses' || saved.primaryTab === 'my-travel' ||
          (saved.primaryTab === 'approvals'  && canApproveNow) ||
          (saved.primaryTab === 'petty-cash' && _admin) ||
          (saved.primaryTab === 'report'     && _admin)) {
        _primaryTab = saved.primaryTab;
      }
      if (saved.travelSub)    _travelSub    = saved.travelSub;
      if (saved.approvSub)    _approvSub    = saved.approvSub;
      if (saved.pendingCat)   _pendingCat   = saved.pendingCat;
      if (saved.pettyCashSub) _pettyCashSub = saved.pettyCashSub;
      if (saved.reportMode)   _reportMode   = saved.reportMode;
    }
  } catch { /* ignore stale / invalid */ }

  const canApprove = _admin || _manager;
  document.getElementById('content').innerHTML = `
    <div class="page-header"><h1 class="page-title">Expense &amp; Travel</h1></div>
    <div class="tabs primary-tabs" id="exp-tabs">
      <button class="tab-btn${_primaryTab==='my-expenses'?' active':''}" data-tab="my-expenses">MY EXPENSES</button>
      <button class="tab-btn${_primaryTab==='my-travel'?' active':''}" data-tab="my-travel">MY TRAVEL</button>
      ${canApprove ? `<button class="tab-btn${_primaryTab==='approvals'?' active':''}" data-tab="approvals">APPROVALS ${_approvalsBadge()}</button>` : ''}
      ${_admin ? `<button class="tab-btn${_primaryTab==='petty-cash'?' active':''}" data-tab="petty-cash">PETTY CASH</button>` : ''}
      ${_admin ? `<button class="tab-btn${_primaryTab==='report'?' active':''}" data-tab="report">REPORT</button>` : ''}
    </div>
    <div id="exp-body"></div>
  `;
  document.getElementById('exp-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    _primaryTab = btn.dataset.tab;
    _saveTabState();
    document.querySelectorAll('#exp-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === _primaryTab));
    _loadTab();
  });
  _loadTab();
}

function _loadTab() {
  switch (_primaryTab) {
    case 'my-expenses': return _renderMyExpenses();
    case 'my-travel':   return _renderMyTravel();
    case 'approvals':   return _renderApprovals();
    case 'petty-cash':  return _renderPettyCash();
    case 'report':      return _renderReport();
  }
}

// ═══════════════════════════════════════════ MY EXPENSES
async function _renderMyExpenses() {
  const body = document.getElementById('exp-body');
  body.innerHTML = `<div class="page-loading">Loading…</div>`;
  let txns = [];
  if (_myEmployee) txns = (await getMyTransactions(_myEmployee.id).catch(() => [])).filter(t => t.direction === 'out');

  const active  = txns.filter(t => !_settled(t.status));
  const settled = txns.filter(t =>  _settled(t.status));
  // Unseen = approved/rejected items the employee hasn't viewed yet (drives nav badge).
  const unseenExpIds = new Set(
    txns.filter(t => ['approved','rejected'].includes(t.status) && localStorage.getItem(`exp_seen_${t.id}`) !== '1').map(t => t.id)
  );
  // Everyone sees the full out-category list; office categories lock the project below.
  const catOpts = _catOut().map(c => `<option value="${c.id}">${_esc(c.name)}</option>`).join('');

  body.innerHTML = `
    <div style="max-width:540px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
      <div class="form-label" style="font-size:15px;font-weight:600;">Submit Expense</div>
      ${!_myEmployee ? `<p class="text-muted">No employee record linked to your account. Contact an admin.</p>` : `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <label class="form-label">Date <span class="required">*</span>
          <input class="form-input" type="date" id="ex-date" value="${_today()}" max="${_today()}" style="color-scheme:dark"></label>
        <label class="form-label">Amount <span class="required">*</span>
          <input class="form-input" type="number" id="ex-amt" placeholder="0.00" min="0.01" step="0.01"></label>
      </div>
      <label class="form-label">Category <span class="required">*</span>
        <select class="form-input" id="ex-cat"><option value="">Select…</option>${catOpts}</select></label>
      <div id="ex-other-row" style="display:none;">
        <label class="form-label">Details <span class="required">*</span>
          <input class="form-input" type="text" id="ex-other" placeholder="Describe this payment…"></label>
      </div>
      <label class="form-label">Project / Purpose <span class="required">*</span>
        <select class="form-input" id="ex-proj">${_projOptions()}</select></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <label class="form-label">Currency
          <select class="form-input" id="ex-cur">${_curOpts()}</select></label>
        <label class="form-label">Receipt URL <span class="form-hint">(optional)</span>
          <input class="form-input" type="url" id="ex-rcpt" placeholder="https://…"></label>
      </div>
      <label class="form-label">Note
        <textarea class="form-input" id="ex-note" rows="3" placeholder="What was this for?" style="resize:vertical;"></textarea></label>
      <div style="display:flex;gap:10px;"><button class="btn btn-primary" id="ex-submit">Submit Expense</button></div>
      `}
    </div>

    <div class="section-header">My Expenses <span class="text-muted">(${active.length} pending)</span></div>
    <div>${active.length === 0 ? `<p class="empty-state">No pending expenses.</p>` : _txnTable(active, unseenExpIds)}</div>

    <div class="section-header mt-4" style="display:flex;align-items:center;gap:12px">Settled
      <button class="btn btn-ghost btn-sm" id="ex-toggle">${_showPastExp?`Hide past (${settled.length})`:`Show past (${settled.length})`}</button>
    </div>
    <div style="${_showPastExp?'':'display:none'}">${settled.length === 0 ? `<p class="empty-state">None.</p>` : _txnTable(settled, unseenExpIds)}</div>
  `;

  // Mark unseen decisions as seen now that the tab is rendered; refresh nav badge.
  unseenExpIds.forEach(id => localStorage.setItem(`exp_seen_${id}`, '1'));
  if (unseenExpIds.size) window.refreshExpenseBadge?.();

  if (_myEmployee) {
    const catSel = document.getElementById('ex-cat');
    const otherRow = document.getElementById('ex-other-row');
    const otherId = _otherCatId();
    catSel?.addEventListener('change', () => {
      const show = otherId && parseInt(catSel.value) === otherId;
      if (otherRow) otherRow.style.display = show ? '' : 'none';
      // Office categories lock the project to "Hubble Engineering Office";
      // customer categories unlock it for a manual pick.
      const projSel = document.getElementById('ex-proj');
      if (!projSel) return;
      const catName = _categories.find(c => c.id === parseInt(catSel.value))?.name;
      const officeId = _officeProjectId();
      if (catName && OFFICE_CAT_NAMES.has(catName) && officeId) {
        projSel.value = officeId;
        projSel.disabled = true;
      } else {
        projSel.disabled = false;
        if (catName && !OFFICE_CAT_NAMES.has(catName)) projSel.value = '';
      }
    });
    _wireCurrencyConvert('ex-amt', 'ex-cur');
    document.getElementById('ex-submit')?.addEventListener('click', _submitExpense);
  }
  document.getElementById('ex-toggle')?.addEventListener('click', () => { _showPastExp = !_showPastExp; _renderMyExpenses(); });
  body.querySelectorAll('.exp-cancel-txn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await cancelTransaction(btn.dataset.id);
        window.showToast?.('Expense cancelled.', 'success');
        _renderMyExpenses();
      } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
    });
  });
}

function _txnTable(txns, unseenIds = new Set()) {
  return `<div class="table-wrapper"><table class="data-table">
    <thead><tr><th>Date</th><th>Category</th><th>Project</th><th>Amount</th><th>Note</th><th>Status</th><th></th></tr></thead>
    <tbody>${txns.map(t => `<tr${unseenIds.has(t.id) ? ' style="background:rgba(76,175,80,0.07)"' : ''}>
      <td>${_fmt(t.txn_date)}</td>
      <td>${_esc(t.category?.name || '—')}</td>
      <td>${_esc(t.project?.name || '—')}</td>
      <td>${_money(t.amount, t.currency)}</td>
      <td>${_esc(t.note || '—')}</td>
      <td>${_badge(t.status)}${unseenIds.has(t.id) ? ' <span class="badge" style="background:#4caf50;color:#000;font-size:10px;vertical-align:middle;margin-left:4px">NEW</span>' : ''}${t.rejection_reason ? `<br><small class="text-muted">${_esc(t.rejection_reason)}</small>` : ''}</td>
      <td style="white-space:nowrap;">${t.status === 'pending' ? `<button class="btn btn-sm btn-ghost exp-cancel-txn" data-id="${_esc(t.id)}">Cancel</button>` : t.status === 'manager_approved' ? `<span style="font-size:11px;color:var(--text-muted);">Contact admin</span>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

async function _submitExpense() {
  const btn = document.getElementById('ex-submit'); btn.disabled = true;
  try {
    const catId = parseInt(document.getElementById('ex-cat').value) || null;
    let note = document.getElementById('ex-note').value.trim();
    // "Other" category requires a free-text detail of the payment.
    if (catId && catId === _otherCatId()) {
      const detail = document.getElementById('ex-other').value.trim();
      if (!detail) throw new Error('Please enter the payment details for the "Other" category.');
      note = note ? `${detail} — ${note}` : detail;
    }
    const projId = document.getElementById('ex-proj').value;
    if (!projId) throw new Error('Please select a Project / Purpose.');
    await submitExpense({
      employeeId: _myEmployee.id,
      txnDate:    document.getElementById('ex-date').value,
      categoryId: catId,
      projectId:  projId,
      amount:     document.getElementById('ex-amt').value,
      currency:   document.getElementById('ex-cur').value,
      note:       note || null,
      receiptUrl: document.getElementById('ex-rcpt').value.trim() || null,
    });
    window.showToast?.('Expense submitted.', 'success');
    _renderMyExpenses();
  } catch (err) { window.showToast?.(err.message, 'error'); btn.disabled = false; }
}

// ═══════════════════════════════════════════ MY TRAVEL
async function _renderMyTravel() {
  const body = document.getElementById('exp-body');
  body.innerHTML = `
    <div class="tabs" id="tv-sub" style="margin-bottom:16px">
      <button class="tab-btn${_travelSub==='mileage'?' active':''}" data-tab="mileage">MILEAGE CLAIM</button>
      <button class="tab-btn${_travelSub==='trip'?' active':''}" data-tab="trip">TRIP REQUEST</button>
    </div>
    <div id="tv-body"></div>`;
  document.getElementById('tv-sub').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    _travelSub = btn.dataset.tab;
    _saveTabState();
    document.querySelectorAll('#tv-sub .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === _travelSub));
    _travelSub === 'mileage' ? _renderMileage() : _renderTrip();
  });
  _travelSub === 'mileage' ? _renderMileage() : _renderTrip();
}

async function _renderMileage() {
  const wrap = document.getElementById('tv-body');
  wrap.innerHTML = `<div class="page-loading">Loading…</div>`;
  let claims = [];
  if (_myEmployee) claims = await getMyTravelClaims(_myEmployee.id).catch(() => []);
  const active  = claims.filter(c => !_settled(c.status));
  const settled = claims.filter(c =>  _settled(c.status));
  const unseenClaimIds = new Set(
    claims.filter(c => ['approved','rejected'].includes(c.status) && localStorage.getItem(`claim_seen_${c.id}`) !== '1').map(c => c.id)
  );
  // Personal vehicle options (exclude public transport code)
  const pvOpts = _vehicles.filter(v => v.code !== 'public')
    .map(v => `<option value="${v.code}" data-rate="${v.fuel_rate_per_km}" data-dep="${v.depreciation_per_km}">${_esc(v.label)} (฿${(Number(v.fuel_rate_per_km)+Number(v.depreciation_per_km)).toFixed(2)}/km)</option>`).join('');

  wrap.innerHTML = `
    <div style="max-width:540px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
      <div class="form-label" style="font-size:15px;font-weight:600;">New Mileage / Transport Claim</div>
      ${!_myEmployee ? `<p class="text-muted">No employee record linked. Contact an admin.</p>` : `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <label class="form-label">Travel Date <span class="required">*</span>
          <input class="form-input" type="date" id="ml-date" value="${_today()}" max="${_today()}" style="color-scheme:dark"></label>
        <label class="form-label">Project / Purpose <span class="required">*</span>
          <select class="form-input" id="ml-proj">${_projOptions()}</select></label>
      </div>

      <label class="form-label">Travel Type <span class="required">*</span>
        <select class="form-input" id="ml-ttype">
          <option value="personal">Personal Vehicle</option>
          <option value="public">Public Transport</option>
        </select></label>

      <!-- ── Personal vehicle sub-form ── -->
      <div id="ml-pv-section">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <label class="form-label">Vehicle <span class="required">*</span>
            <select class="form-input" id="ml-veh">${pvOpts || '<option value="">No vehicles configured</option>'}</select></label>
          <label class="form-label">Trip Type <span class="required">*</span>
            <select class="form-input" id="ml-trip">
              <option value="one_way">One Way</option>
              <option value="round_trip">Round Trip</option>
            </select></label>
        </div>
        <div style="margin-bottom:14px;">
          <div class="form-label">Route <span class="required">*</span> <span class="form-hint">one location per box</span></div>
          <div id="ml-route-boxes" style="display:flex;flex-direction:column;gap:8px;margin-top:6px;"></div>
          <div id="ml-round-hint" style="display:none;font-size:12px;color:var(--text-secondary);margin-top:4px;">↩ Returns to start point automatically</div>
          <button type="button" class="btn btn-ghost btn-sm" id="ml-add-loc" style="margin-top:8px;">+ Add stop</button>
        </div>
        <label class="form-label" style="margin-bottom:14px;">Distance (km) <span class="required">*</span>
          <input class="form-input" type="number" id="ml-dist" placeholder="0" min="0" step="0.1"></label>
        <div class="card" style="background:var(--surface-2);padding:10px 14px;">
          <strong>Preview:</strong> <span id="ml-preview">Reimbursement 0.00 + Depreciation 0.00 = <strong>0.00 THB</strong></span>
        </div>
      </div>

      <!-- ── Public transport sub-form ── -->
      <div id="ml-pt-section" style="display:none;">
        <div style="display:flex;flex-direction:column;gap:14px;">
          <label class="form-label">Transport Type <span class="required">*</span>
            <input class="form-input" type="text" id="ml-pttype" placeholder="e.g. Taxi, Bus, Songtaew, MRT…"></label>
          <div>
            <div class="form-label">Route <span class="required">*</span></div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">
              <input class="form-input ml-pt-loc" type="text" placeholder="Start point">
              <input class="form-input ml-pt-loc" type="text" placeholder="Destination">
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Always one-way — full fare is reimbursed.</div>
          </div>
          <label class="form-label">Amount Paid <span class="required">*</span>
            <input class="form-input" type="number" id="ml-manual" placeholder="0.00" min="0" step="0.01"></label>
          <div class="card" style="background:var(--surface-2);padding:10px 14px;">
            <strong>Preview:</strong> <span id="ml-pt-preview">Full fare reimbursed = <strong>0.00 THB</strong></span>
          </div>
        </div>
      </div>

      <label class="form-label">Receipt URL <span class="form-hint">(optional)</span>
        <input class="form-input" type="url" id="ml-rcpt" placeholder="https://…"></label>
      <label class="form-label">Note
        <input class="form-input" type="text" id="ml-note" placeholder="Trip details…"></label>
      <div style="display:flex;gap:10px;"><button class="btn btn-primary" id="ml-submit">Submit Claim</button></div>
      `}
    </div>

    <div class="section-header">My Mileage Claims <span class="text-muted">(${active.length} pending)</span></div>
    <div>${active.length === 0 ? `<p class="empty-state">No pending claims.</p>` : _claimTable(active, unseenClaimIds)}</div>

    <div class="section-header mt-4" style="display:flex;align-items:center;gap:12px">Settled
      <button class="btn btn-ghost btn-sm" id="ml-toggle">${_showPastClaims?`Hide past (${settled.length})`:`Show past (${settled.length})`}</button>
    </div>
    <div style="${_showPastClaims?'':'display:none'}">${settled.length === 0 ? `<p class="empty-state">None.</p>` : _claimTable(settled, unseenClaimIds)}</div>
  `;

  unseenClaimIds.forEach(id => localStorage.setItem(`claim_seen_${id}`, '1'));
  if (unseenClaimIds.size) window.refreshExpenseBadge?.();

  if (_myEmployee) {
    const getTType  = () => document.getElementById('ml-ttype')?.value ?? 'personal';
    const getIsRound = () => document.getElementById('ml-trip')?.value === 'round_trip';

    const updPreview = () => {
      if (getTType() === 'public') {
        const amt = Number(document.getElementById('ml-manual')?.value) || 0;
        const el = document.getElementById('ml-pt-preview');
        if (el) el.innerHTML = `Full fare reimbursed = <strong>${amt.toFixed(2)} THB</strong>`;
        return;
      }
      const veh = document.getElementById('ml-veh');
      const opt = veh?.options[veh?.selectedIndex];
      const p = previewMileage({
        distanceKm:   document.getElementById('ml-dist')?.value ?? 0,
        tripType:     document.getElementById('ml-trip')?.value ?? 'one_way',
        rate:         opt?.dataset.rate ?? 0,
        depreciation: opt?.dataset.dep  ?? 0,
        manualAmount: 0,
      });
      const el = document.getElementById('ml-preview');
      if (el) el.innerHTML = `Reimbursement ${p.reimbursement.toFixed(2)} + Depreciation ${p.depreciation.toFixed(2)} = <strong>${p.total.toFixed(2)} THB</strong> <span class="text-muted">(${p.effectiveKm} effective km)</span>`;
    };

    const applyTType = () => {
      const pub = getTType() === 'public';
      document.getElementById('ml-pv-section').style.display = pub ? 'none' : '';
      document.getElementById('ml-pt-section').style.display = pub ? '' : 'none';
      updPreview();
    };

    const applyTripType = () => {
      const isRound = getIsRound();
      const hint = document.getElementById('ml-round-hint');
      if (hint) hint.style.display = isRound ? '' : 'none';
      _drawRoute(_currentRoute(), isRound);
      updPreview();
    };

    // Initial render: 2 boxes (Start + Destination), one-way
    _drawRoute(['', ''], false);
    applyTType();

    document.getElementById('ml-ttype')?.addEventListener('change', applyTType);
    document.getElementById('ml-trip')?.addEventListener('change', applyTripType);
    document.getElementById('ml-veh')?.addEventListener('change', updPreview);
    document.getElementById('ml-dist')?.addEventListener('input', updPreview);
    document.getElementById('ml-dist')?.addEventListener('change', updPreview);
    document.getElementById('ml-manual')?.addEventListener('input', updPreview);
    document.getElementById('ml-manual')?.addEventListener('change', updPreview);

    document.getElementById('ml-add-loc')?.addEventListener('click', () => {
      const isRound = getIsRound();
      const vals = _currentRoute();
      if (isRound && vals.length >= 2) {
        vals.splice(vals.length - 1, 0, ''); // insert stop before destination
      } else {
        vals.push('');
      }
      _drawRoute(vals, isRound);
    });

    document.getElementById('ml-submit')?.addEventListener('click', _submitMileage);
  }
  document.getElementById('ml-toggle')?.addEventListener('click', () => { _showPastClaims = !_showPastClaims; _renderMileage(); });
  wrap.querySelectorAll('.exp-cancel-claim').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await cancelTravelClaim(btn.dataset.id);
        window.showToast?.('Claim cancelled.', 'success');
        _renderMileage();
      } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
    });
  });
}

function _claimTable(claims, unseenIds = new Set()) {
  return `<div class="table-wrapper"><table class="data-table">
    <thead><tr><th>Date</th><th>Route</th><th>Vehicle</th><th>Trip</th><th>Distance</th><th>Reimb.+Dep.</th><th>Status</th><th></th></tr></thead>
    <tbody>${claims.map(c => `<tr${unseenIds.has(c.id) ? ' style="background:rgba(76,175,80,0.07)"' : ''}>
      <td>${_fmt(c.travel_date)}</td>
      <td>${_esc(c.route)}</td>
      <td>${c.vehicle_code === 'public' ? _esc(c.note?.split(' — ')[0] || 'Public transport') : _esc(c.vehicle?.label || c.vehicle_code)}</td>
      <td>${c.vehicle_code === 'public' ? 'One way (public)' : c.trip_type === 'round_trip' ? 'Round trip' : 'One way'}</td>
      <td>${c.vehicle_code === 'public' ? '—' : `${Number(c.distance_km||0)} km`}</td>
      <td style="color:var(--color-success,#66bb6a)">${_money(Number(c.computed_reimbursement)+Number(c.computed_depreciation), c.currency)}</td>
      <td>${_badge(c.status)}${unseenIds.has(c.id) ? ' <span class="badge" style="background:#4caf50;color:#000;font-size:10px;vertical-align:middle;margin-left:4px">NEW</span>' : ''}${c.rejection_reason ? `<br><small class="text-muted">${_esc(c.rejection_reason)}</small>` : ''}</td>
      <td style="white-space:nowrap;">${c.status === 'pending' ? `<button class="btn btn-sm btn-ghost exp-cancel-claim" data-id="${_esc(c.id)}">Cancel</button>` : c.status === 'manager_approved' ? `<span style="font-size:11px;color:var(--text-muted);">Contact admin</span>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

async function _submitMileage() {
  const btn = document.getElementById('ml-submit'); btn.disabled = true;
  try {
    const projectId = document.getElementById('ml-proj').value;
    if (!projectId) throw new Error('Please select a project / purpose.');
    const ttype    = document.getElementById('ml-ttype').value;
    const isPublic = ttype === 'public';
    const baseNote = document.getElementById('ml-note').value.trim();

    let vehicleCode, tripType, route, distKm, manualAmt, finalNote;

    if (isPublic) {
      const ptType = document.getElementById('ml-pttype')?.value.trim();
      if (!ptType) throw new Error('Please enter the transport type (e.g. Taxi, Bus).');
      const locs = [...document.querySelectorAll('.ml-pt-loc')].map(i => i.value.trim()).filter(Boolean);
      if (locs.length < 2) throw new Error('Enter start point and destination.');
      const manualVal = document.getElementById('ml-manual')?.value;
      if (!(Number(manualVal) > 0)) throw new Error('Enter the amount paid for public transport.');
      vehicleCode = 'public';
      tripType    = 'one_way';
      route       = locs.join(' → ');
      distKm      = 0;
      manualAmt   = manualVal;
      finalNote   = baseNote ? `${ptType} — ${baseNote}` : ptType;
    } else {
      const locs = _currentRoute().filter(Boolean);
      if (locs.length < 2) throw new Error('Enter at least a start and end location.');
      const distVal = document.getElementById('ml-dist')?.value;
      if (!(Number(distVal) > 0)) throw new Error('Enter the distance in km.');
      vehicleCode  = document.getElementById('ml-veh').value;
      tripType     = document.getElementById('ml-trip').value;
      // Round trip: auto-append start to close the loop (A → B → A)
      route        = tripType === 'round_trip' ? [...locs, locs[0]].join(' → ') : locs.join(' → ');
      distKm       = distVal;
      manualAmt    = 0;
      finalNote    = baseNote || null;
    }

    await submitMileageClaim({
      employeeId:   _myEmployee.id,
      travelDate:   document.getElementById('ml-date').value,
      projectId,
      route,
      tripType,
      vehicleCode,
      distanceKm:   distKm,
      manualAmount: manualAmt,
      note:         finalNote,
      receiptUrl:   document.getElementById('ml-rcpt').value.trim() || null,
    });
    window.showToast?.('Claim submitted.', 'success');
    _renderMileage();
  } catch (err) { window.showToast?.(err.message, 'error'); btn.disabled = false; }
}

// Line items available in a trip request. Each has an id, display label, and qty label.
// Special: 'daily' = ฿/day × days; 'other' = free text + amount.
const TRIP_ITEM_DEFS = [
  { id: 'tickets',  label: 'Tickets — flight / train / bus',  qtyLabel: 'legs'   },
  { id: 'hotel',    label: 'Hotel / accommodation',            qtyLabel: 'nights' },
  { id: 'local-tx', label: 'Local transport at destination',   qtyLabel: 'days'   },
  { id: 'car-rent', label: 'Car rental',                       qtyLabel: 'days'   },
  { id: 'reg-fee',  label: 'Registration / conference fee',    qtyLabel: 'times'  },
  { id: 'comms',    label: 'Communication / data',             qtyLabel: 'times'  },
  { id: 'printing', label: 'Printing / documents',             qtyLabel: 'times'  },
  { id: 'daily',    label: 'Daily allowance (transport + meals)', special: 'daily' },
  { id: 'other',    label: 'Other',                            special: 'other'   },
];

function _tripItemRow(def) {
  if (def.special === 'daily') return `
    <div class="tp-item-wrap" style="display:flex;flex-direction:column;gap:4px;">
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;">
        <input type="checkbox" class="tp-item" id="tp-item-daily" data-def="daily">
        ${_esc(def.label)}
      </label>
      <div id="tp-daily-row" style="display:none;padding-left:26px;display:none;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="text-muted" style="font-size:12px;">฿/day</span>
          <input class="form-input" type="number" id="tp-daily-rate" placeholder="0.00" min="0" step="0.01" style="max-width:110px;">
          <span class="text-muted" id="tp-daily-calc" style="font-size:12px;"></span>
        </div>
      </div>
    </div>`;
  if (def.special === 'other') return `
    <div class="tp-item-wrap" style="display:flex;flex-direction:column;gap:4px;">
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;">
        <input type="checkbox" class="tp-item" id="tp-item-other" data-def="other">
        Other
      </label>
      <div id="tp-other-row" style="display:none;padding-left:26px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input class="form-input" type="text" id="tp-other-text" placeholder="Describe…" style="min-width:160px;">
          <span class="text-muted" style="font-size:12px;">฿</span>
          <input class="form-input" type="number" id="tp-other-amt" placeholder="0.00" min="0" step="0.01" style="max-width:110px;">
        </div>
      </div>
    </div>`;
  return `
    <div class="tp-item-wrap" style="display:flex;flex-direction:column;gap:4px;">
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;">
        <input type="checkbox" class="tp-item" data-def="${_esc(def.id)}">
        ${_esc(def.label)}
      </label>
      <div class="tp-qty-row" id="tp-qty-${_esc(def.id)}" style="display:none;padding-left:26px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="text-muted" style="font-size:12px;">฿</span>
          <input class="form-input tp-amt" type="number" placeholder="0.00" min="0" step="0.01" style="max-width:110px;" data-def="${_esc(def.id)}">
          <span class="text-muted" style="font-size:12px;">×</span>
          <input class="form-input tp-qty" type="number" placeholder="1" min="1" step="1" style="max-width:70px;" data-def="${_esc(def.id)}">
          <span class="text-muted" style="font-size:12px;">${_esc(def.qtyLabel)}</span>
          <span class="tp-sub text-muted" style="font-size:12px;" data-def="${_esc(def.id)}"></span>
        </div>
      </div>
    </div>`;
}

function _updateTripTotal() {
  let total = 0;
  document.querySelectorAll('.tp-item:checked').forEach(cb => {
    const def = cb.dataset.def;
    if (def === 'daily') {
      const rate = Number(document.getElementById('tp-daily-rate')?.value) || 0;
      total += rate * _tripDays();
    } else if (def === 'other') {
      total += Number(document.getElementById('tp-other-amt')?.value) || 0;
    } else {
      const amt = Number(document.querySelector(`.tp-amt[data-def="${def}"]`)?.value) || 0;
      const qty = Number(document.querySelector(`.tp-qty[data-def="${def}"]`)?.value) || 1;
      const sub = Math.round(amt * qty * 100) / 100;
      const span = document.querySelector(`.tp-sub[data-def="${def}"]`);
      if (span) span.textContent = sub > 0 ? `= ฿${sub.toLocaleString('en',{minimumFractionDigits:2})}` : '';
      total += sub;
    }
  });
  const el = document.getElementById('tp-total-display');
  if (el) el.textContent = total.toLocaleString('en', {minimumFractionDigits:2});
  return total;
}

async function _renderTrip() {
  const wrap = document.getElementById('tv-body');
  wrap.innerHTML = `<div class="page-loading">Loading…</div>`;
  let trips = [];
  if (_myEmployee) trips = await getMyTripRequests(_myEmployee.id).catch(() => []);
  const today = _today();
  const unseenTripIds = new Set(
    trips.filter(t => ['approved','rejected'].includes(t.status) && localStorage.getItem(`trip_seen_${t.id}`) !== '1').map(t => t.id)
  );
  // Needs settlement: finance-approved, trip ended, no settlement submitted yet
  const needSettle = trips.filter(t => t.status === 'approved' && t.end_date < today && !t.settlement_status);
  const needSettleIds = new Set(needSettle.map(t => t.id));
  // Past: rejected / completed, OR approved+past with a settlement already in progress/closed
  const settled = trips.filter(t =>
    !needSettleIds.has(t.id) &&
    (['rejected','completed','cancelled'].includes(t.status) || (t.status === 'approved' && t.end_date < today))
  );
  const settledIds = new Set(settled.map(t => t.id));
  // Active: everything else (pending, manager_approved, approved-with-future-dates)
  const active = trips.filter(t => !needSettleIds.has(t.id) && !settledIds.has(t.id));

  wrap.innerHTML = `
    <div style="max-width:560px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
      <div class="form-label" style="font-size:15px;font-weight:600;">New Trip Request <span class="text-muted" style="font-weight:400;">(pre-approval for larger trips)</span></div>
      ${!_myEmployee ? `<p class="text-muted">No employee record linked. Contact an admin.</p>` : `
      <label class="form-label">Destination <span class="required">*</span>
        <input class="form-input" type="text" id="tp-dest" placeholder="City, Country"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <label class="form-label">Start <span class="required">*</span>
          <input class="form-input" type="date" id="tp-start" value="${_nextWeekday()}" style="color-scheme:dark"></label>
        <label class="form-label">End <span class="required">*</span>
          <input class="form-input" type="date" id="tp-end" value="${_nextWeekday()}" style="color-scheme:dark"></label>
      </div>
      <label class="form-label">Purpose <span class="required">*</span>
        <input class="form-input" type="text" id="tp-purpose" placeholder="Client visit, conference…"></label>
      <label class="form-label">Project <span class="required">*</span>
        <select class="form-input" id="tp-proj" required>${_projOptionsReq()}</select></label>
      <div>
        <div class="form-label">This trip will include <span class="form-hint">(check all that apply)</span></div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
          ${TRIP_ITEM_DEFS.map(_tripItemRow).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg-card,#1e1e2e);border-radius:6px;border:1px solid var(--border,#333);">
        <span class="form-label" style="margin:0;">Est. Total</span>
        <span id="tp-total-display" style="font-weight:600;font-size:15px;">0.00</span>
        <select class="form-input" id="tp-cur" style="width:90px;">${_curOpts()}</select>
      </div>
      <div style="display:flex;gap:10px;"><button class="btn btn-primary" id="tp-submit">Submit Request</button></div>
      `}
    </div>

    ${needSettle.length > 0 ? `
    <div class="section-header" style="color:var(--color-warning,#f59e0b);">
      Settlement Required <span class="text-muted">(${needSettle.length})</span>
    </div>
    <div id="tp-settle-area">
      ${needSettle.map(t => _settlementPanel(t)).join('')}
    </div>` : ''}

    <div class="section-header">My Trip Requests <span class="text-muted">(${active.length})</span></div>
    <div>${active.length === 0 ? `<p class="empty-state">No pending requests.</p>` : _tripTable(active, unseenTripIds)}</div>

    <div class="section-header mt-4" style="display:flex;align-items:center;gap:12px">Past
      <button class="btn btn-ghost btn-sm" id="tp-toggle">${_showPastTrips?`Hide past (${settled.length})`:`Show past (${settled.length})`}</button>
    </div>
    <div style="${_showPastTrips?'':'display:none'}">${settled.length === 0 ? `<p class="empty-state">None.</p>` : _tripTable(settled, unseenTripIds)}</div>
  `;

  unseenTripIds.forEach(id => localStorage.setItem(`trip_seen_${id}`, '1'));
  if (unseenTripIds.size) window.refreshExpenseBadge?.();

  if (_myEmployee) {
    // Wire up each standard (qty-based) checkbox
    document.querySelectorAll('.tp-item').forEach(cb => {
      cb.addEventListener('change', () => {
        const def = cb.dataset.def;
        if (def === 'daily') {
          const row = document.getElementById('tp-daily-row');
          if (row) row.style.display = cb.checked ? '' : 'none';
        } else if (def === 'other') {
          const row = document.getElementById('tp-other-row');
          if (row) row.style.display = cb.checked ? '' : 'none';
        } else {
          const row = document.getElementById(`tp-qty-${def}`);
          if (row) row.style.display = cb.checked ? '' : 'none';
        }
        _updateTripTotal();
      });
    });

    // Daily rate + date changes update total
    document.getElementById('tp-daily-rate')?.addEventListener('input', () => {
      const days = _tripDays();
      const rate = Number(document.getElementById('tp-daily-rate').value) || 0;
      const calc = document.getElementById('tp-daily-calc');
      if (calc) calc.textContent = rate ? `× ${days} day${days===1?'':'s'} = ฿${(rate*days).toLocaleString('en',{minimumFractionDigits:2})}` : `(${days} day${days===1?'':'s'})`;
      _updateTripTotal();
    });
    const updDailyOnDate = () => {
      const days = _tripDays();
      const rate = Number(document.getElementById('tp-daily-rate')?.value) || 0;
      const calc = document.getElementById('tp-daily-calc');
      if (calc) calc.textContent = rate ? `× ${days} day${days===1?'':'s'} = ฿${(rate*days).toLocaleString('en',{minimumFractionDigits:2})}` : `(${days} day${days===1?'':'s'})`;
      _updateTripTotal();
    };
    document.getElementById('tp-start')?.addEventListener('change', updDailyOnDate);
    document.getElementById('tp-end')?.addEventListener('change', updDailyOnDate);

    // Qty + amount inputs update total + subtotal label
    wrap.querySelectorAll('.tp-amt, .tp-qty').forEach(inp => {
      inp.addEventListener('input', _updateTripTotal);
    });
    document.getElementById('tp-other-amt')?.addEventListener('input', _updateTripTotal);

    document.getElementById('tp-submit')?.addEventListener('click', _submitTrip);

    // Settlement submit buttons
    wrap.querySelectorAll('.tp-settle-submit').forEach(btn => {
      btn.addEventListener('click', () => _submitSettlement(btn.dataset.id));
    });
  }
  document.getElementById('tp-toggle')?.addEventListener('click', () => { _showPastTrips = !_showPastTrips; _renderTrip(); });
  wrap.querySelectorAll('.exp-cancel-trip').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await cancelTripRequest(btn.dataset.id);
        window.showToast?.('Trip request cancelled.', 'success');
        _renderTrip();
      } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
    });
  });
}

function _tripTable(trips, unseenIds = new Set()) {
  return `<div class="table-wrapper"><table class="data-table">
    <thead><tr><th>Ref</th><th>Destination</th><th>Dates</th><th>Advance</th><th>Purpose</th><th>Status</th><th>Settlement</th><th></th></tr></thead>
    <tbody>${trips.map(t => {
      const settleCell = t.settlement_status === 'closed'
        ? `<small class="badge badge-approved">Closed</small><br><small class="text-muted">Actual: ${t.settlement_actual_amount != null ? _money(t.settlement_actual_amount, t.currency) : '—'}</small>`
        : t.settlement_status === 'submitted'
        ? `<small class="badge badge-warning">Submitted</small>`
        : '—';
      return `<tr${unseenIds.has(t.id) ? ' style="background:rgba(76,175,80,0.07)"' : ''}>
        <td>${_esc(t.travel_ref || '—')}</td>
        <td>${_esc(t.destination)}</td>
        <td>${_fmt(t.start_date)} – ${_fmt(t.end_date)}</td>
        <td>${t.estimated_cost ? _money(t.estimated_cost, t.currency) : '—'}</td>
        <td>${_esc(t.purpose)}${(t.cost_items && t.cost_items.length) ? `<br><small class="text-muted">Incl: ${_esc(_costItemsText(t.cost_items))}</small>` : ''}</td>
        <td>${_badge(t.status)}${unseenIds.has(t.id) ? ' <span class="badge" style="background:#4caf50;color:#000;font-size:10px;vertical-align:middle;margin-left:4px">NEW</span>' : ''}${t.rejection_reason ? `<br><small class="text-muted">${_esc(t.rejection_reason)}</small>` : ''}</td>
        <td>${settleCell}</td>
        <td style="white-space:nowrap;">${t.status === 'pending' ? `<button class="btn btn-sm btn-ghost exp-cancel-trip" data-id="${_esc(t.id)}">Cancel</button>` : t.status === 'manager_approved' ? `<span style="font-size:11px;color:var(--text-muted);">Contact admin</span>` : ''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// Renders a settlement panel for a single trip (approved + past end_date).
function _settlementPanel(t) {
  const items = (t.cost_items || []);
  const rows = items.length
    ? items.map((it, i) => `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
        <span style="min-width:180px;font-size:13px;">${_esc(it.label || `Item ${i+1}`)}</span>
        <span class="text-muted" style="font-size:12px;">Advance: ${it.amount != null ? `฿${Number(it.amount).toLocaleString('en',{minimumFractionDigits:2})}` : (it.subtotal != null ? `฿${Number(it.subtotal).toLocaleString('en',{minimumFractionDigits:2})}` : '—')}</span>
        <span class="text-muted" style="font-size:12px;">→ Actual ฿</span>
        <input class="form-input tp-settle-actual" type="number" placeholder="0.00" min="0" step="0.01"
          data-i="${i}" style="max-width:110px;">
      </div>`).join('')
    : `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
        <span style="font-size:13px;">Total actual expenses ฿</span>
        <input class="form-input tp-settle-actual-total" type="number" placeholder="0.00" min="0" step="0.01" style="max-width:130px;">
      </div>`;
  return `
    <div style="border:1px solid var(--color-warning,#f59e0b);border-radius:8px;padding:16px;margin-bottom:16px;" id="settle-panel-${_esc(t.id)}">
      <div style="font-weight:600;margin-bottom:8px;">${_esc(t.destination)} &nbsp;·&nbsp; ${_fmt(t.start_date)} – ${_fmt(t.end_date)}</div>
      <div style="margin-bottom:4px;font-size:13px;color:var(--text-muted);">Advance issued: ${t.estimated_cost ? _money(t.estimated_cost, t.currency) : '—'}</div>
      <div style="margin-bottom:12px;font-size:13px;">Enter actual amounts per item below:</div>
      ${rows}
      <label class="form-label" style="margin-top:8px;">Note (optional)
        <input class="form-input tp-settle-note" type="text" id="tp-settle-note-${_esc(t.id)}" placeholder="Receipts attached, any explanation…">
      </label>
      <div style="margin-top:8px;display:flex;gap:10px;align-items:center;">
        <button class="btn btn-primary tp-settle-submit" data-id="${_esc(t.id)}">Submit Settlement</button>
        <span class="tp-settle-diff text-muted" style="font-size:13px;" id="tp-settle-diff-${_esc(t.id)}"></span>
      </div>
    </div>`;
}

async function _submitSettlement(tripId) {
  const panel = document.getElementById(`settle-panel-${tripId}`);
  const btn = panel?.querySelector('.tp-settle-submit');
  if (btn) btn.disabled = true;
  try {
    const advance = Number(panel?.closest('[data-advance]')?.dataset.advance) || 0;
    // Collect per-item actuals
    const actualInputs = panel?.querySelectorAll('.tp-settle-actual');
    let actualItems = [];
    if (actualInputs && actualInputs.length) {
      // We need the original cost_items labels — re-fetch from the trip data cached in the DOM
      // labels are in the row spans
      actualInputs.forEach((inp, i) => {
        const labelEl = inp.closest('div')?.querySelector('span');
        actualItems.push({ label: labelEl?.textContent?.trim() || `Item ${i+1}`, amount: Number(inp.value) || 0 });
      });
    } else {
      // Single total input (no line items)
      const tot = panel?.querySelector('.tp-settle-actual-total');
      actualItems = [{ label: 'Total', amount: Number(tot?.value) || 0 }];
    }
    const note = panel?.querySelector('.tp-settle-note')?.value?.trim() || '';
    const actualTotal = actualItems.reduce((s, i) => s + i.amount, 0);
    if (!(actualTotal >= 0)) throw new Error('Enter at least one actual amount.');
    await submitSettlement(tripId, { actualItems, note });
    window.showToast?.('Settlement submitted for approval.', 'success');
    _renderTrip();
  } catch (err) {
    window.showToast?.(err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

async function _submitTrip() {
  const btn = document.getElementById('tp-submit'); btn.disabled = true;
  try {
    const start = document.getElementById('tp-start').value;
    const end   = document.getElementById('tp-end').value;
    if (start && start < todayISO())  throw new Error('Start date cannot be in the past.');
    if (start && _isWeekend(start)) throw new Error('Start date cannot be a weekend day.');
    if (end   && _isWeekend(end))   throw new Error('End date cannot be a weekend day.');

    const costItems = [];
    let estimatedCost = 0;

    for (const cb of document.querySelectorAll('.tp-item:checked')) {
      const def = cb.dataset.def;
      if (def === 'daily') {
        const perDay = Number(document.getElementById('tp-daily-rate')?.value) || 0;
        if (!(perDay > 0)) throw new Error('Enter the estimated daily amount for "Daily allowance".');
        const days = _tripDays();
        const amount = Math.round(perDay * days * 100) / 100;
        costItems.push({ label: 'Daily allowance (transport + meals)', perDay, days, amount });
        estimatedCost += amount;
      } else if (def === 'other') {
        const text = document.getElementById('tp-other-text')?.value.trim();
        if (!text) throw new Error('Please describe the "Other" items to include.');
        const amount = Math.round((Number(document.getElementById('tp-other-amt')?.value) || 0) * 100) / 100;
        costItems.push({ label: `Other: ${text}`, amount, qty: 1, subtotal: amount });
        estimatedCost += amount;
      } else {
        const defMeta = TRIP_ITEM_DEFS.find(d => d.id === def);
        const label   = defMeta ? defMeta.label : def;
        const amount  = Math.round((Number(document.querySelector(`.tp-amt[data-def="${def}"]`)?.value) || 0) * 100) / 100;
        const qty     = Math.max(1, Math.round(Number(document.querySelector(`.tp-qty[data-def="${def}"]`)?.value) || 1));
        const subtotal = Math.round(amount * qty * 100) / 100;
        costItems.push({ label, amount, qty, subtotal, qtyLabel: defMeta?.qtyLabel || 'times' });
        estimatedCost += subtotal;
      }
    }

    if (costItems.length === 0) throw new Error('Please check at least one item this trip will include.');

    await submitTripRequest({
      employeeId:    _myEmployee.id,
      destination:   document.getElementById('tp-dest').value.trim(),
      startDate:     start, endDate: end,
      purpose:       document.getElementById('tp-purpose').value.trim(),
      projectId:     document.getElementById('tp-proj').value || null,
      estimatedCost: estimatedCost > 0 ? estimatedCost : null,
      currency:      document.getElementById('tp-cur').value,
      costItems,
    });
    window.showToast?.('Trip request submitted.', 'success');
    _renderTrip();
  } catch (err) { window.showToast?.(err.message, 'error'); btn.disabled = false; }
}

// ═══════════════════════════════════════════ APPROVALS
async function _renderApprovals() {
  const body = document.getElementById('exp-body');
  body.innerHTML = `
    <div class="tabs" id="ap-sub" style="margin-bottom:16px">
      <button class="tab-btn${_approvSub==='pending'?' active':''}" data-tab="pending">PENDING <span id="exp-pending-count" class="badge badge-pending" style="margin-left:6px;${_pendingApprovals>0?'':'display:none;'}">${_pendingApprovals}</span></button>
      <button class="tab-btn${_approvSub==='history'?' active':''}" data-tab="history">HISTORY</button>
    </div>
    <div id="ap-body"><div class="page-loading">Loading…</div></div>`;
  document.getElementById('ap-sub').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    _approvSub = btn.dataset.tab;
    _saveTabState();
    document.querySelectorAll('#ap-sub .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === _approvSub));
    _loadApprovals();
  });
  _loadApprovals();
}

// Visible error state for money-critical loads (M-SILENT) — never silently show empty/zero.
function _loadErrorHtml(retryId, title, sub) {
  return `
    <div class="empty-state" style="margin-top:60px">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-sub">${sub}</div>
      <button class="btn btn-secondary" id="${retryId}" style="margin-top:16px">Retry</button>
    </div>`;
}

async function _loadApprovals() {
  const wrap = document.getElementById('ap-body');
  wrap.innerHTML = `<div class="page-loading">Loading…</div>`;

  try {
    if (_approvSub === 'pending') {
      const [exp, expMA, claims, claimsMA, trips, tripsMA, settlements] = await Promise.all([
        getAllTransactions({ direction:'out', status:'pending' }),
        getAllTransactions({ direction:'out', status:'manager_approved' }),
        getAllTravelClaims({ status:'pending' }),
        getAllTravelClaims({ status:'manager_approved' }),
        getAllTripRequests({ status:'pending' }),
        getAllTripRequests({ status:'manager_approved' }),
        supabase.from('travel_requests').select(
          'id, employee_id, destination, start_date, end_date, estimated_cost, currency, settlement_actual_amount, settlement_actual_items, settlement_note, settlement_submitted_at, travel_ref, employee:employees(full_name)'
        ).eq('settlement_status', 'submitted').then(r => { if (r.error) throw r.error; return r.data || []; }),
      ]);
      _pendingData = {
        exp:         [...exp, ...expMA],
        claims:      [...claims, ...claimsMA],
        trips:       [...trips, ...tripsMA],
        settlements,
      };
      _renderPending(wrap);
    } else {
      const [exp, claims, trips] = await Promise.all([
        getAllTransactions({ direction:'out' }),
        getAllTravelClaims({}),
        getAllTripRequests({}),
      ]);
      _renderApprovalHistory(wrap, exp, claims, trips);
    }
  } catch (err) {
    wrap.innerHTML = _loadErrorHtml('ap-retry', 'Couldn’t load approvals',
      'A network or database error occurred — pending items may be hidden. Check your connection and retry.');
    document.getElementById('ap-retry')?.addEventListener('click', _loadApprovals);
  }
}

function _renderPending(wrap) {
  const wk = _apWeekStart;
  // Week filter is client-side over the cached fetch, by each item's relevant date.
  const exp    = _pendingData.exp.filter(t => _inWeek(t.txn_date, wk));
  const claims = _pendingData.claims.filter(c => _inWeek(c.travel_date, wk));
  const trips  = _pendingData.trips.filter(t => _inWeek(t.start_date, wk));
  const settlements = _pendingData.settlements.filter(t => _inWeek(t.settlement_submitted_at, wk));

  const expTable = exp.length === 0 ? `<p class="empty-state">None.</p>`
    : `<div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Employee</th><th>Date</th><th>Category</th><th>Project</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${exp.map(t => `<tr>
          <td>${_esc(t.employee?.full_name||'—')}</td><td>${_fmt(t.txn_date)}</td>
          <td>${_esc(t.category?.name||'—')}</td><td>${_esc(t.project?.name||'—')}</td>
          <td>${_money(t.amount,t.currency)}</td><td>${_badge(t.status)}</td>
          <td class="row-actions">${_admin?`<button class="btn btn-ghost btn-sm edit-pend-btn" data-kind="exp" data-id="${_esc(t.id)}">Edit</button>`:''}${_apprBtns('exp', t.id, t.status)}</td></tr>`).join('')}</tbody></table></div>`;

  const clTable = claims.length === 0 ? `<p class="empty-state">None.</p>`
    : `<div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Employee</th><th>Date</th><th>Route</th><th>Vehicle</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${claims.map(c => `<tr>
          <td>${_esc(c.employee?.full_name||'—')}</td><td>${_fmt(c.travel_date)}</td>
          <td>${_esc(c.route)}</td><td>${_esc(c.vehicle?.label||c.vehicle_code)}</td>
          <td>${_money(Number(c.computed_reimbursement)+Number(c.computed_depreciation),c.currency)}</td><td>${_badge(c.status)}</td>
          <td class="row-actions">${_admin?`<button class="btn btn-ghost btn-sm edit-pend-btn" data-kind="claim" data-id="${_esc(c.id)}">Edit</button>`:''}${_apprBtns('claim', c.id, c.status)}</td></tr>`).join('')}</tbody></table></div>`;

  const tpTable = trips.length === 0 ? `<p class="empty-state">None.</p>`
    : `<div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Employee</th><th>Destination</th><th>Dates</th><th>Est. Cost</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${trips.map(t => `<tr>
          <td>${_esc(t.employee?.full_name||'—')}</td>
          <td>${_esc(t.destination)}${(t.cost_items && t.cost_items.length) ? `<br><small class="text-muted">Incl: ${_esc(_costItemsText(t.cost_items))}</small>` : ''}</td>
          <td>${_fmt(t.start_date)}–${_fmt(t.end_date)}</td><td>${t.estimated_cost?_money(t.estimated_cost,t.currency):'—'}</td>
          <td>${_badge(t.status)}</td><td class="row-actions">${_admin?`<button class="btn btn-ghost btn-sm edit-pend-btn" data-kind="trip" data-id="${_esc(t.id)}">Edit</button>`:''}${_apprBtns('trip', t.id, t.status)}</td></tr>`).join('')}</tbody></table></div>`;

  const stTable = settlements.length === 0 ? `<p class="empty-state">None.</p>`
    : `<div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Employee</th><th>Trip</th><th>Dates</th><th>Advance</th><th>Actual</th><th>Actions</th></tr></thead>
        <tbody>${settlements.map(t => {
          const advance = Number(t.estimated_cost) || 0;
          const actual  = Number(t.settlement_actual_amount) || 0;
          const diff    = Math.round((actual - advance) * 100) / 100;
          const diffLabel = diff === 0 ? 'No difference'
            : diff > 0 ? `Claim ฿${diff.toLocaleString('en',{minimumFractionDigits:2})} more`
            : `Return ฿${Math.abs(diff).toLocaleString('en',{minimumFractionDigits:2})}`;
          return `<tr>
            <td>${_esc(t.employee?.full_name||'—')}</td>
            <td>${_esc(t.travel_ref||'—')}<br><small class="text-muted">${_esc(t.destination)}</small></td>
            <td>${_fmt(t.start_date)}–${_fmt(t.end_date)}</td>
            <td>${_money(advance, t.currency)}</td>
            <td>${_money(actual, t.currency)}<br><small class="text-muted">${_esc(diffLabel)}</small></td>
            <td class="row-actions"><button class="btn btn-primary btn-sm settle-appr-btn" data-id="${_esc(t.id)}">Approve</button></td></tr>`;
        }).join('')}</tbody></table></div>`;

  const cats = [
    { key:'expense',    label:'Expenses',       n:exp.length,         table:expTable },
    { key:'mileage',    label:'Mileage Claims',  n:claims.length,      table:clTable  },
    { key:'trip',       label:'Trip Requests',   n:trips.length,       table:tpTable  },
    { key:'settlement', label:'Settlements',     n:settlements.length, table:stTable  },
  ];
  const active = cats.find(c => c.key === _pendingCat) || cats[0];

  wrap.innerHTML = `
    <div style="margin-bottom:14px;">${weekNavHtml('ap', wk, { allowAll: true })}</div>
    <div class="tabs" id="ap-cat" style="margin-bottom:16px">
      ${cats.map(c => `<button class="tab-btn${_pendingCat===c.key?' active':''}" data-cat="${c.key}">${c.label}
        <span class="badge badge-pending" style="margin-left:6px;${c.n>0?'':'display:none'}">${c.n}</span></button>`).join('')}
    </div>
    <div>${active.table}</div>
  `;

  document.getElementById('ap-cat').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    _pendingCat = btn.dataset.cat;
    _saveTabState();
    _renderPending(wrap);
  });
  wireWeekNav('ap', () => _apWeekStart, v => { _apWeekStart = v; }, () => _renderPending(wrap));
  _wireApprovals(wrap);
}

function _apprBtns(kind, id, status) {
  const tier = status === 'manager_approved' ? 'finance' : 'manager';
  const label = (status === 'manager_approved' && _admin) ? 'Final Approve' : 'Approve';
  if (status === 'manager_approved' && !_admin) return '<span class="text-muted">awaiting finance</span>';
  return `<button class="btn btn-primary btn-sm appr-btn" data-kind="${kind}" data-id="${id}" data-tier="${tier}">${label}</button>
          <button class="btn btn-danger btn-sm rej-btn" data-kind="${kind}" data-id="${id}">Reject</button>`;
}

function _wireApprovals(wrap) {
  wrap.querySelectorAll('.edit-pend-btn').forEach(btn => btn.addEventListener('click', () => {
    const kind = btn.dataset.kind, id = btn.dataset.id;
    let item;
    if (kind === 'exp')   item = _pendingData.exp.find(t => t.id === id);
    if (kind === 'claim') item = _pendingData.claims.find(c => c.id === id);
    if (kind === 'trip')  item = _pendingData.trips.find(t => t.id === id);
    if (item) _openEditModal(kind, item);
  }));
  const approveFns = { exp: approveTransaction, claim: approveTravelClaim, trip: approveTripRequest };
  const rejectFns  = { exp: rejectTransaction,  claim: rejectTravelClaim,  trip: rejectTripRequest };
  wrap.querySelectorAll('.appr-btn').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await approveFns[btn.dataset.kind](btn.dataset.id, btn.dataset.tier, _profile.id);
      window.showToast?.('Approved.', 'success'); window.refreshExpenseBadge?.(); await _refreshPendingCount(); _updateApprovalsTabBadge(); _loadApprovals();
    } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
  }));
  wrap.querySelectorAll('.rej-btn').forEach(btn => btn.addEventListener('click', () => {
    _openRejectModal(btn.dataset.kind, btn.dataset.id);
  }));
  wrap.querySelectorAll('.settle-appr-btn').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await approveSettlement(btn.dataset.id);
      window.showToast?.('Settlement approved — float entry posted.', 'success'); window.refreshExpenseBadge?.(); await _refreshPendingCount(); _updateApprovalsTabBadge(); _loadApprovals();
    } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
  }));
}

// ─── Admin edit modal (pre-filled, same fields as submission form) ────────────
function _openEditModal(kind, item) {
  document.getElementById('exp-edit-modal')?.remove();

  const catOpts = _catOut().map(c => `<option value="${c.id}" ${(item.category_id && parseInt(item.category_id)===c.id)?'selected':''}>${_esc(c.name)}</option>`).join('');
  const vehOpts = _vehicles.map(v => `<option value="${_esc(v.code)}" ${item.vehicle_code===v.code?'selected':''}>${_esc(v.label)} (${Number(v.fuel_rate_per_km)+Number(v.depreciation_per_km)}/km)</option>`).join('');

  let title = '', formHtml = '';

  if (kind === 'exp') {
    title = 'Edit Expense';
    formHtml = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <label class="form-label">Date <span class="required">*</span><input class="form-input" type="date" id="edt-date" value="${_esc(item.txn_date||'')}" max="${_today()}" style="color-scheme:dark"></label>
        <label class="form-label">Amount <span class="required">*</span><input class="form-input" type="number" id="edt-amt" value="${item.amount||''}" step="0.01" min="0.01"></label>
      </div>
      <label class="form-label" style="display:block;margin-bottom:14px;">Category<select class="form-input" id="edt-cat"><option value="">—</option>${catOpts}</select></label>
      <label class="form-label" style="display:block;margin-bottom:14px;">Project / Purpose<select class="form-input" id="edt-proj">${_projOptions(item.project_id)}</select></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <label class="form-label">Currency<select class="form-input" id="edt-cur">
          <option ${item.currency==='THB'?'selected':''}>THB</option>
          <option ${item.currency==='USD'?'selected':''}>USD</option>
          <option ${item.currency==='EUR'?'selected':''}>EUR</option>
          <option ${item.currency==='GBP'?'selected':''}>GBP</option>
        </select></label>
        <label class="form-label">Receipt URL<input class="form-input" type="url" id="edt-rcpt" value="${_esc(item.receipt_url||'')}" placeholder="https://…"></label>
      </div>
      <label class="form-label" style="display:block;">Note<textarea class="form-input" id="edt-note" rows="3" style="resize:vertical;">${_esc(item.note||'')}</textarea></label>`;
  } else if (kind === 'claim') {
    const isPublic = item.vehicle_code === 'public';
    title = 'Edit Mileage Claim';
    formHtml = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <label class="form-label">Travel Date <span class="required">*</span><input class="form-input" type="date" id="edt-date" value="${_esc(item.travel_date||'')}" style="color-scheme:dark"></label>
        <label class="form-label">Project / Purpose<select class="form-input" id="edt-proj">${_projOptions(item.project_id)}</select></label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <label class="form-label">Vehicle <span class="required">*</span><select class="form-input" id="edt-veh">${vehOpts}</select></label>
        <label class="form-label">Trip Type <span class="required">*</span><select class="form-input" id="edt-trip">
          <option value="one_way" ${item.trip_type==='one_way'?'selected':''}>One Way</option>
          <option value="round_trip" ${item.trip_type==='round_trip'?'selected':''}>Round Trip</option>
        </select></label>
      </div>
      <label class="form-label" style="display:block;margin-bottom:14px;">Route <span class="required">*</span><input class="form-input" type="text" id="edt-route" value="${_esc(item.route||'')}"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <label class="form-label">Distance (km)${isPublic?' <span class="text-muted">(n/a public)</span>':''}<input class="form-input" type="number" id="edt-dist" value="${item.distance_km||''}" step="0.1" min="0" ${isPublic?'disabled':''}></label>
        <label class="form-label">Manual Amount (public transport)${!isPublic?' <span class="text-muted">(n/a)</span>':''}<input class="form-input" type="number" id="edt-manual" value="${item.manual_amount||''}" step="0.01" min="0" ${!isPublic?'disabled':''}></label>
      </div>
      <label class="form-label" style="display:block;">Note<input class="form-input" type="text" id="edt-note" value="${_esc(item.note||'')}"></label>`;
  } else if (kind === 'trip') {
    title = 'Edit Trip Request';
    formHtml = `
      <label class="form-label" style="display:block;margin-bottom:14px;">Destination <span class="required">*</span><input class="form-input" type="text" id="edt-dest" value="${_esc(item.destination||'')}"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <label class="form-label">Start Date <span class="required">*</span><input class="form-input" type="date" id="edt-start" value="${_esc(item.start_date||'')}" style="color-scheme:dark"></label>
        <label class="form-label">End Date <span class="required">*</span><input class="form-input" type="date" id="edt-end" value="${_esc(item.end_date||'')}" style="color-scheme:dark"></label>
      </div>
      <label class="form-label" style="display:block;margin-bottom:14px;">Purpose <span class="required">*</span><textarea class="form-input" id="edt-purpose" rows="2" style="resize:vertical;">${_esc(item.purpose||'')}</textarea></label>
      <label class="form-label" style="display:block;margin-bottom:14px;">Project <span class="required">*</span><select class="form-input" id="edt-proj" required>${_projOptionsReq(item.project_id)}</select></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:6px;">
        <label class="form-label">Est. Cost<input class="form-input" type="number" id="edt-cost" value="${item.estimated_cost||''}" step="0.01" min="0"></label>
        <label class="form-label">Currency<select class="form-input" id="edt-cur">
          <option ${item.currency==='THB'?'selected':''}>THB</option>
          <option ${item.currency==='USD'?'selected':''}>USD</option>
        </select></label>
      </div>
      <p style="font-size:12px;color:var(--text-secondary);margin:0;">Cost line-item breakdown not editable here — adjust the total above.</p>`;
  }

  const canApproveNow = _admin && ['pending', 'manager_approved'].includes(item.status);

  const modal = document.createElement('div');
  modal.id = 'exp-edit-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal modal-lg" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">${title}</div>
        <button class="modal-close" id="edt-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body" style="overflow-y:auto;max-height:65vh;">${formHtml}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="edt-cancel">Cancel</button>
        ${canApproveNow ? `<button class="btn btn-primary" id="edt-save-approve">Save &amp; Approve</button>` : ''}
        <button class="btn btn-ghost" id="edt-save">Save Changes</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  document.getElementById('edt-close').addEventListener('click', close);
  document.getElementById('edt-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  if (kind === 'exp') {
    const _applyEdtCatLock = () => {
      const catSel  = document.getElementById('edt-cat');
      const projSel = document.getElementById('edt-proj');
      if (!catSel || !projSel) return;
      const catName = _categories.find(c => c.id === parseInt(catSel.value))?.name;
      const officeId = _officeProjectId();
      if (catName && OFFICE_CAT_NAMES.has(catName) && officeId) {
        projSel.value = officeId;
        projSel.disabled = true;
      } else {
        projSel.disabled = false;
      }
    };
    _applyEdtCatLock();
    document.getElementById('edt-cat').addEventListener('change', _applyEdtCatLock);
  }

  async function _doSave() {
    if (kind === 'exp') {
      await updateTransaction(item.id, {
        txnDate:    document.getElementById('edt-date').value,
        amount:     document.getElementById('edt-amt').value,
        categoryId: parseInt(document.getElementById('edt-cat').value) || null,
        projectId:  document.getElementById('edt-proj').value || null,
        currency:   document.getElementById('edt-cur').value,
        note:       document.getElementById('edt-note').value.trim() || null,
        receiptUrl: document.getElementById('edt-rcpt').value.trim() || null,
      });
    } else if (kind === 'claim') {
      await updateTravelClaim(item.id, {
        travelDate:   document.getElementById('edt-date').value,
        projectId:    document.getElementById('edt-proj').value || null,
        route:        document.getElementById('edt-route').value,
        tripType:     document.getElementById('edt-trip').value,
        vehicleCode:  document.getElementById('edt-veh').value,
        distanceKm:   document.getElementById('edt-dist').value,
        manualAmount: document.getElementById('edt-manual').value,
        currency:     'THB',
        note:         document.getElementById('edt-note').value.trim() || null,
      });
    } else if (kind === 'trip') {
      await updateTripRequest(item.id, {
        destination:   document.getElementById('edt-dest').value,
        startDate:     document.getElementById('edt-start').value,
        endDate:       document.getElementById('edt-end').value,
        purpose:       document.getElementById('edt-purpose').value,
        projectId:     document.getElementById('edt-proj').value || null,
        estimatedCost: document.getElementById('edt-cost').value,
        currency:      document.getElementById('edt-cur').value,
      });
    }
  }

  document.getElementById('edt-save').addEventListener('click', async () => {
    const saveBtn = document.getElementById('edt-save');
    saveBtn.disabled = true;
    try {
      await _doSave();
      window.showToast?.('Changes saved.', 'success');
      close();
      _loadApprovals();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      saveBtn.disabled = false;
    }
  });

  if (canApproveNow) {
    const approveFns = { exp: approveTransaction, claim: approveTravelClaim, trip: approveTripRequest };
    document.getElementById('edt-save-approve').addEventListener('click', async () => {
      const approveBtn = document.getElementById('edt-save-approve');
      approveBtn.disabled = true;
      try {
        await _doSave();
        // Two-stage approve; checkpoint local status after each step so a partial
        // failure (e.g. the finance step errors) leaves a clean retry path instead
        // of stranding the item at manager_approved with a stale 'pending' status (M-APPROVE).
        if (item.status === 'pending') {
          await approveFns[kind](item.id, 'manager', _profile.id);
          item.status = 'manager_approved';
        }
        await approveFns[kind](item.id, 'finance', _profile.id);
        item.status = 'approved';
        window.showToast?.('Saved & Approved.', 'success');
        close();
        window.refreshExpenseBadge?.();
        await _refreshPendingCount();
        _updateApprovalsTabBadge();
        _loadApprovals();
      } catch (err) {
        window.showToast?.(err.message, 'error');
        approveBtn.disabled = false;
      }
    });
  }
}

function _renderApprovalHistory(wrap, exp, claims, trips) {
  _historyItems = [
    ...exp.map(t => ({ type:'Expense', date:t.updated_at, who:t.employee?.full_name, detail:`${t.category?.name||'—'} · ${_fmt(t.txn_date)}`, amount:_money(t.amount,t.currency), status:t.status, id:t.id, kind:'exp', raw:t })),
    ...claims.map(c => ({ type:'Mileage', date:c.updated_at, who:c.employee?.full_name, detail:`${c.route} · ${_fmt(c.travel_date)}`, amount:_money(Number(c.computed_reimbursement)+Number(c.computed_depreciation),c.currency), status:c.status, id:c.id, kind:'claim', raw:c })),
    ...trips.map(t => ({ type:'Trip', date:t.updated_at, who:t.employee?.full_name, detail:`${t.destination} · ${_fmt(t.start_date)}`, amount:t.estimated_cost?_money(t.estimated_cost,t.currency):'—', status:t.status, id:t.id, kind:'trip', raw:t })),
  ].sort((a,b) => new Date(b.date) - new Date(a.date));
  const items = _historyItems;

  wrap.innerHTML = `
    <div class="section-header">All Requests <span class="text-muted">(${items.length})</span></div>
    ${items.length===0?`<p class="empty-state">None.</p>`:`<div class="table-wrapper"><table class="data-table">
      <thead><tr><th>Type</th><th>Employee</th><th>Detail</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${items.map(i => `<tr>
        <td>${i.type}</td><td>${_esc(i.who||'—')}</td><td>${_esc(i.detail)}</td>
        <td>${i.amount}</td><td>${_badge(i.status)}</td>
        <td class="row-actions">
          ${_admin ? `<button class="btn btn-ghost btn-sm edit-hist-btn" data-kind="${_esc(i.kind)}" data-id="${_esc(i.id)}">Edit</button>` : ''}
          <button class="btn btn-ghost btn-sm ovr-btn" data-kind="${_esc(i.kind)}" data-id="${_esc(i.id)}">Override</button>
        </td>
      </tr>`).join('')}</tbody></table></div>`}
  `;
  wrap.querySelectorAll('.ovr-btn').forEach(btn => btn.addEventListener('click', () => {
    _openOverrideModal(btn.dataset.kind, btn.dataset.id);
  }));
  wrap.querySelectorAll('.edit-hist-btn').forEach(btn => btn.addEventListener('click', () => {
    const found = _historyItems.find(i => i.kind === btn.dataset.kind && i.id === btn.dataset.id);
    if (found) _openEditModal(found.kind, found.raw);
  }));
}

// Override-status modal: dropdown of valid statuses, preselected to the current one.
function _openRejectModal(kind, id) {
  const rejectFns = { exp: rejectTransaction, claim: rejectTravelClaim, trip: rejectTripRequest };
  let item;
  if (kind === 'exp')   item = _pendingData.exp.find(t => t.id === id);
  if (kind === 'claim') item = _pendingData.claims.find(c => c.id === id);
  if (kind === 'trip')  item = _pendingData.trips.find(t => t.id === id);

  let detail = '';
  if (item) {
    const who = _esc(item.employee?.full_name || '');
    if (kind === 'exp')   detail = [who, _esc(item.category_name||''), item.amount != null ? `${_esc(String(item.amount))} ${_esc(item.currency||'')}` : ''].filter(Boolean).join(' · ');
    if (kind === 'claim') detail = [who, _esc(item.vehicle_type||''), _esc(item.route_summary||'')].filter(Boolean).join(' · ');
    if (kind === 'trip')  detail = [who, _esc(item.destination||''), _esc(item.start_date||'')].filter(Boolean).join(' · ');
  }

  const modal = document.createElement('div');
  modal.id = 'exp-rej-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">Reject Request</div>
        <button class="modal-close" id="rej-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        ${detail ? `<p style="margin:0 0 12px;font-size:13px;color:var(--text-secondary);">${detail}</p>` : ''}
        <label class="form-label">Reason <span style="color:var(--text-secondary);font-weight:400">(optional)</span>
          <textarea class="form-input" id="rej-reason" rows="3" placeholder="Enter rejection reason…" style="resize:vertical"></textarea>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="rej-cancel">Cancel</button>
        <button class="btn btn-danger" id="rej-apply">Reject</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  document.getElementById('rej-close').addEventListener('click', close);
  document.getElementById('rej-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  document.getElementById('rej-apply').addEventListener('click', async () => {
    const applyBtn = document.getElementById('rej-apply');
    const reason = document.getElementById('rej-reason').value.trim();
    applyBtn.disabled = true;
    try {
      await rejectFns[kind](id, _profile.id, reason);
      window.showToast?.('Rejected.', 'success');
      window.refreshExpenseBadge?.();
      await _refreshPendingCount();
      _updateApprovalsTabBadge();
      _loadApprovals();
      close();
    } catch (e) { window.showToast?.(e.message, 'error'); applyBtn.disabled = false; }
  });
}

function _openOverrideModal(kind, id) {
  const item = _historyItems.find(i => i.kind === kind && i.id === id);
  const opts = kind === 'trip'
    ? ['pending','manager_approved','approved','rejected','completed','cancelled']
    : ['pending','manager_approved','approved','rejected','cancelled'];

  const modal = document.createElement('div');
  modal.id = 'exp-ovr-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">Override Status</div>
        <button class="modal-close" id="ovr-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        ${item ? `<p style="margin:0 0 12px;font-size:13px;color:var(--text-secondary);">
          ${_esc(item.type)} · ${_esc(item.who || '—')} · ${_esc(item.detail || '')}
        </p>` : ''}
        <label class="form-label">Status
          <select class="form-input" id="ovr-status">
            ${opts.map(s => `<option value="${s}"${item && item.status === s ? ' selected' : ''}>${_esc(STATUS_LABELS[s] || s)}</option>`).join('')}
          </select></label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="ovr-cancel">Cancel</button>
        <button class="btn btn-primary" id="ovr-apply">Apply</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  document.getElementById('ovr-close').addEventListener('click', close);
  document.getElementById('ovr-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  document.getElementById('ovr-apply').addEventListener('click', async () => {
    const applyBtn = document.getElementById('ovr-apply');
    const status = document.getElementById('ovr-status').value;
    applyBtn.disabled = true;
    try {
      if (kind === 'exp')   await overrideTransactionStatus(id, status);
      if (kind === 'claim') {
        if (status === 'cancelled') await cancelTravelClaim(id);
        else await approveTravelClaim(id, status === 'approved' ? 'finance' : 'manager', _profile.id).catch(async () => {});
      }
      if (kind === 'trip')  await overrideTripStatus(id, status);
      window.showToast?.('Status updated.', 'success');
      close();
      _loadApprovals();
    } catch (e) { window.showToast?.(e.message, 'error'); applyBtn.disabled = false; }
  });
}

// ═══════════════════════════════════════════ PETTY CASH (admin)
async function _renderPettyCash() {
  const body = document.getElementById('exp-body');
  body.innerHTML = `
    <div class="tabs" id="pc-sub" style="margin-bottom:16px">
      <button class="tab-btn${_pettyCashSub==='ledger'?' active':''}" data-tab="ledger">LEDGER</button>
      <button class="tab-btn${_pettyCashSub==='topup'?' active':''}" data-tab="topup">RECORD TOP-UP</button>
    </div>
    <div id="pc-body"><div class="page-loading">Loading…</div></div>`;
  document.getElementById('pc-sub').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    _pettyCashSub = btn.dataset.tab;
    _saveTabState();
    document.querySelectorAll('#pc-sub .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === _pettyCashSub));
    _loadPettyCash();
  });
  _loadPettyCash();
}

async function _loadPettyCash() {
  const wrap = document.getElementById('pc-body');
  wrap.innerHTML = `<div class="page-loading">Loading…</div>`;
  if (_pettyCashSub === 'topup') { _renderTopupForm(wrap); return; }
  try {
    const [bal, txns, pending] = await Promise.all([
      getRunningBalance(),
      getAllTransactions({}),
      getPendingReimbursements(),
    ]);
    _renderLedger(wrap, bal, txns, pending);
  } catch (err) {
    wrap.innerHTML = _loadErrorHtml('pc-retry', 'Couldn’t load petty cash',
      'The float balance and ledger could not be retrieved — the figures shown could be wrong. Check your connection and retry.');
    document.getElementById('pc-retry')?.addEventListener('click', _loadPettyCash);
  }
}

function _renderLedger(wrap, bal, txns, pending) {
  _pendingReimb = pending;
  const visible = txns.filter(t => _inWeek(t.txn_date, _pcWeekStart));
  const suggestedTopup = (bal.balance < 0 ? Math.abs(bal.balance) : 0) + _monthlyTopup;

  // Group pending by employee for the payment panel
  const byEmp = {};
  (pending.txns || []).forEach(t => {
    const key = t.employee?.id || 'unknown';
    if (!byEmp[key]) byEmp[key] = { employee: t.employee, txns: [], claims: [], total: 0 };
    byEmp[key].txns.push(t);
    byEmp[key].total += Number(t.amount);
  });
  (pending.claims || []).forEach(c => {
    const key = c.employee?.id || 'unknown';
    if (!byEmp[key]) byEmp[key] = { employee: c.employee, txns: [], claims: [], total: 0 };
    byEmp[key].claims.push(c);
    byEmp[key].total += Number(c.computed_reimbursement) + Number(c.computed_depreciation);
  });
  const empEntries = Object.values(byEmp).sort((a,b) => b.total - a.total);
  const grandTotal = empEntries.reduce((s,e) => s + e.total, 0);

  wrap.innerHTML = `
    <div class="card mb-4" style="display:flex;gap:24px;flex-wrap:wrap;padding:16px">
      <div><div class="text-muted" style="font-size:12px">TOTAL IN</div><div style="font-size:20px;font-weight:600;color:var(--color-success)">${_money(bal.in)}</div></div>
      <div><div class="text-muted" style="font-size:12px">TOTAL OUT</div><div style="font-size:20px;font-weight:600;color:var(--color-danger)">${_money(bal.out)}</div></div>
      <div><div class="text-muted" style="font-size:12px">BALANCE</div><div style="font-size:20px;font-weight:600;color:${bal.balance<0?'var(--danger)':'var(--color-success,#66bb6a)'}">${_money(bal.balance)}</div></div>
    </div>

    ${bal.balance < 0 ? `
    <div class="card mb-4" style="background:rgba(239,68,68,0.1);border-left:4px solid var(--danger);padding:14px 16px;">
      <div style="font-weight:600;margin-bottom:4px;">⚠️ Balance is ${_money(bal.balance)} — top-up needed</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">
        Suggested: <strong>${_money(suggestedTopup)}</strong>
        &nbsp;= ${_money(Math.abs(bal.balance))} deficit + ${_money(_monthlyTopup)} regular
      </div>
      <button class="btn btn-primary btn-sm" id="pc-quick-topup">Record ฿${suggestedTopup.toLocaleString('en',{minimumFractionDigits:2})} Top-up</button>
      <button class="btn btn-ghost btn-sm" id="pc-custom-topup" style="margin-left:8px">Custom amount</button>
    </div>` : ''}

    ${empEntries.length > 0 ? `
    <div class="section-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
      Payment Details — Transfer to Employees
      <span class="badge badge-warning">${empEntries.length} employee${empEntries.length !== 1 ? 's' : ''} pending</span>
      <button class="btn btn-primary btn-sm" id="pc-mark-all-paid" style="margin-left:auto">✓ Mark All Paid</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
      ${empEntries.map(e => `
      <details class="card" style="padding:12px 16px;">
        <summary style="cursor:pointer;display:flex;align-items:center;gap:10px;list-style:none;-webkit-appearance:none;">
          <span style="font-weight:600">${_esc(e.employee?.full_name || '—')}</span>
          <span class="text-muted" style="font-size:12px">${e.txns.length + e.claims.length} item${(e.txns.length + e.claims.length) !== 1 ? 's' : ''}</span>
          <span style="margin-left:auto;font-weight:600;color:var(--color-success,#66bb6a)">${_money(e.total)}</span>
          <button class="btn btn-ghost btn-sm pc-mark-emp-paid" data-empid="${_esc(e.employee?.id || '')}" style="margin-left:8px">Mark paid</button>
        </summary>
        <table style="font-size:13px;width:100%;border-collapse:collapse;margin-top:8px;">
          ${e.txns.map(t => `<tr style="border-top:1px solid var(--border-color,#333);">
            <td style="padding:4px 6px;color:var(--text-secondary)">${_fmt(t.txn_date)}</td>
            <td style="padding:4px 6px">${_esc(t.category?.name || '—')}</td>
            <td style="padding:4px 6px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(t.note || '—')}</td>
            <td style="padding:4px 6px;text-align:right;font-weight:500">${_money(t.amount, t.currency)}</td>
            <td style="padding:4px 6px;text-align:center;"><input type="checkbox" class="pc-item-check" data-type="txn" data-id="${_esc(t.id)}"></td>
          </tr>`).join('')}
          ${e.claims.map(c => `<tr style="border-top:1px solid var(--border-color,#333);">
            <td style="padding:4px 6px;color:var(--text-secondary)">${_fmt(c.travel_date)}</td>
            <td style="padding:4px 6px">${c.vehicle_code === 'public' ? 'Transport' : 'Mileage'}</td>
            <td style="padding:4px 6px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(c.route || '—')}</td>
            <td style="padding:4px 6px;text-align:right;font-weight:500">${_money(Number(c.computed_reimbursement)+Number(c.computed_depreciation), c.currency)}</td>
            <td style="padding:4px 6px;text-align:center;"><input type="checkbox" class="pc-item-check" data-type="claim" data-id="${_esc(c.id)}"></td>
          </tr>`).join('')}
          <tr style="border-top:2px solid var(--border-color,#333);">
            <td colspan="3" style="padding:6px 6px;font-weight:600">Total to transfer</td>
            <td style="padding:6px 6px;text-align:right;font-weight:600">${_money(e.total)}</td>
            <td style="padding:6px 6px;text-align:center;"><button class="btn btn-primary btn-sm pc-pay-selected">Pay Selected</button></td>
          </tr>
        </table>
      </details>`).join('')}
      <div class="card" style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
        <strong>Grand Total to Transfer</strong>
        <strong style="color:var(--color-success,#66bb6a);font-size:16px">${_money(grandTotal)}</strong>
      </div>
    </div>` : ''}

    <div style="margin-bottom:14px;">${weekNavHtml('pc', _pcWeekStart, { allowAll: true })}</div>

    <div class="section-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      Transactions
      <select class="form-control" id="pc-dir" style="width:auto"><option value="">All directions</option><option value="in">Top-ups</option><option value="out">Expenses</option></select>
      <select class="form-control" id="pc-proj" style="width:auto">${_projOptions()}</select>
    </div>
    <div id="pc-table">${_allTxnTable(visible)}</div>

    <details class="card mt-4" style="padding:12px">
      <summary style="cursor:pointer;font-weight:600">Setup — vehicle rates, categories &amp; top-up</summary>
      <div id="pc-setup" style="margin-top:12px">${_setupPanel()}</div>
    </details>
  `;

  // Quick top-up banner buttons
  document.getElementById('pc-quick-topup')?.addEventListener('click', () => {
    _prefillTopupAmt = suggestedTopup;
    _pettyCashSub = 'topup';
    document.querySelectorAll('#pc-sub .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === _pettyCashSub));
    _loadPettyCash();
  });
  document.getElementById('pc-custom-topup')?.addEventListener('click', () => {
    _prefillTopupAmt = null;
    _pettyCashSub = 'topup';
    document.querySelectorAll('#pc-sub .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === _pettyCashSub));
    _loadPettyCash();
  });

  // Mark all paid
  document.getElementById('pc-mark-all-paid')?.addEventListener('click', async () => {
    const btn = document.getElementById('pc-mark-all-paid');
    btn.disabled = true;
    try {
      const txnIds   = (_pendingReimb.txns   || []).map(t => t.id);
      const claimIds = (_pendingReimb.claims || []).map(c => c.id);
      await markReimbursed(txnIds, claimIds);
      window.showToast?.(`Marked ${txnIds.length + claimIds.length} item${txnIds.length + claimIds.length !== 1 ? 's' : ''} as paid.`, 'success');
      _loadPettyCash();
    } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
  });

  // Mark per-employee paid
  wrap.querySelectorAll('.pc-mark-emp-paid').forEach(btn => {
    btn.addEventListener('click', async ev => {
      ev.preventDefault(); ev.stopPropagation();
      const empId = btn.dataset.empid;
      btn.disabled = true;
      try {
        const txnIds   = (_pendingReimb.txns   || []).filter(t => t.employee?.id === empId).map(t => t.id);
        const claimIds = (_pendingReimb.claims || []).filter(c => c.employee?.id === empId).map(c => c.id);
        await markReimbursed(txnIds, claimIds);
        const name = btn.closest('details')?.querySelector('summary span')?.textContent || 'employee';
        window.showToast?.(`Marked paid for ${name}.`, 'success');
        _loadPettyCash();
      } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
    });
  });

  // Pay Selected — per-employee checkbox batch
  wrap.querySelectorAll('.pc-pay-selected').forEach(btn => {
    btn.addEventListener('click', async ev => {
      ev.preventDefault(); ev.stopPropagation();
      const table   = btn.closest('table');
      const checked = [...table.querySelectorAll('.pc-item-check:checked')];
      if (!checked.length) { window.showToast?.('Select at least one item.', 'error'); return; }
      btn.disabled = true;
      try {
        const txnIds   = checked.filter(c => c.dataset.type === 'txn').map(c => c.dataset.id);
        const claimIds = checked.filter(c => c.dataset.type === 'claim').map(c => c.dataset.id);
        await markReimbursed(txnIds, claimIds);
        window.showToast?.(`Marked ${checked.length} item${checked.length !== 1 ? 's' : ''} as paid.`, 'success');
        _loadPettyCash();
      } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
    });
  });

  // Filter + week nav
  const filterTxns = () => {
    const dir  = document.getElementById('pc-dir').value;
    const proj = document.getElementById('pc-proj').value;
    let rows = visible;
    if (dir)  rows = rows.filter(t => t.direction === dir);
    if (proj) rows = rows.filter(t => t.project_id === proj);
    document.getElementById('pc-table').innerHTML = _allTxnTable(rows);
  };
  document.getElementById('pc-dir').addEventListener('change', filterTxns);
  document.getElementById('pc-proj').addEventListener('change', filterTxns);
  wireWeekNav('pc', () => _pcWeekStart, v => { _pcWeekStart = v; }, _loadPettyCash);
  _wireSetup();
}

function _renderTopupForm(wrap) {
  const prefill = _prefillTopupAmt != null ? Number(_prefillTopupAmt).toFixed(2) : '';
  _prefillTopupAmt = null;   // consume — one-shot
  const catInOpts = _catIn().map(c => `<option value="${c.id}">${_esc(c.name)}</option>`).join('');
  wrap.innerHTML = `
    <div class="card mb-4" style="max-width:680px">
      <div class="section-header">Record Top-up (money in)</div>
      <div class="form-body">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Date <span class="required">*</span></label>
            <input type="date" class="form-control" id="tu-date" value="${_today()}" style="color-scheme:dark"></div>
          <div class="form-group"><label class="form-label">Amount <span class="required">*</span></label>
            <input type="number" class="form-control" id="tu-amt" placeholder="6000.00" min="0.01" step="0.01" value="${prefill}"></div>
          <div class="form-group"><label class="form-label">Source <span class="required">*</span></label>
            <select class="form-control" id="tu-cat"><option value="">Select…</option>${catInOpts}</select></div>
          <div class="form-group" style="flex:2"><label class="form-label">Project / Purpose <span class="required">*</span></label>
            <select class="form-control" id="tu-proj">${_projOptions()}</select></div>
        </div>
        <div class="form-group"><label class="form-label">Note</label>
          <input type="text" class="form-control" id="tu-note" placeholder="Monthly budget / extra top-up…"></div>
        <div class="form-actions"><button class="btn btn-primary" id="tu-submit">Record Top-up</button></div>
      </div>
    </div>
  `;
  // Office-budget sources lock the project to "Hubble Engineering Office";
  // Customer Working Budget unlocks it for a manual pick (same pattern as ex-cat).
  const tuCat  = document.getElementById('tu-cat');
  const tuProj = document.getElementById('tu-proj');
  tuCat?.addEventListener('change', () => {
    const catName  = _categories.find(c => c.id === parseInt(tuCat.value))?.name;
    const officeId = _officeProjectId();
    if (catName && OFFICE_IN_CAT_NAMES.has(catName) && officeId) {
      tuProj.value = officeId;
      tuProj.disabled = true;
    } else {
      tuProj.disabled = false;
      if (catName && !OFFICE_IN_CAT_NAMES.has(catName)) tuProj.value = '';
    }
  });
  document.getElementById('tu-submit').addEventListener('click', _recordTopup);
}

function _allTxnTable(txns) {
  if (txns.length === 0) return `<p class="empty-state">No transactions.</p>`;
  return `<div class="table-wrapper"><table class="data-table">
    <thead><tr><th>Date</th><th>Dir</th><th>Employee</th><th>Category</th><th>Project</th><th>Amount</th><th>Status</th><th>Note</th></tr></thead>
    <tbody>${txns.map(t => `<tr>
      <td>${_fmt(t.txn_date)}</td>
      <td>${t.direction === 'in' ? '<span class="badge badge-approved">IN</span>' : '<span class="badge">OUT</span>'}</td>
      <td>${_esc(t.employee?.full_name||'—')}</td>
      <td>${_esc(t.category?.name||'—')}</td>
      <td>${_esc(t.project?.name||'—')}</td>
      <td style="color:${t.direction==='in'?'var(--color-success,#66bb6a)':'inherit'}">${_money(t.amount,t.currency)}</td>
      <td>${_badge(t.status)}</td>
      <td>${_esc(t.note||'')}${t.source==='travel_claim'?' <span class="text-muted">(auto)</span>':''}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

async function _recordTopup() {
  const btn = document.getElementById('tu-submit'); btn.disabled = true;
  try {
    if (!_myEmployee) throw new Error('Your admin account has no linked employee record to attribute the entry to.');
    const catId  = parseInt(document.getElementById('tu-cat').value) || null;
    const projId = document.getElementById('tu-proj').value;
    if (!catId)  throw new Error('Please select the Source.');
    if (!projId) throw new Error('Please select a Project / Purpose.');
    await recordTopup({
      employeeId: _myEmployee.id,
      txnDate:    document.getElementById('tu-date').value,
      amount:     document.getElementById('tu-amt').value,
      categoryId: catId,
      projectId:  projId,
      note:       document.getElementById('tu-note').value.trim() || null,
      actorId:    _profile.id,
    });
    window.showToast?.('Top-up recorded.', 'success');
    window.refreshExpenseBadge?.();
    _pettyCashSub = 'ledger';   // jump to the ledger so the new entry is visible
    _renderPettyCash();
  } catch (err) { window.showToast?.(err.message, 'error'); btn.disabled = false; }
}

function _setupPanel() {
  const vehRows = _vehicles.map(v => `<tr>
    <td>${_esc(v.label)}</td>
    <td><input type="number" class="form-control vr-fuel" data-code="${v.code}" value="${v.fuel_rate_per_km}" step="0.01" style="width:90px"></td>
    <td><input type="number" class="form-control vr-dep" data-code="${v.code}" value="${v.depreciation_per_km}" step="0.01" style="width:90px"></td>
    <td><button class="btn btn-ghost btn-sm vr-save" data-code="${v.code}" data-label="${_esc(v.label)}">Save</button></td>
  </tr>`).join('');
  const catList = _categories.map(c => `<li>${_esc(c.name)} <span class="text-muted">(${c.applies_to})</span></li>`).join('');
  return `
    <div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border-color,#333);">
      <strong style="font-size:13px">Monthly Regular Top-up Amount (฿)</strong>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
        <input type="number" class="form-control" id="pc-monthly-amt" value="${_monthlyTopup}" min="0" step="100" style="width:150px">
        <button class="btn btn-ghost btn-sm" id="pc-monthly-save">Save</button>
      </div>
      <p class="text-muted" style="font-size:12px;margin-top:4px;">Used to calculate the suggested top-up when the balance goes negative.</p>
    </div>
    <div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border-color,#333);">
      <strong style="font-size:13px">PT/Outsource Daily Rate (฿)</strong>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
        <input type="number" class="form-control" id="pc-pt-rate" value="${_ptDailyRate}" min="0" step="25" style="width:150px">
        <button class="btn btn-ghost btn-sm" id="pc-pt-rate-save">Save</button>
      </div>
      <p class="text-muted" style="font-size:12px;margin-top:4px;">Full day = morning + afternoon sessions. Half-day session = ฿${(_ptDailyRate/2).toLocaleString('en',{minimumFractionDigits:2})}. Used by the WEEKLY report wage calculation.</p>
    </div>
    <strong style="font-size:13px">Per-km rates (฿)</strong>
    <div class="table-wrapper" style="margin-top:6px"><table class="data-table">
      <thead><tr><th>Vehicle</th><th>Fuel /km</th><th>Depreciation /km</th><th></th></tr></thead>
      <tbody>${vehRows}</tbody></table></div>
    <p class="text-muted" style="font-size:12px;margin-top:6px">Rate changes apply to <strong>new claims only</strong> — existing claims keep the rate they were filed with.</p>
    <strong style="font-size:13px">Categories</strong>
    <ul style="columns:2;font-size:13px;margin-top:6px">${catList}</ul>`;
}

function _wireSetup() {
  // Monthly top-up amount
  document.getElementById('pc-monthly-save')?.addEventListener('click', async () => {
    const btn = document.getElementById('pc-monthly-save');
    btn.disabled = true;
    try {
      const amt = parseFloat(document.getElementById('pc-monthly-amt').value);
      if (isNaN(amt) || amt < 0) throw new Error('Enter a valid amount.');
      await savePettyCashSettings({ monthlyTopup: amt });
      _monthlyTopup = amt;
      window.showToast?.('Monthly top-up amount saved.', 'success');
    } catch (e) { window.showToast?.(e.message, 'error'); }
    btn.disabled = false;
  });

  // PT/outsource daily rate
  document.getElementById('pc-pt-rate-save')?.addEventListener('click', async () => {
    const btn = document.getElementById('pc-pt-rate-save');
    btn.disabled = true;
    try {
      const rate = parseFloat(document.getElementById('pc-pt-rate').value);
      if (isNaN(rate) || rate < 0) throw new Error('Enter a valid daily rate.');
      await savePettyCashSettings({ ptDailyRate: rate });
      _ptDailyRate = rate;
      window.showToast?.('PT daily rate saved.', 'success');
    } catch (e) { window.showToast?.(e.message, 'error'); }
    btn.disabled = false;
  });

  document.querySelectorAll('.vr-save').forEach(btn => btn.addEventListener('click', async () => {
    const code = btn.dataset.code;
    btn.disabled = true;
    try {
      await upsertVehicleRate({
        code, label: btn.dataset.label,
        fuelRatePerKm:     parseFloat(document.querySelector(`.vr-fuel[data-code="${code}"]`).value) || 0,
        depreciationPerKm: parseFloat(document.querySelector(`.vr-dep[data-code="${code}"]`).value) || 0,
      });
      _vehicles = await getVehicleRates().catch(() => _vehicles);
      window.showToast?.('Rate saved.', 'success'); btn.disabled = false;
    } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
  }));
}

// ═══════════════════════════════════════════ REPORT (admin)
async function _renderReport() {
  const body = document.getElementById('exp-body');
  body.innerHTML = `
    <div class="tabs" id="rp-mode" style="margin-bottom:16px">
      <button class="tab-btn${_reportMode==='monthly'?' active':''}" data-mode="monthly">MONTHLY</button>
      <button class="tab-btn${_reportMode==='weekly'?' active':''}" data-mode="weekly">WEEKLY (part-time / outsource)</button>
    </div>
    <div id="rp-body"></div>`;
  document.getElementById('rp-mode').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    _reportMode = btn.dataset.mode;
    _saveTabState();
    document.querySelectorAll('#rp-mode .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === _reportMode));
    _reportMode === 'monthly' ? _renderMonthlyReport() : _renderWeeklyReport();
  });
  _reportMode === 'monthly' ? _renderMonthlyReport() : _renderWeeklyReport();
}

async function _renderMonthlyReport() {
  const wrap = document.getElementById('rp-body');
  const now = new Date();
  let year = now.getFullYear(), month = now.getMonth() + 1;

  async function load() {
    wrap.innerHTML = `<div class="page-loading">Loading…</div>`;
    const lastDay = new Date(year, month, 0).getDate();
    const fromDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const toDate   = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;

    const [txns, openBal] = await Promise.all([
      getAllTransactions({ fromDate, toDate }).catch(() => []),
      getRunningBalance(`${year}-${String(month).padStart(2,'0')}-00`).catch(() => ({ balance: 0 })),
    ]);
    // opening balance = balance up to the day before the 1st
    const prevDay = toISODate(new Date(year, month - 1, 0));
    const opening = (await getRunningBalance(prevDay).catch(() => ({ balance: 0 }))).balance;

    const approved = txns.filter(t => t.status === 'approved');
    const totalIn  = approved.filter(t => t.direction === 'in').reduce((s,t)=>s+Number(t.amount),0);
    const totalOut = approved.filter(t => t.direction === 'out').reduce((s,t)=>s+Number(t.amount),0);
    const closing  = opening + totalIn - totalOut;
    const suggestedTopup = (closing < 0 ? Math.abs(closing) : 0) + _monthlyTopup;

    // group expenses by project + by person
    const byProject = {}, byPerson = {};
    for (const t of approved.filter(t => t.direction === 'out')) {
      const pk = t.project?.name || '— No project —';
      byProject[pk] = (byProject[pk] || 0) + Number(t.amount);
      const nk = t.employee?.full_name || 'Unknown';
      byPerson[nk] = (byPerson[nk] || 0) + Number(t.amount);
    }

    const deadline = _monthlyDeadline(year, month);
    const dStr = deadline.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
    const today = new Date(); today.setHours(0,0,0,0);
    const overdue = deadline < today;
    const daysLeft = Math.ceil((deadline - today)/86400000);

    const months = Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===month?'selected':''}>${new Date(2000,i).toLocaleString('en',{month:'long'})}</option>`).join('');
    const years  = Array.from({length:3},(_,i)=>{const y=2025+i;return `<option value="${y}" ${y===year?'selected':''}>${y}</option>`;}).join('');
    const monthLabel = new Date(year, month-1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});

    wrap.innerHTML = `
      <div style="max-width:860px;">
      <div class="card mb-4" style="padding:10px 16px;">
        <div class="week-nav">
          <select class="form-input" id="rp-month" style="width:130px">${months}</select>
          <select class="form-input" id="rp-year" style="width:90px">${years}</select>
          <button class="btn btn-primary btn-sm" id="rp-load">Load</button>
          <span style="margin-left:auto;font-size:var(--font-sm);color:var(--text-muted);font-weight:600;white-space:nowrap">${_fmt(fromDate)} – ${_fmt(toDate)}</span>
        </div>
      </div>

      <div class="card mb-4" style="${overdue?'background:rgba(239,68,68,0.12);border-left:4px solid var(--danger)':daysLeft<=2?'background:rgba(239,68,68,0.08);border-left:4px solid var(--danger)':daysLeft<=5?'border-left:4px solid var(--warning)':'border-left:4px solid var(--primary)'};padding:14px 16px">
        <strong>Top-up request &amp; expense report deadline — ${monthLabel}</strong><br>
        <span class="text-muted" style="font-size:13px">Due <strong>${dStr}</strong> (the 14th, or last workday before if weekend/holiday). Send the summary ~09:30 that morning. Pay date: 16th.${overdue?`<span style="color:var(--danger);font-weight:600"> — OVERDUE! Submit immediately.</span>`:daysLeft<=2?`<span style="color:var(--danger);font-weight:600"> — ${daysLeft} day${daysLeft===1?'':'s'} left! Urgent.</span>`:` ${daysLeft} day${daysLeft===1?'':'s'} left.`}</span>
      </div>

      <div class="card mb-4" style="display:flex;gap:24px;flex-wrap:wrap;padding:16px;align-items:flex-start">
        <div><div class="text-muted" style="font-size:12px">OPENING</div><div style="font-size:18px;font-weight:600">${_money(opening)}</div></div>
        <div><div class="text-muted" style="font-size:12px">TOP-UPS</div><div style="font-size:18px;font-weight:600">${_money(totalIn)}</div></div>
        <div><div class="text-muted" style="font-size:12px">EXPENSES</div><div style="font-size:18px;font-weight:600">${_money(totalOut)}</div></div>
        <div><div class="text-muted" style="font-size:12px">CLOSING</div><div style="font-size:18px;font-weight:600;color:${closing<0?'var(--danger)':'var(--color-success,#66bb6a)'}">${_money(closing)}</div></div>
        <div style="border-left:1px solid var(--border-color,#333);margin:0 4px;align-self:stretch"></div>
        <div>
          <div class="text-muted" style="font-size:12px">SUGGESTED TOP-UP</div>
          <div style="font-size:18px;font-weight:600;color:var(--primary,#7c6af7)">${_money(suggestedTopup)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${closing < 0 ? `฿${Math.abs(closing).toLocaleString('en',{minimumFractionDigits:2})} deficit + ฿${_monthlyTopup.toLocaleString('en',{minimumFractionDigits:2})} regular` : `Regular monthly (due 16th)`}</div>
        </div>
      </div>

      <div class="section-header">Expenses by Project</div>
      ${_kvTable(byProject)}

      <div class="section-header mt-4">Expenses by Person</div>
      ${_kvTable(byPerson)}

      ${(() => {
        // Advances to reimburse: approved personal-category expenses paid out-of-pocket by employees.
        // These are reimbursed with salary (not via petty cash float).
        const PERSONAL_CATS = new Set(['Import Tax', 'Shipping & Handling', 'Travel Expense', 'Other']);
        const advByPerson = {};
        for (const t of approved.filter(t => t.direction === 'out' && PERSONAL_CATS.has(t.category?.name))) {
          const nk = t.employee?.full_name || 'Unknown';
          if (!advByPerson[nk]) advByPerson[nk] = [];
          advByPerson[nk].push(t);
        }
        const entries = Object.entries(advByPerson);
        if (!entries.length) return `<div class="section-header mt-4">Advances to Reimburse with Salary</div><p class="empty-state">No advance payments this month.</p>`;
        return `<div class="section-header mt-4">Advances to Reimburse with Salary</div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
          ${entries.map(([name, txns]) => {
            const total = txns.reduce((s,t) => s + Number(t.amount), 0);
            return `<div class="card" style="padding:12px 16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <strong>${_esc(name)}</strong>
                <span style="font-weight:600;color:var(--color-success,#66bb6a)">${_money(total)}</span>
              </div>
              <table style="font-size:13px;width:100%;border-collapse:collapse;">
                ${txns.map(t=>`<tr style="border-top:1px solid var(--border-color,#333);">
                  <td style="padding:4px 6px;color:var(--text-secondary)">${_fmt(t.txn_date)}</td>
                  <td style="padding:4px 6px">${_esc(t.category?.name||'—')}</td>
                  <td style="padding:4px 6px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(t.note||'—')}</td>
                  <td style="padding:4px 6px;text-align:right;font-weight:500">${_money(t.amount,t.currency)}</td>
                </tr>`).join('')}
              </table>
            </div>`;
          }).join('')}
          </div>`;
      })()}

      <div class="card mt-4" style="padding:16px;font-size:13px;color:var(--text-secondary)">
        <strong>Summary template:</strong><br>
        The total amount of monthly expenses for ${monthLabel} is <strong>${_money(totalOut)}</strong> (THB).<br>
        Top-ups received: ${_money(totalIn)}. Opening balance ${_money(opening)} → closing ${_money(closing)}.<br>
        ${closing < 0
          ? `⚠️ Suggested top-up: <strong>${_money(suggestedTopup)}</strong> (${_money(Math.abs(closing))} deficit + ${_money(_monthlyTopup)} regular).`
          : `Regular top-up due 16th: <strong>${_money(_monthlyTopup)}</strong>.`}
      </div>
      </div>`;

    document.getElementById('rp-load').addEventListener('click', () => {
      month = parseInt(document.getElementById('rp-month').value);
      year  = parseInt(document.getElementById('rp-year').value);
      load();
    });
  }
  load();
}

function _kvTable(obj) {
  const entries = Object.entries(obj).sort((a,b)=>b[1]-a[1]);
  if (entries.length === 0) return `<p class="empty-state">No expenses.</p>`;
  const total = entries.reduce((s,[,v])=>s+v,0);
  return `<div class="table-wrapper"><table class="data-table"><tbody>
    ${entries.map(([k,v])=>`<tr><td>${_esc(k)}</td><td style="text-align:right">${_money(v)}</td></tr>`).join('')}
    <tr style="font-weight:600;border-top:2px solid var(--border-color)"><td>Total</td><td style="text-align:right">${_money(total)}</td></tr>
  </tbody></table></div>`;
}

async function _renderWeeklyReport() {
  const wrap = document.getElementById('rp-body');
  wrap.innerHTML = `<div class="page-loading">Loading…</div>`;

  // Default = the most recently completed week (prior Mon–Sun).
  const monday = new Date(_nextMonday()); monday.setDate(monday.getDate() - 7); // this week's Monday
  let wkStart = new Date(monday); wkStart.setDate(monday.getDate() - 7); // prior Monday

  async function load() {
    wrap.innerHTML = `<div class="page-loading">Loading…</div>`;
    const wkEnd   = new Date(wkStart); wkEnd.setDate(wkEnd.getDate() + 6); // always Mon+6 = Sun
    const fromStr = toISODate(wkStart);
    const toStr   = toISODate(wkEnd);

    // PT/outsource employees
    const { data: ptEmployees } = await supabase
      .from('employees')
      .select('id, full_name, employee_id, employment_type_code, user_id')
      .in('employment_type_code', ['2','3'])
      .eq('status', 'active');

    // Logged timesheet hours for the week, per user per day — converted to half-day
    // sessions (4h ≈ 1 session, max 2/day). Wage = sessions × (pt_daily_rate / 2).
    // NOTE: time_entries has no per-entry approval status in the base schema, so this sums
    // LOGGED hours. Approval-gating depends on M1 weekly timesheet submission (not yet built).
    const _sessionsForHours = h => Math.min(2, Math.round((h || 0) / 4)); // 0/1/2 per day — tunable
    const userIds = (ptEmployees || []).map(e => e.user_id).filter(Boolean);
    let hoursByUser = {}, sessionsByUser = {};
    let missing = [];
    if (userIds.length) {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('user_id, total_hours, date')
        .in('user_id', userIds)
        .gte('date', fromStr)
        .lte('date', toStr);
      const dayHours = {};   // `${user_id}|${date}` → hours
      for (const e of entries || []) {
        hoursByUser[e.user_id] = (hoursByUser[e.user_id] || 0) + Number(e.total_hours || 0);
        const k = `${e.user_id}|${e.date}`;
        dayHours[k] = (dayHours[k] || 0) + Number(e.total_hours || 0);
      }
      for (const [k, h] of Object.entries(dayHours)) {
        const uid = k.split('|')[0];
        sessionsByUser[uid] = (sessionsByUser[uid] || 0) + _sessionsForHours(h);
      }
    }

    // Expenses logged by these employees in the week
    const empIds = (ptEmployees || []).map(e => e.id);
    let expByEmp = {};
    if (empIds.length) {
      const txns = await getAllTransactions({ direction:'out', fromDate: fromStr, toDate: toStr }).catch(()=>[]);
      for (const t of txns.filter(t => empIds.includes(t.employee_id) && t.status === 'approved')) {
        expByEmp[t.employee_id] = (expByEmp[t.employee_id] || 0) + Number(t.amount);
      }
    }

    const wkNum = _isoWeek(wkStart);
    const yr = wkStart.getFullYear();
    // Payout day for the DISPLAYED week = the Monday right after its Sunday.
    const payday = new Date(wkEnd); payday.setDate(payday.getDate() + 1);
    const dStr = payday.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});

    const sessionRate = _ptDailyRate / 2;
    const weekTag = `Wk${wkNum}/${yr}`;
    const wageRows = (ptEmployees || []).map(e => {
      const hrs = hoursByUser[e.user_id];
      const hasTs = e.user_id && hoursByUser[e.user_id] !== undefined;
      if (!hasTs) missing.push(e.full_name);
      const sessions = sessionsByUser[e.user_id] || 0;
      return { emp: e, hasTs, hrs: hrs || 0, sessions, wage: sessions * sessionRate };
    });

    const rows = wageRows.map(({ emp: e, hasTs, hrs, sessions, wage }) => `<tr>
        <td>${_esc(e.full_name)} <span class="text-muted">(${e.employment_type_code==='2'?'PT':'Contract'})</span></td>
        <td>${hasTs ? sessions : '—'}</td>
        <td>${hasTs ? (hrs.toFixed(1)+' h') : '<span style="color:var(--warning)">no timesheet</span>'}</td>
        <td style="font-weight:600">${hasTs ? _money(wage) : '—'}</td>
        <td>${_money(expByEmp[e.id] || 0)}</td>
      </tr>`).join('');
    const totalWage = wageRows.reduce((s, r) => s + r.wage, 0);

    wrap.innerHTML = `
      <div style="max-width:860px;">
      <div class="card mb-4" style="padding:10px 16px;">${weekNavHtml('wr', wkStart)}</div>

      <div class="card mb-4" style="border-left:4px solid var(--primary);padding:14px 16px">
        <strong>Weekly wage summary — pay Monday</strong><br>
        <span class="text-muted" style="font-size:13px">Send first thing Monday morning. Payout for this week: <strong>${dStr}</strong>. Covers Wk#${wkNum}/${yr} half-day sessions × ฿${sessionRate.toLocaleString('en',{minimumFractionDigits:2})}.</span>
      </div>

      ${missing.length ? `<div class="card mb-4" style="border-left:4px solid var(--warning);padding:12px 16px;font-size:13px">
        ⚠️ ${missing.length} worker(s) have no timesheet entries this week: ${_esc(missing.join(', '))}. Wage figures are incomplete until their timesheets are submitted &amp; approved.</div>` : ''}

      <div class="section-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        Part-time / Outsource — Week ${wkNum}/${yr}
        ${wageRows.some(r => r.wage > 0) ? `<button class="btn btn-primary btn-sm" id="wr-post-wages" style="margin-left:auto">Post Wages to Ledger</button>` : ''}
      </div>
      ${(ptEmployees||[]).length === 0 ? `<p class="empty-state">No active part-time or outsource employees.</p>` : `
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Worker</th><th>Sessions (½-days)</th><th>Logged Hours</th><th>Wage</th><th>Expenses (wk)</th></tr></thead>
        <tbody>${rows}
        <tr style="font-weight:600;border-top:2px solid var(--border-color)"><td>Total</td><td></td><td></td><td>${_money(totalWage)}</td><td></td></tr>
        </tbody></table></div>
      <p class="text-muted" style="font-size:12px;margin-top:8px">Day rate ฿${_ptDailyRate.toLocaleString('en',{minimumFractionDigits:2})} = morning + afternoon sessions; half-day session = ฿${sessionRate.toLocaleString('en',{minimumFractionDigits:2})} (4h ≈ 1 session, max 2/day). Wage payouts are logged under "Engineering Assistant Wage" in the petty-cash ledger. <em>Hours shown are logged entries; per-entry timesheet approval is an M1 enhancement.</em></p>`}
      </div>
    `;

    document.getElementById('wr-post-wages')?.addEventListener('click', () =>
      _openPostWagesModal(wageRows.filter(r => r.wage > 0), weekTag, toStr, load));
    wireWeekNav('wr', () => wkStart, d => { wkStart = d; }, load);
  }
  load();
}

// Review-and-confirm modal for posting weekly PT wages to the ledger (amounts editable).
async function _openPostWagesModal(wageRows, weekTag, txnDate, reload) {
  // Double-post guard: warn (don't block) if wage lines already carry this week's tag.
  const existing = await getWagePostings(weekTag).catch(() => []);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span>Post Wages — ${_esc(weekTag)}</span>
        <button class="btn btn-ghost btn-sm" id="pw-close">✕</button>
      </div>
      <div class="modal-body">
        ${existing.length ? `<div class="card mb-4" style="border-left:4px solid var(--warning);padding:10px 14px;font-size:13px">
          ⚠️ ${existing.length} wage line(s) for ${_esc(weekTag)} already exist in the ledger
          (${existing.map(t => _esc(t.employee?.full_name || '—')).join(', ')}). Confirm only if this posting is intentional.</div>` : ''}
        <p class="text-muted" style="font-size:13px;margin-bottom:12px">Review the computed wages — amounts are editable. Lines post as approved "Engineering Assistant Wage" expenses (project: Hubble Engineering Office), dated ${_fmt(txnDate)}.</p>
        <table class="data-table" style="width:100%">
          <thead><tr><th>Worker</th><th>Sessions</th><th style="width:140px">Amount (฿)</th></tr></thead>
          <tbody>${wageRows.map((r, i) => `<tr>
            <td>${_esc(r.emp.full_name)}</td>
            <td>${r.sessions}</td>
            <td><input type="number" class="form-control pw-amt" data-i="${i}" value="${r.wage}" min="0" step="0.01" style="width:120px"></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="pw-cancel">Cancel</button>
        <button class="btn btn-primary" id="pw-confirm">Post to Ledger</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('#pw-close').addEventListener('click', close);
  backdrop.querySelector('#pw-cancel').addEventListener('click', close);

  backdrop.querySelector('#pw-confirm').addEventListener('click', async () => {
    const btn = backdrop.querySelector('#pw-confirm'); btn.disabled = true;
    try {
      const wageCatId = _categories.find(c => c.name === 'Engineering Assistant Wage')?.id;
      if (!wageCatId) throw new Error('Category "Engineering Assistant Wage" not found.');
      const entries = wageRows.map((r, i) => ({
        employeeId: r.emp.id,
        amount:     parseFloat(backdrop.querySelector(`.pw-amt[data-i="${i}"]`).value) || 0,
        txnDate,
        categoryId: wageCatId,
        projectId:  _officeProjectId() || null,
        note:       `Wage ${weekTag} — ${r.sessions} session${r.sessions !== 1 ? 's' : ''}`,
      }));
      const posted = await postWages(entries, _profile?.id);
      window.showToast?.(`Posted ${posted.length} wage line${posted.length !== 1 ? 's' : ''} to the ledger.`, 'success');
      close();
      reload();
    } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
  });
}
