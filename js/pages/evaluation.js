// js/pages/evaluation.js — Employee Evaluation (M5)
// Core 3-stage workflow: self-assessment → manager review → admin publishes final rating.

import { isAdmin, isManager } from '../auth.js';
import { supabase }           from '../config.js';
import { getEmployees }       from '../api/employees.js';
import { esc, attr }          from '../format.js';
import {
  getCycles, createCycle, updateCycle, setCycleStatus,
  getQuestions, getVisibleEvaluations,
  getResponses, saveResponses,
  submitSelf, submitManagerReview, publishEvaluation, reopenEvaluation,
  assignEvaluations, getEvaluationKpis,
} from '../api/evaluations.js';

// ── Constants ─────────────────────────────────────────────────

// EN before TH everywhere (house rule, user-confirmed 2026-06-10)
const RATING_LABELS = {
  1: 'Needs Improvement / ต้องปรับปรุง',
  2: 'Fair / พอใช้',
  3: 'Satisfactory / ดี',
  4: 'Very Good / ดีมาก',
  5: 'Excellent / ดีเยี่ยม',
};

const SECTION_LABELS = {
  achievements:         'Section 1 — Achievements and Accomplishments / ผลงานและความสำเร็จ',
  // Work + Interpersonal are both sub-groups of the survey's Section 2 — number shown once
  skills_work:          'Section 2 — Self-Assessment of Skills / การประเมินทักษะตนเอง — Work Skills',
  skills_interpersonal: 'Interpersonal Skills / ทักษะการทำงานร่วมกับผู้อื่น',
  development:          'Section 3 — Personal Development / การพัฒนาตนเอง',
  feedback:             'Section 4 — Feedback and Suggestions / ความคิดเห็นและข้อเสนอแนะ',
  summary:              'Section 5 — Assessment Summary / สรุปการประเมิน',
  manager_review:       'Manager Review / ความเห็นหัวหน้างาน',
};

const SECTION_ORDER = ['achievements', 'skills_work', 'skills_interpersonal', 'development', 'feedback', 'summary'];

const STATUS_LABELS = {
  self_pending:      'Self-assessment due',
  self_submitted:    'Manager review due',
  manager_submitted: 'Awaiting final rating',
  published:         'Published',
};

const STATUS_BADGE = {
  self_pending:      'badge badge-pending',
  self_submitted:    'badge badge-pending',
  manager_submitted: 'badge badge-pending',
  published:         'badge badge-approved',
};

const CYCLE_TYPE_LABELS = { annual: 'Annual', probation: 'Probation', custom: 'Custom' };

// ── Module state ──────────────────────────────────────────────

let _profile   = null;
let _admin     = false;
let _manager   = false;
let _canReview = false;        // admin || manager
let _myEmp     = null;         // employees row matching current user

let _mainTab   = 'mine';       // 'mine' | 'team' | 'manage'
let _manageTab = 'cycles';     // 'cycles' | 'assignments'
let _asgCycleId = null;        // selected cycle on the Assignments sub-tab

let _questions = [];
let _evals     = [];
let _cycles    = [];
let _employees = [];

// ── Helpers ───────────────────────────────────────────────────

const _fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function _saveTabState() {
  sessionStorage.setItem('eval_tab_state', JSON.stringify({ mainTab: _mainTab, manageTab: _manageTab }));
}

function _yearsOfService(startDate) {
  if (!startDate) return '—';
  const s = new Date(startDate + 'T00:00:00');
  const now = new Date();
  let months = (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth());
  if (now.getDate() < s.getDate()) months -= 1;
  if (months < 0) months = 0;
  const y = Math.floor(months / 12), m = months % 12;
  return `${y} Year${y === 1 ? '' : 's'}, ${m} Month${m === 1 ? '' : 's'}`;
}

function _stars(n) {
  return n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—';
}

function _isMine(ev) {
  return !!_myEmp && ev.employee_id === _myEmp.id;
}

// Build a lookup of responses keyed by `${question_id}:${role}`
function _respMap(responses) {
  const map = {};
  for (const r of responses) map[`${r.question_id}:${r.respondent_role}`] = r;
  return map;
}

// House modal pattern: backdrop + modal, closes on ✕ / Cancel / Esc (not backdrop click).
function _openModal(id, innerHtml, { wide = false } = {}) {
  document.getElementById(id)?.remove();
  const modal = document.createElement('div');
  modal.id = id;
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="modal${wide ? ' modal-lg' : ''}">${innerHtml}</div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal._escClose = close;
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { modal, close };
}

// ── Entry point ───────────────────────────────────────────────

export async function render(profile) {
  _profile   = profile;
  _admin     = isAdmin();
  _manager   = isManager();
  _canReview = _admin || _manager;

  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('eval_tab_state') || '{}'); } catch { return {}; } })();
  _mainTab   = saved.mainTab   || 'mine';
  _manageTab = saved.manageTab || 'cycles';
  if (_mainTab === 'team'   && !_canReview) _mainTab = 'mine';
  if (_mainTab === 'manage' && !_admin)     _mainTab = 'mine';

  document.getElementById('topbar-left').innerHTML = `<span class="topbar-title">Evaluation</span>`;
  document.getElementById('content').innerHTML = `
    <div class="empty-state"><div class="empty-state-title">Loading…</div></div>`;

  try {
    const loads = [getQuestions(), getVisibleEvaluations()];
    if (_admin) loads.push(getCycles(), getEmployees());
    const [questions, evals, cycles, employees] = await Promise.all(loads);
    _questions = questions;
    _evals     = evals;
    _cycles    = cycles    || [];
    _employees = employees || [];

    const { data: myEmpData } = await supabase
      .from('employees')
      .select('id, full_name, employee_id, job_title, department_code, start_date')
      .eq('user_id', profile.id)
      .maybeSingle();
    _myEmp = myEmpData || null;
  } catch (err) {
    console.warn('[evaluation] initial load failed', err);
    document.getElementById('content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Evaluation module unavailable</div>
        <div class="empty-state-sub">${esc(err.message || '')}<br>
        If this is a fresh deployment, apply <code>supabase/migrations/20260625_evaluation_m5.sql</code> in Supabase Studio and run <code>NOTIFY pgrst, 'reload schema';</code></div>
      </div>`;
    return;
  }

  _renderShell();
}

// ── Shell + tabs ──────────────────────────────────────────────

function _renderShell() {
  document.getElementById('content').innerHTML = `
    <div class="tabs" id="ev-main-tabs" style="margin-bottom:0;">
      <button class="tab-btn" data-main="mine">MY EVALUATION</button>
      ${_canReview ? `<button class="tab-btn" data-main="team">TEAM REVIEW<span class="badge badge-pending" id="ev-team-badge" style="margin-left:4px;display:none;"></span></button>` : ''}
      ${_admin ? `<button class="tab-btn" data-main="manage">MANAGE</button>` : ''}
    </div>
    <div id="ev-content" style="padding:24px 0 0;"></div>
  `;

  document.querySelectorAll('#ev-main-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.main === _mainTab);
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ev-main-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _mainTab = btn.dataset.main;
      _saveTabState();
      _renderTab();
    });
  });

  _syncTeamTabBadge();
  _renderTab();
}

function _syncTeamTabBadge() {
  const badge = document.getElementById('ev-team-badge');
  if (!badge) return;
  const n = _evals.filter(ev => !_isMine(ev) && ev.status === 'self_submitted').length;
  badge.textContent = n;
  badge.style.display = n > 0 ? '' : 'none';
}

async function _reloadEvals() {
  try {
    _evals = await getVisibleEvaluations();
  } catch (err) {
    window.showToast?.(err.message, 'error');
  }
  _syncTeamTabBadge();
  window.refreshEvaluationBadge?.();
}

function _renderTab() {
  const wrap = document.getElementById('ev-content');
  if (_mainTab === 'team'   && _canReview) return _renderTeam(wrap);
  if (_mainTab === 'manage' && _admin)     return _renderManage(wrap);
  return _renderMine(wrap);
}

// ══════════════════════════════════════════════════════════════
// MY EVALUATION
// ══════════════════════════════════════════════════════════════

function _renderMine(wrap) {
  if (!_myEmp) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No employee record linked</div>
        <div class="empty-state-sub">Ask an admin to link your account on the Employees page.</div>
      </div>`;
    return;
  }

  const mine = _evals.filter(_isMine);
  if (!mine.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No evaluations assigned</div>
        <div class="empty-state-sub">When an evaluation cycle is opened for you it will appear here.</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;max-width:860px;">
      ${mine.map(ev => `
        <div class="card" style="display:flex;align-items:center;gap:16px;justify-content:space-between;padding:16px;">
          <div>
            <div style="font-weight:600;">${esc(ev.cycle?.name || 'Evaluation')}
              <span class="badge" style="margin-left:6px;">${esc(CYCLE_TYPE_LABELS[ev.cycle?.cycle_type] || ev.cycle?.cycle_type || '')}</span>
            </div>
            <div style="color:var(--text-secondary);font-size:13px;margin-top:4px;">
              Period ${_fmt(ev.cycle?.period_start)} – ${_fmt(ev.cycle?.period_end)}
              ${ev.cycle?.response_deadline ? ` · Respond by ${_fmt(ev.cycle.response_deadline)}` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;white-space:nowrap;">
            ${ev.status === 'published' ? `<span title="${attr(RATING_LABELS[ev.final_rating] || '')}" style="color:var(--warning);letter-spacing:2px;">${_stars(ev.final_rating)}</span>` : ''}
            <span class="${STATUS_BADGE[ev.status]}">${STATUS_LABELS[ev.status]}</span>
            <button class="btn ${['self_pending', 'self_submitted'].includes(ev.status) ? 'btn-primary' : 'btn-ghost'} ev-open-mine" data-id="${attr(ev.id)}">
              ${ev.status === 'self_pending' ? 'Start' : ev.status === 'self_submitted' ? 'Edit' : 'View'}
            </button>
          </div>
        </div>`).join('')}
    </div>`;

  wrap.querySelectorAll('.ev-open-mine').forEach(b =>
    b.addEventListener('click', () => {
      const ev = _evals.find(x => x.id === b.dataset.id);
      if (ev) _renderMyForm(wrap, ev);
    }));
}

// KPI panel (shared between self form and review form)
async function _kpiPanelHtml(employeeId, cycle) {
  try {
    const k = await getEvaluationKpis(employeeId, cycle.period_start, cycle.period_end);
    if (!k) return '';
    const projects = Array.isArray(k.project_hours) ? k.project_hours : [];
    return `
      <div class="card" style="padding:16px;margin-bottom:16px;">
        <div style="font-weight:600;margin-bottom:10px;">Timesheet KPIs · ${_fmt(cycle.period_start)} – ${_fmt(cycle.period_end)}
          <span style="color:var(--text-secondary);font-weight:400;font-size:12px;">(auto-calculated from logged hours · read-only)</span>
        </div>
        <div style="display:flex;gap:24px;flex-wrap:wrap;">
          <div><div style="font-size:20px;font-weight:600;">${esc(String(k.attendance_rate ?? 0))}%</div><div style="color:var(--text-secondary);font-size:12px;">Attendance (${esc(String(k.days_with_entries ?? 0))}/${esc(String(k.working_days ?? 0))} days)</div></div>
          <div><div style="font-size:20px;font-weight:600;">${esc(String(k.total_hours ?? 0))}</div><div style="color:var(--text-secondary);font-size:12px;">Total hours</div></div>
          <div><div style="font-size:20px;font-weight:600;">${esc(String(k.billable_hours ?? 0))}</div><div style="color:var(--text-secondary);font-size:12px;">Billable hours</div></div>
          <div><div style="font-size:20px;font-weight:600;">${esc(String(k.utilization_rate ?? 0))}%</div><div style="color:var(--text-secondary);font-size:12px;">Utilization</div></div>
        </div>
        ${projects.length ? `
          <table class="table" style="margin-top:12px;font-size:13px;">
            <thead><tr><th>Project contribution</th><th style="text-align:right;">Hours</th><th style="text-align:right;">%</th></tr></thead>
            <tbody>${projects.map(p => `
              <tr><td>${esc(p.project_name)}</td>
                  <td style="text-align:right;">${esc(String(p.hours))}</td>
                  <td style="text-align:right;">${esc(String(p.pct))}%</td></tr>`).join('')}
            </tbody>
          </table>` : ''}
      </div>`;
  } catch (err) {
    console.warn('[evaluation] KPI fetch failed', err);
    return `<div class="card" style="padding:12px;margin-bottom:16px;color:var(--text-secondary);">Timesheet KPIs unavailable (${esc(err.message || 'error')})</div>`;
  }
}

function _personalHeaderHtml(emp) {
  return `
    <div class="card" style="padding:16px;margin-bottom:16px;display:flex;gap:32px;flex-wrap:wrap;">
      <div><div style="color:var(--text-secondary);font-size:12px;">Employee</div><div style="font-weight:600;">${esc(emp?.full_name || '—')}</div></div>
      <div><div style="color:var(--text-secondary);font-size:12px;">Employee ID</div><div>${esc(emp?.employee_id || '—')}</div></div>
      <div><div style="color:var(--text-secondary);font-size:12px;">Job Title</div><div>${esc(emp?.job_title || '—')}</div></div>
      <div><div style="color:var(--text-secondary);font-size:12px;">Department</div><div>${esc(emp?.department_code || '—')}</div></div>
      <div><div style="color:var(--text-secondary);font-size:12px;">Years of Service</div><div>${esc(_yearsOfService(emp?.start_date))}</div></div>
    </div>`;
}

function _scaleLegendHtml() {
  return `
    <div style="color:var(--text-secondary);font-size:12px;margin-bottom:16px;">
      Rating scale: ${[1, 2, 3, 4, 5].map(n => `<strong>${n}</strong> = ${esc(RATING_LABELS[n])}`).join(' · ')}
    </div>`;
}

// One 1–5 rating row. Editable → radios; read-only → highlighted chip on the picked value.
function _ratingInputHtml(q, role, value, disabled) {
  if (disabled) {
    // Description before the scores (user request): "Excellent · 1 2 3 4 [5]"
    return `
      <div style="display:flex;align-items:center;gap:4px;white-space:nowrap;">
        ${value ? `<span style="color:var(--text-secondary);font-size:12px;margin-right:8px;">${esc(RATING_LABELS[value].split(' / ')[0])}</span>` : ''}
        ${[1, 2, 3, 4, 5].map(n => n === value
          ? `<span title="${attr(RATING_LABELS[n])}" style="background:var(--accent);color:#fff;font-weight:600;border-radius:4px;padding:2px 9px;">${n}</span>`
          : `<span style="color:var(--text-muted);padding:2px 7px;">${n}</span>`).join('')}
      </div>`;
  }
  return `
    <div style="display:flex;align-items:center;gap:4px;white-space:nowrap;">
      ${[1, 2, 3, 4, 5].map(n => `
        <label title="${attr(RATING_LABELS[n])}" style="display:inline-flex;align-items:center;gap:2px;cursor:pointer;padding:2px 6px;">
          <input type="radio" name="evr_${attr(q.id)}_${attr(role)}" value="${n}"
                 ${value === n ? 'checked' : ''}> ${n}
        </label>`).join('')}
    </div>`;
}

// Read-only display of a free-text answer — readable panel instead of muted inline text.
function _answerHtml(text) {
  if (!text) return `<div style="color:var(--text-muted);">—</div>`;
  return `<div style="white-space:pre-wrap;color:var(--text-primary);background:var(--surface-2);border-left:3px solid var(--accent);border-radius:6px;padding:8px 12px;margin-top:4px;">${esc(text)}</div>`;
}

function _qLabelHtml(q) {
  return `<div style="margin-bottom:4px;">${esc(q.label_en)}<div style="color:var(--text-secondary);font-size:12px;">${esc(q.label_th)}</div></div>`;
}

// ── Self-assessment form ──────────────────────────────────────

async function _renderMyForm(wrap, ev) {
  wrap.innerHTML = `<div class="empty-state"><div class="empty-state-title">Loading…</div></div>`;

  let responses = [];
  try { responses = await getResponses(ev.id); }
  catch (err) { window.showToast?.(err.message, 'error'); }
  const rmap = _respMap(responses);

  const kpiHtml = await _kpiPanelHtml(ev.employee_id, ev.cycle);
  // Employee may edit until the manager submits the review (RLS mirrors this, 20260625c)
  const firstSubmit = ev.status === 'self_pending';
  const editable = firstSubmit || ev.status === 'self_submitted';
  const published = ev.status === 'published';

  // Mark published result as seen (clears the NEW notification in the nav badge)
  if (published) {
    try { localStorage.setItem(`eval_seen_${ev.id}`, '1'); } catch { /* ignore */ }
    window.refreshEvaluationBadge?.();
  }

  const sectionsHtml = SECTION_ORDER.map(sec => {
    const qs = _questions.filter(q => q.section === sec && (q.asked_of === 'self' || q.asked_of === 'both'));
    if (!qs.length) return '';
    return `
      <div class="card" style="padding:16px;margin-bottom:16px;">
        <div style="font-weight:600;margin-bottom:12px;">${esc(SECTION_LABELS[sec])}</div>
        ${qs.map(q => {
          const self = rmap[`${q.id}:self`];
          const mgr  = rmap[`${q.id}:manager`];
          if (q.kind === 'rating') {
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:6px 0;border-bottom:1px solid var(--border-color);">
                ${_qLabelHtml(q)}
                <div style="display:flex;align-items:center;gap:16px;">
                  ${published && q.asked_of === 'both' ? `
                    <span style="color:var(--text-secondary);font-size:12px;">Self</span>
                    <span style="letter-spacing:1px;">${_stars(self?.rating)}</span>
                    <span style="color:var(--text-secondary);font-size:12px;">Manager</span>
                    <span style="letter-spacing:1px;color:var(--warning);">${_stars(mgr?.rating)}</span>`
                  : _ratingInputHtml(q, 'self', self?.rating, !editable)}
                </div>
              </div>`;
          }
          return `
            <div style="padding:8px 0;">
              ${_qLabelHtml(q)}
              ${editable
                ? `<textarea class="form-input ev-self-text" data-qid="${attr(q.id)}" rows="3" style="width:100%;resize:vertical;">${esc(self?.answer || '')}</textarea>`
                : _answerHtml(self?.answer)}
            </div>`;
        }).join('')}
      </div>`;
  }).join('');

  // Published extras: manager comments + final rating banner
  let publishedHtml = '';
  if (published) {
    const mgrQs = _questions.filter(q => q.section === 'manager_review');
    publishedHtml = `
      <div class="card" style="padding:16px;margin-bottom:16px;">
        <div style="font-weight:600;margin-bottom:12px;">${esc(SECTION_LABELS.manager_review)}</div>
        ${mgrQs.map(q => `
          <div style="padding:8px 0;">
            ${_qLabelHtml(q)}
            ${_answerHtml(rmap[`${q.id}:manager`]?.answer)}
          </div>`).join('')}
      </div>
      <div class="card" style="padding:16px;margin-bottom:16px;border-left:3px solid var(--success);">
        <div style="font-weight:600;">Final Rating: <span style="color:var(--warning);letter-spacing:2px;">${_stars(ev.final_rating)}</span>
          <span style="margin-left:8px;">${esc(RATING_LABELS[ev.final_rating] || '')}</span>
        </div>
        ${ev.final_note ? `<div style="margin-top:8px;white-space:pre-wrap;color:var(--text-primary);">${esc(ev.final_note)}</div>` : ''}
        <div style="margin-top:8px;color:var(--text-secondary);font-size:12px;">Published ${_fmt(ev.published_at?.slice(0, 10))}</div>
      </div>`;
  }

  wrap.innerHTML = `
    <div style="max-width:860px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <button class="btn btn-ghost" id="ev-back-mine">← Back</button>
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="${STATUS_BADGE[ev.status]}">${STATUS_LABELS[ev.status]}</span>
        </div>
      </div>
      <h2 style="margin:0 0 12px;">${esc(ev.cycle?.name || 'Evaluation')} — Self-Assessment</h2>
      <p style="color:var(--text-secondary);font-size:13px;margin:0 0 16px;max-width:720px;">
        This survey aims to help you review and evaluate your work performance over the past year.
        Please answer honestly for the benefit of your personal development and the organization.<br>
        แบบสำรวจนี้มีวัตถุประสงค์เพื่อให้คุณได้ทบทวนและประเมินผลการทำงานของตนเองในรอบปีที่ผ่านมา
        โปรดตอบคำถามตามความเป็นจริงเพื่อประโยชน์ในการพัฒนาตนเองและองค์กร
      </p>
      ${_personalHeaderHtml(ev.employee || _myEmp)}
      ${kpiHtml}
      ${_scaleLegendHtml()}
      ${sectionsHtml}
      ${publishedHtml}
      ${editable ? `
        <div style="display:flex;gap:12px;justify-content:flex-end;align-items:center;margin-bottom:32px;">
          ${firstSubmit ? `
            <button class="btn btn-ghost" id="ev-save-draft">Save Draft</button>
            <button class="btn btn-primary" id="ev-submit-self">Submit Self-Assessment</button>`
          : `
            <span style="color:var(--text-secondary);font-size:12px;">Submitted — you can still edit until your manager submits the review.</span>
            <button class="btn btn-primary" id="ev-save-draft">Save Changes</button>`}
        </div>` : ''}
    </div>`;

  document.getElementById('ev-back-mine')?.addEventListener('click', () => _renderMine(wrap));

  if (!editable) return;

  const collect = () => {
    const items = [];
    for (const q of _questions) {
      if (q.section === 'manager_review') continue;
      if (q.asked_of !== 'self' && q.asked_of !== 'both') continue;
      if (q.kind === 'rating') {
        const checked = wrap.querySelector(`input[name="evr_${q.id}_self"]:checked`);
        if (checked) items.push({ questionId: q.id, rating: Number(checked.value) });
      } else {
        const ta = wrap.querySelector(`.ev-self-text[data-qid="${q.id}"]`);
        const val = (ta?.value || '').trim();
        if (val) items.push({ questionId: q.id, answer: val });
      }
    }
    return items;
  };

  document.getElementById('ev-save-draft')?.addEventListener('click', async () => {
    try {
      await saveResponses(ev.id, 'self', collect());
      window.showToast?.(firstSubmit ? 'Draft saved' : 'Changes saved', 'success');
    } catch (err) { window.showToast?.(err.message, 'error'); }
  });

  document.getElementById('ev-submit-self')?.addEventListener('click', async () => {
    const items = collect();
    const required = _questions.filter(q => q.section !== 'manager_review' && (q.asked_of === 'self' || q.asked_of === 'both'));
    const answered = new Set(items.map(i => i.questionId));
    const missing = required.filter(q => !answered.has(q.id));
    if (missing.length) {
      window.showToast?.(`${missing.length} question${missing.length === 1 ? '' : 's'} unanswered — please complete all fields`, 'error');
      return;
    }
    const { close } = _openModal('ev-confirm-modal', `
      <div class="modal-header"><span class="modal-title">Submit Self-Assessment</span><button class="modal-close" data-close>&times;</button></div>
      <div class="modal-body">After submitting, your answers are locked and sent to your manager for review.</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary" id="ev-confirm-submit">Submit</button>
      </div>`);
    document.getElementById('ev-confirm-submit')?.addEventListener('click', async () => {
      try {
        await saveResponses(ev.id, 'self', items);
        await submitSelf(ev.id);
        close();
        window.showToast?.('Self-assessment submitted', 'success');
        await _reloadEvals();
        _renderMine(document.getElementById('ev-content'));
      } catch (err) { window.showToast?.(err.message, 'error'); }
    });
  });
}

// ══════════════════════════════════════════════════════════════
// TEAM REVIEW (manager / admin)
// ══════════════════════════════════════════════════════════════

function _renderTeam(wrap) {
  const team = _evals.filter(ev => !_isMine(ev));
  if (!team.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No team evaluations</div>
        <div class="empty-state-sub">Evaluations for your team will appear here once a cycle is opened.</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div style="max-width:1000px;">
      <table class="table">
        <thead><tr><th>Employee</th><th>Cycle</th><th>Status</th><th>Self-submitted</th><th></th></tr></thead>
        <tbody>
          ${team.map(ev => `
            <tr>
              <td>${esc(ev.employee?.full_name || '—')} <span style="color:var(--text-secondary);font-size:12px;">${esc(ev.employee?.employee_id || '')}</span></td>
              <td>${esc(ev.cycle?.name || '—')}</td>
              <td><span class="${STATUS_BADGE[ev.status]}">${STATUS_LABELS[ev.status]}</span></td>
              <td>${ev.self_submitted_at ? _fmt(ev.self_submitted_at.slice(0, 10)) : '—'}</td>
              <td class="table-actions">
                ${ev.status === 'self_pending'
                  ? `<span style="color:var(--text-secondary);font-size:12px;">Waiting for self-assessment</span>`
                  : `<button class="btn ${ev.status === 'self_submitted' ? 'btn-primary' : 'btn-ghost'} ev-open-review" data-id="${attr(ev.id)}">${ev.status === 'self_submitted' ? 'Review' : 'View'}</button>`}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  wrap.querySelectorAll('.ev-open-review').forEach(b =>
    b.addEventListener('click', () => {
      const ev = _evals.find(x => x.id === b.dataset.id);
      if (ev) _renderReviewForm(wrap, ev, () => _renderTeam(wrap));
    }));
}

// Manager review form (also used as read-only view from MANAGE)
async function _renderReviewForm(wrap, ev, onBack) {
  wrap.innerHTML = `<div class="empty-state"><div class="empty-state-title">Loading…</div></div>`;

  let responses = [];
  try { responses = await getResponses(ev.id); }
  catch (err) { window.showToast?.(err.message, 'error'); }
  const rmap = _respMap(responses);

  const kpiHtml = await _kpiPanelHtml(ev.employee_id, ev.cycle);
  const editable = ev.status === 'self_submitted';

  // Dual-scored rating rows: self (read-only) vs manager (input)
  const ratingSections = ['skills_work', 'skills_interpersonal', 'summary'].map(sec => {
    const qs = _questions.filter(q => q.section === sec && q.kind === 'rating' && q.asked_of === 'both');
    if (!qs.length) return '';
    return `
      <div class="card" style="padding:16px;margin-bottom:16px;">
        <div style="font-weight:600;margin-bottom:12px;">${esc(SECTION_LABELS[sec])}</div>
        <table class="table" style="font-size:13px;">
          <thead><tr><th>Skill</th><th style="white-space:nowrap;">Self rating</th><th style="white-space:nowrap;">Manager rating</th></tr></thead>
          <tbody>
            ${qs.map(q => {
              const self = rmap[`${q.id}:self`];
              const mgr  = rmap[`${q.id}:manager`];
              return `
                <tr>
                  <td>${_qLabelHtml(q)}</td>
                  <td style="letter-spacing:1px;white-space:nowrap;">${_stars(self?.rating)}</td>
                  <td>${editable ? _ratingInputHtml(q, 'manager', mgr?.rating, false)
                                 : `<span style="letter-spacing:1px;color:var(--warning);">${_stars(mgr?.rating)}</span>`}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }).join('');

  // Employee's text answers (read-only)
  const selfTextHtml = SECTION_ORDER.map(sec => {
    const qs = _questions.filter(q => q.section === sec && q.kind === 'text' && q.asked_of === 'self');
    if (!qs.length) return '';
    return `
      <div class="card" style="padding:16px;margin-bottom:16px;">
        <div style="font-weight:600;margin-bottom:12px;">${esc(SECTION_LABELS[sec])} <span style="color:var(--text-secondary);font-weight:400;font-size:12px;">(employee's answers)</span></div>
        ${qs.map(q => `
          <div style="padding:8px 0;">
            ${_qLabelHtml(q)}
            ${_answerHtml(rmap[`${q.id}:self`]?.answer)}
          </div>`).join('')}
      </div>`;
  }).join('');

  // Manager comment paragraphs
  const mgrQs = _questions.filter(q => q.section === 'manager_review');
  const mgrCommentsHtml = `
    <div class="card" style="padding:16px;margin-bottom:16px;">
      <div style="font-weight:600;margin-bottom:12px;">${esc(SECTION_LABELS.manager_review)}</div>
      ${mgrQs.map(q => {
        const mgr = rmap[`${q.id}:manager`];
        return `
          <div style="padding:8px 0;">
            ${_qLabelHtml(q)}
            ${editable
              ? `<textarea class="form-input ev-mgr-text" data-qid="${attr(q.id)}" rows="3" style="width:100%;resize:vertical;">${esc(mgr?.answer || '')}</textarea>`
              : _answerHtml(mgr?.answer)}
          </div>`;
      }).join('')}
    </div>`;

  wrap.innerHTML = `
    <div style="max-width:860px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <button class="btn btn-ghost" id="ev-back-review">← Back</button>
        <span class="${STATUS_BADGE[ev.status]}">${STATUS_LABELS[ev.status]}</span>
      </div>
      <h2 style="margin:0 0 12px;">${esc(ev.cycle?.name || 'Evaluation')} — Manager Review · ${esc(ev.employee?.full_name || '')}</h2>
      ${_personalHeaderHtml(ev.employee)}
      ${kpiHtml}
      ${_scaleLegendHtml()}
      ${ratingSections}
      ${selfTextHtml}
      ${mgrCommentsHtml}
      ${ev.status === 'published' ? `
        <div class="card" style="padding:16px;margin-bottom:16px;border-left:3px solid var(--success);">
          <div style="font-weight:600;">Final Rating: <span style="color:var(--warning);letter-spacing:2px;">${_stars(ev.final_rating)}</span>
            <span style="margin-left:8px;">${esc(RATING_LABELS[ev.final_rating] || '')}</span></div>
          ${ev.final_note ? `<div style="margin-top:8px;white-space:pre-wrap;color:var(--text-primary);">${esc(ev.final_note)}</div>` : ''}
        </div>` : ''}
      ${editable ? `
        <div style="display:flex;gap:12px;justify-content:flex-end;margin-bottom:32px;">
          <button class="btn btn-ghost" id="ev-mgr-save-draft">Save Draft</button>
          <button class="btn btn-primary" id="ev-mgr-submit">Submit Review</button>
        </div>` : ''}
    </div>`;

  document.getElementById('ev-back-review')?.addEventListener('click', onBack);

  if (!editable) return;

  const collect = () => {
    const items = [];
    for (const q of _questions) {
      if (q.kind === 'rating' && q.asked_of === 'both') {
        const checked = wrap.querySelector(`input[name="evr_${q.id}_manager"]:checked`);
        if (checked) items.push({ questionId: q.id, rating: Number(checked.value) });
      } else if (q.section === 'manager_review') {
        const ta = wrap.querySelector(`.ev-mgr-text[data-qid="${q.id}"]`);
        const val = (ta?.value || '').trim();
        if (val) items.push({ questionId: q.id, answer: val });
      }
    }
    return items;
  };

  document.getElementById('ev-mgr-save-draft')?.addEventListener('click', async () => {
    try {
      await saveResponses(ev.id, 'manager', collect());
      window.showToast?.('Draft saved', 'success');
    } catch (err) { window.showToast?.(err.message, 'error'); }
  });

  document.getElementById('ev-mgr-submit')?.addEventListener('click', async () => {
    const items = collect();
    const ratingQs = _questions.filter(q => q.kind === 'rating' && q.asked_of === 'both');
    const rated = new Set(items.filter(i => i.rating).map(i => i.questionId));
    const missing = ratingQs.filter(q => !rated.has(q.id));
    if (missing.length) {
      window.showToast?.(`${missing.length} rating${missing.length === 1 ? '' : 's'} missing — please score every skill`, 'error');
      return;
    }
    const { close } = _openModal('ev-confirm-modal', `
      <div class="modal-header"><span class="modal-title">Submit Manager Review</span><button class="modal-close" data-close>&times;</button></div>
      <div class="modal-body">After submitting, the review is locked and sent to admin for the final rating.</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary" id="ev-confirm-submit">Submit</button>
      </div>`);
    document.getElementById('ev-confirm-submit')?.addEventListener('click', async () => {
      try {
        await saveResponses(ev.id, 'manager', items);
        await submitManagerReview(ev.id);
        close();
        window.showToast?.('Manager review submitted', 'success');
        await _reloadEvals();
        onBack();
      } catch (err) { window.showToast?.(err.message, 'error'); }
    });
  });
}

// ══════════════════════════════════════════════════════════════
// MANAGE (admin)
// ══════════════════════════════════════════════════════════════

function _renderManage(wrap) {
  wrap.innerHTML = `
    <div class="tabs" id="ev-manage-tabs" style="margin-bottom:16px;">
      <button class="tab-btn" data-sub="cycles">CYCLES</button>
      <button class="tab-btn" data-sub="assignments">ASSIGNMENTS</button>
    </div>
    <div id="ev-manage-content"></div>`;

  document.querySelectorAll('#ev-manage-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sub === _manageTab);
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ev-manage-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _manageTab = btn.dataset.sub;
      _saveTabState();
      _renderManageTab();
    });
  });

  _renderManageTab();
}

function _renderManageTab() {
  const wrap = document.getElementById('ev-manage-content');
  if (_manageTab === 'assignments') return _renderAssignments(wrap);
  return _renderCycles(wrap);
}

// ── Cycles CRUD ───────────────────────────────────────────────

function _renderCycles(wrap) {
  wrap.innerHTML = `
    <div style="max-width:1000px;">
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
        <button class="btn btn-primary" id="ev-new-cycle">+ New Cycle</button>
      </div>
      ${_cycles.length ? `
        <table class="table">
          <thead><tr><th>Name</th><th>Type</th><th>KPI Period</th><th>Deadline</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${_cycles.map(c => `
              <tr>
                <td>${esc(c.name)}</td>
                <td>${esc(CYCLE_TYPE_LABELS[c.cycle_type] || c.cycle_type)}</td>
                <td>${_fmt(c.period_start)} – ${_fmt(c.period_end)}</td>
                <td>${_fmt(c.response_deadline)}</td>
                <td><span class="badge ${c.status === 'open' ? 'badge-approved' : ''}">${esc(c.status)}</span></td>
                <td class="table-actions">
                  <button class="btn btn-ghost ev-edit-cycle" data-id="${attr(c.id)}">Edit</button>
                  <button class="btn btn-ghost ev-toggle-cycle" data-id="${attr(c.id)}">${c.status === 'open' ? 'Close' : 'Reopen'}</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>` : `
        <div class="empty-state">
          <div class="empty-state-title">No evaluation cycles yet</div>
          <div class="empty-state-sub">Create a cycle, then assign employees on the ASSIGNMENTS tab.</div>
        </div>`}
    </div>`;

  document.getElementById('ev-new-cycle')?.addEventListener('click', () => _openCycleModal(null));
  wrap.querySelectorAll('.ev-edit-cycle').forEach(b =>
    b.addEventListener('click', () => _openCycleModal(_cycles.find(c => c.id === b.dataset.id))));
  wrap.querySelectorAll('.ev-toggle-cycle').forEach(b =>
    b.addEventListener('click', async () => {
      const c = _cycles.find(x => x.id === b.dataset.id);
      if (!c) return;
      try {
        await setCycleStatus(c.id, c.status === 'open' ? 'closed' : 'open');
        _cycles = await getCycles();
        window.showToast?.(`Cycle ${c.status === 'open' ? 'closed' : 'reopened'}`, 'success');
        _renderCycles(wrap);
      } catch (err) { window.showToast?.(err.message, 'error'); }
    }));
}

function _openCycleModal(cycle) {
  const isEdit = !!cycle;
  const year = new Date().getFullYear();
  // Company policy (2026-06-10): evaluations run twice a year —
  // H1 Mid-Year (KPI Jan–Jun, respond by 30 Jun) and H2 Year-End (KPI Jul–Dec, respond by 31 Dec).
  const PRESETS = {
    h1: { name: `Mid-Year Review ${year}`,  start: `${year}-01-01`, end: `${year}-06-30`, deadline: `${year}-06-30` },
    h2: { name: `Year-End Review ${year}`, start: `${year}-07-01`, end: `${year}-12-31`, deadline: `${year}-12-31` },
  };
  const defPreset = new Date().getMonth() < 6 ? PRESETS.h1 : PRESETS.h2;
  const { close } = _openModal('ev-cycle-modal', `
    <div class="modal-header"><span class="modal-title">${isEdit ? 'Edit Cycle' : 'New Evaluation Cycle'}</span><button class="modal-close" data-close>&times;</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
      ${isEdit ? '' : `
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="color:var(--text-secondary);font-size:12px;">Preset:</span>
        <button class="btn btn-ghost evc-preset-btn" id="evc-preset-h1" type="button">H1 · Mid-Year (Jan–Jun)</button>
        <button class="btn btn-ghost evc-preset-btn" id="evc-preset-h2" type="button">H2 · Year-End (Jul–Dec)</button>
      </div>`}
      <label class="form-label">Name *
        <input class="form-input" type="text" id="evc-name" value="${attr(cycle?.name || defPreset.name)}">
      </label>
      <label class="form-label">Type
        <select class="form-input" id="evc-type">
          ${['annual', 'probation', 'custom'].map(t => `<option value="${t}" ${cycle?.cycle_type === t ? 'selected' : ''}>${CYCLE_TYPE_LABELS[t]}</option>`).join('')}
        </select>
      </label>
      <div style="display:flex;gap:12px;">
        <label class="form-label" style="flex:1;">KPI period start *
          <input class="form-input" type="date" id="evc-start" value="${attr(cycle?.period_start || defPreset.start)}">
        </label>
        <label class="form-label" style="flex:1;">KPI period end *
          <input class="form-input" type="date" id="evc-end" value="${attr(cycle?.period_end || defPreset.end)}">
        </label>
      </div>
      <label class="form-label">Response deadline (optional)
        <input class="form-input" type="date" id="evc-deadline" value="${attr(isEdit ? (cycle.response_deadline || '') : defPreset.deadline)}">
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary" id="evc-save">${isEdit ? 'Save Changes' : 'Create Cycle'}</button>
    </div>`);

  const updatePresetSelection = preset => {
    document.querySelectorAll('.evc-preset-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`evc-preset-${preset}`)?.classList.add('active');
  };

  const applyPreset = (p, preset) => {
    document.getElementById('evc-name').value     = p.name;
    document.getElementById('evc-start').value    = p.start;
    document.getElementById('evc-end').value      = p.end;
    document.getElementById('evc-deadline').value = p.deadline;
    updatePresetSelection(preset);
  };

  // Set initial active preset
  if (!isEdit) {
    updatePresetSelection(defPreset === PRESETS.h1 ? 'h1' : 'h2');
  }

  document.getElementById('evc-preset-h1')?.addEventListener('click', () => applyPreset(PRESETS.h1, 'h1'));
  document.getElementById('evc-preset-h2')?.addEventListener('click', () => applyPreset(PRESETS.h2, 'h2'));

  document.getElementById('evc-save')?.addEventListener('click', async () => {
    const name  = document.getElementById('evc-name').value.trim();
    const type  = document.getElementById('evc-type').value;
    const start = document.getElementById('evc-start').value;
    const end   = document.getElementById('evc-end').value;
    const dl    = document.getElementById('evc-deadline').value;
    try {
      if (!name)         throw new Error('Please enter a cycle name.');
      if (!start || !end) throw new Error('Please set the KPI period.');
      if (end < start)   throw new Error('Period end must be after period start.');
      if (isEdit) {
        await updateCycle(cycle.id, { name, cycle_type: type, period_start: start, period_end: end, response_deadline: dl || null });
      } else {
        await createCycle({ name, cycleType: type, periodStart: start, periodEnd: end, responseDeadline: dl });
      }
      _cycles = await getCycles();
      close();
      window.showToast?.(isEdit ? 'Cycle updated' : 'Cycle created', 'success');
      _renderManageTab();
    } catch (err) { window.showToast?.(err.message, 'error'); }
  });
}

// ── Assignments + Publish ─────────────────────────────────────

function _renderAssignments(wrap) {
  if (!_cycles.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No cycles yet</div>
        <div class="empty-state-sub">Create a cycle on the CYCLES tab first.</div>
      </div>`;
    return;
  }
  if (!_asgCycleId || !_cycles.some(c => c.id === _asgCycleId)) _asgCycleId = _cycles[0].id;

  const rows = _evals.filter(ev => ev.cycle_id === _asgCycleId);

  wrap.innerHTML = `
    <div style="max-width:1000px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <select class="form-input" id="ev-asg-cycle" style="max-width:320px;">
          ${_cycles.map(c => `<option value="${attr(c.id)}" ${c.id === _asgCycleId ? 'selected' : ''}>${esc(c.name)} (${esc(c.status)})</option>`).join('')}
        </select>
        <span style="flex:1;"></span>
        <button class="btn btn-primary" id="ev-assign-btn">+ Assign Employees</button>
      </div>
      ${rows.length ? `
        <table class="table">
          <thead><tr><th>Employee</th><th>Manager</th><th>Status</th><th>Self</th><th>Manager</th><th>Final</th><th></th></tr></thead>
          <tbody>
            ${rows.map(ev => `
              <tr>
                <td>${esc(ev.employee?.full_name || '—')} <span style="color:var(--text-secondary);font-size:12px;">${esc(ev.employee?.employee_id || '')}</span></td>
                <td>${esc(ev.manager?.full_name || '—')}</td>
                <td><span class="${STATUS_BADGE[ev.status]}">${STATUS_LABELS[ev.status]}</span></td>
                <td>${ev.self_submitted_at ? _fmt(ev.self_submitted_at.slice(0, 10)) : '—'}</td>
                <td>${ev.manager_submitted_at ? _fmt(ev.manager_submitted_at.slice(0, 10)) : '—'}</td>
                <td style="letter-spacing:1px;color:var(--warning);white-space:nowrap;">${ev.status === 'published' ? _stars(ev.final_rating) : '—'}</td>
                <td class="table-actions">
                  <button class="btn btn-ghost ev-view-eval" data-id="${attr(ev.id)}">View</button>
                  ${ev.status === 'manager_submitted' ? `<button class="btn btn-primary ev-publish" data-id="${attr(ev.id)}">Publish</button>` : ''}
                  ${ev.status !== 'self_pending' ? `<button class="btn btn-ghost ev-reopen" data-id="${attr(ev.id)}">Reopen</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>` : `
        <div class="empty-state">
          <div class="empty-state-title">No evaluations in this cycle</div>
          <div class="empty-state-sub">Use "+ Assign Employees" to create them.</div>
        </div>`}
    </div>`;

  document.getElementById('ev-asg-cycle')?.addEventListener('change', e => {
    _asgCycleId = e.target.value;
    _renderAssignments(wrap);
  });

  document.getElementById('ev-assign-btn')?.addEventListener('click', () => _openAssignModal());

  wrap.querySelectorAll('.ev-view-eval').forEach(b =>
    b.addEventListener('click', () => {
      const ev = _evals.find(x => x.id === b.dataset.id);
      if (ev) _renderReviewForm(document.getElementById('ev-manage-content'), ev, () => _renderAssignments(document.getElementById('ev-manage-content')));
    }));

  wrap.querySelectorAll('.ev-publish').forEach(b =>
    b.addEventListener('click', () => {
      const ev = _evals.find(x => x.id === b.dataset.id);
      if (ev) _openPublishModal(ev);
    }));

  wrap.querySelectorAll('.ev-reopen').forEach(b =>
    b.addEventListener('click', () => {
      const ev = _evals.find(x => x.id === b.dataset.id);
      if (ev) _openReopenModal(ev);
    }));
}

function _openAssignModal() {
  const assigned = new Set(_evals.filter(ev => ev.cycle_id === _asgCycleId).map(ev => ev.employee_id));
  const candidates = _employees.filter(e => e.status === 'active' && !assigned.has(e.id));

  const { close } = _openModal('ev-assign-modal', `
    <div class="modal-header"><span class="modal-title">Assign Employees</span><button class="modal-close" data-close>&times;</button></div>
    <div class="modal-body">
      ${candidates.length ? `
        <label style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-color);font-weight:600;">
          <input type="checkbox" id="ev-asg-all"> Select all (${candidates.length})
        </label>
        <div style="max-height:320px;overflow-y:auto;">
          ${candidates.map(e => `
            <label style="display:flex;align-items:center;gap:8px;padding:6px 0;">
              <input type="checkbox" class="ev-asg-emp" value="${attr(e.id)}">
              ${esc(e.full_name)} <span style="color:var(--text-secondary);font-size:12px;">${esc(e.employee_id || '')} · ${esc(e.job_title || '')}</span>
            </label>`).join('')}
        </div>` : `<div style="color:var(--text-secondary);">All active employees are already assigned to this cycle.</div>`}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Cancel</button>
      ${candidates.length ? `<button class="btn btn-primary" id="ev-asg-confirm">Assign</button>` : ''}
    </div>`);

  document.getElementById('ev-asg-all')?.addEventListener('change', e => {
    document.querySelectorAll('.ev-asg-emp').forEach(cb => { cb.checked = e.target.checked; });
  });

  document.getElementById('ev-asg-confirm')?.addEventListener('click', async () => {
    const ids = [...document.querySelectorAll('.ev-asg-emp:checked')].map(cb => cb.value);
    if (!ids.length) { window.showToast?.('Select at least one employee', 'error'); return; }
    try {
      const n = await assignEvaluations(_asgCycleId, ids);
      close();
      window.showToast?.(`${n} evaluation${n === 1 ? '' : 's'} created`, 'success');
      await _reloadEvals();
      _renderAssignments(document.getElementById('ev-manage-content'));
    } catch (err) { window.showToast?.(err.message, 'error'); }
  });
}

async function _openPublishModal(ev) {
  // Pull responses for the self-vs-manager summary
  let responses = [];
  try { responses = await getResponses(ev.id); }
  catch (err) { window.showToast?.(err.message, 'error'); }
  const rmap = _respMap(responses);

  const ratingQs = _questions.filter(q => q.kind === 'rating' && q.asked_of === 'both');
  const avg = role => {
    const vals = ratingQs.map(q => rmap[`${q.id}:${role}`]?.rating).filter(Boolean);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
  };
  const mgrOverall = rmap[`${ratingQs.find(q => q.code === 's5_overall')?.id}:manager`]?.rating;

  const { close } = _openModal('ev-publish-modal', `
    <div class="modal-header"><span class="modal-title">Publish Final Rating · ${esc(ev.employee?.full_name || '')}</span><button class="modal-close" data-close>&times;</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
      <table class="table" style="font-size:13px;">
        <thead><tr><th></th><th>Self</th><th>Manager</th></tr></thead>
        <tbody>
          <tr><td>Average skill rating</td><td>${esc(avg('self'))}</td><td>${esc(avg('manager'))}</td></tr>
          ${ratingQs.filter(q => q.code === 's5_overall').map(q => `
            <tr><td>Overall rating</td>
                <td style="letter-spacing:1px;">${_stars(rmap[`${q.id}:self`]?.rating)}</td>
                <td style="letter-spacing:1px;color:var(--warning);">${_stars(rmap[`${q.id}:manager`]?.rating)}</td></tr>`).join('')}
        </tbody>
      </table>
      <label class="form-label">Final rating *
        <select class="form-input" id="ev-pub-rating">
          <option value="">Select…</option>
          ${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${mgrOverall === n ? 'selected' : ''}>${n} — ${esc(RATING_LABELS[n])}</option>`).join('')}
        </select>
      </label>
      <label class="form-label">Note to employee (optional)
        <textarea class="form-input" id="ev-pub-note" rows="3" style="resize:vertical;"></textarea>
      </label>
      <div style="color:var(--text-secondary);font-size:12px;">Publishing reveals the manager review and final rating to the employee.</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary" id="ev-pub-confirm">Publish</button>
    </div>`);

  document.getElementById('ev-pub-confirm')?.addEventListener('click', async () => {
    const rating = Number(document.getElementById('ev-pub-rating').value);
    const note   = document.getElementById('ev-pub-note').value.trim();
    if (!rating) { window.showToast?.('Please select the final rating', 'error'); return; }
    try {
      await publishEvaluation(ev.id, rating, note, _profile.id);
      close();
      window.showToast?.('Evaluation published', 'success');
      await _reloadEvals();
      _renderAssignments(document.getElementById('ev-manage-content'));
    } catch (err) { window.showToast?.(err.message, 'error'); }
  });
}

function _openReopenModal(ev) {
  const options = [
    ['self_pending', 'Self-assessment (employee edits again)'],
    ['self_submitted', 'Manager review (manager edits again)'],
    ['manager_submitted', 'Awaiting final rating'],
  ].filter(([s]) => s !== ev.status);

  const { close } = _openModal('ev-reopen-modal', `
    <div class="modal-header"><span class="modal-title">Reopen Evaluation · ${esc(ev.employee?.full_name || '')}</span><button class="modal-close" data-close>&times;</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
      <div style="color:var(--text-secondary);font-size:13px;">Current status: <span class="${STATUS_BADGE[ev.status]}">${STATUS_LABELS[ev.status]}</span></div>
      <label class="form-label">Reopen to stage
        <select class="form-input" id="ev-reopen-status">
          ${options.map(([s, l]) => `<option value="${s}">${esc(l)}</option>`).join('')}
        </select>
      </label>
      ${ev.status === 'published' ? `<div style="color:var(--warning);font-size:12px;">⚠ Reopening a published evaluation clears the final rating.</div>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-danger" id="ev-reopen-confirm">Reopen</button>
    </div>`);

  document.getElementById('ev-reopen-confirm')?.addEventListener('click', async () => {
    try {
      await reopenEvaluation(ev.id, document.getElementById('ev-reopen-status').value);
      close();
      window.showToast?.('Evaluation reopened', 'success');
      await _reloadEvals();
      _renderAssignments(document.getElementById('ev-manage-content'));
    } catch (err) { window.showToast?.(err.message, 'error'); }
  });
}
