// pages/expenses-petty-cash.js — PETTY CASH tab (ledger + topup form + setup panel)

import { S, _fmt, _money, _badge, _today, _catIn, _catOut, OFFICE_IN_CAT_NAMES, _officeProjectId, _projOptions, _inWeek, _loadErrorHtml } from './expenses-state.js';
import { esc, toISODate } from '../format.js';
import { weekNavHtml, wireWeekNav } from '../components/weekNav.js';
import { supabase } from '../config.js';
import {
  getCategories, getVehicleRates, upsertVehicleRate,
  recordTopup as apiRecordTopup, getAllTransactions, getRunningBalance,
  getPendingReimbursements, markReimbursed,
  savePettyCashSettings,
} from '../api/expenses.js';

async function _renderPettyCash() {
  const body = document.getElementById('exp-body');
  body.innerHTML = `
    <div class="tabs" id="pc-sub" style="margin-bottom:16px">
      <button class="tab-btn${S.pettyCashSub==='ledger'?' active':''}" data-tab="ledger">LEDGER</button>
      <button class="tab-btn${S.pettyCashSub==='topup'?' active':''}" data-tab="topup">RECORD TOP-UP</button>
    </div>
    <div id="pc-body"><div class="page-loading">Loading…</div></div>`;
  document.getElementById('pc-sub').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    S.pettyCashSub = btn.dataset.tab;
    try {
      sessionStorage.setItem('exp_tab_state', JSON.stringify({
        primaryTab: S.primaryTab, travelSub: S.travelSub, approvSub: S.approvSub,
        pendingCat: S.pendingCat, pettyCashSub: S.pettyCashSub, reportMode: S.reportMode,
      }));
    } catch { /* quota exceeded / private browsing */ }
    document.querySelectorAll('#pc-sub .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === S.pettyCashSub));
    _loadPettyCash();
  });
  _loadPettyCash();
}

async function _loadPettyCash() {
  const wrap = document.getElementById('pc-body');
  wrap.innerHTML = `<div class="page-loading">Loading…</div>`;
  if (S.pettyCashSub === 'topup') { _renderTopupForm(wrap); return; }
  try {
    const [bal, txns, pending] = await Promise.all([
      getRunningBalance(),
      getAllTransactions({}),
      getPendingReimbursements(),
    ]);
    _renderLedger(wrap, bal, txns, pending);
  } catch (err) {
    wrap.innerHTML = _loadErrorHtml('pc-retry', "Couldn't load petty cash",
      'The float balance and ledger could not be retrieved — the figures shown could be wrong. Check your connection and retry.');
    document.getElementById('pc-retry')?.addEventListener('click', _loadPettyCash);
  }
}

function _renderLedger(wrap, bal, txns, pending) {
  S.pendingReimb = pending;
  const visible = txns.filter(t => _inWeek(t.txn_date, S.pcWeekStart));
  const suggestedTopup = (bal.balance < 0 ? Math.abs(bal.balance) : 0) + S.monthlyTopup;

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
        &nbsp;= ${_money(Math.abs(bal.balance))} deficit + ${_money(S.monthlyTopup)} regular
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
          <span style="font-weight:600">${esc(e.employee?.full_name || '—')}</span>
          <span class="text-muted" style="font-size:12px">${e.txns.length + e.claims.length} item${(e.txns.length + e.claims.length) !== 1 ? 's' : ''}</span>
          <span style="margin-left:auto;font-weight:600;color:var(--color-success,#66bb6a)">${_money(e.total)}</span>
          <button class="btn btn-ghost btn-sm pc-mark-emp-paid" data-empid="${esc(e.employee?.id || '')}" style="margin-left:8px">Mark paid</button>
        </summary>
        <table style="font-size:13px;width:100%;border-collapse:collapse;margin-top:8px;">
          ${e.txns.map(t => `<tr style="border-top:1px solid var(--border-color,#333);">
            <td style="padding:4px 6px;color:var(--text-secondary)">${_fmt(t.txn_date)}</td>
            <td style="padding:4px 6px">${esc(t.category?.name || '—')}</td>
            <td style="padding:4px 6px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.note || '—')}</td>
            <td style="padding:4px 6px;text-align:right;font-weight:500">${_money(t.amount, t.currency)}</td>
            <td style="padding:4px 6px;text-align:center;"><input type="checkbox" class="pc-item-check" data-type="txn" data-id="${esc(t.id)}"></td>
          </tr>`).join('')}
          ${e.claims.map(c => `<tr style="border-top:1px solid var(--border-color,#333);">
            <td style="padding:4px 6px;color:var(--text-secondary)">${_fmt(c.travel_date)}</td>
            <td style="padding:4px 6px">${c.vehicle_code === 'public' ? 'Transport' : 'Mileage'}</td>
            <td style="padding:4px 6px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.route || '—')}</td>
            <td style="padding:4px 6px;text-align:right;font-weight:500">${_money(Number(c.computed_reimbursement)+Number(c.computed_depreciation), c.currency)}</td>
            <td style="padding:4px 6px;text-align:center;"><input type="checkbox" class="pc-item-check" data-type="claim" data-id="${esc(c.id)}"></td>
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

    <div style="margin-bottom:14px;">${weekNavHtml('pc', S.pcWeekStart, { allowAll: true })}</div>

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
    S.prefillTopupAmt = suggestedTopup;
    S.pettyCashSub = 'topup';
    document.querySelectorAll('#pc-sub .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === S.pettyCashSub));
    _loadPettyCash();
  });
  document.getElementById('pc-custom-topup')?.addEventListener('click', () => {
    S.prefillTopupAmt = null;
    S.pettyCashSub = 'topup';
    document.querySelectorAll('#pc-sub .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === S.pettyCashSub));
    _loadPettyCash();
  });

  // Mark all paid
  document.getElementById('pc-mark-all-paid')?.addEventListener('click', async () => {
    const btn = document.getElementById('pc-mark-all-paid');
    btn.disabled = true;
    try {
      const txnIds   = (S.pendingReimb.txns   || []).map(t => t.id);
      const claimIds = (S.pendingReimb.claims || []).map(c => c.id);
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
        const txnIds   = (S.pendingReimb.txns   || []).filter(t => t.employee?.id === empId).map(t => t.id);
        const claimIds = (S.pendingReimb.claims || []).filter(c => c.employee?.id === empId).map(c => c.id);
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
  wireWeekNav('pc', () => S.pcWeekStart, v => { S.pcWeekStart = v; }, _loadPettyCash);
  _wireSetup();
}

function _renderTopupForm(wrap) {
  const prefill = S.prefillTopupAmt != null ? Number(S.prefillTopupAmt).toFixed(2) : '';
  S.prefillTopupAmt = null;   // consume — one-shot
  const catInOpts = _catIn().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  wrap.innerHTML = `
    <div class="card mb-4" style="max-width:680px">
      <div class="section-header">Record Top-up (money in)</div>
      <div class="form-body">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Date <span class="required">*</span></label>
            <input type="date" class="form-control" id="tu-date" value="${_today()}" style="color-scheme:dark"></div>
          <div class="form-group"><label class="form-label">Amount <span class="required">*</span></label>
            <input type="number" class="form-control" id="tu-amt" placeholder="15000.00" min="0.01" step="0.01" value="${prefill}"></div>
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
    const catName  = S.categories.find(c => c.id === parseInt(tuCat.value))?.name;
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
      <td>${esc(t.employee?.full_name||'—')}</td>
      <td>${esc(t.category?.name||'—')}</td>
      <td>${esc(t.project?.name||'—')}</td>
      <td style="color:${t.direction==='in'?'var(--color-success,#66bb6a)':'inherit'}">${_money(t.amount,t.currency)}</td>
      <td>${_badge(t.status)}</td>
      <td>${esc(t.note||'')}${t.source==='travel_claim'?' <span class="text-muted">(auto)</span>':''}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

async function _recordTopup() {
  const btn = document.getElementById('tu-submit'); btn.disabled = true;
  try {
    if (!S.myEmployee) throw new Error('Your admin account has no linked employee record to attribute the entry to.');
    const catId  = parseInt(document.getElementById('tu-cat').value) || null;
    const projId = document.getElementById('tu-proj').value;
    if (!catId)  throw new Error('Please select the Source.');
    if (!projId) throw new Error('Please select a Project / Purpose.');
    await apiRecordTopup({
      employeeId: S.myEmployee.id,
      txnDate:    document.getElementById('tu-date').value,
      amount:     document.getElementById('tu-amt').value,
      categoryId: catId,
      projectId:  projId,
      note:       document.getElementById('tu-note').value.trim() || null,
      actorId:    S.profile.id,
    });
    window.showToast?.('Top-up recorded.', 'success');
    window.refreshExpenseBadge?.();
    S.pettyCashSub = 'ledger';   // jump to the ledger so the new entry is visible
    _renderPettyCash();
  } catch (err) { window.showToast?.(err.message, 'error'); btn.disabled = false; }
}

function _setupPanel() {
  const vehRows = S.vehicles.map(v => `<tr>
    <td>${esc(v.label)}</td>
    <td><input type="number" class="form-control vr-fuel" data-code="${v.code}" value="${v.fuel_rate_per_km}" step="0.01" style="width:90px"></td>
    <td><input type="number" class="form-control vr-dep" data-code="${v.code}" value="${v.depreciation_per_km}" step="0.01" style="width:90px"></td>
    <td><button class="btn btn-ghost btn-sm vr-save" data-code="${v.code}" data-label="${esc(v.label)}">Save</button></td>
  </tr>`).join('');
  const catList = S.categories.map(c => `<li>${esc(c.name)} <span class="text-muted">(${c.applies_to})</span></li>`).join('');
  return `
    <div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border-color,#333);">
      <strong style="font-size:13px">Monthly Regular Top-up Amount (฿)</strong>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
        <input type="number" class="form-control" id="pc-monthly-amt" value="${S.monthlyTopup}" min="0" step="100" style="width:150px">
        <button class="btn btn-ghost btn-sm" id="pc-monthly-save">Save</button>
      </div>
      <p class="text-muted" style="font-size:12px;margin-top:4px;">Used to calculate the suggested top-up when the balance goes negative.</p>
    </div>
    <div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border-color,#333);">
      <strong style="font-size:13px">PT/Outsource Daily Rate (฿)</strong>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
        <input type="number" class="form-control" id="pc-pt-rate" value="${S.ptDailyRate}" min="0" step="25" style="width:150px">
        <button class="btn btn-ghost btn-sm" id="pc-pt-rate-save">Save</button>
      </div>
      <p class="text-muted" style="font-size:12px;margin-top:4px;">Full day = morning + afternoon sessions. Half-day session = ฿${(S.ptDailyRate/2).toLocaleString('en',{minimumFractionDigits:2})}. Used by the WEEKLY report wage calculation.</p>
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
      S.monthlyTopup = amt;
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
      S.ptDailyRate = rate;
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
      S.vehicles = await getVehicleRates().catch(() => S.vehicles);
      window.showToast?.('Rate saved.', 'success'); btn.disabled = false;
    } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
  }));
}

export async function renderPettyCash() { await _renderPettyCash(); }
