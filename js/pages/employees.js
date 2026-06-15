// js/pages/employees.js — Employee Database (M3) admin page

import { isAdmin, getSession } from '../auth.js';
import { confirmModal } from '../components/confirmModal.js';
import { empSelectHtml, wireEmpSelect } from '../components/empSelect.js';
import {
  getDepartments, getEmploymentTypes,
  getEmployees, createEmployee, updateEmployee, archiveEmployee,
  getCompensation, upsertCompensation,
  getDocuments, addDocument, deleteDocument,
  getSkills, addSkill, removeSkill,
  findProfileByEmail, updateProfileName,
} from '../api/employees.js';

// Supabase Edge Functions base — admin actions (provision / reset / clear-mfa)
// and the read-only account-activation-status feed for the Account Status tab.
const EDGE = 'https://sjkggguedgtynktymzes.supabase.co/functions/v1';

// ── Constants ─────────────────────────────────────────────────

const DOC_TYPES = {
  employment_contract: 'Employment Contract',
  nda:                 'NDA',
  national_id_card:    'National ID Card',
  academic_transcript: 'Academic Transcript',
  passport:            'Passport',
  visa:                'Visa',
  work_permit:         'Work Permit',
  certificate:         'Certificate',
  signed_policy:       'Signed Policy',
  other:               'Other',
};

const SKILL_CATS = {
  engineering:   'Engineering',
  software:      'Software',
  certification: 'Certification',
};

// Predefined job title list — merged with any titles already in the loaded employee list.
const JOB_TITLES = [
  'Admin / Accountant',
  'CEO / Founder',
  'Electrical Engineer',
  'Finance Manager',
  'Graphic Designer',
  'HR Manager',
  'Lead Electrical Engineer',
  'Mechanical Engineer',
  'Operations Manager',
  'Programmer',
  'Project Manager',
  'Sales Manager',
  'Senior Programmer',
  'Skilled Technician',
  'Software Engineer',
  'Workshop Specialist',
];

// Build <option> list: predefined + any titles from loaded employees + current title.
// Ends with "+ Add new title…" sentinel.
function _jobTitleOpts(currentTitle) {
  const set = new Set(JOB_TITLES);
  for (const e of _employees) { if (e.job_title) set.add(e.job_title); }
  if (currentTitle) set.add(currentTitle);
  const sorted = [...set].sort((a, b) => a.localeCompare(b));
  return [
    `<option value="">— None —</option>`,
    ...sorted.map(t =>
      `<option value="${_attr(t)}"${currentTitle === t ? ' selected' : ''}>${_esc(t)}</option>`
    ),
    `<option value="__new__">+ Add new title…</option>`,
  ].join('');
}

const STATUS_BADGE = {
  active:     'badge badge-member',
  resigned:   'badge badge-client',
  terminated: 'badge badge-rejected',
  pending:    'badge badge-pending',
};

// ── Module state ──────────────────────────────────────────────

let _employees   = [];
let _departments = [];
let _empTypes    = [];
let _statusFilter = 'active';
let _deptFilter   = '';
let _dirEmpId     = null;    // employee picked via the Directory empSelect (filters the table to them)
let _acctEmpId    = null;    // employee picked via the Account Status empSelect
let _acctState    = '';      // Account Status: activation-state filter
let _acctDept     = '';      // Account Status: department filter
let _activeTab    = 'directory';
let _activationMap = null;   // user_id → { force_password_change, last_sign_in_at, banned_until } — lazy-loaded for the Account Status tab

// State for the currently-open modal
let _modalEmployee = null;
let _modalDocs     = [];
let _modalSkills   = [];
let _modalComp     = null;

// ── Page render ───────────────────────────────────────────────

export async function render(profile) {
  _statusFilter = 'active';
  _deptFilter   = '';
  _dirEmpId     = null;
  _acctEmpId    = null;
  _acctState    = '';
  _acctDept     = '';

  const admin = isAdmin();
  _activeTab = (() => {
    try { const t = JSON.parse(sessionStorage.getItem('em_tab_state') || '{}').tab;
          return (t === 'account' && admin) ? 'account' : 'directory'; }
    catch { return 'directory'; }
  })();

  document.getElementById('topbar-left').innerHTML = `
    <span class="topbar-title">Employees</span>
    <button id="em-info" title="Employee ID structure" style="
      background:none;border:none;cursor:pointer;padding:2px 6px;
      color:var(--text-muted);font-size:15px;font-weight:600;
      border-radius:50%;line-height:1;transition:color .15s;
    " onmouseover="this.style.color='var(--text-primary)'"
      onmouseout="this.style.color='var(--text-muted)'">ⓘ</button>
    ${admin ? `<button class="btn btn-primary btn-sm" id="em-add">ADD EMPLOYEE</button>` : ''}
  `;

  const _ta = t => _activeTab === t ? ' active' : '';
  document.getElementById('content').innerHTML = `
    <div class="tabs" id="em-tabs" style="border-bottom:1px solid var(--border);margin-bottom:var(--sp-4)">
      <button class="tab-btn${_ta('directory')}" data-tab="directory">Directory</button>
      ${admin ? `<button class="tab-btn${_ta('account')}" data-tab="account">Account Status</button>` : ''}
    </div>

    <div class="tab-panel${_ta('directory')}" id="em-panel-directory">
      <div class="filter-bar">
        <select id="em-status">
          <option value="active">Active</option>
          <option value="resigned">Resigned</option>
          <option value="terminated">Terminated</option>
          <option value="">All</option>
        </select>
        <select id="em-dept">
          <option value="">All Departments</option>
        </select>
        <span id="em-dir-search-slot" style="display:inline-flex;min-width:240px;"></span>
      </div>
      <div id="em-table-wrap">
        <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
      </div>
    </div>

    ${admin ? `
    <div class="tab-panel${_ta('account')}" id="em-panel-account">
      <div class="filter-bar">
        <select id="em-acct-state">
          <option value="">All accounts</option>
          <option value="not_activated">Not activated</option>
          <option value="never_signed_in">Never signed in</option>
          <option value="not_provisioned">Not provisioned</option>
          <option value="deactivated">Deactivated</option>
          <option value="activated">Activated</option>
        </select>
        <select id="em-acct-dept">
          <option value="">All Departments</option>
        </select>
        <span id="em-acct-search-slot" style="display:inline-flex;min-width:240px;"></span>
      </div>
      <div id="em-account-wrap">
        <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
      </div>
    </div>` : ''}
  `;

  _wireControls(admin);

  try {
    [_departments, _empTypes, _employees] = await Promise.all([
      getDepartments(),
      getEmploymentTypes(),
      getEmployees(),
    ]);
  } catch (err) {
    window.showToast?.(err.message, 'error');
    _departments = []; _empTypes = []; _employees = [];
  }

  const deptOpts = `<option value="">All Departments</option>` +
    _departments.map(d => `<option value="${_attr(d.code)}">${_esc(d.label)}</option>`).join('');
  document.getElementById('em-dept').innerHTML = deptOpts;
  const _acctDeptEl = document.getElementById('em-acct-dept');
  if (_acctDeptEl) _acctDeptEl.innerHTML = deptOpts;

  // Inject + wire the empSelect search pickers now that _employees is loaded.
  _wireEmpSearch('em-dir',  id => { _dirEmpId  = id; _renderTable(); });
  _wireEmpSearch('em-acct', id => { _acctEmpId = id; _renderAccountPanel(); });

  _renderTable();
  if (_activeTab === 'account') _loadAccountPanel();
}

// ── Controls ──────────────────────────────────────────────────

function _wireControls(admin) {
  document.getElementById('em-info')?.addEventListener('click', _openInfoModal);
  document.getElementById('em-add')?.addEventListener('click', () => _openModal(null));

  const content = document.getElementById('content');
  content.querySelector('#em-status')?.addEventListener('change', e => {
    _statusFilter = e.target.value;
    _renderTable();
  });
  content.querySelector('#em-dept')?.addEventListener('change', e => {
    _deptFilter = e.target.value;
    _renderTable();
  });
  content.querySelector('#em-acct-state')?.addEventListener('change', e => {
    _acctState = e.target.value;
    _renderAccountPanel();
  });
  content.querySelector('#em-acct-dept')?.addEventListener('change', e => {
    _acctDept = e.target.value;
    _renderAccountPanel();
  });

  // Page-level tab switching (Directory ⇄ Account Status), remembered across a
  // refresh via sessionStorage. The Account Status panel is admin-only and
  // re-fetches on each open so it's fresh after a provision/reset/deactivate.
  content.querySelectorAll('#em-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tab = btn.dataset.tab;
      _activeTab = tab;
      try { sessionStorage.setItem('em_tab_state', JSON.stringify({ tab })); } catch {}
      content.querySelectorAll('#em-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      content.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('em-panel-' + tab)?.classList.add('active');
      if (tab === 'account') await _loadAccountPanel();
    });
  });
}

// ── Table ─────────────────────────────────────────────────────

function _filtered() {
  return _employees.filter(e => {
    if (_statusFilter && e.status !== _statusFilter) return false;
    if (_deptFilter   && e.department_code !== _deptFilter) return false;
    if (_dirEmpId     && e.id !== _dirEmpId) return false;
    return true;
  });
}

function _renderTable() {
  const wrap  = document.getElementById('em-table-wrap');
  if (!wrap) return;
  const admin = isAdmin();
  const rows  = _filtered();

  if (rows.length === 0) {
    const isFiltered = _dirEmpId || _deptFilter || (_statusFilter !== 'active');
    wrap.innerHTML = `
      <div class="empty-state" style="margin-top:40px">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:.25">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <div class="empty-state-title">${isFiltered ? 'No matching employees' : 'No employees yet'}</div>
        ${admin && !isFiltered ? `<div class="empty-state-sub">Click ADD EMPLOYEE to get started.</div>` : ''}
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Employee ID</th>
            <th>Name</th>
            <th>Department</th>
            <th>Type</th>
            <th>Job Title</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(e => _renderRow(e, admin)).join('')}
        </tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('tbody tr').forEach(tr => {
    const emp = _employees.find(x => x.id === tr.dataset.id);
    if (!emp) return;
    tr.querySelector('.act-edit')?.addEventListener('click',    () => _openModal(emp));
    tr.querySelector('.act-archive')?.addEventListener('click', () => _openArchiveModal(emp));
  });
}

function _renderRow(e, admin) {
  const archived   = e.status === 'resigned' || e.status === 'terminated';
  const deptLabel  = e.department?.label    || e.department_code    || '—';
  const typeLabel  = e.employment_type?.label || e.employment_type_code || '—';
  const badgeCls   = STATUS_BADGE[e.status]  || 'badge';
  const rowStyle   = archived ? ' style="opacity:.55"' : '';

  return `
    <tr data-id="${_attr(e.id)}"${rowStyle}>
      <td><code style="font-family:var(--mono,monospace);font-size:var(--font-xs)">${_esc(e.employee_id || '—')}</code></td>
      <td style="font-weight:500">${_esc(e.full_name || '—')}</td>
      <td class="text-muted" style="font-size:var(--font-sm)">${_esc(deptLabel)}</td>
      <td class="text-muted" style="font-size:var(--font-sm)">${_esc(typeLabel)}</td>
      <td>${e.job_title ? _esc(e.job_title) : '<span class="text-muted">—</span>'}</td>
      <td><span class="${_attr(badgeCls)}">${_esc(e.status || '—')}</span></td>
      <td class="col-actions">
        <div class="row-actions">
          ${admin ? `
          <button class="row-action-btn act-edit" title="Edit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>` : ''}
          ${admin && !archived ? `
          <button class="row-action-btn act-archive" title="Archive employee">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="21 8 21 21 3 21 3 8"/>
              <rect x="1" y="3" width="22" height="5"/>
              <line x1="10" y1="12" x2="14" y2="12"/>
            </svg>
          </button>` : ''}
        </div>
      </td>
    </tr>`;
}

// ── Account Status tab (admin) ────────────────────────────────

// Fetch + render the activation panel. Re-runs on every tab open so the data
// is fresh after a Reset / Provision done from the modal.
async function _loadAccountPanel() {
  const wrap = document.getElementById('em-account-wrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="empty-state"><div class="empty-state-title">Loading…</div></div>`;
  const map = await _fetchActivationMap();
  if (!map) {
    wrap.innerHTML = `
      <div class="empty-state" style="margin-top:40px">
        <div class="empty-state-title">Couldn't load account status</div>
        <div class="empty-state-sub">Check your connection and reopen this tab.</div>
      </div>`;
    return;                       // leave _activationMap untouched → retry on next open
  }
  _activationMap = map;
  _renderAccountPanel();
}

// Returns { user_id: {force_password_change,...} } on success, or null on failure.
async function _fetchActivationMap() {
  try {
    const token = getSession()?.access_token;
    const res = await fetch(`${EDGE}/account-activation-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.accounts || {};
  } catch {
    return null;
  }
}

// 'not_provisioned' | 'never_signed_in' | 'not_activated' | 'activated'
function _activationState(e) {
  if (!e.user_id) return 'not_provisioned';
  const a = _activationMap?.[e.user_id];
  if (a && a.banned_until && new Date(a.banned_until) > new Date()) return 'deactivated';
  if (!a || !a.force_password_change) return 'activated';   // absent from map → don't false-flag
  return a.last_sign_in_at ? 'not_activated' : 'never_signed_in';
}

// True if the account is currently banned (deactivated) per the activation map.
function _isDeactivated(emp) {
  const a = _activationMap?.[emp?.user_id];
  return !!(a && a.banned_until && new Date(a.banned_until) > new Date());
}

function _renderAccountPanel() {
  const wrap = document.getElementById('em-account-wrap');
  if (!wrap) return;

  const META = {
    never_signed_in: { label: 'Never signed in', cls: 'badge badge-rejected', rank: 0 },
    not_activated:   { label: 'Not activated',   cls: 'badge badge-pending',  rank: 1 },
    not_provisioned: { label: 'Not provisioned', cls: 'badge badge-pending',  rank: 2 },
    deactivated:     { label: 'Deactivated',     cls: 'badge badge-client',   rank: 3 },
    activated:       { label: 'Activated',       cls: 'badge badge-member',   rank: 4 },
  };
  const ATTENTION = new Set(['never_signed_in', 'not_activated', 'not_provisioned']);

  // Live roster only (active/pending), with the tab's filters applied; attention-first, then by name.
  const list = _employees
    .filter(e => e.status === 'active' || e.status === 'pending')
    .filter(e => !_acctDept  || e.department_code === _acctDept)
    .filter(e => !_acctEmpId || e.id === _acctEmpId)
    .map(e => ({ e, st: _activationState(e) }))
    .filter(x => !_acctState || x.st === _acctState)
    .sort((a, b) => (META[a.st].rank - META[b.st].rank) ||
                    (a.e.full_name || '').localeCompare(b.e.full_name || ''));

  if (list.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:40px">
      <div class="empty-state-title">No matching accounts</div></div>`;
    return;
  }

  const pending = list.filter(x => ATTENTION.has(x.st)).length;
  const signIn = a => (a && a.last_sign_in_at)
    ? _esc(a.last_sign_in_at.slice(0, 10))
    : '<span class="text-muted">never</span>';

  wrap.innerHTML = `
    <div class="text-muted" style="margin-bottom:var(--sp-3);font-size:var(--font-sm)">
      ${pending === 0
        ? '✓ No accounts awaiting activation.'
        : `<strong style="color:var(--text-primary)">${pending}</strong> account${pending === 1 ? '' : 's'} awaiting activation — click a row to provision or reset.`}
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>Name</th><th>Employee ID</th><th>Department</th><th>Account</th><th>Last sign-in</th></tr>
        </thead>
        <tbody>
          ${list.map(({ e, st }) => {
            const m = META[st];
            const a = _activationMap?.[e.user_id];
            return `
            <tr data-id="${_attr(e.id)}" style="cursor:pointer">
              <td style="font-weight:500">${_esc(e.full_name || '—')}</td>
              <td><code style="font-family:var(--mono,monospace);font-size:var(--font-xs)">${_esc(e.employee_id || '—')}</code></td>
              <td class="text-muted" style="font-size:var(--font-sm)">${_esc(e.department?.label || e.department_code || '—')}</td>
              <td><span class="${m.cls}">${m.label}</span></td>
              <td class="text-muted" style="font-size:var(--font-sm)">${signIn(a)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('tbody tr').forEach(tr => {
    const emp = _employees.find(x => x.id === tr.dataset.id);
    if (emp) tr.addEventListener('click', () => _openModal(emp));
  });
}

// Inject + wire an empSelect picker into a `<span id="{prefix}-search-slot">`.
function _wireEmpSearch(prefix, onPick) {
  const slot = document.getElementById(`${prefix}-search-slot`);
  if (!slot) return;
  slot.innerHTML = empSelectHtml(prefix, _employees, { placeholder: 'Search name or ID…' });
  wireEmpSelect(prefix, _employees, emp => onPick(emp?.id ?? null));
}

// Re-fetch the roster after a mutation (provision / save / link / deactivate) and
// re-render the active tab, so the UI is fresh without a manual page reload.
async function _refreshEmployees() {
  try { _employees = await getEmployees(); } catch { /* keep stale list on error */ }
  if (_activeTab === 'account') await _loadAccountPanel();
  else _renderTable();
}

// ── Create / Edit modal ───────────────────────────────────────

async function _openModal(employee) {
  _modalEmployee = employee;
  const isEdit   = !!employee;
  const admin    = isAdmin();
  const mount    = document.getElementById('modal-mount');

  mount.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal modal-lg" style="min-height:200px">
        <div class="modal-body" style="align-items:center;justify-content:center;display:flex">
          <span class="text-muted">Loading…</span>
        </div>
      </div>
    </div>`;

  if (isEdit && admin) {
    try {
      [_modalComp, _modalDocs, _modalSkills] = await Promise.all([
        getCompensation(employee.id),
        getDocuments(employee.id),
        getSkills(employee.id),
      ]);
    } catch { _modalComp = null; _modalDocs = []; _modalSkills = []; }
  } else {
    _modalComp = null; _modalDocs = []; _modalSkills = [];
  }

  _renderModal(isEdit, admin);
}

function _renderModal(isEdit, admin) {
  const emp  = _modalEmployee || {};
  const comp = _modalComp    || {};
  const mount = document.getElementById('modal-mount');

  const tabs = [
    { id: 'personal',   label: 'Personal' },
    { id: 'employment', label: 'Employment' },
    ...(admin ? [{ id: 'compensation', label: 'Compensation' }] : []),
    ...(admin && isEdit ? [
      { id: 'documents', label: 'Documents' },
      { id: 'skills',    label: 'Skills' },
    ] : []),
  ];

  const managerOpts = _employees
    .filter(e => e.status === 'active' && e.id !== emp.id)
    .map(e => `<option value="${_attr(e.id)}" ${emp.direct_manager_id === e.id ? 'selected' : ''}>
                 ${_esc(e.employee_id || '')} — ${_esc(e.full_name || '')}
               </option>`)
    .join('');

  const deptOpts = _departments.map(d =>
    `<option value="${_attr(d.code)}" ${emp.department_code === d.code ? 'selected' : ''}>${_esc(d.label)}</option>`
  ).join('');

  const typeOpts = _empTypes.map(t =>
    `<option value="${_attr(t.code)}" ${emp.employment_type_code === t.code ? 'selected' : ''}>${_esc(t.label)}</option>`
  ).join('');

  mount.innerHTML = `
    <div class="modal-backdrop" id="em-modal-backdrop">
      <div class="modal modal-lg" id="em-modal">

        <div class="modal-header">
          <span class="modal-title">${isEdit ? `Edit — ${_esc(emp.employee_id || emp.full_name || '')}` : 'Add Employee'}</span>
          <button class="modal-close" id="em-modal-close">&times;</button>
        </div>

        <div class="tabs" style="padding:0 var(--sp-5);margin-bottom:0;border-bottom:1px solid var(--border)">
          ${tabs.map((t, i) =>
            `<button class="tab-btn${i === 0 ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`
          ).join('')}
        </div>

        <div class="modal-body" style="padding-top:var(--sp-4)">

          <!-- ── Personal ─────────────────────────────────── -->
          <div class="tab-panel active" id="em-tab-personal">
            <div class="form-group">
              <label>Full Name *</label>
              <input type="text" id="em-f-name" value="${_attr(emp.full_name || '')}" placeholder="Full name">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)">
              <div class="form-group">
                <label>Contact Email (work)</label>
                <input type="email" id="em-f-contact-email" value="${_attr(emp.contact_email || '')}"
                       placeholder="firstname.hubbleeng@gmail.com">
              </div>
              <div class="form-group">
                <label>Personal Phone</label>
                <input type="text" id="em-f-phone" value="${_attr(emp.personal_phone || '')}" placeholder="+66…">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)">
              <div class="form-group">
                <label>Personal Email</label>
                <input type="email" id="em-f-personal-email" value="${_attr(emp.personal_email || '')}">
              </div>
              <div class="form-group">
                <label>Date of Birth</label>
                <input type="date" id="em-f-dob" value="${_attr(emp.date_of_birth || '')}">
              </div>
            </div>
            <div style="border-top:1px solid var(--border);padding-top:var(--sp-3);margin-top:var(--sp-1)">
              <div class="text-muted" style="font-size:var(--font-xs);font-weight:600;margin-bottom:var(--sp-2)">EMERGENCY CONTACT</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)">
                <div class="form-group">
                  <label>Name</label>
                  <input type="text" id="em-f-ec-name" value="${_attr(emp.emergency_contact_name || '')}">
                </div>
                <div class="form-group">
                  <label>Relationship</label>
                  <input type="text" id="em-f-ec-rel" value="${_attr(emp.emergency_contact_relationship || '')}"
                         placeholder="Spouse, Parent…">
                </div>
              </div>
              <div class="form-group">
                <label>Phone</label>
                <input type="text" id="em-f-ec-phone" value="${_attr(emp.emergency_contact_phone || '')}">
              </div>
            </div>
          </div>

          <!-- ── Employment ──────────────────────────────── -->
          <div class="tab-panel" id="em-tab-employment">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)">
              <div class="form-group">
                <label>Department *
                  ${isEdit && emp.employment_type_code === '1'
                    ? `<span class="text-muted" style="font-size:var(--font-xs);font-weight:400;margin-left:4px">· locked (full-time)</span>`
                    : ''}
                </label>
                <select id="em-f-dept" ${isEdit && emp.employment_type_code === '1' ? 'disabled' : ''}>
                  <option value="">— Select —</option>
                  ${deptOpts}
                </select>
              </div>
              <div class="form-group">
                <label>Employment Type *</label>
                <select id="em-f-type">
                  <option value="">— Select —</option>
                  ${typeOpts}
                </select>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)">
              <div class="form-group">
                <label>Job Title</label>
                <select id="em-f-title-sel">${_jobTitleOpts(emp.job_title || '')}</select>
                <input type="text" id="em-f-title-new"
                       placeholder="Type new title and save…"
                       style="margin-top:6px;display:none;">
              </div>
              <div class="form-group">
                <label>Salary Grade</label>
                <input type="text" id="em-f-grade" value="${_attr(emp.salary_grade || '')}">
              </div>
            </div>
            <div class="form-group">
              <label>Direct Manager</label>
              <select id="em-f-manager">
                <option value="">— None —</option>
                ${managerOpts}
              </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--sp-3)">
              <div class="form-group">
                <label>Start Date</label>
                <input type="date" id="em-f-start" value="${_attr(emp.start_date || '')}">
              </div>
              <div class="form-group">
                <label>Contract End</label>
                <input type="date" id="em-f-contract-end" value="${_attr(emp.contract_end_date || '')}">
              </div>
              <div class="form-group">
                <label>Probation End</label>
                <input type="date" id="em-f-probation" value="${_attr(emp.probation_end_date || '')}">
              </div>
            </div>
            ${isEdit ? `
            <div class="form-group">
              <label>Status</label>
              <select id="em-f-status">
                <option value="pending"    ${emp.status === 'pending'    ? 'selected' : ''}>Pending</option>
                <option value="active"     ${emp.status === 'active'     ? 'selected' : ''}>Active</option>
                <option value="resigned"   ${emp.status === 'resigned'   ? 'selected' : ''}>Resigned</option>
                <option value="terminated" ${emp.status === 'terminated' ? 'selected' : ''}>Terminated</option>
              </select>
            </div>
            <div style="border-top:1px solid var(--border);padding-top:var(--sp-3);margin-top:var(--sp-1)">
              <div class="text-muted" style="font-size:var(--font-xs);font-weight:600;margin-bottom:var(--sp-2)">
                LINKED USER ACCOUNT
                <span style="font-weight:400;margin-left:6px;">— required for leave requests</span>
              </div>
              <div id="em-link-status" style="font-size:var(--font-sm);margin-bottom:var(--sp-2);">
                ${emp.linked_user
                  ? `<span style="color:var(--accent)">✓ Linked:</span> ${_esc(emp.linked_user.name || '')} &lt;${_esc(emp.linked_user.email || '')}&gt;`
                  : `<span style="color:#ef9a9a">✗ Not linked</span> — this employee cannot submit leave requests`
                }
              </div>
              <div style="display:flex;gap:var(--sp-2);align-items:center;">
                <input type="email" id="em-link-email" class="form-input" style="flex:1;max-width:280px;"
                       placeholder="Google account email"
                       value="${emp.linked_user ? _attr(emp.linked_user.email || '') : _attr(emp.contact_email || '')}">
                <button class="btn btn-ghost btn-sm" id="em-link-btn">Link / Update</button>
                ${emp.linked_user ? `<button class="btn btn-ghost btn-sm" id="em-unlink-btn" style="color:var(--error)">Unlink</button>` : ''}
              </div>
            </div>` : ''}
          </div>

          <!-- ── Compensation (admin) ────────────────────── -->
          ${admin ? `
          <div class="tab-panel" id="em-tab-compensation">
            <div style="background:rgba(255,152,0,0.08);border-left:3px solid #ffb74d;
                        padding:8px 12px;border-radius:0 6px 6px 0;margin-bottom:var(--sp-3)">
              <span class="text-muted" style="font-size:var(--font-xs)">
                Bank details are stored as plain text until Phase 1 (server-side encryption). Admin access only.
              </span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)">
              <div class="form-group">
                <label>Salary (THB / month)</label>
                <input type="number" id="em-f-salary" min="0" step="1"
                       value="${_attr(comp.salary != null ? comp.salary : '')}">
              </div>
              <div class="form-group">
                <label>Hourly Rate (THB)</label>
                <input type="number" id="em-f-hourly" min="0" step="0.01"
                       value="${_attr(comp.hourly_rate != null ? comp.hourly_rate : '')}">
              </div>
            </div>
            <div class="form-group">
              <label>Pay Frequency</label>
              <select id="em-f-payfreq">
                <option value="">— Select —</option>
                ${['monthly','bi-weekly','weekly','hourly'].map(v =>
                  `<option value="${v}" ${comp.pay_frequency === v ? 'selected' : ''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`
                ).join('')}
              </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)">
              <div class="form-group">
                <label>Bank Name</label>
                <input type="text" id="em-f-bank-name" value="${_attr(comp.bank_name || '')}">
              </div>
              <div class="form-group">
                <label>Bank Account</label>
                <input type="text" id="em-f-bank-acct" value="${_attr(comp.bank_account || '')}">
              </div>
            </div>
            <div class="form-group">
              <label>Bonus / Equity notes</label>
              <input type="text" id="em-f-bonus" value="${_attr(comp.bonus_equity || '')}">
            </div>
            <div style="border-top:1px solid var(--border);padding-top:var(--sp-3);margin-top:var(--sp-1)">
              <div class="text-muted" style="font-size:var(--font-xs);font-weight:600;margin-bottom:var(--sp-2)">IDENTITY DOCUMENTS</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)">
                <div class="form-group">
                  <label>National ID</label>
                  <input type="text" id="em-f-natid" value="${_attr(comp.national_id || '')}">
                </div>
                <div class="form-group">
                  <label>Passport Number</label>
                  <input type="text" id="em-f-passport" value="${_attr(comp.passport_number || '')}">
                </div>
              </div>
            </div>
          </div>` : ''}

          <!-- ── Documents (admin + edit only) ──────────── -->
          ${admin && isEdit ? `
          <div class="tab-panel" id="em-tab-documents">
            <div id="em-docs-list"></div>
            <div style="border-top:1px solid var(--border);padding-top:var(--sp-3);margin-top:var(--sp-3)">
              <div class="text-muted" style="font-size:var(--font-xs);font-weight:600;margin-bottom:var(--sp-2)">ADD DOCUMENT RECORD</div>
              <div style="background:rgba(78,161,255,0.08);border-left:3px solid var(--accent);
                          padding:8px 12px;border-radius:0 6px 6px 0;margin-bottom:var(--sp-3)">
                <span class="text-muted" style="font-size:var(--font-xs)">
                  File upload available after Supabase Storage is configured (Phase 1). Saves metadata only.
                </span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)">
                <div class="form-group">
                  <label>Document Type</label>
                  <select id="em-doc-type">
                    <option value="">— Select type —</option>
                    ${Object.entries(DOC_TYPES).map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label>Title / Reference</label>
                  <input type="text" id="em-doc-title" placeholder="Optional label">
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)">
                <div class="form-group">
                  <label>Issue Date</label>
                  <input type="date" id="em-doc-issue">
                </div>
                <div class="form-group">
                  <label>Expiry Date</label>
                  <input type="date" id="em-doc-expiry">
                </div>
              </div>
              <button class="btn btn-ghost btn-sm" id="em-doc-add">+ ADD RECORD</button>
            </div>
          </div>` : ''}

          <!-- ── Skills (admin + edit only) ──────────────── -->
          ${admin && isEdit ? `
          <div class="tab-panel" id="em-tab-skills">
            <div id="em-skills-list"></div>
            <div style="border-top:1px solid var(--border);padding-top:var(--sp-3);margin-top:var(--sp-3)">
              <div class="text-muted" style="font-size:var(--font-xs);font-weight:600;margin-bottom:var(--sp-2)">ADD SKILL</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--sp-3)">
                <div class="form-group">
                  <label>Category</label>
                  <select id="em-sk-cat">
                    <option value="">— Select —</option>
                    ${Object.entries(SKILL_CATS).map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label>Skill Name</label>
                  <input type="text" id="em-sk-name" placeholder="e.g. Structural FEA">
                </div>
                <div class="form-group">
                  <label>Level (optional)</label>
                  <input type="text" id="em-sk-level" placeholder="e.g. Advanced">
                </div>
              </div>
              <button class="btn btn-ghost btn-sm" id="em-sk-add">+ ADD SKILL</button>
            </div>
          </div>` : ''}

        </div><!-- /.modal-body -->

        <div class="modal-footer" style="justify-content:space-between;flex-wrap:wrap;gap:var(--sp-2)">
          <div style="display:flex;gap:var(--sp-2);">
            ${admin && isEdit && !emp.linked_user
              ? `<button class="btn btn-sm" id="em-provision-btn"
                   style="background:var(--accent);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:var(--font-sm);cursor:pointer;">
                   Provision Account
                 </button>`
              : ''}
            ${admin && isEdit && emp.user_id
              ? `<button class="btn btn-ghost btn-sm" id="em-reset-pwd-btn" style="color:#ffb74d;border-color:#ffb74d;">
                   Reset Password
                 </button>
                 <button class="btn btn-ghost btn-sm" id="em-clear-mfa-btn" style="color:#ef9a9a;border-color:#ef9a9a;">
                   Clear 2FA
                 </button>
                 <button class="btn btn-ghost btn-sm" id="em-deact-btn" style="color:#bdbdbd;border-color:#888;">
                   ${_isDeactivated(emp) ? 'Reactivate' : 'Deactivate'} account
                 </button>`
              : ''}
          </div>
          <div style="display:flex;gap:var(--sp-2);">
            <button class="btn btn-ghost" id="em-modal-cancel">Cancel</button>
            <button class="btn btn-primary" id="em-modal-save">${isEdit ? 'SAVE' : 'CREATE'}</button>
          </div>
        </div>
        <div id="em-credential-box" style="display:none;padding:10px 20px 14px;
             background:rgba(3,169,244,0.08);border-top:1px solid rgba(3,169,244,0.3);
             font-size:var(--font-sm);line-height:1.7;">
          <div id="em-credential-text"></div>
          <button class="btn btn-ghost btn-sm" id="em-copy-cred" style="margin-top:6px;">Copy credentials</button>
        </div>
      </div>
    </div>`;

  // Close handlers (✕ / Cancel / backdrop; Esc handled globally in app.html)
  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#em-modal-close').addEventListener('click', close);
  mount.querySelector('#em-modal-cancel').addEventListener('click', close);
  mount.querySelector('#em-modal-backdrop').addEventListener('click', e => {
    if (e.target.id === 'em-modal-backdrop') close();
  });

  // Tab switching
  mount.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mount.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      mount.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`em-tab-${btn.dataset.tab}`)?.classList.add('active');
    });
  });

  // Render docs & skills lists, wire their add forms
  if (admin && isEdit) {
    _renderDocsList();
    _renderSkillsList();
    _wireDocAdd();
    _wireSkillAdd();
  }

  // ── Link / Unlink user account (admin, edit mode only) ──────
  if (admin && isEdit) {
    mount.querySelector('#em-link-btn')?.addEventListener('click', async () => {
      const email  = mount.querySelector('#em-link-email')?.value.trim();
      if (!email) { window.showToast?.('Enter the employee\'s Google account email', 'error'); return; }

      const btn = mount.querySelector('#em-link-btn');
      btn.disabled = true;
      try {
        const profile = await findProfileByEmail(email);
        if (!profile) {
          window.showToast?.(`No account found for "${email}" — they must sign in once first`, 'error');
          return;
        }
        const updated = await updateEmployee(_modalEmployee.id, { userId: profile.id });
        _modalEmployee = updated;
        const idx = _employees.findIndex(x => x.id === updated.id);
        if (idx >= 0) _employees[idx] = updated;

        const statusEl = mount.querySelector('#em-link-status');
        if (statusEl) statusEl.innerHTML =
          `<span style="color:var(--accent)">✓ Linked:</span> ${_esc(profile.name || '')} &lt;${_esc(profile.email)}&gt;`;

        window.showToast?.(`Linked to ${profile.email}`, 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    mount.querySelector('#em-unlink-btn')?.addEventListener('click', async () => {
      if (!await confirmModal({ title: 'Remove account link', message: 'Remove the account link? The employee will not be able to submit leave requests until re-linked.', confirmText: 'Remove link', danger: true })) return;
      const btn = mount.querySelector('#em-unlink-btn');
      btn.disabled = true;
      try {
        const updated = await updateEmployee(_modalEmployee.id, { userId: null });
        _modalEmployee = updated;
        const idx = _employees.findIndex(x => x.id === updated.id);
        if (idx >= 0) _employees[idx] = updated;

        const statusEl = mount.querySelector('#em-link-status');
        if (statusEl) statusEl.innerHTML =
          `<span style="color:#ef9a9a">✗ Not linked</span> — this employee cannot submit leave requests`;
        btn.style.display = 'none';

        window.showToast?.('Account unlinked', 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  // ── Provision account (admin, edit mode, no linked user) ────
  if (admin && isEdit) {
    mount.querySelector('#em-provision-btn')?.addEventListener('click', async () => {
      if (!_modalEmployee.contact_email) {
        window.showToast?.('Set the work email (Personal tab) and click SAVE before provisioning', 'error');
        return;
      }
      const btn = mount.querySelector('#em-provision-btn');
      btn.disabled = true;
      btn.textContent = 'Provisioning…';
      try {
        const token = getSession()?.access_token;
        const res = await fetch(`${EDGE}/provision-users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ employee_ids: [_modalEmployee.employee_id] }),
        });
        const data = await res.json();
        const result = data.provisioned?.[0];
        if (!res.ok || !result) throw new Error(data.error || 'Provision failed');
        if (result.error) throw new Error(result.error);

        const credText = `Employee ID: ${result.employee_id}\nTemp password: ${result.temp_password}`;
        const box  = mount.querySelector('#em-credential-box');
        const text = mount.querySelector('#em-credential-text');
        text.innerHTML = `<strong>Account created.</strong> Share these credentials privately:<br>
          <span style="font-family:monospace">Employee ID: ${_esc(result.employee_id)}</span><br>
          <span style="font-family:monospace">Temp password: ${_esc(result.temp_password)}</span><br>
          <span style="color:var(--warning);font-size:11px">⚠ Employee must change password on first login</span>`;
        mount.querySelector('#em-copy-cred').onclick = () => {
          navigator.clipboard.writeText(credText);
          window.showToast?.('Credentials copied', 'success');
        };
        box.style.display = '';

        mount.querySelector('#em-link-status').innerHTML =
          `<span style="color:var(--accent)">✓ Account provisioned</span> — ${_esc(result.email)}`;
        btn.style.display = 'none';
        window.showToast?.('Account provisioned', 'success');
        await _refreshEmployees();   // pick up the new user_id link so the tab/table update without a reload
      } catch (err) {
        window.showToast?.(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Provision Account';
      }
    });

    // ── Reset password (admin, edit mode, has linked user) ──────
    mount.querySelector('#em-reset-pwd-btn')?.addEventListener('click', async () => {
      if (!await confirmModal({ title: 'Reset password', message: `Reset password for ${_modalEmployee.full_name}? A new temporary password will be generated.`, confirmText: 'Reset password', danger: true })) return;
      const btn = mount.querySelector('#em-reset-pwd-btn');
      btn.disabled = true;
      btn.textContent = 'Resetting…';
      try {
        const token = getSession()?.access_token;
        const res = await fetch(`${EDGE}/admin-reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ target_user_id: _modalEmployee.user_id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Reset failed');

        const credText = `Employee ID: ${_modalEmployee.employee_id}\nNew password: ${data.new_password}`;
        const box  = mount.querySelector('#em-credential-box');
        const text = mount.querySelector('#em-credential-text');
        text.innerHTML = `<strong>Password reset.</strong> Share this privately:<br>
          <span style="font-family:monospace">Employee ID: ${_esc(_modalEmployee.employee_id)}</span><br>
          <span style="font-family:monospace">New password: ${_esc(data.new_password)}</span><br>
          <span style="color:var(--warning);font-size:11px">⚠ Employee must change password on next login</span>`;
        mount.querySelector('#em-copy-cred').onclick = () => {
          navigator.clipboard.writeText(credText);
          window.showToast?.('Credentials copied', 'success');
        };
        box.style.display = '';
        window.showToast?.('Password reset — share the new password with the employee', 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Reset Password';
      }
    });

    // ── Clear 2FA (admin, edit mode, has linked user) ───────────
    mount.querySelector('#em-clear-mfa-btn')?.addEventListener('click', async () => {
      if (!await confirmModal({ title: 'Clear 2FA', message: `Clear two-factor authentication for ${_modalEmployee.full_name}? They'll be able to sign in without a 2FA code and can re-enroll from Preferences.`, confirmText: 'Clear 2FA', danger: true })) return;
      const btn = mount.querySelector('#em-clear-mfa-btn');
      btn.disabled = true;
      btn.textContent = 'Clearing…';
      try {
        const token = getSession()?.access_token;
        const res = await fetch(`${EDGE}/admin-clear-mfa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ target_user_id: _modalEmployee.user_id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Clear 2FA failed');
        window.showToast?.(data.removed > 0
          ? `2FA cleared (${data.removed} factor${data.removed > 1 ? 's' : ''} removed)`
          : 'No 2FA factor was enrolled', 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Clear 2FA';
      }
    });

    // ── Deactivate / Reactivate account (admin, edit mode, has linked user) ──
    mount.querySelector('#em-deact-btn')?.addEventListener('click', async () => {
      const makeActive = _isDeactivated(_modalEmployee);   // currently off → reactivate; else deactivate
      const verb = makeActive ? 'Reactivate' : 'Deactivate';
      const ok = await confirmModal({
        title: verb + ' account',
        message: makeActive
          ? `Reactivate ${_modalEmployee.full_name}'s account? They'll be able to sign in again.`
          : `Deactivate ${_modalEmployee.full_name}'s account? They will not be able to sign in until reactivated. Their employee record and data are kept.`,
        confirmText: verb, danger: !makeActive,
      });
      if (!ok) return;
      const btn = mount.querySelector('#em-deact-btn');
      btn.disabled = true;
      btn.textContent = (makeActive ? 'Reactivating' : 'Deactivating') + '…';
      try {
        const token = getSession()?.access_token;
        const res = await fetch(`${EDGE}/admin-set-account-active`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ target_user_id: _modalEmployee.user_id, active: makeActive }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Action failed');
        window.showToast?.(makeActive ? 'Account reactivated' : 'Account deactivated', 'success');
        _activationMap = (await _fetchActivationMap()) || _activationMap;
        btn.disabled = false;
        btn.textContent = (_isDeactivated(_modalEmployee) ? 'Reactivate' : 'Deactivate') + ' account';
        if (_activeTab === 'account') _renderAccountPanel();
      } catch (err) {
        window.showToast?.(err.message, 'error');
        btn.disabled = false;
        btn.textContent = verb + ' account';
      }
    });
  }

  // Job title combo — reveal text input when "+ Add new title…" is selected
  mount.querySelector('#em-f-title-sel')?.addEventListener('change', function () {
    const newInput = mount.querySelector('#em-f-title-new');
    if (!newInput) return;
    if (this.value === '__new__') {
      newInput.style.display = '';
      newInput.focus();
    } else {
      newInput.style.display = 'none';
      newInput.value = '';
    }
  });

  // Save handler
  mount.querySelector('#em-modal-save').addEventListener('click', async () => {
    const name = mount.querySelector('#em-f-name')?.value.trim();
    const dept = mount.querySelector('#em-f-dept')?.value;
    const type = mount.querySelector('#em-f-type')?.value;
    if (!name) { window.showToast?.('Full name is required', 'error'); return; }
    if (!dept) { window.showToast?.('Department is required — go to Employment tab', 'error'); return; }
    if (!type) { window.showToast?.('Employment type is required — go to Employment tab', 'error'); return; }

    const saveBtn = mount.querySelector('#em-modal-save');
    saveBtn.disabled = true;

    try {
      // Build employee payload
      const payload = {
        fullName:                     name,
        departmentCode:               dept,
        employmentTypeCode:           type,
        jobTitle: (() => {
                                const sel = mount.querySelector('#em-f-title-sel')?.value;
                                if (sel === '__new__') return mount.querySelector('#em-f-title-new')?.value.trim() || null;
                                return sel || null;
                              })(),
        salaryGrade:                  mount.querySelector('#em-f-grade')?.value.trim()         || null,
        directManagerId:              mount.querySelector('#em-f-manager')?.value              || null,
        contactEmail:                 mount.querySelector('#em-f-contact-email')?.value.trim() || null,
        personalEmail:                mount.querySelector('#em-f-personal-email')?.value.trim()|| null,
        personalPhone:                mount.querySelector('#em-f-phone')?.value.trim()         || null,
        dateOfBirth:                  mount.querySelector('#em-f-dob')?.value                  || null,
        emergencyContactName:         mount.querySelector('#em-f-ec-name')?.value.trim()       || null,
        emergencyContactRelationship: mount.querySelector('#em-f-ec-rel')?.value.trim()        || null,
        emergencyContactPhone:        mount.querySelector('#em-f-ec-phone')?.value.trim()      || null,
        startDate:                    mount.querySelector('#em-f-start')?.value                || null,
        contractEndDate:              mount.querySelector('#em-f-contract-end')?.value         || null,
        probationEndDate:             mount.querySelector('#em-f-probation')?.value            || null,
      };
      if (isEdit) {
        payload.status = mount.querySelector('#em-f-status')?.value;
      }

      let saved;
      if (isEdit) {
        saved = await updateEmployee(_modalEmployee.id, payload);
        const idx = _employees.findIndex(x => x.id === saved.id);
        if (idx >= 0) _employees[idx] = saved;
        // Keep profiles.name (shown in Team page) in sync with employees.full_name
        if (payload.fullName && saved.user_id) {
          await updateProfileName(saved.user_id, payload.fullName).catch(() => {});
        }
      } else {
        saved = await createEmployee(payload);
        _employees.push(saved);
      }

      // Save compensation (admin only; upsert only when at least one field set)
      if (admin) {
        const sal    = mount.querySelector('#em-f-salary')?.value.trim();
        const hourly = mount.querySelector('#em-f-hourly')?.value.trim();
        const compPayload = {
          salary:         sal    ? parseFloat(sal)    : null,
          hourlyRate:     hourly ? parseFloat(hourly) : null,
          payFrequency:   mount.querySelector('#em-f-payfreq')?.value              || null,
          bankName:       mount.querySelector('#em-f-bank-name')?.value.trim()     || null,
          bankAccount:    mount.querySelector('#em-f-bank-acct')?.value.trim()     || null,
          bonusEquity:    mount.querySelector('#em-f-bonus')?.value.trim()         || null,
          nationalId:     mount.querySelector('#em-f-natid')?.value.trim()         || null,
          passportNumber: mount.querySelector('#em-f-passport')?.value.trim()      || null,
        };
        if (Object.values(compPayload).some(v => v !== null && v !== '')) {
          await upsertCompensation(saved.id, compPayload);
        }
      }

      window.showToast?.(isEdit ? 'Employee updated' : 'Employee created', 'success');
      close();
      await _refreshEmployees();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      saveBtn.disabled = false;
    }
  });
}

// ── Documents list & add ──────────────────────────────────────

function _renderDocsList() {
  const list = document.getElementById('em-docs-list');
  if (!list) return;

  if (_modalDocs.length === 0) {
    list.innerHTML = `<p class="text-muted" style="font-size:var(--font-sm);margin:0 0 var(--sp-2)">No documents on record.</p>`;
    return;
  }

  list.innerHTML = _modalDocs.map(doc => {
    const label  = DOC_TYPES[doc.doc_type] || doc.doc_type;
    const expiry = doc.expiry_date
      ? `<span class="badge badge-pending" style="flex-shrink:0">expires ${_esc(doc.expiry_date)}</span>`
      : '';
    return `
      <div style="display:flex;align-items:center;gap:var(--sp-2);padding:7px 0;border-bottom:1px solid var(--border)">
        <span class="badge badge-client" style="flex-shrink:0">${_esc(label)}</span>
        <span style="flex:1;font-size:var(--font-sm)">${doc.title ? _esc(doc.title) : '<span class="text-muted">—</span>'}</span>
        ${expiry}
        <button class="row-action-btn danger em-doc-del" data-id="${_attr(doc.id)}" title="Remove" style="flex-shrink:0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>`;
  }).join('');

  list.querySelectorAll('.em-doc-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await deleteDocument(btn.dataset.id);
        _modalDocs = _modalDocs.filter(d => d.id !== btn.dataset.id);
        _renderDocsList();
      } catch (err) {
        window.showToast?.(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

function _wireDocAdd() {
  document.getElementById('em-doc-add')?.addEventListener('click', async () => {
    const typeEl   = document.getElementById('em-doc-type');
    const titleEl  = document.getElementById('em-doc-title');
    const issueEl  = document.getElementById('em-doc-issue');
    const expiryEl = document.getElementById('em-doc-expiry');

    if (!typeEl?.value) { window.showToast?.('Select a document type', 'error'); return; }

    const btn = document.getElementById('em-doc-add');
    btn.disabled = true;
    try {
      const doc = await addDocument({
        employeeId: _modalEmployee.id,
        docType:    typeEl.value,
        title:      titleEl?.value.trim()  || null,
        issueDate:  issueEl?.value         || null,
        expiryDate: expiryEl?.value        || null,
      });
      _modalDocs.push(doc);
      _renderDocsList();
      if (typeEl)   typeEl.value   = '';
      if (titleEl)  titleEl.value  = '';
      if (issueEl)  issueEl.value  = '';
      if (expiryEl) expiryEl.value = '';
      window.showToast?.('Document added', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── Skills list & add ─────────────────────────────────────────

function _renderSkillsList() {
  const list = document.getElementById('em-skills-list');
  if (!list) return;

  if (_modalSkills.length === 0) {
    list.innerHTML = `<p class="text-muted" style="font-size:var(--font-sm);margin:0 0 var(--sp-2)">No skills on record.</p>`;
    return;
  }

  list.innerHTML = _modalSkills.map(sk => {
    const catLabel = SKILL_CATS[sk.category] || sk.category;
    return `
      <div style="display:flex;align-items:center;gap:var(--sp-2);padding:7px 0;border-bottom:1px solid var(--border)">
        <span class="badge badge-admin" style="flex-shrink:0">${_esc(catLabel)}</span>
        <span style="flex:1;font-size:var(--font-sm);font-weight:500">${_esc(sk.name)}</span>
        ${sk.level ? `<span class="text-muted" style="font-size:var(--font-xs)">${_esc(sk.level)}</span>` : ''}
        <button class="row-action-btn danger em-sk-del" data-id="${_attr(sk.id)}" title="Remove" style="flex-shrink:0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;
  }).join('');

  list.querySelectorAll('.em-sk-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await removeSkill(btn.dataset.id);
        _modalSkills = _modalSkills.filter(s => s.id !== btn.dataset.id);
        _renderSkillsList();
      } catch (err) {
        window.showToast?.(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

function _wireSkillAdd() {
  document.getElementById('em-sk-add')?.addEventListener('click', async () => {
    const catEl   = document.getElementById('em-sk-cat');
    const nameEl  = document.getElementById('em-sk-name');
    const levelEl = document.getElementById('em-sk-level');

    if (!catEl?.value)         { window.showToast?.('Select a category', 'error');   return; }
    if (!nameEl?.value.trim()) { window.showToast?.('Enter a skill name', 'error');  return; }

    const btn = document.getElementById('em-sk-add');
    btn.disabled = true;
    try {
      const sk = await addSkill({
        employeeId: _modalEmployee.id,
        category:   catEl.value,
        name:       nameEl.value.trim(),
        level:      levelEl?.value.trim() || null,
      });
      _modalSkills.push(sk);
      _renderSkillsList();
      if (catEl)   catEl.value   = '';
      if (nameEl)  nameEl.value  = '';
      if (levelEl) levelEl.value = '';
      window.showToast?.('Skill added', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ── Archive modal ─────────────────────────────────────────────

function _openArchiveModal(emp) {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = `
    <div class="modal-backdrop" id="em-arch-backdrop">
      <div class="modal modal-sm">
        <div class="modal-header">
          <span class="modal-title">Archive employee</span>
          <button class="modal-close" id="em-arch-close">&times;</button>
        </div>
        <div class="modal-body" style="gap:var(--sp-2)">
          <p style="margin:0;font-size:var(--font-sm)">
            Archive <strong>${_esc(emp.full_name || emp.employee_id || '')}</strong>?
          </p>
          <p style="margin:0" class="text-muted" style="font-size:var(--font-xs)">
            The record is preserved — no data is deleted.
          </p>
        </div>
        <div class="modal-footer" style="justify-content:space-between">
          <button class="btn btn-ghost" id="em-arch-cancel">Cancel</button>
          <div style="display:flex;gap:var(--sp-2)">
            <button class="btn btn-ghost" id="em-arch-resigned">Mark Resigned</button>
            <button class="btn btn-danger" id="em-arch-terminated">Mark Terminated</button>
          </div>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#em-arch-close').addEventListener('click', close);
  mount.querySelector('#em-arch-cancel').addEventListener('click', close);
  mount.querySelector('#em-arch-backdrop').addEventListener('click', e => {
    if (e.target.id === 'em-arch-backdrop') close();
  });

  const doArchive = async status => {
    mount.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try {
      const updated = await archiveEmployee(emp.id, status);
      const idx = _employees.findIndex(x => x.id === emp.id);
      if (idx >= 0) {
        _employees[idx] = { ..._employees[idx], status: updated.status, archived_at: updated.archived_at };
      }
      window.showToast?.(`Employee marked as ${status}`, 'success');
      close();
      _renderTable();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      mount.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  };

  mount.querySelector('#em-arch-resigned').addEventListener('click',   () => doArchive('resigned'));
  mount.querySelector('#em-arch-terminated').addEventListener('click', () => doArchive('terminated'));
}

// ── Info modal — Employee ID structure ────────────────────────

function _openInfoModal() {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = `
    <div class="modal-backdrop" id="em-info-backdrop">
      <div class="modal modal-lg">
        <div class="modal-header">
          <span class="modal-title">Employee ID Structure</span>
          <button class="modal-close" id="em-info-close">&times;</button>
        </div>
        <div class="modal-body" style="gap:var(--sp-4)">

          <!-- Format pill -->
          <div style="text-align:center;padding:var(--sp-3) 0">
            <code style="font-size:22px;letter-spacing:4px;color:var(--text-primary)">
              <span style="color:#bb8eff">DD</span>-<span style="color:#bb8eff">T</span>-<span style="color:#4ea1ff">NNN</span>-<span style="color:#ffd166">CC</span>
            </code>
            <div class="text-muted" style="font-size:var(--font-xs);margin-top:6px">
              8 digits · 3 hyphens · ISO/IEC 7064 MOD 97-10 check
            </div>
          </div>

          <!-- Segments -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:var(--sp-3)">
            <div style="background:var(--bg-sidebar);border:1px solid var(--border);border-radius:var(--radius);padding:var(--sp-3)">
              <div style="color:#bb8eff;font-weight:700;font-size:var(--font-xs);margin-bottom:var(--sp-2)">DD — DEPARTMENT</div>
              <div style="font-size:var(--font-xs);color:var(--text-muted)">2 digits · first hired dept<br><strong style="color:var(--text-primary)">locked for full-time</strong></div>
            </div>
            <div style="background:var(--bg-sidebar);border:1px solid var(--border);border-radius:var(--radius);padding:var(--sp-3)">
              <div style="color:#bb8eff;font-weight:700;font-size:var(--font-xs);margin-bottom:var(--sp-2)">T — TYPE</div>
              <div style="font-size:var(--font-xs);color:var(--text-muted)">1 digit · changeable</div>
            </div>
            <div style="background:var(--bg-sidebar);border:1px solid var(--border);border-radius:var(--radius);padding:var(--sp-3)">
              <div style="color:#4ea1ff;font-weight:700;font-size:var(--font-xs);margin-bottom:var(--sp-2)">NNN — NUMBER</div>
              <div style="font-size:var(--font-xs);color:var(--text-muted)">3 digits · <strong>permanent</strong></div>
            </div>
            <div style="background:var(--bg-sidebar);border:1px solid var(--border);border-radius:var(--radius);padding:var(--sp-3)">
              <div style="color:#ffd166;font-weight:700;font-size:var(--font-xs);margin-bottom:var(--sp-2)">CC — CHECK</div>
              <div style="font-size:var(--font-xs);color:var(--text-muted)">2 digits · auto-computed</div>
            </div>
          </div>

          <!-- Department & Type tables side by side -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)">
            <div>
              <div style="font-size:var(--font-xs);font-weight:600;color:var(--text-muted);margin-bottom:var(--sp-2)">DEPARTMENT (DD)</div>
              <table style="font-size:var(--font-xs)">
                <tbody>
                  <tr><td style="padding:4px 8px 4px 0"><code style="color:#bb8eff">01</code></td><td style="color:var(--text-primary)">Electrical Engineering</td></tr>
                  <tr><td style="padding:4px 8px 4px 0"><code style="color:#bb8eff">02</code></td><td style="color:var(--text-primary)">Mechanical Engineering</td></tr>
                  <tr><td style="padding:4px 8px 4px 0"><code style="color:#bb8eff">03</code></td><td style="color:var(--text-primary)">Programmer / Software</td></tr>
                  <tr><td style="padding:4px 8px 4px 0"><code style="color:#bb8eff">04</code></td><td style="color:var(--text-primary)">Graphic / Creative Media</td></tr>
                  <tr><td style="padding:4px 8px 4px 0"><code style="color:#bb8eff">05</code></td><td style="color:var(--text-primary)">Admin / Back Office</td></tr>
                  <tr><td style="padding:4px 8px 4px 0"><code style="color:#bb8eff">06</code></td><td style="color:var(--text-primary)">Technician / Workshop</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <div style="font-size:var(--font-xs);font-weight:600;color:var(--text-muted);margin-bottom:var(--sp-2)">EMPLOYMENT TYPE (T)</div>
              <table style="font-size:var(--font-xs)">
                <tbody>
                  <tr><td style="padding:4px 8px 4px 0"><code style="color:#bb8eff">1</code></td><td style="color:var(--text-primary)">Full-time</td></tr>
                  <tr><td style="padding:4px 8px 4px 0"><code style="color:#bb8eff">2</code></td><td style="color:var(--text-primary)">Part-time</td></tr>
                  <tr><td style="padding:4px 8px 4px 0"><code style="color:#bb8eff">3</code></td><td style="color:var(--text-primary)">Contract / Outsource</td></tr>
                </tbody>
              </table>
              <div style="margin-top:var(--sp-4)">
                <div style="font-size:var(--font-xs);font-weight:600;color:var(--text-muted);margin-bottom:var(--sp-2)">LIFECYCLE RULE</div>
                <div style="font-size:var(--font-xs);color:var(--text-muted);line-height:1.6">
                  <span style="color:#4ea1ff">NNN</span> is assigned once at hire and <strong style="color:var(--text-primary)">never reused</strong> — even after resignation.<br><br>
                  <span style="color:#bb8eff">DD</span> = first hired department and is <strong style="color:var(--text-primary)">permanent for full-time employees</strong>.<br>
                  <span style="color:#bb8eff">T</span> can change (e.g. contract → full-time); <span style="color:#ffd166">CC</span> recomputes automatically.
                </div>
              </div>
            </div>
          </div>

          <!-- Example -->
          <div style="background:var(--bg-sidebar);border:1px solid var(--border);border-radius:var(--radius);padding:var(--sp-3) var(--sp-4)">
            <div style="font-size:var(--font-xs);font-weight:600;color:var(--text-muted);margin-bottom:6px">EXAMPLE</div>
            <code style="font-size:15px">
              <span style="color:#bb8eff">02</span>-<span style="color:#bb8eff">1</span>-<span style="color:#4ea1ff">004</span>-<span style="color:#ffd166">??</span>
            </code>
            <span style="font-size:var(--font-xs);color:var(--text-muted);margin-left:var(--sp-3)">
              Mechanical Engineering · Full-time · hire #004 · check auto-computed
            </span>
          </div>

        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="em-info-ok">Close</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#em-info-close').addEventListener('click', close);
  mount.querySelector('#em-info-ok').addEventListener('click', close);
  mount.querySelector('#em-info-backdrop').addEventListener('click', e => {
    if (e.target.id === 'em-info-backdrop') close();
  });
}

// ── Helpers ───────────────────────────────────────────────────

function _esc(s) {
  return String(s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
  );
}

function _attr(s) {
  return String(s).replace(/"/g, '&quot;');
}
