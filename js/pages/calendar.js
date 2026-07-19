// pages/calendar.js — FullCalendar drag-week view
// Spec §3.3: timeGridWeek, Monday-first, drag-create / move / resize → entryModal.
// View is scoped by RLS (admin → all, manager → own + assigned-project, member → own).

import { getEntries, updateEntryTimes, updateEntry } from '../api/timeEntries.js';
import { openCreateModal, openEditModal } from '../components/entryModal.js';
import { isClientRole, isAdmin, isManager } from '../auth.js';
import { toISODate, formatDuration, getMondayOf, safeColor, esc } from '../format.js';
import { getEmployees } from '../api/employees.js';
import { empSelectHtml, wireEmpSelect } from '../components/empSelect.js';
import { getPublicHolidays } from '../api/holidays.js';
import { weekNavHtml, updateWeekNavLabel } from '../components/weekNav.js';

const FC_CDN = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js';

let _profile    = null;
let _calendar   = null;
let _zoomLevel  = 0;          // 0 = default (12 h visible), up to 3 zoom-in steps
let _dayTotals  = {};         // { 'YYYY-MM-DD': totalHours } — filled after each fetch
let _holidays   = {};         // { 'YYYY-MM-DD': holidayName } — public holidays for visible range
let _viewUserId = null;       // null = own entries; set to teammate id when admin views a teammate
let _members    = [];         // loaded for admin/manager: list of team members for the dropdown

// ──────────────────────────────────────────────────────────────
// ENTRY POINT
// ──────────────────────────────────────────────────────────────

export async function render(profile) {
  _profile    = profile;
  _calendar   = null;
  _zoomLevel  = 0;
  _viewUserId = null;
  _members    = [];

  const canSeeTeammates = isAdmin() || isManager();

  document.getElementById('topbar-left').innerHTML = `
    <span class="topbar-title">Calendar</span>
    ${canSeeTeammates ? `<span id="cal-emp-slot" style="display:inline-flex;margin-left:var(--sp-3);"></span>` : ''}
  `;

  if (canSeeTeammates) {
    getEmployees().then(emps => {
      _members = emps.filter(e => e.user_id && e.user_id !== profile.id);
      const slot = document.getElementById('cal-emp-slot');
      if (slot) {
        slot.innerHTML = empSelectHtml('cal', _members, { placeholder: 'Myself' });
        wireEmpSelect('cal', _members, emp => {
          _viewUserId = emp?.user_id || null;
          _dayTotals = {};
          _calendar?.refetchEvents();
        });
      }
    }).catch(err => window.showToast?.(err.message, 'error'));
  }

  const content = document.getElementById('content');

  // Clients have no time_entries access — show a notice instead of an empty grid.
  if (isClientRole()) {
    content.innerHTML = `
      <div class="empty-state" style="margin-top:60px">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <div class="empty-state-title">Calendar unavailable</div>
        <div class="empty-state-sub">The calendar isn't available for client accounts.</div>
      </div>`;
    return;
  }

  // Static toolbar lives OUTSIDE the calendar so it never scrolls. FC mounts on #fc-container
  // (fixed height) and uses its OWN internal body scroller — exactly ONE scrollbar — with a
  // native frozen day-header (stickyHeaderDates). Zoom resizes slots via CSS + a changeView
  // re-layout (the zoom buttons live in the external toolbar so the re-render can't wipe them).
  content.innerHTML = `
    <div class="cal-toolbar">
      ${weekNavHtml('cal', getMondayOf())}
      <div class="cal-view-toggle" id="cal-view-toggle">
        <button class="btn btn-ghost btn-sm" data-view="dayGridMonth">Month</button>
        <button class="btn btn-ghost btn-sm active" data-view="timeGridWeek">Week</button>
        <button class="btn btn-ghost btn-sm" data-view="timeGridDay">Day</button>
      </div>
      <div class="cal-zoom" id="cal-zoom">
        <button class="week-nav-btn" id="fc-zoom-out" title="Zoom out">−</button>
        <button class="week-nav-btn" id="fc-zoom-in" title="Zoom in">+</button>
      </div>
    </div>
    <div id="fc-container"></div>`;

  let ok = true;
  try {
    await _ensureFullCalendar();
  } catch {
    ok = false;
  }
  if (!ok || !window.FullCalendar) {
    content.innerHTML = `
      <div class="empty-state" style="margin-top:60px">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div class="empty-state-title">Couldn't load the calendar</div>
        <div class="empty-state-sub">The calendar library failed to load (offline?). Check your connection and retry.</div>
      </div>`;
    return;
  }

  const el = document.getElementById('fc-container');
  _calendar = new window.FullCalendar.Calendar(el, {
    initialView: 'timeGridWeek',
    firstDay: 1,                 // Monday
    nowIndicator: true,
    allDaySlot: true,             // duration-only entries render in the all-day row
    slotMinTime: '00:00:00',
    slotMaxTime: '24:00:00',
    scrollTime: '07:00:00',
    expandRows: false,            // slots take the exact CSS height set by _applyZoom (zoom)
    height: '100%',               // fill #fc-container → FC owns one internal body scroller
    stickyHeaderDates: true,      // native frozen day-header (no manual sticky CSS needed)
    slotLabelFormat:    { hour: '2-digit', minute: '2-digit', hour12: false },
    headerToolbar: false,   // custom static toolbar lives in #content (see _wireToolbar)
    // Keep the week-nav label in sync as the user navigates (also fires on initial render).
    datesSet: (info) => {
      const wknum = document.getElementById('cal-wk-wknum');
      if (_calendar?.view?.type === 'dayGridMonth') {
        // info.start may be the last days of the previous month (first visible cell),
        // so use the midpoint of the visible range to reliably land in the correct month.
        const mid = new Date((info.start.valueOf() + info.end.valueOf()) / 2);
        const lbl = document.getElementById('cal-wk-label');
        if (lbl) lbl.textContent = mid.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        if (wknum) wknum.style.display = 'none';   // no week number in month view
      } else {
        const monday = getMondayOf(info.start);
        updateWeekNavLabel('cal', monday);
        if (wknum) wknum.style.display = '';
      }
    },
    windowResize: () => _applyZoom(),   // re-fit the 12-hour default to the new viewport

    dayHeaderContent: _dayHeaderContent,
    editable: true,
    selectable: true,
    selectMirror: true,
    eventResizableFromStart: true,
    events: _fetchEvents,
    select:      _onSelect,
    eventClick:  _onEventClick,
    eventDrop:   _onEventChange,
    eventResize: _onEventChange,

    // Click a day in month view → jump to that week
    dateClick: (info) => {
      if (_calendar.view.type !== 'dayGridMonth') return;
      _calendar.changeView('timeGridWeek', info.date);
      document.querySelectorAll('#cal-view-toggle [data-view]').forEach(b => {
        b.classList.toggle('active', b.dataset.view === 'timeGridWeek');
      });
      document.getElementById('cal-zoom')?.style.setProperty('display', '');
      // Defer zoom measurement until FC has finished rendering the timegrid DOM,
      // otherwise _bodyScroller() returns null and slotPx collapses to 8px.
      requestAnimationFrame(() => _applyZoom());
    },

    // Mark holiday cells in month view with a CSS class for gold-circle styling.
    // en-CA locale produces 'YYYY-MM-DD' in local timezone (safe everywhere).
    dayCellClassNames: (arg) => {
      const ds = arg.date.toLocaleDateString('en-CA');
      return _holidays[ds] ? ['fc-day-has-holiday'] : [];
    },

    // Dark bg + left colour bar applied per-event after mount.
    // --fc-event-border-color overrides FC's own border variable (3rd lock on top of CSS).
    eventDidMount: (info) => {
      if (info.event.allDay) return;
      const color = info.event.extendedProps.color || '#03a9f4';
      info.el.style.setProperty('--ev-color', color);
      info.el.style.setProperty('--fc-event-border-color', 'transparent');
      info.el.style.background = 'rgba(28, 32, 38, 0.92)';
    },

    // Custom body: description (white) + project · client (colour, always) + duration (bottom)
    eventContent: (arg) => {
      if (arg.event.allDay) return; // default all-day rendering
      const entry   = arg.event.extendedProps.entry;
      const color   = arg.event.extendedProps.color || '#03a9f4';
      const desc    = entry?.description || '';
      const projName = entry?.project?.name || '';
      const client   = entry?.project?.clients?.name || '';
      const projLabel = [projName, client].filter(Boolean).join(' · ');
      const dur      = _durLabel(arg.event.start, arg.event.end);

      const projHtml = projLabel
        ? `<div class="fc-ev-proj" style="color:${safeColor(color)}">${esc(projLabel)}</div>`
        : '';

      return { html: `
        <div class="fc-ev-body">
          <div class="fc-ev-title">${esc(desc)}</div>
          ${projHtml}
          <div class="fc-ev-bottom">${esc(dur)}</div>
        </div>
      `};
    },
  });

  _calendar.render();
  // Calendar navigates via FullCalendar's own view-aware prev()/next() — they
  // advance by one month / week / day to match the active view — NOT weekNav's
  // fixed ±7-day Monday snap (which left "next month" dead in month view and
  // jumped Monday-to-Monday in day view). The label stays in sync via datesSet.
  const $cal = id => document.getElementById(id);
  $cal('cal-wk-prev')?.addEventListener('click', () => _calendar.prev());
  $cal('cal-wk-next')?.addEventListener('click', () => _calendar.next());
  const _calLabel  = $cal('cal-wk-label');
  const _calPicker = $cal('cal-wk-picker');
  _calLabel?.addEventListener('click', () => {
    if (!_calPicker) return;
    _calPicker.value = toISODate(_calendar.getDate());
    if (typeof _calPicker.showPicker === 'function') {
      try { _calPicker.showPicker(); return; } catch { /* fall through */ }
    }
    _calPicker.style.opacity = '1';
    _calPicker.style.width = 'auto';
    _calPicker.focus();
  });
  _calPicker?.addEventListener('change', () => {
    if (!_calPicker.value) return;
    _calendar.gotoDate(_calPicker.value);
    _calPicker.style.opacity = '0';
    _calPicker.style.width = '0';
  });
  _wireToolbar();
  _applyZoom();   // size slots so the default view shows ~12 h (changeView lays out aligned)
}

// ──────────────────────────────────────────────────────────────
// TOOLBAR — static week-nav + Week/Day toggle, rendered in #content (outside the
// scroll area) so it never scrolls with the grid. Mirrors the Timesheet widget.
// ──────────────────────────────────────────────────────────────

function _wireToolbar() {
  // Week/Day view toggle (changeView re-renders the grid; the persisted slot CSS keeps it sized)
  document.querySelectorAll('#cal-view-toggle [data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      _calendar.changeView(btn.dataset.view);
      document.querySelectorAll('#cal-view-toggle [data-view]')
        .forEach(b => b.classList.toggle('active', b === btn));
      // Hide zoom in month view (no time slots)
      const zoom = document.getElementById('cal-zoom');
      if (zoom) zoom.style.display = btn.dataset.view === 'dayGridMonth' ? 'none' : '';
      if (btn.dataset.view !== 'dayGridMonth') _applyZoom();
    });
  });

  // Zoom buttons (in the external toolbar so a re-render can't wipe them)
  document.getElementById('fc-zoom-out')?.addEventListener('click', () => _zoom(-1));
  document.getElementById('fc-zoom-in')?.addEventListener('click',  () => _zoom(+1));
}

// ──────────────────────────────────────────────────────────────
// FULLCALENDAR LOADER
// ──────────────────────────────────────────────────────────────

function _ensureFullCalendar() {
  if (window.FullCalendar) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-fc="1"]`);
    if (existing) {
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = FC_CDN;
    s.dataset.fc = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('FullCalendar failed to load'));
    document.head.appendChild(s);
  });
}

// ──────────────────────────────────────────────────────────────
// EVENTS
// ──────────────────────────────────────────────────────────────

async function _fetchEvents(info, success, failure) {
  try {
    const entries = await getEntries({
      dateFrom: info.startStr.slice(0, 10),
      dateTo:   info.endStr.slice(0, 10),
      userId:   _viewUserId || undefined,   // undefined = RLS scoping (own or all for admin)
      limit:    1000,
    });

    // Compute daily totals before handing events to FC
    _dayTotals = {};
    for (const e of entries) {
      const h = Number(e.total_hours) || 0;
      if (h > 0) _dayTotals[e.date] = (_dayTotals[e.date] || 0) + h;
    }

    // Fetch public holidays for the visible years — fail silently if table not yet applied
    const startYear = parseInt(info.startStr.slice(0, 4));
    const endYear   = parseInt(info.endStr.slice(0, 4));
    const years = [...new Set([startYear, endYear])];
    try {
      _holidays = {};
      const batches = await Promise.all(years.map(y => getPublicHolidays(y)));
      for (const batch of batches) {
        for (const h of batch) _holidays[h.date] = h.name;
      }
    } catch { /* migration not yet applied — skip holiday display */ }

    // Background events highlight holiday columns in the time grid
    const holidayEvents = Object.entries(_holidays)
      .filter(([date]) => date >= info.startStr.slice(0, 10) && date < info.endStr.slice(0, 10))
      .map(([date, name]) => ({
        id:              'ph-' + date,
        start:           date,
        allDay:          true,
        display:         'background',
        backgroundColor: 'rgba(201, 160, 32, 0.07)',
        extendedProps:   { isHoliday: true, holidayName: name },
      }));

    // Named holiday events — show title in dayGridMonth; invisible in timeGrid (allDaySlot:false)
    const holidayNamedEvents = Object.entries(_holidays)
      .filter(([date]) => date >= info.startStr.slice(0, 10) && date < info.endStr.slice(0, 10))
      .map(([date, name]) => ({
        id:              'phn-' + date,
        title:           name,
        start:           date,
        allDay:          true,
        backgroundColor: 'rgba(201, 160, 32, 0.15)',
        borderColor:     'rgba(201, 160, 32, 0.5)',
        textColor:       '#c9a020',
        extendedProps:   { isHoliday: true },
        editable:        false,
      }));

    // Month view: holidays only — no time entries, no time slots
    const isMonth = _calendar?.view?.type === 'dayGridMonth';
    success([
      ...(isMonth ? [] : entries.map(_toEvent).filter(Boolean)),
      ...holidayEvents,
      ...holidayNamedEvents,
    ]);

    // Week/Day view: fill in header totals + holiday names via DOM
    if (!isMonth) {
      requestAnimationFrame(() => {
        for (const [date, hours] of Object.entries(_dayTotals)) {
          const el = document.querySelector(`.fc-col-total[data-date="${date}"]`);
          if (el) el.textContent = formatDuration(hours);
        }
        for (const [date, name] of Object.entries(_holidays)) {
          const el = document.querySelector(`.fc-col-holiday[data-date="${date}"]`);
          if (el) { el.textContent = name; el.title = name; }
        }
      });
    }
  } catch (err) {
    window.showToast?.(err.message, 'error');
    failure(err);
  }
}

const _DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const _MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function _dayHeaderContent(arg) {
  const d   = arg.date;
  const iso = toISODate(d);
  const label = `${_DAYS[d.getDay()]}, ${_MONTHS[d.getMonth()]} ${d.getDate()}`;
  return { html: `
    <div class="fc-col-header-inner">
      <span class="fc-col-day">${label}</span>
      <span class="fc-col-holiday" data-date="${iso}"></span>
      <span class="fc-col-total" data-date="${iso}"></span>
    </div>
  `};
}

function _toEvent(entry) {
  const color = entry.project?.color || '#03a9f4';
  if (!entry.start_time || !entry.end_time) {
    return {
      id: entry.id,
      title: `${formatDuration(Number(entry.total_hours) || 0)} · ${entry.description || entry.project?.name || '(no project)'}`,
      start: entry.date,
      allDay: true,
      editable: false,
      classNames: entry.is_billable ? ['billable'] : [],
      extendedProps: { entry, color },
    };
  }
  return {
    id: entry.id,
    title: entry.description || entry.project?.name || '(no project)',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    classNames: entry.is_billable ? ['billable'] : [],
    extendedProps: { entry, color },
    start: `${entry.date}T${entry.start_time}`,
    end:   `${entry.date}T${entry.end_time}`,
    allDay: false,
  };
}

// ──────────────────────────────────────────────────────────────
// INTERACTIONS
// ──────────────────────────────────────────────────────────────

function _onSelect(info) {
  // When admin is viewing a teammate, new entries are logged for that teammate.
  // Requires the te_insert RLS migration (20260601_calendar_insert_rls.sql) to be applied.
  const targetUserId = _viewUserId || undefined;
  openCreateModal(_profile, {
    date:      info.startStr.slice(0, 10),
    startTime: _hhmm(info.start),
    endTime:   _hhmm(info.end),
    userId:    targetUserId,
  }, () => _calendar.refetchEvents());
  _calendar.unselect();
}

function _onEventClick(info) {
  const entry = info.event.extendedProps.entry;
  if (!entry) return;
  openEditModal(
    _profile, entry,
    () => _calendar.refetchEvents(),
    () => _calendar.refetchEvents(),
  );
}

async function _onEventChange(info) {
  const id = info.event.id;
  try {
    if (info.event.allDay) {
      await updateEntry(id, { date: toISODate(info.event.start) });
    } else {
      const end = info.event.end || info.event.start;
      await updateEntryTimes(id, _hhmm(info.event.start), _hhmm(end), toISODate(info.event.start));
    }
    // Refresh cached entries + day-total headers so a reopened event shows the new time/date.
    _calendar.refetchEvents();
  } catch (err) {
    info.revert();
    window.showToast?.(err.message, 'error');
  }
}

// ──────────────────────────────────────────────────────────────
// ZOOM — CSS slot-height + a changeView re-layout (so events realign).
// FC keeps its own single internal body scroller; the day-header stays frozen.
// ──────────────────────────────────────────────────────────────

const VISIBLE_12H = 24;                       // 24 half-hour slots = 12 h
const ZOOM_FACTOR = [1, 1.5, 2, 2.5];         // level 0 = ~12 h visible, then 3 zoom-in steps
const MAX_ZOOM    = ZOOM_FACTOR.length - 1;   // 3
let   _curSlotPx  = 0;

function _zoom(dir) {
  _zoomLevel = Math.max(0, Math.min(MAX_ZOOM, _zoomLevel + dir));
  _applyZoom();
}

// FC's internal body scroller (the scrollable timegrid area) — the TALLEST .fc-scroller with a
// scrollable overflow (the header scroller is short, so picking max clientHeight finds the body).
function _bodyScroller() {
  const cont = document.getElementById('fc-container');
  if (!cont) return null;
  const scrollers = [...cont.querySelectorAll('.fc-scroller')].filter(e => {
    const oy = getComputedStyle(e).overflowY;
    return oy === 'auto' || oy === 'scroll';
  });
  if (!scrollers.length) return null;
  return scrollers.reduce((a, b) => (b.clientHeight > a.clientHeight ? b : a));
}

function _setSlotCss(px) {
  let s = document.getElementById('fc-zoom-style');
  if (!s) { s = document.createElement('style'); s.id = 'fc-zoom-style'; document.head.appendChild(s); }
  s.textContent = `#fc-container .fc-timegrid-slot { height: ${px}px !important; }`;
}

// Size slots so level 0 shows ~12 h in the viewport, then re-render so events realign to the new
// slot height. updateSize() does NOT move events (FC caches slat coords); changeView() rebuilds them.
function _applyZoom() {
  if (!_calendar) return;
  if (_calendar.view.type === 'dayGridMonth') return; // no time slots in month view
  const cont = document.getElementById('fc-container');
  const sc = _bodyScroller();
  // Visible body height drives the slot size so level 0 shows exactly 12 h.
  const visibleH = sc ? sc.clientHeight
                      : ((cont?.clientHeight || 600) - (cont?.querySelector('.fc-col-header')?.getBoundingClientRect().height || 44));
  const slotPx = Math.max(8, Math.round((visibleH / VISIBLE_12H) * ZOOM_FACTOR[_zoomLevel]));

  const prevTop = sc ? sc.scrollTop : 0;
  const prevSlot = _curSlotPx;
  _curSlotPx = slotPx;

  _setSlotCss(slotPx);
  _calendar.changeView(_calendar.view.type);   // rebuild slat coords → events align to new slots

  // Preserve roughly the same scroll position after the re-layout.
  setTimeout(() => {
    const s2 = _bodyScroller();
    if (s2) s2.scrollTop = prevSlot ? Math.round(prevTop * (slotPx / prevSlot)) : prevTop;
  }, 0);
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

function _hhmm(date) {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function _durLabel(start, end) {
  if (!start) return '';
  const e = end || start;
  const mins = Math.round((new Date(e) - new Date(start)) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
