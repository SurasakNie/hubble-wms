// js/pages/holidays-approvals.js — APPROVALS sub-tab + Team Balance + modals

import { S, _fmt, _balCards, STATUS_BADGE } from './holidays-state.js';
import { esc, attr } from '../format.js';
import { logAction } from '../api/auditLog.js';
import { empSelectHtml, wireEmpSelect } from '../components/empSelect.js';
import {
  approveLeaveRequest, hrApproveLeaveRequest, rejectLeaveRequest,
  overrideLeaveRequestStatus, updateLeaveRequest,
  approveFlexSwap, rejectFlexSwap, overrideFlexSwapStatus,
  getAllLeaveBalances, upsertLeaveBalance,
} from '../api/leaves.js';

// ── APPROVALS tab ─────────────────────────────────────────────

export function renderApprovals(wrap, { syncBadges, approvalRequests, approvalFlexSwaps, saveTabState }) {
  const subBtns = ['pending','schedule','history'];
  const pendingCount = approvalRequests().filter(r => r.status === 'pending' || r.status === 'manager_approved').length
                     + approvalFlexSwaps().filter(s => s.status === 'pending').length;
  const subLabels = {
    pending: `PENDING <span class="badge badge-pending" id="ap-pending-badge" style="margin-left:4px;${pendingCount > 0 ? '' : 'display:none;'}">${pendingCount}</span>`,
    history:  'HISTORY',
    schedule: 'SCHEDULE',
  };

  // Sub-tab bar + content area
  wrap.innerHTML = `
    <div class="tabs" id="hl-ap-tabs" style="margin-bottom:16px;">
      ${subBtns.map(k => `<button class="tab-btn${S.approvalSubTab === k ? ' active' : ''}" data-subtab="${k}">${subLabels[k]}</button>`).join('')}
    </div>
    <div id="hl-ap-body"></div>
  `;

  wrap.querySelectorAll('#hl-ap-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('#hl-ap-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.approvalSubTab = btn.dataset.subtab;
      saveTabState?.();
      _renderApprovalBody();
    });
  });

  function _renderApprovalBody() {
    const body = document.getElementById('hl-ap-body');
    if (!body) return;
    if      (S.approvalSubTab === 'pending')  _renderApprovalPending(body);
    else if (S.approvalSubTab === 'history')  _renderApprovalHistory(body);
    else if (S.approvalSubTab === 'schedule') _renderApprovalSchedule(body);
  }

  // ── PENDING ─────────────────────────────────────────────────
  function _renderApprovalPending(body) {
    const pending    = approvalRequests().filter(r => r.status === 'pending');
    const awaitingHr = approvalRequests().filter(r => r.status === 'manager_approved');
    const pendFlex   = approvalFlexSwaps().filter(s => s.status === 'pending');

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:32px;">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
            PENDING LEAVE REQUESTS ${pending.length > 0 ? `<span class="badge badge-pending">${pending.length}</span>` : ''}
          </div>
          ${pending.length === 0
            ? '<div class="empty-state"><div class="empty-state-title">No pending requests</div></div>'
            : `<div style="overflow-x:auto;">
                 <table class="data-table">
                   <thead><tr>
                     <th>Employee</th><th>Type</th><th>From</th><th>To</th>
                     <th>Duration</th><th>Submitted</th><th>~pool</th><th style="width:240px"></th>
                   </tr></thead>
                   <tbody>
                     ${pending.map(r => `<tr data-id="${attr(r.id)}">
                       <td>${esc(r.employee?.full_name || '—')}</td>
                       <td>${esc(r.leave_type?.label || r.leave_type_code)}</td>
                       <td>${_fmt(r.start_date)}</td>
                       <td>${_fmt(r.end_date)}</td>
                       <td>${r.duration_hours ? r.duration_hours + 'h' : r.granularity.replace('_',' ')}</td>
                       <td>${_fmt(r.created_at?.slice(0,10))}</td>
                       <td>${r.is_cross_type_deduction ? '<span class="badge badge-pending">Yes</span>' : '—'}</td>
                       <td class="table-actions">
                         ${S.admin ? `<button class="btn btn-sm btn-ghost hl-edit-req" data-id="${attr(r.id)}">Edit</button>` : ''}
                         <button class="btn btn-sm btn-primary hl-approve-req" data-id="${attr(r.id)}" data-tiers="${attr(String(r.leave_type?.approval_tiers ?? 1))}">Approve</button>
                         <button class="btn btn-sm btn-danger hl-reject-req" data-id="${attr(r.id)}">Reject</button>
                       </td>
                     </tr>`).join('')}
                   </tbody>
                 </table>
               </div>`
          }
        </div>
        ${awaitingHr.length > 0 ? `
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
            AWAITING HR APPROVAL <span class="badge badge-pending">${awaitingHr.length}</span>
            <span style="font-size:11px;font-weight:400;margin-left:8px;">Manager has approved — HR second-tier sign-off required</span>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead><tr>
                <th>Employee</th><th>Type</th><th>From</th><th>To</th>
                <th>Duration</th><th>Manager approved</th><th style="width:200px"></th>
              </tr></thead>
              <tbody>
                ${awaitingHr.map(r => `<tr data-id="${attr(r.id)}">
                  <td>${esc(r.employee?.full_name || '—')}</td>
                  <td>${esc(r.leave_type?.label || r.leave_type_code)}</td>
                  <td>${_fmt(r.start_date)}</td>
                  <td>${_fmt(r.end_date)}</td>
                  <td>${r.duration_hours ? r.duration_hours + 'h' : r.granularity.replace('_',' ')}</td>
                  <td>${_fmt(r.manager_approved_at?.slice(0,10))}</td>
                  <td class="table-actions">
                    <button class="btn btn-sm btn-primary hl-hr-approve-req" data-id="${attr(r.id)}">HR Approve</button>
                    <button class="btn btn-sm btn-danger hl-reject-req" data-id="${attr(r.id)}">Reject</button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
            PENDING FLEX SWAPS ${pendFlex.length > 0 ? `<span class="badge badge-pending">${pendFlex.length}</span>` : ''}
          </div>
          ${pendFlex.length === 0
            ? '<div class="empty-state"><div class="empty-state-title">No pending flex swaps</div></div>'
            : `<div style="overflow-x:auto;">
                 <table class="data-table">
                   <thead><tr>
                     <th>Employee</th><th>Waived Holiday</th><th>Substitute Day</th>
                     <th>Valid Until</th><th style="width:160px"></th>
                   </tr></thead>
                   <tbody>
                     ${pendFlex.map(s => `<tr data-id="${attr(s.id)}">
                       <td>${esc(s.employee?.full_name || '—')}</td>
                       <td>${s.waived_holiday ? `${_fmt(s.waived_holiday.date)} — ${esc(s.waived_holiday.name)}` : '—'}</td>
                       <td>${_fmt(s.substitute_date)}</td>
                       <td>${_fmt(s.valid_until)}</td>
                       <td class="table-actions">
                         <button class="btn btn-sm btn-primary hl-approve-flex" data-id="${attr(s.id)}">Approve</button>
                         <button class="btn btn-sm btn-danger hl-reject-flex" data-id="${attr(s.id)}">Reject</button>
                       </td>
                     </tr>`).join('')}
                   </tbody>
                 </table>
               </div>`
          }
        </div>
      </div>
    `;

    body.querySelectorAll('.hl-edit-req').forEach(btn => {
      const req = S.requests.find(r => r.id === btn.dataset.id);
      if (req) btn.addEventListener('click', () => _openLeaveEditModal(req, () => { _renderApprovalPending(body); syncBadges?.(); }));
    });

    body.querySelectorAll('.hl-approve-req').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        const tiers = parseInt(btn.dataset.tiers ?? '1', 10) || 1;
        try {
          const updated = await approveLeaveRequest(btn.dataset.id, S.myEmployee?.id, null, tiers);
          S.requests = S.requests.map(r => r.id === updated.id ? updated : r);
          const newStatus = tiers >= 2 ? 'manager_approved' : 'approved';
          window.showToast?.(tiers >= 2 ? 'Request manager-approved — awaiting HR sign-off.' : 'Request approved — employee will be notified.', 'success');
          logAction('approve_leave_request', 'leave_request', btn.dataset.id, updated.employee?.full_name || null, { status: { old: 'pending', new: newStatus } });
          _renderApprovalPending(body);
          syncBadges?.();
        } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
      });
    });

    body.querySelectorAll('.hl-hr-approve-req').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          const updated = await hrApproveLeaveRequest(btn.dataset.id, S.myEmployee?.id, null);
          S.requests = S.requests.map(r => r.id === updated.id ? updated : r);
          window.showToast?.('HR approval granted — employee will be notified.', 'success');
          logAction('hr_approve_leave_request', 'leave_request', btn.dataset.id, updated.employee?.full_name || null, { status: { old: 'manager_approved', new: 'approved' } });
          _renderApprovalPending(body);
          syncBadges?.();
        } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
      });
    });

    body.querySelectorAll('.hl-reject-req').forEach(btn => {
      btn.addEventListener('click', () => {
        const req = S.requests.find(r => r.id === btn.dataset.id);
        const contextLine = req
          ? [req.employee?.full_name, req.leave_type?.label || req.leave_type_code, req.start_date].filter(Boolean).map(esc).join(' · ')
          : '';
        _openHlRejectModal({
          contextLine,
          required: true,
          onConfirm: async reason => {
            const updated = await rejectLeaveRequest(btn.dataset.id, reason);
            S.requests = S.requests.map(r => r.id === updated.id ? updated : r);
            window.showToast?.('Request rejected — employee will be notified.', 'success');
            logAction('reject_leave_request', 'leave_request', btn.dataset.id, updated.employee?.full_name || null, { status: { old: 'pending', new: 'rejected' }, reason });
            _renderApprovalPending(body);
            syncBadges?.();
          },
        });
      });
    });

    body.querySelectorAll('.hl-approve-flex').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          const updated = await approveFlexSwap(btn.dataset.id, S.myEmployee?.id, null);
          S.flexSwaps = S.flexSwaps.map(s => s.id === updated.id ? updated : s);
          window.showToast?.('Flex swap approved — employee will be notified.', 'success');
          logAction('approve_flex_swap', 'flex_swap', btn.dataset.id, updated.employee?.full_name || null, { status: { old: 'pending', new: 'approved' } });
          _renderApprovalPending(body);
          syncBadges?.();
        } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
      });
    });

    body.querySelectorAll('.hl-reject-flex').forEach(btn => {
      btn.addEventListener('click', () => {
        const swap = S.flexSwaps.find(s => s.id === btn.dataset.id);
        const contextLine = swap
          ? [swap.employee?.full_name, swap.waived_holiday?.name, swap.substitute_date].filter(Boolean).map(esc).join(' · ')
          : '';
        _openHlRejectModal({
          contextLine,
          required: false,
          onConfirm: async reason => {
            const updated = await rejectFlexSwap(btn.dataset.id, reason);
            S.flexSwaps = S.flexSwaps.map(s => s.id === updated.id ? updated : s);
            window.showToast?.('Flex swap rejected — employee will be notified.', 'success');
            logAction('reject_flex_swap', 'flex_swap', btn.dataset.id, updated.employee?.full_name || null, { status: { old: 'pending', new: 'rejected' }, reason });
            _renderApprovalPending(body);
            syncBadges?.();
          },
        });
      });
    });
  }

  // ── HISTORY ──────────────────────────────────────────────────
  function _renderApprovalHistory(body) {
    const settled = approvalRequests()
      .filter(r => (!S.historyFrom || r.start_date >= S.historyFrom)
                && (!S.historyTo   || r.start_date <= S.historyTo))
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
    const settledFlex = approvalFlexSwaps()
      .filter(s => (!S.historyFrom || s.substitute_date >= S.historyFrom)
                && (!S.historyTo   || s.substitute_date <= S.historyTo))
      .sort((a, b) => b.substitute_date.localeCompare(a.substitute_date));

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:24px;">
        <div class="filter-bar" style="flex-wrap:wrap;gap:8px;align-items:center;">
          <label style="font-size:12px;color:var(--text-muted);">From</label>
          <input class="form-input" type="date" id="hl-hist-from" value="${attr(S.historyFrom)}" style="width:160px;" placeholder="YYYY-MM-DD (optional)">
          <label style="font-size:12px;color:var(--text-muted);">To</label>
          <input class="form-input" type="date" id="hl-hist-to"   value="${attr(S.historyTo)}"   style="width:160px;" placeholder="YYYY-MM-DD (optional)">
          <button class="btn btn-sm btn-primary" id="hl-hist-apply">Apply</button>
        </div>

        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
            LEAVE REQUESTS <span class="badge">${settled.length}</span>
          </div>
          ${settled.length === 0
            ? '<div class="empty-state"><div class="empty-state-title">No requests in this range</div></div>'
            : `<div style="overflow-x:auto;">
                 <table class="data-table">
                   <thead><tr>
                     <th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Status</th><th>Notes</th><th style="width:160px"></th>
                   </tr></thead>
                   <tbody>
                     ${settled.map(r => `<tr>
                       <td>${esc(r.employee?.full_name || '—')}</td>
                       <td>${esc(r.leave_type?.label || r.leave_type_code)}</td>
                       <td>${_fmt(r.start_date)}</td>
                       <td>${_fmt(r.end_date)}</td>
                       <td><span class="${STATUS_BADGE[r.status] || 'badge'}">${r.status}</span></td>
                       <td style="font-size:12px;color:var(--text-muted);">${esc(r.rejection_reason || r.manager_notes || '—')}</td>
                       <td class="table-actions">
                         ${S.admin ? `<button class="btn btn-sm btn-ghost hl-edit-hist-req" data-id="${attr(r.id)}">Edit</button>` : ''}
                         <button class="btn btn-sm btn-ghost hl-override-req" data-id="${attr(r.id)}">Override</button>
                       </td>
                     </tr>`).join('')}
                   </tbody>
                 </table>
               </div>`
          }
        </div>

        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
            FLEX SWAPS <span class="badge">${settledFlex.length}</span>
          </div>
          ${settledFlex.length === 0
            ? '<div class="empty-state"><div class="empty-state-title">No settled flex swaps in this range</div></div>'
            : `<div style="overflow-x:auto;">
                 <table class="data-table">
                   <thead><tr>
                     <th>Employee</th><th>Waived Holiday</th><th>Substitute Day</th><th>Status</th><th style="width:100px"></th>
                   </tr></thead>
                   <tbody>
                     ${settledFlex.map(s => `<tr>
                       <td>${esc(s.employee?.full_name || '—')}</td>
                       <td>${s.waived_holiday ? `${_fmt(s.waived_holiday.date)} — ${esc(s.waived_holiday.name)}` : '—'}</td>
                       <td>${_fmt(s.substitute_date)}</td>
                       <td><span class="${STATUS_BADGE[s.status] || 'badge'}">${s.status}</span></td>
                       <td class="table-actions">
                         <button class="btn btn-sm btn-ghost hl-override-flex" data-id="${attr(s.id)}">Override</button>
                       </td>
                     </tr>`).join('')}
                   </tbody>
                 </table>
               </div>`
          }
        </div>
      </div>
    `;

    document.getElementById('hl-hist-apply')?.addEventListener('click', () => {
      S.historyFrom = document.getElementById('hl-hist-from').value;
      S.historyTo   = document.getElementById('hl-hist-to').value;
      _renderApprovalHistory(body);
    });

    body.querySelectorAll('.hl-override-req').forEach(btn => {
      btn.addEventListener('click', () => _openOverrideModal('leave', btn.dataset.id, () => {
        _renderApprovalHistory(body);
        syncBadges?.();
      }));
    });
    body.querySelectorAll('.hl-override-flex').forEach(btn => {
      btn.addEventListener('click', () => _openOverrideModal('flex', btn.dataset.id, () => {
        _renderApprovalHistory(body);
        syncBadges?.();
      }));
    });
    body.querySelectorAll('.hl-edit-hist-req').forEach(btn => {
      const req = S.requests.find(r => r.id === btn.dataset.id);
      if (req) btn.addEventListener('click', () => _openLeaveEditModal(req, () => _renderApprovalHistory(body)));
    });
  }

  // ── SCHEDULE ─────────────────────────────────────────────────
  function _renderApprovalSchedule(body) {
    const leaves = approvalRequests()
      .filter(r => r.status === 'approved' && r.start_date <= S.scheduleTo && r.end_date >= S.scheduleFrom)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));

    const flexLeaves = approvalFlexSwaps()
      .filter(s => s.status === 'approved' && s.substitute_date >= S.scheduleFrom && s.substitute_date <= S.scheduleTo)
      .sort((a, b) => a.substitute_date.localeCompare(b.substitute_date));

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:24px;">
        <div class="filter-bar" style="flex-wrap:wrap;gap:8px;align-items:center;">
          <label style="font-size:12px;color:var(--text-muted);">From</label>
          <input class="form-input" type="date" id="hl-sch-from" value="${attr(S.scheduleFrom)}" style="width:140px;">
          <label style="font-size:12px;color:var(--text-muted);">To</label>
          <input class="form-input" type="date" id="hl-sch-to"   value="${attr(S.scheduleTo)}"   style="width:140px;">
          <button class="btn btn-sm btn-primary" id="hl-sch-apply">Apply</button>
          <span style="font-size:12px;color:var(--text-muted);margin-left:8px;">Approved leaves only</span>
        </div>

        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
            LEAVE SCHEDULE
            ${leaves.length > 0 ? `<span class="badge">${leaves.length}</span>` : ''}
          </div>
          ${leaves.length === 0
            ? '<div class="empty-state"><div class="empty-state-title">No approved leave in this period</div></div>'
            : `<div style="overflow-x:auto;">
                 <table class="data-table">
                   <thead><tr>
                     <th>Employee</th><th>Leave Type</th><th>From</th><th>To</th><th>Duration</th>
                   </tr></thead>
                   <tbody>
                     ${leaves.map(r => `<tr>
                       <td style="font-weight:500">${esc(r.employee?.full_name || '—')}</td>
                       <td>${esc(r.leave_type?.label || r.leave_type_code)}</td>
                       <td>${_fmt(r.start_date)}</td>
                       <td>${_fmt(r.end_date)}</td>
                       <td>${r.duration_hours ? r.duration_hours + 'h' : r.granularity.replace('_',' ')}</td>
                     </tr>`).join('')}
                   </tbody>
                 </table>
               </div>`
          }
        </div>

        ${flexLeaves.length > 0 ? `
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
            FLEX DAY-OFF SCHEDULE <span class="badge">${flexLeaves.length}</span>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead><tr>
                <th>Employee</th><th>Substitute Day Off</th><th>Waived Holiday</th>
              </tr></thead>
              <tbody>
                ${flexLeaves.map(s => `<tr>
                  <td style="font-weight:500">${esc(s.employee?.full_name || '—')}</td>
                  <td>${_fmt(s.substitute_date)}</td>
                  <td>${s.waived_holiday ? esc(s.waived_holiday.name) : '—'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}
      </div>
    `;

    document.getElementById('hl-sch-apply')?.addEventListener('click', () => {
      S.scheduleFrom = document.getElementById('hl-sch-from').value || S.scheduleFrom;
      S.scheduleTo   = document.getElementById('hl-sch-to').value   || S.scheduleTo;
      _renderApprovalSchedule(body);
    });
  }

  _renderApprovalBody();
}

// ── TEAM BALANCE tab ──────────────────────────────────────────

export function renderTeamBalance(wrap) {
  const balYear    = S.year;
  const activeEmps = S.employees.filter(e => e.status === 'active' || e.status === 'probation');
  const selEmp     = activeEmps.find(e => e.id === S.teamBalEmpId);
  const entitlementCodes = new Set(
    S.leaveTypes.filter(t => t.code !== 'flex_holiday' && (t.default_days ?? 0) > 0).map(t => t.code)
  );
  const selBals = S.teamBalEmpId
    ? S.balances.filter(b => b.employee_id === S.teamBalEmpId && entitlementCodes.has(b.leave_type_code))
    : [];

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <label style="font-weight:600;">Year</label>
      <select class="form-input" id="tbal-year" style="width:90px;">
        ${[balYear - 1, balYear, balYear + 1].map(y =>
          `<option value="${y}"${y === balYear ? ' selected' : ''}>${y}</option>`
        ).join('')}
      </select>
      ${S.admin ? `
        <button class="btn btn-sm btn-ghost" id="tbal-init">Initialize Year</button>
        <span style="font-size:12px;color:var(--text-muted);">
          Seeds policy entitlements for all employees (skips existing)
        </span>` : ''}
    </div>

    <div style="max-width:360px;margin-bottom:24px;">
      <label class="form-label">Employee
        ${empSelectHtml('hl-tb', S.employees, { selectedId: S.teamBalEmpId })}
      </label>
    </div>

    ${!S.teamBalEmpId
      ? `<div class="empty-state">
           <div class="empty-state-title">Select an employee above to view their leave balance</div>
         </div>`
      : `<div style="font-size:15px;font-weight:600;margin-bottom:16px;">
           ${esc(selEmp?.employee_id || '')} — ${esc(selEmp?.full_name || '')}
         </div>
         ${selBals.length === 0
           ? `<div class="empty-state">
                <div class="empty-state-title">No balance data for ${balYear}</div>
                ${S.admin ? `<div class="empty-state-desc">Use "Initialize Year" to seed entitlements.</div>` : ''}
              </div>`
           : _balCards(selBals)
         }`
    }
  `;

  document.getElementById('tbal-year')?.addEventListener('change', async e => {
    S.year = parseInt(e.target.value, 10);
    try { S.balances = await getAllLeaveBalances(S.year); } catch (err) { window.showToast?.(err.message, 'error'); }
    renderTeamBalance(wrap);
  });

  wireEmpSelect('hl-tb', S.employees, emp => {
    S.teamBalEmpId = emp?.id ?? null;
    renderTeamBalance(wrap);
  });

  if (S.admin) {
    document.getElementById('tbal-init')?.addEventListener('click', async () => {
      const btn = document.getElementById('tbal-init');
      btn.disabled = true; btn.textContent = 'Initializing…';
      let count = 0;
      const active = S.employees.filter(e => e.status === 'active' || e.status === 'probation');
      const existing = new Set(S.balances.map(b => `${b.employee_id}:${b.leave_type_code}`));
      const tasks = [];
      active.forEach(emp => {
        S.leaveTypes.forEach(lt => {
          if (!existing.has(`${emp.id}:${lt.code}`)) {
            tasks.push(
              upsertLeaveBalance({ employeeId: emp.id, leaveTypeCode: lt.code, year: S.year, allocatedDays: lt.default_days ?? 0 })
                .then(() => { count++; }).catch(() => {})
            );
          }
        });
      });
      await Promise.all(tasks);
      S.balances = await getAllLeaveBalances(S.year);
      window.showToast?.(`Initialized ${count} balance row${count !== 1 ? 's' : ''} for ${S.year}`, 'success');
      btn.disabled = false; btn.textContent = 'Initialize Year';
      renderTeamBalance(wrap);
    });
  }
}

// ── Override modal ────────────────────────────────────────────

function _openOverrideModal(type, id, onDone) {
  const existing = document.getElementById('hl-override-modal');
  if (existing) existing.remove();

  const STATUS_OPTIONS = ['pending', 'approved', 'rejected', 'cancelled'];
  const STATUS_LABELS  = { pending: 'Pending (reset)', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };

  const modal = document.createElement('div');
  modal.id        = 'hl-override-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header">
        <span class="modal-title">Override Status</span>
        <button class="modal-close" id="hl-or-close">&times;</button>
      </div>
      <div class="modal-body" style="gap:14px;">
        <label class="form-label">New status
          <select class="form-input" id="hl-or-status">
            ${STATUS_OPTIONS.map(s => `<option value="${s}">${STATUS_LABELS[s]}</option>`).join('')}
          </select>
        </label>
        <label class="form-label">Notes / reason <span style="color:var(--text-muted);font-weight:400;">(optional)</span>
          <input class="form-input" type="text" id="hl-or-notes" placeholder="Reason for override…">
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn" id="hl-or-cancel">Cancel</button>
        <button class="btn btn-primary" id="hl-or-save">Save override</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  document.getElementById('hl-or-close')?.addEventListener('click', close);
  document.getElementById('hl-or-cancel')?.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  document.getElementById('hl-or-save')?.addEventListener('click', async () => {
    const newStatus = document.getElementById('hl-or-status').value;
    const notes     = document.getElementById('hl-or-notes').value.trim() || null;
    const saveBtn   = document.getElementById('hl-or-save');
    saveBtn.disabled = true;
    try {
      if (type === 'leave') {
        const updated = await overrideLeaveRequestStatus(id, newStatus, S.myEmployee?.id, notes);
        S.requests = S.requests.map(r => r.id === id ? updated : r);
      } else {
        const updated = await overrideFlexSwapStatus(id, newStatus, S.myEmployee?.id, notes);
        S.flexSwaps = S.flexSwaps.map(s => s.id === id ? updated : s);
      }
      window.showToast?.(`Status changed to ${newStatus}`, 'success');
      close();
      onDone?.();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      saveBtn.disabled = false;
    }
  });
}

// ── Reject modal ──────────────────────────────────────────────

function _openHlRejectModal({ contextLine, required, onConfirm }) {
  const existing = document.getElementById('hl-rej-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'hl-rej-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">Reject Request</div>
        <button class="modal-close" id="hl-rej-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        ${contextLine ? `<p style="margin:0 0 12px;font-size:13px;color:var(--text-secondary);">${contextLine}</p>` : ''}
        <label class="form-label">Reason${required
          ? ' <span class="required">*</span>'
          : ' <span style="color:var(--text-secondary);font-weight:400">(optional)</span>'}
          <textarea class="form-input" id="hl-rej-reason" rows="3" placeholder="Enter rejection reason…" style="resize:vertical"></textarea>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="hl-rej-cancel">Cancel</button>
        <button class="btn btn-danger" id="hl-rej-apply">Reject</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  document.getElementById('hl-rej-close').addEventListener('click', close);
  document.getElementById('hl-rej-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.getElementById('hl-rej-apply').addEventListener('click', async () => {
    const applyBtn = document.getElementById('hl-rej-apply');
    const reason = document.getElementById('hl-rej-reason').value.trim();
    if (required && !reason) { window.showToast?.('Reason is required', 'error'); return; }
    applyBtn.disabled = true;
    try { await onConfirm(reason); close(); }
    catch (err) { window.showToast?.(err.message, 'error'); applyBtn.disabled = false; }
  });
}

// ── Leave edit modal (admin) ──────────────────────────────────

function _openLeaveEditModal(req, onSave) {
  document.getElementById('hl-edit-modal')?.remove();

  const typeOpts = S.leaveTypes.map(t =>
    `<option value="${attr(t.code)}" ${t.code === req.leave_type_code ? 'selected' : ''}>${esc(t.label)}</option>`
  ).join('');

  const modal = document.createElement('div');
  modal.id = 'hl-edit-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal modal-lg" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">Edit Leave Request — ${esc(req.employee?.full_name || '')}</div>
        <button class="modal-close" id="hle-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        <label class="form-label" style="display:block;margin-bottom:14px;">Leave Type <span class="required">*</span>
          <select class="form-input" id="hle-type">${typeOpts}</select>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <label class="form-label">Start Date <span class="required">*</span>
            <input class="form-input" type="date" id="hle-start" value="${attr(req.start_date)}" style="color-scheme:dark">
          </label>
          <label class="form-label">End Date <span class="required">*</span>
            <input class="form-input" type="date" id="hle-end" value="${attr(req.end_date)}" style="color-scheme:dark">
          </label>
        </div>
        <label class="form-label" style="display:block;">Notes
          <textarea class="form-input" id="hle-notes" rows="3" style="resize:vertical;">${esc(req.notes || req.manager_notes || '')}</textarea>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="hle-cancel">Cancel</button>
        ${S.admin && req.status === 'pending' ? `<button class="btn btn-primary" id="hle-save-approve">Save &amp; Approve</button>` : ''}
        <button class="btn btn-ghost" id="hle-save">Save Changes</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  document.getElementById('hle-close').addEventListener('click', close);
  document.getElementById('hle-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  async function _doSaveLeave() {
    const updated = await updateLeaveRequest(req.id, {
      leaveTypeCode: document.getElementById('hle-type').value,
      startDate:     document.getElementById('hle-start').value,
      endDate:       document.getElementById('hle-end').value,
      notes:         document.getElementById('hle-notes').value.trim() || null,
    });
    S.requests = S.requests.map(r => r.id === updated.id ? updated : r);
    return updated;
  }

  document.getElementById('hle-save').addEventListener('click', async () => {
    const saveBtn = document.getElementById('hle-save');
    saveBtn.disabled = true;
    try {
      await _doSaveLeave();
      window.showToast?.('Leave request updated.', 'success');
      close();
      onSave?.();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      saveBtn.disabled = false;
    }
  });

  document.getElementById('hle-save-approve')?.addEventListener('click', async () => {
    const approveBtn = document.getElementById('hle-save-approve');
    approveBtn.disabled = true;
    const tiers = req.leave_type?.approval_tiers ?? 1;
    try {
      await _doSaveLeave();
      await approveLeaveRequest(req.id, S.myEmployee?.id ?? null, null, tiers);
      window.showToast?.(tiers >= 2 ? 'Saved & manager-approved — awaiting HR.' : 'Saved & Approved.', 'success');
      close();
      onSave?.();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      approveBtn.disabled = false;
    }
  });
}
