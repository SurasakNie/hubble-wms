// api/documents.js - Module M6: automated document templates and generated documents

import { supabase } from '../config.js';
import { esc, formatDate, sanitizeHtml } from '../format.js';

const TEMPLATE_SELECT = `
  id, template_type, name, description, template_html, merge_fields,
  requires_signature, is_active, version, created_by, created_at, updated_at
`;

const DOC_SELECT = `
  id, employee_id, template_id, template_type, title, content_html, custom_fields,
  status, generated_by, generated_at, sent_at, signed_at, note, updated_at,
  template:document_templates!generated_documents_template_id_fkey(id, template_type, name, requires_signature),
  employee:employees!generated_documents_employee_id_fkey(id, full_name, employee_id, job_title, department_code),
  generator:profiles!generated_documents_generated_by_fkey(id, name, email)
`;

const REQUEST_SELECT = `
  id, employee_id, requested_by, template_id, template_type, note, status,
  reviewed_by, reviewed_at, review_note, fulfilled_document_id, created_at, updated_at,
  employee:employees!document_requests_employee_id_fkey(id, full_name, employee_id),
  template:document_templates!document_requests_template_id_fkey(id, name, template_type, is_active),
  reviewer:profiles!document_requests_reviewed_by_fkey(id, name)
`;

const EMPLOYEE_CONTEXT_SELECT = `
  id, user_id, employee_id, full_name, job_title, department_code, employment_type_code,
  salary_grade, start_date, probation_end_date, direct_manager_id,
  department:departments(code, label),
  employment_type:employment_types(code, label)
`;

export const DOCUMENT_TYPE_LABELS = {
  offer_letter:            'Job Offer Letter',
  employment_contract:     'Employment Contract',
  probation_confirmation:  'Probation Confirmation',
  promotion_letter:        'Promotion Letter',
  salary_adjustment:       'Salary Adjustment Letter',
  warning_letter:          'Warning Letter',
  leave_balance_statement: 'Leave Balance Statement',
  timesheet_report:        'Monthly Timesheet Report',
  employment_certificate:  'Employment Certificate',
};

// Document types an employee may request via the REQUESTS tab.
// Everything else is drafted/generated directly by admin/manager (user decision 2026-06-11).
export const EMPLOYEE_REQUESTABLE_TYPES = new Set(['employment_certificate']);

export const REQUIRED_DOCUMENT_FIELD_LABELS = {
  'doc.date': 'Document date',
  'doc.title': 'Document title',
  'issuer.name': 'Issuer name',
  'issuer.email': 'Issuer email',
  'employee.full_name': 'Employee full name',
  'employee.employee_id': 'Employee ID',
  'employee.job_title': 'Job title',
  'employee.department': 'Department',
  'employee.employment_type': 'Employment type',
  'employee.start_date': 'Employee start date',
  'employee.probation_end_date': 'Probation end date',
  'employee.salary_grade': 'Salary grade',
  'employee.manager_name': 'Manager name',
  'eval.period': 'Evaluation period',
  'eval.final_rating': 'Evaluation rating',
  'eval.final_note': 'Evaluation note',
  'leave.annual_balance': 'Annual leave balance',
  'leave.personal_balance': 'Personal leave balance',
  'leave.sick_balance': 'Sick leave balance',
  'time.month_label': 'Report month',
  'time.total_hours': 'Total hours',
  'time.billable_hours': 'Billable hours',
  'time.nonbillable_hours': 'Non-billable hours',
  'time.project_summary': 'Project mix',
  'custom.new_job_title': 'New job title',
  'custom.effective_date': 'Effective date',
};

const OPTIONAL_STANDALONE_FIELDS = new Set(['custom.note']);

export async function getTemplates({ activeOnly = true } = {}) {
  let q = supabase
    .from('document_templates')
    .select(TEMPLATE_SELECT)
    .order('name', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getTemplate(id) {
  const { data, error } = await supabase
    .from('document_templates')
    .select(TEMPLATE_SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function saveTemplate(template) {
  const payload = {
    template_type: template.template_type,
    name: template.name,
    description: template.description || null,
    template_html: template.template_html,
    merge_fields: template.merge_fields || [],
    requires_signature: !!template.requires_signature,
    is_active: template.is_active !== false,
  };

  let q;
  if (template.id) {
    payload.version = Number(template.version || 1) + 1;
    q = supabase.from('document_templates').update(payload).eq('id', template.id);
  } else {
    q = supabase.from('document_templates').insert(payload);
  }

  const { data, error } = await q.select(TEMPLATE_SELECT).single();
  if (error) throw error;
  return data;
}

export async function setTemplateActive(id, isActive) {
  const { data, error } = await supabase
    .from('document_templates')
    .update({ is_active: !!isActive })
    .eq('id', id)
    .select(TEMPLATE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function getDocuments({ employeeId, templateType, status } = {}) {
  let q = supabase
    .from('generated_documents')
    .select(DOC_SELECT)
    .order('generated_at', { ascending: false });
  if (employeeId)    q = q.eq('employee_id', employeeId);
  if (templateType)  q = q.eq('template_type', templateType);
  if (status)        q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getDocument(id) {
  const { data, error } = await supabase
    .from('generated_documents')
    .select(DOC_SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function previewDocument(employeeId, templateId, customFields = {}, profile = {}) {
  const template = typeof templateId === 'object' ? templateId : await getTemplate(templateId);
  const { contentHtml, unresolved, requiredMissing } = await resolveTemplate(template, employeeId, customFields, profile);
  return { template, contentHtml, unresolved, requiredMissing };
}

export async function generateDocument(employeeId, templateId, customFields = {}, note = null, profile = {}) {
  const template = await getTemplate(templateId);
  const fields = normalizeCustomFields(customFields);
  const { contentHtml, requiredMissing } = await resolveTemplate(template, employeeId, fields, profile);
  if (requiredMissing.length) throw new Error(requiredFieldsMessage(requiredMissing));
  const title = `${template.name} - ${fields.employeeName || 'Employee'} - ${formatDate(new Date())}`;
  const fallbackNote = typeof note === 'string' ? note.trim() : note;
  const documentNote = fields.note || fallbackNote || null;
  const { data, error } = await supabase
    .from('generated_documents')
    .insert({
      employee_id: employeeId,
      template_id: template.id,
      template_type: template.template_type,
      title,
      content_html: contentHtml,
      custom_fields: fields,
      status: 'draft',
      note: documentNote,
      generated_by: profile.id || null,
    })
    .select(DOC_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateDocumentStatus(id, status, note) {
  const patch = { status };
  if (note !== undefined) patch.note = note || null;
  if (status === 'sent')   patch.sent_at = new Date().toISOString();
  if (status === 'signed') patch.signed_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('generated_documents')
    .update(patch)
    .eq('id', id)
    .select(DOC_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// ── Document requests (Round 21) ─────────────────────────────

export async function getDocumentRequests() {
  const { data, error } = await supabase
    .from('document_requests')
    .select(REQUEST_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function submitDocumentRequest({ employeeId, templateId, templateType, note, profile }) {
  const { data, error } = await supabase
    .from('document_requests')
    .insert({
      employee_id: employeeId,
      requested_by: profile.id,
      template_id: templateId,
      template_type: templateType,
      note: (typeof note === 'string' ? note.trim() : note) || null,
      status: 'pending',
    })
    .select(REQUEST_SELECT)
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('You already have a pending request for this document type.');
    throw error;
  }
  return data;
}

export async function cancelDocumentRequest(id) {
  const { data, error } = await supabase
    .from('document_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'pending')
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function rejectDocumentRequest(id, reason, profile) {
  const { data, error } = await supabase
    .from('document_requests')
    .update({
      status: 'rejected',
      review_note: (typeof reason === 'string' ? reason.trim() : reason) || null,
      reviewed_by: profile?.id || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// Links a saved draft to its originating request; status stays pending until the draft is generated.
export async function linkRequestToDocument(requestId, documentId) {
  const { error } = await supabase
    .from('document_requests')
    .update({ fulfilled_document_id: documentId })
    .eq('id', requestId)
    .eq('status', 'pending');
  if (error) throw error;
}

// Marks linked pending requests fulfilled when their document is generated.
// Zero matched rows is a normal no-op (e.g. the employee cancelled while the draft was in progress).
export async function fulfillRequestsForDocument(documentId, profile) {
  const { error } = await supabase
    .from('document_requests')
    .update({
      status: 'fulfilled',
      reviewed_by: profile?.id || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('fulfilled_document_id', documentId)
    .eq('status', 'pending');
  if (error) throw error;
}

async function resolveTemplate(template, employeeId, customFields, profile) {
  const fields = normalizeCustomFields(customFields);
  const context = await buildMergeContext(employeeId, fields, profile);
  const requiredMissing = missingRequiredFields(template, context);
  const templateHtml = stripEmptyOptionalBlocks(String(template.template_html || ''), context);
  const merged = templateHtml.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    const value = getPath(context, key);
    if (isBlank(value) && OPTIONAL_STANDALONE_FIELDS.has(key)) return '';
    return isBlank(value) ? `<span class="doc-missing">{{${esc(key)}}}</span>` : esc(value);
  });
  const unresolved = Array.from(merged.matchAll(/\{\{[^}]+\}\}/g)).map(m => m[0]);
  // Sanitize the merged template markup before it is ever rendered/stored.
  // Merge VALUES are already esc()'d above; this hardens the template wrapper.
  const contentHtml = sanitizeHtml(merged);
  return { contentHtml, unresolved, context, requiredMissing };
}

async function buildMergeContext(employeeId, customFields = {}, profile = {}) {
  const employee = await getEmployeeContext(employeeId);
  const [leave, evaluation, time] = await Promise.all([
    getLeaveContext(employeeId),
    getEvaluationContext(employeeId),
    getTimeContext(employee.user_id, customFields.month),
  ]);

  customFields.employeeName = employee.full_name || '';

  return {
    doc: {
      date: formatDate(new Date()),
      title: customFields.title || '',
    },
    issuer: {
      name: profile.name || profile.email || 'Hubble Engineering',
      email: profile.email || '',
    },
    employee: {
      full_name: employee.full_name || '',
      employee_id: employee.employee_id || '',
      job_title: employee.job_title || '',
      department: employee.department?.label || employee.department_code || '',
      employment_type: employee.employment_type?.label || employee.employment_type_code || '',
      salary_grade: employee.salary_grade || '',
      start_date: formatDate(employee.start_date),
      probation_end_date: formatDate(employee.probation_end_date),
      manager_name: employee.manager_name || '',
    },
    eval: evaluation,
    leave,
    time,
    custom: customFields || {},
  };
}

async function getEmployeeContext(employeeId) {
  const { data, error } = await supabase
    .from('employees')
    .select(EMPLOYEE_CONTEXT_SELECT)
    .eq('id', employeeId)
    .single();
  if (error) throw error;
  let managerName = '';
  if (data.direct_manager_id) {
    const { data: mgr } = await supabase
      .from('employees')
      .select('id, full_name, employee_id')
      .eq('id', data.direct_manager_id)
      .maybeSingle();
    managerName = mgr?.full_name || '';
  }
  return { ...data, manager_name: managerName };
}

async function getLeaveContext(employeeId) {
  const year = new Date().getFullYear();
  const { data, error } = await supabase
    .from('leave_balances')
    .select('leave_type_code, allocated_days, used_days, carried_over_days, manual_adjustment_days, leave_type:leave_types(code, label)')
    .eq('employee_id', employeeId)
    .eq('year', year);
  if (error) return emptyLeaveContext();
  const rows = data || [];
  const balanceFor = code => {
    const r = rows.find(x => x.leave_type_code === code);
    if (!r) return '0 days';
    const remaining = Number(r.allocated_days || 0) + Number(r.carried_over_days || 0) + Number(r.manual_adjustment_days || 0) - Number(r.used_days || 0);
    return `${remaining.toFixed(1).replace(/\.0$/, '')} days`;
  };
  return {
    annual_balance: balanceFor('annual_leave'),
    personal_balance: balanceFor('personal_leave'),
    sick_balance: balanceFor('sick_leave'),
  };
}

function emptyLeaveContext() {
  return { annual_balance: '0 days', personal_balance: '0 days', sick_balance: '0 days' };
}

async function getEvaluationContext(employeeId) {
  const { data, error } = await supabase
    .from('evaluations')
    .select('final_rating, final_note, published_at, cycle:evaluation_cycles(name, period_start, period_end)')
    .eq('employee_id', employeeId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { final_rating: 'N/A', period: 'N/A', final_note: '' };
  const period = data.cycle
    ? `${data.cycle.name || 'Evaluation'} (${formatDate(data.cycle.period_start)} - ${formatDate(data.cycle.period_end)})`
    : 'Latest published evaluation';
  return {
    final_rating: data.final_rating || 'N/A',
    period,
    final_note: data.final_note || '',
  };
}

async function getTimeContext(userId, monthValue) {
  const month = monthValue || currentMonthValue();
  const [year, monthNo] = month.split('-').map(Number);
  const start = `${year}-${String(monthNo).padStart(2, '0')}-01`;
  const endDate = new Date(year, monthNo, 0);
  const end = `${year}-${String(monthNo).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  if (!userId) return emptyTimeContext(month);

  const { data, error } = await supabase
    .from('time_entries')
    .select('total_hours, is_billable, project:projects(name)')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end);
  if (error) return emptyTimeContext(month);

  const rows = data || [];
  const total = rows.reduce((sum, r) => sum + Number(r.total_hours || 0), 0);
  const billable = rows.filter(r => r.is_billable).reduce((sum, r) => sum + Number(r.total_hours || 0), 0);
  const projects = new Map();
  for (const r of rows) {
    const name = r.project?.name || 'No project';
    projects.set(name, (projects.get(name) || 0) + Number(r.total_hours || 0));
  }
  const projectSummary = Array.from(projects.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, hours]) => `${name}: ${hours.toFixed(2)}h`)
    .join('; ') || 'No entries';

  return {
    month_label: monthLabel(month),
    total_hours: `${total.toFixed(2)}h`,
    billable_hours: `${billable.toFixed(2)}h`,
    nonbillable_hours: `${(total - billable).toFixed(2)}h`,
    project_summary: projectSummary,
  };
}

function emptyTimeContext(month) {
  return {
    month_label: monthLabel(month),
    total_hours: '0.00h',
    billable_hours: '0.00h',
    nonbillable_hours: '0.00h',
    project_summary: 'No entries',
  };
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(value) {
  const [year, month] = String(value || currentMonthValue()).split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function normalizeCustomFields(customFields = {}) {
  const fields = { ...(customFields || {}) };
  if (typeof fields.note === 'string') fields.note = fields.note.trim();
  return fields;
}

function missingRequiredFields(template, context) {
  return requiredTemplateKeys(template)
    .filter(key => isBlank(getPath(context, key)))
    .map(key => ({ key, label: REQUIRED_DOCUMENT_FIELD_LABELS[key] || humanizeFieldKey(key) }));
}

function requiredFieldsMessage(fields) {
  const names = fields.map(f => f.label || f.key).join(', ');
  return `Missing employee information: ${names}. Update the employee record before generating or printing.`;
}

function stripEmptyOptionalBlocks(html, context) {
  let output = html;
  for (const key of OPTIONAL_STANDALONE_FIELDS) {
    if (!isBlank(getPath(context, key))) continue;
    const token = `\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`;
    output = output.replace(new RegExp(`<([a-z][\\w:-]*)([^>]*)>\\s*${token}\\s*<\\/\\1>`, 'gi'), '');
  }
  return output;
}

function templateUsesField(template, key) {
  const fields = Array.isArray(template.merge_fields) ? template.merge_fields : [];
  if (fields.includes(key)) return true;
  return new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'i').test(template.template_html || '');
}

function requiredTemplateKeys(template) {
  const fields = Array.isArray(template.merge_fields) ? template.merge_fields : [];
  const htmlFields = Array.from(String(template.template_html || '').matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)).map(m => m[1]);
  return Array.from(new Set([...fields, ...htmlFields])).filter(key => !OPTIONAL_STANDALONE_FIELDS.has(key));
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function humanizeFieldKey(key) {
  return String(key).split('.').pop().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getPath(obj, path) {
  return String(path).split('.').reduce((cur, key) => cur && cur[key] !== undefined ? cur[key] : undefined, obj);
}
