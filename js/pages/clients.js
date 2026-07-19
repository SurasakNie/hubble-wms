// pages/clients.js — Clients list with quick-add, search, archive & edit
// Spec §3.8: Title, "Show active" filter + search, quick-add form, table
// (NAME / ADDRESS / CURRENCY + row actions).

import { getClients, createClient, updateClient, deleteClient } from '../api/clients.js';
import { isAdmin, getSession } from '../auth.js';
import { supabase } from '../config.js';
import { esc, attr } from '../format.js';
import { confirmModal } from '../components/confirmModal.js';
import { logAction } from '../api/auditLog.js';

const EDGE = 'https://sjkggguedgtynktymzes.supabase.co/functions/v1';

const CURRENCIES = ['THB', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'AUD'];

// Turn the raw Postgres unique-violation on the company-code index into a
// human message (otherwise the toast shows "duplicate key value violates …").
function _friendlyClientError(err) {
  const m = err?.message || 'Something went wrong';
  if (/clients_code_uq|unique.*code|code.*unique/i.test(m)) {
    return 'That company code is already in use — pick a different one.';
  }
  return m;
}

let _profile      = null;
let _clients      = [];
let _search       = '';
let _activeFilter = 'active';   // 'active' | 'all' | 'inactive'

// ──────────────────────────────────────────────────────────────
// ENTRY POINT
// ──────────────────────────────────────────────────────────────

export async function render(profile) {
  _profile      = profile;
  _search       = '';
  _activeFilter = 'active';

  document.getElementById('topbar-left').innerHTML =
    `<span class="topbar-title">Clients</span>`;

  document.getElementById('content').innerHTML = `
    <!-- Quick-add -->
    <div class="card" style="margin-bottom:var(--sp-4)">
      <div style="display:flex; gap:var(--sp-3); align-items:center; flex-wrap:wrap;">
        <input type="text" id="cl-name" placeholder="Add new client" style="flex:1; min-width:200px;">
        <input type="text" id="cl-code" placeholder="Code (2–4)" maxlength="4" style="width:110px; text-transform:uppercase;" title="Company code (CCC) — used in part numbers">
        <input type="text" id="cl-address" placeholder="Address (optional)" style="flex:1; min-width:160px;">
        <select id="cl-currency" style="width:auto; min-width:90px;">
          ${CURRENCIES.map(c => `<option value="${c}"${c === 'THB' ? ' selected' : ''}>${c}</option>`).join('')}
        </select>
        <button class="btn btn-primary" id="cl-add">ADD</button>
      </div>
    </div>

    <!-- Filter bar -->
    <div class="filter-bar">
      <select id="cl-filter">
        <option value="active">Show active</option>
        <option value="all">Show all</option>
        <option value="inactive">Show inactive</option>
      </select>
      <div>
        <input type="search" id="cl-search" placeholder="Search clients…">
      </div>
    </div>

    <!-- Table -->
    <div id="cl-table-wrap">
      <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
    </div>
  `;

  _wireControls();
  await _load();
}

function _wireControls() {
  const content = document.getElementById('content');
  content.querySelector('#cl-add')?.addEventListener('click', _handleAdd);
  content.querySelector('#cl-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _handleAdd();
  });
  content.querySelector('#cl-filter')?.addEventListener('change', e => {
    _activeFilter = e.target.value;
    _renderTable();
  });
  content.querySelector('#cl-search')?.addEventListener('input', e => {
    _search = e.target.value.trim().toLowerCase();
    _renderTable();
  });
}

async function _load() {
  try {
    _clients = await getClients({ activeOnly: false });
  } catch (err) {
    window.showToast?.(err.message, 'error');
    _clients = [];
  }
  _renderTable();
}

// ──────────────────────────────────────────────────────────────
// TABLE
// ──────────────────────────────────────────────────────────────

function _filtered() {
  return _clients.filter(c => {
    if (_activeFilter === 'active'   && !c.is_active) return false;
    if (_activeFilter === 'inactive' &&  c.is_active) return false;
    if (_search) {
      const hay = `${c.name || ''} ${c.address || ''}`.toLowerCase();
      if (!hay.includes(_search)) return false;
    }
    return true;
  });
}

function _renderTable() {
  const wrap = document.getElementById('cl-table-wrap');
  if (!wrap) return;

  const rows  = _filtered();
  const admin = isAdmin();

  if (rows.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="margin-top:40px">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <div class="empty-state-title">${_search || _activeFilter !== 'active' ? 'No matching clients' : 'No clients yet'}</div>
        <div class="empty-state-sub">${_search || _activeFilter !== 'active' ? 'Try a different filter or search' : 'Add your first client above'}</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Code</th>
            <th>Address</th>
            <th>Currency</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(c => _renderRow(c, admin)).join('')}
        </tbody>
      </table>
    </div>`;

  // Wire row actions
  wrap.querySelectorAll('tbody tr').forEach(tr => {
    const client = _clients.find(c => c.id === tr.dataset.id);
    if (!client) return;
    tr.querySelector('.act-edit')?.addEventListener('click', () => _openEditModal(client));
    tr.querySelector('.act-logins')?.addEventListener('click', () => _openLoginsModal(client));
    tr.querySelector('.act-archive')?.addEventListener('click', () => _setActive(client, false));
    tr.querySelector('.act-restore')?.addEventListener('click', () => _setActive(client, true));
    tr.querySelector('.act-delete')?.addEventListener('click', () => _confirmDelete(client));
  });
}

function _renderRow(c, admin) {
  const name     = esc(c.name || '');
  const address  = c.address ? esc(c.address) : '<span class="text-muted">—</span>';
  const inactive = !c.is_active;

  const archiveBtn = admin
    ? (inactive
        ? `<button class="row-action-btn act-restore" title="Restore">
             <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <polyline points="1 4 1 10 7 10"/>
               <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
             </svg>
           </button>`
        : `<button class="row-action-btn act-archive" title="Archive">
             <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/>
               <line x1="10" y1="12" x2="14" y2="12"/>
             </svg>
           </button>`)
    : '';

  const loginsBtn = admin
    ? `<button class="row-action-btn act-logins" title="Manage client logins">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
           <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
         </svg>
       </button>`
    : '';

  const deleteBtn = admin
    ? `<button class="row-action-btn danger act-delete" title="Delete">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <polyline points="3 6 5 6 21 6"/>
           <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
         </svg>
       </button>`
    : '';

  return `
    <tr data-id="${c.id}"${inactive ? ' style="opacity:0.55"' : ''}>
      <td style="font-weight:500;">${name}${inactive ? ' <span class="badge badge-client" style="margin-left:6px;">inactive</span>' : ''}</td>
      <td>${c.code ? `<span style="font-family:var(--font-mono, monospace);">${esc(c.code)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td>${address}</td>
      <td><span class="text-muted">${esc(c.currency || 'THB')}</span></td>
      <td class="col-actions">
        <div class="row-actions">
          <button class="row-action-btn act-edit" title="Edit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          ${loginsBtn}
          ${archiveBtn}
          ${deleteBtn}
        </div>
      </td>
    </tr>`;
}

// ──────────────────────────────────────────────────────────────
// ACTIONS
// ──────────────────────────────────────────────────────────────

async function _handleAdd() {
  const content  = document.getElementById('content');
  const nameEl    = content.querySelector('#cl-name');
  const codeEl    = content.querySelector('#cl-code');
  const addressEl = content.querySelector('#cl-address');
  const currEl    = content.querySelector('#cl-currency');
  const addBtn    = content.querySelector('#cl-add');

  const name = nameEl.value.trim();
  if (!name) { window.showToast?.('Enter a client name', 'error'); return; }
  const code = codeEl.value.trim().toUpperCase();
  if (code && !/^[A-Z0-9]{2,4}$/.test(code)) { window.showToast?.('Company code must be 2–4 letters/digits', 'error'); return; }

  addBtn.disabled = true;
  try {
    const client = await createClient({
      name,
      code,
      address:  addressEl.value.trim(),
      currency: currEl.value,
    });
    _clients.push(client);
    nameEl.value = '';
    codeEl.value = '';
    addressEl.value = '';
    currEl.value = 'THB';
    nameEl.focus();
    _renderTable();
    window.showToast?.('Client added', 'success');
    logAction('create_client', 'client', client.id, client.name,
      { name: client.name, currency: client.currency });
  } catch (err) {
    window.showToast?.(_friendlyClientError(err), 'error');
  } finally {
    addBtn.disabled = false;
  }
}

async function _setActive(client, active) {
  try {
    const updated = await updateClient(client.id, { isActive: active });
    const idx = _clients.findIndex(c => c.id === client.id);
    if (idx >= 0) _clients[idx] = updated;
    // Keep the result visible: the current filter would otherwise hide the row that just moved.
    _activeFilter = 'all';
    const sel = document.getElementById('cl-filter');
    if (sel) sel.value = 'all';
    _renderTable();
    window.showToast?.(active ? 'Client restored' : 'Client archived', 'success');
    logAction(active ? 'restore_client' : 'archive_client', 'client', client.id, client.name,
      { status: { old: active ? 'inactive' : 'active', new: active ? 'active' : 'inactive' } });
  } catch (err) {
    window.showToast?.(err.message, 'error');
  }
}

// ──────────────────────────────────────────────────────────────
// EDIT MODAL
// ──────────────────────────────────────────────────────────────

function _openEditModal(client) {
  const admin = isAdmin();
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = `
    <div class="modal-backdrop" id="cl-modal-backdrop">
      <div class="modal modal-sm" id="cl-modal">
        <div class="modal-header">
          <span class="modal-title">Edit client</span>
          <button class="modal-close" id="cl-modal-close">&times;</button>
        </div>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:var(--sp-3);">
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Name</span>
            <input type="text" id="cl-edit-name" value="${attr(client.name || '')}">
          </label>
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Company code (2–4) — used in part numbers</span>
            <input type="text" id="cl-edit-code" value="${attr(client.code || '')}" maxlength="4" style="text-transform:uppercase;">
          </label>
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Address</span>
            <input type="text" id="cl-edit-address" value="${attr(client.address || '')}">
          </label>
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Currency</span>
            <select id="cl-edit-currency">
              ${CURRENCIES.map(c => `<option value="${c}"${c === (client.currency || 'THB') ? ' selected' : ''}>${c}</option>`).join('')}
            </select>
          </label>
          ${admin ? `
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="cl-edit-active"${client.is_active ? ' checked' : ''}>
            <span>Active</span>
          </label>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cl-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="cl-modal-save">SAVE</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#cl-modal-close').addEventListener('click', close);
  mount.querySelector('#cl-modal-cancel').addEventListener('click', close);
  mount.querySelector('#cl-modal-backdrop')._escClose = close;

  mount.querySelector('#cl-modal-save').addEventListener('click', async () => {
    const name = mount.querySelector('#cl-edit-name').value.trim();
    if (!name) { window.showToast?.('Enter a client name', 'error'); return; }
    const code = mount.querySelector('#cl-edit-code').value.trim().toUpperCase();
    if (code && !/^[A-Z0-9]{2,4}$/.test(code)) { window.showToast?.('Company code must be 2–4 letters/digits', 'error'); return; }
    const payload = {
      name,
      code,
      address:  mount.querySelector('#cl-edit-address').value.trim(),
      currency: mount.querySelector('#cl-edit-currency').value,
    };
    if (admin) payload.isActive = mount.querySelector('#cl-edit-active').checked;

    const saveBtn = mount.querySelector('#cl-modal-save');
    saveBtn.disabled = true;
    const changes = {};
    if (payload.name     !== client.name)     changes.name     = { old: client.name,     new: payload.name };
    if ((payload.code || null) !== (client.code || null)) changes.code = { old: client.code, new: payload.code };
    if (payload.address  !== client.address)  changes.address  = { old: client.address,  new: payload.address };
    if (payload.currency !== client.currency) changes.currency = { old: client.currency, new: payload.currency };
    try {
      const updated = await updateClient(client.id, payload);
      const idx = _clients.findIndex(c => c.id === client.id);
      if (idx >= 0) _clients[idx] = updated;
      close();
      _renderTable();
      window.showToast?.('Client updated', 'success');
      logAction('update_client', 'client', client.id, payload.name || client.name,
        Object.keys(changes).length ? { fields: changes } : null);
    } catch (err) {
      window.showToast?.(_friendlyClientError(err), 'error');
      saveBtn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// DELETE CONFIRM (admin/owner only)
// ──────────────────────────────────────────────────────────────

function _confirmDelete(client) {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = `
    <div class="modal-backdrop" id="cl-del-backdrop">
      <div class="modal modal-sm" id="cl-del-modal">
        <div class="modal-header">
          <span class="modal-title">Delete client</span>
          <button class="modal-close" id="cl-del-close">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin:0;">Delete <strong>${esc(client.name || '')}</strong>? This cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cl-del-cancel">Cancel</button>
          <button class="btn btn-danger" id="cl-del-confirm">Delete</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#cl-del-close').addEventListener('click', close);
  mount.querySelector('#cl-del-cancel').addEventListener('click', close);
  mount.querySelector('#cl-del-backdrop')._escClose = close;

  mount.querySelector('#cl-del-confirm').addEventListener('click', async () => {
    const btn = mount.querySelector('#cl-del-confirm');
    btn.disabled = true;
    try {
      await deleteClient(client.id);
      _clients = _clients.filter(c => c.id !== client.id);
      close();
      _renderTable();
      window.showToast?.('Client deleted', 'success');
      logAction('delete_client', 'client', client.id, client.name,
        { entity: { id: client.id, name: client.name } });
    } catch (err) {
      // Surface the DB error (e.g. FK from projects) — keep the modal open.
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// CLIENT LOGINS (CLIENT-01) — admin provisions client-user accounts
// ──────────────────────────────────────────────────────────────

async function _openLoginsModal(client) {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = `
    <div class="modal-backdrop" id="cl-lg-backdrop">
      <div class="modal modal-lg" id="cl-lg-modal">
        <div class="modal-header">
          <span class="modal-title">Client logins — ${esc(client.name || '')}</span>
          <button class="modal-close" id="cl-lg-close">&times;</button>
        </div>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:var(--sp-3);">
          <div id="cl-lg-list"><div class="text-muted">Loading…</div></div>
          <div id="cl-lg-result"></div>
          <div style="border-top:1px solid #3a444e; padding-top:var(--sp-3);">
            <div style="font-weight:500; margin-bottom:8px;">Add a client login</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              <input type="text"  id="cl-lg-name"  placeholder="Contact name (optional)">
              <input type="email" id="cl-lg-email" placeholder="Contact email">
              <button class="btn btn-primary" id="cl-lg-add" style="align-self:flex-start;">Create login</button>
            </div>
            <div class="text-muted" style="font-size:12px; margin-top:6px;">A temporary password and the client ID are shown once after creation.</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cl-lg-done">Close</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#cl-lg-close').addEventListener('click', close);
  mount.querySelector('#cl-lg-done').addEventListener('click', close);
  mount.querySelector('#cl-lg-backdrop')._escClose = close;

  const listEl = mount.querySelector('#cl-lg-list');
  async function refreshList() {
    try {
      const { data, error } = await supabase
        .from('profiles').select('id, name, email, client_code')
        .eq('role', 'client').eq('client_id', client.id).order('client_code');
      if (error) throw error;
      if (!data || data.length === 0) { listEl.innerHTML = `<div class="text-muted">No client logins yet.</div>`; return; }
      listEl.innerHTML = `
        <div class="table-wrapper"><table>
          <thead><tr><th>Client ID</th><th>Name</th><th>Email</th><th></th></tr></thead>
          <tbody>${data.map(u => `
            <tr data-uid="${attr(u.id)}" data-code="${attr(u.client_code || '')}" data-email="${attr(u.email || '')}">
              <td>${esc(u.client_code || '—')}</td>
              <td>${esc(u.name || '—')}</td>
              <td>${esc(u.email || '—')}</td>
              <td style="white-space:nowrap;">
                <button class="row-action-btn cl-reset-pw" title="Reset password">Reset pw</button>
                <button class="row-action-btn danger cl-delete-user" title="Delete login">Delete</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;

      listEl.querySelectorAll('.cl-reset-pw').forEach(btn => {
        btn.addEventListener('click', async () => {
          const tr = btn.closest('tr');
          const uid = tr.dataset.uid;
          const code = tr.dataset.code;
          const email = tr.dataset.email;
          if (!await confirmModal({ title: 'Reset password', message: `Reset password for ${esc(code)} (${esc(email)})?`, confirmText: 'Reset password', danger: true })) return;
          btn.disabled = true;
          try {
            const token = getSession()?.access_token;
            const res = await fetch(`${EDGE}/admin-reset-password`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ target_user_id: uid }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Reset failed');
            const credText = `Client ID: ${code}\nEmail: ${email}\nNew password: ${d.new_password || ''}`;
            const resultEl = mount.querySelector('#cl-lg-result');
            resultEl.innerHTML = `
              <div class="card" style="background:#1e2329;">
                <div style="font-weight:500; margin-bottom:4px;">Password reset — ${esc(code)}</div>
                <div style="font-size:13px;">Email: ${esc(email)}</div>
                <div style="font-size:13px;">New password: <strong>${esc(d.new_password || '')}</strong></div>
                <div class="text-muted" style="font-size:12px; margin-top:6px;">Copy these now — the password is shown only once.</div>
                <button class="btn btn-ghost btn-sm" id="cl-lg-copy-cred" style="margin-top:6px;">Copy credentials</button>
              </div>`;
            resultEl.querySelector('#cl-lg-copy-cred').onclick = () => {
              navigator.clipboard.writeText(credText);
              window.showToast?.('Credentials copied', 'success');
            };
            window.showToast?.('Password reset', 'success');
            logAction('reset_client_login_password', 'client', client.id, client.name,
              { client_code: code, email });
          } catch (err) {
            window.showToast?.(err.message, 'error');
          } finally {
            btn.disabled = false;
          }
        });
      });

      listEl.querySelectorAll('.cl-delete-user').forEach(btn => {
        btn.addEventListener('click', async () => {
          const tr = btn.closest('tr');
          const uid = tr.dataset.uid;
          const code = tr.dataset.code;
          const email = tr.dataset.email;
          if (!await confirmModal({ title: 'Delete client login', message: `Delete login for ${esc(code)} (${esc(email)})? This cannot be undone.`, confirmText: 'Delete', danger: true })) return;
          btn.disabled = true;
          try {
            const token = getSession()?.access_token;
            const res = await fetch(`${EDGE}/admin-set-account-active`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ target_user_id: uid, active: false }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not deactivate the account — login was not deleted.');
            const { error } = await supabase.from('profiles').delete().eq('id', uid);
            if (error) throw error;
            window.showToast?.('Client login deleted', 'success');
            logAction('delete_client_login', 'client', client.id, client.name,
              { client_code: code, email });
            refreshList();
          } catch (err) {
            window.showToast?.(err.message, 'error');
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      listEl.innerHTML = `<div class="text-muted">Couldn't load logins: ${esc(err.message)}</div>`;
    }
  }
  refreshList();

  mount.querySelector('#cl-lg-add').addEventListener('click', async () => {
    const name     = mount.querySelector('#cl-lg-name').value.trim();
    const email    = mount.querySelector('#cl-lg-email').value.trim();
    const resultEl = mount.querySelector('#cl-lg-result');
    if (!email) { window.showToast?.('Enter the contact email', 'error'); return; }

    const btn = mount.querySelector('#cl-lg-add');
    btn.disabled = true;
    try {
      const token = getSession()?.access_token;
      const res = await fetch(`${EDGE}/provision-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ client_id: client.id, email, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Provision failed');

      const credText = `Client ID: ${data.client_code || '—'}\nEmail: ${email}\nTemporary password: ${data.temp_password || ''}`;
      resultEl.innerHTML = `
        <div class="card" style="background:#1e2329;">
          <div style="font-weight:500; margin-bottom:4px;">Login created</div>
          <div style="font-size:13px;">Client ID: <strong>${esc(data.client_code || '—')}</strong></div>
          <div style="font-size:13px;">Email: ${esc(email)}</div>
          <div style="font-size:13px;">Temporary password: <strong>${esc(data.temp_password || '')}</strong></div>
          <div class="text-muted" style="font-size:12px; margin-top:6px;">Copy these now — the password is shown only once.</div>
          <button class="btn btn-ghost btn-sm" id="cl-lg-copy-cred" style="margin-top:6px;">Copy credentials</button>
        </div>`;
      mount.querySelector('#cl-lg-copy-cred').onclick = () => {
        navigator.clipboard.writeText(credText);
        window.showToast?.('Credentials copied', 'success');
      };
      mount.querySelector('#cl-lg-name').value = '';
      mount.querySelector('#cl-lg-email').value = '';
      refreshList();
      window.showToast?.('Client login created', 'success');
      logAction('provision_client_login', 'client', client.id, client.name,
        { client_code: data.client_code, email });
    } catch (err) {
      window.showToast?.(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

