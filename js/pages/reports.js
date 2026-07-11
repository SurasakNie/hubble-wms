// pages/reports.js — Filterable reports: stacked bar + grouped table + donut + CSV export
// Spec §8.5 · Access: owner / admin / manager only (canViewReports)
// Conventions mirror dashboard.js exactly: same Chart.js lazy import, _destroyCharts,
// _esc/_attr helpers, module-level state, setFormatPrefs, no new SQL.

import { getEntries }                                 from '../api/timeEntries.js';
import { getProjects }                                from '../api/projects.js';
import { getClients }                                 from '../api/clients.js';
import { getTags }                                    from '../api/tags.js';
import { getUsers }                                   from '../api/users.js';
import { getEmployees }                               from '../api/employees.js';
import { empSelectHtml, wireEmpSelect }               from '../components/empSelect.js';
import { canViewReports, isAdmin, isManager }          from '../auth.js';
import {
  setFormatPrefs, formatDuration, formatAmount,
  getMondayOf, getWeekDays, toISODate, formatDate, esc, attr,
} from '../format.js';

// ── module state ─────────────────────────────────────────────
let _profile      = null;
let _entries      = [];        // raw fetched (after API filters)
let _filtered     = [];        // after in-page filters
let _rateMap      = {};        // userId → billable_rate (admin/owner only)
let _groupPrimary = 'project';
let _groupSecond  = 'description';

// filter values (read from DOM on APPLY)
let _fFrom        = '';
let _fTo          = '';
let _fUserId      = '';
let _fProjectId   = '';
let _fClientId    = '';
let _fTagId       = '';
let _fStatus      = '';        // '' | 'billable' | 'non-billable'
let _fDesc        = '';
let _fTaskId      = '';        // populated after first fetch

let _barChart     = null;
let _donutChart   = null;

// ── Chart.js (lazy CDN ESM, cached — same as dashboard.js) ───
let _Chart = null;
async function _chart() {
  if (!_Chart) {
    const m = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.4/auto/+esm');
    _Chart = m.default || m.Chart;
    const css = getComputedStyle(document.documentElement);
    _Chart.defaults.color        = css.getPropertyValue('--text-muted').trim()  || '#8b97a2';
    _Chart.defaults.borderColor  = css.getPropertyValue('--border').trim()       || '#3a444e';
    _Chart.defaults.font.family  = 'Inter, system-ui, sans-serif';
  }
  return _Chart;
}

// ── ENTRY POINT ───────────────────────────────────────────────
export async function render(profile) {
  if (!canViewReports()) { window.location.hash = '#tracker'; return; }

  _profile  = profile;
  _entries  = [];
  _filtered = [];
  _rateMap  = {};
  _destroyCharts();
  setFormatPrefs(profile);

  const showAmount = isAdmin();      // managers never see billable rates

  // Default range = current week Mon–Sun
  const week = getWeekDays(getMondayOf());
  _fFrom = week[0];
  _fTo   = week[6];
  _fUserId = _fProjectId = _fClientId = _fTagId = _fStatus = _fDesc = _fTaskId = '';
  _groupPrimary = 'project';
  _groupSecond  = 'description';

  document.getElementById('topbar-left').innerHTML = '<span class="topbar-title">Reports</span>';

  document.getElementById('content').innerHTML = `
    <div id="rp-wrap">

      <!-- ── Filter bar ─────────────────────────────────────── -->
      <div class="filter-bar" id="rp-filters">
        <label style="display:flex;align-items:center;gap:var(--sp-1);font-size:var(--font-sm);">
          <span>From</span>
          <input type="date" id="rp-from" value="${_fFrom}">
        </label>
        <label style="display:flex;align-items:center;gap:var(--sp-1);font-size:var(--font-sm);">
          <span>To</span>
          <input type="date" id="rp-to" value="${_fTo}">
        </label>
        <span id="rp-emp-slot" style="display:none;"></span>
        <select id="rp-client"></select>
        <select id="rp-project"></select>
        <select id="rp-tag"></select>
        <select id="rp-status">
          <option value="">All status</option>
          <option value="billable">Billable</option>
          <option value="non-billable">Non-billable</option>
        </select>
        <input type="text" id="rp-desc" placeholder="Description…"
               style="min-width:130px;max-width:200px;">
        <select id="rp-task" style="display:none;"></select>
        <button class="btn btn-primary" id="rp-apply">APPLY FILTER</button>
      </div>

      <!-- ── Summary bar ─────────────────────────────────────── -->
      <div class="kpi-grid" id="rp-kpis" style="margin-bottom:var(--sp-4);"></div>

      <!-- ── Grouping controls ───────────────────────────────── -->
      <div class="filter-bar" style="margin-bottom:var(--sp-4);">
        <span style="font-size:var(--font-sm);color:var(--text-muted);">Group by</span>
        <select id="rp-g1">
          <option value="project"     selected>Project</option>
          <option value="client">Client</option>
          <option value="task">Task</option>
          <option value="tag">Tag</option>
          <option value="description">Description</option>
          <option value="status">Status</option>
        </select>
        <span style="font-size:var(--font-sm);color:var(--text-muted);">then</span>
        <select id="rp-g2">
          <option value="description" selected>Description</option>
          <option value="project">Project</option>
          <option value="client">Client</option>
          <option value="task">Task</option>
          <option value="tag">Tag</option>
          <option value="status">Status</option>
          <option value="none">None</option>
        </select>
        <div style="margin-left:auto;display:flex;gap:var(--sp-2);">
          <button class="btn btn-ghost btn-sm" id="rp-print">Print</button>
          <button class="btn btn-primary btn-sm" id="rp-export">Export CSV</button>
        </div>
      </div>

      <!-- ── Stacked bar chart ───────────────────────────────── -->
      <div class="chart-wrapper" style="margin-bottom:var(--sp-5);">
        <div class="chart-title">Hours by project</div>
        <div id="rp-bar-area" style="position:relative;height:260px;"></div>
      </div>

      <!-- ── Table + donut (side by side on wide screens) ──── -->
      <div id="rp-bottom" style="display:grid;grid-template-columns:1fr auto;gap:var(--sp-5);align-items:start;">

        <!-- Grouped table -->
        <div class="table-wrapper" id="rp-table-wrap">
          <div class="empty-state"><div class="empty-state-sub">Loading…</div></div>
        </div>

        <!-- Companion donut -->
        <div class="chart-wrapper" style="min-width:220px;max-width:260px;display:none;" id="rp-donut-wrap">
          <div class="chart-title" id="rp-donut-title">By project</div>
          <div class="donut-container" id="rp-donut-area"
               style="height:220px;position:relative;"></div>
          <div class="donut-legend" id="rp-donut-legend"></div>
        </div>
      </div>

    </div>
  `;

  // Populate static dropdowns (non-blocking)
  _populateDropdowns(showAmount);

  // Wire events
  _wire(showAmount);

  // Initial load
  await _load(showAmount);
}

// ── Dropdown population ───────────────────────────────────────
async function _populateDropdowns(showAmount) {
  // Team (admin sees all; managers see only themselves — hide the picker)
  if (isAdmin() || isManager()) {
    const slot = document.getElementById('rp-emp-slot');
    // Fetch employees for picker + users for rate map (parallel, independent)
    getEmployees().then(emps => {
      const members = emps.filter(e => e.user_id);
      if (!slot) return;
      slot.innerHTML = empSelectHtml('rp', members, { placeholder: 'All team members' });
      slot.style.display = '';
      wireEmpSelect('rp', members, emp => {
        _fUserId = emp?.user_id || '';
      });
    }).catch(err => window.showToast?.(err.message, 'error'));
    // Rate map — ONLY for roles that actually display amounts (admin/owner).
    // showAmount is isAdmin(); managers never see rates, so don't even fetch
    // billable_rate into their payload. (Clients excluded by getUsers default.)
    if (showAmount) {
      getUsers(true).then(users => {
        for (const u of users) _rateMap[u.id] = Number(u.billable_rate) || 0;
      }).catch(err => console.warn('[reports] rate fetch failed', err));
    }
  }

  getClients().then(list => {
    const sel = document.getElementById('rp-client');
    if (!sel) return;
    sel.innerHTML = `<option value="">All clients</option>` +
      list.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }).catch(err => window.showToast?.(err.message, 'error'));

  getProjects().then(list => {
    const sel = document.getElementById('rp-project');
    if (!sel) return;
    sel.innerHTML = `<option value="">All projects</option>` +
      list.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  }).catch(err => window.showToast?.(err.message, 'error'));

  getTags().then(list => {
    const sel = document.getElementById('rp-tag');
    if (!sel) return;
    sel.innerHTML = `<option value="">All tags</option>` +
      list.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  }).catch(err => window.showToast?.(err.message, 'error'));
}

// ── Event wiring ─────────────────────────────────────────────
function _wire(showAmount) {
  const c = document.getElementById('content');

  // Apply filter
  c.querySelector('#rp-apply')?.addEventListener('click', () => _load(showAmount));

  // Group-by selects → re-render without refetch
  c.querySelector('#rp-g1')?.addEventListener('change', e => {
    _groupPrimary = e.target.value;
    _applyInPageFilters();
    _renderAll(showAmount);
  });
  c.querySelector('#rp-g2')?.addEventListener('change', e => {
    _groupSecond = e.target.value;
    _applyInPageFilters();
    _renderAll(showAmount);
  });

  // Export
  c.querySelector('#rp-export')?.addEventListener('click', () => _exportCSV(showAmount));

  // Print
  c.querySelector('#rp-print')?.addEventListener('click', () => window.print());
}

// ── Load (API fetch + in-page filter + render) ────────────────
async function _load(showAmount) {
  // Read filter values from DOM (_fUserId is maintained by wireEmpSelect callback)
  _fFrom      = document.getElementById('rp-from')?.value    || '';
  _fTo        = document.getElementById('rp-to')?.value      || '';
  _fProjectId = document.getElementById('rp-project')?.value || '';
  _fClientId  = document.getElementById('rp-client')?.value  || '';
  _fTagId     = document.getElementById('rp-tag')?.value     || '';
  _fStatus    = document.getElementById('rp-status')?.value  || '';
  _fDesc      = (document.getElementById('rp-desc')?.value   || '').trim().toLowerCase();
  _fTaskId    = document.getElementById('rp-task')?.value    || '';
  _groupPrimary = document.getElementById('rp-g1')?.value    || 'project';
  _groupSecond  = document.getElementById('rp-g2')?.value    || 'description';

  // Apply button visual feedback
  const applyBtn = document.getElementById('rp-apply');
  if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Loading…'; }

  try {
    _entries = await getEntries({
      dateFrom:  _fFrom    || undefined,
      dateTo:    _fTo      || undefined,
      userId:    _fUserId   || undefined,
      projectId: _fProjectId || undefined,
      limit: 2000,
    });
  } catch (err) {
    window.showToast?.(err.message, 'error');
    _entries = [];
  } finally {
    if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'APPLY FILTER'; }
  }

  // Rebuild task dropdown from result set
  _rebuildTaskDropdown();

  // Apply in-page filters (client, tag, status, desc, task)
  _applyInPageFilters();

  // Render everything
  await _renderAll(showAmount);
}

// ── In-page filtering (client / tag / status / desc / task) ───
function _applyInPageFilters() {
  _filtered = _entries.filter(e => {
    if (_fClientId && e.project?.client_id !== _fClientId) return false;
    if (_fTagId) {
      const hasTag = (e.time_entry_tags || []).some(t => t.tag?.id === _fTagId);
      if (!hasTag) return false;
    }
    if (_fStatus === 'billable'     && !e.is_billable) return false;
    if (_fStatus === 'non-billable' &&  e.is_billable) return false;
    if (_fDesc && !(e.description || '').toLowerCase().includes(_fDesc)) return false;
    if (_fTaskId && e.task_id !== _fTaskId) return false;
    return true;
  });
}

// ── Task dropdown (built from fetched entries) ─────────────────
function _rebuildTaskDropdown() {
  const seen = new Map();
  for (const e of _entries) {
    if (e.task?.id && !seen.has(e.task.id)) seen.set(e.task.id, e.task.name || e.task.id);
  }
  const sel = document.getElementById('rp-task');
  if (!sel) return;
  if (seen.size === 0) { sel.style.display = 'none'; sel.value = ''; _fTaskId = ''; return; }
  const prev = sel.value;
  sel.innerHTML = `<option value="">All tasks</option>` +
    [...seen].map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join('');
  if (prev && seen.has(prev)) sel.value = prev;
  sel.style.display = '';
}

// ── Render orchestrator ───────────────────────────────────────
async function _renderAll(showAmount) {
  const agg = _aggregate(_filtered, showAmount);
  _renderKpis(agg, showAmount);
  await _renderBar();
  _renderTable(agg, showAmount);
  await _renderDonut(agg);
}

// ── Aggregation ───────────────────────────────────────────────
function _aggregate(entries, showAmount) {
  let grand = 0, billable = 0, amount = 0;

  // byProject × date for bar chart
  const byProject = {};  // pid → { name, color, total, perDay:{iso:hours} }

  // Chained grouping: primary → secondary
  const groups = new Map(); // primaryKey → { label, color, hours, amount, children: Map }

  // palette for non-project group coloring
  const PALETTE = [
    '#03a9f4','#4caf50','#ff9800','#e91e63','#9c27b0',
    '#00bcd4','#8bc34a','#ff5722','#607d8b','#795548',
  ];
  let _palIdx = 0;
  const _colorOf = (() => {
    const cache = {};
    return key => { if (!cache[key]) cache[key] = PALETTE[_palIdx++ % PALETTE.length]; return cache[key]; };
  })();

  const _groupKey = (e, dim) => {
    switch (dim) {
      case 'project':     return e.project?.id     || '__none__';
      case 'client':      return e.project?.client_id || '__none__';
      case 'task':        return e.task?.id         || '__none__';
      case 'tag': {
        const tags = (e.time_entry_tags || []).map(t => t.tag?.id).filter(Boolean).sort().join(',');
        return tags || '__none__';
      }
      case 'description': return (e.description || '').trim() || '(no description)';
      case 'status':      return e.is_billable ? 'Billable' : 'Non-billable';
      default:            return '__all__';
    }
  };

  const _groupLabel = (e, dim, key) => {
    switch (dim) {
      case 'project':     return e.project?.name                                  || '(no project)';
      case 'client':      return e.project?.clients?.name || e.project?.client?.name || '(no client)';
      case 'task':        return e.task?.name                                       || '(no task)';
      case 'tag': {
        const tags = (e.time_entry_tags || []).map(t => t.tag?.name).filter(Boolean);
        return tags.length ? tags.join(', ') : '(no tag)';
      }
      case 'description': return key;
      case 'status':      return key;
      default:            return 'All';
    }
  };

  const _groupColor = (e, dim) => {
    if (dim === 'project') return e.project?.color || '#8b97a2';
    return null; // use palette
  };

  for (const e of entries) {
    const hrs = Number(e.total_hours) || 0;
    if (hrs <= 0) continue;

    // Rate amount (admin/owner only; billable entries only)
    const rate = showAmount ? (_rateMap[e.user_id] || 0) : 0;
    const amt  = showAmount && e.is_billable ? hrs * rate : 0;

    grand    += hrs;
    if (e.is_billable) billable += hrs;
    amount   += amt;

    // Bar chart structure
    const pid = e.project_id || '__none__';
    const pname = e.project?.name || '(no project)';
    const pcolor = e.project?.color || '#8b97a2';
    if (!byProject[pid]) byProject[pid] = { name: pname, color: pcolor, total: 0, perDay: {} };
    byProject[pid].total += hrs;
    byProject[pid].perDay[e.date] = (byProject[pid].perDay[e.date] || 0) + hrs;

    // Grouping
    const pk    = _groupKey(e, _groupPrimary);
    const plabel = _groupLabel(e, _groupPrimary, pk);
    const pcolor2 = _groupColor(e, _groupPrimary) || _colorOf(pk);

    if (!groups.has(pk)) groups.set(pk, { label: plabel, color: pcolor2, hours: 0, amount: 0, children: new Map() });
    const g = groups.get(pk);
    g.hours  += hrs;
    g.amount += amt;

    if (_groupSecond !== 'none') {
      const sk     = _groupKey(e, _groupSecond);
      const slabel = _groupLabel(e, _groupSecond, sk);
      if (!g.children.has(sk)) g.children.set(sk, { label: slabel, hours: 0, amount: 0 });
      const child = g.children.get(sk);
      child.hours  += hrs;
      child.amount += amt;
    }
  }

  const projects = Object.values(byProject).sort((a, b) => b.total - a.total);

  return { grand, billable, amount, byProject, projects, groups };
}

// ── KPI cards ─────────────────────────────────────────────────
function _kpiCard(title, value, sub) {
  return `<div class="card">
    <div class="card-title">${title}</div>
    <div class="card-value">${value}</div>
    ${sub ? `<div class="card-sub">${sub}</div>` : `<div class="card-sub">&nbsp;</div>`}
  </div>`;
}

function _renderKpis(agg, showAmount) {
  const el = document.getElementById('rp-kpis');
  if (!el) return;
  const total   = formatDuration(agg.grand);
  const bill    = formatDuration(agg.billable);
  const pct     = agg.grand > 0 ? Math.round(agg.billable / agg.grand * 100) : 0;
  el.innerHTML  =
    _kpiCard('Total time',    total,  `${_filtered.length} entr${_filtered.length === 1 ? 'y' : 'ies'}`) +
    _kpiCard('Billable',      bill,   `${pct}% of total`) +
    (showAmount ? _kpiCard('Amount (THB)', formatAmount(agg.amount), '&nbsp;') : '');
}

// ── Stacked bar (date range × project) ────────────────────────
async function _renderBar() {
  if (_barChart) { _barChart.destroy(); _barChart = null; }
  const area = document.getElementById('rp-bar-area');
  if (!area) return;

  const agg = _aggregate(_filtered, false);

  if (agg.grand <= 0) {
    area.innerHTML = `<div class="empty-state"><div class="empty-state-sub">No data for this period</div></div>`;
    return;
  }

  // Build date axis from _fFrom→_fTo
  const dates = _dateRange(_fFrom, _fTo);
  const labels = dates.map(d => formatDate(d));

  area.innerHTML = `<canvas id="rp-bar-canvas"></canvas>`;

  const Chart = await _chart();
  const datasets = agg.projects.map(p => ({
    label:           p.name,
    data:            dates.map(d => Math.round((p.perDay[d] || 0) * 100) / 100),
    backgroundColor: p.color,
    borderWidth:     0,
    stack:           'h',
  }));

  _barChart = new Chart(document.getElementById('rp-bar-canvas'), {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 20 } },
        y: { stacked: true, beginAtZero: true, ticks: { callback: v => formatDuration(v) } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatDuration(ctx.parsed.y)}` } },
      },
    },
  });
}

// ── Grouped table ─────────────────────────────────────────────
function _renderTable(agg, showAmount) {
  const wrap = document.getElementById('rp-table-wrap');
  if (!wrap) return;

  if (agg.grand <= 0) {
    wrap.innerHTML = `<div class="empty-state" style="padding:var(--sp-8);">
      <div class="empty-state-sub">No entries match the current filters</div></div>`;
    return;
  }

  const amtCol = showAmount;
  const head = `<tr>
    <th style="text-align:left;">TITLE</th>
    <th>DURATION</th>
    ${amtCol ? '<th>AMOUNT</th>' : ''}
  </tr>`;

  let rows = '';
  for (const [, g] of agg.groups) {
    const hasChildren = _groupSecond !== 'none' && g.children.size > 0;
    rows += `<tr class="rp-group-row" style="background:var(--bg-card);font-weight:600;">
      <td style="padding-left:var(--sp-3);">
        <span class="project-dot" style="background:${attr(g.color)};margin-right:6px;"></span>
        ${esc(g.label)}
      </td>
      <td style="text-align:right;">${formatDuration(g.hours)}</td>
      ${amtCol ? `<td style="text-align:right;">${formatAmount(g.amount)}</td>` : ''}
    </tr>`;

    if (hasChildren) {
      for (const [, child] of g.children) {
        rows += `<tr class="rp-child-row">
          <td style="padding-left:var(--sp-6);color:var(--text-muted);">${esc(child.label)}</td>
          <td style="text-align:right;color:var(--text-muted);">${formatDuration(child.hours)}</td>
          ${amtCol ? `<td style="text-align:right;color:var(--text-muted);">${formatAmount(child.amount)}</td>` : ''}
        </tr>`;
      }
    }
  }

  const foot = `<tr style="font-weight:700;border-top:2px solid var(--border);">
    <td>Total</td>
    <td style="text-align:right;">${formatDuration(agg.grand)}</td>
    ${amtCol ? `<td style="text-align:right;">${formatAmount(agg.amount)}</td>` : ''}
  </tr>`;

  wrap.innerHTML = `<table style="width:100%;border-collapse:collapse;">
    <thead>${head}</thead>
    <tbody>${rows}</tbody>
    <tfoot>${foot}</tfoot>
  </table>`;

  // Inline cell + row styles via CSS rules injected once
  _ensureTableStyles();
}

function _ensureTableStyles() {
  if (document.getElementById('rp-table-styles')) return;
  const s = document.createElement('style');
  s.id = 'rp-table-styles';
  s.textContent = `
    #rp-table-wrap table thead tr { border-bottom: 1px solid var(--border); }
    #rp-table-wrap table th { padding: var(--sp-2) var(--sp-3); font-size: var(--font-xs); color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }
    #rp-table-wrap table td { padding: var(--sp-2) var(--sp-3); font-size: var(--font-sm); border-bottom: 1px solid var(--border); }
    #rp-table-wrap table tfoot td { border-bottom: none; }
    #rp-table-wrap table tbody tr:hover { background: rgba(255,255,255,.03); }
  `;
  document.head.appendChild(s);
}

// ── Companion donut ───────────────────────────────────────────
async function _renderDonut(agg) {
  if (_donutChart) { _donutChart.destroy(); _donutChart = null; }
  const area   = document.getElementById('rp-donut-area');
  const wrap   = document.getElementById('rp-donut-wrap');
  const legend = document.getElementById('rp-donut-legend');
  const title  = document.getElementById('rp-donut-title');
  if (!area || !wrap) return;

  if (agg.grand <= 0 || agg.groups.size === 0) {
    wrap.style.display = 'none';
    return;
  }

  wrap.style.display = '';
  if (title) title.textContent = `By ${_groupPrimary}`;
  area.innerHTML = `<canvas id="rp-donut-canvas"></canvas>`;

  const labels   = [];
  const data     = [];
  const colors   = [];
  const bgCard   = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#2c323a';
  for (const [, g] of agg.groups) {
    labels.push(g.label);
    data.push(Math.round(g.hours * 100) / 100);
    colors.push(g.color);
  }

  const Chart = await _chart();
  _donutChart = new Chart(document.getElementById('rp-donut-canvas'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderColor: bgCard, borderWidth: 2 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = agg.grand > 0 ? Math.round(ctx.parsed / agg.grand * 100) : 0;
              return `${ctx.label}: ${formatDuration(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
    },
  });

  // Custom legend
  if (legend) {
    legend.innerHTML = [...agg.groups.values()].map(g => {
      const pct = agg.grand > 0 ? Math.round(g.hours / agg.grand * 100) : 0;
      return `<div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${attr(g.color)};"></span>
        <span class="donut-legend-name">${esc(g.label)}</span>
        <span class="donut-legend-value">${formatDuration(g.hours)}</span>
        <span class="donut-legend-pct">${pct}%</span>
      </div>`;
    }).join('');
  }
}

// ── CSV export ────────────────────────────────────────────────
function _exportCSV(showAmount) {
  const agg = _aggregate(_filtered, showAmount);
  const cols = ['TITLE', 'DURATION', ...(showAmount ? ['AMOUNT'] : [])];
  const csvRows = [cols];

  for (const [, g] of agg.groups) {
    csvRows.push([
      g.label,
      formatDuration(g.hours),
      ...(showAmount ? [Number(g.amount).toFixed(2)] : []),
    ]);
    if (_groupSecond !== 'none') {
      for (const [, child] of g.children) {
        csvRows.push([
          `  ${child.label}`,
          formatDuration(child.hours),
          ...(showAmount ? [Number(child.amount).toFixed(2)] : []),
        ]);
      }
    }
  }

  // Grand total row
  csvRows.push([
    'Total',
    formatDuration(agg.grand),
    ...(showAmount ? [Number(agg.amount).toFixed(2)] : []),
  ]);

  const _csvCell = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv = csvRows.map(r => r.map(_csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `report_${toISODate(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Helpers ───────────────────────────────────────────────────

/** Return ISO date strings for each day from→to inclusive (up to 366 days). */
function _dateRange(from, to) {
  if (!from || !to) return [];
  const dates = [];
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to   + 'T00:00:00');
  let safety = 0;
  while (cur <= end && safety++ < 500) {
    dates.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function _destroyCharts() {
  if (_barChart)   { _barChart.destroy();   _barChart   = null; }
  if (_donutChart) { _donutChart.destroy(); _donutChart = null; }
}
