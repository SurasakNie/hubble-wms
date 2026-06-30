// js/pages/requests.js — Notifications: own leave requests for all users, + admin request queues

import { isAdmin } from '../auth.js';
import { logAction } from '../api/auditLog.js';
import { confirmModal, promptModal } from '../components/confirmModal.js';
import { supabase } from '../config.js';
import {
  getPendingJobTitleChangeRequests,
  approveJobTitleChangeRequest,
  rejectJobTitleChangeRequest,
  cancelJobTitleChangeRequest,
} from '../api/jobTitleRequests.js';
import { cancelNameChangeRequest, cancelDeletionRequest, reviewNameChangeRequest } from '../api/users.js';
import { esc, attr } from '../format.js';

const _fmt  = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function _isRecent(row) {
  const stamp = row.reviewed_at || row.manager_approved_at || row.updated_at || row.created_at;
  return stamp && (Date.now() - new Date(stamp).getTime()) < THREE_DAYS_MS;
}

function _isDismissed(id) {
  return !!localStorage.getItem('notif_dismissed_' + id);
}

function _notificationCards(items, typeLabel, statusBadgeFn) {
  if (!items.length) return '';
  const visible = items.filter(r => _isRecent(r) && !_isDismissed(r.id) && (r.status === 'approved' || r.status === 'rejected'));
  if (!visible.length) return '';
  return visible.map(r => {
    const badgeCls = r.status === 'approved' ? 'badge badge-approved' : 'badge badge-rejected';
    const detail   = r.status === 'rejected' ? (esc(r.rejection_reason || r.manager_notes || r.review_note || '—')) : '';
    return `<div class="notif-card" data-notif-id="${attr(r.id)}"
        style="background:var(--surface-2);border:1px solid var(--border-color);border-radius:8px;
               padding:12px 14px;display:flex;flex-direction:column;gap:4px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span><strong>${esc(typeLabel)}</strong> — <span class="${badgeCls}">${r.status}</span></span>
        <button class="notif-dismiss" data-nid="${attr(r.id)}"
          style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;line-height:1;padding:2px 4px;align-self:flex-start;"
          title="Dismiss">✕</button>
      </div>
      ${detail ? `<div style="font-size:12px;color:var(--text-muted);">Reason: ${detail}</div>` : ''}
    </div>`;
  }).join('');
}

// Build the "RECENT NOTIFICATIONS" block (own approved/rejected requests).
// Used by BOTH the regular-user view and the admin view so admins get the
// same dismissable ✕ cards as everyone else.
function _buildNotifBlock(ownNotifs) {
  const n = ownNotifs || {};
  const cards =
    _notificationCards(n.leaveReqs || [], 'Leave Request') +
    _notificationCards(n.flexReqs  || [], 'Flex / WFH') +
    _notificationCards(n.ncrReqs   || [], 'Name Change') +
    _notificationCards(n.jtcrReqs  || [], 'Job Title Change');
  if (!cards) return '';
  return `
    <div style="margin-bottom:32px;">
      <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
        RECENT NOTIFICATIONS
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;" id="notif-cards-area">
        ${cards}
      </div>
    </div>`;
}

function _wireDismiss() {
  document.querySelectorAll('.notif-dismiss').forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.setItem('notif_dismissed_' + btn.dataset.nid, '1');
      btn.closest('.notif-card')?.remove();
      const area = document.getElementById('notif-cards-area');
      if (area && !area.children.length) area.closest('div[style*="margin-bottom:32px"]')?.remove();
    });
  });
}

let _profile       = null;
let _myEmployee    = null;
let _adminTab      = 'deletion';  // 'deletion' | 'profile' | 'leave' — admin Notifications tabs
let _profileSubTab = 'name';      // 'name' | 'jobtitle' — sub-tabs inside PROFILE CHANGES panel

export async function render(profile) {
  _profile = profile;

  document.getElementById('topbar-left').innerHTML = `<span class="topbar-title">Notifications</span>`;

  document.getElementById('content').innerHTML = `
    <div class="empty-state"><div class="empty-state-title">Loading…</div></div>`;

  await _load();
}

async function _load() {
  try {
    if (isAdmin()) {
      // Admin's own employee record — used to surface the admin's personal
      // approved/rejected notification cards (same as regular users see).
      const { data: ownEmp } = await supabase.from('employees')
        .select('id, full_name, employee_id')
        .eq('user_id', _profile.id)
        .maybeSingle();
      _myEmployee = ownEmp || null;

      const [
        { data: delReqs, error: e1 },
        { data: ncrReqs, error: e2 },
        { data: leaveReqs },
        jtcReqs,
        { data: ownFlex },
        { data: ownNcr },
        { data: ownJtcr },
      ] = await Promise.all([
        supabase.from('deletion_requests')
          .select('*, requester:profiles!deletion_requests_requested_by_fkey(id, name, email)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase.from('name_change_requests')
          .select('*, requester:profiles!name_change_requests_requested_by_fkey(id, name, email)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase.from('leave_requests')
          .select(`id, employee_id, leave_type_code, start_date, end_date,
                   granularity, duration_hours, status, rejection_reason, created_at,
                   employee:employees!leave_requests_employee_id_fkey(id, full_name, employee_id),
                   leave_type:leave_types!leave_requests_leave_type_code_fkey(label)`)
          .order('created_at', { ascending: false })
          .limit(200),
        getPendingJobTitleChangeRequests().catch(() => []),
        _myEmployee
          ? supabase.from('flex_holiday_swaps')
              .select('id, status, swap_type, substitute_date, valid_from, manager_notes, manager_approved_at, updated_at, created_at')
              .eq('employee_id', _myEmployee.id)
              .in('status', ['approved', 'rejected'])
              .order('created_at', { ascending: false })
              .limit(50)
          : Promise.resolve({ data: [] }),
        supabase.from('name_change_requests')
          .select('id, status, requested_name, review_note, reviewed_at, created_at')
          .eq('requested_by', _profile.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('job_title_change_requests')
          .select('id, status, requested_title, review_note, reviewed_at, created_at')
          .eq('requested_by', _profile.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const clientIds  = (delReqs || []).filter(r => r.entity_type === 'client').map(r => r.entity_id);
      const projectIds = (delReqs || []).filter(r => r.entity_type === 'project').map(r => r.entity_id);
      const [{ data: clients }, { data: projects }] = await Promise.all([
        clientIds.length  ? supabase.from('clients').select('id, name').in('id', clientIds)   : { data: [] },
        projectIds.length ? supabase.from('projects').select('id, name').in('id', projectIds) : { data: [] },
      ]);
      const entityMap = {};
      [...(clients || []), ...(projects || [])].forEach(e => { entityMap[e.id] = e.name; });

      // Admin's own approved/rejected leave (filtered from the full queue)
      const ownLeave = _myEmployee
        ? (leaveReqs || []).filter(r => r.employee_id === _myEmployee.id)
        : [];

      _render(delReqs || [], ncrReqs || [], entityMap, leaveReqs || [], jtcReqs || [], false, {
        leaveReqs:       ownLeave,
        flexReqs:        ownFlex || [],
        ncrReqs:         (ownNcr || []).filter(r => r.status !== 'pending'),
        jtcrReqs:        (ownJtcr || []).filter(r => r.status !== 'pending'),
        pendingNcrReqs:  (ownNcr || []).filter(r => r.status === 'pending'),
        pendingJtcrReqs: (ownJtcr || []).filter(r => r.status === 'pending'),
      });
    } else {
      // Non-admin: fetch own employee + own leave requests
      const { data: emp } = await supabase.from('employees')
        .select('id, full_name, employee_id')
        .eq('user_id', _profile.id)
        .maybeSingle();
      _myEmployee = emp || null;

      if (!_myEmployee) {
        document.getElementById('content').innerHTML = `
          <div class="empty-state">
            <div class="empty-state-title">No employee record</div>
            <div class="empty-state-subtitle">Your account is not linked to an employee record yet.</div>
          </div>`;
        return;
      }

      const [{ data: leaveReqs }, { data: flexReqs }, { data: myNcrReqs }, { data: myJtcrReqs }] = await Promise.all([
        supabase.from('leave_requests')
          .select(`id, employee_id, leave_type_code, start_date, end_date,
                   granularity, duration_hours, status, rejection_reason, created_at, updated_at,
                   employee:employees!leave_requests_employee_id_fkey(id, full_name, employee_id),
                   leave_type:leave_types!leave_requests_leave_type_code_fkey(label)`)
          .eq('employee_id', _myEmployee.id)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('flex_holiday_swaps')
          .select('id, status, swap_type, substitute_date, valid_from, manager_notes, manager_approved_at, updated_at, created_at')
          .eq('employee_id', _myEmployee.id)
          .in('status', ['approved', 'rejected'])
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('name_change_requests')
          .select('id, status, requested_name, review_note, reviewed_at, created_at')
          .eq('requested_by', _profile.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('job_title_change_requests')
          .select('id, status, requested_title, review_note, reviewed_at, created_at')
          .eq('requested_by', _profile.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      _render([], [], {}, leaveReqs || [], [], true, {
        leaveReqs:       leaveReqs || [],
        flexReqs:        flexReqs || [],
        ncrReqs:         (myNcrReqs || []).filter(r => r.status !== 'pending'),
        jtcrReqs:        (myJtcrReqs || []).filter(r => r.status !== 'pending'),
        pendingNcrReqs:  (myNcrReqs || []).filter(r => r.status === 'pending'),
        pendingJtcrReqs: (myJtcrReqs || []).filter(r => r.status === 'pending'),
      });
    }
  } catch (err) {
    window.showToast?.(err.message, 'error');
    document.getElementById('content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Failed to load</div>
        <div class="empty-state-subtitle">${esc(err.message)}</div>
      </div>`;
  }
}

const _leaveStatusBadge = s => {
  if (s === 'approved')  return 'badge badge-approved';
  if (s === 'rejected')  return 'badge badge-rejected';
  if (s === 'pending')   return 'badge badge-pending';
  return 'badge';
};

function _leaveTable(rows) {
  if (!rows.length) return `<div style="color:var(--text-muted);padding:8px 0;">No leave requests found.</div>`;
  return `<div style="overflow-x:auto;">
    <table class="data-table">
      <thead><tr>
        <th>Date</th><th>Employee</th><th>Leave Type</th><th>From</th><th>To</th><th>Duration</th><th>Status</th><th>Reason</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td style="white-space:nowrap;">${_fmt(r.created_at)}</td>
          <td>${esc(r.employee?.full_name || '—')}</td>
          <td>${esc(r.leave_type?.label || r.leave_type_code || '—')}</td>
          <td style="white-space:nowrap;">${_fmt(r.start_date)}</td>
          <td style="white-space:nowrap;">${_fmt(r.end_date)}</td>
          <td>${r.duration_hours ? r.duration_hours + 'h' : (r.granularity || '').replace('_', ' ')}</td>
          <td><span class="${_leaveStatusBadge(r.status)}">${r.status}</span></td>
          <td style="font-size:12px;color:var(--text-muted);">${r.status === 'rejected' ? esc(r.rejection_reason || '—') : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

function _render(delReqs, ncrReqs, entityMap, leaveReqs, jtcReqs, ownOnly, ownNotifs) {
  if (ownOnly) {
    const pendingNcr  = ownNotifs?.pendingNcrReqs  || [];
    const pendingJtcr = ownNotifs?.pendingJtcrReqs || [];
    document.getElementById('content').innerHTML = `
      <div style="max-width:960px;">
        ${(pendingNcr.length + pendingJtcr.length) > 0 ? `
        <div style="margin-bottom:24px;">
          <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
            MY PENDING REQUESTS
            <span class="badge badge-pending" style="margin-left:8px;">${pendingNcr.length + pendingJtcr.length}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${[...pendingNcr.map(r => ({...r, _type:'ncr', _label:'Name Change', _detail: r.requested_name})),
               ...pendingJtcr.map(r => ({...r, _type:'jtcr', _label:'Job Title Change', _detail: r.requested_title}))]
            .map(r => `
              <div style="background:var(--surface-2);border:1px solid var(--border-color);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <span class="badge badge-pending">Pending</span>
                <span style="font-weight:500">${esc(r._label)}</span>
                <span class="text-muted" style="font-size:13px;">→ ${esc(r._detail)}</span>
                <span style="margin-left:auto;font-size:11px;color:var(--text-muted);">${_fmt(r.created_at)}</span>
                <button class="btn btn-sm btn-ghost rq-cancel-pending" data-type="${attr(r._type)}" data-id="${attr(r.id)}">Cancel</button>
              </div>`).join('')}
          </div>
        </div>` : ''}
        ${_buildNotifBlock(ownNotifs)}
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
          MY LEAVE REQUESTS
          <span class="badge" style="margin-left:8px;">${leaveReqs.length}</span>
        </div>
        ${_leaveTable(leaveReqs)}
      </div>`;

    _wireDismiss();
    document.querySelectorAll('.rq-cancel-pending').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          if (btn.dataset.type === 'ncr')  await cancelNameChangeRequest(btn.dataset.id);
          if (btn.dataset.type === 'jtcr') await cancelJobTitleChangeRequest(btn.dataset.id);
          window.showToast?.('Request cancelled.', 'success');
          _load();
        } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
      });
    });
    return;
  }

  const pendingNcr  = ownNotifs?.pendingNcrReqs  || [];
  const pendingJtcr = ownNotifs?.pendingJtcrReqs || [];
  document.getElementById('content').innerHTML = `
    <div style="max-width:960px;">

      ${(pendingNcr.length + pendingJtcr.length) > 0 ? `
      <div style="margin-bottom:24px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:12px;">
          MY PENDING REQUESTS
          <span class="badge badge-pending" style="margin-left:8px;">${pendingNcr.length + pendingJtcr.length}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${[...pendingNcr.map(r => ({...r, _type:'ncr', _label:'Name Change', _detail: r.requested_name})),
             ...pendingJtcr.map(r => ({...r, _type:'jtcr', _label:'Job Title Change', _detail: r.requested_title}))]
          .map(r => `
            <div style="background:var(--surface-2);border:1px solid var(--border-color);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <span class="badge badge-pending">Pending</span>
              <span style="font-weight:500">${esc(r._label)}</span>
              <span class="text-muted" style="font-size:13px;">→ ${esc(r._detail)}</span>
              <span style="margin-left:auto;font-size:11px;color:var(--text-muted);">${_fmt(r.created_at)}</span>
              <button class="btn btn-sm btn-ghost rq-cancel-pending" data-type="${attr(r._type)}" data-id="${attr(r.id)}">Cancel</button>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${_buildNotifBlock(ownNotifs)}

      <div class="tabs">
        <button class="tab-btn${_adminTab === 'deletion' ? ' active' : ''}" data-atab="deletion">DELETION${delReqs.length ? ` <span class="badge badge-pending" style="margin-left:4px;">${delReqs.length}</span>` : ''}</button>
        <button class="tab-btn${_adminTab === 'profile' ? ' active' : ''}" data-atab="profile">PROFILE CHANGES${(ncrReqs.length + jtcReqs.length) ? ` <span class="badge badge-pending" style="margin-left:4px;">${ncrReqs.length + jtcReqs.length}</span>` : ''}</button>
        <button class="tab-btn${_adminTab === 'leave' ? ' active' : ''}" data-atab="leave">LEAVE REQUESTS${leaveReqs.filter(r => r.status === 'pending').length ? ` <span class="badge badge-pending" style="margin-left:4px;">${leaveReqs.filter(r => r.status === 'pending').length}</span>` : ''}</button>
      </div>

      <div class="tab-panel${_adminTab === 'deletion' ? ' active' : ''}" data-apanel="deletion">
        ${delReqs.length === 0
          ? `<div style="color:var(--text-muted);padding:8px 0;">No pending deletion requests.</div>`
          : `<table class="data-table">
              <thead><tr><th>Date</th><th>Requested by</th><th>Entity</th><th>Reason</th><th></th></tr></thead>
              <tbody>
                ${delReqs.map(r => {
                  const entityName = entityMap[r.entity_id] || r.entity_id;
                  return `<tr>
                    <td style="white-space:nowrap;">${_fmt(r.created_at)}</td>
                    <td>${esc(r.requester?.name || r.requester?.email || '—')}</td>
                    <td>
                      <span style="font-size:11px;text-transform:uppercase;color:var(--text-muted);">${esc(r.entity_type)}</span><br>
                      <strong>${esc(entityName)}</strong>
                    </td>
                    <td style="max-width:200px;word-break:break-word;">${esc(r.reason || '—')}</td>
                    <td style="white-space:nowrap;">
                      <button class="btn btn-sm" style="color:#e53935;border-color:#e53935;"
                        data-del-approve="${attr(r.id)}"
                        data-entity-type="${attr(r.entity_type)}"
                        data-entity-id="${attr(r.entity_id)}"
                        data-entity-name="${attr(entityName)}">Approve &amp; Delete</button>
                      <button class="btn btn-sm" data-del-reject="${attr(r.id)}" style="margin-left:6px;">Reject</button>
                      <button class="btn btn-sm btn-ghost del-cancel-btn" data-id="${attr(r.id)}" style="margin-left:6px;">Cancel</button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`}
      </div>

      <div class="tab-panel${_adminTab === 'profile' ? ' active' : ''}" data-apanel="profile">
        <div class="tabs" id="rq-profile-subtabs" style="margin-bottom:16px;">
          <button class="tab-btn${_profileSubTab === 'name' ? ' active' : ''}" data-psub="name">
            NAME CHANGES${ncrReqs.length > 0 ? ` <span class="badge badge-pending" style="margin-left:4px;">${ncrReqs.length}</span>` : ''}
          </button>
          <button class="tab-btn${_profileSubTab === 'jobtitle' ? ' active' : ''}" data-psub="jobtitle">
            JOB TITLE CHANGES${jtcReqs.length > 0 ? ` <span class="badge badge-pending" style="margin-left:4px;">${jtcReqs.length}</span>` : ''}
          </button>
        </div>
        <div id="rq-profile-subpanel-name"${_profileSubTab !== 'name' ? ' style="display:none"' : ''}>
          ${ncrReqs.length === 0
            ? `<div style="color:var(--text-muted);padding:8px 0;">No pending name change requests.</div>`
            : `<table class="data-table">
                <thead><tr><th>Date</th><th>Requested by</th><th>Requested name</th><th>Reason</th><th></th></tr></thead>
                <tbody>
                  ${ncrReqs.map(r => `<tr>
                    <td style="white-space:nowrap;">${_fmt(r.created_at)}</td>
                    <td>${esc(r.requester?.name || r.requester?.email || '—')}</td>
                    <td><strong>${esc(r.requested_name)}</strong></td>
                    <td style="max-width:200px;word-break:break-word;">${esc(r.reason || '—')}</td>
                    <td style="white-space:nowrap;">
                      <button class="btn btn-sm btn-primary"
                        data-ncr-approve="${attr(r.id)}"
                        data-ncr-uid="${attr(r.requested_by)}"
                        data-ncr-name="${attr(r.requested_name)}">Approve</button>
                      <button class="btn btn-sm" data-ncr-reject="${attr(r.id)}" style="margin-left:6px;">Reject</button>
                    </td>
                  </tr>`).join('')}
                </tbody>
              </table>`}
        </div>
        <div id="rq-profile-subpanel-jobtitle"${_profileSubTab !== 'jobtitle' ? ' style="display:none"' : ''}>
          ${jtcReqs.length === 0
            ? `<div style="color:var(--text-muted);padding:8px 0;">No pending job title change requests.</div>`
            : `<table class="data-table">
                <thead><tr><th>Date</th><th>Employee</th><th>Current title</th><th>Requested title</th><th>Reason</th><th></th></tr></thead>
                <tbody>
                  ${jtcReqs.map(r => `<tr>
                    <td style="white-space:nowrap;">${_fmt(r.created_at)}</td>
                    <td>${esc(r.employee?.full_name || r.requester?.name || '—')}</td>
                    <td>${esc(r.current_title || '—')}</td>
                    <td><strong>${esc(r.requested_title)}</strong></td>
                    <td style="max-width:200px;word-break:break-word;">${esc(r.reason || '—')}</td>
                    <td style="white-space:nowrap;">
                      <button class="btn btn-sm btn-primary"
                        data-jtcr-approve="${attr(r.id)}">Approve</button>
                      <button class="btn btn-sm" data-jtcr-reject="${attr(r.id)}" style="margin-left:6px;">Reject</button>
                    </td>
                  </tr>`).join('')}
                </tbody>
              </table>`}
        </div>
      </div>

      <div class="tab-panel${_adminTab === 'leave' ? ' active' : ''}" data-apanel="leave">
        ${_leaveTable(leaveReqs)}
      </div>

    </div>
  `;

  // Tab switching — toggle panels; the action handlers below stay wired
  document.querySelectorAll('[data-atab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _adminTab = btn.dataset.atab;
      document.querySelectorAll('[data-atab]').forEach(b => b.classList.toggle('active', b.dataset.atab === _adminTab));
      document.querySelectorAll('[data-apanel]').forEach(p => p.classList.toggle('active', p.dataset.apanel === _adminTab));
    });
  });

  // Profile sub-tab switching (NAME CHANGES | JOB TITLE CHANGES)
  document.querySelectorAll('[data-psub]').forEach(btn => {
    btn.addEventListener('click', () => {
      _profileSubTab = btn.dataset.psub;
      document.querySelectorAll('[data-psub]').forEach(b => b.classList.toggle('active', b.dataset.psub === _profileSubTab));
      document.getElementById('rq-profile-subpanel-name').style.display     = _profileSubTab === 'name'     ? '' : 'none';
      document.getElementById('rq-profile-subpanel-jobtitle').style.display = _profileSubTab === 'jobtitle' ? '' : 'none';
    });
  });

  // Deletion: approve (delete entity + mark approved)
  document.querySelectorAll('[data-del-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id         = btn.dataset.delApprove;
      const entityType = btn.dataset.entityType;
      const entityName = btn.dataset.entityName;
      if (!await confirmModal({ title: 'Delete', message: `Permanently delete ${entityType} "${entityName}"? This cannot be undone.`, confirmText: 'Delete', danger: true })) return;
      btn.disabled = true; btn.textContent = '…';
      try {
        // Atomic RPC deletes the entity AND marks the request approved in one
        // transaction — no orphaned "entity gone but request still pending" state.
        const { error } = await supabase.rpc('approve_deletion_request', { p_request_id: id });
        if (error) throw error;
        window.showToast?.(`${entityType} "${entityName}" deleted`, 'success');
        logAction('approve_deletion_request', 'deletion_request', id, entityName, { status: { old: 'pending', new: 'approved' } });
        await _refreshBadge();
        await _load();
      } catch (err) {
        window.showToast?.(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Approve & Delete';
      }
    });
  });

  // Deletion: reject
  document.querySelectorAll('[data-del-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delReject;
      const note = await promptModal({ title: 'Rejection reason', placeholder: 'Optional', confirmText: 'Reject' });
      if (note === null) return;
      btn.disabled = true;
      try {
        const { error } = await supabase.from('deletion_requests')
          .update({ status: 'rejected', reviewed_by: _profile.id, review_note: note || null, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        window.showToast?.('Deletion request rejected', 'success');
        const _dr = delReqs.find(r => r.id === id);
        const _drName = _dr ? (entityMap[_dr.entity_id] || _dr.entity_id) : null;
        logAction('reject_deletion_request', 'deletion_request', id, _drName, { status: { old: 'pending', new: 'rejected' }, reason: note || null });
        await _refreshBadge();
        await _load();
      } catch (err) {
        window.showToast?.(err.message, 'error');
        btn.disabled = false;
      }
    });
  });

  // Name change: approve
  document.querySelectorAll('[data-ncr-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id      = btn.dataset.ncrApprove;
      const newName = btn.dataset.ncrName;
      btn.disabled = true; btn.textContent = '…';
      try {
        // Atomic RPC updates profile name + employees.full_name + status together.
        await reviewNameChangeRequest(id, true);
        window.showToast?.(`Name updated to "${newName}"`, 'success');
        logAction('approve_name_change', 'name_change', id, newName, { status: { old: 'pending', new: 'approved' }, new_name: newName });
        await _refreshBadge();
        await _load();
      } catch (err) {
        window.showToast?.(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Approve';
      }
    });
  });

  // Name change: reject
  document.querySelectorAll('[data-ncr-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.ncrReject;
      const note = await promptModal({ title: 'Rejection reason', placeholder: 'Optional', confirmText: 'Reject' });
      if (note === null) return;
      btn.disabled = true;
      try {
        const { error } = await supabase.from('name_change_requests')
          .update({ status: 'rejected', reviewed_by: _profile.id, review_note: note || null, reviewed_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        window.showToast?.('Name change rejected', 'success');
        const _ncr = ncrReqs.find(r => r.id === id);
        logAction('reject_name_change', 'name_change', id, _ncr?.requester?.name || null, { status: { old: 'pending', new: 'rejected' }, reason: note || null });
        await _refreshBadge();
        await _load();
      } catch (err) {
        window.showToast?.(err.message, 'error');
        btn.disabled = false;
      }
    });
  });

  // Job title change: approve
  document.querySelectorAll('[data-jtcr-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.jtcrApprove;
      btn.disabled = true; btn.textContent = '…';
      try {
        await approveJobTitleChangeRequest(id, _profile.id);
        window.showToast?.('Job title updated', 'success');
        const _jtcr = jtcReqs.find(r => r.id === id);
        logAction('approve_job_title_change', 'job_title_change', id, _jtcr?.employee?.full_name || _jtcr?.requester?.name || null, { status: { old: 'pending', new: 'approved' }, new_title: _jtcr?.requested_title || null });
        await _refreshBadge();
        await _load();
      } catch (err) {
        window.showToast?.(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Approve';
      }
    });
  });

  // Job title change: reject
  document.querySelectorAll('[data-jtcr-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.jtcrReject;
      const note = await promptModal({ title: 'Rejection reason', placeholder: 'Optional', confirmText: 'Reject' });
      if (note === null) return;
      btn.disabled = true;
      try {
        await rejectJobTitleChangeRequest(id, _profile.id, note);
        window.showToast?.('Job title request rejected', 'success');
        const _rjtcr = jtcReqs.find(r => r.id === id);
        logAction('reject_job_title_change', 'job_title_change', id, _rjtcr?.employee?.full_name || _rjtcr?.requester?.name || null, { status: { old: 'pending', new: 'rejected' }, reason: note || null });
        await _refreshBadge();
        await _load();
      } catch (err) {
        window.showToast?.(err.message, 'error');
        btn.disabled = false;
      }
    });
  });

  // MY PENDING REQUESTS cancel (admin view — own requests only)
  document.querySelectorAll('.rq-cancel-pending').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        if (btn.dataset.type === 'ncr')  await cancelNameChangeRequest(btn.dataset.id);
        if (btn.dataset.type === 'jtcr') await cancelJobTitleChangeRequest(btn.dataset.id);
        window.showToast?.('Request cancelled.', 'success');
        _load();
      } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
    });
  });

  // Deletion: cancel (admin withdraws the request from the queue)
  document.querySelectorAll('.del-cancel-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await cancelDeletionRequest(btn.dataset.id);
        window.showToast?.('Deletion request cancelled.', 'success');
        await _refreshBadge();
        await _load();
      } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
    });
  });

  // Dismiss ✕ on the admin's own RECENT NOTIFICATIONS cards
  _wireDismiss();
}

async function _refreshBadge() {
  const [{ count: delCount }, { count: ncrCount }, { count: jtcrCount }] = await Promise.all([
    supabase.from('deletion_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('name_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('job_title_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  const total = (delCount || 0) + (ncrCount || 0) + (jtcrCount || 0);
  const badge = document.getElementById('badge-requests');
  if (badge) {
    badge.textContent = total;
    badge.classList.toggle('hidden', total === 0);
  }
  window.refreshShowMoreBadge?.();
}
