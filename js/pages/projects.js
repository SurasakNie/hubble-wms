// pages/projects.js — Projects table with stats, color picker, favorite & archive
// Spec §3.6: Title + CREATE NEW PROJECT, filter bar (Active/Client/Access/Billing
// + search), table (NAME / CLIENT / TRACKED / AMOUNT / PROGRESS / ACCESS / ★ / actions).

import {
  getProjects, createProject, updateProject, deleteProject, getProjectStats,
  getTasks, createTask, assignTask, unassignTask,
} from '../api/projects.js';
import { getClients } from '../api/clients.js';
import { getUsers, getGroups } from '../api/users.js';
import { isAdmin, isManager } from '../auth.js';
import { formatDuration, formatAmount, esc, attr } from '../format.js';

const PALETTE = [
  '#03a9f4', '#9c27b0', '#4caf50', '#e91e63', '#ff9800', '#00bcd4',
  '#8bc34a', '#ff5722', '#3f51b5', '#795548', '#607d8b', '#f44336',
];

let _profile       = null;
let _projects      = [];
let _clients       = [];
let _search        = '';
let _activeFilter  = 'active';   // active | all | archived
let _clientFilter  = '';         // client id | ''
let _accessFilter  = 'all';      // all | public | private
let _billingFilter = 'all';      // all | billable | non

// ──────────────────────────────────────────────────────────────
// ENTRY POINT
// ──────────────────────────────────────────────────────────────

export async function render(profile) {
  _profile       = profile;
  _search        = '';
  _activeFilter  = 'active';
  _clientFilter  = '';
  _accessFilter  = 'all';
  _billingFilter = 'all';

  const canCreate = isAdmin() || isManager();

  document.getElementById('topbar-left').innerHTML = `
    <span class="topbar-title">Projects</span>
    ${canCreate ? `<button class="btn btn-primary btn-sm" id="pr-create" style="margin-left:var(--sp-3)">CREATE NEW PROJECT</button>` : ''}
  `;

  document.getElementById('content').innerHTML = `
    <div class="filter-bar">
      <select id="pr-active">
        <option value="active">Active</option>
        <option value="all">All</option>
        <option value="archived">Archived</option>
      </select>
      <select id="pr-client"><option value="">All clients</option></select>
      <select id="pr-access">
        <option value="all">All access</option>
        <option value="public">Public</option>
        <option value="private">Private</option>
      </select>
      <select id="pr-billing">
        <option value="all">All billing</option>
        <option value="billable">Billable</option>
        <option value="non">Non-billable</option>
      </select>
      <div class="search-input">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="search" id="pr-search" placeholder="Search projects…">
      </div>
    </div>
    <div id="pr-table-wrap">
      <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
    </div>
  `;

  _wireControls();

  // Load clients (for dropdowns) + projects in parallel.
  try {
    [_clients, _projects] = await Promise.all([
      getClients({ activeOnly: false }),
      getProjects({ includeArchived: true }),
    ]);
  } catch (err) {
    window.showToast?.(err.message, 'error');
    _clients = _clients || [];
    _projects = _projects || [];
  }

  // Fill client filter dropdown
  const clientSel = document.getElementById('pr-client');
  if (clientSel) {
    clientSel.innerHTML = `<option value="">All clients</option>` +
      _clients.map(c => `<option value="${c.id}">${esc(c.name || '')}</option>`).join('');
  }

  _renderTable();
  _hydrateStats();
}

function _wireControls() {
  const content = document.getElementById('content');
  document.getElementById('pr-create')?.addEventListener('click', () => _openProjectModal(null));
  content.querySelector('#pr-active')?.addEventListener('change', e => { _activeFilter = e.target.value; _renderTable(); _hydrateStats(); });
  content.querySelector('#pr-client')?.addEventListener('change', e => { _clientFilter = e.target.value; _renderTable(); _hydrateStats(); });
  content.querySelector('#pr-access')?.addEventListener('change', e => { _accessFilter = e.target.value; _renderTable(); _hydrateStats(); });
  content.querySelector('#pr-billing')?.addEventListener('change', e => { _billingFilter = e.target.value; _renderTable(); _hydrateStats(); });
  content.querySelector('#pr-search')?.addEventListener('input', e => { _search = e.target.value.trim().toLowerCase(); _renderTable(); _hydrateStats(); });
}

// ──────────────────────────────────────────────────────────────
// TABLE
// ──────────────────────────────────────────────────────────────

function _filtered() {
  return _projects.filter(p => {
    if (_activeFilter === 'active'   &&  p.is_archived) return false;
    if (_activeFilter === 'archived' && !p.is_archived) return false;
    if (_clientFilter && (p.client?.id || '') !== _clientFilter) return false;
    if (_accessFilter !== 'all' && p.access !== _accessFilter) return false;
    if (_billingFilter === 'billable' && !p.is_billable) return false;
    if (_billingFilter === 'non'      &&  p.is_billable) return false;
    if (_search) {
      const hay = `${p.name || ''} ${p.client?.name || ''}`.toLowerCase();
      if (!hay.includes(_search)) return false;
    }
    return true;
  });
}

function _renderTable() {
  const wrap = document.getElementById('pr-table-wrap');
  if (!wrap) return;

  const rows  = _filtered();
  const admin = isAdmin();

  if (rows.length === 0) {
    const filtered = _search || _activeFilter !== 'active' || _clientFilter ||
                     _accessFilter !== 'all' || _billingFilter !== 'all';
    wrap.innerHTML = `
      <div class="empty-state" style="margin-top:40px">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <div class="empty-state-title">${filtered ? 'No matching projects' : 'No projects yet'}</div>
        <div class="empty-state-sub">${filtered ? 'Try different filters or search' : (admin || isManager() ? 'Create your first project' : 'No projects to show')}</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Client</th>
            <th>Tracked</th>
            ${admin ? '<th>Amount</th>' : ''}
            <th style="min-width:120px">Progress</th>
            <th>Access</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(p => _renderRow(p, admin)).join('')}
        </tbody>
      </table>
    </div>`;

  // Wire row interactions
  wrap.querySelectorAll('tbody tr').forEach(tr => {
    const p = _projects.find(x => x.id === tr.dataset.id);
    if (!p) return;
    if (admin) tr.querySelector('.pr-dot')?.addEventListener('click', () => _openColorPicker(p));
    tr.querySelector('.act-assign')?.addEventListener('click', () => _openAssignModal(p));
    tr.querySelector('.act-edit')?.addEventListener('click', () => _openProjectModal(p));
    tr.querySelector('.act-fav')?.addEventListener('click', () => _toggleFavorite(p));
    tr.querySelector('.act-archive')?.addEventListener('click', () => _setArchived(p, true));
    tr.querySelector('.act-restore')?.addEventListener('click', () => _setArchived(p, false));
    tr.querySelector('.act-delete')?.addEventListener('click', () => _confirmDelete(p));
  });
}

function _renderRow(p, admin) {
  const color    = p.color || '#03a9f4';
  const archived = !!p.is_archived;
  const clientNm = p.client?.name ? esc(p.client.name) : '<span class="text-muted">—</span>';
  const access   = p.access === 'private'
    ? '<span class="badge badge-client">Private</span>'
    : '<span class="badge badge-member">Public</span>';

  const favBtn = admin
    ? `<button class="row-action-btn act-fav" title="${p.is_favorite ? 'Unfavorite' : 'Favorite'}">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="${p.is_favorite ? 'var(--accent)' : 'none'}"
              stroke="${p.is_favorite ? 'var(--accent)' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
         </svg>
       </button>`
    : (p.is_favorite
        ? `<span class="row-action-btn" style="opacity:1" title="Favorite"><svg width="15" height="15" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>`
        : '');

  const actions = admin ? `
    <div class="row-actions">
      <button class="row-action-btn act-assign" title="Assign members">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </button>
      <button class="row-action-btn act-edit" title="Edit">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      ${archived
        ? `<button class="row-action-btn act-restore" title="Restore">
             <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
             </svg>
           </button>`
        : `<button class="row-action-btn act-archive" title="Archive">
             <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
             </svg>
           </button>`}
      <button class="row-action-btn danger act-delete" title="Delete">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>` : '';

  return `
    <tr data-id="${p.id}"${archived ? ' style="opacity:0.55"' : ''}>
      <td style="font-weight:500;">
        <span style="display:inline-flex; align-items:center; gap:8px;">
          <span class="project-dot pr-dot" style="background:${color}; width:12px; height:12px;${admin ? ' cursor:pointer;' : ''}" title="${admin ? 'Change color' : ''}"></span>
          ${esc(p.name || '')}
          ${archived ? '<span class="badge badge-client" style="margin-left:4px;">archived</span>' : ''}
        </span>
      </td>
      <td>${clientNm}</td>
      <td data-stat="hours"><span class="text-muted">…</span></td>
      ${admin ? '<td data-stat="amount"><span class="text-muted">…</span></td>' : ''}
      <td data-stat="progress"><span class="text-muted">…</span></td>
      <td>${access}</td>
      <td class="col-actions" style="text-align:center; width:36px;">${favBtn}</td>
      <td class="col-actions">${actions}</td>
    </tr>`;
}

// ──────────────────────────────────────────────────────────────
// STATS HYDRATION
// ──────────────────────────────────────────────────────────────

async function _hydrateStats() {
  const admin = isAdmin();
  const rows  = _filtered();
  await Promise.all(rows.map(async p => {
    let stats;
    try {
      stats = await getProjectStats(p.id);
    } catch {
      stats = null;
    }
    const tr = document.querySelector(`#pr-table-wrap tbody tr[data-id="${p.id}"]`);
    if (!tr) return; // table re-rendered since

    const hoursCell = tr.querySelector('[data-stat="hours"]');
    const amtCell   = tr.querySelector('[data-stat="amount"]');
    const progCell  = tr.querySelector('[data-stat="progress"]');

    if (!stats) {
      if (hoursCell) hoursCell.innerHTML = '<span class="text-muted">—</span>';
      if (amtCell)   amtCell.innerHTML   = '<span class="text-muted">—</span>';
      if (progCell)  progCell.innerHTML  = '<span class="text-muted">—</span>';
      return;
    }

    if (hoursCell) hoursCell.textContent = formatDuration(stats.totalHours);
    if (admin && amtCell) amtCell.textContent = formatAmount(stats.billableAmount);

    if (progCell) {
      const est = Number(p.estimated_hours) || 0;
      if (est > 0) {
        const pct = Math.min(100, Math.round((stats.totalHours / est) * 100));
        progCell.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
            <span class="text-muted" style="font-size:var(--font-xs); min-width:32px;">${pct}%</span>
          </div>`;
      } else {
        progCell.innerHTML = '<span class="text-muted">—</span>';
      }
    }
  }));
}

// ──────────────────────────────────────────────────────────────
// MUTATIONS
// ──────────────────────────────────────────────────────────────

async function _toggleFavorite(p) {
  try {
    const updated = await updateProject(p.id, { isFavorite: !p.is_favorite });
    _replace(updated);
    _renderTable(); _hydrateStats();
  } catch (err) {
    window.showToast?.(err.message, 'error');
  }
}

async function _setArchived(p, archived) {
  try {
    const updated = await updateProject(p.id, { isArchived: archived });
    _replace(updated);
    // Keep the result visible: a filtered view would otherwise hide the row that just moved.
    _activeFilter = 'all';
    const sel = document.getElementById('pr-active');
    if (sel) sel.value = 'all';
    _renderTable(); _hydrateStats();
    window.showToast?.(archived ? 'Project archived' : 'Project restored', 'success');
  } catch (err) {
    window.showToast?.(err.message, 'error');
  }
}

function _replace(updated) {
  const idx = _projects.findIndex(x => x.id === updated.id);
  if (idx >= 0) _projects[idx] = updated;
}

// ──────────────────────────────────────────────────────────────
// ASSIGN MEMBERS (admin/owner) — grants project access by assigning users/groups to a task.
// The app's model: a member sees a project once assigned to one of its TASKS. We use a single
// "access task" (the project's first task, or a "General" task created on first assignment).
// ──────────────────────────────────────────────────────────────

function _openAssignModal(project) {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = `
    <div class="modal-backdrop" id="pr-as-backdrop">
      <div class="modal modal-sm" id="pr-as-modal">
        <div class="modal-header">
          <span class="modal-title">Assign members — ${esc(project.name || '')}</span>
          <button class="modal-close" id="pr-as-close">&times;</button>
        </div>
        <div class="modal-body" id="pr-as-body" style="display:flex; flex-direction:column; gap:var(--sp-3); max-height:60vh; overflow:auto;">
          <div class="text-muted" style="font-size:var(--font-sm)">Loading…</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="pr-as-done">Done</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; _renderTable(); _hydrateStats(); };
  mount.querySelector('#pr-as-close').addEventListener('click', close);
  mount.querySelector('#pr-as-done').addEventListener('click', close);
  mount.querySelector('#pr-as-backdrop').addEventListener('click', e => {
    if (e.target.id === 'pr-as-backdrop') close();
  });

  _loadAssign(project);
}

async function _loadAssign(project) {
  let tasks = [], users = [], groups = [];
  try {
    [tasks, users, groups] = await Promise.all([
      getTasks(project.id), getUsers(isAdmin()), getGroups(),
    ]);
  } catch (err) {
    window.showToast?.(err.message, 'error');
  }
  _renderAssignBody(project, tasks, users.filter(u => u.role !== 'client'), groups);
}

function _renderAssignBody(project, tasks, users, groups, _memberSearch = '', _groupSearch = '', _activeGroupId = null) {
  const body = document.getElementById('pr-as-body');
  if (!body) return;

  // A user/group "has access" if assigned to ANY task in the project.
  const assignedUsers  = new Set();
  const assignedGroups = new Set();
  for (const t of tasks) {
    for (const a of (t.task_assignments || [])) {
      if (a.assignee_type === 'user')  assignedUsers.add(a.assignee_id);
      if (a.assignee_type === 'group') assignedGroups.add(a.assignee_id);
    }
  }

  const row = (kind, id, label, checked) => `
    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
      <input type="checkbox" class="pr-as-cb" data-kind="${kind}" data-id="${id}"${checked ? ' checked' : ''}>
      <span>${esc(label)}</span>
    </label>`;

  // Filter members: if a group is selected show only its members, then apply search.
  const activeGroup = _activeGroupId ? groups.find(g => g.id === _activeGroupId) : null;
  const memberPool = activeGroup
    ? users.filter(u => (activeGroup.group_members || []).some(m => m.user_id === u.id))
    : users;
  const memberQ = _memberSearch.toLowerCase();
  const visibleUsers = memberQ
    ? memberPool.filter(u => (u.name || u.email || '').toLowerCase().includes(memberQ))
    : memberPool;

  // Filter groups by search.
  const groupQ = _groupSearch.toLowerCase();
  const visibleGroups = groupQ
    ? groups.filter(g => (g.name || '').toLowerCase().includes(groupQ))
    : groups;

  const searchBox = (id, placeholder, value = '') => `
    <div class="search-input" style="margin-bottom:4px;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="search" id="${id}" placeholder="${placeholder}" value="${attr(value)}" style="font-size:var(--font-sm);">
    </div>`;

  const groupRows = visibleGroups.length
    ? visibleGroups.map(g => {
        const isActive = g.id === _activeGroupId;
        return `<label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" class="pr-as-cb" data-kind="group" data-id="${g.id}"${assignedGroups.has(g.id) ? ' checked' : ''}>
          <span style="flex:1;">${esc(g.name || '(group)')}</span>
          <button type="button" class="pr-as-grp-filter btn btn-ghost" data-gid="${g.id}"
            style="font-size:var(--font-xs); padding:2px 6px; opacity:${isActive ? '1' : '0.5'};"
            title="${isActive ? 'Clear group filter' : 'Show only this group\'s members'}">
            ${isActive ? '▼ members' : '▶ members'}
          </button>
        </label>`;
      }).join('')
    : `<div class="text-muted" style="font-size:var(--font-xs)">No groups</div>`;

  const memberLabel = activeGroup
    ? `Members <span style="color:var(--accent); font-size:var(--font-xs);">— ${esc(activeGroup.name)}</span>`
    : 'Members';

  body.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px;">
      <span class="text-muted" style="font-size:var(--font-xs); text-transform:uppercase; letter-spacing:0.5px;">${memberLabel}</span>
      ${searchBox('pr-as-member-search', 'Search members…', _memberSearch)}
      <div id="pr-as-member-list" style="display:flex; flex-direction:column; gap:6px;">
        ${visibleUsers.map(u => row('user', u.id, u.name || u.email, assignedUsers.has(u.id))).join('') || '<div class="text-muted" style="font-size:var(--font-sm)">No members found</div>'}
      </div>
    </div>
    <div style="display:flex; flex-direction:column; gap:6px; border-top:1px solid var(--border); padding-top:var(--sp-3);">
      <span class="text-muted" style="font-size:var(--font-xs); text-transform:uppercase; letter-spacing:0.5px;">Groups</span>
      ${searchBox('pr-as-group-search', 'Search groups…', _groupSearch)}
      <div id="pr-as-group-list" style="display:flex; flex-direction:column; gap:6px;">
        ${groupRows}
      </div>
    </div>`;

  // Live search — member
  body.querySelector('#pr-as-member-search').addEventListener('input', e => {
    _renderAssignBody(project, tasks, users, groups, e.target.value, _groupSearch, _activeGroupId);
  });

  // Live search — group
  body.querySelector('#pr-as-group-search').addEventListener('input', e => {
    _renderAssignBody(project, tasks, users, groups, _memberSearch, e.target.value, _activeGroupId);
  });

  // Group filter toggle buttons
  body.querySelectorAll('.pr-as-grp-filter').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const gid = btn.dataset.gid;
      _renderAssignBody(project, tasks, users, groups, _memberSearch, _groupSearch,
        gid === _activeGroupId ? null : gid);
    });
  });

  // Checkbox assign / unassign
  body.querySelectorAll('.pr-as-cb').forEach(cb => {
    cb.addEventListener('change', async () => {
      cb.disabled = true;
      const kind = cb.dataset.kind, id = cb.dataset.id, on = cb.checked;
      try {
        if (on) {
          // Ensure an access task exists, then assign.
          let taskId = tasks[0]?.id;
          if (!taskId) {
            const t = await createTask(project.id, 'General');
            taskId = t.id;
          }
          await assignTask(taskId, kind, id);
        } else {
          // Revoke fully: remove from every task in the project.
          for (const t of tasks) await unassignTask(t.id, kind, id);
        }
        // Refresh from the server so checkbox state stays accurate.
        const fresh = await getTasks(project.id);
        _renderAssignBody(project, fresh, users, groups, _memberSearch, _groupSearch, _activeGroupId);
        window.showToast?.(on ? 'Assigned' : 'Removed', 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
        cb.checked = !on;
        cb.disabled = false;
      }
    });
  });
}

// ──────────────────────────────────────────────────────────────
// CREATE / EDIT MODAL
// ──────────────────────────────────────────────────────────────

function _openProjectModal(project) {
  const isEdit = !!project;
  const cur = project || { name: '', color: '#03a9f4', access: 'public', is_billable: true, estimated_hours: null, client: null };
  const curClientId = cur.client?.id || '';
  const mount = document.getElementById('modal-mount');

  mount.innerHTML = `
    <div class="modal-backdrop" id="pr-modal-backdrop">
      <div class="modal modal-lg" id="pr-modal">
        <div class="modal-header">
          <span class="modal-title">${isEdit ? 'Edit project' : 'Create project'}</span>
          <button class="modal-close" id="pr-modal-close">&times;</button>
        </div>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:var(--sp-3);">
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Name</span>
            <input type="text" id="pr-f-name" value="${attr(cur.name || '')}" placeholder="Project name">
          </label>
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Client</span>
            <select id="pr-f-client">
              <option value=""${isEdit ? '' : ' disabled selected'}>${isEdit ? 'No client' : 'Select a client…'}</option>
              ${_clients.map(c => `<option value="${c.id}"${c.id === curClientId ? ' selected' : ''}>${esc(c.name || '')}</option>`).join('')}
            </select>
          </label>
          <div style="display:flex; flex-direction:column; gap:6px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Color</span>
            <div id="pr-f-swatches" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              ${PALETTE.map(c => _swatch(c, c === (cur.color || '#03a9f4'))).join('')}
              <input type="color" id="pr-f-color" value="${attr(cur.color || '#03a9f4')}"
                     style="width:32px; height:28px; padding:2px; cursor:pointer;" title="Custom color">
            </div>
          </div>
          <div style="display:flex; gap:var(--sp-4); flex-wrap:wrap;">
            <label style="display:flex; flex-direction:column; gap:4px;">
              <span class="text-muted" style="font-size:var(--font-xs)">Access</span>
              <select id="pr-f-access">
                <option value="public"${cur.access !== 'private' ? ' selected' : ''}>Public</option>
                <option value="private"${cur.access === 'private' ? ' selected' : ''}>Private</option>
              </select>
            </label>
            <label style="display:flex; flex-direction:column; gap:4px;">
              <span class="text-muted" style="font-size:var(--font-xs)">Estimated hours</span>
              <input type="number" id="pr-f-est" min="0" step="0.5" value="${cur.estimated_hours ?? ''}" placeholder="—" style="width:120px;">
            </label>
            <label style="display:flex; align-items:flex-end; gap:8px; cursor:pointer; padding-bottom:8px;">
              <input type="checkbox" id="pr-f-billable"${cur.is_billable ? ' checked' : ''}>
              <span>Billable</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="pr-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="pr-modal-save">${isEdit ? 'SAVE' : 'CREATE'}</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#pr-modal-close').addEventListener('click', close);
  mount.querySelector('#pr-modal-cancel').addEventListener('click', close);
  mount.querySelector('#pr-modal-backdrop').addEventListener('click', e => {
    if (e.target.id === 'pr-modal-backdrop') close();
  });

  // Swatch picker keeps the <input type=color> in sync
  const colorInput = mount.querySelector('#pr-f-color');
  mount.querySelectorAll('.pr-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      colorInput.value = sw.dataset.color;
      _markSwatch(mount, sw.dataset.color);
    });
  });
  colorInput.addEventListener('input', () => _markSwatch(mount, colorInput.value));

  mount.querySelector('#pr-modal-save').addEventListener('click', async () => {
    const name = mount.querySelector('#pr-f-name').value.trim();
    if (!name) { window.showToast?.('Enter a project name', 'error'); return; }
    const clientId = mount.querySelector('#pr-f-client').value || null;
    // A new project must belong to a client (edit may keep an existing "No client" project).
    if (!isEdit && !clientId) { window.showToast?.('Select a client for the project', 'error'); return; }
    const estRaw = mount.querySelector('#pr-f-est').value;
    const payload = {
      name,
      clientId,
      color:          colorInput.value,
      access:         mount.querySelector('#pr-f-access').value,
      isBillable:     mount.querySelector('#pr-f-billable').checked,
      estimatedHours: estRaw === '' ? null : Number(estRaw),
    };

    const saveBtn = mount.querySelector('#pr-modal-save');
    saveBtn.disabled = true;
    try {
      if (isEdit) {
        const updated = await updateProject(project.id, payload);
        _replace(updated);
        window.showToast?.('Project updated', 'success');
      } else {
        const created = await createProject(payload);
        _projects.push(created);
        window.showToast?.('Project created', 'success');
      }
      close();
      _renderTable();
      _hydrateStats();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      saveBtn.disabled = false;
    }
  });
}

function _swatch(color, selected) {
  return `<button type="button" class="pr-swatch" data-color="${color}"
    style="width:24px; height:24px; border-radius:50%; background:${color}; cursor:pointer;
           border:2px solid ${selected ? 'var(--text-primary)' : 'transparent'}; padding:0;"></button>`;
}

function _markSwatch(scope, color) {
  scope.querySelectorAll('.pr-swatch').forEach(sw => {
    sw.style.border = `2px solid ${sw.dataset.color.toLowerCase() === color.toLowerCase() ? 'var(--text-primary)' : 'transparent'}`;
  });
}

// ──────────────────────────────────────────────────────────────
// COLOR PICKER (row dot, admin only)
// ──────────────────────────────────────────────────────────────

function _openColorPicker(project) {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = `
    <div class="modal-backdrop" id="pr-col-backdrop">
      <div class="modal modal-sm" id="pr-col-modal">
        <div class="modal-header">
          <span class="modal-title">Project color</span>
          <button class="modal-close" id="pr-col-close">&times;</button>
        </div>
        <div class="modal-body">
          <div id="pr-col-swatches" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            ${PALETTE.map(c => _swatch(c, c === (project.color || '#03a9f4'))).join('')}
            <input type="color" id="pr-col-input" value="${attr(project.color || '#03a9f4')}"
                   style="width:32px; height:28px; padding:2px; cursor:pointer;" title="Custom color">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="pr-col-cancel">Cancel</button>
          <button class="btn btn-primary" id="pr-col-save">SAVE</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#pr-col-close').addEventListener('click', close);
  mount.querySelector('#pr-col-cancel').addEventListener('click', close);
  mount.querySelector('#pr-col-backdrop').addEventListener('click', e => {
    if (e.target.id === 'pr-col-backdrop') close();
  });

  const colInput = mount.querySelector('#pr-col-input');
  mount.querySelectorAll('.pr-swatch').forEach(sw => {
    sw.addEventListener('click', () => { colInput.value = sw.dataset.color; _markSwatch(mount, sw.dataset.color); });
  });
  colInput.addEventListener('input', () => _markSwatch(mount, colInput.value));

  mount.querySelector('#pr-col-save').addEventListener('click', async () => {
    const btn = mount.querySelector('#pr-col-save');
    btn.disabled = true;
    try {
      const updated = await updateProject(project.id, { color: colInput.value });
      _replace(updated);
      close();
      _renderTable();
      _hydrateStats();
      window.showToast?.('Color updated', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// DELETE CONFIRM (admin only)
// ──────────────────────────────────────────────────────────────

function _confirmDelete(project) {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = `
    <div class="modal-backdrop" id="pr-del-backdrop">
      <div class="modal modal-sm" id="pr-del-modal">
        <div class="modal-header">
          <span class="modal-title">Delete project</span>
          <button class="modal-close" id="pr-del-close">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin:0;">Delete <strong>${esc(project.name || '')}</strong>? This cannot be undone.
          Time entries on this project may block deletion — consider archiving instead.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="pr-del-cancel">Cancel</button>
          <button class="btn btn-danger" id="pr-del-confirm">Delete</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#pr-del-close').addEventListener('click', close);
  mount.querySelector('#pr-del-cancel').addEventListener('click', close);
  mount.querySelector('#pr-del-backdrop').addEventListener('click', e => {
    if (e.target.id === 'pr-del-backdrop') close();
  });

  mount.querySelector('#pr-del-confirm').addEventListener('click', async () => {
    const btn = mount.querySelector('#pr-del-confirm');
    btn.disabled = true;
    try {
      await deleteProject(project.id);
      _projects = _projects.filter(x => x.id !== project.id);
      close();
      _renderTable();
      _hydrateStats();
      window.showToast?.('Project deleted', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
