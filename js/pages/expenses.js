// pages/expenses.js — M4 Expense & Travel coordinator (thin shell)

import { isAdmin, isManager } from '../auth.js';
import { setFormatPrefs, toISODate, esc } from '../format.js';
import { supabase } from '../config.js';
import { getProjects } from '../api/projects.js';
import {
  getCategories, getVehicleRates,
  getMyTransactions, submitExpense, cancelTransaction,
  getPettyCashSettings,
} from '../api/expenses.js';

import { S, _fmt, _money, _today, _isWeekend, _nextWeekday, STATUS_LABELS, STATUS_CLASS, _badge, _settled, _isoWeek, _catIn, _catOut, _otherCatId, OFFICE_CAT_NAMES, OFFICE_IN_CAT_NAMES, _officeProjectId, _fxCache, _fetchFxRate, _wireCurrencyConvert, _curOpts, _projOptions, _projOptionsReq, _monthlyDeadline, _nextMonday, _weekRange, _inWeek } from './expenses-state.js';
import { _renderMileage, _renderTrip } from './expenses-travel.js?v=103';
import { renderApprovals } from './expenses-approvals.js?v=103';
import { renderPettyCash } from './expenses-petty-cash.js?v=106';
import { renderReport } from './expenses-report.js?v=103';

// ── Boot ──────────────────────────────────────────────────────
export async function render(profile) {
  S.profile = profile;
  setFormatPrefs(profile);   // seeds getDefaultCurrency() from profile.currency
  S.admin = isAdmin();
  S.manager = isManager();

  const content = document.getElementById('content');
  content.innerHTML = `<div class="page-loading">Loading…</div>`;

  const [cats, vehicles, projects, emp, pcSettings] = await Promise.all([
    getCategories().catch(() => []),
    getVehicleRates().catch(() => []),
    getProjects().catch(() => []),
    supabase.from('employees').select('id, full_name, employee_id, employment_type_code').eq('user_id', profile.id).maybeSingle().then(r => r.data),
    getPettyCashSettings().catch(() => ({ monthlyTopup: 6000, ptDailyRate: 550 })),
  ]);
  S.categories = cats; S.vehicles = vehicles; S.projects = projects; S.myEmployee = emp;
  S.monthlyTopup = pcSettings.monthlyTopup;
  S.ptDailyRate  = pcSettings.ptDailyRate ?? 550;

  // Public holidays (current year ± boundary) for deadline math — best-effort.
  try {
    const yr = new Date().getFullYear();
    const { data } = await supabase.from('public_holidays').select('date').gte('date', `${yr-1}-12-01`).lte('date', `${yr+1}-01-31`);
    S.holidaySet = new Set((data || []).map(h => h.date));
  } catch { S.holidaySet = new Set(); }

  await _refreshPendingCount();   // for the APPROVALS tab badge (admin/mgr)
  _renderShell();
}

// Count of items awaiting action (expenses + mileage claims + trip requests + settlements).
async function _refreshPendingCount() {
  if (!(S.admin || S.manager)) { S.pendingApprovals = 0; return 0; }
  try {
    const [{ count: ct }, { count: tc }, { count: tr }, { count: ts }] = await Promise.all([
      supabase.from('cash_transactions').select('id', { count:'exact', head:true }).eq('direction','out').in('status', ['pending','manager_approved']),
      supabase.from('travel_claims').select('id', { count:'exact', head:true }).in('status', ['pending','manager_approved']),
      supabase.from('travel_requests').select('id', { count:'exact', head:true }).in('status', ['pending','manager_approved']),
      supabase.from('travel_requests').select('id', { count:'exact', head:true }).eq('settlement_status', 'submitted'),
    ]);
    S.pendingApprovals = (ct || 0) + (tc || 0) + (tr || 0) + (ts || 0);
  } catch { S.pendingApprovals = 0; }
  return S.pendingApprovals;
}
function _approvalsBadge() {
  return `<span id="exp-approvals-count" class="badge badge-pending" style="margin-left:6px;${S.pendingApprovals > 0 ? '' : 'display:none;'}">${S.pendingApprovals}</span>`;
}
function _updateApprovalsTabBadge() {
  document.querySelectorAll('#exp-approvals-count, #exp-pending-count').forEach(el => {
    el.textContent = S.pendingApprovals;
    el.style.display = S.pendingApprovals > 0 ? '' : 'none';
  });
}

function _saveTabState() {
  try {
    sessionStorage.setItem('exp_tab_state', JSON.stringify({
      primaryTab: S.primaryTab, travelSub: S.travelSub, approvSub: S.approvSub,
      pendingCat: S.pendingCat, pettyCashSub: S.pettyCashSub, reportMode: S.reportMode,
    }));
  } catch { /* quota exceeded / private browsing */ }
}

function _renderShell() {
  // Restore tab state from sessionStorage (survives hard refresh, clears on tab close)
  try {
    const saved = JSON.parse(sessionStorage.getItem('exp_tab_state') || 'null');
    if (saved) {
      const canApproveNow = S.admin || S.manager;
      if (saved.primaryTab === 'my-expenses' || saved.primaryTab === 'my-travel' ||
          (saved.primaryTab === 'approvals'  && canApproveNow) ||
          (saved.primaryTab === 'petty-cash' && S.admin) ||
          (saved.primaryTab === 'report'     && S.admin)) {
        S.primaryTab = saved.primaryTab;
      }
      if (saved.travelSub)    S.travelSub    = saved.travelSub;
      if (saved.approvSub)    S.approvSub    = saved.approvSub;
      if (saved.pendingCat)   S.pendingCat   = saved.pendingCat;
      if (saved.pettyCashSub) S.pettyCashSub = saved.pettyCashSub;
      if (saved.reportMode)   S.reportMode   = saved.reportMode;
    }
  } catch { /* ignore stale / invalid */ }

  const canApprove = S.admin || S.manager;
  document.getElementById('content').innerHTML = `
    <div class="page-header"><h1 class="page-title">Expense &amp; Travel</h1></div>
    <div class="tabs primary-tabs" id="exp-tabs">
      <button class="tab-btn${S.primaryTab==='my-expenses'?' active':''}" data-tab="my-expenses">MY EXPENSES</button>
      <button class="tab-btn${S.primaryTab==='my-travel'?' active':''}" data-tab="my-travel">MY TRAVEL</button>
      ${canApprove ? `<button class="tab-btn${S.primaryTab==='approvals'?' active':''}" data-tab="approvals">APPROVALS ${_approvalsBadge()}</button>` : ''}
      ${S.admin ? `<button class="tab-btn${S.primaryTab==='petty-cash'?' active':''}" data-tab="petty-cash">PETTY CASH</button>` : ''}
      ${S.admin ? `<button class="tab-btn${S.primaryTab==='report'?' active':''}" data-tab="report">REPORT</button>` : ''}
    </div>
    <div id="exp-body"></div>
  `;
  document.getElementById('exp-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    S.primaryTab = btn.dataset.tab;
    _saveTabState();
    document.querySelectorAll('#exp-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === S.primaryTab));
    _loadTab();
  });
  _loadTab();
}

function _loadTab() {
  switch (S.primaryTab) {
    case 'my-expenses': return _renderMyExpenses();
    case 'my-travel':   return _renderMyTravel();
    case 'approvals':   return renderApprovals({ refreshCount: _refreshPendingCount, updateBadge: _updateApprovalsTabBadge });
    case 'petty-cash':  return renderPettyCash();
    case 'report':      return renderReport();
  }
}

// ═══════════════════════════════════════════ MY EXPENSES
async function _renderMyExpenses() {
  const body = document.getElementById('exp-body');
  body.innerHTML = `<div class="page-loading">Loading…</div>`;
  let txns = [];
  if (S.myEmployee) txns = (await getMyTransactions(S.myEmployee.id).catch(() => [])).filter(t => t.direction === 'out');

  const active  = txns.filter(t => !_settled(t.status));
  const settled = txns.filter(t =>  _settled(t.status));
  // Unseen = approved/rejected items the employee hasn't viewed yet (drives nav badge).
  const unseenExpIds = new Set(
    txns.filter(t => ['approved','rejected'].includes(t.status) && localStorage.getItem(`exp_seen_${t.id}`) !== '1').map(t => t.id)
  );
  // Everyone sees the full out-category list; office categories lock the project below.
  const catOpts = _catOut().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  body.innerHTML = `
    <div style="max-width:540px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
      <div class="form-label" style="font-size:15px;font-weight:600;">Submit Expense</div>
      ${!S.myEmployee ? `<p class="text-muted">No employee record linked to your account. Contact an admin.</p>` : `
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
      <button class="btn btn-ghost btn-sm" id="ex-toggle">${S.showPastExp?`Hide past (${settled.length})`:`Show past (${settled.length})`}</button>
    </div>
    <div style="${S.showPastExp?'':'display:none'}">${settled.length === 0 ? `<p class="empty-state">None.</p>` : _txnTable(settled, unseenExpIds)}</div>
  `;

  // Mark unseen decisions as seen now that the tab is rendered; refresh nav badge.
  unseenExpIds.forEach(id => localStorage.setItem(`exp_seen_${id}`, '1'));
  if (unseenExpIds.size) window.refreshExpenseBadge?.();

  if (S.myEmployee) {
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
      const catName = S.categories.find(c => c.id === parseInt(catSel.value))?.name;
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
  document.getElementById('ex-toggle')?.addEventListener('click', () => { S.showPastExp = !S.showPastExp; _renderMyExpenses(); });
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
      <td>${esc(t.category?.name || '—')}</td>
      <td>${esc(t.project?.name || '—')}</td>
      <td>${_money(t.amount, t.currency)}</td>
      <td>${esc(t.note || '—')}</td>
      <td>${_badge(t.status)}${unseenIds.has(t.id) ? ' <span class="badge" style="background:#4caf50;color:#000;font-size:10px;vertical-align:middle;margin-left:4px">NEW</span>' : ''}${t.rejection_reason ? `<br><small class="text-muted">${esc(t.rejection_reason)}</small>` : ''}</td>
      <td style="white-space:nowrap;">${t.status === 'pending' ? `<button class="btn btn-sm btn-ghost exp-cancel-txn" data-id="${esc(t.id)}">Cancel</button>` : t.status === 'manager_approved' ? `<span style="font-size:11px;color:var(--text-muted);">Contact admin</span>` : ''}</td>
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
      employeeId: S.myEmployee.id,
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
      <button class="tab-btn${S.travelSub==='mileage'?' active':''}" data-tab="mileage">MILEAGE CLAIM</button>
      <button class="tab-btn${S.travelSub==='trip'?' active':''}" data-tab="trip">TRIP REQUEST</button>
    </div>
    <div id="tv-body"></div>`;
  document.getElementById('tv-sub').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    S.travelSub = btn.dataset.tab;
    _saveTabState();
    document.querySelectorAll('#tv-sub .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === S.travelSub));
    S.travelSub === 'mileage' ? _renderMileage() : _renderTrip();
  });
  S.travelSub === 'mileage' ? _renderMileage() : _renderTrip();
}
