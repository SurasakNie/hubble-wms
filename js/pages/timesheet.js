// pages/timesheet.js — Weekly matrix grid (projects × Mon–Sun + Total)
// Spec §3.2: week nav, project rows, inline cell edit, daily-total footer,
// "+ Add row", "Copy last week". v1 = own week only.
//
// Cell-edit model (user decision): empty cells and cells backed by a single
// duration-only entry are typed inline (accepts "2:30" or "2.5"; 0/empty deletes).
// Cells backed by a clock-time entry open the shared entry modal; cells with 2+
// entries are read-only (managed in the Tracker) — so timed data is never clobbered.

import { getWeekEntries, createEntry, updateEntry, deleteEntry } from '../api/timeEntries.js';
import { getProjects } from '../api/projects.js';
import { getEmployees } from '../api/employees.js';
import { openEditModal } from '../components/entryModal.js';
import { weekNavHtml, wireWeekNav, updateWeekNavLabel } from '../components/weekNav.js';
import { empSelectHtml, wireEmpSelect } from '../components/empSelect.js';
import { isClientRole, isAdmin, isManager } from '../auth.js';
import {
  setFormatPrefs, getMondayOf, getWeekDays,
  formatDuration, toISODate, todayISO, DAY_LABELS,
  esc, attr,
} from '../format.js';

let _profile    = null;
let _monday     = null;   // Date, start of the displayed week
let _cells      = {};     // { [projectId]: { project, _total, days: { [iso]: { hours, entries:[] } } } }
let _projects   = [];     // active projects (for the add-row select)
let _extraRows  = new Set(); // projectIds added via "+ Add row" with no entries yet
let _hiddenRows = new Set(); // projectIds explicitly removed via × button
let _readOnly   = false;
let _viewUserId = null;      // null = own; set when an admin/manager views a teammate (read-only)
let _members    = [];        // teammate list for the user selector

// ──────────────────────────────────────────────────────────────
// ENTRY POINT
// ──────────────────────────────────────────────────────────────

export async function render(profile) {
  _profile   = profile;
  _monday    = getMondayOf();
  _cells      = {};
  _extraRows  = new Set();
  _hiddenRows = new Set();
  _readOnly   = isClientRole();
  _viewUserId = null;
  _members    = [];
  setFormatPrefs(profile);

  const canSeeUsers = isAdmin() || isManager();
  document.getElementById('topbar-left').innerHTML = `
    <span class="topbar-title">Timesheet</span>
    ${canSeeUsers ? `<span id="ts-emp-slot" style="display:inline-flex;margin-left:var(--sp-3);"></span>` : ''}`;

  if (canSeeUsers) _wireUserSelect(profile);

  document.getElementById('content').innerHTML = `
    <div class="ts-toolbar">
      ${weekNavHtml('ts', _monday)}
      ${_readOnly ? '' : `
      <div class="ts-toolbar-actions">
        <select id="ts-add-row" style="width:auto; min-width:160px;"></select>
      </div>`}
    </div>

    <div id="ts-grid-wrap">
      <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
    </div>
  `;

  _wireToolbar();
  // Load projects for the add-row dropdown (non-blocking; grid loads alongside)
  getProjects().then(p => { _projects = p; _renderAddOptions(); }).catch(err => window.showToast?.(err.message, 'error'));
  await _reload();
}

function _wireToolbar() {
  wireWeekNav('ts', () => _monday, d => { _monday = d; }, _reload);
  document.getElementById('content').querySelector('#ts-add-row')?.addEventListener('change', e => {
    const pid = e.target.value;
    if (pid) { _extraRows.add(pid); }
    e.target.value = '';
    _renderGrid();
  });
}

// Populate the teammate selector. Admin can edit others; manager/client are read-only viewers.
function _wireUserSelect(profile) {
  getEmployees().then(emps => {
    _members = emps.filter(e => e.user_id && e.user_id !== profile.id);
    const slot = document.getElementById('ts-emp-slot');
    if (!slot) return;
    slot.innerHTML = empSelectHtml('ts', _members, { placeholder: 'Myself' });
    wireEmpSelect('ts', _members, emp => {
      _viewUserId = emp?.user_id || null;
      _readOnly = isClientRole();
      const actions = document.querySelector('#content .ts-toolbar-actions');
      if (actions) actions.style.display = _readOnly ? 'none' : '';
      _reload();
    });
  }).catch(err => window.showToast?.(err.message, 'error'));
}

async function _reload() {
  updateWeekNavLabel('ts', _monday);
  try {
    const entries = await getWeekEntries(toISODate(_monday), _viewUserId || undefined);
    _buildCells(entries);
  } catch (err) {
    window.showToast?.(err.message, 'error');
    _cells = {};
  }
  _renderGrid();
}

// ──────────────────────────────────────────────────────────────
// AGGREGATION
// ──────────────────────────────────────────────────────────────

function _buildCells(entries) {
  _cells = {};
  for (const e of entries) {
    const pid = e.project_id;
    if (!_cells[pid]) _cells[pid] = { project: e.project, _total: 0, days: {} };
    if (!_cells[pid].days[e.date]) _cells[pid].days[e.date] = { hours: 0, entries: [] };
    const hrs = Number(e.total_hours) || 0;
    _cells[pid].days[e.date].hours += hrs;
    _cells[pid].days[e.date].entries.push(e);
    _cells[pid]._total += hrs;
  }
}

function _rowProjectIds() {
  const ids = new Set(Object.keys(_cells));
  _extraRows.forEach(id => ids.add(id));
  return [...ids]
    .filter(id => !_hiddenRows.has(id))
    .sort((a, b) => _projName(a).localeCompare(_projName(b)));
}

function _projName(pid) {
  return _cells[pid]?.project?.name || _projects.find(p => p.id === pid)?.name || '—';
}

function _projColor(pid) {
  return _cells[pid]?.project?.color || _projects.find(p => p.id === pid)?.color || '#8b97a2';
}

// ──────────────────────────────────────────────────────────────
// GRID
// ──────────────────────────────────────────────────────────────

function _renderGrid() {
  _renderAddOptions();

  const wrap = document.getElementById('ts-grid-wrap');
  if (!wrap) return;

  const pids = _rowProjectIds();
  const week = getWeekDays(_monday);
  const today = todayISO();

  if (pids.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="margin-top:40px">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
        <div class="empty-state-title">No time logged this week</div>
        <div class="empty-state-sub">${_readOnly ? 'Nothing to show for this week' : 'Add a project row below'}</div>
      </div>`;
    return;
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Header — "Mo, May 25" format, weekend columns marked
  const headCells = week.map((iso, i) => {
    const d = new Date(iso + 'T00:00:00');
    const isWeekend = i >= 5;
    return `<th class="ts-day-col${iso === today ? ' ts-today' : ''}${isWeekend ? ' ts-weekend' : ''}">
      <div class="ts-day-header">
        <span class="ts-day-name">${DAY_LABELS[i]}</span>
        <span class="ts-day-date">${MONTHS[d.getMonth()]} ${d.getDate()}</span>
      </div>
    </th>`;
  }).join('');

  // Body — project · client, day cells, total, × remove
  const body = pids.map(pid => {
    const dayCells = week.map((iso, i) => _renderCell(pid, iso, iso === today, i >= 5)).join('');
    const rowTotal = _cells[pid]?._total || 0;
    const clientName = _cells[pid]?.project?.clients?.name
      || _projects.find(p => p.id === pid)?.client?.name || '';
    const clientHtml = clientName
      ? ` <span class="ts-proj-client">- ${esc(clientName)}</span>`
      : '';
    return `
      <tr data-pid="${pid}">
        <td class="ts-proj-col">
          <span class="ts-proj">
            <span class="ts-dot" style="background:${attr(_projColor(pid))};"></span>
            <span class="ts-proj-name">${esc(_projName(pid))}</span>${clientHtml}
          </span>
        </td>
        ${dayCells}
        <td class="ts-total-col">${rowTotal > 0 ? formatDuration(rowTotal) : '—'}</td>
        <td class="ts-remove-col">
          <button class="ts-remove-btn" data-pid="${pid}" title="Remove row">×</button>
        </td>
      </tr>`;
  }).join('');

  // Footer — per-day totals + grand total, weekend marked
  let grand = 0;
  const footCells = week.map((iso, i) => {
    let sum = 0;
    for (const pid of pids) sum += _cells[pid]?.days[iso]?.hours || 0;
    grand += sum;
    const isWeekend = i >= 5;
    return `<td class="ts-day-col${iso === today ? ' ts-today' : ''}${isWeekend ? ' ts-weekend' : ''}">${sum > 0 ? formatDuration(sum) : '—'}</td>`;
  }).join('');

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table class="ts-grid">
        <thead>
          <tr>
            <th class="ts-proj-col">Projects</th>
            ${headCells}
            <th class="ts-total-col">Total</th>
            <th class="ts-remove-col"></th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>
          <tr class="ts-footer">
            <td class="ts-proj-col">Total:</td>
            ${footCells}
            <td class="ts-total-col">${grand > 0 ? formatDuration(grand) : '—'}</td>
            <td class="ts-remove-col"></td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  _wireCells();
}

function _renderCell(pid, iso, isToday, isWeekend = false) {
  const cell = _cells[pid]?.days[iso] || { hours: 0, entries: [] };
  const { hours, entries } = cell;
  const shown = hours > 0 ? formatDuration(hours) : '';
  const cls = `ts-cell${isToday ? ' ts-today' : ''}${isWeekend ? ' ts-weekend' : ''}`;

  if (_readOnly) {
    return `<td class="${cls} ts-readonly">${shown || '—'}</td>`;
  }
  // 0 entries or single duration-only entry → inline editable
  if (entries.length === 0 || (entries.length === 1 && !entries[0].start_time)) {
    return `<td class="${cls} ts-editable" data-pid="${pid}" data-date="${iso}" tabindex="0">${shown}</td>`;
  }
  // single timed entry → open the entry modal
  if (entries.length === 1) {
    return `<td class="${cls} ts-readonly ts-timed" data-pid="${pid}" data-date="${iso}"
      title="Timed entry — click to edit">${shown}</td>`;
  }
  // multiple entries → read-only sum
  return `<td class="${cls} ts-readonly" data-pid="${pid}" data-date="${iso}"
    title="Multiple entries — edit in Time Tracker">${shown}</td>`;
}

function _wireCells() {
  const wrap = document.getElementById('ts-grid-wrap');
  if (!wrap || _readOnly) return;

  wrap.querySelectorAll('.ts-editable').forEach(td => {
    td.addEventListener('click', () => _enterEdit(td));
    td.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _enterEdit(td); }
    });
  });

  wrap.querySelectorAll('.ts-timed').forEach(td => {
    td.addEventListener('click', () => {
      const cell = _cells[td.dataset.pid]?.days[td.dataset.date];
      const entry = cell?.entries[0];
      if (entry) openEditModal(_profile, entry, _reload, _reload);
    });
  });

  wrap.querySelectorAll('.ts-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.pid;
      _hiddenRows.add(pid);
      _extraRows.delete(pid);
      _renderGrid();
    });
  });
}

// ──────────────────────────────────────────────────────────────
// INLINE EDIT
// ──────────────────────────────────────────────────────────────

function _enterEdit(td) {
  if (td.querySelector('input')) return; // already editing
  const pid  = td.dataset.pid;
  const date = td.dataset.date;
  const prev = td.textContent.trim();

  td.classList.add('ts-editing');
  td.innerHTML = `<input type="text" class="ts-cell-input" value="${attr(prev)}" inputmode="decimal" placeholder="0:00">`;
  const input = td.querySelector('input');
  input.focus();
  input.select();

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    if (commit) {
      _commitCell(pid, date, input.value, prev);
    } else {
      td.classList.remove('ts-editing');
      td.textContent = prev;
    }
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

async function _commitCell(pid, date, raw, prev) {
  const hours = _parseDuration(raw);
  const entries = _cells[pid]?.days[date]?.entries || [];

  // No change → just restore display
  const prevHours = _cells[pid]?.days[date]?.hours || 0;
  if (Math.abs(hours - prevHours) < 0.001) { _renderGrid(); return; }

  try {
    if (entries.length === 0 && hours > 0) {
      await createEntry({ projectId: pid, date, totalHours: hours, isBillable: true, userId: _viewUserId || undefined });
    } else if (entries.length === 1 && hours > 0) {
      await updateEntry(entries[0].id, { startTime: null, endTime: null, totalHours: hours });
    } else if (entries.length === 1 && hours === 0) {
      await deleteEntry(entries[0].id);
    }
    await _reload();
  } catch (err) {
    window.showToast?.(err.message, 'error');
    _renderGrid(); // restore from current state
  }
}

function _parseDuration(raw) {
  const s = String(raw).trim();
  if (!s) return 0;
  let h;
  if (s.includes(':')) {
    const [hh, mm] = s.split(':');
    h = (parseInt(hh, 10) || 0) + (parseInt(mm, 10) || 0) / 60;
  } else {
    h = parseFloat(s) || 0;
  }
  if (h < 0) h = 0;
  return Math.round(h * 100) / 100;
}

// ──────────────────────────────────────────────────────────────
// ADD ROW + COPY WEEK
// ──────────────────────────────────────────────────────────────

function _renderAddOptions() {
  const sel = document.getElementById('ts-add-row');
  if (!sel) return;
  const shown = new Set(_rowProjectIds());
  const opts = _projects
    .filter(p => !shown.has(p.id))
    .map(p => `<option value="${p.id}">${esc(p.name)}</option>`)
    .join('');
  sel.innerHTML = `<option value="">+ Add project row</option>${opts}`;
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
