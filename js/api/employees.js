// api/employees.js — CRUD for employees, compensation, documents, skills, audit log

import { supabase } from '../config.js';

// ── SELECT constants ──────────────────────────────────────────

const EMPLOYEE_SELECT = `
  id, user_id, global_number, employee_id, employee_id_normalized,
  department_code, employment_type_code, direct_manager_id,
  full_name, date_of_birth, contact_email, personal_email, personal_phone,
  emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
  job_title, salary_grade, start_date, contract_end_date, probation_end_date,
  status, archived_at, created_at, updated_at,
  department:departments(code, label),
  employment_type:employment_types(code, label),
  linked_user:profiles!employees_user_id_fkey(id, name, email)
`;

// ── USER LINKING ──────────────────────────────────────────────

// Look up a Supabase auth profile by email (admin only — profiles RLS).
// Returns the profile row or null if no account with that email exists.
export async function findProfileByEmail(email) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Sync a name change to the linked profile (keeps Team page in sync with Employee page).
export async function updateProfileName(userId, name) {
  const { error } = await supabase.from('profiles').update({ name }).eq('id', userId);
  if (error) throw error;
}

// ── LOOKUP TABLES ─────────────────────────────────────────────

export async function getDepartments() {
  const { data, error } = await supabase
    .from('departments')
    .select('code, label, is_active')
    .eq('is_active', true)
    .order('code');
  if (error) throw error;
  return data || [];
}

export async function getEmploymentTypes() {
  const { data, error } = await supabase
    .from('employment_types')
    .select('code, label, is_active')
    .eq('is_active', true)
    .order('code');
  if (error) throw error;
  return data || [];
}

// ── EMPLOYEES ─────────────────────────────────────────────────

export async function getEmployees({ status, departmentCode } = {}) {
  let q = supabase
    .from('employees')
    .select(EMPLOYEE_SELECT)
    .order('global_number');

  if (status)         q = q.eq('status', status);
  if (departmentCode) q = q.eq('department_code', departmentCode);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getEmployee(id) {
  const { data, error } = await supabase
    .from('employees')
    .select(EMPLOYEE_SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Look up by employee_id_normalized — used at login (strip hyphens, uppercase first)
export async function getEmployeeByNormalizedId(normalizedId) {
  const { data, error } = await supabase
    .from('employees')
    .select(EMPLOYEE_SELECT)
    .eq('employee_id_normalized', normalizedId.toUpperCase())
    .single();
  if (error) throw error;
  return data;
}

export async function createEmployee({
  fullName,
  departmentCode,
  employmentTypeCode,
  globalNumber,      // omit for new hires — sequence assigns next NNN
  contactEmail,
  personalEmail,
  personalPhone,
  dateOfBirth,
  emergencyContactName,
  emergencyContactRelationship,
  emergencyContactPhone,
  jobTitle,
  directManagerId,
  salaryGrade,
  startDate,
  contractEndDate,
  probationEndDate,
  status = 'active',
} = {}) {
  const payload = {
    full_name:                      fullName,
    department_code:                departmentCode,
    employment_type_code:           employmentTypeCode,
    contact_email:                  contactEmail      || null,
    personal_email:                 personalEmail     || null,
    personal_phone:                 personalPhone     || null,
    date_of_birth:                  dateOfBirth       || null,
    emergency_contact_name:         emergencyContactName         || null,
    emergency_contact_relationship: emergencyContactRelationship || null,
    emergency_contact_phone:        emergencyContactPhone        || null,
    job_title:                      jobTitle          || null,
    direct_manager_id:              directManagerId   || null,
    salary_grade:                   salaryGrade       || null,
    start_date:                     startDate         || null,
    contract_end_date:              contractEndDate   || null,
    probation_end_date:             probationEndDate  || null,
    status,
  };
  if (globalNumber !== undefined) payload.global_number = globalNumber;

  const { data, error } = await supabase
    .from('employees')
    .insert(payload)
    .select(EMPLOYEE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployee(id, updates) {
  const payload = {};
  const map = {
    fullName:                      'full_name',
    departmentCode:                'department_code',
    employmentTypeCode:            'employment_type_code',
    contactEmail:                  'contact_email',
    personalEmail:                 'personal_email',
    personalPhone:                 'personal_phone',
    dateOfBirth:                   'date_of_birth',
    emergencyContactName:          'emergency_contact_name',
    emergencyContactRelationship:  'emergency_contact_relationship',
    emergencyContactPhone:         'emergency_contact_phone',
    jobTitle:                      'job_title',
    directManagerId:               'direct_manager_id',
    salaryGrade:                   'salary_grade',
    startDate:                     'start_date',
    contractEndDate:               'contract_end_date',
    probationEndDate:              'probation_end_date',
    userId:                        'user_id',
    status:                        'status',
  };
  for (const [js, db] of Object.entries(map)) {
    if (updates[js] !== undefined) payload[db] = updates[js];
  }

  // When re-activating an archived employee, clear the archive timestamp.
  // When archiving (resigned/terminated), stamp it if not already set.
  if (updates.status !== undefined) {
    if (updates.status === 'active' || updates.status === 'pending') {
      payload.archived_at = null;
    } else if (updates.status === 'resigned' || updates.status === 'terminated') {
      payload.archived_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase
    .from('employees')
    .update(payload)
    .eq('id', id)
    .select(EMPLOYEE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// Archive instead of delete — preserves all history
export async function archiveEmployee(id, status = 'resigned') {
  const { data, error } = await supabase
    .from('employees')
    .update({ status, archived_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, employee_id, status, archived_at')
    .single();
  if (error) throw error;
  return data;
}

// ── COMPENSATION ──────────────────────────────────────────────

export async function getCompensation(employeeId) {
  const { data, error } = await supabase
    .from('employee_compensation')
    .select('id, employee_id, national_id, passport_number, salary, hourly_rate, pay_frequency, bank_name, bank_account, bonus_equity')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertCompensation(employeeId, {
  nationalId,
  passportNumber,
  salary,
  hourlyRate,
  payFrequency,
  bankName,
  bankAccount,
  bonusEquity,
} = {}) {
  const payload = { employee_id: employeeId };
  if (nationalId      !== undefined) payload.national_id      = nationalId;
  if (passportNumber  !== undefined) payload.passport_number  = passportNumber;
  if (salary          !== undefined) payload.salary           = salary;
  if (hourlyRate      !== undefined) payload.hourly_rate      = hourlyRate;
  if (payFrequency    !== undefined) payload.pay_frequency    = payFrequency;
  if (bankName        !== undefined) payload.bank_name        = bankName;
  if (bankAccount     !== undefined) payload.bank_account     = bankAccount;
  if (bonusEquity     !== undefined) payload.bonus_equity     = bonusEquity;

  const { data, error } = await supabase
    .from('employee_compensation')
    .upsert(payload, { onConflict: 'employee_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── DOCUMENTS ────────────────────────────────────────────────

export async function getDocuments(employeeId) {
  const { data, error } = await supabase
    .from('employee_documents')
    .select('id, doc_type, title, storage_path, issue_date, expiry_date, created_at')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addDocument({ employeeId, docType, title, storagePath, issueDate, expiryDate }) {
  const { data, error } = await supabase
    .from('employee_documents')
    .insert({
      employee_id:  employeeId,
      doc_type:     docType,
      title:        title        || null,
      storage_path: storagePath  || null,
      issue_date:   issueDate    || null,
      expiry_date:  expiryDate   || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDocument(id) {
  const { error } = await supabase
    .from('employee_documents')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// Documents expiring within N days — used for the 90/30-day alert queries
export async function getExpiringDocuments(withinDays = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const { data, error } = await supabase
    .from('employee_documents')
    .select(`
      id, doc_type, title, expiry_date,
      employee:employees(id, employee_id, full_name)
    `)
    .not('expiry_date', 'is', null)
    .lte('expiry_date', cutoff.toISOString().split('T')[0])
    .order('expiry_date');
  if (error) throw error;
  return data || [];
}

// ── SKILLS ───────────────────────────────────────────────────

export async function getSkills(employeeId) {
  const { data, error } = await supabase
    .from('employee_skills')
    .select('id, category, name, level, created_at')
    .eq('employee_id', employeeId)
    .order('category')
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function addSkill({ employeeId, category, name, level }) {
  const { data, error } = await supabase
    .from('employee_skills')
    .insert({ employee_id: employeeId, category, name, level: level || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeSkill(id) {
  const { error } = await supabase
    .from('employee_skills')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── AUDIT LOG ────────────────────────────────────────────────

export async function getAuditLog(employeeId) {
  const { data, error } = await supabase
    .from('employee_audit_log')
    .select(`
      id, table_name, field_name, old_value, new_value, changed_at,
      changed_by_profile:changed_by(id, name, email)
    `)
    .eq('employee_id', employeeId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
