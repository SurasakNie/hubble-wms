// pages/expenses-approvals.js — APPROVALS tab (pending + history + edit/reject/override modals)

import { S, _fmt, _money, _badge, _settled, _curOpts, _projOptions, _projOptionsReq, _catOut, _catIn, _otherCatId, OFFICE_CAT_NAMES, _officeProjectId, _wireCurrencyConvert, _inWeek, _weekRange, STATUS_LABELS, STATUS_CLASS, _today, _loadErrorHtml } from './expenses-state.js';
import { esc, attr, toISODate, todayISO } from '../format.js';
import { weekNavHtml, wireWeekNav } from '../components/weekNav.js';
import { supabase } from '../config.js';
import { logAction } from '../api/auditLog.js';
import {
  getAllTransactions, approveTransaction, rejectTransaction, overrideTransactionStatus, updateTransaction, cancelTransaction,
  getAllTravelClaims, approveTravelClaim, rejectTravelClaim, overrideTravelClaimStatus, updateTravelClaim, cancelTravelClaim,
  getAllTripRequests, approveTripRequest, rejectTripRequest, completeTripRequest, overrideTripStatus, updateTripRequest, cancelTripRequest,
  approveSettlement,
} from '../api/expenses.js';

// Module-level callback refs (set by renderApprovals each time it's called)
let _refreshCountCb = null;
let _updateBadgeCb  = null;

// Also need _costItemsText here for the pending approvals table
function _costItemsText(items) {
  if (!items || !items.length) return '';
  return items.map(it => {
    if (!it || typeof it !== 'object') return String(it);
    if (it.perDay != null) return `Daily ฿${Number(it.perDay).toLocaleString()}/day×${it.days}d = ฿${Number(it.amount).toLocaleString()}`;
    if (it.subtotal != null) return `${it.label} ฿${Number(it.amount).toLocaleString()}×${it.qty} = ฿${Number(it.subtotal).toLocaleString()}`;
    return it.label;
  }).join(' · ');
}

async function _renderApprovals() {
  const body = document.getElementById('exp-body');
  body.innerHTML = `
    <div class="tabs" id="ap-sub" style="margin-bottom:16px">
      <button class="tab-btn${S.approvSub==='pending'?' active':''}" data-tab="pending">PENDING <span id="exp-pending-count" class="badge badge-pending" style="margin-left:6px;${S.pendingApprovals>0?'':'display:none;'}">${S.pendingApprovals}</span></button>
      <button class="tab-btn${S.approvSub==='history'?' active':''}" data-tab="history">HISTORY</button>
    </div>
    <div id="ap-body"><div class="page-loading">Loading…</div></div>`;
  document.getElementById('ap-sub').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    S.approvSub = btn.dataset.tab;
    // Save tab state via the stored callback pattern — approvals doesn't own _saveTabState,
    // so we just update S directly; expenses.js _saveTabState reads from S.
    try {
      sessionStorage.setItem('exp_tab_state', JSON.stringify({
        primaryTab: S.primaryTab, travelSub: S.travelSub, approvSub: S.approvSub,
        pendingCat: S.pendingCat, pettyCashSub: S.pettyCashSub, reportMode: S.reportMode,
      }));
    } catch { /* quota exceeded / private browsing */ }
    document.querySelectorAll('#ap-sub .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === S.approvSub));
    _loadApprovals();
  });
  _loadApprovals();
}

async function _loadApprovals() {
  const wrap = document.getElementById('ap-body');
  wrap.innerHTML = `<div class="page-loading">Loading…</div>`;

  try {
    if (S.approvSub === 'pending') {
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
      S.pendingData = {
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
  const wk = S.apWeekStart;
  // Week filter is client-side over the cached fetch, by each item's relevant date.
  const exp    = S.pendingData.exp.filter(t => _inWeek(t.txn_date, wk));
  const claims = S.pendingData.claims.filter(c => _inWeek(c.travel_date, wk));
  const trips  = S.pendingData.trips.filter(t => _inWeek(t.start_date, wk));
  const settlements = S.pendingData.settlements.filter(t => _inWeek(t.settlement_submitted_at, wk));

  const expTable = exp.length === 0 ? `<p class="empty-state">None.</p>`
    : `<div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Employee</th><th>Date</th><th>Category</th><th>Project</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${exp.map(t => `<tr>
          <td>${esc(t.employee?.full_name||'—')}</td><td>${_fmt(t.txn_date)}</td>
          <td>${esc(t.category?.name||'—')}</td><td>${esc(t.project?.name||'—')}</td>
          <td>${_money(t.amount,t.currency)}</td><td>${_badge(t.status)}</td>
          <td class="row-actions">${S.admin?`<button class="btn btn-ghost btn-sm edit-pend-btn" data-kind="exp" data-id="${esc(t.id)}">Edit</button>`:''}${_apprBtns('exp', t.id, t.status)}</td></tr>`).join('')}</tbody></table></div>`;

  const clTable = claims.length === 0 ? `<p class="empty-state">None.</p>`
    : `<div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Employee</th><th>Date</th><th>Route</th><th>Vehicle</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${claims.map(c => `<tr>
          <td>${esc(c.employee?.full_name||'—')}</td><td>${_fmt(c.travel_date)}</td>
          <td>${esc(c.route)}</td><td>${esc(c.vehicle?.label||c.vehicle_code)}</td>
          <td>${_money(Number(c.computed_reimbursement)+Number(c.computed_depreciation),c.currency)}</td><td>${_badge(c.status)}</td>
          <td class="row-actions">${S.admin?`<button class="btn btn-ghost btn-sm edit-pend-btn" data-kind="claim" data-id="${esc(c.id)}">Edit</button>`:''}${_apprBtns('claim', c.id, c.status)}</td></tr>`).join('')}</tbody></table></div>`;

  const tpTable = trips.length === 0 ? `<p class="empty-state">None.</p>`
    : `<div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Employee</th><th>Destination</th><th>Dates</th><th>Est. Cost</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${trips.map(t => `<tr>
          <td>${esc(t.employee?.full_name||'—')}</td>
          <td>${esc(t.destination)}${(t.cost_items && t.cost_items.length) ? `<br><small class="text-muted">Incl: ${esc(_costItemsText(t.cost_items))}</small>` : ''}</td>
          <td>${_fmt(t.start_date)}–${_fmt(t.end_date)}</td><td>${t.estimated_cost?_money(t.estimated_cost,t.currency):'—'}</td>
          <td>${_badge(t.status)}</td><td class="row-actions">${S.admin?`<button class="btn btn-ghost btn-sm edit-pend-btn" data-kind="trip" data-id="${esc(t.id)}">Edit</button>`:''}${_apprBtns('trip', t.id, t.status)}</td></tr>`).join('')}</tbody></table></div>`;

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
            <td>${esc(t.employee?.full_name||'—')}</td>
            <td>${esc(t.travel_ref||'—')}<br><small class="text-muted">${esc(t.destination)}</small></td>
            <td>${_fmt(t.start_date)}–${_fmt(t.end_date)}</td>
            <td>${_money(advance, t.currency)}</td>
            <td>${_money(actual, t.currency)}<br><small class="text-muted">${esc(diffLabel)}</small></td>
            <td class="row-actions"><button class="btn btn-primary btn-sm settle-appr-btn" data-id="${esc(t.id)}">Approve</button></td></tr>`;
        }).join('')}</tbody></table></div>`;

  const cats = [
    { key:'expense',    label:'Expenses',       n:exp.length,         table:expTable },
    { key:'mileage',    label:'Mileage Claims',  n:claims.length,      table:clTable  },
    { key:'trip',       label:'Trip Requests',   n:trips.length,       table:tpTable  },
    { key:'settlement', label:'Settlements',     n:settlements.length, table:stTable  },
  ];
  const active = cats.find(c => c.key === S.pendingCat) || cats[0];

  wrap.innerHTML = `
    <div style="margin-bottom:14px;">${weekNavHtml('ap', wk, { allowAll: true })}</div>
    <div class="tabs" id="ap-cat" style="margin-bottom:16px">
      ${cats.map(c => `<button class="tab-btn${S.pendingCat===c.key?' active':''}" data-cat="${c.key}">${c.label}
        <span class="badge badge-pending" style="margin-left:6px;${c.n>0?'':'display:none'}">${c.n}</span></button>`).join('')}
    </div>
    <div>${active.table}</div>
  `;

  document.getElementById('ap-cat').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    S.pendingCat = btn.dataset.cat;
    try {
      sessionStorage.setItem('exp_tab_state', JSON.stringify({
        primaryTab: S.primaryTab, travelSub: S.travelSub, approvSub: S.approvSub,
        pendingCat: S.pendingCat, pettyCashSub: S.pettyCashSub, reportMode: S.reportMode,
      }));
    } catch { /* quota exceeded / private browsing */ }
    _renderPending(wrap);
  });
  wireWeekNav('ap', () => S.apWeekStart, v => { S.apWeekStart = v; }, () => _renderPending(wrap));
  _wireApprovals(wrap);
}

function _apprBtns(kind, id, status) {
  const tier = status === 'manager_approved' ? 'finance' : 'manager';
  const label = (status === 'manager_approved' && S.admin) ? 'Final Approve' : 'Approve';
  if (status === 'manager_approved' && !S.admin) return '<span class="text-muted">awaiting finance</span>';
  return `<button class="btn btn-primary btn-sm appr-btn" data-kind="${kind}" data-id="${id}" data-tier="${tier}">${label}</button>
          <button class="btn btn-danger btn-sm rej-btn" data-kind="${kind}" data-id="${id}">Reject</button>`;
}

function _wireApprovals(wrap) {
  wrap.querySelectorAll('.edit-pend-btn').forEach(btn => btn.addEventListener('click', () => {
    const kind = btn.dataset.kind, id = btn.dataset.id;
    let item;
    if (kind === 'exp')   item = S.pendingData.exp.find(t => t.id === id);
    if (kind === 'claim') item = S.pendingData.claims.find(c => c.id === id);
    if (kind === 'trip')  item = S.pendingData.trips.find(t => t.id === id);
    if (item) _openEditModal(kind, item);
  }));
  const approveFns = { exp: approveTransaction, claim: approveTravelClaim, trip: approveTripRequest };
  const rejectFns  = { exp: rejectTransaction,  claim: rejectTravelClaim,  trip: rejectTripRequest };
  wrap.querySelectorAll('.appr-btn').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await approveFns[btn.dataset.kind](btn.dataset.id, btn.dataset.tier, S.profile.id);
      window.showToast?.('Approved.', 'success');
      const _at = { exp: 'expense', claim: 'travel_claim', trip: 'trip_request' }[btn.dataset.kind];
      logAction('approve_' + _at, _at, btn.dataset.id, null, { status: { old: 'pending', new: 'approved' } });
      window.refreshExpenseBadge?.();
      await _refreshCountCb?.();
      _updateBadgeCb?.();
      _loadApprovals();
    } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
  }));
  wrap.querySelectorAll('.rej-btn').forEach(btn => btn.addEventListener('click', () => {
    _openRejectModal(btn.dataset.kind, btn.dataset.id);
  }));
  wrap.querySelectorAll('.settle-appr-btn').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await approveSettlement(btn.dataset.id);
      window.showToast?.('Settlement approved — float entry posted.', 'success');
      logAction('approve_settlement', 'trip_request', btn.dataset.id, null, { settlement_status: { old: 'submitted', new: 'approved' } });
      window.refreshExpenseBadge?.();
      await _refreshCountCb?.();
      _updateBadgeCb?.();
      _loadApprovals();
    } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
  }));
}

// ─── Admin edit modal (pre-filled, same fields as submission form) ────────────
function _openEditModal(kind, item) {
  document.getElementById('exp-edit-modal')?.remove();

  const catOpts = _catOut().map(c => `<option value="${c.id}" ${(item.category_id && parseInt(item.category_id)===c.id)?'selected':''}>${esc(c.name)}</option>`).join('');
  const vehOpts = S.vehicles.map(v => `<option value="${esc(v.code)}" ${item.vehicle_code===v.code?'selected':''}>${esc(v.label)} (${Number(v.fuel_rate_per_km)+Number(v.depreciation_per_km)}/km)</option>`).join('');

  let title = '', formHtml = '';

  if (kind === 'exp') {
    title = 'Edit Expense';
    formHtml = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <label class="form-label">Date <span class="required">*</span><input class="form-input" type="date" id="edt-date" value="${esc(item.txn_date||'')}" max="${_today()}" style="color-scheme:dark"></label>
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
        <label class="form-label">Receipt URL<input class="form-input" type="url" id="edt-rcpt" value="${esc(item.receipt_url||'')}" placeholder="https://…"></label>
      </div>
      <label class="form-label" style="display:block;">Note<textarea class="form-input" id="edt-note" rows="3" style="resize:vertical;">${esc(item.note||'')}</textarea></label>`;
  } else if (kind === 'claim') {
    const isPublic = item.vehicle_code === 'public';
    title = 'Edit Mileage Claim';
    formHtml = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <label class="form-label">Travel Date <span class="required">*</span><input class="form-input" type="date" id="edt-date" value="${esc(item.travel_date||'')}" style="color-scheme:dark"></label>
        <label class="form-label">Project / Purpose<select class="form-input" id="edt-proj">${_projOptions(item.project_id)}</select></label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <label class="form-label">Vehicle <span class="required">*</span><select class="form-input" id="edt-veh">${vehOpts}</select></label>
        <label class="form-label">Trip Type <span class="required">*</span><select class="form-input" id="edt-trip">
          <option value="one_way" ${item.trip_type==='one_way'?'selected':''}>One Way</option>
          <option value="round_trip" ${item.trip_type==='round_trip'?'selected':''}>Round Trip</option>
        </select></label>
      </div>
      <label class="form-label" style="display:block;margin-bottom:14px;">Route <span class="required">*</span><input class="form-input" type="text" id="edt-route" value="${esc(item.route||'')}"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <label class="form-label">Distance (km)${isPublic?' <span class="text-muted">(n/a public)</span>':''}<input class="form-input" type="number" id="edt-dist" value="${item.distance_km||''}" step="0.1" min="0" ${isPublic?'disabled':''}></label>
        <label class="form-label">Manual Amount (public transport)${!isPublic?' <span class="text-muted">(n/a)</span>':''}<input class="form-input" type="number" id="edt-manual" value="${item.manual_amount||''}" step="0.01" min="0" ${!isPublic?'disabled':''}></label>
      </div>
      <label class="form-label" style="display:block;">Note<input class="form-input" type="text" id="edt-note" value="${esc(item.note||'')}"></label>`;
  } else if (kind === 'trip') {
    title = 'Edit Trip Request';
    formHtml = `
      <label class="form-label" style="display:block;margin-bottom:14px;">Destination <span class="required">*</span><input class="form-input" type="text" id="edt-dest" value="${esc(item.destination||'')}"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <label class="form-label">Start Date <span class="required">*</span><input class="form-input" type="date" id="edt-start" value="${esc(item.start_date||'')}" style="color-scheme:dark"></label>
        <label class="form-label">End Date <span class="required">*</span><input class="form-input" type="date" id="edt-end" value="${esc(item.end_date||'')}" style="color-scheme:dark"></label>
      </div>
      <label class="form-label" style="display:block;margin-bottom:14px;">Purpose <span class="required">*</span><textarea class="form-input" id="edt-purpose" rows="2" style="resize:vertical;">${esc(item.purpose||'')}</textarea></label>
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

  const canApproveNow = S.admin && ['pending', 'manager_approved'].includes(item.status);

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
      const catName = S.categories.find(c => c.id === parseInt(catSel.value))?.name;
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
          await approveFns[kind](item.id, 'manager', S.profile.id);
          item.status = 'manager_approved';
        }
        await approveFns[kind](item.id, 'finance', S.profile.id);
        item.status = 'approved';
        window.showToast?.('Saved & Approved.', 'success');
        close();
        window.refreshExpenseBadge?.();
        await _refreshCountCb?.();
        _updateBadgeCb?.();
        _loadApprovals();
      } catch (err) {
        window.showToast?.(err.message, 'error');
        approveBtn.disabled = false;
      }
    });
  }
}

function _renderApprovalHistory(wrap, exp, claims, trips) {
  S.historyItems = [
    ...exp.map(t => ({ type:'Expense', date:t.updated_at, who:t.employee?.full_name, detail:`${t.category?.name||'—'} · ${_fmt(t.txn_date)}`, amount:_money(t.amount,t.currency), status:t.status, id:t.id, kind:'exp', raw:t })),
    ...claims.map(c => ({ type:'Mileage', date:c.updated_at, who:c.employee?.full_name, detail:`${c.route} · ${_fmt(c.travel_date)}`, amount:_money(Number(c.computed_reimbursement)+Number(c.computed_depreciation),c.currency), status:c.status, id:c.id, kind:'claim', raw:c })),
    ...trips.map(t => ({ type:'Trip', date:t.updated_at, who:t.employee?.full_name, detail:`${t.destination} · ${_fmt(t.start_date)}`, amount:t.estimated_cost?_money(t.estimated_cost,t.currency):'—', status:t.status, id:t.id, kind:'trip', raw:t })),
  ].sort((a,b) => new Date(b.date) - new Date(a.date));
  const items = S.historyItems;

  wrap.innerHTML = `
    <div class="section-header">All Requests <span class="text-muted">(${items.length})</span></div>
    ${items.length===0?`<p class="empty-state">None.</p>`:`<div class="table-wrapper"><table class="data-table">
      <thead><tr><th>Type</th><th>Employee</th><th>Detail</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${items.map(i => `<tr>
        <td>${i.type}</td><td>${esc(i.who||'—')}</td><td>${esc(i.detail)}</td>
        <td>${i.amount}</td><td>${_badge(i.status)}</td>
        <td class="row-actions">
          ${S.admin ? `<button class="btn btn-ghost btn-sm edit-hist-btn" data-kind="${esc(i.kind)}" data-id="${esc(i.id)}">Edit</button>` : ''}
          <button class="btn btn-ghost btn-sm ovr-btn" data-kind="${esc(i.kind)}" data-id="${esc(i.id)}">Override</button>
        </td>
      </tr>`).join('')}</tbody></table></div>`}
  `;
  wrap.querySelectorAll('.ovr-btn').forEach(btn => btn.addEventListener('click', () => {
    _openOverrideModal(btn.dataset.kind, btn.dataset.id);
  }));
  wrap.querySelectorAll('.edit-hist-btn').forEach(btn => btn.addEventListener('click', () => {
    const found = S.historyItems.find(i => i.kind === btn.dataset.kind && i.id === btn.dataset.id);
    if (found) _openEditModal(found.kind, found.raw);
  }));
}

// Override-status modal: dropdown of valid statuses, preselected to the current one.
function _openRejectModal(kind, id) {
  const rejectFns = { exp: rejectTransaction, claim: rejectTravelClaim, trip: rejectTripRequest };
  let item;
  if (kind === 'exp')   item = S.pendingData.exp.find(t => t.id === id);
  if (kind === 'claim') item = S.pendingData.claims.find(c => c.id === id);
  if (kind === 'trip')  item = S.pendingData.trips.find(t => t.id === id);

  let detail = '';
  if (item) {
    const who = esc(item.employee?.full_name || '');
    if (kind === 'exp')   detail = [who, esc(item.category_name||''), item.amount != null ? `${esc(String(item.amount))} ${esc(item.currency||'')}` : ''].filter(Boolean).join(' · ');
    if (kind === 'claim') detail = [who, esc(item.vehicle_type||''), esc(item.route_summary||'')].filter(Boolean).join(' · ');
    if (kind === 'trip')  detail = [who, esc(item.destination||''), esc(item.start_date||'')].filter(Boolean).join(' · ');
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
      await rejectFns[kind](id, S.profile.id, reason);
      window.showToast?.('Rejected.', 'success');
      const _rt = { exp: 'expense', claim: 'travel_claim', trip: 'trip_request' }[kind];
      logAction('reject_' + _rt, _rt, id, null, { status: { old: 'pending', new: 'rejected' }, reason: reason || null });
      window.refreshExpenseBadge?.();
      await _refreshCountCb?.();
      _updateBadgeCb?.();
      _loadApprovals();
      close();
    } catch (e) { window.showToast?.(e.message, 'error'); applyBtn.disabled = false; }
  });
}

function _openOverrideModal(kind, id) {
  const item = S.historyItems.find(i => i.kind === kind && i.id === id);
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
          ${esc(item.type)} · ${esc(item.who || '—')} · ${esc(item.detail || '')}
        </p>` : ''}
        <label class="form-label">Status
          <select class="form-input" id="ovr-status">
            ${opts.map(s => `<option value="${s}"${item && item.status === s ? ' selected' : ''}>${esc(STATUS_LABELS[s] || s)}</option>`).join('')}
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
        else await overrideTravelClaimStatus(id, status);
      }
      if (kind === 'trip')  await overrideTripStatus(id, status);
      window.showToast?.('Status updated.', 'success');
      close();
      _loadApprovals();
    } catch (e) { window.showToast?.(e.message, 'error'); applyBtn.disabled = false; }
  });
}

export async function renderApprovals({ refreshCount, updateBadge }) {
  _refreshCountCb = refreshCount;
  _updateBadgeCb  = updateBadge;
  await _renderApprovals();
}
