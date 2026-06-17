// js/pages/holidays.js — Leave & Holiday Management (M2)

import { isAdmin, isManager } from '../auth.js';
import { confirmModal } from '../components/confirmModal.js';
import { toISODate, todayISO, esc, attr } from '../format.js';
import { empSelectHtml, wireEmpSelect, empOptionLabel } from '../components/empSelect.js';
import { supabase }         from '../config.js';
import { getEmployees }     from '../api/employees.js';
import {
  getPublicHolidays, createPublicHolidayRange, deletePublicHolidays,
} from '../api/holidays.js';
import {
  getLeaveTypes,
  getLeaveBalances, getAllLeaveBalances, upsertLeaveBalance, adjustLeaveBalance,
  getMyLeaveRequests, getAllLeaveRequests,
  submitLeaveRequest, approveLeaveRequest, hrApproveLeaveRequest, rejectLeaveRequest, cancelLeaveRequest,
  overrideLeaveRequestStatus, updateLeaveRequest,
  getMyFlexSwaps, getAllFlexSwaps,
  submitFlexSwap, approveFlexSwap, rejectFlexSwap, cancelFlexSwap,
  overrideFlexSwapStatus,
} from '../api/leaves.js';

// ── Module state ──────────────────────────────────────────────

let _profile     = null;
let _myEmployee  = null;   // employees row matching current user
let _admin       = false;
let _manager     = false;
let _canApprove  = false;  // admin || manager
let _mainTab    = 'holidays';   // 'holidays' | 'myleave' | 'teamleave'
let _myLeaveTab = 'leave';      // 'leave' | 'flex' | 'balance'
let _teamTab    = 'teamleave';  // 'teamleave' | 'teamflex' | 'approvals' | 'teambalance'
let _year        = new Date().getFullYear();
let _holView     = 'calendar';  // 'calendar' | 'list' — toggle on the HOLIDAYS tab

let _leaveTypes  = [];
let _holidays    = [];
let _employees   = [];   // all (admin) or direct reports (manager)
let _balances    = [];   // my leave balances (or all, for admin/manager)
let _requests    = [];   // all visible requests (RLS-filtered per role)
let _flexSwaps   = [];   // all visible flex swaps (RLS-filtered per role)

// Filter / view state
let _showPastLeave   = false;
let _showPastFlex    = false;
let _approvalSubTab  = 'pending'; // 'pending' | 'history' | 'schedule'
let _historyFrom     = '';
let _historyTo       = '';
let _scheduleFrom    = '';
let _scheduleTo      = '';

// Team / Balances tab employee selection
let _teamLeaveEmpId = null;
let _teamFlexEmpId  = null;
let _teamBalEmpId   = null;

// Flex sub-tab: 'swap' | 'wfh'
let _flexSubTab = 'swap';

// ── Helpers ───────────────────────────────────────────────────

const _fmt  = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';

// ── Weekend handling (leave requests & flex swaps must fall on weekdays) ──
// Timezone-safe: parse as local midnight, then getDay() (0 = Sun, 6 = Sat).
function _isWeekend(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00').getDay();
  return d === 0 || d === 6;
}
// Return dateStr if it is a weekday, else advance to the next Monday (YYYY-MM-DD).
function _nextWeekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return toISODate(d);
}
// Attach a change-guard that rejects weekend selections on a native date input.
function _wireWeekendBlock(inputId) {
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
//   same day       → "6 Apr 2026"
//   same month     → "13 – 15 Apr 2026"
//   cross month    → "31 Dec 2025 – 2 Jan 2026"
function _fmtRange(startStr, endStr) {
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
// Only keeps clusters that overlap the target calendar year _year.
function _groupHolidays(list, year) {
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

function _datePlusDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + n); // local midnight; JS handles month overflow
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Reload holidays from the API and re-render the current holiday view
async function _reloadAndRenderHolidays(wrap) {
  try { _holidays = await getPublicHolidays(_year); } catch { _holidays = []; }
  _renderHolidays(wrap);
}

const STATUS_BADGE = {
  pending:   'badge badge-pending',
  approved:  'badge badge-approved',
  rejected:  'badge badge-rejected',
  cancelled: 'badge',
};

// ── Entry point ───────────────────────────────────────────────

export async function render(profile) {
  _profile    = profile;
  _admin      = isAdmin();
  _manager    = isManager();
  _canApprove = _admin || _manager;
  const _hl_saved = (() => { try { return JSON.parse(sessionStorage.getItem('hl_tab_state') || '{}'); } catch { return {}; } })();
  _mainTab     = _hl_saved.mainTab     || 'holidays';
  _myLeaveTab  = _hl_saved.myLeaveTab  || 'leave';
  _teamTab     = _hl_saved.teamTab     || 'teamleave';
  _holView     = _hl_saved.holView     || 'calendar';
  _flexSubTab  = _hl_saved.flexSubTab  || 'swap';
  _showPastLeave  = false;
  _showPastFlex   = false;
  _approvalSubTab = _hl_saved.approvalSubTab || 'pending';
  if (!_canApprove && _mainTab === 'teamleave') _mainTab = 'holidays';

  // Schedule range defaults; history defaults to empty (show all)
  const _today  = todayISO();
  const _plus30 = toISODate(new Date(Date.now() + 30 * 86400000));
  _scheduleFrom = _today;
  _scheduleTo   = _plus30;
  _historyFrom  = '';
  _historyTo    = '';

  document.getElementById('topbar-left').innerHTML = `<span class="topbar-title">Leave & Holidays</span>`;
  document.getElementById('content').innerHTML = `
    <div class="tabs" id="hl-main-tabs" style="margin-bottom:0;">
      <button class="tab-btn active" data-main="holidays">HOLIDAYS</button>
      <button class="tab-btn" data-main="myleave">MY LEAVE</button>
      ${_canApprove ? `<button class="tab-btn" data-main="teamleave">TEAM LEAVE<span class="badge badge-pending" id="main-badge-teamleave" style="margin-left:4px;display:none;"></span></button>` : ''}
      <button class="tab-btn" data-main="policy">POLICY</button>
    </div>
    <div id="hl-content" style="padding:24px 0 0;">
      <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
    </div>
  `;

  document.querySelectorAll('#hl-main-tabs .tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.main === _mainTab));

  document.querySelectorAll('#hl-main-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#hl-main-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _mainTab = btn.dataset.main;
      if (_mainTab === 'myleave') _dismissLeaveNotifications();
      _saveHlTabState();
      _renderTab();
    });
  });

  try {
    _leaveTypes = await getLeaveTypes();

    if (_admin) {
      [_holidays, _employees] = await Promise.all([
        getPublicHolidays(_year),
        getEmployees(),
      ]);
      [_requests, _flexSwaps, _balances] = await Promise.all([
        getAllLeaveRequests(),
        getAllFlexSwaps(),
        getAllLeaveBalances(_year),
      ]);
      // Admin's own employee record (needed for MY LEAVE / FLEX SWAP personal submit)
      const { data: myEmpData } = await supabase
        .from('employees').select('id, full_name, employee_id')
        .eq('user_id', profile.id).maybeSingle();
      _myEmployee = myEmpData || null;
    } else if (_manager) {
      _holidays = await getPublicHolidays(_year);
      const { data: empData } = await supabase
        .from('employees')
        .select('id, full_name, employee_id')
        .eq('user_id', profile.id)
        .maybeSingle();
      _myEmployee = empData || null;
      if (_myEmployee) {
        [_employees, _requests, _flexSwaps, _balances] = await Promise.all([
          getEmployees(),
          getAllLeaveRequests(),
          getAllFlexSwaps(),
          getAllLeaveBalances(_year),
        ]);
      }
    } else {
      _holidays = await getPublicHolidays(_year);
      const { data: empData } = await supabase
        .from('employees')
        .select('id, full_name, employee_id')
        .eq('user_id', profile.id)
        .maybeSingle();
      _myEmployee = empData || null;
      if (_myEmployee) {
        [_balances, _requests, _flexSwaps] = await Promise.all([
          getLeaveBalances(_myEmployee.id, _year),
          getMyLeaveRequests(_myEmployee.id),
          getMyFlexSwaps(_myEmployee.id),
        ]);
      }
    }
  } catch (err) {
    window.showToast?.(err.message, 'error');
  }

  _renderTab();
  if (_canApprove) _syncLeaveBadges();   // seed main-tab badge after data loads
}

// ── Tab router ────────────────────────────────────────────────

function _renderTab() {
  const wrap = document.getElementById('hl-content');
  if (!wrap) return;
  if      (_mainTab === 'holidays')  _renderHolidays(wrap);
  else if (_mainTab === 'myleave')   _renderMyLeaveHub(wrap);
  else if (_mainTab === 'teamleave') _renderTeamLeaveHub(wrap);
  else if (_mainTab === 'policy')    _renderPolicy(wrap);
}

// ── MY LEAVE hub ───────────────────────────────────────────────

function _renderMyLeaveHub(wrap) {
  const tabs = [
    { key: 'leave',   label: 'Leave' },
    { key: 'flex',    label: 'Flex' },
    { key: 'balance', label: 'My Balance' },
  ];
  wrap.innerHTML = `
    <div class="tabs tabs-secondary" id="hl-my-tabs" style="margin-bottom:0;">
      ${tabs.map(t => `<button class="tab-btn${_myLeaveTab === t.key ? ' active' : ''}" data-my="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div id="hl-my-content" style="padding:24px 0 0;"></div>
  `;
  document.querySelectorAll('#hl-my-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#hl-my-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _myLeaveTab = btn.dataset.my;
      if (_myLeaveTab === 'leave') _dismissLeaveNotifications();
      _saveHlTabState();
      _renderMyLeaveContent();
    });
  });
  _renderMyLeaveContent();
}

function _renderMyLeaveContent() {
  const inner = document.getElementById('hl-my-content');
  if (!inner) return;
  if      (_myLeaveTab === 'leave')   _renderMyLeave(inner);
  else if (_myLeaveTab === 'flex')    _renderFlex(inner);
  else if (_myLeaveTab === 'balance') _renderBalances(inner);
}

// ── TEAM LEAVE hub ─────────────────────────────────────────────

function _renderTeamLeaveHub(wrap) {
  const pendingLeave = _approvalRequests().filter(r => r.status === 'pending').length;
  const pendingFlex  = _approvalFlexSwaps().filter(s => s.status === 'pending').length;
  const pendingTotal = pendingLeave + pendingFlex;
  // Always render the badge span (with an id) so it can be updated in place after
  // an approval, even if it started at zero.
  const _badge = (n, key) => ` <span class="badge badge-pending" id="hub-badge-${key}" style="margin-left:4px;${n > 0 ? '' : 'display:none;'}">${n}</span>`;

  const tabs = [
    { key: 'teamleave',   label: 'Leave Request', badge: _badge(pendingLeave, 'teamleave')  },
    { key: 'teamflex',    label: 'Flex Request',  badge: _badge(pendingFlex,  'teamflex')   },
    { key: 'approvals',   label: 'Approvals',     badge: _badge(pendingTotal, 'approvals')  },
    { key: 'teambalance', label: 'Team Balance',  badge: ''                                 },
  ];
  wrap.innerHTML = `
    <div class="tabs tabs-secondary" id="hl-team-tabs" style="margin-bottom:0;">
      ${tabs.map(t => `<button class="tab-btn${_teamTab === t.key ? ' active' : ''}" data-team="${t.key}">${t.label}${t.badge}</button>`).join('')}
    </div>
    <div id="hl-team-content" style="padding:24px 0 0;"></div>
  `;
  document.querySelectorAll('#hl-team-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#hl-team-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _teamTab = btn.dataset.team;
      _saveHlTabState();
      _renderTeamContent();
    });
  });
  _renderTeamContent();
}

function _renderTeamContent() {
  const inner = document.getElementById('hl-team-content');
  if (!inner) return;
  if      (_teamTab === 'teamleave')   _renderTeamLeave(inner);
  else if (_teamTab === 'teamflex')    _renderTeamFlex(inner);
  else if (_teamTab === 'approvals')   _renderApprovals(inner);
  else if (_teamTab === 'teambalance') _renderTeamBalance(inner);
}

// ── Employee select helper — see js/components/empSelect.js ──

// ── Tab: Policy ────────────────────────────────────────────────

// Official per-type notes, sourced verbatim from the HE Leave Policy v1.0 (§4).
const _POLICY_NOTES = {
  annual_leave:    'Paid. Use for planned vacation or personal time.',
  personal_leave:  'Paid. For personal errands or matters not covered by other categories.',
  sick_leave:      'Paid, per the Thai Labor Protection Act. A medical certificate is required for any absence of three or more consecutive working days.',
  maternity_leave: 'Paid portion per the Thai Labor Protection Act. Notify your manager and HR as early as possible.',
};

function _renderPolicy(wrap) {
  // Entitlement types only: active, carries an annual allocation, not the internal
  // flex_holiday mechanism. This matches the four entitlements in the official policy
  // and excludes pool-only / zero-allocation types (court, unpaid) from the reference.
  const entitlements = _leaveTypes
    .filter(t => t.code !== 'flex_holiday' && (t.default_days ?? 0) > 0)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  function _section(lt) {
    const gran = (lt.granularity_options || []).map(g => g.replace(/_/g, ' ')).join(' / ') || 'Full day';
    const days = lt.default_days ? `${lt.default_days} days per calendar year` : null;
    const note = _POLICY_NOTES[lt.code];
    return `
      <div style="margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid var(--border-color);">
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">${esc(lt.label)}</div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:14px;">
          ${days ? `<div><span style="color:var(--text-muted);min-width:140px;display:inline-block;">Entitlement</span>${days}</div>` : ''}
          <div><span style="color:var(--text-muted);min-width:140px;display:inline-block;">Granularity</span>${esc(gran)}</div>
          ${note ? `<div style="color:var(--text-secondary);line-height:1.6;margin-top:2px;">${esc(note)}</div>` : ''}
        </div>
      </div>`;
  }

  wrap.innerHTML = `
    <div style="max-width:680px;">

      <div style="margin-bottom:28px;">
        <div style="font-size:18px;font-weight:700;margin-bottom:4px;">Hubble Engineering Leave Policy</div>
        <div style="font-size:12px;color:var(--text-muted);">Version 1.0 · Effective 15 May 2026 · Applies to all employees</div>
      </div>

      <div style="margin-bottom:28px;padding-bottom:28px;border-bottom:1px solid var(--border-color);">
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">Purpose &amp; Scope</div>
        <div style="font-size:14px;line-height:1.7;color:var(--text-secondary);">
          Hubble Engineering values a flexible working culture, but we also have active commitments to our
          clients that unplanned absences can put at risk. This policy sets clear, fair rules for taking leave
          so the team keeps its flexibility while the business stays reliable. It covers public holidays, leave
          entitlements, the leave-request process, and the handling of emergencies, and applies to all employees.
        </div>
      </div>

      <div style="margin-bottom:28px;padding-bottom:28px;border-bottom:1px solid var(--border-color);">
        <div style="font-size:15px;font-weight:600;margin-bottom:12px;">Guiding Principles</div>
        <div style="font-size:14px;line-height:1.7;color:var(--text-secondary);">
          <div style="margin-bottom:6px;"><strong>Flexibility with planning</strong> — leave stays flexible, but everyone plans ahead so the team isn't caught short.</div>
          <div style="margin-bottom:6px;"><strong>Fairness</strong> — when requests overlap, approval is first-come-first-served.</div>
          <div style="margin-bottom:6px;"><strong>Team coverage comes first</strong> — client-facing work must remain covered.</div>
          <div><strong>Compliance</strong> — aligned with the Thai Labor Protection Act (LPA).</div>
        </div>
      </div>

      <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:16px;">LEAVE ENTITLEMENTS (§4)</div>

      ${entitlements.map(_section).join('')}

      <div style="margin-bottom:28px;padding-bottom:28px;border-bottom:1px solid var(--border-color);font-size:12px;color:var(--text-muted);line-height:1.6;">
        <strong>Carry-over &amp; encashment</strong> for unused Annual and Personal Leave is to be confirmed by
        management; until confirmed, unused days at year-end are handled at management's discretion. Contact HR
        for carry-over requests at the end of each calendar year.
      </div>

      <div style="margin-bottom:28px;padding-bottom:28px;border-bottom:1px solid var(--border-color);">
        <div style="font-size:15px;font-weight:600;margin-bottom:12px;">Request Procedure (§5)</div>
        <div style="font-size:14px;line-height:1.7;color:var(--text-secondary);">
          <div style="font-weight:600;margin-bottom:6px;">Advance notice</div>
          <div style="margin-bottom:6px;"><strong>2 weeks</strong> — any request that extends a public holiday (e.g. adding days around Songkran or the New Year Festival).</div>
          <div style="margin-bottom:6px;"><strong>1 week</strong> — all other planned leave.</div>
          <div style="margin-bottom:14px;"><strong>Exempt</strong> — sick leave and family emergencies; notify as early as possible, same day where practical.</div>
          <div style="font-weight:600;margin-bottom:6px;">How requests are approved</div>
          <div>Submit your request to your direct manager with HR on copy; your manager acknowledges and decides within two working days. When requests overlap and coverage is at risk, approval is first-come-first-served. A single request may be denied if granting it would put team coverage at risk.</div>
        </div>
      </div>

      <div style="margin-bottom:28px;padding-bottom:28px;border-bottom:1px solid var(--border-color);">
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">Operational Impact &amp; Denial (§6)</div>
        <div style="font-size:14px;line-height:1.7;color:var(--text-secondary);">
          Requests may be denied when granting them would disrupt active client work. An employee who remains
          absent after a denial is recorded as "absent from work" under the Thai Labor Protection Act. This clause
          is a boundary, not a threat — its purpose is to make the consequences of an unauthorized absence clear
          in advance so requests can be reviewed fairly and coverage preserved.
        </div>
      </div>

      <div style="margin-bottom:8px;">
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">Family Emergencies (§7)</div>
        <div style="font-size:14px;line-height:1.7;color:var(--text-secondary);">
          Genuine family emergencies (serious illness, accident, or bereavement of an immediate family member)
          are exempt from the advance-notice rule. Notify your manager as soon as reasonably possible — a call or
          message is acceptable. Supporting documentation (medical certificate, death certificate, police report,
          or equivalent) must be provided within <strong>seven working days</strong> of returning to work.
          Family-emergency leave is not a substitute for planned Annual or Personal Leave.
        </div>
      </div>

    </div>`;
}

// ── Approval helpers ──────────────────────────────────────────

// Requests visible in APPROVALS (exclude manager's own requests — those are in MY LEAVE)
function _approvalRequests() {
  if (_admin) return _requests;
  if (_manager && _myEmployee) return _requests.filter(r => r.employee_id !== _myEmployee.id);
  return [];
}

function _approvalFlexSwaps() {
  if (_admin) return _flexSwaps;
  if (_manager && _myEmployee) return _flexSwaps.filter(s => s.employee_id !== _myEmployee.id);
  return [];
}

// Refresh every leave badge after an approval/rejection: the global nav badge +
// SHOW MORE roll-up (via app.html), and the in-page hub / sub-tab pending badges.
function _setBadgeEl(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = n;
  el.style.display = n > 0 ? '' : 'none';
}
function _saveHlTabState() {
  sessionStorage.setItem('hl_tab_state', JSON.stringify({
    mainTab: _mainTab, myLeaveTab: _myLeaveTab,
    teamTab: _teamTab, approvalSubTab: _approvalSubTab,
    holView: _holView, flexSubTab: _flexSubTab,
  }));
}

function _syncLeaveBadges() {
  window.refreshLeaveBadge?.();   // nav badge-leave + SHOW MORE roll-up
  const pendLeave = _approvalRequests().filter(r => r.status === 'pending').length;
  const pendFlex  = _approvalFlexSwaps().filter(s => s.status === 'pending').length;
  _setBadgeEl('main-badge-teamleave', pendLeave + pendFlex); // main-tab badge
  _setBadgeEl('hub-badge-teamleave',  pendLeave);
  _setBadgeEl('hub-badge-teamflex',   pendFlex);
  _setBadgeEl('hub-badge-approvals',  pendLeave + pendFlex);
  _setBadgeEl('ap-pending-badge',     pendLeave + pendFlex);
}

// Mark own settled leave requests as seen in localStorage and refresh the nav badge
function _dismissLeaveNotifications() {
  if (!_myEmployee) return;
  for (const r of _requests) {
    if (r.employee_id !== _myEmployee.id) continue;
    if (r.status === 'approved' || r.status === 'rejected') {
      localStorage.setItem(`lr_seen_${r.id}`, '1');
    }
  }
  window.refreshLeaveBadge?.();
}

// Status-override modal (admin / manager undo or re-classify)
function _openOverrideModal(type, id) {
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
        const updated = await overrideLeaveRequestStatus(id, newStatus, _myEmployee?.id, notes);
        _requests = _requests.map(r => r.id === id ? updated : r);
      } else {
        const updated = await overrideFlexSwapStatus(id, newStatus, _myEmployee?.id, notes);
        _flexSwaps = _flexSwaps.map(s => s.id === id ? updated : s);
      }
      window.showToast?.(`Status changed to ${newStatus}`, 'success');
      close();
      _renderApprovals(document.getElementById('hl-team-content') || document.getElementById('hl-content'));
      _syncLeaveBadges();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      saveBtn.disabled = false;
    }
  });
}

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

// ── Tab: Holidays ─────────────────────────────────────────────

function _renderHolidays(wrap) {
  const yrOptions = [_year-3,_year-2,_year-1,_year,_year+1,_year+2]
    .map(y => `<option value="${y}"${y===_year?' selected':''}>${y}</option>`).join('');
  wrap.innerHTML = `
    <div class="filter-bar" style="flex-wrap:wrap;gap:8px;align-items:center;">
      <button class="btn btn-ghost btn-sm" id="hl-yr-prev">&#8249;</button>
      <select id="hl-yr-sel" class="form-input" style="width:80px;text-align:center;padding:6px 4px;">${yrOptions}</select>
      <button class="btn btn-ghost btn-sm" id="hl-yr-next">&#8250;</button>
      <div style="display:flex;gap:4px;margin-left:8px;">
        <button class="btn btn-sm${_holView === 'calendar' ? ' btn-primary' : ' btn-ghost'}" id="hl-view-cal">Calendar</button>
        <button class="btn btn-sm${_holView === 'list'     ? ' btn-primary' : ' btn-ghost'}" id="hl-view-list">List</button>
      </div>
      ${_admin ? `<button class="btn btn-primary btn-sm" id="hl-add-holiday" style="margin-left:auto;">+ ADD HOLIDAY</button>` : ''}
    </div>
    <div id="hl-hol-body" style="margin-top:16px;"></div>
  `;

  document.getElementById('hl-yr-prev')?.addEventListener('click', async () => {
    _year--;
    await _reloadAndRenderHolidays(wrap);
  });
  document.getElementById('hl-yr-next')?.addEventListener('click', async () => {
    _year++;
    await _reloadAndRenderHolidays(wrap);
  });
  document.getElementById('hl-yr-sel')?.addEventListener('change', async e => {
    _year = parseInt(e.target.value);
    await _reloadAndRenderHolidays(wrap);
  });
  document.getElementById('hl-view-cal')?.addEventListener('click', () => {
    _holView = 'calendar'; _saveHlTabState(); _renderHolidays(wrap);
  });
  document.getElementById('hl-view-list')?.addEventListener('click', () => {
    _holView = 'list'; _saveHlTabState(); _renderHolidays(wrap);
  });
  if (_admin) {
    document.getElementById('hl-add-holiday')?.addEventListener('click', () => _openHolidayModal(null));
  }

  const body = document.getElementById('hl-hol-body');
  if (_holView === 'calendar') {
    _renderHolidaysCalendar(body);
  } else {
    _renderHolidaysList(body, wrap);
  }
}

// ── Holidays: year calendar view ──────────────────────────────

function _renderHolidaysCalendar(body) {
  const MON_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
  const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOW       = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  const today  = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();

  // Build date→name map for fast lookup
  const holidayMap = {};
  for (const h of _holidays) holidayMap[h.date] = h.name;

  function miniMonth(m) {
    const firstDow   = (new Date(_year, m - 1, 1).getDay() + 6) % 7; // Mon=0…Sun=6
    const daysInMon  = new Date(_year, m, 0).getDate();
    let cells = '';
    for (let i = 0; i < firstDow; i++) cells += '<div class="mc-cell"></div>';
    for (let d = 1; d <= daysInMon; d++) {
      const ds      = `${_year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const hol     = holidayMap[ds];
      const dow     = (firstDow + d - 1) % 7;
      const weekend = dow >= 5;
      const isToday = _year === todayY && m === todayM && d === todayD;
      let cls = 'mc-cell mc-day';
      if (hol)     cls += ' mc-hol';
      if (isToday) cls += ' mc-today';
      else if (weekend && !hol) cls += ' mc-wknd';
      cells += `<div class="${cls}" title="${hol ? esc(hol) : ''}">${d}</div>`;
    }
    return `<div class="mc-month">
      <div class="mc-mname">${MON_NAMES[m - 1]}</div>
      <div class="mc-grid">
        ${DOW.map(d => `<div class="mc-cell mc-dow">${d}</div>`).join('')}
        ${cells}
      </div>
    </div>`;
  }

  const groups  = _groupHolidays(_holidays, _year);
  const totalDays = groups.reduce((n, g) => n + g.ids.length, 0);

  body.innerHTML = `
    <div class="mc-layout">
      <div class="mc-year-grid">
        ${Array.from({length: 12}, (_, i) => miniMonth(i + 1)).join('')}
      </div>
      <div class="mc-sidebar">
        <div style="font-size:12px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:10px;">
          ${_year} — ${totalDays} PUBLIC HOLIDAY${totalDays !== 1 ? 'S' : ''}
        </div>
        ${groups.length === 0
          ? `<div style="font-size:13px;color:var(--text-muted);">
               No holidays seeded.${_admin ? ' Click + ADD HOLIDAY.' : ''}
             </div>`
          : `<table style="width:100%;font-size:12px;border-collapse:collapse;">
               ${groups.map(g => `<tr style="border-bottom:1px solid var(--border-color);"
                   data-ids="${attr(g.ids.join(','))}">
                 <td style="padding:5px 0;color:var(--accent-amber,#c9a020);white-space:nowrap;font-weight:600;">
                   ${_fmtRange(g.startDate, g.endDate)}
                 </td>
                 <td style="padding:5px 0 5px 8px;color:var(--text-secondary,var(--text-primary));">
                   ${esc(g.name)}
                 </td>
                 ${_admin ? `<td style="padding:5px 0;text-align:right;white-space:nowrap;">
                   <button class="row-action-btn hl-edit-holiday" title="Edit">
                     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                       <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                       <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                     </svg>
                   </button>
                   <button class="row-action-btn danger hl-del-holiday" title="Delete">
                     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                       <polyline points="3 6 5 6 21 6"/>
                       <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                     </svg>
                   </button>
                 </td>` : ''}
               </tr>`).join('')}
             </table>`
        }
      </div>
    </div>
  `;

  if (_admin) {
    body.querySelectorAll('tr[data-ids]').forEach(tr => {
      const ids = tr.dataset.ids.split(',');
      const group = groups.find(g => g.ids[0] === ids[0]);
      tr.querySelector('.hl-edit-holiday')?.addEventListener('click', () => _openHolidayModal(group));
      tr.querySelector('.hl-del-holiday')?.addEventListener('click', async () => {
        const label = group ? _fmtRange(group.startDate, group.endDate) : '';
        if (!await confirmModal({ title: 'Delete holiday', message: `Delete "${group?.name}" (${label})?`, confirmText: 'Delete', danger: true })) return;
        try {
          await deletePublicHolidays(ids);
          window.showToast?.('Holiday deleted', 'success');
          await _reloadAndRenderHolidays(document.getElementById('hl-content'));
        } catch (err) { window.showToast?.(err.message, 'error'); }
      });
    });
  }
}

// ── Holidays: list view ───────────────────────────────────────

function _renderHolidaysList(body, parentWrap) {
  const groups = _groupHolidays(_holidays, _year);

  body.innerHTML = groups.length === 0
    ? `<div class="empty-state" style="margin-top:32px">
         <div class="empty-state-title">No holidays for ${_year}</div>
         ${_admin ? '<div class="empty-state-desc">Click + ADD HOLIDAY to add the first one.</div>' : ''}
       </div>`
    : `<div style="overflow-x:auto;">
         <table class="data-table">
           <thead><tr>
             <th>Date</th><th>Holiday</th><th>Scope</th>
             ${_admin ? '<th style="width:80px"></th>' : ''}
           </tr></thead>
           <tbody>
             ${groups.map(g => `<tr data-ids="${attr(g.ids.join(','))}">
               <td style="white-space:nowrap;color:var(--accent-amber,#c9a020);font-weight:600;">
                 ${_fmtRange(g.startDate, g.endDate)}
               </td>
               <td>${esc(g.name)}</td>
               <td>${g.department_code ? `<span class="badge">${esc(g.department?.label || g.department_code)}</span>` : 'All departments'}</td>
               ${_admin ? `<td class="table-actions">
                 <button class="row-action-btn hl-edit-holiday" title="Edit">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                     <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                   </svg>
                 </button>
                 <button class="row-action-btn danger hl-del-holiday" title="Delete">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <polyline points="3 6 5 6 21 6"/>
                     <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                   </svg>
                 </button>
               </td>` : ''}
             </tr>`).join('')}
           </tbody>
         </table>
       </div>`;

  if (_admin) {
    body.querySelectorAll('tr[data-ids]').forEach(tr => {
      const ids   = tr.dataset.ids.split(',');
      const group = groups.find(g => g.ids[0] === ids[0]);
      tr.querySelector('.hl-edit-holiday')?.addEventListener('click', () => _openHolidayModal(group));
      tr.querySelector('.hl-del-holiday')?.addEventListener('click', async () => {
        const label = group ? _fmtRange(group.startDate, group.endDate) : '';
        if (!await confirmModal({ title: 'Delete holiday', message: `Delete "${group?.name}" (${label})?`, confirmText: 'Delete', danger: true })) return;
        try {
          await deletePublicHolidays(ids);
          window.showToast?.('Holiday deleted', 'success');
          await _reloadAndRenderHolidays(parentWrap);
        } catch (err) { window.showToast?.(err.message, 'error'); }
      });
    });
  }
}

// ── Holiday modal (range editor) ──────────────────────────────
// `group` is a grouped cluster object from _groupHolidays(), or null for Add.

function _openHolidayModal(group) {
  const existing = document.getElementById('hl-holiday-modal');
  if (existing) existing.remove();

  const isEdit    = !!group;
  const initStart = isEdit ? group.startDate : '';
  const initEnd   = isEdit ? group.endDate   : '';
  const initName  = isEdit ? group.name      : '';
  const initDept  = isEdit ? (group.department_code || '') : '';

  const deptOpts = _employees.length
    ? [...new Map(_employees.filter(e => e.department).map(e => [e.department.code, e.department])).values()]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(d => `<option value="${attr(d.code)}" ${initDept === d.code ? 'selected' : ''}>${esc(d.label || d.code)}</option>`)
        .join('')
    : '';

  const modal = document.createElement('div');
  modal.id        = 'hl-holiday-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? 'Edit Holiday' : 'Add Holiday'}</h3>
        <button class="modal-close" id="hl-hm-close">&times;</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label class="form-label">Start date
            <input class="form-input" type="date" id="hl-hm-start" value="${attr(initStart)}">
          </label>
          <label class="form-label">End date <span style="font-size:11px;color:var(--text-muted);">(= Start for one day)</span>
            <input class="form-input" type="date" id="hl-hm-end" value="${attr(initEnd)}">
          </label>
        </div>
        <label class="form-label">Holiday name
          <input class="form-input" type="text" id="hl-hm-name"
            placeholder="e.g. Songkran Festival"
            value="${attr(initName)}">
        </label>
        <label class="form-label">Department scope
          <select class="form-input" id="hl-hm-dept">
            <option value="">All departments</option>
            ${deptOpts}
          </select>
        </label>
        ${isEdit ? `<div style="font-size:12px;color:var(--text-muted);padding:8px 12px;
            background:var(--surface-2,rgba(255,255,255,0.03));border-radius:6px;
            border:1px solid var(--border-color);">
          Editing replaces the entire cluster. The old dates will be removed and the new range will be created.
        </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn" id="hl-hm-cancel">Cancel</button>
        <button class="btn btn-primary" id="hl-hm-save">${isEdit ? 'Save changes' : 'Add'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  document.getElementById('hl-hm-close')?.addEventListener('click', close);
  document.getElementById('hl-hm-cancel')?.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  // Auto-fill End when Start changes and End is empty or behind Start
  document.getElementById('hl-hm-start')?.addEventListener('change', e => {
    const endEl = document.getElementById('hl-hm-end');
    if (!endEl.value || endEl.value < e.target.value) endEl.value = e.target.value;
  });

  document.getElementById('hl-hm-save')?.addEventListener('click', async () => {
    const startDate = document.getElementById('hl-hm-start').value;
    const endDate   = document.getElementById('hl-hm-end').value   || startDate;
    const name      = document.getElementById('hl-hm-name').value.trim();
    const dept      = document.getElementById('hl-hm-dept').value  || null;

    if (!startDate || !name) { window.showToast?.('Start date and name are required', 'error'); return; }
    if (endDate < startDate)  { window.showToast?.('End date must be on or after start date', 'error'); return; }

    const saveBtn = document.getElementById('hl-hm-save');
    saveBtn.disabled = true;
    try {
      if (isEdit) {
        // Delete the old cluster first, then create the new range.
        // (The unique index would block inserting a date that already exists in the cluster.)
        await deletePublicHolidays(group.ids);
      }
      await createPublicHolidayRange({ startDate, endDate, name, departmentCode: dept });
      window.showToast?.(isEdit ? 'Holiday updated' : 'Holiday added', 'success');
      close();
      await _reloadAndRenderHolidays(document.getElementById('hl-content'));
    } catch (err) {
      window.showToast?.(err.message, 'error');
      saveBtn.disabled = false;
    }
  });
}

// ── Tab: Leave (self) ─────────────────────────────────────────

function _renderMyLeave(wrap) {
  if (!_myEmployee) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:32px">
      <div class="empty-state-title">No employee record linked</div>
      <div class="empty-state-desc">Ask an admin to link your account to an employee record.</div>
    </div>`;
    return;
  }

  const myEmpId = _myEmployee.id;
  const allMine = _requests.filter(r => r.employee_id === myEmpId);
  const today   = todayISO();

  const visible     = _showPastLeave
    ? allMine
    : allMine.filter(r => r.status === 'pending' || r.end_date >= today);
  const hiddenCount = allMine.length - visible.length;

  wrap.innerHTML = `
    <div style="max-width:540px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
      <div class="form-label" style="font-size:15px;font-weight:600;">Submit Leave Request</div>

      <label class="form-label">Leave Type
        <select class="form-input" id="hl-ml-type">
          ${_leaveTypes.filter(t => t.code !== 'flex_holiday').map(t => `<option value="${attr(t.code)}">${esc(t.label)}</option>`).join('')}
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
        ${hiddenCount > 0 || _showPastLeave ? `
          <button class="btn btn-sm" id="hl-ml-toggle" style="margin-left:auto;">
            ${_showPastLeave ? 'Hide past' : `Show past (${hiddenCount})`}
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
    const t = _leaveTypes.find(x => x.code === typeSel.value);
    docRow.style.display = t?.requires_document ? '' : 'none';
  });

  _wireWeekendBlock('hl-ml-start');
  _wireWeekendBlock('hl-ml-end');

  document.getElementById('hl-ml-reset')?.addEventListener('click', () => _renderMyLeave(wrap));

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
      const myBal = _balances.find(b => b.leave_type_code === typeCode && b.employee_id === myEmpId);
      if (myBal) {
        const avail = myBal.allocated_days + myBal.carried_over_days + myBal.manual_adjustment_days - myBal.used_days;
        if (avail <= 0) {
          const partner    = typeCode === 'annual_leave' ? 'personal_leave' : 'annual_leave';
          const partnerBal = _balances.find(b => b.leave_type_code === partner && b.employee_id === myEmpId);
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
      _requests = [req, ..._requests];
      window.showToast?.('Leave request submitted', 'success');
      if (isCross) window.showToast?.('Cross-pool deduction flagged for HR review', 'warning');
      _renderMyLeave(wrap);
    } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
  });

  document.getElementById('hl-ml-toggle')?.addEventListener('click', () => {
    _showPastLeave = !_showPastLeave;
    _renderMyLeave(wrap);
  });

  wrap.querySelectorAll('.hl-cancel-req').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await confirmModal({ title: 'Cancel leave request', message: 'Cancel this leave request?', confirmText: 'Cancel request', cancelText: 'Keep it', danger: true })) return;
      try {
        await cancelLeaveRequest(btn.dataset.id);
        _requests = _requests.map(r => r.id === btn.dataset.id ? { ...r, status: 'cancelled' } : r);
        window.showToast?.('Request cancelled', 'success');
        _renderMyLeave(wrap);
      } catch (err) { window.showToast?.(err.message, 'error'); }
    });
  });
}


// ── Tab: Flex ─────────────────────────────────────────────────

function _renderFlex(wrap) {
  if (!_myEmployee && !_admin) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:32px">
      <div class="empty-state-title">No employee record linked</div>
    </div>`;
    return;
  }

  const myEmpIdF   = _myEmployee?.id;
  const allMySwaps = myEmpIdF ? _flexSwaps.filter(s => s.employee_id === myEmpIdF) : [];
  const todayF     = todayISO();
  const mySwaps    = _showPastFlex
    ? allMySwaps
    : allMySwaps.filter(s => s.status === 'pending' ||
        (s.substitute_date && s.substitute_date >= todayF) ||
        (s.valid_from && s.valid_from >= todayF));
  const hiddenFlexCount = allMySwaps.length - mySwaps.length;
  const today = todayISO();

  wrap.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:20px;">
      <button class="tab-btn${_flexSubTab === 'swap' ? ' active' : ''}" id="hl-flex-sub-swap">Flex Swap</button>
      <button class="tab-btn${_flexSubTab === 'wfh' ? ' active' : ''}" id="hl-flex-sub-wfh">Work From Home</button>
    </div>
    <div id="hl-flex-body"></div>

    <div style="margin-top:32px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;">MY FLEX HISTORY</div>
        ${hiddenFlexCount > 0 || _showPastFlex ? `
          <button class="btn btn-sm" id="hl-flex-toggle" style="margin-left:auto;">
            ${_showPastFlex ? 'Hide past' : `Show past (${hiddenFlexCount})`}
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
    _flexSubTab = 'swap'; _saveHlTabState();
    _renderFlex(wrap);
  });
  document.getElementById('hl-flex-sub-wfh').addEventListener('click', () => {
    _flexSubTab = 'wfh'; _saveHlTabState();
    _renderFlex(wrap);
  });

  document.getElementById('hl-flex-toggle')?.addEventListener('click', () => {
    _showPastFlex = !_showPastFlex;
    _renderFlex(wrap);
  });

  wrap.querySelectorAll('.hl-cancel-flex').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await confirmModal({ title: 'Cancel flex entry', message: 'Cancel this flex entry?', confirmText: 'Cancel entry', cancelText: 'Keep it', danger: true })) return;
      try {
        await cancelFlexSwap(btn.dataset.id);
        _flexSwaps = _flexSwaps.map(s => s.id === btn.dataset.id ? { ...s, status: 'cancelled' } : s);
        window.showToast?.('Flex entry cancelled', 'success');
        _renderFlex(wrap);
      } catch (err) { window.showToast?.(err.message, 'error'); }
    });
  });

  const body = document.getElementById('hl-flex-body');
  if (_flexSubTab === 'swap') {
    _renderFlexSwapForm(body, wrap);
  } else {
    _renderWfhForm(body, wrap);
  }
}

function _renderFlexSwapForm(body, wrap) {
  const today = todayISO();
  body.innerHTML = `
    <div style="max-width:540px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
      <div class="form-label" style="font-size:15px;font-weight:600;">Submit Flex Holiday Swap</div>

      <label class="form-label">Holiday to waive
        <select class="form-input" id="hl-flex-holiday">
          <option value="">Select year: use ← → on Holidays tab to load ${_year}</option>
          ${_holidays.map(h => `<option value="${attr(h.id)}">${_fmt(h.date)} — ${esc(h.name)}</option>`).join('')}
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
    const h = _holidays.find(x => x.id === e.target.value);
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
    const empId   = _myEmployee?.id;
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
      _flexSwaps = [swap, ..._flexSwaps];
      window.showToast?.('Flex swap submitted', 'success');
      _renderFlex(wrap);
    } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
  });
}

function _renderWfhForm(body, wrap) {
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
    const empId  = _myEmployee?.id;
    const wfhDate = document.getElementById('hl-wfh-date').value;
    if (!empId)   { window.showToast?.('No employee record found', 'error'); return; }
    if (!wfhDate) { window.showToast?.('Select a date', 'error'); return; }
    const dow = new Date(wfhDate + 'T00:00:00').getDay();
    if (dow === 0 || dow === 6) { window.showToast?.('WFH date must be a weekday (Mon–Fri)', 'error'); return; }
    btn.disabled = true;
    try {
      const swap = await submitFlexSwap({ employeeId: empId, waivedHolidayId: null, substituteDate: null, swapType: 'wfh', wfhDate });
      _flexSwaps = [swap, ..._flexSwaps];
      window.showToast?.('WFH request submitted', 'success');
      _renderFlex(wrap);
    } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
  });
}

// ── Tab: Team Leave (admin / manager) ────────────────────────

function _renderTeamLeave(wrap) {
  const today      = todayISO();
  const activeEmps = _employees.filter(e => e.status === 'active' || e.status === 'probation');
  const selEmp     = activeEmps.find(e => e.id === _teamLeaveEmpId);
  const empBals    = _teamLeaveEmpId ? _balances.filter(b => b.employee_id === _teamLeaveEmpId) : [];
  const empReqs    = _teamLeaveEmpId ? _requests.filter(r => r.employee_id === _teamLeaveEmpId) : [];

  wrap.innerHTML = `
    <div style="max-width:360px;margin-bottom:24px;">
      <label class="form-label">Employee
        ${empSelectHtml('hl-tl', activeEmps, { selectedId: _teamLeaveEmpId })}
      </label>
    </div>

    ${!_teamLeaveEmpId ? (() => {
      const all = [..._requests].sort((a, b) => b.start_date.localeCompare(a.start_date));
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
            ${_leaveTypes.filter(t => t.code !== 'flex_holiday').map(t => `<option value="${attr(t.code)}">${esc(t.label)}</option>`).join('')}
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
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">LEAVE BALANCES — ${_year}</div>
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

  wireEmpSelect('hl-tl', activeEmps, emp => {
    _teamLeaveEmpId = emp?.id ?? null;
    _renderTeamLeave(wrap);
  });

  if (_teamLeaveEmpId) {
    const typeSel = document.getElementById('hl-tl-type');
    const docRow  = document.getElementById('hl-tl-doc-row');
    typeSel?.addEventListener('change', () => {
      const t = _leaveTypes.find(x => x.code === typeSel.value);
      docRow.style.display = t?.requires_document ? '' : 'none';
    });

    _wireWeekendBlock('hl-tl-start');
    _wireWeekendBlock('hl-tl-end');

    document.getElementById('hl-tl-reset')?.addEventListener('click', () => _renderTeamLeave(wrap));

    document.getElementById('hl-tl-submit')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const empId     = _teamLeaveEmpId;
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
        const empBal = _balances.find(b => b.leave_type_code === typeCode && b.employee_id === empId);
        if (empBal) {
          const avail = empBal.allocated_days + empBal.carried_over_days + empBal.manual_adjustment_days - empBal.used_days;
          if (avail <= 0) {
            const partner    = typeCode === 'annual_leave' ? 'personal_leave' : 'annual_leave';
            const partnerBal = _balances.find(b => b.leave_type_code === partner && b.employee_id === empId);
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
        _requests = [req, ..._requests];
        window.showToast?.('Leave request submitted', 'success');
        if (isCross) window.showToast?.('Cross-pool deduction flagged for HR review', 'warning');
        _renderTeamLeave(wrap);
      } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
    });
  }
}

// ── Tab: Team Flex (admin / manager) ─────────────────────────

function _renderTeamFlex(wrap) {
  const today      = todayISO();
  const activeEmps = _employees.filter(e => e.status === 'active' || e.status === 'probation');
  const selEmp  = activeEmps.find(e => e.id === _teamFlexEmpId);
  const empSwaps = _teamFlexEmpId ? _flexSwaps.filter(s => s.employee_id === _teamFlexEmpId) : [];

  wrap.innerHTML = `
    <div style="max-width:360px;margin-bottom:24px;">
      <label class="form-label">Employee
        ${empSelectHtml('hl-tf', activeEmps, { selectedId: _teamFlexEmpId })}
      </label>
    </div>

    ${!_teamFlexEmpId ? (() => {
      const all = [..._flexSwaps].sort((a, b) => (b.substitute_date||'').localeCompare(a.substitute_date||''));
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
            <option value="">Select year: use ← → on Holidays tab to load ${_year}</option>
            ${_holidays.map(h => `<option value="${attr(h.id)}">${_fmt(h.date)} — ${esc(h.name)}</option>`).join('')}
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

  wireEmpSelect('hl-tf', activeEmps, emp => {
    _teamFlexEmpId = emp?.id ?? null;
    _renderTeamFlex(wrap);
  });

  if (_teamFlexEmpId) {
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
      const h   = _holidays.find(x => x.id === e.target.value);
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
      const empId    = _teamFlexEmpId;
      const holId    = document.getElementById('hl-tf-holiday').value;
      const swapType = document.getElementById('hl-tf-type')?.value || 'move';
      const subDate  = swapType === 'move' ? document.getElementById('hl-tf-sub').value : null;
      if (!holId)                          { window.showToast?.('Select a holiday to waive', 'error'); return; }
      if (swapType === 'move' && !subDate) { window.showToast?.('Select a substitute date', 'error'); return; }
      if (swapType === 'move' && _isWeekend(subDate)) { window.showToast?.('Substitute date must be a weekday (Mon–Fri)', 'error'); return; }
      btn.disabled = true;
      try {
        const swap = await submitFlexSwap({ employeeId: empId, waivedHolidayId: holId, substituteDate: subDate, swapType });
        _flexSwaps = [swap, ..._flexSwaps];
        window.showToast?.('Flex swap submitted', 'success');
        _renderTeamFlex(wrap);
      } catch (err) { btn.disabled = false; window.showToast?.(err.message, 'error'); }
    });
  }
}

// ── Leave request edit modal (admin) ─────────────────────────

function _openLeaveEditModal(req, onSave) {
  document.getElementById('hl-edit-modal')?.remove();

  const typeOpts = _leaveTypes.map(t =>
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
        ${_admin && req.status === 'pending' ? `<button class="btn btn-primary" id="hle-save-approve">Save &amp; Approve</button>` : ''}
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
    _requests = _requests.map(r => r.id === updated.id ? updated : r);
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
    try {
      await _doSaveLeave();
      await approveLeaveRequest(req.id, _myEmployee?.id ?? null, null);
      window.showToast?.('Saved & Approved.', 'success');
      close();
      onSave?.();
      _syncLeaveBadges();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      approveBtn.disabled = false;
    }
  });
}

// ── Tab: Approvals (admin) ────────────────────────────────────

function _renderApprovals(wrap) {
  const subBtns = ['pending','schedule','history'];
  const pendingCount = _approvalRequests().filter(r => r.status === 'pending').length
                     + _approvalFlexSwaps().filter(s => s.status === 'pending').length;
  const subLabels = {
    pending: `PENDING <span class="badge badge-pending" id="ap-pending-badge" style="margin-left:4px;${pendingCount > 0 ? '' : 'display:none;'}">${pendingCount}</span>`,
    history:  'HISTORY',
    schedule: 'SCHEDULE',
  };

  // Sub-tab bar + content area
  wrap.innerHTML = `
    <div class="tabs" id="hl-ap-tabs" style="margin-bottom:16px;">
      ${subBtns.map(k => `<button class="tab-btn${_approvalSubTab === k ? ' active' : ''}" data-subtab="${k}">${subLabels[k]}</button>`).join('')}
    </div>
    <div id="hl-ap-body"></div>
  `;

  wrap.querySelectorAll('#hl-ap-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('#hl-ap-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _approvalSubTab = btn.dataset.subtab;
      _saveHlTabState();
      _renderApprovalBody();
    });
  });

  function _renderApprovalBody() {
    const body = document.getElementById('hl-ap-body');
    if (!body) return;
    if      (_approvalSubTab === 'pending')  _renderApprovalPending(body);
    else if (_approvalSubTab === 'history')  _renderApprovalHistory(body);
    else if (_approvalSubTab === 'schedule') _renderApprovalSchedule(body);
  }

  // ── PENDING ─────────────────────────────────────────────────
  function _renderApprovalPending(body) {
    const pending  = _approvalRequests().filter(r => r.status === 'pending');
    const pendFlex = _approvalFlexSwaps().filter(s => s.status === 'pending');

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
                         ${_admin ? `<button class="btn btn-sm btn-ghost hl-edit-req" data-id="${attr(r.id)}">Edit</button>` : ''}
                         <button class="btn btn-sm btn-primary hl-approve-req" data-id="${attr(r.id)}">Approve</button>
                         <button class="btn btn-sm btn-danger hl-reject-req" data-id="${attr(r.id)}">Reject</button>
                       </td>
                     </tr>`).join('')}
                   </tbody>
                 </table>
               </div>`
          }
        </div>
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
      const req = _requests.find(r => r.id === btn.dataset.id);
      if (req) btn.addEventListener('click', () => _openLeaveEditModal(req, () => _renderApprovalPending(body)));
    });

    body.querySelectorAll('.hl-approve-req').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const updated = await approveLeaveRequest(btn.dataset.id, _myEmployee?.id, null);
          _requests = _requests.map(r => r.id === updated.id ? updated : r);
          window.showToast?.('Request approved — employee will be notified.', 'success');
          _renderApprovalPending(body);
          _syncLeaveBadges();
        } catch (err) { window.showToast?.(err.message, 'error'); }
      });
    });

    body.querySelectorAll('.hl-reject-req').forEach(btn => {
      btn.addEventListener('click', () => {
        const req = _requests.find(r => r.id === btn.dataset.id);
        const contextLine = req
          ? [req.employee?.full_name, req.leave_type?.label || req.leave_type_code, req.start_date].filter(Boolean).map(esc).join(' · ')
          : '';
        _openHlRejectModal({
          contextLine,
          required: true,
          onConfirm: async reason => {
            const updated = await rejectLeaveRequest(btn.dataset.id, reason);
            _requests = _requests.map(r => r.id === updated.id ? updated : r);
            window.showToast?.('Request rejected — employee will be notified.', 'success');
            _renderApprovalPending(body);
            _syncLeaveBadges();
          },
        });
      });
    });

    body.querySelectorAll('.hl-approve-flex').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const updated = await approveFlexSwap(btn.dataset.id, _myEmployee?.id, null);
          _flexSwaps = _flexSwaps.map(s => s.id === updated.id ? updated : s);
          window.showToast?.('Flex swap approved — employee will be notified.', 'success');
          _renderApprovalPending(body);
          _syncLeaveBadges();
        } catch (err) { window.showToast?.(err.message, 'error'); }
      });
    });

    body.querySelectorAll('.hl-reject-flex').forEach(btn => {
      btn.addEventListener('click', () => {
        const swap = _flexSwaps.find(s => s.id === btn.dataset.id);
        const contextLine = swap
          ? [swap.employee?.full_name, swap.waived_holiday?.name, swap.substitute_date].filter(Boolean).map(esc).join(' · ')
          : '';
        _openHlRejectModal({
          contextLine,
          required: false,
          onConfirm: async reason => {
            const updated = await rejectFlexSwap(btn.dataset.id, reason);
            _flexSwaps = _flexSwaps.map(s => s.id === updated.id ? updated : s);
            window.showToast?.('Flex swap rejected — employee will be notified.', 'success');
            _renderApprovalPending(body);
            _syncLeaveBadges();
          },
        });
      });
    });
  }

  // ── HISTORY ──────────────────────────────────────────────────
  function _renderApprovalHistory(body) {
    const settled = _approvalRequests()
      .filter(r => (!_historyFrom || r.start_date >= _historyFrom)
                && (!_historyTo   || r.start_date <= _historyTo))
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
    const settledFlex = _approvalFlexSwaps()
      .filter(s => (!_historyFrom || s.substitute_date >= _historyFrom)
                && (!_historyTo   || s.substitute_date <= _historyTo))
      .sort((a, b) => b.substitute_date.localeCompare(a.substitute_date));

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:24px;">
        <div class="filter-bar" style="flex-wrap:wrap;gap:8px;align-items:center;">
          <label style="font-size:12px;color:var(--text-muted);">From</label>
          <input class="form-input" type="date" id="hl-hist-from" value="${attr(_historyFrom)}" style="width:160px;" placeholder="YYYY-MM-DD (optional)">
          <label style="font-size:12px;color:var(--text-muted);">To</label>
          <input class="form-input" type="date" id="hl-hist-to"   value="${attr(_historyTo)}"   style="width:160px;" placeholder="YYYY-MM-DD (optional)">
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
                         ${_admin ? `<button class="btn btn-sm btn-ghost hl-edit-hist-req" data-id="${attr(r.id)}">Edit</button>` : ''}
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
      _historyFrom = document.getElementById('hl-hist-from').value;
      _historyTo   = document.getElementById('hl-hist-to').value;
      _renderApprovalHistory(body);
    });

    body.querySelectorAll('.hl-override-req').forEach(btn => {
      btn.addEventListener('click', () => _openOverrideModal('leave', btn.dataset.id));
    });
    body.querySelectorAll('.hl-override-flex').forEach(btn => {
      btn.addEventListener('click', () => _openOverrideModal('flex', btn.dataset.id));
    });
    body.querySelectorAll('.hl-edit-hist-req').forEach(btn => {
      const req = _requests.find(r => r.id === btn.dataset.id);
      if (req) btn.addEventListener('click', () => _openLeaveEditModal(req, () => _renderApprovalHistory(body)));
    });
  }

  // ── SCHEDULE ─────────────────────────────────────────────────
  function _renderApprovalSchedule(body) {
    // All approved leaves and flex swaps overlapping the selected date range
    const leaves = _approvalRequests()
      .filter(r => r.status === 'approved' && r.start_date <= _scheduleTo && r.end_date >= _scheduleFrom)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));

    const flexLeaves = _approvalFlexSwaps()
      .filter(s => s.status === 'approved' && s.substitute_date >= _scheduleFrom && s.substitute_date <= _scheduleTo)
      .sort((a, b) => a.substitute_date.localeCompare(b.substitute_date));

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:24px;">
        <div class="filter-bar" style="flex-wrap:wrap;gap:8px;align-items:center;">
          <label style="font-size:12px;color:var(--text-muted);">From</label>
          <input class="form-input" type="date" id="hl-sch-from" value="${attr(_scheduleFrom)}" style="width:140px;">
          <label style="font-size:12px;color:var(--text-muted);">To</label>
          <input class="form-input" type="date" id="hl-sch-to"   value="${attr(_scheduleTo)}"   style="width:140px;">
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
      _scheduleFrom = document.getElementById('hl-sch-from').value || _scheduleFrom;
      _scheduleTo   = document.getElementById('hl-sch-to').value   || _scheduleTo;
      _renderApprovalSchedule(body);
    });
  }

  _renderApprovalBody();
}

// ── BALANCES tab (all users — own data; admin/manager can search) ─

function _balCards(rows) {
  if (rows.length === 0) return '';
  // Deduplicate by leave_type_code — guard against data anomalies
  const seen = new Set();
  rows = rows.filter(b => { if (seen.has(b.leave_type_code)) return false; seen.add(b.leave_type_code); return true; });
  return `<div style="display:flex;flex-wrap:wrap;gap:12px;">
    ${rows.map(b => {
      const lt    = _leaveTypes.find(x => x.code === b.leave_type_code);
      const alloc = b.allocated_days ?? lt?.default_days ?? 0;
      const extra = (b.carried_over_days ?? 0) + (b.manual_adjustment_days ?? 0);
      const used  = b.used_days ?? 0;
      const avail = alloc + extra - used;
      const total = alloc + extra;
      const pct   = total > 0 ? Math.max(0, Math.min(100, (used / total) * 100)) : 0;
      const low   = avail < 0;
      return `<div style="background:var(--surface-2,var(--bg-card));border:1px solid var(--border-color,var(--border));
          border-radius:8px;padding:16px 20px;min-width:160px;flex:1;display:flex;flex-direction:column;gap:6px;">
        <div style="font-size:12px;color:var(--text-muted);font-weight:500;letter-spacing:.04em;">
          ${esc(b.leave_type?.label || lt?.label || b.leave_type_code)}
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

// ── Tab: My Balance (all users — own balance only) ─────────────

function _renderBalances(wrap) {
  const balYear = _year;

  if (!_myEmployee) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:32px">
      <div class="empty-state-title">No employee record linked</div>
      <div class="empty-state-desc">Ask an admin to link your account to an employee record.</div>
    </div>`;
    return;
  }

  // Only real policy entitlements are shown as balance cards: a type that is
  // active and carries an annual allocation (default_days > 0). This excludes
  // internal/zero-allocation types (flex_holiday, unpaid_leave, and any pool-only
  // type such as court_leave) that would otherwise render as empty, confusing cards.
  const entitlementCodes = new Set(
    _leaveTypes.filter(t => t.code !== 'flex_holiday' && (t.default_days ?? 0) > 0).map(t => t.code)
  );
  const myBals = _balances.filter(b => b.employee_id === _myEmployee.id && entitlementCodes.has(b.leave_type_code));

  // Synthetic fallback: show policy defaults when no DB rows exist yet
  const displayBals = myBals.length > 0 ? myBals : _leaveTypes
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
        ${[balYear - 1, balYear, balYear + 1].map(y =>
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
    _year = parseInt(e.target.value, 10);
    try {
      _balances = _canApprove
        ? await getAllLeaveBalances(_year)
        : await getLeaveBalances(_myEmployee.id, _year);
    } catch (err) { window.showToast?.(err.message, 'error'); }
    _renderBalances(wrap);
  });
}

// ── Tab: Team Balance (admin / manager) ───────────────────────

function _renderTeamBalance(wrap) {
  const balYear    = _year;
  const activeEmps = _employees.filter(e => e.status === 'active' || e.status === 'probation');
  const selEmp     = activeEmps.find(e => e.id === _teamBalEmpId);
  const entitlementCodes = new Set(
    _leaveTypes.filter(t => t.code !== 'flex_holiday' && (t.default_days ?? 0) > 0).map(t => t.code)
  );
  const selBals = _teamBalEmpId
    ? _balances.filter(b => b.employee_id === _teamBalEmpId && entitlementCodes.has(b.leave_type_code))
    : [];

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <label style="font-weight:600;">Year</label>
      <select class="form-input" id="tbal-year" style="width:90px;">
        ${[balYear - 1, balYear, balYear + 1].map(y =>
          `<option value="${y}"${y === balYear ? ' selected' : ''}>${y}</option>`
        ).join('')}
      </select>
      ${_admin ? `
        <button class="btn btn-sm btn-ghost" id="tbal-init">Initialize Year</button>
        <span style="font-size:12px;color:var(--text-muted);">
          Seeds policy entitlements for all employees (skips existing)
        </span>` : ''}
    </div>

    <div style="max-width:360px;margin-bottom:24px;">
      <label class="form-label">Employee
        ${empSelectHtml('hl-tb', activeEmps, { selectedId: _teamBalEmpId })}
      </label>
    </div>

    ${!_teamBalEmpId
      ? `<div class="empty-state">
           <div class="empty-state-title">Select an employee above to view their leave balance</div>
         </div>`
      : `<div style="font-size:15px;font-weight:600;margin-bottom:16px;">
           ${esc(selEmp?.employee_id || '')} — ${esc(selEmp?.full_name || '')}
         </div>
         ${selBals.length === 0
           ? `<div class="empty-state">
                <div class="empty-state-title">No balance data for ${balYear}</div>
                ${_admin ? `<div class="empty-state-desc">Use "Initialize Year" to seed entitlements.</div>` : ''}
              </div>`
           : _balCards(selBals)
         }`
    }
  `;

  document.getElementById('tbal-year')?.addEventListener('change', async e => {
    _year = parseInt(e.target.value, 10);
    try { _balances = await getAllLeaveBalances(_year); } catch (err) { window.showToast?.(err.message, 'error'); }
    _renderTeamBalance(wrap);
  });

  wireEmpSelect('hl-tb', activeEmps, emp => {
    _teamBalEmpId = emp?.id ?? null;
    _renderTeamBalance(wrap);
  });

  if (_admin) {
    document.getElementById('tbal-init')?.addEventListener('click', async () => {
      const btn = document.getElementById('tbal-init');
      btn.disabled = true; btn.textContent = 'Initializing…';
      let count = 0;
      const active = _employees.filter(e => e.status === 'active' || e.status === 'probation');
      const existing = new Set(_balances.map(b => `${b.employee_id}:${b.leave_type_code}`));
      const tasks = [];
      active.forEach(emp => {
        _leaveTypes.forEach(lt => {
          if (!existing.has(`${emp.id}:${lt.code}`)) {
            tasks.push(
              upsertLeaveBalance({ employeeId: emp.id, leaveTypeCode: lt.code, year: _year, allocatedDays: lt.default_days ?? 0 })
                .then(() => { count++; }).catch(() => {})
            );
          }
        });
      });
      await Promise.all(tasks);
      _balances = await getAllLeaveBalances(_year);
      window.showToast?.(`Initialized ${count} balance row${count !== 1 ? 's' : ''} for ${_year}`, 'success');
      btn.disabled = false; btn.textContent = 'Initialize Year';
      _renderTeamBalance(wrap);
    });
  }
}
