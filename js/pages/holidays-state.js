// js/pages/holidays-state.js — Shared mutable state + pure helpers for the holidays module

import { toISODate, esc } from '../format.js';

// ── Mutable shared state ──────────────────────────────────────

export const S = {
  profile:        null,
  myEmployee:     null,   // employees row matching current user
  admin:          false,
  manager:        false,
  canApprove:     false,  // admin || manager
  mainTab:        'holidays',   // 'holidays' | 'myleave' | 'teamleave'
  myLeaveTab:     'leave',      // 'leave' | 'flex' | 'balance'
  teamTab:        'teamleave',  // 'teamleave' | 'teamflex' | 'approvals' | 'teambalance'
  year:           new Date().getFullYear(),
  holView:        'calendar',   // 'calendar' | 'list'

  leaveTypes:     [],
  holidays:       [],
  employees:      [],   // all (admin) or direct reports (manager)
  balances:       [],   // leave balances (own or all, depending on role)
  requests:       [],   // all visible requests (RLS-filtered per role)
  flexSwaps:      [],   // all visible flex swaps (RLS-filtered per role)

  // Filter / view state
  showPastLeave:   false,
  showPastFlex:    false,
  approvalSubTab:  'pending', // 'pending' | 'history' | 'schedule'
  historyFrom:     '',
  historyTo:       '',
  scheduleFrom:    '',
  scheduleTo:      '',

  // Team / Balances tab employee selection
  teamLeaveEmpId: null,
  teamFlexEmpId:  null,
  teamBalEmpId:   null,

  // Flex sub-tab: 'swap' | 'wfh'
  flexSubTab: 'swap',
};

// ── Shared pure helpers ───────────────────────────────────────

export const _fmt = d => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

// Timezone-safe weekend check: parse as local midnight, getDay() (0=Sun, 6=Sat).
export function _isWeekend(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00').getDay();
  return d === 0 || d === 6;
}

// Return dateStr if it is a weekday, else advance to the next Monday (YYYY-MM-DD).
export function _nextWeekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return toISODate(d);
}

// Attach a change-guard that rejects weekend selections on a native date input.
export function _wireWeekendBlock(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('change', () => {
    if (_isWeekend(input.value)) {
      window.showToast?.('Weekends are not selectable — please choose a weekday', 'error');
      input.value = '';
    }
  });
}

// Format a date range compactly:
//   same day    → "6 Apr 2026"
//   same month  → "13 – 15 Apr 2026"
//   cross month → "31 Dec 2025 – 2 Jan 2026"
export function _fmtRange(startStr, endStr) {
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr   + 'T00:00:00');
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (startStr === endStr) {
    return `${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
  }
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${s.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  }
  return `${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
}

// Group flat holiday rows into clusters by consecutive-date + same name + same dept.
// Returns array of { name, department_code, department, startDate, endDate, ids, days }.
// Only keeps clusters that overlap the target calendar year.
export function _groupHolidays(list, year) {
  if (!list.length) return [];

  const yearStart = `${year}-01-01`;
  const yearEnd   = `${year}-12-31`;

  const groups = [];
  let cur = null;

  for (const h of list) {
    if (
      cur &&
      h.name === cur.name &&
      h.department_code === cur.department_code &&
      _datePlusDays(cur.endDate, 1) === h.date
    ) {
      cur.endDate = h.date;
      cur.ids.push(h.id);
      cur.days.push(h);
    } else {
      if (cur) groups.push(cur);
      cur = {
        name:            h.name,
        department_code: h.department_code,
        department:      h.department,
        startDate:       h.date,
        endDate:         h.date,
        ids:             [h.id],
        days:            [h],
      };
    }
  }
  if (cur) groups.push(cur);

  // Keep only clusters that overlap the target year
  return groups.filter(g => g.endDate >= yearStart && g.startDate <= yearEnd);
}

export function _datePlusDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + n); // local midnight; JS handles month overflow
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ── Status badge map (used by multiple sub-modules) ───────────

export const STATUS_BADGE = {
  pending:          'badge badge-pending',
  manager_approved: 'badge badge-pending',
  approved:         'badge badge-approved',
  rejected:         'badge badge-rejected',
  cancelled:        'badge',
};

// ── Balance cards (used by both MY LEAVE balance tab and team balance tab) ─

export function _balCards(rows) {
  if (rows.length === 0) return '';
  // Deduplicate by leave_type_code — guard against data anomalies
  const seen = new Set();
  rows = rows.filter(b => { if (seen.has(b.leave_type_code)) return false; seen.add(b.leave_type_code); return true; });
  return `<div style="display:flex;flex-wrap:wrap;gap:12px;">
    ${rows.map(b => {
      const lt    = S.leaveTypes.find(x => x.code === b.leave_type_code);
      const alloc = b.allocated_days ?? lt?.default_days ?? 0;
      const extra = (b.carried_over_days ?? 0) + (b.manual_adjustment_days ?? 0);
      const used  = b.used_days ?? 0;
      const avail = alloc + extra - used;
      const total = alloc + extra;
      const pct   = total > 0 ? Math.max(0, Math.min(100, (used / total) * 100)) : 0;
      const low   = avail < 0;
      const label = b.leave_type?.label || lt?.label || b.leave_type_code;
      return `<div style="background:var(--surface-2,var(--bg-card));border:1px solid var(--border-color,var(--border));
          border-radius:8px;padding:16px 20px;min-width:160px;flex:1;display:flex;flex-direction:column;gap:6px;">
        <div style="font-size:12px;color:var(--text-muted);font-weight:500;letter-spacing:.04em;">
          ${esc(label)}
        </div>
        <div style="font-size:28px;font-weight:700;line-height:1;${low ? 'color:var(--color-danger,#e53e3e)' : ''}">
          ${avail.toFixed(1)}
          <span style="font-size:13px;font-weight:400;color:var(--text-muted);">days left</span>
        </div>
        <div style="height:4px;border-radius:2px;background:var(--border-color,#333);overflow:hidden;margin-top:2px;">
          <div style="height:100%;width:${pct.toFixed(1)}%;background:${low ? 'var(--color-danger,#e53e3e)' : 'var(--color-primary,#6c63ff)'};border-radius:2px;"></div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);">
          ${used} used · ${total}${extra > 0 ? ` <span title="incl. carry-over / adjustment">+${extra}</span>` : ''} allocated
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

