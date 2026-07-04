// js/pages/holidays-team.js — TEAM LEAVE and TEAM FLEX sub-tabs

import { S, _fmt, _isWeekend, _nextWeekday, _wireWeekendBlock, STATUS_BADGE } from './holidays-state.js';
import { todayISO, esc, attr } from '../format.js';
import { empSelectHtml, wireEmpSelect } from '../components/empSelect.js';
import {
  submitLeaveRequest,
  submitFlexSwap,
} from '../api/leaves.js';

// ── TEAM LEAVE sub-tab ────────────────────────────────────────

export function renderTeamLeave(wrap) {
  const today      = todayISO();
  const activeEmps = S.employees.filter(e => e.status === 'active' || e.status === 'probation');
  const selEmp     = activeEmps.find(e => e.id === S.teamLeaveEmpId);
  const empBals    = S.teamLeaveEmpId ? S.balances.filter(b => b.employee_id === S.teamLeaveEmpId) : [];
  const empReqs    = S.teamLeaveEmpId ? S.requests.filter(r => r.employee_id === S.teamLeaveEmpId) : [];

  wrap.innerHTML = `
    <div style="max-width:360px;margin-bottom:24px;">
      <label class="form-label">Employee
        ${empSelectHtml('hl-tl', S.employees, { selectedId: S.teamLeaveEmpId })}
      </label>
    </div>

    ${!S.teamLeaveEmpId ? (() => {
      const all = [...S.requests].sort((a, b) => b.start_date.localeCompare(a.start_date));
      return all.length === 0
        ? `<div class="empty-state"><div class="empty-state-title">No leave requests found</div></div>`
        : `<div style="overflow-x:auto;">
             <table class="data-table">
               <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Status</th><th>Submitted</th></tr></thead>
               <tbody>
                 ${all.map(r => `<tr>
                   <td>${esc(r.employee?.full_name || '—')}</td>
                   <td>${esc(r.leave_type?.label || r.leave_type_code)}</td>
                   <td>${_fmt(r.start_date)}</td>
                   <td>${_fmt(r.end_date)}</td>
                   <td><span class="${STATUS_BADGE[r.status] || 'badge'}">${r.status}</span></td>
                   <td>${_fmt(r.created_at?.slice(0,10))}</td>
                 </tr>`).join('')}
               </tbody>
             </table>
           </div>`;
    })() : `
      <div style="max-width:540px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
        <div class="form-label" style="font-size:15px;font-weight:600;">Submit Leave Request — ${esc(selEmp?.full_name || '')}</div>

        <label class="form-label">Leave Type
          <select class="form-input" id="hl-tl-type">
            ${S.leaveTypes.filter(t => t.code !== 'flex_holiday').map(t => `<option value="${attr(t.code)}">${esc(t.label)}</option>`).join('')}
          </select>
        </label>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label class="form-label">From
            <input class="form-input" type="date" id="hl-tl-start" value="${_nextWeekday(today)}" min="${today}">
          </label>
          <label class="form-label">To
            <input class="form-input" type="date" id="hl-tl-end" value="${_nextWeekday(today)}" min="${today}">
          </label>
        </div>

        <label class="form-label">Granularity
          <select class="form-input" id="hl-tl-gran">
            <option value="full_day">Full day</option>
            <option value="half_day">Half day</option>
          </select>
        </label>

        <label class="form-label">Notes
          <textarea class="form-input" id="hl-tl-notes" rows="3" placeholder="Optional reason or details…" style="resize:vertical;"></textarea>
        </label>

        <div id="hl-tl-doc-row" style="display:none;">
          <label class="form-label">Supporting document path / URL
            <input class="form-input" type="text" id="hl-tl-doc" placeholder="e.g. storage/docs/med-cert.pdf">
          </label>
        </div>

        <div style="display:flex;gap:10px;">
          <button class="btn btn-primary" id="hl-tl-submit">SUBMIT REQUEST</button>
          <button class="btn btn-ghost" id="hl-tl-reset">RESET</button>
        </div>
      </div>

      ${empBals.length > 0 ? `
      <div style="margin-bottom:24px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">LEAVE BALANCES — ${S.year}</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          ${empBals.map(b => {
            const available = b.allocated_days + b.carried_over_days + b.manual_adjustment_days - b.used_days;
            return `<div style="background:var(--surface-2);border:1px solid var(--border-color);
              border-radius:8px;padding:14px 18px;min-width:160px;flex:1;">
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${esc(b.leave_type?.label || b.leave_type_code)}</div>
              <div style="font-size:24px;font-weight:700;color:var(--text-primary);">${available.toFixed(1)}</div>
              <div style="font-size:11px;color:var(--text-muted);">of ${b.allocated_days} days allocated</div>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
          LEAVE HISTORY — ${esc(selEmp?.full_name || '')}
        </div>
        ${empReqs.length === 0
          ? `<div class="empty-state"><div class="empty-state-title">No leave requests</div></div>`
          : `<div style="overflow-x:auto;">
               <table class="data-table">
                 <thead><tr>
                   <th>Type</th><th>From</th><th>To</th><th>Duration</th><th>Status</th><th>Submitted</th>
                 </tr></thead>
                 <tbody>
                   ${empReqs.map(r => `<tr>
                     <td>${esc(r.leave_type?.label || r.leave_type_code)}</td>
                     <td>${_fmt(r.start_date)}</td>
                     <td>${_fmt(r.end_date)}</td>
                     <td>${r.duration_hours ? r.duration_hours + 'h' : r.granularity.replace('_',' ')}</td>
                     <td><span class="${STATUS_BADGE[r.status] || 'badge'}">${r.status}</span></td>
                     <td>${_fmt(r.created_at?.slice(0,10))}</td>
                   </tr>`).join('')}
                 </tbody>
               </table>
             </div>`
        }
      </div>
    `}
  `;

  wireEmpSelect('hl-tl', S.employees, emp => {
    S.teamLeaveEmpId = emp?.id ?? null;
    renderTeamLeave(wrap);
  });

  if (S.teamLeaveEmpId) {
    const typeSel = document.getElementById('hl-tl-type');
    const docRow  = document.getElementById('hl-tl-doc-row');
    typeSel?.addEventListener('change', () => {
      const t = S.leaveTypes.find(x => x.code === typeSel.value);
      docRow.style.display = t?.requires_document ? '' : 'none';
    });

    _wireWeekendBlock('hl-tl-start');
    _wireWeekendBlock('hl-tl-end');

    document.getElementById('hl-tl-reset')?.addEventListener('click', () => renderTeamLeave(wrap));

    document.getElementById('hl-tl-submit')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const empId     = S.teamLeaveEmpId;
      const typeCode  = document.getElementById('hl-tl-type').value;
      const startDate = document.getElementById('hl-tl-start').value;
      const endDate   = document.getElementById('hl-tl-end').value;
      const gran      = document.getElementById('hl-tl-gran').value;
      const notes     = document.getElementById('hl-tl-notes').value.trim();
      const docPath   = document.getElementById('hl-tl-doc')?.value.trim() || null;

      if (!startDate || !endDate) { window.showToast?.('Start and end dates are required', 'error'); return; }
      if (startDate < todayISO())  { window.showToast?.('Start date cannot be in the past', 'error'); return; }
      if (endDate < startDate)    { window.showToast?.('End date must be on or after start date', 'error'); return; }
      if (_isWeekend(startDate) || _isWeekend(endDate)) { window.showToast?.('Leave cannot start or end on a weekend', 'error'); return; }

      let isCross = false, crossType;
      if (typeCode === 'annual_leave' || typeCode === 'personal_leave') {
        const empBal = S.balances.find(b => b.leave_type_code === typeCode && b.employee_id === empId);
        if (empBal) {
          const avail = empBal.allocated_days + empBal.carried_over_days + empBal.manual_adjustment_days - empBal.used_days;
          if (avail <= 0) {
            const partner    = typeCode === 'annual_leave' ? 'personal_leave' : 'annual_leave';
            const partnerBal = S.balances.find(b => b.leave_type_code === partner && b.employee_id === empId);
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
          employeeId: empId, leaveTypeCode: typeCode,
          startDate, endDate, startTime: null, endTime: null,
          granularity: gran, notes, documentPath: docPath,
          isCrossTypeDeduction: isCross, deductedFromType: crossType,
        });
        S.requests = [req, ...S.requests];
        window.showToast?.('Leave request submitted', 'success');
        if (isCross) window.showToast?.('Cross-pool deduction flagged for HR review', 'warning');
        renderTeamLeave(wrap);
      } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
    });
  }
}

// ── TEAM FLEX sub-tab ─────────────────────────────────────────

export function renderTeamFlex(wrap) {
  const today      = todayISO();
  const activeEmps = S.employees.filter(e => e.status === 'active' || e.status === 'probation');
  const selEmp     = activeEmps.find(e => e.id === S.teamFlexEmpId);
  const empSwaps   = S.teamFlexEmpId ? S.flexSwaps.filter(s => s.employee_id === S.teamFlexEmpId) : [];

  wrap.innerHTML = `
    <div style="max-width:360px;margin-bottom:24px;">
      <label class="form-label">Employee
        ${empSelectHtml('hl-tf', S.employees, { selectedId: S.teamFlexEmpId })}
      </label>
    </div>

    ${!S.teamFlexEmpId ? (() => {
      const all = [...S.flexSwaps].sort((a, b) => (b.substitute_date||'').localeCompare(a.substitute_date||''));
      return all.length === 0
        ? `<div class="empty-state"><div class="empty-state-title">No flex swap requests found</div></div>`
        : `<div style="overflow-x:auto;">
             <table class="data-table">
               <thead><tr><th>Employee</th><th>Waived Holiday</th><th>Substitute Day</th><th>Type</th><th>Status</th><th>Submitted</th></tr></thead>
               <tbody>
                 ${all.map(s => `<tr>
                   <td>${esc(s.employee?.full_name || '—')}</td>
                   <td>${s.waived_holiday ? `${_fmt(s.waived_holiday.date)} — ${esc(s.waived_holiday.name)}` : '—'}</td>
                   <td>${_fmt(s.substitute_date)}</td>
                   <td>${esc(s.swap_type || '—')}</td>
                   <td><span class="${STATUS_BADGE[s.status] || 'badge'}">${s.status}</span></td>
                   <td>${_fmt(s.created_at?.slice(0,10))}</td>
                 </tr>`).join('')}
               </tbody>
             </table>
           </div>`;
    })() : `
      <div style="max-width:540px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
        <div class="form-label" style="font-size:15px;font-weight:600;">Submit Flex Holiday Swap — ${esc(selEmp?.full_name || '')}</div>

        <label class="form-label">Swap type
          <select class="form-input" id="hl-tf-type">
            <option value="move">Move Holiday (take a substitute day off)</option>
            <option value="wfh">Work from Home (work on the holiday itself)</option>
          </select>
        </label>

        <label class="form-label">Holiday to waive
          <select class="form-input" id="hl-tf-holiday">
            <option value="">Select year: use ← → on Holidays tab to load ${S.year}</option>
            ${S.holidays.map(h => `<option value="${attr(h.id)}">${_fmt(h.date)} — ${esc(h.name)}</option>`).join('')}
          </select>
        </label>

        <div id="hl-tf-sub-row">
          <label class="form-label">Substitute date (working day off instead)
            <input class="form-input" type="date" id="hl-tf-sub" min="${today}">
          </label>
        </div>

        <div id="hl-tf-window" style="display:none;font-size:12px;color:var(--text-muted);padding:8px 12px;
          background:var(--surface-2);border-radius:6px;border:1px solid var(--border-color);">
          Valid window: <span id="hl-tf-window-text">—</span>
        </div>

        <button class="btn btn-primary" id="hl-tf-submit" style="align-self:flex-start;">SUBMIT SWAP</button>
      </div>

      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
          SWAP HISTORY — ${esc(selEmp?.full_name || '')}
        </div>
        ${empSwaps.length === 0
          ? `<div class="empty-state"><div class="empty-state-title">No flex swaps</div></div>`
          : `<div style="overflow-x:auto;">
               <table class="data-table">
                 <thead><tr>
                   <th>Type</th><th>Waived Holiday</th><th>Substitute Day</th><th>Valid Until</th><th>Status</th>
                 </tr></thead>
                 <tbody>
                   ${empSwaps.map(s => `<tr>
                     <td><span class="badge">${s.swap_type === 'wfh' ? 'WFH' : 'Move'}</span></td>
                     <td>${s.waived_holiday ? `${_fmt(s.waived_holiday.date)} — ${esc(s.waived_holiday.name)}` : '—'}</td>
                     <td>${s.substitute_date ? _fmt(s.substitute_date) : '—'}</td>
                     <td>${s.valid_until ? _fmt(s.valid_until) : '—'}</td>
                     <td><span class="${STATUS_BADGE[s.status] || 'badge'}">${s.status}</span></td>
                   </tr>`).join('')}
                 </tbody>
               </table>
             </div>`
        }
      </div>
    `}
  `;

  wireEmpSelect('hl-tf', S.employees, emp => {
    S.teamFlexEmpId = emp?.id ?? null;
    renderTeamFlex(wrap);
  });

  if (S.teamFlexEmpId) {
    document.getElementById('hl-tf-type')?.addEventListener('change', e => {
      const subRow = document.getElementById('hl-tf-sub-row');
      const win    = document.getElementById('hl-tf-window');
      if (e.target.value === 'wfh') {
        subRow.style.display = 'none';
        win.style.display = 'none';
      } else {
        subRow.style.display = '';
      }
    });

    document.getElementById('hl-tf-holiday')?.addEventListener('change', e => {
      const swapType = document.getElementById('hl-tf-type')?.value;
      if (swapType === 'wfh') return;
      const h   = S.holidays.find(x => x.id === e.target.value);
      const win = document.getElementById('hl-tf-window');
      const txt = document.getElementById('hl-tf-window-text');
      if (!h) { win.style.display = 'none'; return; }
      const d = new Date(h.date + 'T00:00:00');
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      let from, until;
      if      (m === 12) { from = `1 Dec ${y}`;     until = `31 Jan ${y + 1}`; }
      else if (m ===  1) { from = `1 Dec ${y - 1}`; until = `31 Jan ${y}`; }
      else               { from = `1 Jan ${y}`;     until = `31 Dec ${y}`; }
      txt.textContent = `${from} → ${until}`;
      win.style.display = '';
    });

    _wireWeekendBlock('hl-tf-sub');

    document.getElementById('hl-tf-submit')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const empId    = S.teamFlexEmpId;
      const holId    = document.getElementById('hl-tf-holiday').value;
      const swapType = document.getElementById('hl-tf-type')?.value || 'move';
      const subDate  = swapType === 'move' ? document.getElementById('hl-tf-sub').value : null;
      if (!holId)                          { window.showToast?.('Select a holiday to waive', 'error'); return; }
      if (swapType === 'move' && !subDate) { window.showToast?.('Select a substitute date', 'error'); return; }
      if (swapType === 'move' && _isWeekend(subDate)) { window.showToast?.('Substitute date must be a weekday (Mon–Fri)', 'error'); return; }
      btn.disabled = true;
      try {
        const swap = await submitFlexSwap({ employeeId: empId, waivedHolidayId: holId, substituteDate: subDate, swapType });
        S.flexSwaps = [swap, ...S.flexSwaps];
        window.showToast?.('Flex swap submitted', 'success');
        renderTeamFlex(wrap);
      } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
    });
  }
}
