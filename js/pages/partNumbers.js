// pages/partNumbers.js — Part Number Generator v2 (#part-numbers)
// Format CCC-PPP-CAT-SEQ (see PART_NUMBERING_SPEC.md). Projects/clients are
// the real timesheet records (CCC = client.code, PPP = project.code); CAT is
// a 3-letter governed category code; items are minted via the pn_create_item
// RPC (numbers never reused). Items carry 5 managed attributes and a revision
// history with per-revision snapshots (for the Compare view).

import {
  getPnProjects, getProjectConfig, upsertProjectConfig,
  getCategories, createCategory, updateCategory,
  getAttributes, createAttribute, updateAttribute,
  getItems, createItem, updateItem, deleteItem,
  bumpRevision, getRevisions,
} from '../api/partNumbers.js';
import { isAdmin, isManager } from '../auth.js';
import { esc, attr } from '../format.js';

const ATTR_KINDS = [
  { kind: 'material',    label: 'Material' },
  { kind: 'finish',      label: 'Finish' },
  { kind: 'vendor',      label: 'Vendor' },
  { kind: 'fab_process', label: 'Fabrication Process' },
  { kind: 'color',       label: 'Color' },
];

// snapshot key → label, in display order (matches pn_item_snapshot in the migration)
const SNAP_FIELDS = [
  ['name', 'Name'], ['description', 'Description'], ['category', 'Category'],
  ['revision', 'Revision'], ['status', 'Status'], ['customer_pn', 'Customer PN'],
  ['material', 'Material'], ['finish', 'Finish'], ['vendor', 'Vendor'],
  ['fab_process', 'Fab Process'], ['color', 'Color'],
];

let _projects   = [];
let _categories = [];
let _attrs      = {};      // { material: [...], finish: [...], ... }
let _config     = null;    // current project's pn_project_config (or null → none)
let _items      = [];
let _clientId   = '';
let _projectId  = null;
let _catFilter  = '';
let _search     = '';

// ──────────────────────────────────────────────────────────────
// ENTRY POINT
// ──────────────────────────────────────────────────────────────

export async function render() {
  _catFilter = '';
  _search    = '';
  _config    = null;
  // Deep link from the Projects page: #part-numbers?project=<id>
  const m = (window.location.hash || '').match(/[?&]project=([0-9a-fA-F-]+)/);
  if (m) _projectId = m[1];

  const canManage = isAdmin() || isManager();

  document.getElementById('topbar-left').innerHTML =
    `<span class="topbar-title">Part Numbers</span>`;

  document.getElementById('content').innerHTML = `
    <div class="filter-bar" style="flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:var(--sp-4);">
      <select id="pn-client" style="min-width:180px;"></select>
      <select id="pn-project" style="min-width:240px;"></select>
      <select id="pn-cat-filter" style="min-width:200px;"></select>
      <div class="search-input">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="search" id="pn-search" placeholder="Search part no. / name…">
      </div>
      <span style="flex:1;"></span>
      ${canManage ? `
        <button class="btn btn-ghost" id="pn-manage-cats">Categories</button>
        <button class="btn btn-ghost" id="pn-manage-attrs">Lists</button>
        <button class="btn btn-ghost" id="pn-manage-config">Customer PN</button>` : ''}
      <button class="btn btn-primary" id="pn-new-item" disabled>+ New Item</button>
    </div>
    <div id="pn-hint" style="margin-bottom:var(--sp-3);"></div>
    <div id="pn-table-wrap">
      <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
    </div>`;

  _wireControls(canManage);
  await _loadAll();
}

function _wireControls(canManage) {
  const c = document.getElementById('content');
  c.querySelector('#pn-client').addEventListener('change', async e => {
    _clientId = e.target.value || '';
    const cur = _currentProject();
    if (_clientId && cur && cur.client?.id !== _clientId) _projectId = null;
    _renderProjectSelect();
    await _loadConfig();
    await _loadItems();
  });
  c.querySelector('#pn-project').addEventListener('change', async e => {
    _projectId = e.target.value || null;
    await _loadConfig();
    await _loadItems();
  });
  c.querySelector('#pn-cat-filter').addEventListener('change', e => { _catFilter = e.target.value; _renderTable(); });
  c.querySelector('#pn-search').addEventListener('input', e => { _search = e.target.value.trim().toLowerCase(); _renderTable(); });
  c.querySelector('#pn-new-item').addEventListener('click', () => { if (_canMint()) _openItemModal(null); });
  if (canManage) {
    c.querySelector('#pn-manage-cats').addEventListener('click', _openCategoriesModal);
    c.querySelector('#pn-manage-attrs').addEventListener('click', () => _openAttributesModal());
    c.querySelector('#pn-manage-config').addEventListener('click', _openConfigModal);
  }
}

async function _loadAll() {
  try {
    const [projects, categories, allAttrs] = await Promise.all([
      getPnProjects(), getCategories(), getAttributes({}),
    ]);
    _projects   = projects;
    _categories = categories;
    _attrs = {};
    ATTR_KINDS.forEach(k => { _attrs[k.kind] = allAttrs.filter(a => a.kind === k.kind); });
  } catch (err) {
    window.showToast?.(err.message, 'error');
    _projects = []; _categories = []; _attrs = {};
  }
  if (_projectId && !_projects.some(p => p.id === _projectId)) _projectId = null;
  if (!_projectId && _projects.length === 1) _projectId = _projects[0].id;
  // Sync the client filter to the selected project (e.g. deep-link from Projects).
  const selP = _projects.find(p => p.id === _projectId);
  if (selP?.client) _clientId = selP.client.id;
  _renderClientSelect();
  _renderProjectSelect();
  _renderCatFilter();
  await _loadConfig();
  await _loadItems();
}

async function _loadConfig() {
  _config = null;
  if (!_projectId) return;
  try { _config = await getProjectConfig(_projectId); }
  catch (err) { console.warn('[partNumbers] config load failed:', err.message); }
}

async function _loadItems() {
  _renderHint();
  const newBtn = document.getElementById('pn-new-item');
  if (newBtn) newBtn.disabled = !_canMint();
  if (!_projectId) { _items = []; _renderTable(); return; }
  try { _items = await getItems(_projectId); }
  catch (err) { window.showToast?.(err.message, 'error'); _items = []; }
  _renderTable();
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

function _currentProject() { return _projects.find(p => p.id === _projectId) || null; }

function _canMint() {
  const p = _currentProject();
  return !!(p && p.code && p.client && p.client.code);
}

function _attrName(id) {
  if (!id) return null;
  for (const k of ATTR_KINDS) {
    const hit = (_attrs[k.kind] || []).find(a => a.id === id);
    if (hit) return hit.name;
  }
  return null;
}

function _projLabel(p) {
  const cc  = p.client?.code || '??';
  const ppp = p.code || '??';
  return `${p.name} (${cc}-${ppp})`;
}

// ──────────────────────────────────────────────────────────────
// FILTER BAR RENDER
// ──────────────────────────────────────────────────────────────

function _clientsFromProjects() {
  const seen = new Map();
  _projects.forEach(p => { if (p.client) seen.set(p.client.id, p.client); });
  return [...seen.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function _renderClientSelect() {
  const sel = document.getElementById('pn-client');
  if (!sel) return;
  sel.innerHTML = `<option value="">All clients</option>` +
    _clientsFromProjects().map(cl =>
      `<option value="${attr(cl.id)}"${cl.id === _clientId ? ' selected' : ''}>${esc(cl.name)}${cl.code ? ` (${esc(cl.code)})` : ''}</option>`).join('');
}

function _renderProjectSelect() {
  const sel = document.getElementById('pn-project');
  if (!sel) return;
  const list = _clientId ? _projects.filter(p => p.client?.id === _clientId) : _projects;
  sel.innerHTML = `<option value="">— Select project —</option>` +
    list.map(p =>
      `<option value="${attr(p.id)}"${p.id === _projectId ? ' selected' : ''}>${esc(_projLabel(p))}</option>`).join('');
}

function _renderCatFilter() {
  const sel = document.getElementById('pn-cat-filter');
  if (!sel) return;
  sel.innerHTML = `<option value="">All categories</option>` +
    _categories.map(t => `<option value="${attr(t.code)}">${esc(t.code)} — ${esc(t.description)}</option>`).join('');
  sel.value = _catFilter;
}

function _renderHint() {
  const el = document.getElementById('pn-hint');
  if (!el) return;
  const p = _currentProject();
  if (!p || _canMint()) { el.innerHTML = ''; return; }
  const missing = [];
  if (!p.client?.code) missing.push('its client has no company code (set it on the Clients page)');
  if (!p.code)         missing.push('this project has no project code (set it on the Projects page)');
  el.innerHTML = `<div class="empty-state-sub" style="color:var(--warning, #ff9800);">Can’t mint numbers yet — ${missing.map(esc).join('; ')}.</div>`;
}

// ──────────────────────────────────────────────────────────────
// ITEMS TABLE
// ──────────────────────────────────────────────────────────────

function _filteredItems() {
  return _items.filter(it => {
    if (_catFilter && it.cat_code !== _catFilter) return false;
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
    wrap.innerHTML = `<div class="empty-state" style="margin-top:40px;">
      <div class="empty-state-title">No projects</div>
      <div class="empty-state-sub">Create a project (with a code) on the Projects page first.</div></div>`;
    return;
  }
  if (!_projectId) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:40px;">
      <div class="empty-state-title">Select a project</div>
      <div class="empty-state-sub">Pick a project above to view and generate its part numbers.</div></div>`;
    return;
  }

  const rows = _filteredItems();
  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:40px;">
      <div class="empty-state-title">${_search || _catFilter ? 'No matching items' : 'No items yet'}</div>
      <div class="empty-state-sub">${_search || _catFilter ? 'Try different filters' : (_canMint() ? 'Click “+ New Item” to generate the first part number.' : 'Set the project/client codes first (see above).')}</div></div>`;
    return;
  }

  const proj  = _currentProject();
  const admin = isAdmin();
  const showCustomer = _config && _config.customer_pn_mode !== 'none';
  const fmtDate = ts => ts ? new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th style="white-space:nowrap;">Part Number</th>
          ${showCustomer ? '<th style="white-space:nowrap;">Customer PN</th>' : ''}
          <th>Name</th>
          <th>Category</th>
          <th>Material</th>
          <th>Finish</th>
          <th>Rev</th>
          <th>Status</th>
          <th style="white-space:nowrap;">Updated</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${rows.map(it => `
            <tr data-id="${attr(it.id)}"${it.status === 'obsolete' ? ' style="opacity:.55;"' : ''}>
              <td style="white-space:nowrap;font-weight:500;">
                <span style="display:inline-flex;align-items:center;gap:6px;">
                  <span style="font-family:var(--font-mono, monospace);">${esc(it.part_number)}</span>
                  <button class="row-action-btn act-info" title="Details / revisions" style="opacity:1;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                  </button>
                </span>
              </td>
              ${showCustomer ? `<td style="font-family:var(--font-mono, monospace);white-space:nowrap;">${esc(it.customer_pn || '—')}</td>` : ''}
              <td style="max-width:240px;word-break:break-word;">${esc(it.name)}</td>
              <td><span class="text-muted" style="font-size:var(--font-xs);white-space:nowrap;">${esc(it.cat_code)} — ${esc(it.type?.description || '')}</span></td>
              <td style="font-size:var(--font-sm);">${esc(_attrName(it.material_id) || 'TBD')}</td>
              <td style="font-size:var(--font-sm);">${esc(_attrName(it.finish_id) || 'TBD')}</td>
              <td>${esc(it.revision)}</td>
              <td><span class="badge ${it.status === 'active' ? 'badge-approved' : 'badge-rejected'}">${esc(it.status)}</span></td>
              <td style="white-space:nowrap;font-size:var(--font-xs);">${esc(fmtDate(it.updated_at || it.created_at))}</td>
              <td class="col-actions">
                <div class="row-actions">
                  <button class="btn btn-ghost btn-sm act-edit">Edit</button>
                  <button class="btn btn-ghost btn-sm act-rev" title="Bump revision">Rev+</button>
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
    tr.querySelector('.act-info')?.addEventListener('click', () => _openInfoModal(item));
    tr.querySelector('.act-edit')?.addEventListener('click', () => _openItemModal(item));
    tr.querySelector('.act-rev')?.addEventListener('click', () => _openBumpRevisionModal(item));
    tr.querySelector('.act-delete')?.addEventListener('click', () => _confirmDeleteItem(item));
  });
}

// ──────────────────────────────────────────────────────────────
// MODAL PLUMBING
// ──────────────────────────────────────────────────────────────

function _mountModal(html, backdropId) {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = html;
  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('.modal-close')?.addEventListener('click', close);
  mount.querySelector('.pn-modal-cancel')?.addEventListener('click', close);
  mount.querySelector(`#${backdropId}`)._escClose = close;
  return { mount, close };
}

function _attrSelectHtml(id, kind, selectedId) {
  const opts = (_attrs[kind] || []).map(a =>
    `<option value="${attr(a.id)}"${a.id === selectedId ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
  return `<select id="${id}"><option value="">TBD</option>${opts}</select>`;
}

// ──────────────────────────────────────────────────────────────
// NEW / EDIT ITEM
// ──────────────────────────────────────────────────────────────

function _openItemModal(item) {
  const isEdit = !!item;
  const proj = _currentProject();
  const manual = _config && _config.customer_pn_mode === 'manual';

  const catOptions = _categories.map(t =>
    `<option value="${attr(t.code)}"${item && item.cat_code === t.code ? ' selected' : ''}>${esc(t.code)} — ${esc(t.description)}</option>`).join('');

  const attrRows = ATTR_KINDS.map(k => `
    <label style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:180px;">
      <span class="text-muted" style="font-size:var(--font-xs)">${esc(k.label)}</span>
      ${_attrSelectHtml('pn-i-' + k.kind, k.kind, item ? item[k.kind + '_id'] : null)}
    </label>`).join('');

  const { mount, close } = _mountModal(`
    <div class="modal-backdrop" id="pn-item-backdrop">
      <div class="modal modal-lg" id="pn-item-modal">
        <div class="modal-header">
          <span class="modal-title">${isEdit ? esc(item.part_number) : `New item — ${esc(proj?.name || '')}`}</span>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:var(--sp-3);">
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Category ${isEdit ? '(fixed — part of the number)' : ''}</span>
            <select id="pn-i-cat"${isEdit ? ' disabled' : ''}>${catOptions}</select>
            <span class="text-muted" id="pn-i-cat-help" style="font-size:var(--font-xs);"></span>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Name *</span>
            <input type="text" id="pn-i-name" value="${attr(item?.name || '')}" placeholder="e.g. Base plate">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Description</span>
            <input type="text" id="pn-i-desc" value="${attr(item?.description || '')}" placeholder="Optional">
          </label>
          <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap;">${attrRows}</div>
          ${manual ? `
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Customer part number</span>
            <input type="text" id="pn-i-cpn" value="${attr(item?.customer_pn || '')}" placeholder="Customer’s own number — leave blank for none">
          </label>` : ''}
          ${isEdit ? `
          <label style="display:flex;flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Status</span>
            <select id="pn-i-status">
              <option value="active"${item.status === 'active' ? ' selected' : ''}>Active</option>
              <option value="obsolete"${item.status === 'obsolete' ? ' selected' : ''}>Obsolete</option>
            </select>
          </label>` : `<div class="text-muted" style="font-size:var(--font-xs);" id="pn-i-preview"></div>`}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost pn-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="pn-i-save">${isEdit ? 'SAVE' : 'GENERATE'}</button>
        </div>
      </div>
    </div>`, 'pn-item-backdrop');

  const catSel  = mount.querySelector('#pn-i-cat');
  const catHelp = mount.querySelector('#pn-i-cat-help');
  const preview = mount.querySelector('#pn-i-preview');
  const refreshCat = () => {
    const cat = _categories.find(t => t.code === catSel.value);
    catHelp.textContent = cat?.covers || '';
    if (preview && proj) preview.textContent = `Number: ${proj.client?.code}-${proj.code}-${catSel.value}-### (assigned on generate)`;
  };
  catSel.addEventListener('change', refreshCat);
  refreshCat();
  mount.querySelector('#pn-i-name').focus();

  mount.querySelector('#pn-i-save').addEventListener('click', async () => {
    const name = mount.querySelector('#pn-i-name').value.trim();
    if (!name) { window.showToast?.('Enter an item name', 'error'); return; }
    const btn = mount.querySelector('#pn-i-save');
    btn.disabled = true;
    const attrVals = {};
    ATTR_KINDS.forEach(k => { attrVals[k.kind + 'Id'] = mount.querySelector('#pn-i-' + k.kind).value || null; });
    try {
      if (isEdit) {
        await updateItem(item.id, {
          name,
          description: mount.querySelector('#pn-i-desc').value.trim(),
          status:      mount.querySelector('#pn-i-status').value,
          materialId: attrVals.materialId, finishId: attrVals.finishId, vendorId: attrVals.vendorId,
          fabProcessId: attrVals.fab_processId, colorId: attrVals.colorId,
          ...(manual ? { customerPn: mount.querySelector('#pn-i-cpn').value.trim() } : {}),
        });
        close();
        await _loadItems();
        window.showToast?.('Item updated', 'success');
      } else {
        const created = await createItem({
          projectId: _projectId,
          catCode:   catSel.value,
          name,
          description: mount.querySelector('#pn-i-desc').value.trim(),
          customerPn:  manual ? mount.querySelector('#pn-i-cpn').value.trim() : null,
          materialId: attrVals.materialId, finishId: attrVals.finishId, vendorId: attrVals.vendorId,
          fabProcessId: attrVals.fab_processId, colorId: attrVals.colorId,
        });
        close();
        await _loadItems();
        window.showToast?.(`Created ${created.part_number}`, 'success');
      }
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

function _openBumpRevisionModal(item, onDone) {
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
            <span class="text-muted" style="font-size:var(--font-xs)">Note (what changed?)</span>
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
      onDone?.();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// INFO / COMPARE MODAL
// ──────────────────────────────────────────────────────────────

function _detailRow(label, value) {
  return `<tr><td class="text-muted" style="font-size:var(--font-xs);white-space:nowrap;padding-right:var(--sp-3);">${esc(label)}</td>
              <td style="word-break:break-word;">${value ? esc(value) : '<span class="text-muted">—</span>'}</td></tr>`;
}

async function _openInfoModal(item) {
  const proj = _currentProject();
  const { mount } = _mountModal(`
    <div class="modal-backdrop" id="pn-info-backdrop">
      <div class="modal modal-lg" id="pn-info-modal">
        <div class="modal-header">
          <span class="modal-title" style="font-family:var(--font-mono, monospace);">${esc(item.part_number)}</span>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:var(--sp-4);">
          <div>
            <table style="width:100%;"><tbody>
              ${_detailRow('Name', item.name)}
              ${_detailRow('Description', item.description)}
              ${_detailRow('Category', `${item.cat_code} — ${item.type?.description || ''}`)}
              ${proj ? _detailRow('Project', _projLabel(proj)) : ''}
              ${_detailRow('Customer PN', item.customer_pn)}
              ${_detailRow('Material', _attrName(item.material_id) || 'TBD')}
              ${_detailRow('Finish', _attrName(item.finish_id) || 'TBD')}
              ${_detailRow('Vendor', _attrName(item.vendor_id) || 'TBD')}
              ${_detailRow('Fabrication Process', _attrName(item.fab_process_id) || 'TBD')}
              ${_detailRow('Color', _attrName(item.color_id) || 'TBD')}
              ${_detailRow('Revision', item.revision)}
              ${_detailRow('Status', item.status)}
            </tbody></table>
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:var(--sp-2);flex-wrap:wrap;">
              <strong style="font-size:var(--font-sm);">Revisions</strong>
              <span style="flex:1;"></span>
              <span class="text-muted" style="font-size:var(--font-xs);">Compare</span>
              <select id="pn-cmp-a" style="min-width:90px;"></select>
              <select id="pn-cmp-b" style="min-width:90px;"></select>
              <button class="btn btn-ghost btn-sm" id="pn-cmp-go">Compare</button>
            </div>
            <div id="pn-rev-list"><div class="empty-state"><div class="empty-state-title">Loading…</div></div></div>
            <div id="pn-cmp-result" style="margin-top:var(--sp-3);"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost pn-modal-cancel">Close</button>
          <button class="btn btn-primary" id="pn-info-bump">Bump revision</button>
        </div>
      </div>
    </div>`, 'pn-info-backdrop');

  let revs = [];
  const load = async () => {
    try { revs = await getRevisions(item.id); }
    catch (err) { revs = []; window.showToast?.(err.message, 'error'); }
    _renderRevList(mount, revs);
  };
  await load();

  mount.querySelector('#pn-info-bump').addEventListener('click', () => {
    // Refresh the current item reference after a bump, then reopen info.
    _openBumpRevisionModal(item, async () => {
      const fresh = _items.find(i => i.id === item.id) || item;
      _openInfoModal(fresh);
    });
  });

  mount.querySelector('#pn-cmp-go').addEventListener('click', () => {
    const a = revs.find(r => r.id === mount.querySelector('#pn-cmp-a').value);
    const b = revs.find(r => r.id === mount.querySelector('#pn-cmp-b').value);
    _renderCompare(mount, a, b);
  });
}

function _renderRevList(mount, revs) {
  const list = mount.querySelector('#pn-rev-list');
  const selA = mount.querySelector('#pn-cmp-a');
  const selB = mount.querySelector('#pn-cmp-b');
  const fmtTs = ts => ts ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  if (!revs.length) { list.innerHTML = `<div class="empty-state"><div class="empty-state-title">No history</div></div>`; return; }

  list.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>Rev</th><th>Note</th><th>By</th><th style="white-space:nowrap;">When</th></tr></thead>
      <tbody>${revs.map(r => `
        <tr><td style="font-weight:500;">${esc(r.revision)}</td>
            <td style="max-width:260px;word-break:break-word;">${esc(r.note || '—')}</td>
            <td>${esc(r.actor?.name || '—')}</td>
            <td style="white-space:nowrap;font-size:var(--font-xs);">${esc(fmtTs(r.changed_at))}</td></tr>`).join('')}
      </tbody></table></div>`;

  const opts = revs.map(r => `<option value="${attr(r.id)}">Rev ${esc(r.revision)}</option>`).join('');
  selA.innerHTML = opts; selB.innerHTML = opts;
  if (revs.length > 1) { selA.selectedIndex = 1; selB.selectedIndex = 0; } // older vs newest
}

function _renderCompare(mount, a, b) {
  const out = mount.querySelector('#pn-cmp-result');
  if (!a || !b) { out.innerHTML = `<div class="text-muted" style="font-size:var(--font-xs);">Pick two revisions.</div>`; return; }
  const sa = a.snapshot || {}, sb = b.snapshot || {};
  out.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>Field</th><th>Rev ${esc(a.revision)}</th><th>Rev ${esc(b.revision)}</th></tr></thead>
      <tbody>${SNAP_FIELDS.map(([key, label]) => {
        const va = sa[key], vb = sb[key];
        const diff = (va ?? '') !== (vb ?? '');
        return `<tr${diff ? ' style="background:var(--warning-bg, rgba(255,152,0,.12));"' : ''}>
          <td class="text-muted" style="font-size:var(--font-xs);white-space:nowrap;">${esc(label)}</td>
          <td style="word-break:break-word;">${va ? esc(String(va)) : '<span class="text-muted">—</span>'}</td>
          <td style="word-break:break-word;">${vb ? esc(String(vb)) : '<span class="text-muted">—</span>'}</td></tr>`;
      }).join('')}</tbody></table></div>
      <div class="text-muted" style="font-size:var(--font-xs);margin-top:6px;">Highlighted rows differ between the two revisions.</div>`;
}

// ──────────────────────────────────────────────────────────────
// DELETE ITEM (admin only)
// ──────────────────────────────────────────────────────────────

function _confirmDeleteItem(item) {
  const { mount, close } = _mountModal(`
    <div class="modal-backdrop" id="pn-del-backdrop">
      <div class="modal modal-sm" id="pn-del-modal">
        <div class="modal-header"><span class="modal-title">Delete item</span><button class="modal-close">&times;</button></div>
        <div class="modal-body"><p style="margin:0;">Delete <strong>${esc(item.part_number)}</strong> (${esc(item.name)})?
          Its number will <strong>not</strong> be reused. Consider marking it obsolete instead. This cannot be undone.</p></div>
        <div class="modal-footer">
          <button class="btn btn-ghost pn-modal-cancel">Cancel</button>
          <button class="btn btn-danger" id="pn-del-confirm">Delete</button>
        </div>
      </div>
    </div>`, 'pn-del-backdrop');

  mount.querySelector('#pn-del-confirm').addEventListener('click', async () => {
    const btn = mount.querySelector('#pn-del-confirm');
    btn.disabled = true;
    try { await deleteItem(item.id); close(); await _loadItems(); window.showToast?.('Item deleted', 'success'); }
    catch (err) { window.showToast?.(err.message, 'error'); btn.disabled = false; }
  });
}

// ──────────────────────────────────────────────────────────────
// CATEGORY CODES MANAGER (admin/manager)
// ──────────────────────────────────────────────────────────────

async function _openCategoriesModal() {
  let cats;
  try { cats = await getCategories({ includeInactive: true }); }
  catch (err) { window.showToast?.(err.message, 'error'); return; }

  const { mount } = _mountModal(`
    <div class="modal-backdrop" id="pn-cats-backdrop">
      <div class="modal modal-lg" id="pn-cats-modal">
        <div class="modal-header"><span class="modal-title">Category codes (CAT)</span><button class="modal-close">&times;</button></div>
        <div class="modal-body">
          <div class="text-muted" style="font-size:var(--font-xs);margin-bottom:var(--sp-3);">
            3-letter codes, frozen into the number at minting. Codes are never deleted once used — deactivate instead (existing numbers stay valid). Descriptions/help are editable anytime.
          </div>
          <div class="table-wrapper"><table>
            <thead><tr><th>Code</th><th>Name</th><th>Covers</th><th>Status</th><th></th></tr></thead>
            <tbody>${cats.map(t => `
              <tr data-code="${attr(t.code)}"${t.is_active ? '' : ' style="opacity:.55;"'}>
                <td style="font-family:var(--font-mono, monospace);font-weight:500;">${esc(t.code)}</td>
                <td>${esc(t.description)}</td>
                <td style="max-width:320px;font-size:var(--font-xs);color:var(--text-muted);word-break:break-word;">${esc(t.covers || '')}</td>
                <td>${t.is_active ? '<span class="badge badge-approved">active</span>' : '<span class="badge badge-rejected">inactive</span>'}</td>
                <td class="col-actions"><div class="row-actions">
                  <button class="btn btn-ghost btn-sm act-cat-edit">Edit</button>
                  <button class="btn btn-ghost btn-sm act-cat-toggle">${t.is_active ? 'Deactivate' : 'Activate'}</button>
                </div></td>
              </tr>`).join('')}</tbody>
          </table></div>
          <div style="display:flex;gap:8px;margin-top:var(--sp-3);align-items:center;flex-wrap:wrap;">
            <input type="text" id="pn-c-code" placeholder="Code (3 letters)" maxlength="3" style="width:130px;text-transform:uppercase;">
            <input type="text" id="pn-c-name" placeholder="Name" style="width:180px;">
            <input type="text" id="pn-c-covers" placeholder="Covers (help text)" style="flex:1;min-width:200px;">
            <button class="btn btn-primary" id="pn-c-add">ADD</button>
          </div>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost pn-modal-cancel">Close</button></div>
      </div>
    </div>`, 'pn-cats-backdrop');

  let editing = null;
  const codeEl = mount.querySelector('#pn-c-code');
  const nameEl = mount.querySelector('#pn-c-name');
  const covEl  = mount.querySelector('#pn-c-covers');
  const addBtn = mount.querySelector('#pn-c-add');

  addBtn.addEventListener('click', async () => {
    const code = codeEl.value.trim().toUpperCase();
    const name = nameEl.value.trim();
    const covers = covEl.value.trim();
    if (!editing && !/^[A-Z]{3}$/.test(code)) { window.showToast?.('Code must be exactly 3 letters', 'error'); return; }
    if (!name) { window.showToast?.('Enter a name', 'error'); return; }
    addBtn.disabled = true;
    try {
      if (editing) { await updateCategory(editing, { description: name, covers }); window.showToast?.(`${editing} updated`, 'success'); }
      else { await createCategory({ code, description: name, covers, sortOrder: 99 }); window.showToast?.(`${code} added`, 'success'); }
      _categories = await getCategories();
      _renderCatFilter();
      _openCategoriesModal();
    } catch (err) { window.showToast?.(err.message, 'error'); addBtn.disabled = false; }
  });

  mount.querySelectorAll('tbody tr').forEach(tr => {
    const t = cats.find(c => c.code === tr.dataset.code);
    if (!t) return;
    tr.querySelector('.act-cat-edit')?.addEventListener('click', () => {
      editing = t.code; codeEl.value = t.code; codeEl.disabled = true;
      nameEl.value = t.description; covEl.value = t.covers || '';
      addBtn.textContent = 'SAVE'; nameEl.focus();
    });
    tr.querySelector('.act-cat-toggle')?.addEventListener('click', async () => {
      try { await updateCategory(t.code, { isActive: !t.is_active }); _categories = await getCategories(); _renderCatFilter(); _openCategoriesModal(); }
      catch (err) { window.showToast?.(err.message, 'error'); }
    });
  });
}

// ──────────────────────────────────────────────────────────────
// ATTRIBUTE LISTS MANAGER (admin/manager)
// ──────────────────────────────────────────────────────────────

async function _openAttributesModal(activeKind) {
  // Guard: the click handler may pass an event; only accept a real kind string.
  const kind = (typeof activeKind === 'string' && ATTR_KINDS.some(k => k.kind === activeKind))
    ? activeKind : ATTR_KINDS[0].kind;
  let list;
  try { list = await getAttributes({ kind, includeInactive: true }); }
  catch (err) { window.showToast?.(err.message, 'error'); return; }

  const tabs = ATTR_KINDS.map(k =>
    `<button class="btn btn-sm ${k.kind === kind ? 'btn-primary' : 'btn-ghost'} pn-attr-tab" data-kind="${k.kind}">${esc(k.label)}</button>`).join('');

  const { mount } = _mountModal(`
    <div class="modal-backdrop" id="pn-attrs-backdrop">
      <div class="modal modal-lg" id="pn-attrs-modal">
        <div class="modal-header"><span class="modal-title">Attribute lists</span><button class="modal-close">&times;</button></div>
        <div class="modal-body">
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:var(--sp-3);">${tabs}</div>
          <div class="table-wrapper"><table>
            <thead><tr><th>Name</th><th>Status</th><th></th></tr></thead>
            <tbody>${list.length ? list.map(a => `
              <tr data-id="${attr(a.id)}"${a.is_active ? '' : ' style="opacity:.55;"'}>
                <td>${esc(a.name)}</td>
                <td>${a.is_active ? '<span class="badge badge-approved">active</span>' : '<span class="badge badge-rejected">inactive</span>'}</td>
                <td class="col-actions"><div class="row-actions">
                  <button class="btn btn-ghost btn-sm act-attr-edit">Rename</button>
                  <button class="btn btn-ghost btn-sm act-attr-toggle">${a.is_active ? 'Deactivate' : 'Activate'}</button>
                </div></td>
              </tr>`).join('') : `<tr><td colspan="3" class="text-muted" style="padding:var(--sp-3);">No entries yet.</td></tr>`}</tbody>
          </table></div>
          <div style="display:flex;gap:8px;margin-top:var(--sp-3);align-items:center;flex-wrap:wrap;">
            <input type="text" id="pn-a-name" placeholder="Add to “${esc(ATTR_KINDS.find(k => k.kind === kind).label)}”" style="flex:1;min-width:200px;">
            <button class="btn btn-primary" id="pn-a-add">ADD</button>
          </div>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost pn-modal-cancel">Close</button></div>
      </div>
    </div>`, 'pn-attrs-backdrop');

  mount.querySelectorAll('.pn-attr-tab').forEach(b =>
    b.addEventListener('click', () => _openAttributesModal(b.dataset.kind)));

  let editing = null;
  const nameEl = mount.querySelector('#pn-a-name');
  const addBtn = mount.querySelector('#pn-a-add');
  const reload = async () => {
    const all = await getAttributes({});
    _attrs = {};
    ATTR_KINDS.forEach(k => { _attrs[k.kind] = all.filter(a => a.kind === k.kind); });
    _openAttributesModal(kind);
  };

  addBtn.addEventListener('click', async () => {
    const name = nameEl.value.trim();
    if (!name) { window.showToast?.('Enter a name', 'error'); return; }
    addBtn.disabled = true;
    try {
      if (editing) { await updateAttribute(editing, { name }); window.showToast?.('Updated', 'success'); }
      else { await createAttribute({ kind, name, sortOrder: 99 }); window.showToast?.('Added', 'success'); }
      await reload();
    } catch (err) { window.showToast?.(err.message, 'error'); addBtn.disabled = false; }
  });

  mount.querySelectorAll('tbody tr').forEach(tr => {
    const a = list.find(x => x.id === tr.dataset.id);
    if (!a) return;
    tr.querySelector('.act-attr-edit')?.addEventListener('click', () => {
      editing = a.id; nameEl.value = a.name; addBtn.textContent = 'SAVE'; nameEl.focus();
    });
    tr.querySelector('.act-attr-toggle')?.addEventListener('click', async () => {
      try { await updateAttribute(a.id, { isActive: !a.is_active }); await reload(); }
      catch (err) { window.showToast?.(err.message, 'error'); }
    });
  });
}

// ──────────────────────────────────────────────────────────────
// CUSTOMER-PN CONFIG (admin/manager) — per selected project
// ──────────────────────────────────────────────────────────────

function _openConfigModal() {
  const proj = _currentProject();
  if (!proj) { window.showToast?.('Select a project first', 'error'); return; }
  const mode = _config?.customer_pn_mode || 'none';

  const { mount, close } = _mountModal(`
    <div class="modal-backdrop" id="pn-cfg-backdrop">
      <div class="modal" id="pn-cfg-modal">
        <div class="modal-header"><span class="modal-title">Customer PN — ${esc(proj.name)}</span><button class="modal-close">&times;</button></div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:var(--sp-3);">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="display:flex;gap:8px;align-items:center;"><input type="radio" name="pn-cfg-mode" value="none"${mode === 'none' ? ' checked' : ''}> None — internal number only</label>
            <label style="display:flex;gap:8px;align-items:center;"><input type="radio" name="pn-cfg-mode" value="template"${mode === 'template' ? ' checked' : ''}> Generated from a template</label>
            <label style="display:flex;gap:8px;align-items:center;"><input type="radio" name="pn-cfg-mode" value="manual"${mode === 'manual' ? ' checked' : ''}> Entered manually per item</label>
          </div>
          <label id="pn-cfg-tpl-wrap" style="display:${mode === 'template' ? 'flex' : 'none'};flex-direction:column;gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Template * — placeholders: {CC} {PPP} {AA} {SEQ:4} (padded) or {SEQ}</span>
            <input type="text" id="pn-cfg-tpl" value="${attr(_config?.customer_pn_template || '')}" placeholder="e.g. ACME-{PPP}-{SEQ:4}">
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost pn-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="pn-cfg-save">SAVE</button>
        </div>
      </div>
    </div>`, 'pn-cfg-backdrop');

  const tplWrap = mount.querySelector('#pn-cfg-tpl-wrap');
  mount.querySelectorAll('input[name="pn-cfg-mode"]').forEach(r =>
    r.addEventListener('change', () => { tplWrap.style.display = r.value === 'template' && r.checked ? 'flex' : 'none'; }));

  mount.querySelector('#pn-cfg-save').addEventListener('click', async () => {
    const selMode = mount.querySelector('input[name="pn-cfg-mode"]:checked')?.value || 'none';
    const tpl = mount.querySelector('#pn-cfg-tpl').value.trim();
    if (selMode === 'template' && !tpl) { window.showToast?.('Enter the customer PN template', 'error'); return; }
    const btn = mount.querySelector('#pn-cfg-save');
    btn.disabled = true;
    try {
      await upsertProjectConfig(_projectId, { mode: selMode, template: tpl });
      close();
      await _loadConfig();
      _renderTable();
      window.showToast?.('Customer PN settings saved', 'success');
    } catch (err) { window.showToast?.(err.message, 'error'); btn.disabled = false; }
  });
}
