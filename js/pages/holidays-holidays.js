// js/pages/holidays-holidays.js — HOLIDAYS tab (public holiday calendar + list + modal)

import { S, _fmt, _fmtRange, _groupHolidays, _datePlusDays } from './holidays-state.js';
import { esc, attr } from '../format.js';
import { confirmModal } from '../components/confirmModal.js';
import {
  getPublicHolidays, createPublicHolidayRange, deletePublicHolidays,
} from '../api/holidays.js';

// ── Reload holidays from the API and re-render ────────────────

export async function reloadAndRenderHolidays(wrap) {
  try { S.holidays = await getPublicHolidays(S.year); } catch { S.holidays = []; }
  renderHolidays(wrap);
}

// ── Main entry: HOLIDAYS tab ──────────────────────────────────

export function renderHolidays(wrap, saveTabState) {
  const yrOptions = [S.year-3,S.year-2,S.year-1,S.year,S.year+1,S.year+2]
    .map(y => `<option value="${y}"${y===S.year?' selected':''}>${y}</option>`).join('');
  wrap.innerHTML = `
    <div class="filter-bar" style="flex-wrap:wrap;gap:8px;align-items:center;">
      <button class="btn btn-ghost btn-sm" id="hl-yr-prev">&#8249;</button>
      <select id="hl-yr-sel" class="form-input" style="width:80px;text-align:center;padding:6px 4px;">${yrOptions}</select>
      <button class="btn btn-ghost btn-sm" id="hl-yr-next">&#8250;</button>
      <div style="display:flex;gap:4px;margin-left:8px;">
        <button class="btn btn-sm${S.holView === 'calendar' ? ' btn-primary' : ' btn-ghost'}" id="hl-view-cal">Calendar</button>
        <button class="btn btn-sm${S.holView === 'list'     ? ' btn-primary' : ' btn-ghost'}" id="hl-view-list">List</button>
      </div>
      ${S.admin ? `<button class="btn btn-primary btn-sm" id="hl-add-holiday" style="margin-left:auto;">+ ADD HOLIDAY</button>` : ''}
    </div>
    <div id="hl-hol-body" style="margin-top:16px;"></div>
  `;

  document.getElementById('hl-yr-prev')?.addEventListener('click', async () => {
    S.year--;
    await reloadAndRenderHolidays(wrap);
  });
  document.getElementById('hl-yr-next')?.addEventListener('click', async () => {
    S.year++;
    await reloadAndRenderHolidays(wrap);
  });
  document.getElementById('hl-yr-sel')?.addEventListener('change', async e => {
    S.year = parseInt(e.target.value);
    await reloadAndRenderHolidays(wrap);
  });
  document.getElementById('hl-view-cal')?.addEventListener('click', () => {
    S.holView = 'calendar'; saveTabState?.(); renderHolidays(wrap, saveTabState);
  });
  document.getElementById('hl-view-list')?.addEventListener('click', () => {
    S.holView = 'list'; saveTabState?.(); renderHolidays(wrap, saveTabState);
  });
  if (S.admin) {
    document.getElementById('hl-add-holiday')?.addEventListener('click', () => _openHolidayModal(null, wrap, saveTabState));
  }

  const body = document.getElementById('hl-hol-body');
  if (S.holView === 'calendar') {
    _renderHolidaysCalendar(body, wrap, saveTabState);
  } else {
    _renderHolidaysList(body, wrap, saveTabState);
  }
}

// ── Holidays: year calendar view ──────────────────────────────

function _renderHolidaysCalendar(body, parentWrap, saveTabState) {
  const MON_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
  const DOW       = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  const today  = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();

  // Build date→name map for fast lookup
  const holidayMap = {};
  for (const h of S.holidays) holidayMap[h.date] = h.name;

  function miniMonth(m) {
    const firstDow   = (new Date(S.year, m - 1, 1).getDay() + 6) % 7; // Mon=0…Sun=6
    const daysInMon  = new Date(S.year, m, 0).getDate();
    let cells = '';
    for (let i = 0; i < firstDow; i++) cells += '<div class="mc-cell"></div>';
    for (let d = 1; d <= daysInMon; d++) {
      const ds      = `${S.year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const hol     = holidayMap[ds];
      const dow     = (firstDow + d - 1) % 7;
      const weekend = dow >= 5;
      const isToday = S.year === todayY && m === todayM && d === todayD;
      let cls = 'mc-cell mc-day';
      if (hol)     cls += ' mc-hol';
      if (isToday) cls += ' mc-today';
      else if (weekend && !hol) cls += ' mc-wknd';
      cells += `<div class="${cls}" title="${hol ? esc(hol) : ''}">${d}</div>`;
    }
    return `<div class="mc-month">
      <div class="mc-mname">${MON_NAMES[m - 1]}</div>
      <div class="mc-grid">
        ${DOW.map(d => `<div class="mc-cell mc-dow">${d}</div>`).join('')}
        ${cells}
      </div>
    </div>`;
  }

  const groups    = _groupHolidays(S.holidays, S.year);
  const totalDays = groups.reduce((n, g) => n + g.ids.length, 0);

  body.innerHTML = `
    <div class="mc-layout">
      <div class="mc-year-grid">
        ${Array.from({length: 12}, (_, i) => miniMonth(i + 1)).join('')}
      </div>
      <div class="mc-sidebar">
        <div style="font-size:12px;font-weight:600;color:var(--text-muted);letter-spacing:.06em;margin-bottom:10px;">
          ${S.year} — ${totalDays} PUBLIC HOLIDAY${totalDays !== 1 ? 'S' : ''}
        </div>
        ${groups.length === 0
          ? `<div style="font-size:13px;color:var(--text-muted);">
               No holidays seeded.${S.admin ? ' Click + ADD HOLIDAY.' : ''}
             </div>`
          : `<table style="width:100%;font-size:12px;border-collapse:collapse;">
               ${groups.map(g => `<tr style="border-bottom:1px solid var(--border-color);"
                   data-ids="${attr(g.ids.join(','))}">
                 <td style="padding:5px 0;color:var(--accent-amber,#c9a020);white-space:nowrap;font-weight:600;">
                   ${_fmtRange(g.startDate, g.endDate)}
                 </td>
                 <td style="padding:5px 0 5px 8px;color:var(--text-secondary,var(--text-primary));">
                   ${esc(g.name)}
                 </td>
                 ${S.admin ? `<td style="padding:5px 0;text-align:right;white-space:nowrap;">
                   <button class="row-action-btn hl-edit-holiday" title="Edit">
                     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                       <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                       <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                     </svg>
                   </button>
                   <button class="row-action-btn danger hl-del-holiday" title="Delete">
                     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                       <polyline points="3 6 5 6 21 6"/>
                       <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                     </svg>
                   </button>
                 </td>` : ''}
               </tr>`).join('')}
             </table>`
        }
      </div>
    </div>
  `;

  if (S.admin) {
    body.querySelectorAll('tr[data-ids]').forEach(tr => {
      const ids = tr.dataset.ids.split(',');
      const group = groups.find(g => g.ids[0] === ids[0]);
      tr.querySelector('.hl-edit-holiday')?.addEventListener('click', () => _openHolidayModal(group, parentWrap, saveTabState));
      tr.querySelector('.hl-del-holiday')?.addEventListener('click', async () => {
        const label = group ? _fmtRange(group.startDate, group.endDate) : '';
        if (!await confirmModal({ title: 'Delete holiday', message: `Delete "${group?.name}" (${label})?`, confirmText: 'Delete', danger: true })) return;
        try {
          await deletePublicHolidays(ids);
          window.showToast?.('Holiday deleted', 'success');
          await reloadAndRenderHolidays(document.getElementById('hl-content'));
        } catch (err) { window.showToast?.(err.message, 'error'); }
      });
    });
  }
}

// ── Holidays: list view ───────────────────────────────────────

function _renderHolidaysList(body, parentWrap, saveTabState) {
  const groups = _groupHolidays(S.holidays, S.year);

  body.innerHTML = groups.length === 0
    ? `<div class="empty-state" style="margin-top:32px">
         <div class="empty-state-title">No holidays for ${S.year}</div>
         ${S.admin ? '<div class="empty-state-desc">Click + ADD HOLIDAY to add the first one.</div>' : ''}
       </div>`
    : `<div style="overflow-x:auto;">
         <table class="data-table">
           <thead><tr>
             <th>Date</th><th>Holiday</th><th>Scope</th>
             ${S.admin ? '<th style="width:80px"></th>' : ''}
           </tr></thead>
           <tbody>
             ${groups.map(g => `<tr data-ids="${attr(g.ids.join(','))}">
               <td style="white-space:nowrap;color:var(--accent-amber,#c9a020);font-weight:600;">
                 ${_fmtRange(g.startDate, g.endDate)}
               </td>
               <td>${esc(g.name)}</td>
               <td>${g.department_code ? `<span class="badge">${esc(g.department?.label || g.department_code)}</span>` : 'All departments'}</td>
               ${S.admin ? `<td class="table-actions">
                 <button class="row-action-btn hl-edit-holiday" title="Edit">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                     <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                   </svg>
                 </button>
                 <button class="row-action-btn danger hl-del-holiday" title="Delete">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <polyline points="3 6 5 6 21 6"/>
                     <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                   </svg>
                 </button>
               </td>` : ''}
             </tr>`).join('')}
           </tbody>
         </table>
       </div>`;

  if (S.admin) {
    body.querySelectorAll('tr[data-ids]').forEach(tr => {
      const ids   = tr.dataset.ids.split(',');
      const group = groups.find(g => g.ids[0] === ids[0]);
      tr.querySelector('.hl-edit-holiday')?.addEventListener('click', () => _openHolidayModal(group, parentWrap, saveTabState));
      tr.querySelector('.hl-del-holiday')?.addEventListener('click', async () => {
        const label = group ? _fmtRange(group.startDate, group.endDate) : '';
        if (!await confirmModal({ title: 'Delete holiday', message: `Delete "${group?.name}" (${label})?`, confirmText: 'Delete', danger: true })) return;
        try {
          await deletePublicHolidays(ids);
          window.showToast?.('Holiday deleted', 'success');
          await reloadAndRenderHolidays(parentWrap);
        } catch (err) { window.showToast?.(err.message, 'error'); }
      });
    });
  }
}

// ── Holiday modal (range editor) ──────────────────────────────
// `group` is a grouped cluster object from _groupHolidays(), or null for Add.

function _openHolidayModal(group, parentWrap, saveTabState) {
  const existing = document.getElementById('hl-holiday-modal');
  if (existing) existing.remove();

  const isEdit    = !!group;
  const initStart = isEdit ? group.startDate : '';
  const initEnd   = isEdit ? group.endDate   : '';
  const initName  = isEdit ? group.name      : '';
  const initDept  = isEdit ? (group.department_code || '') : '';

  const deptOpts = S.employees.length
    ? [...new Map(S.employees.filter(e => e.department).map(e => [e.department.code, e.department])).values()]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(d => `<option value="${attr(d.code)}" ${initDept === d.code ? 'selected' : ''}>${esc(d.label || d.code)}</option>`)
        .join('')
    : '';

  const modal = document.createElement('div');
  modal.id        = 'hl-holiday-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? 'Edit Holiday' : 'Add Holiday'}</h3>
        <button class="modal-close" id="hl-hm-close">&times;</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label class="form-label">Start date
            <input class="form-input" type="date" id="hl-hm-start" value="${attr(initStart)}">
          </label>
          <label class="form-label">End date <span style="font-size:11px;color:var(--text-muted);">(= Start for one day)</span>
            <input class="form-input" type="date" id="hl-hm-end" value="${attr(initEnd)}">
          </label>
        </div>
        <label class="form-label">Holiday name
          <input class="form-input" type="text" id="hl-hm-name"
            placeholder="e.g. Songkran Festival"
            value="${attr(initName)}">
        </label>
        <label class="form-label">Department scope
          <select class="form-input" id="hl-hm-dept">
            <option value="">All departments</option>
            ${deptOpts}
          </select>
        </label>
        ${isEdit ? `<div style="font-size:12px;color:var(--text-muted);padding:8px 12px;
            background:var(--surface-2,rgba(255,255,255,0.03));border-radius:6px;
            border:1px solid var(--border-color);">
          Editing replaces the entire cluster. The old dates will be removed and the new range will be created.
        </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn" id="hl-hm-cancel">Cancel</button>
        <button class="btn btn-primary" id="hl-hm-save">${isEdit ? 'Save changes' : 'Add'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  document.getElementById('hl-hm-close')?.addEventListener('click', close);
  document.getElementById('hl-hm-cancel')?.addEventListener('click', close);
  modal._escClose = close;

  // Auto-fill End when Start changes and End is empty or behind Start
  document.getElementById('hl-hm-start')?.addEventListener('change', e => {
    const endEl = document.getElementById('hl-hm-end');
    if (!endEl.value || endEl.value < e.target.value) endEl.value = e.target.value;
  });

  document.getElementById('hl-hm-save')?.addEventListener('click', async () => {
    const startDate = document.getElementById('hl-hm-start').value;
    const endDate   = document.getElementById('hl-hm-end').value   || startDate;
    const name      = document.getElementById('hl-hm-name').value.trim();
    const dept      = document.getElementById('hl-hm-dept').value  || null;

    if (!startDate || !name) { window.showToast?.('Start date and name are required', 'error'); return; }
    if (endDate < startDate)  { window.showToast?.('End date must be on or after start date', 'error'); return; }

    const saveBtn = document.getElementById('hl-hm-save');
    saveBtn.disabled = true;
    try {
      if (isEdit) {
        // Delete the old cluster first, then create the new range.
        await deletePublicHolidays(group.ids);
      }
      await createPublicHolidayRange({ startDate, endDate, name, departmentCode: dept });
      window.showToast?.(isEdit ? 'Holiday updated' : 'Holiday added', 'success');
      close();
      await reloadAndRenderHolidays(document.getElementById('hl-content'));
    } catch (err) {
      window.showToast?.(err.message, 'error');
      saveBtn.disabled = false;
    }
  });
}
