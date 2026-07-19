// components/entryModal.js — Shared time-entry create/edit modal
// Used by: Calendar drag, Tracker quick-edit, Timesheet cell click

import { createEntry, updateEntry, deleteEntry } from '../api/timeEntries.js';
import { getProjectsForEntry } from '../api/projects.js';
import { getTags } from '../api/tags.js';
import { formatTime, formatDuration, timesToHours, todayISO, esc, safeColor } from '../format.js';
import { confirmModal } from './confirmModal.js';
import { isAdmin, isManager } from '../auth.js';

let _profile  = null;
let _projects = [];
let _tags     = [];
let _onSave   = null;
let _onDelete = null;
let _editId   = null;
let _userId   = null;  // explicit user_id for admin creating entries for a teammate
let _selectedTagIds = [];

// ──────────────────────────────────────────────────────────────
// PUBLIC API
// ──────────────────────────────────────────────────────────────

/**
 * Open the modal to create a new entry.
 * @param {object} profile  - current user profile
 * @param {object} defaults - { date, startTime, endTime, projectId, taskId }
 * @param {Function} onSave - called with the saved entry
 */
export async function openCreateModal(profile, defaults = {}, onSave) {
  _profile  = profile;
  _onSave   = onSave;
  _onDelete = null;
  _editId   = null;
  _userId   = defaults.userId || null;
  _selectedTagIds = [];

  await _loadData();
  _renderModal({
    title: 'Add time',
    date:       defaults.date      || todayISO(),
    startTime:  defaults.startTime || '',
    endTime:    defaults.endTime   || '',
    projectId:  defaults.projectId || '',
    taskId:     defaults.taskId    || '',
    description: '',
    isBillable:  true,
    tagIds:      [],
    mode:        'start-end',
  });
}

/**
 * Open the modal to edit an existing entry.
 */
export async function openEditModal(profile, entry, onSave, onDelete) {
  _profile   = profile;
  _onSave    = onSave;
  _onDelete  = onDelete;
  _editId    = entry.id;
  _selectedTagIds = (entry.time_entry_tags || []).map(t => t.tag.id);

  await _loadData();
  const mode = (entry.start_time && entry.end_time) ? 'start-end' : 'total';
  _renderModal({
    title:       'Edit time',
    date:        entry.date,
    startTime:   entry.start_time  || '',
    endTime:     entry.end_time    || '',
    totalHours:  entry.total_hours || '',
    projectId:   entry.project_id  || '',
    taskId:      entry.task_id     || '',
    description: entry.description || '',
    isBillable:  entry.is_billable !== false,
    tagIds:      _selectedTagIds,
    showDelete:  true,
    mode,
  });
}

// ──────────────────────────────────────────────────────────────
// PRIVATE
// ──────────────────────────────────────────────────────────────

async function _loadData() {
  [_projects, _tags] = await Promise.all([
    getProjectsForEntry(_profile),
    getTags(),
  ]);
}

function _renderModal({ title, date, startTime, endTime, totalHours = '', projectId, taskId, description, isBillable, tagIds, showDelete = false, mode = 'start-end' }) {
  const mount = document.getElementById('modal-mount');

  // Build project options
  let projectOptions = '<option value="">— Select project —</option>';
  for (const p of _projects) {
    const selected = p.id === projectId ? 'selected' : '';
    const client   = p.client?.name ? ` (${esc(p.client.name)})` : '';
    projectOptions += `<option value="${p.id}" data-color="${safeColor(p.color)}" ${selected}>${esc(p.name)}${client}</option>`;
  }

  // Build task options for selected project
  const taskOptions = _buildTaskOptions(projectId, taskId);

  // Build tag chips
  const tagChipsHtml = _buildTagChips(_selectedTagIds);

  mount.innerHTML = `
    <div class="modal-backdrop" id="entry-modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">${title}</span>
          <button class="modal-close" id="entry-modal-close">✕</button>
        </div>
        <div class="modal-body">

          <!-- Project + Task -->
          <div class="form-group">
            <label>Project</label>
            <select id="em-project">${projectOptions}</select>
          </div>
          <div class="form-group" id="em-task-group">
            <label>Task <span class="text-muted" style="font-weight:400">(optional)</span></label>
            <select id="em-task">${taskOptions}</select>
          </div>

          <!-- Date -->
          <div class="form-group">
            <label>Date</label>
            <input type="date" id="em-date" value="${date}">
          </div>

          <!-- Time mode toggle -->
          <div class="form-group">
            <label>Time input</label>
            <div class="toggle-row">
              <label>
                <input type="radio" name="em-mode" value="start-end" ${mode === 'start-end' ? 'checked' : ''}>
                Start + End
              </label>
              <label>
                <input type="radio" name="em-mode" value="total" ${mode === 'total' ? 'checked' : ''}>
                Total hours
              </label>
            </div>
          </div>

          <!-- Start + End panel -->
          <div id="em-panel-times" style="display:${mode === 'start-end' ? 'flex' : 'none'}; gap:12px; align-items:flex-end;">
            <div class="form-group" style="flex:1">
              <label>Start</label>
              <input type="time" id="em-start" value="${startTime}">
            </div>
            <div class="form-group" style="flex:1">
              <label>End</label>
              <input type="time" id="em-end" value="${endTime}">
            </div>
            <div style="padding-bottom:8px; color:var(--text-muted); font-size:13px; min-width:56px; text-align:right;" id="em-duration-display">
              ${startTime && endTime ? formatDuration(timesToHours(startTime, endTime)) : '—'}
            </div>
          </div>

          <!-- Total hours panel -->
          <div id="em-panel-total" style="display:${mode === 'total' ? 'block' : 'none'};">
            <div class="form-group">
              <label>Total hours</label>
              <input type="number" id="em-total" min="0" max="24" step="0.25" value="${totalHours}" placeholder="e.g. 2.5">
            </div>
          </div>

          <!-- Tags (compact inline row) -->
          <div class="form-group" style="margin-bottom:var(--sp-2)">
            <label>Tags</label>
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-height:26px;">
              <div id="em-tags-display" style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                ${tagChipsHtml}
              </div>
              <select id="em-tag-picker" style="width:auto; font-size:11px; padding:2px 6px; height:24px; min-width:80px;">
                <option value="">+ Tag</option>
                ${_tags.map(t => `<option value="${t.id}" style="color:${safeColor(t.color)}">${esc(t.name)}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Billable toggle (admin/manager only — members' entries keep their default billable state) -->
          ${(isAdmin() || isManager()) ? `
          <div class="form-group">
            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
              <input type="checkbox" id="em-billable" ${isBillable ? 'checked' : ''} style="width:15px;height:15px;">
              Billable
              <span class="text-muted" style="font-size:12px;">Mark this entry as billable</span>
            </label>
          </div>` : ''}

          <!-- Description -->
          <div class="form-group">
            <label>Description</label>
            <textarea id="em-description" placeholder="What did you work on?">${esc(description)}</textarea>
          </div>

        </div><!-- /.modal-body -->

        <div class="modal-footer">
          ${showDelete ? '<button class="btn btn-danger btn-sm" id="em-delete">Delete</button>' : ''}
          ${showDelete ? '<button class="btn btn-ghost btn-sm" id="em-duplicate">Duplicate</button>' : ''}
          <button class="btn btn-ghost" id="em-cancel">Cancel</button>
          <button class="btn btn-primary" id="em-save">SAVE</button>
        </div>
      </div>
    </div>
  `;

  // ── Event wiring ────────────────────────────────────────────

  // Close
  mount.querySelector('#entry-modal-close').addEventListener('click', _closeModal);
  mount.querySelector('#em-cancel').addEventListener('click', _closeModal);
  mount.querySelector('#entry-modal-backdrop')._escClose = _closeModal;

  // Project change → refresh task list
  mount.querySelector('#em-project').addEventListener('change', e => {
    const pid = e.target.value;
    mount.querySelector('#em-task').innerHTML = _buildTaskOptions(pid, '');
  });

  // Mode toggle
  mount.querySelectorAll('input[name="em-mode"]').forEach(radio => {
    radio.addEventListener('change', e => {
      const isStartEnd = e.target.value === 'start-end';
      mount.querySelector('#em-panel-times').style.display = isStartEnd ? 'flex' : 'none';
      mount.querySelector('#em-panel-total').style.display = isStartEnd ? 'none' : 'block';
    });
  });

  // Duration display
  const updateDuration = () => {
    const s = mount.querySelector('#em-start').value;
    const e = mount.querySelector('#em-end').value;
    const disp = mount.querySelector('#em-duration-display');
    if (disp) disp.textContent = s && e ? formatDuration(timesToHours(s, e)) : '—';
  };
  mount.querySelector('#em-start')?.addEventListener('input', updateDuration);
  mount.querySelector('#em-end')?.addEventListener('input', updateDuration);

  // Tag picker
  mount.querySelector('#em-tag-picker').addEventListener('change', e => {
    const tid = e.target.value;
    if (!tid || _selectedTagIds.includes(tid)) { e.target.value = ''; return; }
    _selectedTagIds.push(tid);
    mount.querySelector('#em-tags-display').innerHTML = _buildTagChips(_selectedTagIds);
    _wireTagRemove();
    e.target.value = '';
  });
  _wireTagRemove();

  // Delete
  mount.querySelector('#em-delete')?.addEventListener('click', async () => {
    if (!await confirmModal({ title: 'Delete time entry', message: 'Delete this time entry?', confirmText: 'Delete', danger: true })) return;
    try {
      await deleteEntry(_editId);
      _closeModal();
      if (_onDelete) _onDelete(_editId);
    } catch (err) {
      window.showToast?.(err.message, 'error');
    }
  });

  // Duplicate — creates a copy from the current form state, then closes
  mount.querySelector('#em-duplicate')?.addEventListener('click', async () => {
    const dupBtn = mount.querySelector('#em-duplicate');
    const projectId = mount.querySelector('#em-project').value;
    if (!projectId) { window.showToast?.('Please select a project', 'error'); return; }
    dupBtn.disabled = true;
    try {
      const mode        = mount.querySelector('input[name="em-mode"]:checked').value;
      const taskId      = mount.querySelector('#em-task').value || null;
      const date        = mount.querySelector('#em-date').value;
      const description = mount.querySelector('#em-description').value.trim();
      const billable    = mount.querySelector('#em-billable')?.checked ?? isBillable;
      let startTime = null, endTime = null, totalHours = null;
      if (mode === 'start-end') {
        startTime = mount.querySelector('#em-start').value || null;
        endTime   = mount.querySelector('#em-end').value   || null;
      } else {
        totalHours = parseFloat(mount.querySelector('#em-total').value) || null;
      }
      const newEntry = await createEntry({
        projectId, taskId, date, startTime, endTime, totalHours,
        description, isBillable: billable, tagIds: [..._selectedTagIds],
      });
      _closeModal();
      if (_onSave) _onSave(newEntry);
      window.showToast?.('Entry duplicated', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      dupBtn.disabled = false;
    }
  });

  // Save
  mount.querySelector('#em-save').addEventListener('click', async () => {
    const saveBtn = mount.querySelector('#em-save');
    saveBtn.disabled = true;
    try {
      const mode        = mount.querySelector('input[name="em-mode"]:checked').value;
      const projectId   = mount.querySelector('#em-project').value;
      const taskId      = mount.querySelector('#em-task').value || null;
      const date        = mount.querySelector('#em-date').value;
      const description = mount.querySelector('#em-description').value.trim();
      const billable    = mount.querySelector('#em-billable')?.checked ?? isBillable;

      if (!projectId) { window.showToast?.('Please select a project', 'error'); saveBtn.disabled = false; return; }
      if (!date)      { window.showToast?.('Please select a date', 'error');    saveBtn.disabled = false; return; }

      let startTime = null, endTime = null, totalHours = null;
      if (mode === 'start-end') {
        startTime = mount.querySelector('#em-start').value || null;
        endTime   = mount.querySelector('#em-end').value   || null;
        if (startTime && endTime && endTime <= startTime) {
          window.showToast?.('End time must be after start time', 'error');
          saveBtn.disabled = false; return;
        }
      } else {
        totalHours = parseFloat(mount.querySelector('#em-total').value) || null;
      }

      const payload = { projectId, taskId, date, startTime, endTime, totalHours, description, isBillable: billable, tagIds: _selectedTagIds };
      if (_userId) payload.userId = _userId;  // admin creating entry for a teammate

      let saved;
      if (_editId) {
        saved = await updateEntry(_editId, payload);
      } else {
        saved = await createEntry(payload);
      }

      _closeModal();
      if (_onSave) _onSave(saved);
      window.showToast?.(_editId ? 'Entry updated' : 'Entry saved', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
      saveBtn.disabled = false;
    }
  });
}

function _buildTaskOptions(projectId, selectedTaskId) {
  const project = _projects.find(p => p.id === projectId);
  let html = '<option value="">— No specific task —</option>';
  if (project?.tasks) {
    for (const t of project.tasks) {
      html += `<option value="${t.id}" ${t.id === selectedTaskId ? 'selected' : ''}>${esc(t.name)}</option>`;
    }
  }
  return html;
}

function _buildTagChips(tagIds) {
  return tagIds.map(tid => {
    const tag = _tags.find(t => t.id === tid);
    if (!tag) return '';
    const c = safeColor(tag.color);
    return `<span class="tag-chip" style="background:${c}22; color:${c}">
      ${esc(tag.name)}
      <span class="remove-tag" data-tid="${tid}">×</span>
    </span>`;
  }).join('');
}

function _wireTagRemove() {
  const mount = document.getElementById('modal-mount');
  mount.querySelectorAll('.remove-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedTagIds = _selectedTagIds.filter(id => id !== btn.dataset.tid);
      mount.querySelector('#em-tags-display').innerHTML = _buildTagChips(_selectedTagIds);
      _wireTagRemove();
    });
  });
}

function _closeModal() {
  const mount = document.getElementById('modal-mount');
  mount.innerHTML = '';
  _editId = null;
  _selectedTagIds = [];
}
