// pages/expenses-report.js — REPORT tab (monthly + weekly + post wages modal)

import { S, _fmt, _money, _today, _nextMonday, _monthlyDeadline, _officeProjectId, _isoWeek } from './expenses-state.js';
import { esc, toISODate } from '../format.js';
import { weekNavHtml, wireWeekNav } from '../components/weekNav.js';
import { supabase } from '../config.js';
import {
  getAllTransactions, getRunningBalance,
  postWages, getWagePostings,
} from '../api/expenses.js';

async function _renderReport() {
  const body = document.getElementById('exp-body');
  body.innerHTML = `
    <div class="tabs" id="rp-mode" style="margin-bottom:16px">
      <button class="tab-btn${S.reportMode==='monthly'?' active':''}" data-mode="monthly">MONTHLY</button>
      <button class="tab-btn${S.reportMode==='weekly'?' active':''}" data-mode="weekly">WEEKLY (part-time / outsource)</button>
    </div>
    <div id="rp-body"></div>`;
  document.getElementById('rp-mode').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn'); if (!btn) return;
    S.reportMode = btn.dataset.mode;
    try {
      sessionStorage.setItem('exp_tab_state', JSON.stringify({
        primaryTab: S.primaryTab, travelSub: S.travelSub, approvSub: S.approvSub,
        pendingCat: S.pendingCat, pettyCashSub: S.pettyCashSub, reportMode: S.reportMode,
      }));
    } catch { /* quota exceeded / private browsing */ }
    document.querySelectorAll('#rp-mode .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === S.reportMode));
    S.reportMode === 'monthly' ? _renderMonthlyReport() : _renderWeeklyReport();
  });
  S.reportMode === 'monthly' ? _renderMonthlyReport() : _renderWeeklyReport();
}

async function _renderMonthlyReport() {
  const wrap = document.getElementById('rp-body');
  const now = new Date();
  let year = now.getFullYear(), month = now.getMonth() + 1;

  async function load() {
    wrap.innerHTML = `<div class="page-loading">Loading…</div>`;
    const lastDay = new Date(year, month, 0).getDate();
    const fromDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const toDate   = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;

    const [txns, openBal] = await Promise.all([
      getAllTransactions({ fromDate, toDate }).catch(() => []),
      getRunningBalance(`${year}-${String(month).padStart(2,'0')}-00`).catch(() => ({ balance: 0 })),
    ]);
    // opening balance = balance up to the day before the 1st
    const prevDay = toISODate(new Date(year, month - 1, 0));
    const opening = (await getRunningBalance(prevDay).catch(() => ({ balance: 0 }))).balance;

    const approved = txns.filter(t => t.status === 'approved');
    const totalIn  = approved.filter(t => t.direction === 'in').reduce((s,t)=>s+Number(t.amount),0);
    const totalOut = approved.filter(t => t.direction === 'out').reduce((s,t)=>s+Number(t.amount),0);
    const closing  = opening + totalIn - totalOut;
    const suggestedTopup = (closing < 0 ? Math.abs(closing) : 0) + S.monthlyTopup;

    // group expenses by project + by person
    const byProject = {}, byPerson = {};
    for (const t of approved.filter(t => t.direction === 'out')) {
      const pk = t.project?.name || '— No project —';
      byProject[pk] = (byProject[pk] || 0) + Number(t.amount);
      const nk = t.employee?.full_name || 'Unknown';
      byPerson[nk] = (byPerson[nk] || 0) + Number(t.amount);
    }

    const deadline = _monthlyDeadline(year, month);
    const dStr = deadline.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
    const today = new Date(); today.setHours(0,0,0,0);
    const overdue = deadline < today;
    const daysLeft = Math.ceil((deadline - today)/86400000);

    const months = Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===month?'selected':''}>${new Date(2000,i).toLocaleString('en',{month:'long'})}</option>`).join('');
    const years  = Array.from({length:3},(_,i)=>{const y=2025+i;return `<option value="${y}" ${y===year?'selected':''}>${y}</option>`;}).join('');
    const monthLabel = new Date(year, month-1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});

    wrap.innerHTML = `
      <div style="max-width:860px;">
      <div class="card mb-4" style="padding:10px 16px;">
        <div class="week-nav">
          <select class="form-input" id="rp-month" style="width:130px">${months}</select>
          <select class="form-input" id="rp-year" style="width:90px">${years}</select>
          <button class="btn btn-primary btn-sm" id="rp-load">Load</button>
          <span style="margin-left:auto;font-size:var(--font-sm);color:var(--text-muted);font-weight:600;white-space:nowrap">${_fmt(fromDate)} – ${_fmt(toDate)}</span>
        </div>
      </div>

      <div class="card mb-4" style="${overdue?'background:rgba(239,68,68,0.12);border-left:4px solid var(--danger)':daysLeft<=2?'background:rgba(239,68,68,0.08);border-left:4px solid var(--danger)':daysLeft<=5?'border-left:4px solid var(--warning)':'border-left:4px solid var(--primary)'};padding:14px 16px">
        <strong>Top-up request &amp; expense report deadline — ${monthLabel}</strong><br>
        <span class="text-muted" style="font-size:13px">Due <strong>${dStr}</strong> (the 14th, or last workday before if weekend/holiday). Send the summary ~09:30 that morning. Pay date: 16th.${overdue?`<span style="color:var(--danger);font-weight:600"> — OVERDUE! Submit immediately.</span>`:daysLeft<=2?`<span style="color:var(--danger);font-weight:600"> — ${daysLeft} day${daysLeft===1?'':'s'} left! Urgent.</span>`:` ${daysLeft} day${daysLeft===1?'':'s'} left.`}</span>
      </div>

      <div class="card mb-4" style="display:flex;gap:24px;flex-wrap:wrap;padding:16px;align-items:flex-start">
        <div><div class="text-muted" style="font-size:12px">OPENING</div><div style="font-size:18px;font-weight:600">${_money(opening)}</div></div>
        <div><div class="text-muted" style="font-size:12px">TOP-UPS</div><div style="font-size:18px;font-weight:600">${_money(totalIn)}</div></div>
        <div><div class="text-muted" style="font-size:12px">EXPENSES</div><div style="font-size:18px;font-weight:600">${_money(totalOut)}</div></div>
        <div><div class="text-muted" style="font-size:12px">CLOSING</div><div style="font-size:18px;font-weight:600;color:${closing<0?'var(--danger)':'var(--color-success,#66bb6a)'}">${_money(closing)}</div></div>
        <div style="border-left:1px solid var(--border-color,#333);margin:0 4px;align-self:stretch"></div>
        <div>
          <div class="text-muted" style="font-size:12px">SUGGESTED TOP-UP</div>
          <div style="font-size:18px;font-weight:600;color:var(--primary,#7c6af7)">${_money(suggestedTopup)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${closing < 0 ? `฿${Math.abs(closing).toLocaleString('en',{minimumFractionDigits:2})} deficit + ฿${S.monthlyTopup.toLocaleString('en',{minimumFractionDigits:2})} regular` : `Regular monthly (due 16th)`}</div>
        </div>
      </div>

      <div class="section-header">Expenses by Project</div>
      ${_kvTable(byProject)}

      <div class="section-header mt-4">Expenses by Person</div>
      ${_kvTable(byPerson)}

      ${(() => {
        // Advances to reimburse: approved personal-category expenses paid out-of-pocket by employees.
        // These are reimbursed with salary (not via petty cash float).
        const PERSONAL_CATS = new Set(['Import Tax', 'Shipping & Handling', 'Travel Expense', 'Other']);
        const advByPerson = {};
        for (const t of approved.filter(t => t.direction === 'out' && PERSONAL_CATS.has(t.category?.name))) {
          const nk = t.employee?.full_name || 'Unknown';
          if (!advByPerson[nk]) advByPerson[nk] = [];
          advByPerson[nk].push(t);
        }
        const entries = Object.entries(advByPerson);
        if (!entries.length) return `<div class="section-header mt-4">Advances to Reimburse with Salary</div><p class="empty-state">No advance payments this month.</p>`;
        return `<div class="section-header mt-4">Advances to Reimburse with Salary</div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
          ${entries.map(([name, txns]) => {
            const total = txns.reduce((s,t) => s + Number(t.amount), 0);
            return `<div class="card" style="padding:12px 16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <strong>${esc(name)}</strong>
                <span style="font-weight:600;color:var(--color-success,#66bb6a)">${_money(total)}</span>
              </div>
              <table style="font-size:13px;width:100%;border-collapse:collapse;">
                ${txns.map(t=>`<tr style="border-top:1px solid var(--border-color,#333);">
                  <td style="padding:4px 6px;color:var(--text-secondary)">${_fmt(t.txn_date)}</td>
                  <td style="padding:4px 6px">${esc(t.category?.name||'—')}</td>
                  <td style="padding:4px 6px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.note||'—')}</td>
                  <td style="padding:4px 6px;text-align:right;font-weight:500">${_money(t.amount,t.currency)}</td>
                </tr>`).join('')}
              </table>
            </div>`;
          }).join('')}
          </div>`;
      })()}

      <div class="card mt-4" style="padding:16px;font-size:13px;color:var(--text-secondary)">
        <strong>Summary template:</strong><br>
        The total amount of monthly expenses for ${monthLabel} is <strong>${_money(totalOut)}</strong> (THB).<br>
        Top-ups received: ${_money(totalIn)}. Opening balance ${_money(opening)} → closing ${_money(closing)}.<br>
        ${closing < 0
          ? `⚠️ Suggested top-up: <strong>${_money(suggestedTopup)}</strong> (${_money(Math.abs(closing))} deficit + ${_money(S.monthlyTopup)} regular).`
          : `Regular top-up due 16th: <strong>${_money(S.monthlyTopup)}</strong>.`}
      </div>
      </div>`;

    document.getElementById('rp-load').addEventListener('click', () => {
      month = parseInt(document.getElementById('rp-month').value);
      year  = parseInt(document.getElementById('rp-year').value);
      load();
    });
  }
  load();
}

function _kvTable(obj) {
  const entries = Object.entries(obj).sort((a,b)=>b[1]-a[1]);
  if (entries.length === 0) return `<p class="empty-state">No expenses.</p>`;
  const total = entries.reduce((s,[,v])=>s+v,0);
  return `<div class="table-wrapper"><table class="data-table"><tbody>
    ${entries.map(([k,v])=>`<tr><td>${esc(k)}</td><td style="text-align:right">${_money(v)}</td></tr>`).join('')}
    <tr style="font-weight:600;border-top:2px solid var(--border-color)"><td>Total</td><td style="text-align:right">${_money(total)}</td></tr>
  </tbody></table></div>`;
}

async function _renderWeeklyReport() {
  const wrap = document.getElementById('rp-body');
  wrap.innerHTML = `<div class="page-loading">Loading…</div>`;

  // Default = the most recently completed week (prior Mon–Sun).
  const monday = new Date(_nextMonday()); monday.setDate(monday.getDate() - 7); // this week's Monday
  let wkStart = new Date(monday); wkStart.setDate(monday.getDate() - 7); // prior Monday

  async function load() {
    wrap.innerHTML = `<div class="page-loading">Loading…</div>`;
    const wkEnd   = new Date(wkStart); wkEnd.setDate(wkEnd.getDate() + 6); // always Mon+6 = Sun
    const fromStr = toISODate(wkStart);
    const toStr   = toISODate(wkEnd);

    // PT/outsource employees
    const { data: ptEmployees } = await supabase
      .from('employees')
      .select('id, full_name, employee_id, employment_type_code, user_id')
      .in('employment_type_code', ['2','3'])
      .eq('status', 'active');

    // Logged timesheet hours for the week, per user per day — converted to half-day
    // sessions (4h ≈ 1 session, max 2/day). Wage = sessions × (pt_daily_rate / 2).
    // NOTE: time_entries has no per-entry approval status in the base schema, so this sums
    // LOGGED hours. Approval-gating depends on M1 weekly timesheet submission (not yet built).
    const _sessionsForHours = h => Math.min(2, Math.round((h || 0) / 4)); // 0/1/2 per day — tunable
    const userIds = (ptEmployees || []).map(e => e.user_id).filter(Boolean);
    let hoursByUser = {}, sessionsByUser = {};
    let missing = [];
    if (userIds.length) {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('user_id, total_hours, date')
        .in('user_id', userIds)
        .gte('date', fromStr)
        .lte('date', toStr);
      const dayHours = {};   // `${user_id}|${date}` → hours
      for (const e of entries || []) {
        hoursByUser[e.user_id] = (hoursByUser[e.user_id] || 0) + Number(e.total_hours || 0);
        const k = `${e.user_id}|${e.date}`;
        dayHours[k] = (dayHours[k] || 0) + Number(e.total_hours || 0);
      }
      for (const [k, h] of Object.entries(dayHours)) {
        const uid = k.split('|')[0];
        sessionsByUser[uid] = (sessionsByUser[uid] || 0) + _sessionsForHours(h);
      }
    }

    // Expenses logged by these employees in the week
    const empIds = (ptEmployees || []).map(e => e.id);
    let expByEmp = {};
    if (empIds.length) {
      const txns = await getAllTransactions({ direction:'out', fromDate: fromStr, toDate: toStr }).catch(()=>[]);
      for (const t of txns.filter(t => empIds.includes(t.employee_id) && t.status === 'approved')) {
        expByEmp[t.employee_id] = (expByEmp[t.employee_id] || 0) + Number(t.amount);
      }
    }

    const wkNum = _isoWeek(wkStart);
    const yr = wkStart.getFullYear();
    // Payout day for the DISPLAYED week = the Monday right after its Sunday.
    const payday = new Date(wkEnd); payday.setDate(payday.getDate() + 1);
    const dStr = payday.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});

    const sessionRate = S.ptDailyRate / 2;
    const weekTag = `Wk${wkNum}/${yr}`;
    const wageRows = (ptEmployees || []).map(e => {
      const hrs = hoursByUser[e.user_id];
      const hasTs = e.user_id && hoursByUser[e.user_id] !== undefined;
      if (!hasTs) missing.push(e.full_name);
      const sessions = sessionsByUser[e.user_id] || 0;
      return { emp: e, hasTs, hrs: hrs || 0, sessions, wage: sessions * sessionRate };
    });

    const rows = wageRows.map(({ emp: e, hasTs, hrs, sessions, wage }) => `<tr>
        <td>${esc(e.full_name)} <span class="text-muted">(${e.employment_type_code==='2'?'PT':'Contract'})</span></td>
        <td>${hasTs ? sessions : '—'}</td>
        <td>${hasTs ? (hrs.toFixed(1)+' h') : '<span style="color:var(--warning)">no timesheet</span>'}</td>
        <td style="font-weight:600">${hasTs ? _money(wage) : '—'}</td>
        <td>${_money(expByEmp[e.id] || 0)}</td>
      </tr>`).join('');
    const totalWage = wageRows.reduce((s, r) => s + r.wage, 0);

    wrap.innerHTML = `
      <div style="max-width:860px;">
      <div class="card mb-4" style="padding:10px 16px;">${weekNavHtml('wr', wkStart)}</div>

      <div class="card mb-4" style="border-left:4px solid var(--primary);padding:14px 16px">
        <strong>Weekly wage summary — pay Monday</strong><br>
        <span class="text-muted" style="font-size:13px">Send first thing Monday morning. Payout for this week: <strong>${dStr}</strong>. Covers Wk#${wkNum}/${yr} half-day sessions × ฿${sessionRate.toLocaleString('en',{minimumFractionDigits:2})}.</span>
      </div>

      ${missing.length ? `<div class="card mb-4" style="border-left:4px solid var(--warning);padding:12px 16px;font-size:13px">
        ⚠️ ${missing.length} worker(s) have no timesheet entries this week: ${esc(missing.join(', '))}. Wage figures are incomplete until their timesheets are submitted &amp; approved.</div>` : ''}

      <div class="section-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        Part-time / Outsource — Week ${wkNum}/${yr}
        ${wageRows.some(r => r.wage > 0) ? `<button class="btn btn-primary btn-sm" id="wr-post-wages" style="margin-left:auto">Post Wages to Ledger</button>` : ''}
      </div>
      ${(ptEmployees||[]).length === 0 ? `<p class="empty-state">No active part-time or outsource employees.</p>` : `
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Worker</th><th>Sessions (½-days)</th><th>Logged Hours</th><th>Wage</th><th>Expenses (wk)</th></tr></thead>
        <tbody>${rows}
        <tr style="font-weight:600;border-top:2px solid var(--border-color)"><td>Total</td><td></td><td></td><td>${_money(totalWage)}</td><td></td></tr>
        </tbody></table></div>
      <p class="text-muted" style="font-size:12px;margin-top:8px">Day rate ฿${S.ptDailyRate.toLocaleString('en',{minimumFractionDigits:2})} = morning + afternoon sessions; half-day session = ฿${sessionRate.toLocaleString('en',{minimumFractionDigits:2})} (4h ≈ 1 session, max 2/day). Wage payouts are logged under "Engineering Assistant Wage" in the petty-cash ledger. <em>Hours shown are logged entries; per-entry timesheet approval is an M1 enhancement.</em></p>`}
      </div>
    `;

    document.getElementById('wr-post-wages')?.addEventListener('click', () =>
      _openPostWagesModal(wageRows.filter(r => r.wage > 0), weekTag, toStr, load));
    wireWeekNav('wr', () => wkStart, d => { wkStart = d; }, load);
  }
  load();
}

// Review-and-confirm modal for posting weekly PT wages to the ledger (amounts editable).
async function _openPostWagesModal(wageRows, weekTag, txnDate, reload) {
  // Double-post guard: warn (don't block) if wage lines already carry this week's tag.
  const existing = await getWagePostings(weekTag).catch(() => []);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span>Post Wages — ${esc(weekTag)}</span>
        <button class="btn btn-ghost btn-sm" id="pw-close">✕</button>
      </div>
      <div class="modal-body">
        ${existing.length ? `<div class="card mb-4" style="border-left:4px solid var(--warning);padding:10px 14px;font-size:13px">
          ⚠️ ${existing.length} wage line(s) for ${esc(weekTag)} already exist in the ledger
          (${existing.map(t => esc(t.employee?.full_name || '—')).join(', ')}). Confirm only if this posting is intentional.</div>` : ''}
        <p class="text-muted" style="font-size:13px;margin-bottom:12px">Review the computed wages — amounts are editable. Lines post as approved "Engineering Assistant Wage" expenses (project: Hubble Engineering Office), dated ${_fmt(txnDate)}.</p>
        <table class="data-table" style="width:100%">
          <thead><tr><th>Worker</th><th>Sessions</th><th style="width:140px">Amount (฿)</th></tr></thead>
          <tbody>${wageRows.map((r, i) => `<tr>
            <td>${esc(r.emp.full_name)}</td>
            <td>${r.sessions}</td>
            <td><input type="number" class="form-control pw-amt" data-i="${i}" value="${r.wage}" min="0" step="0.01" style="width:120px"></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="pw-cancel">Cancel</button>
        <button class="btn btn-primary" id="pw-confirm">Post to Ledger</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('#pw-close').addEventListener('click', close);
  backdrop.querySelector('#pw-cancel').addEventListener('click', close);

  backdrop.querySelector('#pw-confirm').addEventListener('click', async () => {
    const btn = backdrop.querySelector('#pw-confirm'); btn.disabled = true;
    try {
      const wageCatId = S.categories.find(c => c.name === 'Engineering Assistant Wage')?.id;
      if (!wageCatId) throw new Error('Category "Engineering Assistant Wage" not found.');
      const entries = wageRows.map((r, i) => ({
        employeeId: r.emp.id,
        amount:     parseFloat(backdrop.querySelector(`.pw-amt[data-i="${i}"]`).value) || 0,
        txnDate,
        categoryId: wageCatId,
        projectId:  _officeProjectId() || null,
        note:       `Wage ${weekTag} — ${r.sessions} session${r.sessions !== 1 ? 's' : ''}`,
      }));
      const posted = await postWages(entries, S.profile?.id);
      window.showToast?.(`Posted ${posted.length} wage line${posted.length !== 1 ? 's' : ''} to the ledger.`, 'success');
      close();
      reload();
    } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
  });
}

export async function renderReport() { await _renderReport(); }
