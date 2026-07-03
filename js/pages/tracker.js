// pages/tracker.js — Time Tracker view
// Spec §3.1: Quick-input bar + daily-grouped entry list

import { getTrackerEntries, createEntry, countEntries } from '../api/timeEntries.js';
import { getProjectsForEntry } from '../api/projects.js';
import { getTags }             from '../api/tags.js';
import { getEmployees }        from '../api/employees.js';
import { openEditModal }       from '../components/entryModal.js';
import { empSelectHtml, wireEmpSelect } from '../components/empSelect.js';
import { isAdmin, isManager }  from '../auth.js';
import {
  formatDuration, formatDayLabel, formatTimeRange,
  timesToHours, todayISO, esc, safeColor
} from '../format.js';

const PAGE_SIZE = 50;

let _profile   = null;
let _projects  = [];
let _tags      = [];
let _entries   = [];
let _page      = 0;
let _total     = 0;
let _selectedTagIds = [];
let _isBillable = true;
let _viewUserId = null;   // null = own; set when admin views a teammate
let _employees  = [];     // loaded for admin picker

// ──────────────────────────────────────────────────────────────
// ENTRY POINT
// ──────────────────────────────────────────────────────────────

export async function render(profile) {
  _profile = profile;
  _page    = 0;
  _selectedTagIds = [];
  _isBillable = true;
  _viewUserId = null;
  _employees  = [];

  // Set top bar
  const topbar = document.getElementById('topbar-left');
  topbar.innerHTML = `<span class="topbar-title">Time Tracker</span>
    ${(isAdmin() || isManager()) ? `<span id="tk-emp-slot" style="display:inline-flex;margin-left:var(--sp-3);"></span>` : ''}`;

  // Render shell
  document.getElementById('content').innerHTML = `
    <!-- Quick-add bar -->
    <div class="card" style="margin-bottom:var(--sp-4)">
      <div id="quick-add-form">
        ${_renderQuickAddForm()}
      </div>
    </div>

    <!-- Entry list -->
    <div id="entry-list-wrap">
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <div class="empty-state-title">Loading entries…</div>
      </div>
    </div>

    <!-- Pagination -->
    <div id="pagination-row" class="flex justify-end gap-3 mt-4" style="display:none!important"></div>
  `;

  _wireQuickAdd();

  // Load data in parallel
  const loadResult = await Promise.all([
    getProjectsForEntry(profile),
    getTags(),
    (isAdmin() || isManager()) ? getEmployees() : Promise.resolve([]),
  ]);
  [_projects, _tags] = loadResult;

  // Update project dropdown now that data is loaded
  document.getElementById('qa-project').innerHTML = _projectOptions();
  document.getElementById('qa-tag-picker').innerHTML = `<option value="">🏷</option>` +
    _tags.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');

  // Admin teammate picker
  if (isAdmin() || isManager()) {
    _employees = loadResult[2].filter(e => e.user_id && e.user_id !== profile.id);
    const slot = document.getElementById('tk-emp-slot');
    if (slot) {
      slot.innerHTML = empSelectHtml('tk', _employees, { placeholder: 'Myself' });
      wireEmpSelect('tk', _employees, emp => {
        _viewUserId = emp?.user_id || null;
        _page = 0;
        _loadEntries();
      });
    }
  }

  await _loadEntries();
}

// ──────────────────────────────────────────────────────────────
// QUICK-ADD FORM
// ──────────────────────────────────────────────────────────────

function _renderQuickAddForm() {
  // Defaults: start = current time, end = +1 hour (→ 1:00 duration), date = today.
  const start = _nowHHMM();
  const end   = _addHoursToTime(start, 1);
  return `
    <div style="display:flex; align-items:center; gap:var(--sp-3); flex-wrap:wrap;">
      <!-- Description -->
      <input type="text" id="qa-desc" placeholder="What have you worked on?"
             style="flex:1; min-width:240px;">

      <!-- Project picker -->
      <select id="qa-project" style="width:auto; min-width:150px;">
        <option value="">+ Task @Project</option>
      </select>

      <!-- Tag picker (icon) + chips -->
      <select id="qa-tag-picker" style="width:auto; min-width:60px;" title="Add tag">
        <option value="">🏷</option>
      </select>
      <div id="qa-tags-display" style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;"></div>

      <!-- Billable toggle -->
      <button class="btn-billable active" id="qa-billable" title="Billable">$</button>

      <!-- Divider -->
      <span aria-hidden="true" style="width:1px; height:24px; background:var(--border); flex-shrink:0;"></span>

      <!-- Start / End -->
      <input type="time" id="qa-start" value="${start}" style="width:92px;">
      <span class="text-muted">–</span>
      <input type="time" id="qa-end" value="${end}" style="width:92px;">

      <!-- Date (current picked date) -->
      <input type="date" id="qa-date" value="${todayISO()}" style="width:150px;">

      <!-- Duration (editable: type a duration to set the end time) -->
      <input type="text" id="qa-duration" value="${formatDuration(1)}" title="Duration (h:mm)"
             style="width:64px; text-align:center;">

      <!-- Add button -->
      <button class="btn btn-primary" id="qa-add">ADD</button>
    </div>
  `;
}

function _wireQuickAdd() {
  const content = document.getElementById('content');

  const startEl = content.querySelector('#qa-start');
  const endEl   = content.querySelector('#qa-end');
  const durEl   = content.querySelector('#qa-duration');

  // Start/End edits → recompute the duration field.
  const syncDurationFromTimes = () => {
    if (durEl && startEl?.value && endEl?.value) {
      durEl.value = formatDuration(timesToHours(startEl.value, endEl.value));
    }
  };
  startEl?.addEventListener('input', syncDurationFromTimes);
  endEl?.addEventListener('input', syncDurationFromTimes);

  // Editable duration → set end = start + duration (preserves "total hours" entry).
  durEl?.addEventListener('change', () => {
    const hours = _parseDurationToHours(durEl.value);
    if (hours === null) { syncDurationFromTimes(); return; }   // invalid → revert display
    if (!startEl.value) startEl.value = _nowHHMM();
    endEl.value = _addHoursToTime(startEl.value, hours);
    durEl.value = formatDuration(hours);
  });

  // Billable toggle
  content.querySelector('#qa-billable')?.addEventListener('click', e => {
    _isBillable = !_isBillable;
    e.currentTarget.classList.toggle('active', _isBillable);
  });

  // Tag picker
  content.querySelector('#qa-tag-picker')?.addEventListener('change', e => {
    const tid = e.target.value;
    if (!tid || _selectedTagIds.includes(tid)) { e.target.value = ''; return; }
    _selectedTagIds.push(tid);
    _renderQuickTags();
    e.target.value = '';
  });

  // Add button
  content.querySelector('#qa-add')?.addEventListener('click', _handleAdd);

  // Enter key on description
  content.querySelector('#qa-desc')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _handleAdd();
  });
}

async function _handleAdd() {
  const content    = document.getElementById('content');
  const desc       = content.querySelector('#qa-desc')?.value.trim();
  const projectId  = content.querySelector('#qa-project')?.value;
  const date       = content.querySelector('#qa-date')?.value || todayISO();

  if (!projectId) { window.showToast?.('Select a project first', 'error'); return; }

  // Default to current time, with a 1-hour duration if the user hasn't adjusted the end.
  const startTime = content.querySelector('#qa-start')?.value || _nowHHMM();
  let   endTime   = content.querySelector('#qa-end')?.value;
  if (!endTime) endTime = _addHoursToTime(startTime, 1);

  const addBtn = content.querySelector('#qa-add');
  addBtn.disabled = true;

  try {
    const entry = await createEntry({
      projectId, taskId: null, date, startTime, endTime, totalHours: null,
      description: desc, isBillable: _isBillable, tagIds: _selectedTagIds,
      userId: _viewUserId || undefined,
    });

    // Reset form to fresh defaults (current time + 1h, today).
    content.querySelector('#qa-desc').value = '';
    const ns = _nowHHMM();
    content.querySelector('#qa-start').value    = ns;
    content.querySelector('#qa-end').value      = _addHoursToTime(ns, 1);
    content.querySelector('#qa-duration').value = formatDuration(1);
    content.querySelector('#qa-date').value     = todayISO();
    _selectedTagIds = [];
    _renderQuickTags();

    // Prepend to list
    _entries.unshift(entry);
    _total++;
    _renderList();
    window.showToast?.('Entry added', 'success');
  } catch (err) {
    window.showToast?.(err.message, 'error');
  } finally {
    addBtn.disabled = false;
  }
}

function _renderQuickTags() {
  const disp = document.querySelector('#qa-tags-display');
  if (!disp) return;
  disp.innerHTML = _selectedTagIds.map(tid => {
    const tag = _tags.find(t => t.id === tid);
    if (!tag) return '';
    const c = safeColor(tag.color);
    return `<span class="tag-chip" style="background:${c}22;color:${c}">
      ${esc(tag.name)} <span class="remove-tag" data-tid="${tid}" style="cursor:pointer">×</span>
    </span>`;
  }).join('');
  disp.querySelectorAll('.remove-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedTagIds = _selectedTagIds.filter(id => id !== btn.dataset.tid);
      _renderQuickTags();
    });
  });
}

function _projectOptions() {
  return `<option value="">+ Task @Project</option>` +
    _projects.map(p => {
      const c = p.client?.name ? ` · ${esc(p.client.name)}` : '';
      return `<option value="${p.id}">${esc(p.name)}${c}</option>`;
    }).join('');
}

// ──────────────────────────────────────────────────────────────
// TIME HELPERS
// ──────────────────────────────────────────────────────────────

/** Current local time as "HH:MM". */
function _nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Add a decimal-hours offset to an "HH:MM" string, clamped within the same day. */
function _addHoursToTime(hhmm, hours) {
  const [h, m] = hhmm.split(':').map(Number);
  let total = h * 60 + m + Math.round(hours * 60);
  if (total > 24 * 60 - 1) total = 24 * 60 - 1;   // no midnight wrap for quick-add
  if (total < 0) total = 0;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Parse "h:mm" or a decimal like "1.5" into decimal hours; null if invalid. */
function _parseDurationToHours(str) {
  if (!str) return null;
  str = str.trim();
  if (str.includes(':')) {
    const [h, m] = str.split(':');
    const hh = parseInt(h, 10);
    if (isNaN(hh)) return null;
    const mm = parseInt(m, 10);
    return hh + (isNaN(mm) ? 0 : mm) / 60;
  }
  const dec = parseFloat(str);
  return isNaN(dec) ? null : dec;
}

// ──────────────────────────────────────────────────────────────
// ENTRY LIST
// ──────────────────────────────────────────────────────────────

async function _loadEntries() {
  const uid = _viewUserId || undefined;
  [_entries, _total] = await Promise.all([
    getTrackerEntries({ limit: PAGE_SIZE, offset: _page * PAGE_SIZE, userId: uid }),
    countEntries({ userId: uid }),
  ]);
  _renderList();
}

function _renderList() {
  const wrap = document.getElementById('entry-list-wrap');
  if (!wrap) return;

  if (_entries.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <div class="empty-state-title">No entries yet</div>
        <div class="empty-state-sub">Add your first time entry above</div>
      </div>`;
    return;
  }

  // Group by date
  const groups = {};
  for (const entry of _entries) {
    if (!groups[entry.date]) groups[entry.date] = [];
    groups[entry.date].push(entry);
  }

  let html = '';
  for (const [date, entries] of Object.entries(groups)) {
    const dayTotal = entries.reduce((sum, e) => sum + (Number(e.total_hours) || 0), 0);
    html += `
      <div class="card" style="margin-bottom:var(--sp-3)">
        <!-- Day header -->
        <div style="display:flex; justify-content:space-between; align-items:center;
                    padding-bottom:var(--sp-3); border-bottom:1px solid var(--border); margin-bottom:var(--sp-2);">
          <span style="font-weight:600; font-size:var(--font-md)">${formatDayLabel(date)}</span>
          <span class="text-muted" style="font-size:var(--font-sm)">${formatDuration(dayTotal)}</span>
        </div>
        <!-- Entries -->
        ${entries.map(e => _renderEntryRow(e)).join('')}
      </div>`;
  }

  // Pagination
  const totalPages = Math.ceil(_total / PAGE_SIZE);
  let pagination = '';
  if (totalPages > 1) {
    pagination = `
      <div class="flex justify-end gap-3 mt-4">
        <button class="btn btn-ghost btn-sm" id="page-prev" ${_page === 0 ? 'disabled' : ''}>← Prev</button>
        <span class="text-muted" style="align-self:center; font-size:var(--font-sm)">
          Page ${_page + 1} / ${totalPages}
        </span>
        <button class="btn btn-ghost btn-sm" id="page-next" ${_page >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
      </div>`;
  }

  wrap.innerHTML = html + pagination;

  // Wire edit clicks
  wrap.querySelectorAll('.entry-row').forEach(row => {
    row.addEventListener('click', () => {
      const entry = _entries.find(e => e.id === row.dataset.id);
      if (entry) {
        openEditModal(_profile, entry,
          saved => { const idx = _entries.findIndex(e => e.id === saved.id); if (idx >= 0) _entries[idx] = saved; _renderList(); },
          id    => { _entries = _entries.filter(e => e.id !== id); _total--; _renderList(); }
        );
      }
    });
  });

  // Resume buttons
  wrap.querySelectorAll('.btn-resume').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const entry = _entries.find(en => en.id === btn.dataset.id);
      if (!entry) return;
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const nowStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      try {
        const newEntry = await createEntry({
          projectId: entry.project_id,
          taskId: entry.task_id,
          date: todayISO(),
          startTime: nowStr,
          description: entry.description,
          isBillable: entry.is_billable,
          userId: _viewUserId || undefined,
        });
        _entries.unshift(newEntry);
        _total++;
        _renderList();
        window.showToast?.('Timer resumed', 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
      }
    });
  });

  // Pagination
  document.getElementById('page-prev')?.addEventListener('click', () => { _page--; _loadEntries(); });
  document.getElementById('page-next')?.addEventListener('click', () => { _page++; _loadEntries(); });
}

function _renderEntryRow(entry) {
  const project = entry.project;
  const color   = project?.color || '#8b97a2';
  const label   = project ? `${esc(project.name)}${project.clients?.name ? ' · ' + esc(project.clients.name) : ''}` : '—';
  const timeStr = formatTimeRange(entry.start_time, entry.end_time);
  const dur     = formatDuration(Number(entry.total_hours) || 0);
  const tags    = (entry.time_entry_tags || []).map(t => {
    const c = safeColor(t.tag.color);
    return `<span class="tag-chip" style="background:${c}22;color:${c}">${esc(t.tag.name)}</span>`;
  }).join('');

  return `
    <div class="entry-row" data-id="${entry.id}"
         style="display:flex; align-items:center; gap:var(--sp-3); padding:8px var(--sp-2);
                border-radius:var(--radius-sm); cursor:pointer; transition:background var(--transition);"
         onmouseenter="this.style.background='rgba(255,255,255,0.04)'"
         onmouseleave="this.style.background=''">

      <!-- Description + project -->
      <div style="flex:1; min-width:0;">
        <div style="font-size:var(--font-base); color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${entry.description ? esc(entry.description) : '<span class="text-muted">(no description)</span>'}
        </div>
        <div style="display:flex; align-items:center; gap:6px; margin-top:3px; flex-wrap:wrap;">
          <span class="project-dot" style="background:${safeColor(color)}"></span>
          <span class="text-muted" style="font-size:var(--font-xs)">${label}</span>
          ${tags}
          ${entry.is_billable ? '<span style="color:var(--accent);font-size:11px;font-weight:600">$</span>' : ''}
        </div>
      </div>

      <!-- Time range -->
      <span class="text-muted" style="font-size:var(--font-sm); white-space:nowrap; min-width:100px; text-align:right;">
        ${timeStr}
      </span>

      <!-- Duration -->
      <span style="font-weight:600; font-size:var(--font-base); min-width:48px; text-align:right;">
        ${dur}
      </span>

      <!-- Resume -->
      <button class="btn-resume row-action-btn" data-id="${entry.id}" title="Resume this entry"
              style="flex-shrink:0;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </button>

      <!-- Options -->
      <button class="row-action-btn" title="Edit" style="flex-shrink:0;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>`;
}
