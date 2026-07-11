// pages/team.js — Team members + groups + reminders
// Spec §3.7 + §4.1 / plan-draft "Team (#team)":
//   Tabs [ MEMBERS | GROUPS | REMINDERS ] · admin-only ADD NEW MEMBER
//   Members: filter bar + table (NAME / EMAIL / BILLABLE RATE / ROLE / GROUP / ⋮)
//   Billable rate masked for non-admins (column absent from API for those roles).
//   Inline role + group management (admin/owner). Row click → Edit Profile modal.

import {
  getUsers, updateRole, updateBillableRate,
  getGroups, createGroup, deleteGroup, addGroupMember, removeGroupMember, setGroupLeader,
  getPendingNameChangeRequests, reviewNameChangeRequest,
} from '../api/users.js';
import { isAdmin }          from '../auth.js';
import { formatAmount, esc, attr } from '../format.js';
import { supabase }         from '../config.js';

// 'client' is intentionally omitted: client accounts are portal-only (CLIENT-01),
// never listed on this page, and staff must not be convertible to a client from
// the inline role dropdown (clients are provisioned via the Clients page with a
// linked client_id). This drives both the role filter and the inline role select.
const ROLES = ['owner', 'admin', 'manager', 'member'];

let _profile      = null;
let _users        = [];
let _groups       = [];
let _nameRequests = [];   // pending name-change requests (admin only)
let _ncrMap       = {};   // userId → pending name-change request
let _userDeptMap  = {};   // userId → { code, label } — for group member dept filter
let _tab          = 'members';   // 'members' | 'groups' | 'reminders'
let _roleFilter   = 'all';
let _groupFilter  = 'all';
let _search       = '';

// ──────────────────────────────────────────────────────────────
// ENTRY POINT
// ──────────────────────────────────────────────────────────────

export async function render(profile) {
  _profile     = profile;
  _tab         = 'members';
  _roleFilter  = 'all';
  _groupFilter = 'all';
  _search      = '';

  document.getElementById('topbar-left').innerHTML =
    `<span class="topbar-title">Teams</span>`;

  const admin = isAdmin();

  document.getElementById('content').innerHTML = `
    <!-- Tabs -->
    <div class="tabs" id="tm-tabs" style="margin-bottom:0;">
      <button class="tab-btn active" data-tab="members">MEMBERS</button>
      <button class="tab-btn" data-tab="groups">GROUPS</button>
      <button class="tab-btn" data-tab="reminders">REMINDERS</button>
    </div>
    <div style="border-bottom:1px solid var(--border); margin:0 0 var(--sp-4);"></div>

    <!-- Panels -->
    <div class="tab-panel active" id="panel-members"></div>
    <div class="tab-panel" id="panel-groups"></div>
    <div class="tab-panel" id="panel-reminders"></div>
  `;

  _wireTabs();

  // Members panel shell (filter bar + table mount) — built once, table re-renders in place.
  document.getElementById('panel-members').innerHTML = `
    <div class="filter-bar">
      <select id="tm-role-filter">
        <option value="all">All roles</option>
        ${ROLES.map(r => `<option value="${r}">${_cap(r)}</option>`).join('')}
      </select>
      <select id="tm-group-filter">
        <option value="all">All groups</option>
      </select>
      <div class="search-input">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="search" id="tm-search" placeholder="Search name or email…">
      </div>
      ${admin ? `<button class="btn btn-primary" id="tm-add-member" style="margin-left:auto;">ADD NEW MEMBER</button>` : ''}
    </div>
    <div id="tm-members-table">
      <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
    </div>`;

  _wireMembersControls();
  document.getElementById('tm-add-member')?.addEventListener('click', _openAddMemberModal);

  // Load data in parallel (mirrors tracker.js).
  try {
    const loads = [getUsers(admin), getGroups()];
    if (admin) loads.push(getPendingNameChangeRequests());
    const [usersResult, groupsResult, ...rest] = await Promise.all(loads);
    _users        = usersResult  || [];
    _groups       = groupsResult || [];
    _nameRequests = admin ? (rest[0] || []) : [];
  } catch (err) {
    window.showToast?.(err.message, 'error');
    _users = []; _groups = []; _nameRequests = [];
  }

  // Load user→department mapping for group member filter (best-effort)
  _userDeptMap = {};
  try {
    const { data: empRows } = await supabase.from('employees')
      .select('user_id, department_code, department:departments(code, label)')
      .not('user_id', 'is', null);
    (empRows || []).forEach(e => {
      if (e.user_id) _userDeptMap[e.user_id] = e.department || { code: e.department_code, label: e.department_code };
    });
  } catch (_) { /* non-fatal */ }

  // Populate group filter now that groups are loaded.
  document.getElementById('tm-group-filter').innerHTML =
    `<option value="all">All groups</option>` +
    _groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');

  _renderMembersTable();
}

// ──────────────────────────────────────────────────────────────
// TABS
// ──────────────────────────────────────────────────────────────

function _wireTabs() {
  document.querySelectorAll('#tm-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _tab = btn.dataset.tab;
      document.querySelectorAll('#tm-tabs .tab-btn').forEach(b =>
        b.classList.toggle('active', b === btn));
      document.getElementById('panel-members').classList.toggle('active', _tab === 'members');
      document.getElementById('panel-groups').classList.toggle('active', _tab === 'groups');
      document.getElementById('panel-reminders').classList.toggle('active', _tab === 'reminders');

      if (_tab === 'groups')    _renderGroupsPanel();
      if (_tab === 'reminders') _renderRemindersPanel();
    });
  });
}

// ──────────────────────────────────────────────────────────────
// MEMBERS TAB
// ──────────────────────────────────────────────────────────────

function _wireMembersControls() {
  const panel = document.getElementById('panel-members');
  panel.querySelector('#tm-role-filter')?.addEventListener('change', e => {
    _roleFilter = e.target.value; _renderMembersTable();
  });
  panel.querySelector('#tm-group-filter')?.addEventListener('change', e => {
    _groupFilter = e.target.value; _renderMembersTable();
  });
  panel.querySelector('#tm-search')?.addEventListener('input', e => {
    _search = e.target.value.trim().toLowerCase(); _renderMembersTable();
  });
}

/** Build a map: userId → [{id, name}] of groups they belong to. */
function _membershipMap() {
  const map = {};
  for (const g of _groups) {
    for (const m of (g.group_members || [])) {
      (map[m.user_id] ||= []).push({ id: g.id, name: g.name });
    }
  }
  return map;
}

function _filteredUsers(memberships) {
  return _users.filter(u => {
    if (_roleFilter !== 'all' && u.role !== _roleFilter) return false;
    if (_groupFilter !== 'all') {
      const ids = (memberships[u.id] || []).map(g => g.id);
      if (!ids.includes(_groupFilter)) return false;
    }
    if (_search) {
      const hay = `${u.name || ''} ${u.email || ''}`.toLowerCase();
      if (!hay.includes(_search)) return false;
    }
    return true;
  });
}

function _renderMembersTable() {
  const wrap = document.getElementById('tm-members-table');
  if (!wrap) return;

  const admin       = isAdmin();
  const memberships = _membershipMap();
  const rows        = _filteredUsers(memberships);

  // Rebuild ncrMap for this render pass
  _ncrMap = {};
  for (const r of _nameRequests) _ncrMap[r.requested_by] = r;
  // NOTE: spec also lists a "Billable rate" filter; with free-text rates it adds little,
  // so it is intentionally omitted — Role + Group + search cover the practical cases.

  if (rows.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="margin-top:40px">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <div class="empty-state-title">${_search || _roleFilter !== 'all' || _groupFilter !== 'all' ? 'No matching members' : 'No members yet'}</div>
        <div class="empty-state-sub">${_search || _roleFilter !== 'all' || _groupFilter !== 'all' ? 'Try a different filter or search' : 'Members appear here after they sign in with Google'}</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Billable rate</th>
            <th>Role</th>
            <th>Group</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(u => _renderMemberRow(u, admin, memberships[u.id] || [], _ncrMap[u.id] || null)).join('')}
        </tbody>
      </table>
    </div>`;

  _wireMemberRows(wrap, admin);
}

function _renderMemberRow(u, admin, groups, pendingNameReq = null) {
  const isSelf   = u.id === _profile.id;
  const ncrChip  = (admin && pendingNameReq)
    ? ` <span class="badge badge-pending tm-ncr-chip" data-req-id="${attr(pendingNameReq.id)}"
             style="cursor:pointer;font-size:10px;margin-left:4px;vertical-align:middle;"
             title="Review name change request → &quot;${attr(pendingNameReq.requested_name)}&quot;">
         name change ↗
       </span>`
    : '';
  const name     = esc(u.name || '—')
    + (isSelf ? ' <span class="text-muted" style="font-size:var(--font-xs)">(you)</span>' : '')
    + ncrChip;
  const email  = u.email ? esc(u.email) : '<span class="text-muted">—</span>';

  // BILLABLE RATE — column only present in the API payload for admin/owner.
  let rateCell;
  if (!admin) {
    rateCell = '<span class="text-muted">—</span>';
  } else {
    const rateDisp = (u.billable_rate !== null && u.billable_rate !== undefined)
      ? esc(formatAmount(u.billable_rate))
      : '<span class="text-muted">—</span>';
    rateCell = `${rateDisp}
      <a href="#" class="tm-rate-change" data-id="${u.id}"
         style="margin-left:8px; color:var(--accent); font-size:var(--font-xs); text-decoration:none;">Change</a>`;
  }

  // ROLE — inline select for admin (own row disabled), static badge otherwise.
  let roleCell;
  if (admin) {
    roleCell = `<select class="tm-role-select" data-id="${u.id}" ${isSelf ? 'disabled title="You cannot change your own role"' : ''}
                        style="width:auto; min-width:104px; padding:4px 8px; font-size:var(--font-xs);">
        ${ROLES.map(r => `<option value="${r}"${r === u.role ? ' selected' : ''}>${_cap(r)}</option>`).join('')}
      </select>`;
  } else {
    roleCell = `<span class="badge badge-${u.role}">${_cap(u.role)}</span>`;
  }

  // GROUP — current memberships as chips (admin can remove); admin add-to-group select.
  const chips = groups.map(g => {
    const fullGroup = _groups.find(x => x.id === g.id);
    const leader = fullGroup?.leader;
    const leaderHint = leader
      ? ` <span class="text-muted" style="font-size:10px;" title="Team leader">↑ ${esc(leader.name || leader.email)}</span>`
      : '';
    return `
    <span class="tag-chip">${esc(g.name)}${leaderHint}${admin ? `
      <span class="remove-tag tm-group-remove" data-uid="${u.id}" data-gid="${g.id}"
            style="cursor:pointer; margin-left:2px;">×</span>` : ''}</span>`;
  }).join('');

  const addable = _groups.filter(g => !groups.some(gg => gg.id === g.id));
  const groupAdd = admin && addable.length
    ? `<select class="tm-group-add" data-id="${u.id}"
               style="width:auto; min-width:90px; padding:4px 8px; font-size:var(--font-xs);">
         <option value="">+ Group</option>
         ${addable.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}
       </select>`
    : (!admin && groups.length === 0 ? '<span class="text-muted">—</span>' : '');

  const groupCell = `<div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">${chips}${groupAdd}</div>`;

  // Row is clickable (→ Edit Profile) only for admin (any row) or self.
  const clickable = admin || isSelf;

  return `
    <tr data-id="${u.id}"${clickable ? ' class="tm-row-click" style="cursor:pointer;"' : ''}>
      <td style="font-weight:500;">${name}</td>
      <td>${email}</td>
      <td>${rateCell}</td>
      <td>${roleCell}</td>
      <td>${groupCell}</td>
      <td class="col-actions">
        ${clickable ? `
        <div class="row-actions">
          <button class="row-action-btn tm-edit" title="Edit profile">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>` : ''}
      </td>
    </tr>`;
}

function _wireMemberRows(wrap, admin) {
  // Row / edit-button click → Profile modal (admin or self).
  const openEdit = async u => {
    const { openProfileModal } = await import('../components/profileModal.js');
    await openProfileModal(u);
  };

  wrap.querySelectorAll('tbody tr.tm-row-click').forEach(tr => {
    const user = _users.find(u => u.id === tr.dataset.id);
    if (!user) return;
    tr.addEventListener('click', e => {
      // Ignore clicks that originate from inline controls.
      if (e.target.closest('select, a, .remove-tag, .tm-ncr-chip')) return;
      openEdit(user);
    });
  });

  if (!admin) return;

  // Rate change
  wrap.querySelectorAll('.tm-rate-change').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const user = _users.find(u => u.id === link.dataset.id);
      if (user) _openRateModal(user);
    });
  });

  // Role change
  wrap.querySelectorAll('.tm-role-select').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const id      = sel.dataset.id;
      const newRole = sel.value;
      const user    = _users.find(u => u.id === id);
      const prev    = user?.role;
      sel.disabled = true;
      try {
        await updateRole(id, newRole);
        if (user) user.role = newRole;
        window.showToast?.('Role updated', 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
        sel.value = prev;   // revert dropdown
      } finally {
        sel.disabled = false;
      }
    });
  });

  // Add to group
  wrap.querySelectorAll('.tm-group-add').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const gid = sel.value;
      if (!gid) return;
      const uid = sel.dataset.id;
      try {
        await addGroupMember(gid, uid);
        const g = _groups.find(x => x.id === gid);
        if (g) (g.group_members ||= []).push({ user_id: uid });
        _renderMembersTable();
        window.showToast?.('Added to group', 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
        sel.value = '';
      }
    });
  });

  // Remove from group
  wrap.querySelectorAll('.tm-group-remove').forEach(x => {
    x.addEventListener('click', async e => {
      e.stopPropagation();
      const { uid, gid } = x.dataset;
      try {
        await removeGroupMember(gid, uid);
        const g = _groups.find(x => x.id === gid);
        if (g) g.group_members = (g.group_members || []).filter(m => m.user_id !== uid);
        _renderMembersTable();
        window.showToast?.('Removed from group', 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
  });

  // Name-change request chips (admin only)
  wrap.querySelectorAll('.tm-ncr-chip').forEach(chip => {
    chip.addEventListener('click', e => {
      e.stopPropagation();
      const req  = _nameRequests.find(r => r.id === chip.dataset.reqId);
      const user = req ? _users.find(u => u.id === req.requested_by) : null;
      if (req && user) _openNameChangeReview(req, user);
    });
  });
}

// ──────────────────────────────────────────────────────────────
// NAME-CHANGE REQUEST REVIEW MODAL (admin only)
// ──────────────────────────────────────────────────────────────

function _openNameChangeReview(req, user) {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = `
    <div class="modal-backdrop" id="ncr-backdrop">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <span class="modal-title">Review name change request</span>
          <button class="modal-close" id="ncr-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Current name</label>
            <div style="color:var(--text-primary);padding:6px 0;">${esc(user.name || '—')}</div>
          </div>
          <div class="form-group">
            <label>Requested name</label>
            <div style="font-weight:600;color:var(--accent);padding:6px 0;">${esc(req.requested_name)}</div>
          </div>
          <div class="form-group">
            <label>Reason</label>
            <div style="color:var(--text-muted);font-style:italic;padding:6px 0;">&ldquo;${esc(req.reason)}&rdquo;</div>
          </div>
          <div id="ncr-reject-section" style="display:none;margin-top:var(--sp-2);">
            <div class="form-group">
              <label>Rejection note <span style="color:var(--text-muted)">(optional)</span></label>
              <textarea id="ncr-reject-note" rows="2" placeholder="Reason for rejecting…"
                        style="width:100%;"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="ncr-cancel-btn">Cancel</button>
          <button class="btn btn-ghost" id="ncr-reject-btn"
                  style="color:var(--color-danger);">Reject</button>
          <button class="btn btn-primary" id="ncr-approve-btn">Approve</button>
        </div>
      </div>
    </div>`;

  const closeModal = () => { mount.innerHTML = ''; };
  document.getElementById('ncr-close').onclick      = closeModal;
  document.getElementById('ncr-cancel-btn').onclick = closeModal;
  document.getElementById('ncr-backdrop')._escClose = closeModal;

  // Reject — two-step: show note field → confirm
  let rejectReady = false;
  document.getElementById('ncr-reject-btn').addEventListener('click', async () => {
    if (!rejectReady) {
      rejectReady = true;
      document.getElementById('ncr-reject-section').style.display = '';
      document.getElementById('ncr-reject-btn').textContent = 'Confirm reject';
      return;
    }
    const note = document.getElementById('ncr-reject-note').value.trim();
    try {
      await reviewNameChangeRequest(req.id, false, note);
      _nameRequests = _nameRequests.filter(r => r.id !== req.id);
      _renderMembersTable();
      closeModal();
      window.showToast?.('Request rejected', 'info');
    } catch (err) {
      window.showToast?.(err.message, 'error');
    }
  });

  // Approve
  document.getElementById('ncr-approve-btn').addEventListener('click', async () => {
    try {
      await reviewNameChangeRequest(req.id, true, '');
      // Update local user record so table re-renders with new name immediately
      const idx = _users.findIndex(u => u.id === user.id);
      if (idx !== -1) _users[idx] = { ..._users[idx], name: req.requested_name };
      _nameRequests = _nameRequests.filter(r => r.id !== req.id);
      _renderMembersTable();
      closeModal();
      window.showToast?.(`Name updated to "${req.requested_name}"`, 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
    }
  });
}

// ──────────────────────────────────────────────────────────────
// BILLABLE RATE MODAL (admin/owner only)
// ──────────────────────────────────────────────────────────────

function _openRateModal(user) {
  const mount = document.getElementById('modal-mount');
  const current = (user.billable_rate !== null && user.billable_rate !== undefined) ? user.billable_rate : '';
  mount.innerHTML = `
    <div class="modal-backdrop" id="tm-rate-backdrop">
      <div class="modal modal-sm">
        <div class="modal-header">
          <span class="modal-title">Billable rate</span>
          <button class="modal-close" id="tm-rate-close">&times;</button>
        </div>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:var(--sp-3);">
          <div class="text-muted" style="font-size:var(--font-sm)">${esc(user.name || user.email || '')}</div>
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Rate (THB per hour)</span>
            <input type="number" id="tm-rate-input" min="0" step="0.01" value="${attr(String(current))}" placeholder="0.00">
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="tm-rate-cancel">Cancel</button>
          <button class="btn btn-primary" id="tm-rate-save">SAVE</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#tm-rate-close').addEventListener('click', close);
  mount.querySelector('#tm-rate-cancel').addEventListener('click', close);
  mount.querySelector('#tm-rate-backdrop')._escClose = close;

  mount.querySelector('#tm-rate-save').addEventListener('click', async () => {
    const raw = mount.querySelector('#tm-rate-input').value.trim();
    const rate = raw === '' ? null : parseFloat(raw);
    if (raw !== '' && (isNaN(rate) || rate < 0)) {
      window.showToast?.('Enter a valid rate', 'error'); return;
    }
    const btn = mount.querySelector('#tm-rate-save');
    btn.disabled = true;
    try {
      await updateBillableRate(user.id, rate);
      const u = _users.find(x => x.id === user.id);
      if (u) u.billable_rate = rate;
      close();
      _renderMembersTable();
      window.showToast?.('Billable rate updated', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// ADD NEW MEMBER (info modal — members join via Google sign-in)
// ──────────────────────────────────────────────────────────────

function _openAddMemberModal() {
  const mount = document.getElementById('modal-mount');
  // Resolve against the current page (not origin) so the link keeps the
  // GitHub Pages project subpath — same idiom as the OAuth redirect in auth.js.
  const appUrl = new URL('index.html', window.location.href).href;
  mount.innerHTML = `
    <div class="modal-backdrop" id="tm-add-backdrop">
      <div class="modal modal-sm">
        <div class="modal-header">
          <span class="modal-title">Add a new member</span>
          <button class="modal-close" id="tm-add-close">&times;</button>
        </div>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:var(--sp-3);">
          <p style="margin:0;">New members join automatically the first time they
             <strong>sign in with Google</strong>. Share the app link below — once they log in,
             they appear here and you can set their role, billable rate, and group.</p>
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">App link</span>
            <input type="text" id="tm-add-url" readonly value="${attr(appUrl)}">
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="tm-add-cancel">Close</button>
          <button class="btn btn-primary" id="tm-add-copy">COPY LINK</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#tm-add-close').addEventListener('click', close);
  mount.querySelector('#tm-add-cancel').addEventListener('click', close);
  mount.querySelector('#tm-add-backdrop')._escClose = close;
  mount.querySelector('#tm-add-copy').addEventListener('click', async () => {
    const input = mount.querySelector('#tm-add-url');
    try {
      await navigator.clipboard.writeText(input.value);
      window.showToast?.('Link copied', 'success');
    } catch {
      input.select();   // fallback: select so the user can copy manually
      window.showToast?.('Press Ctrl+C to copy', 'info');
    }
  });
}

// ──────────────────────────────────────────────────────────────
// GROUPS TAB
// ──────────────────────────────────────────────────────────────

function _renderGroupsPanel() {
  const panel = document.getElementById('panel-groups');
  if (!panel) return;
  const admin = isAdmin();

  panel.innerHTML = `
    ${admin ? `
    <div class="card" style="margin-bottom:var(--sp-4)">
      <div style="display:flex; gap:var(--sp-3); align-items:center; flex-wrap:wrap;">
        <input type="text" id="tm-group-name" placeholder="Add new group" style="flex:1; min-width:200px;">
        <button class="btn btn-primary" id="tm-group-create">ADD</button>
      </div>
    </div>` : ''}
    <div id="tm-groups-table"></div>`;

  if (admin) {
    const create = () => _handleCreateGroup();
    panel.querySelector('#tm-group-create')?.addEventListener('click', create);
    panel.querySelector('#tm-group-name')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') create();
    });
  }

  _renderGroupsTable();
}

function _renderGroupsTable() {
  const wrap = document.getElementById('tm-groups-table');
  if (!wrap) return;
  const admin = isAdmin();

  if (_groups.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="margin-top:40px">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <div class="empty-state-title">No groups yet</div>
        <div class="empty-state-sub">${admin ? 'Create a group above, then assign members from the Members tab' : 'Groups will appear here once an admin creates them'}</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>Name</th><th>Members</th><th>Team leader</th><th></th></tr>
        </thead>
        <tbody>
          ${_groups.map(g => {
            const leader = g.leader;
            const leaderName = leader
              ? esc(leader.name || leader.email || '—')
              : '<span class="text-muted">—</span>';
            return `
            <tr data-id="${g.id}">
              <td style="font-weight:500;">${esc(g.name)}</td>
              <td><span class="text-muted">${(g.group_members || []).length}</span></td>
              <td>${leaderName}</td>
              <td class="col-actions">
                ${admin ? `
                <div class="row-actions">
                  <button class="row-action-btn tm-group-members" title="Manage members">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </button>
                  <button class="row-action-btn danger tm-group-delete" title="Delete group">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  if (!admin) return;
  wrap.querySelectorAll('.tm-group-delete').forEach(btn => {
    const tr = btn.closest('tr');
    const group = _groups.find(g => g.id === tr.dataset.id);
    btn.addEventListener('click', () => group && _confirmDeleteGroup(group));
  });
  wrap.querySelectorAll('.tm-group-members').forEach(btn => {
    const tr = btn.closest('tr');
    const group = _groups.find(g => g.id === tr.dataset.id);
    btn.addEventListener('click', () => group && _openGroupMembersModal(group));
  });
}

// ──────────────────────────────────────────────────────────────
// MANAGE GROUP MEMBERS (admin/owner only)
// ──────────────────────────────────────────────────────────────

function _openGroupMembersModal(group) {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = `
    <div class="modal-backdrop" id="tm-gm-backdrop">
      <div class="modal modal-sm">
        <div class="modal-header">
          <span class="modal-title">Manage members — ${esc(group.name)}</span>
          <button class="modal-close" id="tm-gm-close">&times;</button>
        </div>
        <div class="modal-body" id="tm-gm-body" style="display:flex; flex-direction:column; gap:var(--sp-3);"></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="tm-gm-done">Done</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#tm-gm-close').addEventListener('click', close);
  mount.querySelector('#tm-gm-done').addEventListener('click', close);
  mount.querySelector('#tm-gm-backdrop')._escClose = close;

  _renderGmBody(group);
}

function _renderGmBody(group, deptFilter) {
  const body = document.getElementById('tm-gm-body');
  if (!body) return;

  const memberIds = (group.group_members || []).map(m => m.user_id);
  const members   = _users.filter(u => memberIds.includes(u.id));
  const allAddable = _users.filter(u => !memberIds.includes(u.id));

  // Department filter
  const deptLabels = {};
  allAddable.forEach(u => {
    const dept = _userDeptMap[u.id];
    if (dept?.code && !deptLabels[dept.code]) deptLabels[dept.code] = dept.label || dept.code;
  });
  const deptCodes = Object.keys(deptLabels).sort();
  const activeDept = deptFilter || '';
  const deptFilterHtml = deptCodes.length ? `
    <div style="margin-bottom:var(--sp-2);">
      <select id="tm-gm-dept" style="width:100%;font-size:var(--font-sm);">
        <option value="">All departments</option>
        ${deptCodes.map(code => `<option value="${attr(code)}"${activeDept === code ? ' selected' : ''}>${esc(deptLabels[code])}</option>`).join('')}
      </select>
    </div>` : '';

  const addable = activeDept
    ? allAddable.filter(u => _userDeptMap[u.id]?.code === activeDept)
    : allAddable;

  const memberRows = members.length
    ? members.map(u => {
        const isLeader = group.leader_id === u.id;
        return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:var(--sp-2);">
          <span>${esc(u.name || u.email || '—')}${isLeader ? ' <span class="badge badge-admin" style="font-size:10px;">Leader</span>' : ''}</span>
          <span class="remove-tag tm-gm-remove" data-uid="${u.id}" title="Remove"
                style="cursor:pointer; color:var(--text-muted);">×</span>
        </div>`;
      }).join('')
    : `<div class="text-muted" style="font-size:var(--font-sm)">No members yet</div>`;

  const addSelect = addable.length
    ? `<select id="tm-gm-add" style="width:100%;">
         <option value="">+ Add member</option>
         ${addable.map(u => `<option value="${u.id}">${esc(u.name || u.email)}</option>`).join('')}
       </select>`
    : `<div class="text-muted" style="font-size:var(--font-xs)">${activeDept ? 'No unassigned members in this department.' : 'Everyone is already in this group.'}</div>`;

  // Leader selector — pick one of the group's current members as team leader
  const leaderSelect = members.length ? `
    <div style="border-top:1px solid var(--border); padding-top:var(--sp-3);">
      <span class="text-muted" style="font-size:var(--font-xs); display:block; margin-bottom:6px;">Team leader</span>
      <select id="tm-gm-leader" style="width:100%;">
        <option value="">(none)</option>
        ${members.map(u => `<option value="${u.id}"${group.leader_id===u.id?' selected':''}>${esc(u.name||u.email)}</option>`).join('')}
      </select>
    </div>` : '';

  body.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:var(--sp-2);">${memberRows}</div>
    <div style="border-top:1px solid var(--border); padding-top:var(--sp-3);">
      ${deptFilterHtml}
      ${addSelect}
    </div>
    ${leaderSelect}`;

  body.querySelector('#tm-gm-dept')?.addEventListener('change', e => {
    _renderGmBody(group, e.target.value || '');
  });

  body.querySelector('#tm-gm-add')?.addEventListener('change', async e => {
    const uid = e.target.value;
    if (!uid) return;
    e.target.disabled = true;
    const currentDept = body.querySelector('#tm-gm-dept')?.value || '';
    try {
      await addGroupMember(group.id, uid);
      (group.group_members ||= []).push({ user_id: uid });
      _renderGmBody(group, currentDept);
      _renderGroupsTable();
      _renderMembersTable();
      window.showToast?.('Member added', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      e.target.disabled = false;
    }
  });

  body.querySelectorAll('.tm-gm-remove').forEach(x => {
    x.addEventListener('click', async () => {
      const uid = x.dataset.uid;
      const currentDept = body.querySelector('#tm-gm-dept')?.value || '';
      try {
        await removeGroupMember(group.id, uid);
        group.group_members = (group.group_members || []).filter(m => m.user_id !== uid);
        if (group.leader_id === uid) {
          await setGroupLeader(group.id, null);
          group.leader_id = null;
          group.leader = null;
        }
        _renderGmBody(group, currentDept);
        _renderGroupsTable();
        _renderMembersTable();
        window.showToast?.('Member removed', 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
  });

  // Leader selector
  body.querySelector('#tm-gm-leader')?.addEventListener('change', async e => {
    const lid = e.target.value || null;
    try {
      await setGroupLeader(group.id, lid);
      group.leader_id = lid;
      group.leader = lid ? (_users.find(u => u.id === lid) || null) : null;
      _renderGmBody(group);
      _renderGroupsTable();
      window.showToast?.('Team leader updated', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      e.target.value = group.leader_id || '';
    }
  });
}

async function _handleCreateGroup() {
  const input = document.getElementById('tm-group-name');
  const btn   = document.getElementById('tm-group-create');
  const name  = input.value.trim();
  if (!name) { window.showToast?.('Enter a group name', 'error'); return; }
  btn.disabled = true;
  try {
    const g = await createGroup(name);
    _groups.push({ ...g, group_members: [] });
    _groups.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    input.value = '';
    input.focus();
    _renderGroupsTable();
    _refreshGroupFilter();
    window.showToast?.('Group created', 'success');
  } catch (err) {
    window.showToast?.(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function _confirmDeleteGroup(group) {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = `
    <div class="modal-backdrop" id="tm-gdel-backdrop">
      <div class="modal modal-sm">
        <div class="modal-header">
          <span class="modal-title">Delete group</span>
          <button class="modal-close" id="tm-gdel-close">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin:0;">Delete <strong>${esc(group.name)}</strong>?
             Members keep their accounts; only the group is removed.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="tm-gdel-cancel">Cancel</button>
          <button class="btn btn-danger" id="tm-gdel-confirm">Delete</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#tm-gdel-close').addEventListener('click', close);
  mount.querySelector('#tm-gdel-cancel').addEventListener('click', close);
  mount.querySelector('#tm-gdel-backdrop')._escClose = close;

  mount.querySelector('#tm-gdel-confirm').addEventListener('click', async () => {
    const btn = mount.querySelector('#tm-gdel-confirm');
    btn.disabled = true;
    try {
      await deleteGroup(group.id);
      _groups = _groups.filter(g => g.id !== group.id);
      close();
      _renderGroupsTable();
      _refreshGroupFilter();
      window.showToast?.('Group deleted', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });
}

/** Keep the Members-tab group filter in sync after group create/delete. */
function _refreshGroupFilter() {
  const sel = document.getElementById('tm-group-filter');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = `<option value="all">All groups</option>` +
    _groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
  // Restore selection if the group still exists, else reset.
  if (_groups.some(g => g.id === prev) || prev === 'all') {
    sel.value = prev;
  } else {
    _groupFilter = 'all';
  }
}

// ──────────────────────────────────────────────────────────────
// REMINDERS TAB (phase-2 placeholder)
// ──────────────────────────────────────────────────────────────

function _renderRemindersPanel() {
  const panel = document.getElementById('panel-reminders');
  if (!panel || panel.dataset.rendered) return;
  panel.dataset.rendered = '1';
  panel.innerHTML = `
    <div class="empty-state" style="margin-top:40px">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <div class="empty-state-title">Reminders</div>
      <div class="empty-state-sub">Automated timesheet reminders — coming in a future update</div>
    </div>`;
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

function _cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
