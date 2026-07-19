// js/pages/holidays.js — Leave & Holiday Management (M2) — coordinator

import { isAdmin, isManager } from '../auth.js';
import { toISODate, todayISO, esc } from '../format.js';
import { supabase }         from '../config.js';
import { getEmployees }     from '../api/employees.js';
import {
  getPublicHolidays,
} from '../api/holidays.js';
import {
  getLeaveTypes,
  getLeaveBalances, getAllLeaveBalances,
  getMyLeaveRequests, getAllLeaveRequests,
  getMyFlexSwaps, getAllFlexSwaps,
} from '../api/leaves.js';

import { S } from './holidays-state.js';
import { renderHolidays } from './holidays-holidays.js?v=126';
import { renderMyLeave, renderFlex, renderBalances } from './holidays-my-leave.js?v=126';
import { renderTeamLeave, renderTeamFlex } from './holidays-team.js?v=126';
import { renderApprovals, renderTeamBalance } from './holidays-approvals.js?v=126';

// ── Entry point ───────────────────────────────────────────────

export async function render(profile) {
  S.profile    = profile;
  S.admin      = isAdmin();
  S.manager    = isManager();
  S.canApprove = S.admin || S.manager;
  const _hl_saved = (() => { try { return JSON.parse(sessionStorage.getItem('hl_tab_state') || '{}'); } catch { return {}; } })();
  S.mainTab        = _hl_saved.mainTab     || 'holidays';
  S.myLeaveTab     = _hl_saved.myLeaveTab  || 'leave';
  S.teamTab        = _hl_saved.teamTab     || 'teamleave';
  S.holView        = _hl_saved.holView     || 'calendar';
  S.flexSubTab     = _hl_saved.flexSubTab  || 'swap';
  S.showPastLeave  = false;
  S.showPastFlex   = false;
  S.approvalSubTab = _hl_saved.approvalSubTab || 'pending';
  if (!S.canApprove && S.mainTab === 'teamleave') S.mainTab = 'holidays';

  // Schedule range defaults; history defaults to empty (show all)
  const _today  = todayISO();
  const _plus30 = toISODate(new Date(Date.now() + 30 * 86400000));
  S.scheduleFrom = _today;
  S.scheduleTo   = _plus30;
  S.historyFrom  = '';
  S.historyTo    = '';

  document.getElementById('topbar-left').innerHTML = `<span class="topbar-title">Leave & Holidays</span>`;
  document.getElementById('content').innerHTML = `
    <div class="tabs" id="hl-main-tabs" style="margin-bottom:0;">
      <button class="tab-btn active" data-main="holidays">HOLIDAYS</button>
      <button class="tab-btn" data-main="myleave">MY LEAVE</button>
      ${S.canApprove ? `<button class="tab-btn" data-main="teamleave">TEAM LEAVE<span class="badge badge-pending" id="main-badge-teamleave" style="margin-left:4px;display:none;"></span></button>` : ''}
      <button class="tab-btn" data-main="policy">POLICY</button>
    </div>
    <div id="hl-content" style="padding:24px 0 0;">
      <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
    </div>
  `;

  document.querySelectorAll('#hl-main-tabs .tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.main === S.mainTab));

  document.querySelectorAll('#hl-main-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#hl-main-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.mainTab = btn.dataset.main;
      if (S.mainTab === 'myleave') _dismissLeaveNotifications();
      _saveHlTabState();
      _renderTab();
    });
  });

  try {
    S.leaveTypes = await getLeaveTypes();

    if (S.admin) {
      [S.holidays, S.employees] = await Promise.all([
        getPublicHolidays(S.year),
        getEmployees(),
      ]);
      [S.requests, S.flexSwaps, S.balances] = await Promise.all([
        getAllLeaveRequests(),
        getAllFlexSwaps(),
        getAllLeaveBalances(S.year),
      ]);
      // Admin's own employee record (needed for MY LEAVE / FLEX SWAP personal submit)
      const { data: myEmpData } = await supabase
        .from('employees').select('id, full_name, employee_id, gender')
        .eq('user_id', profile.id).maybeSingle();
      S.myEmployee = myEmpData || null;
    } else if (S.manager) {
      S.holidays = await getPublicHolidays(S.year);
      const { data: empData } = await supabase
        .from('employees')
        .select('id, full_name, employee_id, gender')
        .eq('user_id', profile.id)
        .maybeSingle();
      S.myEmployee = empData || null;
      if (S.myEmployee) {
        [S.employees, S.requests, S.flexSwaps, S.balances] = await Promise.all([
          getEmployees(),
          getAllLeaveRequests(),
          getAllFlexSwaps(),
          getAllLeaveBalances(S.year),
        ]);
      }
    } else {
      S.holidays = await getPublicHolidays(S.year);
      const { data: empData } = await supabase
        .from('employees')
        .select('id, full_name, employee_id, gender')
        .eq('user_id', profile.id)
        .maybeSingle();
      S.myEmployee = empData || null;
      if (S.myEmployee) {
        [S.balances, S.requests, S.flexSwaps] = await Promise.all([
          getLeaveBalances(S.myEmployee.id, S.year),
          getMyLeaveRequests(S.myEmployee.id),
          getMyFlexSwaps(S.myEmployee.id),
        ]);
      }
    }
  } catch (err) {
    window.showToast?.(err.message, 'error');
  }

  _renderTab();
  if (S.canApprove) _syncLeaveBadges();   // seed main-tab badge after data loads
}

// ── Tab router ────────────────────────────────────────────────

function _renderTab() {
  const wrap = document.getElementById('hl-content');
  if (!wrap) return;
  if      (S.mainTab === 'holidays')  renderHolidays(wrap, _saveHlTabState);
  else if (S.mainTab === 'myleave')   _renderMyLeaveHub(wrap);
  else if (S.mainTab === 'teamleave') _renderTeamLeaveHub(wrap);
  else if (S.mainTab === 'policy')    _renderPolicy(wrap);
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
      ${tabs.map(t => `<button class="tab-btn${S.myLeaveTab === t.key ? ' active' : ''}" data-my="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div id="hl-my-content" style="padding:24px 0 0;"></div>
  `;
  document.querySelectorAll('#hl-my-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#hl-my-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.myLeaveTab = btn.dataset.my;
      if (S.myLeaveTab === 'leave') _dismissLeaveNotifications();
      _saveHlTabState();
      _renderMyLeaveContent();
    });
  });
  _renderMyLeaveContent();
}

function _renderMyLeaveContent() {
  const inner = document.getElementById('hl-my-content');
  if (!inner) return;
  if      (S.myLeaveTab === 'leave')   renderMyLeave(inner);
  else if (S.myLeaveTab === 'flex')    renderFlex(inner, _saveHlTabState);
  else if (S.myLeaveTab === 'balance') renderBalances(inner);
}

// ── TEAM LEAVE hub ─────────────────────────────────────────────

function _renderTeamLeaveHub(wrap) {
  const pendingLeave = _approvalRequests().filter(r => r.status === 'pending').length;
  const pendingFlex  = _approvalFlexSwaps().filter(s => s.status === 'pending').length;
  const pendingTotal = pendingLeave + pendingFlex;
  const _badge = (n, key) => ` <span class="badge badge-pending" id="hub-badge-${key}" style="margin-left:4px;${n > 0 ? '' : 'display:none;'}">${n}</span>`;

  const tabs = [
    { key: 'teamleave',   label: 'Leave Request', badge: _badge(pendingLeave, 'teamleave')  },
    { key: 'teamflex',    label: 'Flex Request',  badge: _badge(pendingFlex,  'teamflex')   },
    { key: 'approvals',   label: 'Approvals',     badge: _badge(pendingTotal, 'approvals')  },
    { key: 'teambalance', label: 'Team Balance',  badge: ''                                 },
  ];
  wrap.innerHTML = `
    <div class="tabs tabs-secondary" id="hl-team-tabs" style="margin-bottom:0;">
      ${tabs.map(t => `<button class="tab-btn${S.teamTab === t.key ? ' active' : ''}" data-team="${t.key}">${t.label}${t.badge}</button>`).join('')}
    </div>
    <div id="hl-team-content" style="padding:24px 0 0;"></div>
  `;
  document.querySelectorAll('#hl-team-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#hl-team-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.teamTab = btn.dataset.team;
      _saveHlTabState();
      _renderTeamContent();
    });
  });
  _renderTeamContent();
}

function _renderTeamContent() {
  const inner = document.getElementById('hl-team-content');
  if (!inner) return;
  if      (S.teamTab === 'teamleave')   renderTeamLeave(inner);
  else if (S.teamTab === 'teamflex')    renderTeamFlex(inner);
  else if (S.teamTab === 'approvals')   renderApprovals(inner, { syncBadges: _syncLeaveBadges, approvalRequests: _approvalRequests, approvalFlexSwaps: _approvalFlexSwaps, saveTabState: _saveHlTabState });
  else if (S.teamTab === 'teambalance') renderTeamBalance(inner);
}

// ── Tab: Policy ────────────────────────────────────────────────

const _POLICY_NOTES = {
  annual_leave:    'Paid. Use for planned vacation or personal time.',
  personal_leave:  'Paid. For personal errands or matters not covered by other categories.',
  sick_leave:      'Paid, per the Thai Labor Protection Act. A medical certificate is required for any absence of three or more consecutive working days.',
  maternity_leave: 'Paid portion per the Thai Labor Protection Act. Notify your manager and HR as early as possible.',
};

function _renderPolicy(wrap) {
  const entitlements = S.leaveTypes
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

// ── Approval filter helpers ───────────────────────────────────

// Requests visible in APPROVALS (exclude manager's own — those are in MY LEAVE)
function _approvalRequests() {
  if (S.admin) return S.requests;
  if (S.manager && S.myEmployee) return S.requests.filter(r => r.employee_id !== S.myEmployee.id);
  return [];
}

function _approvalFlexSwaps() {
  if (S.admin) return S.flexSwaps;
  if (S.manager && S.myEmployee) return S.flexSwaps.filter(s => s.employee_id !== S.myEmployee.id);
  return [];
}

// ── Badge helpers ─────────────────────────────────────────────

function _setBadgeEl(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = n;
  el.style.display = n > 0 ? '' : 'none';
}

function _saveHlTabState() {
  sessionStorage.setItem('hl_tab_state', JSON.stringify({
    mainTab: S.mainTab, myLeaveTab: S.myLeaveTab,
    teamTab: S.teamTab, approvalSubTab: S.approvalSubTab,
    holView: S.holView, flexSubTab: S.flexSubTab,
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
  if (!S.myEmployee) return;
  for (const r of S.requests) {
    if (r.employee_id !== S.myEmployee.id) continue;
    if (r.status === 'approved' || r.status === 'rejected') {
      localStorage.setItem(`lr_seen_${r.id}`, '1');
    }
  }
  window.refreshLeaveBadge?.();
}
