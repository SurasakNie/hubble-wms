// pages/partNumbers.js — Part Number Generator (#part-numbers)
// House format CC-PPP-AA-BBB. Items are minted via the pn_create_item RPC
// (atomic counter — numbers are never reused). Projects with a customer-
// imposed scheme also carry a customer PN (template or manual entry).
// Admin/manager manage PN projects + type codes; all internal roles
// generate items and bump revisions.

import {
  getPnProjects, createPnProject, updatePnProject,
  getTypeCodes, createTypeCode, updateTypeCode,
  getItems, createItem, updateItem, deleteItem,
  bumpRevision, getRevisions,
} from '../api/partNumbers.js';
import { isAdmin, isManager } from '../auth.js';
import { esc, attr } from '../format.js';

let _projects  = [];
let _typeCodes = [];
let _items     = [];
let _projectId = null;   // survives re-renders within the session
let _typeFilter = '';
let _search     = '';

// ──────────────────────────────────────────────────────────────
// ENTRY POINT
// ──────────────────────────────────────────────────────────────

export async function render() {
  _typeFilter = '';
  _search     = '';

  const canManage = isAdmin() || isManager();

  document.getElementById('topbar-left').innerHTML =
    `<span class="topbar-title">Part Numbers</span>`;

  document.getElementById('content').innerHTML = `
    <div class="filter-bar" style="flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:var(--sp-4);">
      <select id="pn-project" style="min-width:220px;"></select>
      <select id="pn-type-filter" style="min-width:180px;"></select>
      <div class="search-input">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="search" id="pn-search" placeholder="Search part no. / name…">
      </div>
      <span style="flex:1;"></span>
      ${canManage ? `
        <button class="btn btn-ghost" id="pn-manage-projects">Projects</button>
        <button class="btn btn-ghost" id="pn-manage-types">Type Codes</button>` : ''}
      <button class="btn btn-primary" id="pn-new-item" disabled>+ New Item</button>
    </div>
    <div id="pn-table-wrap">
      <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
    </div>`;

  _wireControls(canManage);
  await _loadAll();
}

function _wireControls(canManage) {
  const content = document.getElementById('content');

  content.querySelector('#pn-project').addEventListener('change', async e => {
    _projectId = e.target.value || null;
    await _loadItems();
  });
  content.querySelector('#pn-type-filter').addEventListener('change', e => {
    _typeFilter = e.target.value;
    _renderTable();
  });
  content.querySelector('#pn-search').addEventListener('input', e => {
    _search = e.target.value.trim().toLowerCase();
    _renderTable();
  });
  content.querySelector('#pn-new-item').addEventListener('click', () => {
    const proj = _currentProject();
    if (proj) _openNewItemModal(proj);
  });
  if (canManage) {
    content.querySelector('#pn-manage-projects').addEventListener('click', _openProjectsModal);
    content.querySelector('#pn-manage-types').addEventListener('click', _openTypeCodesModal);
  }
}

async function _loadAll() {
  try {
    [_projects, _typeCodes] = await Promise.all([getPnProjects(), getTypeCodes()]);
  } catch (err) {
    window.showToast?.(err.message, 'error');
    _projects = []; _typeCodes = [];
  }
  if (_projectId && !_projects.some(p => p.id === _projectId)) _projectId = null;
  if (!_projectId && _projects.length === 1) _projectId = _projects[0].id;
  _renderProjectSelect();
  _renderTypeFilter();
  await _loadItems();
}

async function _loadItems() {
  const newBtn = document.getElementById('pn-new-item');
  if (newBtn) newBtn.disabled = !_projectId;
  if (!_projectId) { _items = []; _renderTable(); return; }
  try {
    _items = await getItems(_projectId);
  } catch (err) {
    window.showToast?.(err.message, 'error');
    _items = [];
  }
  _renderTable();
}

function _currentProject() {
  return _projects.find(p => p.id === _projectId) || null;
}

// ──────────────────────────────────────────────────────────────
// FILTER BAR RENDER
// ──────────────────────────────────────────────────────────────

function _renderProjectSelect() {
  const sel = document.getElementById('pn-project');
  if (!sel) return;
  sel.innerHTML = `<option value="">— Select project —</option>` +
    _projects.map(p =>
      `<option value="${attr(p.id)}"${p.id === _projectId ? ' selected' : ''}>
         ${esc(p.name)} (${esc(p.company_code)}-${esc(p.project_code)})
       </option>`).join('');
}

function _renderTypeFilter() {
  const sel = document.getElementById('pn-type-filter');
  if (!sel) return;
  sel.innerHTML = `<option value="">All types</option>` +
    _typeCodes.map(t =>
      `<option value="${attr(t.code)}">${esc(t.code)} — ${esc(t.description)}</option>`).join('');
  sel.value = _typeFilter;
}

// ──────────────────────────────────────────────────────────────
// ITEMS TABLE
// ──────────────────────────────────────────────────────────────

function _filteredItems() {
  return _items.filter(it => {
    if (_typeFilter && it.type_code !== _typeFilter) return false;
    if (_search) {
      const hay = `${it.part_number} ${it.customer_pn || ''} ${it.name}`.toLowerCase();
      if (!hay.includes(_search)) return false;
    }
    return true;
  });
}

function _renderTable() {
  const wrap = document.getElementById('pn-table-wrap');
  if (!wrap) return;
  const canManage = isAdmin() || isManager();

  if (_projects.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="margin-top:40px;">
        <div class="empty-state-title">No part-number projects yet</div>
        <div class="empty-state-sub">${canManage
          ? 'Create a project (company + project code) to start generating part numbers.'
          : 'Ask a manager to create a part-number project first.'}</div>
        ${canManage ? `<button class="btn btn-primary" id="pn-empty-create" style="margin-top:var(--sp-3);">Create project</button>` : ''}
      </div>`;
    wrap.querySelector('#pn-empty-create')?.addEventListener('click', _openProjectsModal);
    return;
  }
  if (!_projectId) {
    wrap.innerHTML = `
      <div class="empty-state" style="margin-top:40px;">
        <div class="empty-state-title">Select a project</div>
        <div class="empty-state-sub">Pick a project above to view and generate its part numbers.</div>
      </div>`;
    return;
  }

  const rows = _filteredItems();
  if (rows.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="margin-top:40px;">
        <div class="empty-state-title">${_search || _typeFilter ? 'No matching items' : 'No items yet'}</div>
        <div class="empty-state-sub">${_search || _typeFilter ? 'Try different filters' : 'Click "+ New Item" to generate the first part number.'}</div>
      </div>`;
    return;
  }

  const proj  = _currentProject();
  const admin = isAdmin();
  const showCustomer = proj && proj.customer_pn_mode !== 'none';
  const fmtTs = ts => ts
    ? new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th style="white-space:nowrap;">Part Number</th>
          ${showCustomer ? '<th style="white-space:nowrap;">Customer PN</th>' : ''}
          <th>Name</th>
          <th>Type</th>
          <th>Rev</th>
          <th>Status</th>
          <th style="white-space:nowrap;">Created</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${rows.map(it => `
            <tr data-id="${attr(it.id)}"${it.status === 'obsolete' ? ' style="opacity:.55;"' : ''}>
              <td style="font-family:var(--font-mono, monospace);white-space:nowrap;font-weight:500;">${esc(it.part_number)}</td>
              ${showCustomer ? `<td style="font-family:var(--font-mono, monospace);white-space:nowrap;">${esc(it.customer_pn || '—')}</td>` : ''}
              <td style="max-width:280px;word-break:break-word;">${esc(it.name)}${it.description ? `<div class="text-muted" style="font-size:var(--font-xs);">${esc(it.description)}</div>` : ''}</td>
              <td><span class="text-muted" style="font-size:var(--font-xs);white-space:nowrap;">${esc(it.type_code)} — ${esc(it.type?.description || '')}</span></td>
              <td>${esc(it.revision)}</td>
              <td><span class="badge ${it.status === 'active' ? 'badge-approved' : 'badge-rejected'}">${esc(it.status)}</span></td>
              <td style="white-space:nowrap;font-size:var(--font-xs);">${esc(fmtTs(it.created_at))}</td>
              <td class="col-actions">
                <div class="row-actions">
                  <button class="btn btn-ghost btn-sm act-edit">Edit</button>
                  <button class="btn btn-ghost btn-sm act-rev" title="Bump revision">Rev+</button>
                  <button class="btn btn-ghost btn-sm act-history" title="Revision history">History</button>
                  ${admin ? '<button class="btn btn-ghost btn-sm act-delete" style="color:var(--danger, #f44336);">Delete</button>' : ''}
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('tbody tr').forEach(tr => {
    const item = _items.find(i => i.id === tr.dataset.id);
    if (!item) return;
    tr.querySelector('.act-edit')?.addEventListener('click', () => _openEditItemModal(item));
    tr.querySelector('.act-rev')?.addEventListener('click', () => _openBumpRevisionModal(item));
    tr.querySelector('.act-history')?.addEventListener('click', () => _openHistoryModal(item));
    tr.querySelector('.act-delete')?.addEventListener('click', () => _confirmDeleteItem(item));
  });
}

// ──────────────────────────────────────────────────────────────
// MODAL PLUMBING (shared)
// ──────────────────────────────────────────────────────────────

function _mountModal(html, backdropId) {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = html;
  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('.modal-close')?.addEventListener('click', close);
  mount.querySelector('.pn-modal-cancel')?.addEventListener('click', close);
  mount.querySelector(`#${backdropId}`).addEventListener('click', e => {
    if (e.target.id === backdropId) close();
  });
  return { mount, close };
}

// ──────────────────────────────────────────────────────────────
// NEW ITEM
// ──────────────────────────────────────────────────────────────

function _openNewItemModal(proj) {
  const manual = proj.customer_pn_mode === 'manual';
  const { mount, close } = _mountModal(`
    <div class="modal-backdrop" id="pn-item-backdrop">
      <div class="modal" id="pn-item-modal">
        <div class="modal-header">
          <span class="modal-title">New item — ${esc(proj.name)}</span>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:var(--sp-3);">
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Type</span>
            <select id="pn-item-type">
              ${_typeCodes.map(t => `<option value="${attr(t.code)}">${esc(t.code)} — ${esc(t.description)}</option>`).join('')}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Name *</span>
            <input type="text" id="pn-item-name" placeholder="e.g. Base plate">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Description</span>
            <input type="text" id="pn-item-desc" placeholder="Optional">
          </label>
          ${manual ? `
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Customer part number</span>
            <input type="text" id="pn-item-cpn" placeholder="Customer's own number — leave blank for none">
          </label>` : ''}
          <div class="text-muted" style="font-size:var(--font-xs);" id="pn-item-preview"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost pn-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="pn-item-save">GENERATE</button>
        </div>
      </div>
    </div>`, 'pn-item-backdrop');

  const typeSel = mount.querySelector('#pn-item-type');
  const preview = mount.querySelector('#pn-item-preview');
  const updatePreview = () => {
    preview.textContent =
      `Number format: ${proj.company_code}-${proj.project_code}-${typeSel.value}-### (assigned on generate)` +
      (proj.customer_pn_mode === 'template' ? ` · customer PN from template ${proj.customer_pn_template}` : '');
  };
  typeSel.addEventListener('change', updatePreview);
  updatePreview();
  mount.querySelector('#pn-item-name').focus();

  mount.querySelector('#pn-item-save').addEventListener('click', async () => {
    const name = mount.querySelector('#pn-item-name').value.trim();
    if (!name) { window.showToast?.('Enter an item name', 'error'); return; }
    const btn = mount.querySelector('#pn-item-save');
    btn.disabled = true;
    try {
      const item = await createItem({
        projectId:   proj.id,
        typeCode:    typeSel.value,
        name,
        description: mount.querySelector('#pn-item-desc').value.trim(),
        customerPn:  manual ? mount.querySelector('#pn-item-cpn').value.trim() : null,
      });
      close();
      await _loadItems();
      window.showToast?.(`Created ${item.part_number}`, 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// EDIT ITEM
// ──────────────────────────────────────────────────────────────

function _openEditItemModal(item) {
  const proj   = _currentProject();
  const manual = proj && proj.customer_pn_mode === 'manual';
  const { mount, close } = _mountModal(`
    <div class="modal-backdrop" id="pn-edit-backdrop">
      <div class="modal" id="pn-edit-modal">
        <div class="modal-header">
          <span class="modal-title">${esc(item.part_number)}</span>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:var(--sp-3);">
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Name *</span>
            <input type="text" id="pn-edit-name" value="${attr(item.name)}">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Description</span>
            <input type="text" id="pn-edit-desc" value="${attr(item.description || '')}">
          </label>
          ${manual ? `
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Customer part number</span>
            <input type="text" id="pn-edit-cpn" value="${attr(item.customer_pn || '')}">
          </label>` : ''}
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Status</span>
            <select id="pn-edit-status">
              <option value="active"${item.status === 'active' ? ' selected' : ''}>Active</option>
              <option value="obsolete"${item.status === 'obsolete' ? ' selected' : ''}>Obsolete</option>
            </select>
          </label>
          <div class="text-muted" style="font-size:var(--font-xs);">The part number itself can’t be changed — bump the revision or mark obsolete instead.</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost pn-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="pn-edit-save">SAVE</button>
        </div>
      </div>
    </div>`, 'pn-edit-backdrop');

  mount.querySelector('#pn-edit-save').addEventListener('click', async () => {
    const name = mount.querySelector('#pn-edit-name').value.trim();
    if (!name) { window.showToast?.('Enter an item name', 'error'); return; }
    const btn = mount.querySelector('#pn-edit-save');
    btn.disabled = true;
    try {
      const updates = {
        name,
        description: mount.querySelector('#pn-edit-desc').value.trim(),
        status:      mount.querySelector('#pn-edit-status').value,
      };
      if (manual) updates.customerPn = mount.querySelector('#pn-edit-cpn').value.trim();
      await updateItem(item.id, updates);
      close();
      await _loadItems();
      window.showToast?.('Item updated', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// REVISIONS
// ──────────────────────────────────────────────────────────────

function _nextRevision(rev) {
  const r = (rev || '').trim().toUpperCase();
  if (/^[A-Y]$/.test(r)) return String.fromCharCode(r.charCodeAt(0) + 1);
  return '';
}

function _openBumpRevisionModal(item) {
  const { mount, close } = _mountModal(`
    <div class="modal-backdrop" id="pn-rev-backdrop">
      <div class="modal modal-sm" id="pn-rev-modal">
        <div class="modal-header">
          <span class="modal-title">Bump revision — ${esc(item.part_number)}</span>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:var(--sp-3);">
          <div class="text-muted" style="font-size:var(--font-sm);">Current revision: <strong>${esc(item.revision)}</strong></div>
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">New revision *</span>
            <input type="text" id="pn-rev-new" value="${attr(_nextRevision(item.revision))}" maxlength="4" style="text-transform:uppercase;">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Note (why the change?)</span>
            <input type="text" id="pn-rev-note" placeholder="e.g. Customer requested slot width change">
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost pn-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="pn-rev-save">BUMP</button>
        </div>
      </div>
    </div>`, 'pn-rev-backdrop');

  mount.querySelector('#pn-rev-new').focus();
  mount.querySelector('#pn-rev-save').addEventListener('click', async () => {
    const rev = mount.querySelector('#pn-rev-new').value.trim().toUpperCase();
    if (!rev) { window.showToast?.('Enter the new revision', 'error'); return; }
    const btn = mount.querySelector('#pn-rev-save');
    btn.disabled = true;
    try {
      await bumpRevision(item.id, rev, mount.querySelector('#pn-rev-note').value.trim());
      close();
      await _loadItems();
      window.showToast?.(`${item.part_number} → Rev ${rev}`, 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });
}

async function _openHistoryModal(item) {
  const { mount } = _mountModal(`
    <div class="modal-backdrop" id="pn-hist-backdrop">
      <div class="modal" id="pn-hist-modal">
        <div class="modal-header">
          <span class="modal-title">Revision history — ${esc(item.part_number)}</span>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" id="pn-hist-body">
          <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost pn-modal-cancel">Close</button>
        </div>
      </div>
    </div>`, 'pn-hist-backdrop');

  const body = mount.querySelector('#pn-hist-body');
  try {
    const revs = await getRevisions(item.id);
    const fmtTs = ts => ts
      ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';
    body.innerHTML = revs.length === 0
      ? `<div class="empty-state"><div class="empty-state-title">No history</div></div>`
      : `<div class="table-wrapper"><table>
           <thead><tr><th>Rev</th><th>Note</th><th>By</th><th style="white-space:nowrap;">When</th></tr></thead>
           <tbody>${revs.map(r => `
             <tr>
               <td style="font-weight:500;">${esc(r.revision)}</td>
               <td style="max-width:260px;word-break:break-word;">${esc(r.note || '—')}</td>
               <td>${esc(r.actor?.name || '—')}</td>
               <td style="white-space:nowrap;font-size:var(--font-xs);">${esc(fmtTs(r.changed_at))}</td>
             </tr>`).join('')}</tbody>
         </table></div>`;
  } catch (err) {
    body.innerHTML = `<div class="empty-state"><div class="empty-state-title">Failed to load history</div><div class="empty-state-sub">${esc(err.message)}</div></div>`;
  }
}

// ──────────────────────────────────────────────────────────────
// DELETE ITEM (admin only)
// ──────────────────────────────────────────────────────────────

function _confirmDeleteItem(item) {
  const { mount, close } = _mountModal(`
    <div class="modal-backdrop" id="pn-del-backdrop">
      <div class="modal modal-sm" id="pn-del-modal">
        <div class="modal-header">
          <span class="modal-title">Delete item</span>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin:0;">Delete <strong>${esc(item.part_number)}</strong> (${esc(item.name)})?
          Its number will <strong>not</strong> be reused. Consider marking it obsolete instead. This cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost pn-modal-cancel">Cancel</button>
          <button class="btn btn-danger" id="pn-del-confirm">Delete</button>
        </div>
      </div>
    </div>`, 'pn-del-backdrop');

  mount.querySelector('#pn-del-confirm').addEventListener('click', async () => {
    const btn = mount.querySelector('#pn-del-confirm');
    btn.disabled = true;
    try {
      await deleteItem(item.id);
      close();
      await _loadItems();
      window.showToast?.('Item deleted', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// PROJECTS MANAGER (admin/manager)
// ──────────────────────────────────────────────────────────────

async function _openProjectsModal() {
  let projects;
  try {
    projects = await getPnProjects({ includeArchived: true });
  } catch (err) {
    window.showToast?.(err.message, 'error');
    return;
  }

  const modeLabel = p =>
    p.customer_pn_mode === 'none' ? '—'
    : p.customer_pn_mode === 'template' ? `Template: ${p.customer_pn_template || ''}`
    : 'Manual entry';

  const { mount } = _mountModal(`
    <div class="modal-backdrop" id="pn-proj-backdrop">
      <div class="modal modal-lg" id="pn-proj-modal">
        <div class="modal-header">
          <span class="modal-title">Part-number projects</span>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          ${projects.length === 0
            ? `<div class="empty-state"><div class="empty-state-title">No projects yet</div></div>`
            : `<div class="table-wrapper"><table>
                 <thead><tr><th>Name</th><th>Code</th><th>Customer PN</th><th>Status</th><th></th></tr></thead>
                 <tbody>${projects.map(p => `
                   <tr data-id="${attr(p.id)}"${p.is_archived ? ' style="opacity:.55;"' : ''}>
                     <td style="font-weight:500;">${esc(p.name)}</td>
                     <td style="font-family:var(--font-mono, monospace);white-space:nowrap;">${esc(p.company_code)}-${esc(p.project_code)}</td>
                     <td style="font-size:var(--font-xs);max-width:220px;word-break:break-word;">${esc(modeLabel(p))}</td>
                     <td>${p.is_archived ? '<span class="badge badge-rejected">archived</span>' : '<span class="badge badge-approved">active</span>'}</td>
                     <td class="col-actions"><div class="row-actions">
                       <button class="btn btn-ghost btn-sm act-proj-edit">Edit</button>
                     </div></td>
                   </tr>`).join('')}</tbody>
               </table></div>`}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost pn-modal-cancel">Close</button>
          <button class="btn btn-primary" id="pn-proj-new">+ New project</button>
        </div>
      </div>
    </div>`, 'pn-proj-backdrop');

  mount.querySelector('#pn-proj-new').addEventListener('click', () => _openProjectFormModal(null));
  mount.querySelectorAll('tbody tr').forEach(tr => {
    const proj = projects.find(p => p.id === tr.dataset.id);
    if (!proj) return;
    tr.querySelector('.act-proj-edit')?.addEventListener('click', () => _openProjectFormModal(proj));
  });
}

function _openProjectFormModal(proj) {
  const isNew = !proj;
  const mode  = proj?.customer_pn_mode || 'none';
  const { mount, close } = _mountModal(`
    <div class="modal-backdrop" id="pn-projform-backdrop">
      <div class="modal" id="pn-projform-modal">
        <div class="modal-header">
          <span class="modal-title">${isNew ? 'New part-number project' : `Edit — ${esc(proj.name)}`}</span>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:var(--sp-3);">
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Project name *</span>
            <input type="text" id="pn-pf-name" value="${attr(proj?.name || '')}">
          </label>
          <div style="display:flex;gap:var(--sp-3);">
            <label style="display:flex;flex-direction:column;gap:4px;flex:1;">
              <span class="text-muted" style="font-size:var(--font-xs)">Company code (CC, 2–4 chars) *</span>
              <input type="text" id="pn-pf-cc" value="${attr(proj?.company_code || '')}" maxlength="4" style="text-transform:uppercase;" placeholder="e.g. HE">
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;flex:1;">
              <span class="text-muted" style="font-size:var(--font-xs)">Project code (PPP, 2–5 chars) *</span>
              <input type="text" id="pn-pf-ppp" value="${attr(proj?.project_code || '')}" maxlength="5" style="text-transform:uppercase;" placeholder="e.g. X01">
            </label>
          </div>
          ${isNew ? '' : `<div class="text-muted" style="font-size:var(--font-xs);">⚠ Changing the codes only affects <em>future</em> numbers — already-generated part numbers never change.</div>`}
          <div style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Customer part number</span>
            <label style="display:flex;gap:8px;align-items:center;"><input type="radio" name="pn-pf-mode" value="none"${mode === 'none' ? ' checked' : ''}> None — internal number only</label>
            <label style="display:flex;gap:8px;align-items:center;"><input type="radio" name="pn-pf-mode" value="template"${mode === 'template' ? ' checked' : ''}> Generated from a template</label>
            <label style="display:flex;gap:8px;align-items:center;"><input type="radio" name="pn-pf-mode" value="manual"${mode === 'manual' ? ' checked' : ''}> Entered manually per item</label>
          </div>
          <label id="pn-pf-tpl-wrap" style="display:${mode === 'template' ? 'flex' : 'none'};flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Template * — placeholders: {CC} {PPP} {AA} {SEQ:4} (padded) or {SEQ}</span>
            <input type="text" id="pn-pf-tpl" value="${attr(proj?.customer_pn_template || '')}" placeholder="e.g. ACME-{PPP}-{SEQ:4}">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Notes</span>
            <input type="text" id="pn-pf-notes" value="${attr(proj?.notes || '')}" placeholder="Optional">
          </label>
          ${isNew ? '' : `
          <label style="display:flex;gap:8px;align-items:center;">
            <input type="checkbox" id="pn-pf-archived"${proj.is_archived ? ' checked' : ''}>
            <span>Archived (hidden from the picker; no new numbers)</span>
          </label>`}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost pn-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="pn-pf-save">${isNew ? 'CREATE' : 'SAVE'}</button>
        </div>
      </div>
    </div>`, 'pn-projform-backdrop');

  // Cancel/close returns to the projects list instead of closing everything.
  const backToList = () => { _openProjectsModal(); };
  mount.querySelector('.pn-modal-cancel').addEventListener('click', backToList);
  mount.querySelector('.modal-close').addEventListener('click', backToList);

  const tplWrap = mount.querySelector('#pn-pf-tpl-wrap');
  mount.querySelectorAll('input[name="pn-pf-mode"]').forEach(r =>
    r.addEventListener('change', () => {
      tplWrap.style.display = r.value === 'template' && r.checked ? 'flex' : 'none';
    }));

  mount.querySelector('#pn-pf-save').addEventListener('click', async () => {
    const name = mount.querySelector('#pn-pf-name').value.trim();
    const cc   = mount.querySelector('#pn-pf-cc').value.trim().toUpperCase();
    const ppp  = mount.querySelector('#pn-pf-ppp').value.trim().toUpperCase();
    const selMode = mount.querySelector('input[name="pn-pf-mode"]:checked')?.value || 'none';
    const tpl  = mount.querySelector('#pn-pf-tpl').value.trim();

    if (!name) { window.showToast?.('Enter a project name', 'error'); return; }
    if (!/^[A-Z0-9]{2,4}$/.test(cc))  { window.showToast?.('Company code must be 2–4 letters/digits', 'error'); return; }
    if (!/^[A-Z0-9]{2,5}$/.test(ppp)) { window.showToast?.('Project code must be 2–5 letters/digits', 'error'); return; }
    if (selMode === 'template' && !tpl) { window.showToast?.('Enter the customer PN template', 'error'); return; }

    const btn = mount.querySelector('#pn-pf-save');
    btn.disabled = true;
    try {
      const fields = {
        name, companyCode: cc, projectCode: ppp,
        customerPnMode: selMode,
        customerPnTemplate: selMode === 'template' ? tpl : null,
        notes: mount.querySelector('#pn-pf-notes').value.trim(),
      };
      if (isNew) {
        await createPnProject(fields);
      } else {
        fields.isArchived = mount.querySelector('#pn-pf-archived').checked;
        await updatePnProject(proj.id, fields);
      }
      close();
      window.showToast?.(isNew ? 'Project created' : 'Project updated', 'success');
      await _loadAll();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// TYPE CODES MANAGER (admin/manager)
// ──────────────────────────────────────────────────────────────

async function _openTypeCodesModal() {
  let codes;
  try {
    codes = await getTypeCodes({ includeInactive: true });
  } catch (err) {
    window.showToast?.(err.message, 'error');
    return;
  }

  const { mount } = _mountModal(`
    <div class="modal-backdrop" id="pn-types-backdrop">
      <div class="modal" id="pn-types-modal">
        <div class="modal-header">
          <span class="modal-title">Type codes (AA)</span>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="text-muted" style="font-size:var(--font-xs);margin-bottom:var(--sp-3);">
            The 2-digit AA segment says what kind of item a number is. Codes are shared by all projects — pick the description that fits when generating.
          </div>
          <div class="table-wrapper"><table>
            <thead><tr><th>Code</th><th>Description</th><th>Status</th><th></th></tr></thead>
            <tbody>${codes.map(t => `
              <tr data-code="${attr(t.code)}"${t.is_active ? '' : ' style="opacity:.55;"'}>
                <td style="font-family:var(--font-mono, monospace);font-weight:500;">${esc(t.code)}</td>
                <td>${esc(t.description)}</td>
                <td>${t.is_active ? '<span class="badge badge-approved">active</span>' : '<span class="badge badge-rejected">inactive</span>'}</td>
                <td class="col-actions"><div class="row-actions">
                  <button class="btn btn-ghost btn-sm act-type-edit">Edit</button>
                  <button class="btn btn-ghost btn-sm act-type-toggle">${t.is_active ? 'Deactivate' : 'Activate'}</button>
                </div></td>
              </tr>`).join('')}</tbody>
          </table></div>
          <div style="display:flex;gap:8px;margin-top:var(--sp-3);align-items:center;flex-wrap:wrap;">
            <input type="text" id="pn-tc-code" placeholder="Code (2 digits)" maxlength="2" style="width:120px;">
            <input type="text" id="pn-tc-desc" placeholder="Description" style="flex:1;min-width:180px;">
            <button class="btn btn-primary" id="pn-tc-add">ADD</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost pn-modal-cancel">Close</button>
        </div>
      </div>
    </div>`, 'pn-types-backdrop');

  // The add row doubles as the edit row: clicking Edit loads the code
  // (locked) + description into it and the button becomes SAVE.
  let editing = null;
  const codeEl = mount.querySelector('#pn-tc-code');
  const descEl = mount.querySelector('#pn-tc-desc');
  const addBtn = mount.querySelector('#pn-tc-add');

  addBtn.addEventListener('click', async () => {
    const code = codeEl.value.trim();
    const desc = descEl.value.trim();
    if (!editing && !/^[0-9]{2}$/.test(code)) { window.showToast?.('Code must be exactly 2 digits', 'error'); return; }
    if (!desc) { window.showToast?.('Enter a description', 'error'); return; }
    addBtn.disabled = true;
    try {
      if (editing) {
        await updateTypeCode(editing, { description: desc });
        window.showToast?.(`Type code ${editing} updated`, 'success');
      } else {
        await createTypeCode({ code, description: desc, sortOrder: parseInt(code, 10) });
        window.showToast?.(`Type code ${code} added`, 'success');
      }
      _typeCodes = await getTypeCodes();
      _renderTypeFilter();
      _renderTable();
      _openTypeCodesModal();   // refresh the list in place
    } catch (err) {
      window.showToast?.(err.message, 'error');
      addBtn.disabled = false;
    }
  });

  mount.querySelectorAll('tbody tr').forEach(tr => {
    const tc = codes.find(c => c.code === tr.dataset.code);
    if (!tc) return;
    tr.querySelector('.act-type-edit')?.addEventListener('click', () => {
      editing = tc.code;
      codeEl.value = tc.code;
      codeEl.disabled = true;
      descEl.value = tc.description;
      addBtn.textContent = 'SAVE';
      descEl.focus();
    });
    tr.querySelector('.act-type-toggle')?.addEventListener('click', async () => {
      try {
        await updateTypeCode(tc.code, { isActive: !tc.is_active });
        _typeCodes = await getTypeCodes();
        _renderTypeFilter();
        _openTypeCodesModal();
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
  });
}
