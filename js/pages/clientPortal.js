// pages/clientPortal.js — CLIENT-01 read-only client portal.
// A logged-in client sees ONLY their own company's data (enforced by RLS +
// the get_client_project_summary RPC): project hour SUMMARY (no line-item
// timesheets, no employee identity) + DETAILED expenses/travel (employee
// identity masked — we never fetch or show the employee). Export = plain-text
// download + a print-friendly view. Strictly read-only.

import { supabase } from '../config.js';
import { esc, attr, formatDate } from '../format.js';

let _profile  = null;
let _company  = '';
let _summary  = [];   // [{ project_id, project_name, total_hours, billable_hours, entry_count }]
let _expenses = [];   // masked cash_transactions (out) for the client's projects
let _trips    = [];   // masked travel_requests for the client's projects
let _projName = {};   // project_id -> name

export async function render(profile) {
  _profile = profile;

  document.getElementById('topbar-left').innerHTML =
    `<span class="topbar-title">Client Portal</span>`;

  const content = document.getElementById('content');
  content.innerHTML = `<div class="page-loading">Loading…</div>`;

  // Company name (their own clients row is readable via clients_select)
  try {
    const { data: cl } = await supabase
      .from('clients').select('name').eq('id', profile.client_id).maybeSingle();
    _company = cl?.name || 'Your projects';
  } catch { _company = 'Your projects'; }

  try {
    // 1) Summary first — it is the authoritative list of THIS client's projects.
    const summaryRes = await supabase.rpc('get_client_project_summary');
    if (summaryRes.error) throw summaryRes.error;
    _summary  = summaryRes.data || [];
    _projName = {};
    _summary.forEach(s => { _projName[s.project_id] = s.project_name; });

    // 2) Detail rows are scoped to those project IDs as defense-in-depth.
    //    RLS remains the authoritative boundary; this just ensures we never even
    //    fetch a row whose project isn't one of the client's known projects.
    const projectIds = Object.keys(_projName);
    if (projectIds.length === 0) {
      _expenses = [];
      _trips    = [];
    } else {
      const [expRes, tripRes] = await Promise.all([
        supabase.from('cash_transactions')
          .select('id, project_id, txn_date, amount, currency, direction, note, status')
          .eq('direction', 'out')
          .in('project_id', projectIds)
          .order('txn_date', { ascending: false }),
        supabase.from('travel_requests')
          .select('id, project_id, destination, start_date, end_date, estimated_cost, currency, status, travel_ref')
          .in('project_id', projectIds)
          .order('start_date', { ascending: false }),
      ]);
      _expenses = (expRes.data  || []);
      _trips    = (tripRes.data || []);
    }
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state" style="margin-top:60px">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div class="empty-state-title">Couldn't load your portal</div>
        <div class="empty-state-sub">${esc(err.message || 'Please check your connection and retry.')}</div>
        <button class="btn btn-secondary" id="cp-retry" style="margin-top:16px">Retry</button>
      </div>`;
    document.getElementById('cp-retry')?.addEventListener('click', () => render(profile));
    return;
  }

  _renderPortal(content);
}

function _renderPortal(content) {
  const totalHours    = _summary.reduce((s, p) => s + Number(p.total_hours || 0), 0);
  const billableHours = _summary.reduce((s, p) => s + Number(p.billable_hours || 0), 0);
  const maxHours      = Math.max(1, ..._summary.map(p => Number(p.total_hours || 0)));

  content.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:var(--sp-4)">
      <div>
        <div style="font-size:18px; font-weight:600;">${esc(_company)}</div>
        <div class="text-muted" style="font-size:13px;">Your projects · read-only</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost" id="cp-export">Export (text)</button>
        <button class="btn btn-secondary" id="cp-print">Print</button>
      </div>
    </div>

    <!-- Summary cards -->
    <div style="display:flex; gap:var(--sp-3); flex-wrap:wrap; margin-bottom:var(--sp-4)">
      ${_card('Projects', _summary.length)}
      ${_card('Total hours', totalHours.toLocaleString('en', { maximumFractionDigits: 1 }))}
      ${_card('Billable hours', billableHours.toLocaleString('en', { maximumFractionDigits: 1 }))}
    </div>

    <!-- Hours by project (summary + simple bar chart) -->
    <div class="card" style="margin-bottom:var(--sp-4)">
      <div style="font-weight:600; margin-bottom:12px;">Hours by project</div>
      ${_summary.length === 0
        ? `<div class="text-muted">No project activity yet.</div>`
        : _summary.map(p => {
            const h = Number(p.total_hours || 0);
            const pct = Math.round((h / maxHours) * 100);
            return `
              <div style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:3px;">
                  <span>${esc(p.project_name || '—')}</span>
                  <span class="text-muted">${h.toLocaleString('en', { maximumFractionDigits: 1 })} h${Number(p.billable_hours) ? ` · ${Number(p.billable_hours).toLocaleString('en',{maximumFractionDigits:1})} billable` : ''}</span>
                </div>
                <div style="background:var(--bg-elevated,#1e2329); border-radius:4px; height:8px; overflow:hidden;">
                  <div style="background:#03a9f4; height:100%; width:${pct}%;"></div>
                </div>
              </div>`;
          }).join('')}
    </div>

    <!-- Expenses & travel (detail; employee identity masked) -->
    <div class="card">
      <div style="font-weight:600; margin-bottom:12px;">Expenses &amp; travel</div>
      ${_renderExpenseTable()}
    </div>
  `;

  document.getElementById('cp-export')?.addEventListener('click', _exportText);
  document.getElementById('cp-print')?.addEventListener('click', () => window.print());
}

function _card(label, value) {
  return `
    <div class="card" style="flex:1; min-width:140px;">
      <div class="text-muted" style="font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">${esc(label)}</div>
      <div style="font-size:24px; font-weight:600; margin-top:4px;">${esc(String(value))}</div>
    </div>`;
}

// Single source of truth for the rows the client may see — used by BOTH the
// rendered table and the text export. Only rows tied to a KNOWN client project
// (one present in _projName) are included; anything else is dropped, regardless
// of amount. RLS is the authoritative boundary; this is defence-in-depth.
function _buildRows() {
  return [
    ..._expenses
      .filter(e => Object.prototype.hasOwnProperty.call(_projName, e.project_id))
      .map(e => ({
        date: e.txn_date, project: _projName[e.project_id],
        type: 'Expense', detail: e.note || '—',
        amount: Number(e.amount || 0), currency: e.currency || 'THB', status: e.status || '',
      })),
    ..._trips
      .filter(t => Object.prototype.hasOwnProperty.call(_projName, t.project_id))
      .map(t => ({
        date: t.start_date, project: _projName[t.project_id],
        type: 'Travel', detail: `${t.destination || ''}${t.travel_ref ? ` (${t.travel_ref})` : ''}`,
        amount: Number(t.estimated_cost || 0), currency: t.currency || 'THB', status: t.status || '',
      })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function _renderExpenseTable() {
  const rows = _buildRows();

  if (rows.length === 0) return `<div class="text-muted">No expenses or travel recorded.</div>`;

  return `
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Date</th><th>Project</th><th>Type</th><th>Detail</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${esc(formatDate(r.date))}</td>
              <td>${esc(r.project)}</td>
              <td>${esc(r.type)}</td>
              <td>${esc(r.detail)}</td>
              <td>${r.amount.toLocaleString('en', { minimumFractionDigits: 2 })} ${esc(r.currency)}</td>
              <td><span class="text-muted">${esc(r.status)}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function _exportText() {
  const lines = [];
  lines.push(`${_company} — project report`);
  lines.push(`Generated ${formatDate(new Date().toISOString().slice(0, 10))}`);
  lines.push('');
  lines.push('HOURS BY PROJECT');
  _summary.forEach(p => {
    lines.push(`  ${p.project_name || '—'}: ${Number(p.total_hours || 0)} h (${Number(p.billable_hours || 0)} billable)`);
  });
  lines.push('');
  lines.push('EXPENSES & TRAVEL');
  // Same filtered rows the table shows — never export rows outside the client's projects.
  _buildRows().forEach(r => lines.push(`  ${r.date}  ${r.project}  ${r.type}  ${r.amount.toFixed(2)} ${r.currency}  ${r.detail}`));

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${_company.replace(/[^a-z0-9]+/gi, '_')}_report.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
