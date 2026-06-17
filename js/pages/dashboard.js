// pages/dashboard.js — KPI cards + stacked bar + donut + activities (Chart.js v4)
// Spec §Dashboard: 3 KPIs (Total time · Top Project · Top Client), stacked bar
// (hours by project × Mon–Sun), donut (time per project) + custom legend, and a
// top-10 most-tracked-activities list. v1 = own/RLS data, week view, project filter.

import { getEntries } from '../api/timeEntries.js';
import { getProjects } from '../api/projects.js';
import { getEmployees } from '../api/employees.js';
import { empSelectHtml, wireEmpSelect } from '../components/empSelect.js';
import { isClientRole, isAdmin, isManager } from '../auth.js';
import { weekNavHtml, wireWeekNav, updateWeekNavLabel } from '../components/weekNav.js';
import {
  setFormatPrefs, formatDuration, getMondayOf, getWeekDays, DAY_LABELS, esc, attr,
} from '../format.js';

let _profile   = null;
let _monday    = null;
let _projectId = '';
let _projects  = [];
let _viewUserId = null;     // null = own/RLS scope; set when admin/manager views a teammate
let _members    = [];
let _barChart  = null;
let _donutChart = null;

// ──────────────────────────────────────────────────────────────
// Chart.js (lazy CDN ESM import, cached)
// ──────────────────────────────────────────────────────────────

let _Chart = null;
async function _chart() {
  if (!_Chart) {
    const m = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.4/auto/+esm');
    _Chart = m.default || m.Chart;
    const css = getComputedStyle(document.documentElement);
    _Chart.defaults.color = css.getPropertyValue('--text-muted').trim() || '#8b97a2';
    _Chart.defaults.borderColor = css.getPropertyValue('--border').trim() || '#3a444e';
    _Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  }
  return _Chart;
}

// ──────────────────────────────────────────────────────────────
// ENTRY POINT
// ──────────────────────────────────────────────────────────────

export async function render(profile) {
  _profile   = profile;
  _monday    = getMondayOf();
  _projectId = '';
  _viewUserId = null;
  _members    = [];
  _destroyCharts();
  setFormatPrefs(profile);

  const canSeeUsers = (isAdmin() || isManager()) && !isClientRole();
  document.getElementById('topbar-left').innerHTML = `
    <span class="topbar-title">Dashboard</span>
    ${canSeeUsers ? `<span id="db-emp-slot" style="display:inline-flex;margin-left:var(--sp-3);"></span>` : ''}`;

  if (isClientRole()) {
    document.getElementById('content').innerHTML = `
      <div class="empty-state" style="margin-top:60px">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
        <div class="empty-state-title">Dashboard</div>
        <div class="empty-state-sub">Not available for client accounts yet</div>
      </div>`;
    return;
  }

  document.getElementById('content').innerHTML = `
    <div class="ts-toolbar">
      ${weekNavHtml('db', _monday)}
      <div class="ts-toolbar-actions">
        <select id="db-project" style="width:auto; min-width:180px;"></select>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="kpi-grid" id="db-kpis">
        ${_kpiCard('Total time', '—', '')}
        ${_kpiCard('Top project', '—', '')}
        ${_kpiCard('Top client', '—', '')}
      </div>

      <div class="chart-wrapper dashboard-bar-chart">
        <div class="chart-title">Hours by project</div>
        <div id="db-bar-area" style="position:relative; height:280px;">
          <canvas class="bar-chart" id="db-bar-canvas"></canvas>
        </div>
      </div>

      <div class="dashboard-bottom">
        <div class="chart-wrapper">
          <div class="chart-title">Time per project</div>
          <div class="donut-container" id="db-donut-area">
            <canvas class="donut-chart" id="db-donut-canvas"></canvas>
          </div>
        </div>
        <div class="chart-wrapper">
          <div class="chart-title">Breakdown</div>
          <div class="donut-legend" id="db-legend"></div>
        </div>
        <div class="chart-wrapper">
          <div class="chart-title">Most tracked activities</div>
          <div class="activities-list" id="db-activities"></div>
        </div>
      </div>
    </div>
  `;

  _wireToolbar();
  if (isAdmin() || isManager()) _wireUserSelect(profile);

  try {
    _projects = await getProjects();
  } catch (err) {
    window.showToast?.(err.message, 'error');
    _projects = [];
  }
  _renderProjectOptions();

  await _reload();
}

// Teammate selector — view another user's dashboard (admin/manager only).
function _wireUserSelect(profile) {
  getEmployees().then(emps => {
    _members = emps.filter(e => e.user_id && e.user_id !== profile.id);
    const slot = document.getElementById('db-emp-slot');
    if (!slot) return;
    slot.innerHTML = empSelectHtml('db', _members, { placeholder: 'Myself' });
    wireEmpSelect('db', _members, emp => {
      _viewUserId = emp?.user_id || null;
      _reload();
    });
  }).catch(err => window.showToast?.(err.message, 'error'));
}

function _wireToolbar() {
  wireWeekNav('db', () => _monday, d => { _monday = d; }, _reload);
  document.getElementById('content').querySelector('#db-project')?.addEventListener('change', e => {
    _projectId = e.target.value;
    _reload();
  });
}

function _renderProjectOptions() {
  const sel = document.getElementById('db-project');
  if (!sel) return;
  sel.innerHTML = `<option value="">All projects</option>` +
    _projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  sel.value = _projectId;
}

// ──────────────────────────────────────────────────────────────
// LOAD + AGGREGATE + PAINT
// ──────────────────────────────────────────────────────────────

async function _reload() {
  updateWeekNavLabel('db', _monday);

  const week = getWeekDays(_monday);
  const from = week[0];
  const to   = week[6];

  let entries = [];
  try {
    entries = await getEntries({
      dateFrom: from, dateTo: to,
      projectId: _projectId || undefined,
      userId: _viewUserId || undefined,
      limit: 500,
    });
  } catch (err) {
    window.showToast?.(err.message, 'error');
    entries = [];
  }

  const agg = _aggregate(entries, week);
  _renderKpis(agg, entries.length);
  await _renderBar(agg, week);
  await _renderDonut(agg);
  _renderLegend(agg);
  _renderActivities(agg);
}

function _aggregate(entries, week) {
  const byProject = {};   // pid -> { name, color, total, perDay:{iso:hours} }
  const byClient  = {};   // name -> total
  const byActivity = {};  // desc -> { hours, color }
  let grand = 0;

  for (const e of entries) {
    const hrs = Number(e.total_hours) || 0;
    if (hrs <= 0) continue;
    grand += hrs;

    const pid   = e.project_id;
    const pname = e.project?.name || '(no project)';
    const color = e.project?.color || '#8b97a2';
    if (!byProject[pid]) byProject[pid] = { name: pname, color, total: 0, perDay: {} };
    byProject[pid].total += hrs;
    byProject[pid].perDay[e.date] = (byProject[pid].perDay[e.date] || 0) + hrs;

    // entries join client as `clients`; projects.getProjects uses `client` — handle both
    const cname = e.project?.clients?.name || e.project?.client?.name || '(no client)';
    byClient[cname] = (byClient[cname] || 0) + hrs;

    const desc = (e.description || e.task?.name || '(no description)').trim() || '(no description)';
    if (!byActivity[desc]) byActivity[desc] = { hours: 0, color, _maxHrs: 0 };
    byActivity[desc].hours += hrs;
    if (hrs > byActivity[desc]._maxHrs) {        // color = largest single contributor
      byActivity[desc]._maxHrs = hrs;
      byActivity[desc].color = color;
    }
  }
  void week;

  const projects = Object.values(byProject).sort((a, b) => b.total - a.total);
  const topProject = projects[0] || null;

  const clients = Object.entries(byClient).map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
  const topClient = clients[0] || null;

  const activities = Object.entries(byActivity)
    .map(([desc, v]) => ({ desc, hours: v.hours, color: v.color }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 10);

  return { grand, projects, topProject, topClient, activities };
}

// ── KPIs ────────────────────────────────────────────────────

function _kpiCard(title, value, sub) {
  return `<div class="card">
    <div class="card-title">${title}</div>
    <div class="card-value">${value}</div>
    ${sub ? `<div class="card-sub">${sub}</div>` : `<div class="card-sub">&nbsp;</div>`}
  </div>`;
}

function _renderKpis(agg, entryCount) {
  const grid = document.getElementById('db-kpis');
  if (!grid) return;
  const total = agg.grand > 0 ? formatDuration(agg.grand) : '0:00';
  const tp = agg.topProject;
  const tc = agg.topClient;
  grid.innerHTML =
    _kpiCard('Total time', total, `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`) +
    _kpiCard('Top project', tp ? esc(tp.name) : '—', tp ? formatDuration(tp.total) : '') +
    _kpiCard('Top client',  tc ? esc(tc.name) : '—', tc ? formatDuration(tc.total) : '');
}

// ── Stacked bar ─────────────────────────────────────────────

async function _renderBar(agg, week) {
  if (_barChart) { _barChart.destroy(); _barChart = null; }
  const area = document.getElementById('db-bar-area');
  if (!area) return;

  if (agg.grand <= 0) {
    area.innerHTML = `<div class="empty-state"><div class="empty-state-sub">No data this week</div></div>`;
    return;
  }
  area.innerHTML = `<canvas class="bar-chart" id="db-bar-canvas"></canvas>`;

  const Chart = await _chart();
  const datasets = agg.projects.map(p => ({
    label: p.name,
    data: week.map(iso => Math.round((p.perDay[iso] || 0) * 100) / 100),
    backgroundColor: p.color,
    borderWidth: 0,
    stack: 'h',
  }));

  _barChart = new Chart(document.getElementById('db-bar-canvas'), {
    type: 'bar',
    data: { labels: DAY_LABELS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { callback: v => formatDuration(v) } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatDuration(ctx.parsed.y)}` } },
      },
    },
  });
}

// ── Donut ───────────────────────────────────────────────────

async function _renderDonut(agg) {
  if (_donutChart) { _donutChart.destroy(); _donutChart = null; }
  const area = document.getElementById('db-donut-area');
  if (!area) return;

  if (agg.grand <= 0) {
    area.innerHTML = `<div class="empty-state"><div class="empty-state-sub">No data</div></div>`;
    return;
  }
  area.innerHTML = `<canvas class="donut-chart" id="db-donut-canvas"></canvas>`;

  const Chart = await _chart();
  _donutChart = new Chart(document.getElementById('db-donut-canvas'), {
    type: 'doughnut',
    data: {
      labels: agg.projects.map(p => p.name),
      datasets: [{
        data: agg.projects.map(p => Math.round(p.total * 100) / 100),
        backgroundColor: agg.projects.map(p => p.color),
        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#2c323a',
        borderWidth: 2,
      }],
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
}

// ── Legend ──────────────────────────────────────────────────

function _renderLegend(agg) {
  const el = document.getElementById('db-legend');
  if (!el) return;
  if (agg.grand <= 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-sub">No data</div></div>`;
    return;
  }
  el.innerHTML = agg.projects.map(p => {
    const pct = Math.round(p.total / agg.grand * 100);
    return `<div class="donut-legend-item">
      <span class="donut-legend-dot" style="background:${attr(p.color)};"></span>
      <span class="donut-legend-name">${esc(p.name)}</span>
      <span class="donut-legend-value">${formatDuration(p.total)}</span>
      <span class="donut-legend-pct">${pct}%</span>
    </div>`;
  }).join('');
}

// ── Activities ──────────────────────────────────────────────

function _renderActivities(agg) {
  const el = document.getElementById('db-activities');
  if (!el) return;
  if (!agg.activities.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-sub">No activities</div></div>`;
    return;
  }
  el.innerHTML = agg.activities.map(a => `
    <div class="activity-item">
      <span class="activity-dot" style="background:${attr(a.color)};"></span>
      <span class="activity-desc">${esc(a.desc)}</span>
      <span class="activity-hours">${formatDuration(a.hours)}</span>
    </div>`).join('');
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

function _destroyCharts() {
  if (_barChart) { _barChart.destroy(); _barChart = null; }
  if (_donutChart) { _donutChart.destroy(); _donutChart = null; }
}

