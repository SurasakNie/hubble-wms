// pages/tags.js — Tags list with color swatch, usage count, quick-add & edit
// Spec: simple table (NAME + color swatch / usage count / row actions).
// Admin & owner get full CRUD; other roles see a read-only list.

import { getTags, createTag, updateTag, deleteTag, getTagUsage } from '../api/tags.js';
import { isAdmin } from '../auth.js';
import { esc, attr, safeColor } from '../format.js';

// 12 base hues from tokens.css + 12 darker variants (Material 700/800), all distinct.
const TAG_COLORS = [
  '#03a9f4', '#9c27b0', '#4caf50', '#e91e63', '#ff9800', '#2196f3',
  '#009688', '#f44336', '#ffc107', '#3f51b5', '#8bc34a', '#795548',
  // darker variants, same order
  '#0277bd', '#6a1b9a', '#2e7d32', '#ad1457', '#ef6c00', '#1565c0',
  '#00695c', '#c62828', '#ff8f00', '#283593', '#558b2f', '#4e342e',
];

let _profile  = null;
let _tags     = [];
let _usage    = {};
let _search   = '';
let _addColor = TAG_COLORS[0];

// ──────────────────────────────────────────────────────────────
// ENTRY POINT
// ──────────────────────────────────────────────────────────────

export async function render(profile) {
  _profile  = profile;
  _search   = '';
  _addColor = TAG_COLORS[0];

  const admin = isAdmin();

  document.getElementById('topbar-left').innerHTML =
    `<span class="topbar-title">Tags</span>`;

  document.getElementById('content').innerHTML = `
    ${admin ? `
    <!-- Quick-add -->
    <div class="card" style="margin-bottom:var(--sp-4)">
      <div style="display:flex; gap:var(--sp-3); align-items:center; flex-wrap:wrap;">
        <input type="text" id="tag-name" placeholder="Add new tag" style="flex:1; min-width:200px;">
        <div class="color-picker" id="tag-color-picker">
          ${_swatchesHtml(_addColor)}
        </div>
        <button class="btn btn-primary" id="tag-add">ADD</button>
      </div>
    </div>` : ''}

    <!-- Filter bar -->
    <div class="filter-bar">
      <div class="search-input">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="search" id="tag-search" placeholder="Search tags…">
      </div>
    </div>

    <!-- Table -->
    <div id="tag-table-wrap">
      <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
    </div>
  `;

  _wireControls();
  await _load();
}

function _wireControls() {
  const content = document.getElementById('content');
  content.querySelector('#tag-add')?.addEventListener('click', _handleAdd);
  content.querySelector('#tag-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _handleAdd();
  });
  content.querySelector('#tag-search')?.addEventListener('input', e => {
    _search = e.target.value.trim().toLowerCase();
    _renderRows();
  });
  // Add-form color picker
  const picker = content.querySelector('#tag-color-picker');
  if (picker) _wireSwatches(picker, color => { _addColor = color; });
}

async function _load() {
  try {
    [_tags, _usage] = await Promise.all([getTags(), getTagUsage()]);
  } catch (err) {
    window.showToast?.(err.message, 'error');
    _tags  = [];
    _usage = {};
  }
  _renderRows();
}

// ──────────────────────────────────────────────────────────────
// TABLE
// ──────────────────────────────────────────────────────────────

function _filtered() {
  if (!_search) return _tags;
  return _tags.filter(t => (t.name || '').toLowerCase().includes(_search));
}

function _renderRows() {
  const wrap = document.getElementById('tag-table-wrap');
  if (!wrap) return;

  const rows  = _filtered();
  const admin = isAdmin();

  if (rows.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="margin-top:40px">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
        <div class="empty-state-title">${_search ? 'No matching tags' : 'No tags yet'}</div>
        <div class="empty-state-sub">${_search ? 'Try a different search' : (admin ? 'Add your first tag above' : 'No tags have been created yet')}</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Usage</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(t => _renderRow(t, admin)).join('')}
        </tbody>
      </table>
    </div>`;

  // Wire row actions
  wrap.querySelectorAll('tbody tr').forEach(tr => {
    const tag = _tags.find(t => t.id === tr.dataset.id);
    if (!tag) return;
    tr.querySelector('.act-edit')?.addEventListener('click', () => _openEditModal(tag));
    tr.querySelector('.act-delete')?.addEventListener('click', () => _confirmDelete(tag));
  });
}

function _renderRow(t, admin) {
  const color = t.color || '#8b97a2';
  const count = _usage[t.id] || 0;

  const editBtn = admin
    ? `<button class="row-action-btn act-edit" title="Edit">
         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
           <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
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
    <tr data-id="${t.id}">
      <td style="font-weight:500;">
        <span style="display:inline-flex; align-items:center; gap:8px;">
          <span style="width:12px; height:12px; border-radius:50%; background:${safeColor(color)}; flex:none;"></span>
          ${esc(t.name || '')}
        </span>
      </td>
      <td><span class="text-muted">${count}</span></td>
      <td class="col-actions">
        <div class="row-actions">
          ${editBtn}
          ${deleteBtn}
        </div>
      </td>
    </tr>`;
}

// ──────────────────────────────────────────────────────────────
// ACTIONS
// ──────────────────────────────────────────────────────────────

async function _handleAdd() {
  const content = document.getElementById('content');
  const nameEl  = content.querySelector('#tag-name');
  const addBtn  = content.querySelector('#tag-add');

  const name = nameEl.value.trim();
  if (!name) { window.showToast?.('Enter a tag name', 'error'); return; }
  if (_tags.some(t => (t.name || '').toLowerCase() === name.toLowerCase())) {
    window.showToast?.('A tag with that name already exists', 'error');
    return;
  }

  addBtn.disabled = true;
  try {
    const tag = await createTag({ name, color: _addColor });
    _tags.push(tag);
    _tags.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    nameEl.value = '';
    nameEl.focus();
    _renderRows();
    window.showToast?.('Tag added', 'success');
  } catch (err) {
    window.showToast?.(err.message, 'error');
  } finally {
    addBtn.disabled = false;
  }
}

// ──────────────────────────────────────────────────────────────
// EDIT MODAL (admin/owner only)
// ──────────────────────────────────────────────────────────────

function _openEditModal(tag) {
  const mount = document.getElementById('modal-mount');
  let editColor = tag.color || TAG_COLORS[0];

  mount.innerHTML = `
    <div class="modal-backdrop" id="tag-modal-backdrop">
      <div class="modal modal-sm" id="tag-modal">
        <div class="modal-header">
          <span class="modal-title">Edit tag</span>
          <button class="modal-close" id="tag-modal-close">&times;</button>
        </div>
        <div class="modal-body" style="display:flex; flex-direction:column; gap:var(--sp-3);">
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Name</span>
            <input type="text" id="tag-edit-name" value="${attr(tag.name || '')}">
          </label>
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span class="text-muted" style="font-size:var(--font-xs)">Color</span>
            <div class="color-picker" id="tag-edit-color-picker">
              ${_swatchesHtml(editColor)}
            </div>
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="tag-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="tag-modal-save">SAVE</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#tag-modal-close').addEventListener('click', close);
  mount.querySelector('#tag-modal-cancel').addEventListener('click', close);
  mount.querySelector('#tag-modal-backdrop').addEventListener('click', e => {
    if (e.target.id === 'tag-modal-backdrop') close();
  });

  _wireSwatches(mount.querySelector('#tag-edit-color-picker'), color => { editColor = color; });

  mount.querySelector('#tag-modal-save').addEventListener('click', async () => {
    const name = mount.querySelector('#tag-edit-name').value.trim();
    if (!name) { window.showToast?.('Enter a tag name', 'error'); return; }
    if (_tags.some(t => t.id !== tag.id && (t.name || '').toLowerCase() === name.toLowerCase())) {
      window.showToast?.('A tag with that name already exists', 'error');
      return;
    }

    const saveBtn = mount.querySelector('#tag-modal-save');
    saveBtn.disabled = true;
    try {
      const updated = await updateTag(tag.id, { name, color: editColor });
      const idx = _tags.findIndex(t => t.id === tag.id);
      if (idx >= 0) _tags[idx] = updated;
      _tags.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      close();
      _renderRows();
      window.showToast?.('Tag updated', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      saveBtn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// DELETE CONFIRM (admin/owner only)
// ──────────────────────────────────────────────────────────────

function _confirmDelete(tag) {
  const mount = document.getElementById('modal-mount');
  const count = _usage[tag.id] || 0;
  const usageNote = count > 0
    ? `It is used on <strong>${count}</strong> ${count === 1 ? 'entry' : 'entries'} and will be removed from them. `
    : '';

  mount.innerHTML = `
    <div class="modal-backdrop" id="tag-del-backdrop">
      <div class="modal modal-sm" id="tag-del-modal">
        <div class="modal-header">
          <span class="modal-title">Delete tag</span>
          <button class="modal-close" id="tag-del-close">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin:0;">Delete <strong>${esc(tag.name || '')}</strong>? ${usageNote}This cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="tag-del-cancel">Cancel</button>
          <button class="btn btn-danger" id="tag-del-confirm">Delete</button>
        </div>
      </div>
    </div>`;

  const close = () => { mount.innerHTML = ''; };
  mount.querySelector('#tag-del-close').addEventListener('click', close);
  mount.querySelector('#tag-del-cancel').addEventListener('click', close);
  mount.querySelector('#tag-del-backdrop').addEventListener('click', e => {
    if (e.target.id === 'tag-del-backdrop') close();
  });

  mount.querySelector('#tag-del-confirm').addEventListener('click', async () => {
    const btn = mount.querySelector('#tag-del-confirm');
    btn.disabled = true;
    try {
      await deleteTag(tag.id);
      _tags = _tags.filter(t => t.id !== tag.id);
      delete _usage[tag.id];
      close();
      _renderRows();
      window.showToast?.('Tag deleted', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ──────────────────────────────────────────────────────────────
// COLOR PICKER HELPERS
// ──────────────────────────────────────────────────────────────

function _swatchesHtml(selected) {
  return TAG_COLORS.map(c =>
    `<button type="button" class="color-swatch${c === selected ? ' selected' : ''}"
       data-color="${c}" title="${c}" style="background:${c};"></button>`
  ).join('');
}

function _wireSwatches(picker, onPick) {
  if (!picker) return;
  picker.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      onPick(sw.dataset.color);
    });
  });
}

