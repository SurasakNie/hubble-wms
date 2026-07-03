// js/pages/documents.js - Module M6: Automated Documentation

import { isAdmin, isManager } from '../auth.js';
import { supabase } from '../config.js';
import { getEmployees } from '../api/employees.js';
import { esc, attr, formatDate, todayISO, sanitizeHtml } from '../format.js';
import { empSelectHtml, wireEmpSelect } from '../components/empSelect.js';
import {
  DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENT_FIELD_LABELS, EMPLOYEE_REQUESTABLE_TYPES,
  getTemplates, getDocuments, getDocument,
  previewDocument, generateDocument, updateDocumentStatus,
  saveTemplate, setTemplateActive,
  getDocumentRequests, submitDocumentRequest, cancelDocumentRequest,
  rejectDocumentRequest, linkRequestToDocument, fulfillRequestsForDocument,
} from '../api/documents.js';

const STATUS_BADGE = {
  draft:     'badge',
  generated: 'badge badge-pending',
  sent:      'badge badge-pending',
  signed:    'badge badge-approved',
  archived:  'badge',
};

const STATUS_LABELS = {
  draft: 'Draft',
  generated: 'Generated',
  sent: 'Sent',
  signed: 'Signed',
  archived: 'Archived',
};

const TYPE_ICONS = {
  offer_letter:            'Offer',
  employment_contract:     'Contract',
  probation_confirmation:  'Probation',
  promotion_letter:        'Promotion',
  salary_adjustment:       'Salary',
  warning_letter:          'Warning',
  leave_balance_statement: 'Leave',
  timesheet_report:        'Timesheet',
  employment_certificate:  'Certificate',
};

let _profile = null;
let _admin = false;
let _manager = false;
let _canGenerate = false;
let _myEmp = null;

let _tab = 'mine';
let _templates = [];
let _documents = [];
let _employees = [];
let _eligibleEmployees = [];
let _requests = [];

let _selectedEmployeeId = null;
let _selectedTemplateId = null;
let _customFields = {};
let _prefillRequest = null;

export async function render(profile) {
  _profile = profile;
  _admin = isAdmin();
  _manager = isManager();
  _canGenerate = _admin || _manager;

  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('doc_tab_state') || '{}'); } catch { return {}; } })();
  _tab = saved.tab || 'mine';
  if (_tab === 'team' && !_canGenerate) _tab = 'mine';
  if (_tab === 'generate' && !_canGenerate) _tab = 'mine';
  if (_tab === 'templates' && !_canGenerate) _tab = 'mine';

  _ensureDocStyles();
  document.getElementById('topbar-left').innerHTML = `<span class="topbar-title">Documents</span>`;
  document.getElementById('content').innerHTML = `<div class="empty-state"><div class="empty-state-title">Loading...</div></div>`;

  try {
    await _loadData();
  } catch (err) {
    console.warn('[documents] initial load failed', err);
    document.getElementById('content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Documents module unavailable</div>
        <div class="empty-state-sub">${esc(err.message || '')}<br>
        If this is a fresh deployment, apply <code>supabase/migrations/20260626_document_templates.sql</code> in Supabase Studio and run <code>NOTIFY pgrst, 'reload schema';</code></div>
      </div>`;
    return;
  }

  _documents.filter(d => d.status === 'generated').forEach(d => localStorage.setItem(`doc_seen_${d.id}`, '1'));
  window.refreshDocumentsBadge?.();
  _renderShell();
}

async function _loadData() {
  const templatePromise = getTemplates({ activeOnly: !_canGenerate });
  const docPromise = getDocuments();
  const empPromise = _canGenerate ? getEmployees() : Promise.resolve([]);
  // Requests table ships in 20260628 — degrade to an empty list until the migration is applied.
  const requestPromise = getDocumentRequests().catch(err => {
    console.warn('[documents] request load failed (migration 20260628 applied?)', err);
    return [];
  });
  const myEmpPromise = supabase
    .from('employees')
    .select('id, full_name, employee_id, direct_manager_id')
    .eq('user_id', _profile.id)
    .maybeSingle();

  const [templates, docs, employees, requests, myEmpResult] = await Promise.all([templatePromise, docPromise, empPromise, requestPromise, myEmpPromise]);
  _templates = templates || [];
  _documents = docs || [];
  _employees = employees || [];
  _requests = requests || [];
  _myEmp = myEmpResult.data || null;
  _eligibleEmployees = _admin
    ? _employees
    : _employees.filter(e => _myEmp && e.direct_manager_id === _myEmp.id);
}

function _saveTabState() {
  sessionStorage.setItem('doc_tab_state', JSON.stringify({ tab: _tab }));
}

function _renderShell() {
  document.getElementById('content').innerHTML = `
    <div class="tabs" id="doc-tabs" style="margin-bottom:0;">
      <button class="tab-btn" data-tab="mine">MY DOCUMENTS</button>
      ${_canGenerate ? `<button class="tab-btn" data-tab="team">TEAM DOCUMENTS</button>` : ''}
      ${_canGenerate ? `<button class="tab-btn" data-tab="generate">GENERATE</button>` : ''}
      <button class="tab-btn" data-tab="requests">REQUESTS</button>
      ${_canGenerate ? `<button class="tab-btn" data-tab="templates">TEMPLATES</button>` : ''}
    </div>
    <div id="doc-content" style="padding:24px 0 0;"></div>
  `;

  document.querySelectorAll('#doc-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === _tab);
    btn.addEventListener('click', () => {
      _tab = btn.dataset.tab;
      _saveTabState();
      _renderShell();
    });
  });

  _renderTab();
}

function _renderTab() {
  const wrap = document.getElementById('doc-content');
  if (_tab === 'team' && _canGenerate) return _renderDocuments(wrap, 'team');
  if (_tab === 'generate' && _canGenerate) return _renderGenerate(wrap);
  if (_tab === 'requests') return _renderRequests(wrap);
  if (_tab === 'templates' && _canGenerate) return _renderTemplates(wrap);
  return _renderDocuments(wrap, 'mine');
}

function _renderDocuments(wrap, scope = 'mine') {
  const docs = _documentsForScope(scope);
  if (!docs.length) {
    const isTeam = scope === 'team';
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">${isTeam ? 'No team documents yet' : 'No documents yet'}</div>
        <div class="empty-state-sub">${isTeam ? 'Save a draft from the GENERATE tab.' : 'Issued documents will appear here.'}</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="doc-card-grid">
      ${docs.map(d => _docCard(d)).join('')}
    </div>
  `;
  wrap.querySelectorAll('.doc-view').forEach(btn => btn.addEventListener('click', () => _openDocumentModal(btn.dataset.id)));
  wrap.querySelectorAll('.doc-print').forEach(btn => btn.addEventListener('click', () => _openDocumentModal(btn.dataset.id, true)));
  wrap.querySelectorAll('.doc-status').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await updateDocumentStatus(btn.dataset.id, btn.dataset.status);
      window.showToast?.(btn.dataset.status === 'generated' ? 'Document generated' : 'Document status updated', 'success');
      if (btn.dataset.status === 'generated') {
        // Linked request (if any) flips to fulfilled now that the employee can see the document.
        try {
          await fulfillRequestsForDocument(btn.dataset.id, _profile);
          _requests = _requests.map(r => r.fulfilled_document_id === btn.dataset.id && r.status === 'pending'
            ? { ...r, status: 'fulfilled', reviewed_by: _profile?.id || null, reviewed_at: new Date().toISOString() }
            : r);
        } catch (reqErr) {
          console.warn('[documents] request fulfil failed', reqErr);
        }
      }
      await _reloadDocuments();
      _renderDocuments(wrap, scope);
    } catch (err) {
      window.showToast?.(err.message, 'error');
    }
  }));
}

function _documentsForScope(scope) {
  if (scope === 'team') {
    if (!_canGenerate) return [];
    if (_admin) return _myEmp ? _documents.filter(d => d.employee_id !== _myEmp.id) : _documents;
    const teamIds = new Set(_eligibleEmployees.map(e => e.id));
    return _documents.filter(d => teamIds.has(d.employee_id));
  }
  if (!_myEmp) return [];
  const docs = _documents.filter(d => d.employee_id === _myEmp.id);
  return _canGenerate ? docs : docs.filter(d => d.status !== 'draft');
}

// ── Tab: REQUESTS (Round 21) ──────────────────────────────────

const REQUEST_STATUS_BADGE = {
  pending:   'badge badge-pending',
  fulfilled: 'badge badge-approved',
  rejected:  'badge badge-rejected',
  cancelled: 'badge',
};

const REQUEST_STATUS_LABELS = {
  pending: 'Pending',
  fulfilled: 'Fulfilled',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

function _renderRequests(wrap) {
  const eligibleSet = new Set(_eligibleEmployees.map(e => e.id));
  // Approvals scope: admin sees every pending request; manager only direct reports'.
  // A manager's own request is excluded here — it escalates to admin (is_manager_of
  // never matches yourself, so gd_insert RLS would block self-fulfilment anyway).
  const actionable = _canGenerate
    ? _requests.filter(r => r.status === 'pending' && eligibleSet.has(r.employee_id))
    : [];
  const myRequests = _myEmp ? _requests.filter(r => r.employee_id === _myEmp.id) : [];
  const activeTemplates = _templates.filter(t => t.is_active);
  // Employees may only request the Employment Certificate; every other document
  // type is drafted/generated directly by admin/manager via the GENERATE tab.
  const requestableTemplates = activeTemplates.filter(t => EMPLOYEE_REQUESTABLE_TYPES.has(t.template_type));
  const myPendingTemplateIds = new Set(myRequests.filter(r => r.status === 'pending').map(r => r.template_id));

  wrap.innerHTML = `
    ${_canGenerate ? `
      <section class="doc-panel" style="margin-bottom:18px;">
        <h3 style="margin:0 0 12px;">Pending Requests${actionable.length ? ` (${actionable.length})` : ''}</h3>
        ${actionable.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Document</th><th>Note</th><th>Requested</th><th>Actions</th></tr></thead>
              <tbody>
                ${actionable.map(r => `
                  <tr>
                    <td>${esc(r.employee?.full_name || '')} ${r.employee?.employee_id ? `<span class="text-muted">(${esc(r.employee.employee_id)})</span>` : ''}</td>
                    <td>${esc(DOCUMENT_TYPE_LABELS[r.template_type] || r.template_type)}
                      ${r.template && !r.template.is_active ? `<div class="text-muted" style="font-size:11px;color:#fbbf24;">Template inactive — activate it in TEMPLATES first</div>` : ''}</td>
                    <td>${r.note ? esc(r.note) : '<span class="text-muted">—</span>'}</td>
                    <td>${esc(formatDate(r.created_at))}</td>
                    <td class="row-actions">
                      <button class="btn btn-primary btn-sm docreq-fulfill" data-id="${attr(r.id)}">Fulfill</button>
                      <button class="btn btn-danger btn-sm docreq-reject" data-id="${attr(r.id)}">Reject</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<p class="text-muted" style="margin:0;font-size:13px;">No pending document requests.</p>`}
      </section>
    ` : ''}

    <section class="doc-panel">
      <h3 style="margin:0 0 12px;">My Requests</h3>
      ${_myEmp ? (requestableTemplates.length ? `
        <div class="docreq-form" style="display:grid;gap:12px;max-width:520px;margin-bottom:18px;">
          <label class="form-label">Document type <span class="required">*</span>
            <select class="form-input" id="docreq-template">
              <option value="">Select…</option>
              ${requestableTemplates.map(t => `<option value="${attr(t.id)}" data-type="${attr(t.template_type)}">${esc(DOCUMENT_TYPE_LABELS[t.template_type] || t.name)}</option>`).join('')}
            </select>
            <div class="text-muted" style="font-size:11px;margin-top:4px;">Other document types are issued directly by HR / your manager.</div>
          </label>
          <label class="form-label">Note <span style="color:var(--text-secondary);font-weight:400">(optional)</span>
            <textarea class="form-input" id="docreq-note" rows="3" style="resize:vertical;" placeholder="Why do you need this document, or any details for HR…"></textarea>
          </label>
          <div><button class="btn btn-primary" id="docreq-submit">Submit Request</button></div>
        </div>
      ` : `
        <p class="text-muted" style="margin:0 0 18px;font-size:13px;">Document requests are currently unavailable — no requestable template is active. Contact HR / admin directly.</p>
      `) : `
        <div class="empty-state" style="padding:16px;">
          <div class="empty-state-title">No employee record linked</div>
          <div class="empty-state-sub">No employee record is linked to your account — ask an admin to link one before requesting documents.</div>
        </div>
      `}
      ${myRequests.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Document</th><th>Status</th><th>Requested</th><th>Decision</th><th></th></tr></thead>
            <tbody>
              ${myRequests.map(r => `
                <tr>
                  <td>${esc(DOCUMENT_TYPE_LABELS[r.template_type] || r.template_type)}
                    ${r.note ? `<div class="text-muted" style="font-size:11px;">${esc(r.note)}</div>` : ''}</td>
                  <td><span class="${REQUEST_STATUS_BADGE[r.status] || 'badge'}">${esc(REQUEST_STATUS_LABELS[r.status] || r.status)}</span></td>
                  <td>${esc(formatDate(r.created_at))}</td>
                  <td>${r.status === 'rejected' && r.review_note ? esc(r.review_note)
                       : r.status === 'fulfilled' ? `Issued ${esc(formatDate(r.reviewed_at || r.updated_at))} — see MY DOCUMENTS`
                       : '<span class="text-muted">—</span>'}</td>
                  <td class="row-actions">
                    ${r.status === 'pending' ? `<button class="btn btn-ghost btn-sm docreq-cancel" data-id="${attr(r.id)}">Cancel</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : (_myEmp ? `<p class="text-muted" style="margin:0;font-size:13px;">You have not requested any documents yet.</p>` : '')}
    </section>
  `;

  // Decisions are considered seen once the employee opens this tab.
  let sawDecision = false;
  myRequests.filter(r => ['fulfilled', 'rejected'].includes(r.status)).forEach(r => {
    if (localStorage.getItem(`docreq_seen_${r.id}`) !== '1') { localStorage.setItem(`docreq_seen_${r.id}`, '1'); sawDecision = true; }
  });
  if (sawDecision) window.refreshDocumentsBadge?.();

  // Submit
  wrap.querySelector('#docreq-submit')?.addEventListener('click', async () => {
    const sel = wrap.querySelector('#docreq-template');
    const templateId = sel?.value || '';
    if (!templateId) { window.showToast?.('Please select a document type.', 'error'); return; }
    if (myPendingTemplateIds.has(templateId)) {
      window.showToast?.('You already have a pending request for this document type.', 'error');
      return;
    }
    const templateType = sel.selectedOptions[0]?.dataset.type || '';
    const btn = wrap.querySelector('#docreq-submit');
    btn.disabled = true;
    try {
      const req = await submitDocumentRequest({
        employeeId: _myEmp.id,
        templateId,
        templateType,
        note: wrap.querySelector('#docreq-note')?.value || null,
        profile: _profile,
      });
      _requests = [req, ..._requests];
      window.showToast?.('Document request submitted', 'success');
      _renderRequests(wrap);
      window.refreshDocumentsBadge?.();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  });

  // Cancel own pending request
  wrap.querySelectorAll('.docreq-cancel').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const updated = await cancelDocumentRequest(btn.dataset.id);
      _requests = _requests.map(r => r.id === updated.id ? updated : r);
      window.showToast?.('Request cancelled', 'success');
      _renderRequests(wrap);
      window.refreshDocumentsBadge?.();
    } catch (err) {
      window.showToast?.(err.message, 'error');
      btn.disabled = false;
    }
  }));

  // Fulfill → jump to GENERATE prefilled
  wrap.querySelectorAll('.docreq-fulfill').forEach(btn => btn.addEventListener('click', () => {
    const r = _requests.find(x => x.id === btn.dataset.id);
    if (!r) return;
    if (!activeTemplates.some(t => t.id === r.template_id)) {
      window.showToast?.('Template is no longer active — activate it in TEMPLATES first.', 'error');
      return;
    }
    _prefillRequest = { id: r.id, employeeId: r.employee_id, templateId: r.template_id };
    _selectedEmployeeId = r.employee_id;
    _selectedTemplateId = r.template_id;
    _customFields = {};
    _tab = 'generate';
    _saveTabState();
    _renderShell();
  }));

  // Reject with optional reason
  wrap.querySelectorAll('.docreq-reject').forEach(btn => btn.addEventListener('click', () => {
    const r = _requests.find(x => x.id === btn.dataset.id);
    if (!r) return;
    _openDocReqRejectModal({
      contextLine: `${esc(r.employee?.full_name || 'Employee')} · ${esc(DOCUMENT_TYPE_LABELS[r.template_type] || r.template_type)} · ${esc(formatDate(r.created_at))}`,
      onConfirm: async reason => {
        const updated = await rejectDocumentRequest(r.id, reason, _profile);
        _requests = _requests.map(x => x.id === updated.id ? updated : x);
        window.showToast?.('Request rejected', 'success');
        _renderRequests(wrap);
        window.refreshDocumentsBadge?.();
      },
    });
  }));
}

function _openDocReqRejectModal({ contextLine, onConfirm }) {
  const existing = document.getElementById('docreq-rej-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'docreq-rej-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">Reject Request</div>
        <button class="modal-close" id="docreq-rej-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        ${contextLine ? `<p style="margin:0 0 12px;font-size:13px;color:var(--text-secondary);">${contextLine}</p>` : ''}
        <label class="form-label">Reason <span style="color:var(--text-secondary);font-weight:400">(optional)</span>
          <textarea class="form-input" id="docreq-rej-reason" rows="3" placeholder="Enter rejection reason…" style="resize:vertical"></textarea>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="docreq-rej-cancel">Cancel</button>
        <button class="btn btn-danger" id="docreq-rej-apply">Reject</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  document.getElementById('docreq-rej-close').addEventListener('click', close);
  document.getElementById('docreq-rej-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.getElementById('docreq-rej-apply').addEventListener('click', async () => {
    const applyBtn = document.getElementById('docreq-rej-apply');
    const reason = document.getElementById('docreq-rej-reason').value.trim();
    applyBtn.disabled = true;
    try { await onConfirm(reason); close(); }
    catch (err) { window.showToast?.(err.message, 'error'); applyBtn.disabled = false; }
  });
}

function _docCard(d) {
  const canUpdate = _canGenerate && d.status !== 'archived';
  const employee = d.employee?.full_name ? `<span>${esc(d.employee.full_name)} (${esc(d.employee.employee_id || '')})</span>` : '';
  const statusLabel = STATUS_LABELS[d.status] || d.status;
  return `
    <section class="doc-card">
      <div class="doc-card-head">
        <div>
          <div class="doc-type">${esc(DOCUMENT_TYPE_LABELS[d.template_type] || d.template_type)}</div>
          <h3>${esc(d.title || d.template?.name || 'Document')}</h3>
        </div>
        <span class="${STATUS_BADGE[d.status] || 'badge'}">${esc(statusLabel)}</span>
      </div>
      <div class="doc-meta">
        ${employee}
        <span>Created ${esc(formatDate(d.generated_at))}</span>
        ${d.generator?.name ? `<span>By ${esc(d.generator.name)}</span>` : ''}
      </div>
      ${d.note ? `<p class="doc-note">${esc(d.note)}</p>` : ''}
      <div class="doc-actions">
        <button class="btn btn-ghost btn-sm doc-view" data-id="${attr(d.id)}">View</button>
        <button class="btn btn-primary btn-sm doc-print" data-id="${attr(d.id)}">Print / Save PDF</button>
        ${canUpdate && d.status === 'draft' ? `<button class="btn btn-primary btn-sm doc-status" data-status="generated" data-id="${attr(d.id)}">Generate</button>` : ''}
        ${canUpdate && d.status === 'generated' ? `<button class="btn btn-ghost btn-sm doc-status" data-status="sent" data-id="${attr(d.id)}">Mark Sent</button>` : ''}
        ${canUpdate && d.status === 'sent' ? `<button class="btn btn-ghost btn-sm doc-status" data-status="signed" data-id="${attr(d.id)}">Mark Signed</button>` : ''}
        ${_admin && d.status !== 'archived' ? `<button class="btn btn-ghost btn-sm doc-status" data-status="archived" data-id="${attr(d.id)}">Archive</button>` : ''}
      </div>
    </section>
  `;
}

function _renderGenerate(wrap) {
  const activeTemplates = _templates.filter(t => t.is_active);
  const selectedTemplate = activeTemplates.find(t => t.id === _selectedTemplateId) || null;
  const selectedEmployee = _eligibleEmployees.find(e => e.id === _selectedEmployeeId) || null;

  const prefillEmp = _prefillRequest ? _employees.find(e => e.id === _prefillRequest.employeeId) : null;

  wrap.innerHTML = `
    ${_prefillRequest ? `
      <div class="doc-warning" role="status" style="margin:0 0 14px;">
        <strong>Fulfilling document request</strong>
        <span>From ${esc(prefillEmp?.full_name || 'employee')} — saving a draft links it to the request; the request is marked fulfilled when the document is generated.</span>
      </div>` : ''}
    <div class="doc-generate-grid">
      <section class="doc-panel">
        <h3>Employee</h3>
        ${_eligibleEmployees.length
          ? empSelectHtml('doc-gen', _eligibleEmployees, { selectedId: _selectedEmployeeId, placeholder: 'Type employee name or ID...' })
          : `<div class="empty-state" style="padding:16px;"><div class="empty-state-title">No eligible employees</div></div>`}

        <h3 style="margin-top:20px;">Template</h3>
        <div class="doc-template-grid">
          ${activeTemplates.map(t => `
            <button class="doc-template-card ${t.id === _selectedTemplateId ? 'active' : ''}" data-id="${attr(t.id)}">
              <span>${esc(TYPE_ICONS[t.template_type] || 'Doc')}</span>
              <strong>${esc(t.name)}</strong>
              <small>${esc(t.description || '')}</small>
              ${t.requires_signature ? `<em>Signature required</em>` : `<em>No signature</em>`}
            </button>
          `).join('')}
        </div>

        <div id="doc-custom-fields" style="margin-top:20px;">${_customFieldsHtml(selectedTemplate)}</div>
        <div id="doc-required-warning">${_requiredFieldWarningHtml(selectedTemplate, selectedEmployee)}</div>
        <div class="doc-actions" style="margin-top:20px;">
          <button class="btn btn-ghost" id="doc-preview" ${selectedEmployee && selectedTemplate ? '' : 'disabled'}>Preview</button>
          <button class="btn btn-primary" id="doc-generate" ${selectedEmployee && selectedTemplate ? '' : 'disabled'}>Save Draft</button>
        </div>
      </section>
      <section class="doc-panel">
        <div class="doc-preview-head">
          <h3>Preview</h3>
          <span>${selectedEmployee ? esc(selectedEmployee.full_name) : 'Select an employee'}${selectedTemplate ? ` - ${esc(selectedTemplate.name)}` : ''}</span>
        </div>
        <div class="doc-preview" id="doc-preview-pane">
          <div class="empty-state" style="padding:28px;"><div class="empty-state-title">Preview not built</div></div>
        </div>
      </section>
    </div>
  `;

  wireEmpSelect('doc-gen', _eligibleEmployees, emp => {
    _selectedEmployeeId = emp?.id || null;
    _renderGenerate(wrap);
  });

  wrap.querySelectorAll('.doc-template-card').forEach(btn => btn.addEventListener('click', () => {
    _selectedTemplateId = btn.dataset.id;
    _customFields = {};
    _renderGenerate(wrap);
  }));

  _wireCustomFields(wrap);
  wrap.querySelector('#doc-preview')?.addEventListener('click', () => _refreshPreview());
  wrap.querySelector('#doc-generate')?.addEventListener('click', async () => {
    try {
      const missing = _missingRequiredFromSelection(selectedTemplate, selectedEmployee);
      if (missing.length) {
        _updateRequiredWarning(wrap);
        window.showToast?.(_missingRequiredMessage(missing), 'error');
        return;
      }
      const doc = await generateDocument(_selectedEmployeeId, _selectedTemplateId, _customFields, _customFields.note || null, _profile);
      window.showToast?.('Document draft saved', 'success');
      _documents = [doc, ..._documents];
      if (_prefillRequest && _prefillRequest.employeeId === doc.employee_id && _prefillRequest.templateId === doc.template_id) {
        try {
          await linkRequestToDocument(_prefillRequest.id, doc.id);
          _requests = _requests.map(r => r.id === _prefillRequest.id ? { ...r, fulfilled_document_id: doc.id } : r);
        } catch (linkErr) {
          console.warn('[documents] request link failed', linkErr);
        }
      }
      _prefillRequest = null;
      _tab = _myEmp && doc.employee_id === _myEmp.id ? 'mine' : 'team';
      _saveTabState();
      _renderShell();
      window.refreshDocumentsBadge?.();
    } catch (err) {
      window.showToast?.(err.message, 'error');
    }
  });
}

function _customFieldsHtml(template) {
  if (!template) return '';
  const type = template.template_type;
  const month = _customFields.month || todayISO().slice(0, 7);
  return `
    ${type === 'promotion_letter' ? `
      <label class="form-label">New Job Title
        <input class="form-input doc-custom" type="text" data-key="new_job_title" value="${attr(_customFields.new_job_title || '')}">
      </label>` : ''}
    ${type === 'salary_adjustment' ? `
      <label class="form-label">Effective Date
        <input class="form-input doc-custom" type="date" data-key="effective_date" value="${attr(_customFields.effective_date || '')}" style="color-scheme:dark">
      </label>` : ''}
    ${type === 'timesheet_report' ? `
      <label class="form-label">Report Month
        <input class="form-input doc-custom" type="month" data-key="month" value="${attr(month)}" style="color-scheme:dark">
      </label>` : ''}
    <label class="form-label">Document Note / Custom Text
      <textarea class="form-input doc-custom" data-key="note" rows="4" style="resize:vertical;" placeholder="Optional text inserted into the template...">${esc(_customFields.note || '')}</textarea>
    </label>
  `;
}

function _wireCustomFields(wrap) {
  wrap.querySelectorAll('.doc-custom').forEach(input => {
    input.addEventListener('input', () => {
      _customFields[input.dataset.key] = input.value;
      _updateRequiredWarning(wrap);
    });
  });
}

async function _refreshPreview() {
  const pane = document.getElementById('doc-preview-pane');
  if (!pane || !_selectedEmployeeId || !_selectedTemplateId) return;
  pane.innerHTML = `<div class="empty-state" style="padding:28px;"><div class="empty-state-title">Building preview...</div></div>`;
  try {
    const { contentHtml, unresolved, requiredMissing } = await previewDocument(_selectedEmployeeId, _selectedTemplateId, _customFields, _profile);
    pane.innerHTML = contentHtml;
    if (requiredMissing?.length) {
      window.showToast?.(_missingRequiredMessage(requiredMissing.map(f => f.label || f.key)), 'error');
    } else if (unresolved.length) {
      window.showToast?.(`Unresolved fields: ${unresolved.join(', ')}`, 'error');
    }
  } catch (err) {
    pane.innerHTML = `<div class="empty-state" style="padding:28px;"><div class="empty-state-title">Preview failed</div><div class="empty-state-sub">${esc(err.message)}</div></div>`;
  }
}

function _renderTemplates(wrap) {
  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Type</th><th>Name</th><th>Status</th><th>Version</th><th>Updated</th><th>Actions</th></tr></thead>
        <tbody>
          ${_templates.map(t => `
            <tr>
              <td>${esc(DOCUMENT_TYPE_LABELS[t.template_type] || t.template_type)}</td>
              <td>${esc(t.name)}</td>
              <td><span class="${t.is_active ? 'badge badge-approved' : 'badge'}">${t.is_active ? 'active' : 'inactive'}</span></td>
              <td>${esc(t.version)}</td>
              <td>${esc(formatDate(t.updated_at))}</td>
              <td class="row-actions">
                <button class="btn btn-ghost btn-sm doc-edit-template" data-id="${attr(t.id)}">${_admin ? 'Edit' : 'View'}</button>
                ${_admin ? `<button class="btn btn-ghost btn-sm doc-toggle-template" data-id="${attr(t.id)}" data-active="${t.is_active ? '0' : '1'}">${t.is_active ? 'Deactivate' : 'Activate'}</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  wrap.querySelectorAll('.doc-edit-template').forEach(btn => btn.addEventListener('click', () => _openTemplateModal(btn.dataset.id)));
  wrap.querySelectorAll('.doc-toggle-template').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await setTemplateActive(btn.dataset.id, btn.dataset.active === '1');
      _templates = await getTemplates({ activeOnly: false });
      _renderTemplates(wrap);
      window.showToast?.('Template updated', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
    }
  }));
}

function _openTemplateModal(id) {
  const template = _templates.find(t => t.id === id);
  if (!template) return;
  const readOnly = !_admin;
  const dis = readOnly ? 'disabled' : '';
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'doc-template-modal';
  modal.innerHTML = `
    <div class="modal modal-lg" role="dialog" aria-modal="true">
      <div class="modal-header">
        <span class="modal-title">${readOnly ? 'View' : 'Edit'} Template - ${esc(template.name)}</span>
        <button class="btn btn-ghost btn-sm" data-close>Close</button>
      </div>
      <div class="modal-body">
        <label class="form-label">Name
          <input class="form-input" type="text" id="dt-name" value="${attr(template.name)}" ${dis}>
        </label>
        <label class="form-label">Description
          <input class="form-input" type="text" id="dt-desc" value="${attr(template.description || '')}" ${dis}>
        </label>
        <label class="form-label">Merge fields (comma separated)
          <input class="form-input" type="text" id="dt-fields" value="${attr((template.merge_fields || []).join(', '))}" ${dis}>
        </label>
        <label class="form-label">Template HTML
          <textarea class="form-input" id="dt-html" rows="14" style="font-family:monospace;resize:vertical;" ${dis}>${esc(template.template_html || '')}</textarea>
        </label>
        <div class="doc-preview" id="dt-preview" style="max-height:260px;">${_samplePreview(template.template_html || '')}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="dt-preview-btn">Preview</button>
        ${readOnly ? '' : `<button class="btn btn-primary" id="dt-save">Save Template</button>`}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.querySelector('[data-close]')?.addEventListener('click', close);
  modal.querySelector('#dt-preview-btn')?.addEventListener('click', () => {
    modal.querySelector('#dt-preview').innerHTML = _samplePreview(modal.querySelector('#dt-html').value);
  });
  modal.querySelector('#dt-save')?.addEventListener('click', async () => {
    try {
      const updated = await saveTemplate({
        ...template,
        name: modal.querySelector('#dt-name').value.trim(),
        description: modal.querySelector('#dt-desc').value.trim(),
        merge_fields: modal.querySelector('#dt-fields').value.split(',').map(s => s.trim()).filter(Boolean),
        template_html: modal.querySelector('#dt-html').value,
      });
      _templates = _templates.map(t => t.id === updated.id ? updated : t);
      close();
      _renderTemplates(document.getElementById('doc-content'));
      window.showToast?.('Template saved', 'success');
    } catch (err) {
      window.showToast?.(err.message, 'error');
    }
  });
}

async function _openDocumentModal(id, autoPrint = false) {
  try {
    const doc = await getDocument(id);
    localStorage.setItem(`doc_seen_${doc.id}`, '1');
    window.refreshDocumentsBadge?.();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop doc-print-root';
    modal.id = 'doc-print-root';
    const missingRequired = _missingRequiredFromHtml(doc.content_html);
    modal.innerHTML = `
      <div class="modal modal-lg doc-print-modal" role="dialog" aria-modal="true">
        <div class="modal-header doc-modal-header">
          <span class="modal-title">${esc(doc.title)}</span>
          <button class="btn btn-primary btn-sm" id="doc-print-now">Print / Save PDF</button>
          <button class="btn btn-ghost btn-sm" data-close>Close</button>
        </div>
        <div class="modal-body doc-print-body">${sanitizeHtml(doc.content_html)}</div>
      </div>
    `;
    document.body.appendChild(modal);
    document.body.classList.add('doc-printing');
    const close = () => { modal.remove(); document.body.classList.remove('doc-printing'); };
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('[data-close]')?.addEventListener('click', close);
    const printNow = () => {
      if (missingRequired.length) {
        window.showToast?.(_missingRequiredMessage(missingRequired), 'error');
        return;
      }
      window.print();
    };
    modal.querySelector('#doc-print-now')?.addEventListener('click', printNow);
    if (autoPrint) setTimeout(printNow, 150);
  } catch (err) {
    window.showToast?.(err.message, 'error');
  }
}

async function _reloadDocuments() {
  _documents = await getDocuments();
  window.refreshDocumentsBadge?.();
}

function _samplePreview(html) {
  const sample = {
    'doc.date': '11/06/2026',
    'employee.full_name': 'Sample Employee',
    'employee.employee_id': '02-1-017-00',
    'employee.job_title': 'Mechanical Engineer',
    'employee.department': 'Mechanical Engineering',
    'employee.employment_type': 'Full-time',
    'employee.start_date': '01/07/2026',
    'employee.probation_end_date': '30/09/2026',
    'employee.salary_grade': 'G3',
    'employee.manager_name': 'Sample Manager',
    'issuer.name': _profile?.name || 'Admin',
    'eval.period': 'H1 Mid-Year 2026',
    'eval.final_rating': '4',
    'leave.annual_balance': '12 days',
    'leave.personal_balance': '6 days',
    'leave.sick_balance': '30 days',
    'time.month_label': 'June 2026',
    'time.total_hours': '160.00h',
    'time.billable_hours': '128.00h',
    'time.nonbillable_hours': '32.00h',
    'time.project_summary': 'Project A: 80.00h; Project B: 48.00h',
    'custom.note': 'Sample custom text.',
    'custom.new_job_title': 'Senior Mechanical Engineer',
    'custom.effective_date': '01/07/2026',
  };
  const merged = String(html || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => esc(sample[key] ?? `{{${key}}}`));
  // Sanitize: the edit-modal preview renders raw admin-typed template HTML live.
  return sanitizeHtml(merged);
}

function _requiredFieldWarningHtml(template, employee) {
  const missing = _missingRequiredFromSelection(template, employee);
  if (!missing.length) return '';
  return `
    <div class="doc-warning" role="alert">
      <strong>Missing employee information</strong>
      <span>${esc(missing.join(', '))}. Update the employee record before generating or printing.</span>
    </div>
  `;
}

function _updateRequiredWarning(wrap) {
  const activeTemplates = _templates.filter(t => t.is_active);
  const selectedTemplate = activeTemplates.find(t => t.id === _selectedTemplateId) || null;
  const selectedEmployee = _eligibleEmployees.find(e => e.id === _selectedEmployeeId) || null;
  const slot = wrap.querySelector('#doc-required-warning');
  if (slot) slot.innerHTML = _requiredFieldWarningHtml(selectedTemplate, selectedEmployee);
}

function _missingRequiredFromSelection(template, employee) {
  if (!template || !employee) return [];
  return _requiredTemplateKeys(template)
    .filter(key => _blank(_selectionValue(employee, key)))
    .map(key => REQUIRED_DOCUMENT_FIELD_LABELS[key] || _humanizeFieldKey(key));
}

function _missingRequiredFromHtml(html) {
  const fields = Array.from(String(html || '').matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)).map(m => m[1]);
  return Array.from(new Set(fields))
    .filter(key => key !== 'custom.note')
    .map(key => REQUIRED_DOCUMENT_FIELD_LABELS[key] || _humanizeFieldKey(key));
}

function _missingRequiredMessage(labels) {
  return `Missing employee information: ${labels.join(', ')}. Update the employee record before generating or printing.`;
}

function _selectionValue(employee, key) {
  if (key === 'doc.date') return 'available';
  if (key === 'issuer.name') return _profile?.name || _profile?.email || 'Hubble Engineering';
  if (key === 'issuer.email') return _profile?.email || '';
  if (key === 'employee.full_name') return employee.full_name;
  if (key === 'employee.employee_id') return employee.employee_id;
  if (key === 'employee.job_title') return employee.job_title;
  if (key === 'employee.department') return employee.department?.label || employee.department_code;
  if (key === 'employee.employment_type') return employee.employment_type?.label || employee.employment_type_code;
  if (key === 'employee.start_date') return employee.start_date;
  if (key === 'employee.probation_end_date') return employee.probation_end_date;
  if (key === 'employee.salary_grade') return employee.salary_grade;
  if (key === 'employee.manager_name') return employee.direct_manager_id;
  if (key.startsWith('custom.')) return _customFields[key.slice(7)];
  if (key.startsWith('eval.')) return 'available';
  if (key.startsWith('leave.')) return 'available';
  if (key.startsWith('time.')) return 'available';
  return '';
}

function _requiredTemplateKeys(template) {
  const fields = Array.isArray(template?.merge_fields) ? template.merge_fields : [];
  const htmlFields = Array.from(String(template?.template_html || '').matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)).map(m => m[1]);
  return Array.from(new Set([...fields, ...htmlFields])).filter(key => key !== 'custom.note');
}

function _templateUsesField(template, key) {
  const fields = Array.isArray(template.merge_fields) ? template.merge_fields : [];
  if (fields.includes(key)) return true;
  return new RegExp(`\\{\\{\\s*${_escapeRegExp(key)}\\s*\\}\\}`, 'i').test(template.template_html || '');
}

function _blank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function _escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _humanizeFieldKey(key) {
  return String(key).split('.').pop().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function _ensureDocStyles() {
  if (document.getElementById('doc-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'doc-page-styles';
  style.textContent = `
    .doc-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
    .doc-card,.doc-panel{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px}
    .doc-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .doc-card h3,.doc-panel h3{margin:4px 0 0;font-size:16px;color:var(--text-primary)}
    .doc-type{font-size:11px;text-transform:uppercase;color:var(--accent);font-weight:700;letter-spacing:.04em}
    .doc-meta{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:12px;color:var(--text-muted);font-size:12px}
    .doc-note{color:var(--text-secondary);font-size:13px;margin:12px 0 0}
    .doc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
    .doc-warning{border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.12);border-radius:8px;color:var(--text-primary);display:grid;gap:4px;margin-top:16px;padding:10px 12px;font-size:13px;line-height:1.4}
    .doc-warning strong{color:#fbbf24}
    .doc-generate-grid{display:grid;grid-template-columns:minmax(320px,420px) minmax(0,1fr);gap:18px;align-items:start}
    .doc-template-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
    .doc-template-card{text-align:left;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);color:var(--text-primary);padding:12px;cursor:pointer;min-height:120px}
    .doc-template-card.active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
    .doc-template-card span{display:block;color:var(--accent);font-size:11px;font-weight:800;text-transform:uppercase;margin-bottom:8px}
    .doc-template-card strong{display:block;font-size:13px;margin-bottom:6px}
    .doc-template-card small,.doc-template-card em{display:block;color:var(--text-muted);font-size:11px;font-style:normal;line-height:1.35}
    .doc-preview-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-bottom:10px}
    .doc-preview-head span{color:var(--text-muted);font-size:12px}
    .doc-preview{background:#f8fafc;color:#111827;border-radius:8px;padding:28px;min-height:360px;max-height:720px;overflow:auto}
    .doc-preview .doc-template,.doc-print-body .doc-template{font-family:Arial,sans-serif;line-height:1.55;color:#111827}
    .doc-preview h1,.doc-print-body h1{font-size:26px;margin:0 0 18px;color:#111827}
    .doc-preview p,.doc-print-body p,.doc-preview li,.doc-print-body li{color:#111827}
    .doc-muted{color:#374151!important;font-weight:500}
    .doc-table{width:100%;border-collapse:collapse;margin:16px 0;color:#111827}
    .doc-table th,.doc-table td{border:1px solid #d1d5db;padding:8px;text-align:left;vertical-align:top}
    .doc-table th{background:#eef2f7;color:#111827}
    .doc-table td{color:#111827}
    .doc-callout{border-left:4px solid #03a9f4;background:#eef6ff;padding:12px;margin:14px 0;color:#111827}
    .doc-signatures{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:48px;color:#111827}
    .doc-signatures>div{border-top:1px solid #111827;padding-top:8px;min-height:64px}
    .doc-missing{background:#fff3cd;color:#7a4b00;padding:0 3px;border-radius:3px}
    .doc-print-modal{max-width:900px}
    .doc-print-body{background:#fff;color:#111827;padding:48px;max-height:75vh;overflow:auto}
    @media (max-width:900px){.doc-generate-grid{grid-template-columns:1fr}.doc-signatures{grid-template-columns:1fr}}
    @page{size:A4 portrait;margin:0.75in 0.5in}
    @media print{
      html,body{background:#fff!important;margin:0!important;min-height:0!important;overflow:visible!important}
      body.doc-printing > :not(#doc-print-root){display:none!important}
      body.doc-printing .doc-modal-header{display:none!important}
      body.doc-printing #doc-print-root{position:static!important;inset:auto!important;background:#fff!important;padding:0!important;margin:0!important;display:block!important;min-height:0!important;width:100%!important}
      body.doc-printing .doc-print-modal{display:block!important;box-shadow:none!important;border:0!important;border-radius:0!important;max-width:none!important;width:100%!important;max-height:none!important;overflow:visible!important;background:#fff!important;margin:0!important}
      body.doc-printing .doc-print-body{box-sizing:border-box!important;width:100%!important;max-width:none!important;min-height:0!important;max-height:none!important;overflow:visible!important;padding:0!important;margin:0!important;color:#111827!important;background:#fff!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}
      body.doc-printing .doc-print-body .doc-template{max-width:100%!important;overflow-wrap:anywhere!important}
      body.doc-printing .doc-print-body .doc-table{table-layout:fixed!important;width:100%!important}
      body.doc-printing .doc-print-body .doc-table th,body.doc-printing .doc-print-body .doc-table td{overflow-wrap:anywhere!important}
    }
  `;
  document.head.appendChild(style);
}
