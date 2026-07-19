// js/pages/holidays-my-leave.js — MY LEAVE tab: Leave, Flex, and Balance sub-tabs

import { S, _fmt, _isWeekend, _nextWeekday, _wireWeekendBlock, _balCards, STATUS_BADGE } from './holidays-state.js';
import { toISODate, todayISO, esc, attr } from '../format.js';
import { confirmModal } from '../components/confirmModal.js';
import {
  getLeaveBalances, getAllLeaveBalances,
  submitLeaveRequest, cancelLeaveRequest,
  submitFlexSwap, cancelFlexSwap,
} from '../api/leaves.js';

// ── MY LEAVE tab ──────────────────────────────────────────────

export function renderMyLeave(wrap) {
  if (!S.myEmployee) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:32px">
      <div class="empty-state-title">No employee record linked</div>
      <div class="empty-state-desc">Ask an admin to link your account to an employee record.</div>
    </div>`;
    return;
  }

  const myEmpId = S.myEmployee.id;
  const allMine = S.requests.filter(r => r.employee_id === myEmpId);
  const today   = todayISO();

  const visible     = S.showPastLeave
    ? allMine
    : allMine.filter(r => r.status === 'pending' || r.end_date >= today);
  const hiddenCount = allMine.length - visible.length;

  wrap.innerHTML = `
    <div style="max-width:540px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
      <div class="form-label" style="font-size:15px;font-weight:600;">Submit Leave Request</div>

      <label class="form-label">Leave Type
        <select class="form-input" id="hl-ml-type">
          ${S.leaveTypes.filter(t => t.code !== 'flex_holiday'
              && (t.code !== 'maternity_leave' || S.myEmployee?.gender === 'female'))
            .map(t => `<option value="${attr(t.code)}">${esc(t.label)}</option>`).join('')}
        </select>
      </label>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <label class="form-label">From
          <input class="form-input" type="date" id="hl-ml-start" value="${_nextWeekday(today)}" min="${today}">
        </label>
        <label class="form-label">To
          <input class="form-input" type="date" id="hl-ml-end" value="${_nextWeekday(today)}" min="${today}">
        </label>
      </div>

      <label class="form-label">Granularity
        <select class="form-input" id="hl-ml-gran">
          <option value="full_day">Full day</option>
          <option value="half_day">Half day</option>
        </select>
      </label>

      <label class="form-label">Notes
        <textarea class="form-input" id="hl-ml-notes" rows="3" placeholder="Optional reason or details…" style="resize:vertical;"></textarea>
      </label>

      <div id="hl-ml-doc-row" style="display:none;">
        <label class="form-label">Supporting document path / URL
          <input class="form-input" type="text" id="hl-ml-doc" placeholder="e.g. storage/docs/med-cert.pdf">
        </label>
      </div>

      <div id="hl-ml-cross-warn" style="display:none;padding:10px 14px;background:var(--warning-bg,#2a2310);
        border:1px solid var(--warning,#c9a020);border-radius:6px;font-size:13px;color:var(--warning,#c9a020);">
        ⚠️ Balance is low — this request may draw from your cross-pool leave balance.
      </div>

      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary" id="hl-ml-submit">SUBMIT REQUEST</button>
        <button class="btn btn-ghost" id="hl-ml-reset">RESET</button>
      </div>
    </div>

    <div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;">LEAVE HISTORY</div>
        ${hiddenCount > 0 || S.showPastLeave ? `
          <button class="btn btn-sm" id="hl-ml-toggle" style="margin-left:auto;">
            ${S.showPastLeave ? 'Hide past' : `Show past (${hiddenCount})`}
          </button>` : ''}
      </div>
      ${visible.length === 0
        ? `<div class="empty-state"><div class="empty-state-title">${allMine.length === 0 ? 'No leave requests yet' : 'No upcoming requests'}</div></div>`
        : `<div style="overflow-x:auto;">
             <table class="data-table">
               <thead><tr>
                 <th>Type</th><th>From</th><th>To</th><th>Duration</th><th>Status</th><th>Reason</th><th>Submitted</th><th></th>
               </tr></thead>
               <tbody>
                 ${visible.map(r => `<tr>
                   <td>${esc(r.leave_type?.label || r.leave_type_code)}</td>
                   <td>${_fmt(r.start_date)}</td>
                   <td>${_fmt(r.end_date)}</td>
                   <td>${r.duration_hours ? r.duration_hours + 'h' : r.granularity.replace('_',' ')}</td>
                   <td>
                     <span class="${STATUS_BADGE[r.status] || 'badge'}">${r.status}</span>
                     ${r.is_cross_type_deduction ? `<span class="badge badge-pending" title="Cross-pool">~pool</span>` : ''}
                   </td>
                   <td style="font-size:12px;color:var(--text-muted);">${r.status === 'rejected' ? esc(r.rejection_reason || '—') : ''}</td>
                   <td>${_fmt(r.created_at?.slice(0,10))}</td>
                   <td>
                     ${r.status === 'pending'
                       ? `<button class="btn btn-sm hl-cancel-req" data-id="${attr(r.id)}">Cancel</button>`
                       : ''}
                   </td>
                 </tr>`).join('')}
               </tbody>
             </table>
           </div>`
      }
    </div>
  `;

  const typeSel = document.getElementById('hl-ml-type');
  const docRow  = document.getElementById('hl-ml-doc-row');
  typeSel?.addEventListener('change', () => {
    const t = S.leaveTypes.find(x => x.code === typeSel.value);
    docRow.style.display = t?.requires_document ? '' : 'none';
  });

  _wireWeekendBlock('hl-ml-start');
  _wireWeekendBlock('hl-ml-end');

  document.getElementById('hl-ml-reset')?.addEventListener('click', () => renderMyLeave(wrap));

  document.getElementById('hl-ml-submit')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const typeCode  = document.getElementById('hl-ml-type').value;
    const startDate = document.getElementById('hl-ml-start').value;
    const endDate   = document.getElementById('hl-ml-end').value;
    const gran      = document.getElementById('hl-ml-gran').value;
    const notes     = document.getElementById('hl-ml-notes').value.trim();
    const docPath   = document.getElementById('hl-ml-doc')?.value.trim() || null;

    if (!startDate || !endDate) { window.showToast?.('Start and end dates are required', 'error'); return; }
    if (startDate < todayISO())  { window.showToast?.('Start date cannot be in the past', 'error'); return; }
    if (endDate < startDate)    { window.showToast?.('End date must be on or after start date', 'error'); return; }
    if (_isWeekend(startDate) || _isWeekend(endDate)) { window.showToast?.('Leave cannot start or end on a weekend', 'error'); return; }

    let isCross = false, crossType;
    if (typeCode === 'annual_leave' || typeCode === 'personal_leave') {
      const myBal = S.balances.find(b => b.leave_type_code === typeCode && b.employee_id === myEmpId);
      if (myBal) {
        const avail = myBal.allocated_days + myBal.carried_over_days + myBal.manual_adjustment_days - myBal.used_days;
        if (avail <= 0) {
          const partner    = typeCode === 'annual_leave' ? 'personal_leave' : 'annual_leave';
          const partnerBal = S.balances.find(b => b.leave_type_code === partner && b.employee_id === myEmpId);
          if (!partnerBal) { window.showToast?.('Insufficient leave balance — no cross-pool available', 'error'); return; }
          const partnerAvail = partnerBal.allocated_days + partnerBal.carried_over_days + partnerBal.manual_adjustment_days - partnerBal.used_days;
          if (partnerAvail <= 0) { window.showToast?.('Insufficient leave balance in both annual and personal leave', 'error'); return; }
          isCross   = true;
          crossType = partner;
        }
      }
    }

    btn.disabled = true;
    try {
      const req = await submitLeaveRequest({
        employeeId: myEmpId, leaveTypeCode: typeCode,
        startDate, endDate, startTime: null, endTime: null,
        granularity: gran, notes, documentPath: docPath,
        isCrossTypeDeduction: isCross, deductedFromType: crossType,
      });
      S.requests = [req, ...S.requests];
      window.showToast?.('Leave request submitted', 'success');
      if (isCross) window.showToast?.('Cross-pool deduction flagged for HR review', 'warning');
      renderMyLeave(wrap);
    } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
  });

  document.getElementById('hl-ml-toggle')?.addEventListener('click', () => {
    S.showPastLeave = !S.showPastLeave;
    renderMyLeave(wrap);
  });

  wrap.querySelectorAll('.hl-cancel-req').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await confirmModal({ title: 'Cancel leave request', message: 'Cancel this leave request?', confirmText: 'Cancel request', cancelText: 'Keep it', danger: true })) return;
      try {
        await cancelLeaveRequest(btn.dataset.id);
        S.requests = S.requests.map(r => r.id === btn.dataset.id ? { ...r, status: 'cancelled' } : r);
        window.showToast?.('Request cancelled', 'success');
        renderMyLeave(wrap);
      } catch (err) { window.showToast?.(err.message, 'error'); }
    });
  });
}

// ── FLEX tab ──────────────────────────────────────────────────

export function renderFlex(wrap, saveTabState) {
  if (!S.myEmployee && !S.admin) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:32px">
      <div class="empty-state-title">No employee record linked</div>
    </div>`;
    return;
  }

  const myEmpIdF   = S.myEmployee?.id;
  const allMySwaps = myEmpIdF ? S.flexSwaps.filter(s => s.employee_id === myEmpIdF) : [];
  const todayF     = todayISO();
  const mySwaps    = S.showPastFlex
    ? allMySwaps
    : allMySwaps.filter(s => s.status === 'pending' ||
        (s.substitute_date && s.substitute_date >= todayF) ||
        (s.valid_from && s.valid_from >= todayF));
  const hiddenFlexCount = allMySwaps.length - mySwaps.length;
  const today = todayISO();

  wrap.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:20px;">
      <button class="tab-btn${S.flexSubTab === 'swap' ? ' active' : ''}" id="hl-flex-sub-swap">Flex Swap</button>
      <button class="tab-btn${S.flexSubTab === 'wfh' ? ' active' : ''}" id="hl-flex-sub-wfh">Work From Home</button>
    </div>
    <div id="hl-flex-body"></div>

    <div style="margin-top:32px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;">MY FLEX HISTORY</div>
        ${hiddenFlexCount > 0 || S.showPastFlex ? `
          <button class="btn btn-sm" id="hl-flex-toggle" style="margin-left:auto;">
            ${S.showPastFlex ? 'Hide past' : `Show past (${hiddenFlexCount})`}
          </button>` : ''}
      </div>
      ${mySwaps.length === 0
        ? `<div class="empty-state"><div class="empty-state-title">${allMySwaps.length === 0 ? 'No flex entries yet' : 'No upcoming flex entries'}</div></div>`
        : `<div style="overflow-x:auto;">
             <table class="data-table">
               <thead><tr>
                 <th>Type</th><th>Waived Holiday</th><th>Date</th><th>Valid Until</th><th>Status</th><th>Reason</th><th></th>
               </tr></thead>
               <tbody>
                 ${mySwaps.map(s => `<tr>
                   <td><span class="badge">${s.swap_type === 'wfh' ? 'WFH' : 'Flex Swap'}</span></td>
                   <td>${s.waived_holiday ? `${_fmt(s.waived_holiday.date)} — ${esc(s.waived_holiday.name)}` : '—'}</td>
                   <td>${s.substitute_date ? _fmt(s.substitute_date) : (s.valid_from ? _fmt(s.valid_from) : '—')}</td>
                   <td>${s.valid_until ? _fmt(s.valid_until) : '—'}</td>
                   <td><span class="${STATUS_BADGE[s.status] || 'badge'}">${s.status}</span></td>
                   <td style="font-size:12px;color:var(--text-muted);">${s.status === 'rejected' ? esc(s.manager_notes || '—') : ''}</td>
                   <td>${s.status === 'pending'
                     ? `<button class="btn btn-sm hl-cancel-flex" data-id="${attr(s.id)}">Cancel</button>`
                     : ''}
                   </td>
                 </tr>`).join('')}
               </tbody>
             </table>
           </div>`
      }
    </div>
  `;

  document.getElementById('hl-flex-sub-swap').addEventListener('click', () => {
    S.flexSubTab = 'swap'; saveTabState?.();
    renderFlex(wrap, saveTabState);
  });
  document.getElementById('hl-flex-sub-wfh').addEventListener('click', () => {
    S.flexSubTab = 'wfh'; saveTabState?.();
    renderFlex(wrap, saveTabState);
  });

  document.getElementById('hl-flex-toggle')?.addEventListener('click', () => {
    S.showPastFlex = !S.showPastFlex;
    renderFlex(wrap, saveTabState);
  });

  wrap.querySelectorAll('.hl-cancel-flex').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await confirmModal({ title: 'Cancel flex entry', message: 'Cancel this flex entry?', confirmText: 'Cancel entry', cancelText: 'Keep it', danger: true })) return;
      try {
        await cancelFlexSwap(btn.dataset.id);
        S.flexSwaps = S.flexSwaps.map(s => s.id === btn.dataset.id ? { ...s, status: 'cancelled' } : s);
        window.showToast?.('Flex entry cancelled', 'success');
        renderFlex(wrap, saveTabState);
      } catch (err) { window.showToast?.(err.message, 'error'); }
    });
  });

  const body = document.getElementById('hl-flex-body');
  if (S.flexSubTab === 'swap') {
    _renderFlexSwapForm(body, wrap, saveTabState);
  } else {
    _renderWfhForm(body, wrap, saveTabState);
  }
}

function _renderFlexSwapForm(body, wrap, saveTabState) {
  const today = todayISO();
  body.innerHTML = `
    <div style="max-width:540px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
      <div class="form-label" style="font-size:15px;font-weight:600;">Submit Flex Holiday Swap</div>

      <label class="form-label">Holiday to waive
        <select class="form-input" id="hl-flex-holiday">
          <option value="">Select year: use ← → on Holidays tab to load ${S.year}</option>
          ${S.holidays.map(h => `<option value="${attr(h.id)}">${_fmt(h.date)} — ${esc(h.name)}</option>`).join('')}
        </select>
      </label>

      <div>
        <label class="form-label">Substitute date (working day off instead)
          <input class="form-input" type="date" id="hl-flex-sub" min="${today}">
        </label>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Select a weekday (Mon–Fri) as your substitute day off.</div>
      </div>

      <div id="hl-flex-window" style="display:none;font-size:12px;color:var(--text-muted);padding:8px 12px;
        background:var(--surface-2);border-radius:6px;border:1px solid var(--border-color);">
        Valid window: <span id="hl-flex-window-text">—</span>
      </div>

      <button class="btn btn-primary" id="hl-flex-submit" style="align-self:flex-start;">SUBMIT SWAP</button>
    </div>`;

  document.getElementById('hl-flex-holiday')?.addEventListener('change', e => {
    const h = S.holidays.find(x => x.id === e.target.value);
    const win = document.getElementById('hl-flex-window');
    const txt = document.getElementById('hl-flex-window-text');
    if (!h) { win.style.display = 'none'; return; }
    const d = new Date(h.date + 'T00:00:00');
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    let from, until;
    if      (m === 12) { from = `1 Dec ${y}`;   until = `31 Jan ${y + 1}`; }
    else if (m ===  1) { from = `1 Dec ${y - 1}`; until = `31 Jan ${y}`; }
    else               { from = `1 Jan ${y}`;   until = `31 Dec ${y}`; }
    txt.textContent = `${from} → ${until}`;
    win.style.display = '';
  });

  _wireWeekendBlock('hl-flex-sub');

  document.getElementById('hl-flex-submit')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const empId   = S.myEmployee?.id;
    const holId   = document.getElementById('hl-flex-holiday').value;
    const subDate = document.getElementById('hl-flex-sub').value;
    if (!empId)   { window.showToast?.('No employee record found', 'error'); return; }
    if (!holId)   { window.showToast?.('Select a holiday to waive', 'error'); return; }
    if (!subDate) { window.showToast?.('Select a substitute date', 'error'); return; }
    const dow = new Date(subDate + 'T00:00:00').getDay();
    if (dow === 0 || dow === 6) { window.showToast?.('Substitute date must be a weekday (Mon–Fri)', 'error'); return; }
    btn.disabled = true;
    try {
      const swap = await submitFlexSwap({ employeeId: empId, waivedHolidayId: holId, substituteDate: subDate, swapType: 'move' });
      S.flexSwaps = [swap, ...S.flexSwaps];
      window.showToast?.('Flex swap submitted', 'success');
      renderFlex(wrap, saveTabState);
    } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
  });
}

function _renderWfhForm(body, wrap, saveTabState) {
  const today = todayISO();
  body.innerHTML = `
    <div style="max-width:540px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
      <div class="form-label" style="font-size:15px;font-weight:600;">Submit Work From Home Request</div>

      <label class="form-label">Date to work from home
        <input class="form-input" type="date" id="hl-wfh-date" min="${today}">
      </label>

      <label class="form-label">Notes (optional)
        <textarea class="form-input" id="hl-wfh-notes" rows="2" placeholder="Optional notes…" style="resize:vertical;"></textarea>
      </label>

      <button class="btn btn-primary" id="hl-wfh-submit" style="align-self:flex-start;">SUBMIT WFH REQUEST</button>
    </div>`;

  _wireWeekendBlock('hl-wfh-date');

  document.getElementById('hl-wfh-submit')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const empId  = S.myEmployee?.id;
    const wfhDate = document.getElementById('hl-wfh-date').value;
    if (!empId)   { window.showToast?.('No employee record found', 'error'); return; }
    if (!wfhDate) { window.showToast?.('Select a date', 'error'); return; }
    const dow = new Date(wfhDate + 'T00:00:00').getDay();
    if (dow === 0 || dow === 6) { window.showToast?.('WFH date must be a weekday (Mon–Fri)', 'error'); return; }
    btn.disabled = true;
    try {
      const swap = await submitFlexSwap({ employeeId: empId, waivedHolidayId: null, substituteDate: null, swapType: 'wfh', wfhDate });
      S.flexSwaps = [swap, ...S.flexSwaps];
      window.showToast?.('WFH request submitted', 'success');
      renderFlex(wrap, saveTabState);
    } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
  });
}

// ── MY BALANCE tab ────────────────────────────────────────────

export function renderBalances(wrap) {
  const balYear = S.year;

  if (!S.myEmployee) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:32px">
      <div class="empty-state-title">No employee record linked</div>
      <div class="empty-state-desc">Ask an admin to link your account to an employee record.</div>
    </div>`;
    return;
  }

  // Only real policy entitlements shown as balance cards
  const entitlementCodes = new Set(
    S.leaveTypes.filter(t => t.code !== 'flex_holiday' && (t.default_days ?? 0) > 0).map(t => t.code)
  );
  const myBals = S.balances.filter(b => b.employee_id === S.myEmployee.id && entitlementCodes.has(b.leave_type_code));

  // Synthetic fallback: show policy defaults when no DB rows exist yet
  const displayBals = myBals.length > 0 ? myBals : S.leaveTypes
    .filter(t => entitlementCodes.has(t.code))
    .map(t => ({
      leave_type_code: t.code,
      leave_type: { label: t.label },
      allocated_days: t.default_days,
      carried_over_days: 0,
      manual_adjustment_days: 0,
      used_days: 0,
    }));

  const yearSelector = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <label style="font-weight:600;">Year</label>
      <select class="form-input" id="bal-year" style="width:90px;">
        ${[balYear - 2, balYear - 1, balYear, balYear + 1, balYear + 2].map(y =>
          `<option value="${y}"${y === balYear ? ' selected' : ''}>${y}</option>`
        ).join('')}
      </select>
      ${myBals.length === 0 ? `<span style="font-size:12px;color:var(--text-muted);">Policy defaults — contact HR to initialize ${balYear}</span>` : ''}
    </div>`;

  wrap.innerHTML = `
    ${yearSelector}
    ${displayBals.length === 0
      ? `<div class="empty-state"><div class="empty-state-title">No balance data for ${balYear}</div></div>`
      : _balCards(displayBals)
    }
  `;

  document.getElementById('bal-year')?.addEventListener('change', async e => {
    S.year = parseInt(e.target.value, 10);
    try {
      S.balances = S.canApprove
        ? await getAllLeaveBalances(S.year)
        : await getLeaveBalances(S.myEmployee.id, S.year);
    } catch (err) { window.showToast?.(err.message, 'error'); }
    renderBalances(wrap);
  });
}
