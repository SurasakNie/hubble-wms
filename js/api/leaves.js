// api/leaves.js — Leave balances, requests, and flex holiday swaps

import { supabase } from '../config.js';

// ── SELECT constants ──────────────────────────────────────────

const BALANCE_SELECT = `
  id, employee_id, leave_type_code, year,
  allocated_days, used_days, carried_over_days, manual_adjustment_days,
  adjustment_reason, adjusted_at,
  leave_type:leave_types(code, label, granularity_options, pool_partner)
`;

const REQUEST_SELECT = `
  id, employee_id, leave_type_code, start_date, end_date,
  start_time, end_time, granularity, duration_hours,
  status, notes, document_path,
  is_cross_type_deduction, deducted_from_type,
  manager_id, manager_approved_at, manager_notes,
  hr_id, hr_approved_at, hr_notes,
  rejection_reason, created_at, updated_at,
  employee:employees!leave_requests_employee_id_fkey(id, full_name, employee_id),
  leave_type:leave_types!leave_requests_leave_type_code_fkey(code, label, approval_tiers)
`;

const FLEX_SELECT = `
  id, employee_id, waived_holiday_id, substitute_date, swap_type,
  valid_from, valid_until, status,
  manager_id, manager_approved_at, manager_notes, created_at,
  employee:employees!flex_holiday_swaps_employee_id_fkey(id, full_name, employee_id),
  waived_holiday:public_holidays(id, date, name, year)
`;

// ── LEAVE TYPES ───────────────────────────────────────────────

export async function getLeaveTypes() {
  const { data, error } = await supabase
    .from('leave_types')
    .select('code, label, requires_document, approval_tiers, granularity_options, pool_partner, sort_order, default_days')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

// ── LEAVE BALANCES ────────────────────────────────────────────

export async function getLeaveBalances(employeeId, year) {
  const { data, error } = await supabase
    .from('leave_balances')
    .select(BALANCE_SELECT)
    .eq('employee_id', employeeId)
    .eq('year', year)
    .order('leave_type_code');
  if (error) throw error;
  return data || [];
}

export async function getAllLeaveBalances(year) {
  const { data, error } = await supabase
    .from('leave_balances')
    .select(BALANCE_SELECT + ', employee:employees!leave_balances_employee_id_fkey(id, full_name, employee_id)')
    .eq('year', year)
    .order('employee_id');
  if (error) throw error;
  return data || [];
}

export async function upsertLeaveBalance({ employeeId, leaveTypeCode, year, allocatedDays, carriedOverDays = 0 }) {
  const { data, error } = await supabase
    .from('leave_balances')
    .upsert({
      employee_id:       employeeId,
      leave_type_code:   leaveTypeCode,
      year,
      allocated_days:    allocatedDays,
      carried_over_days: carriedOverDays,
    }, { onConflict: 'employee_id,leave_type_code,year' })
    .select(BALANCE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function adjustLeaveBalance(employeeId, leaveTypeCode, year, adjustmentDays, reason) {
  const { data, error } = await supabase
    .from('leave_balances')
    .update({
      manual_adjustment_days: adjustmentDays,
      adjustment_reason:      reason,
      adjusted_at:            new Date().toISOString(),
    })
    .eq('employee_id', employeeId)
    .eq('leave_type_code', leaveTypeCode)
    .eq('year', year)
    .select(BALANCE_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No leave-balance row for ${leaveTypeCode} ${year} — initialize the year first.`);
  return data;
}

// ── LEAVE REQUESTS ────────────────────────────────────────────

export async function getMyLeaveRequests(employeeId) {
  const { data, error } = await supabase
    .from('leave_requests')
    .select(REQUEST_SELECT)
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getAllLeaveRequests({ status } = {}) {
  let q = supabase
    .from('leave_requests')
    .select(REQUEST_SELECT)
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function updateLeaveRequest(id, { leaveTypeCode, startDate, endDate, notes }) {
  const { data, error } = await supabase
    .from('leave_requests')
    .update({
      leave_type_code: leaveTypeCode,
      start_date:      startDate,
      end_date:        endDate,
      notes:           notes || null,
    })
    .eq('id', id)
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function submitLeaveRequest({
  employeeId, leaveTypeCode,
  startDate, endDate,
  startTime, endTime,
  granularity = 'full_day', durationHours,
  notes, documentPath,
  isCrossTypeDeduction = false, deductedFromType,
}) {
  if (startDate && endDate && startDate > endDate)
    throw new Error('Start date cannot be after end date.');
  if (granularity === 'hours' && !durationHours)
    throw new Error('Duration in hours is required for an hourly leave request.');
  if (isCrossTypeDeduction && !deductedFromType)
    throw new Error('Cross-type deduction requires a target leave-type pool.');
  const { data, error } = await supabase
    .from('leave_requests')
    .insert({
      employee_id:              employeeId,
      leave_type_code:          leaveTypeCode,
      start_date:               startDate,
      end_date:                 endDate,
      start_time:               startTime || null,
      end_time:                 endTime   || null,
      granularity,
      duration_hours:           durationHours || null,
      notes:                    notes     || null,
      document_path:            documentPath || null,
      is_cross_type_deduction:  isCrossTypeDeduction,
      deducted_from_type:       deductedFromType || null,
    })
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function approveLeaveRequest(id, managerEmployeeId, notes, approvalTiers = 1) {
  const newStatus = (approvalTiers >= 2) ? 'manager_approved' : 'approved';
  const { data, error } = await supabase
    .from('leave_requests')
    .update({
      status:               newStatus,
      manager_id:           managerEmployeeId,
      manager_approved_at:  new Date().toISOString(),
      manager_notes:        notes || null,
    })
    .eq('id', id)
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function hrApproveLeaveRequest(id, hrEmployeeId, notes) {
  const { data, error } = await supabase
    .from('leave_requests')
    .update({
      status:          'approved',
      hr_id:           hrEmployeeId,
      hr_approved_at:  new Date().toISOString(),
      hr_notes:        notes || null,
    })
    .eq('id', id)
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function rejectLeaveRequest(id, reason) {
  const { data, error } = await supabase
    .from('leave_requests')
    .update({ status: 'rejected', rejection_reason: reason })
    .eq('id', id)
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function cancelLeaveRequest(id) {
  const { data, error } = await supabase
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// ── FLEX HOLIDAY SWAPS ────────────────────────────────────────

export async function getMyFlexSwaps(employeeId) {
  const { data, error } = await supabase
    .from('flex_holiday_swaps')
    .select(FLEX_SELECT)
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getAllFlexSwaps({ status } = {}) {
  let q = supabase
    .from('flex_holiday_swaps')
    .select(FLEX_SELECT)
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function submitFlexSwap({ employeeId, waivedHolidayId, substituteDate, swapType = 'move', wfhDate }) {
  const isWfh = swapType === 'wfh';
  if (!isWfh && !substituteDate)
    throw new Error('A substitute date is required for a holiday-move swap.');
  const { data, error } = await supabase
    .from('flex_holiday_swaps')
    .insert({
      employee_id:       employeeId,
      waived_holiday_id: isWfh ? null : (waivedHolidayId || null),
      swap_type:         swapType,
      substitute_date:   isWfh ? null : (substituteDate || null),
      valid_from:        isWfh ? (wfhDate || null) : (substituteDate || null),
      valid_until:       isWfh ? (wfhDate || null) : (substituteDate || null),
    })
    .select(FLEX_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function approveFlexSwap(id, managerEmployeeId, notes) {
  const { data, error } = await supabase
    .from('flex_holiday_swaps')
    .update({
      status:               'approved',
      manager_id:           managerEmployeeId,
      manager_approved_at:  new Date().toISOString(),
      manager_notes:        notes || null,
    })
    .eq('id', id)
    .select(FLEX_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function rejectFlexSwap(id, reason) {
  const { data, error } = await supabase
    .from('flex_holiday_swaps')
    .update({ status: 'rejected', manager_notes: reason })
    .eq('id', id)
    .select(FLEX_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function cancelFlexSwap(id) {
  const { data, error } = await supabase
    .from('flex_holiday_swaps')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select(FLEX_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// ── STATUS OVERRIDE (admin / manager undo) ────────────────────

export async function overrideLeaveRequestStatus(id, status, actorEmployeeId, notes) {
  const patch = { status };
  if (status === 'approved') {
    patch.manager_id          = actorEmployeeId || null;
    patch.manager_approved_at = new Date().toISOString();
    patch.manager_notes       = notes || null;
  } else if (status === 'rejected') {
    patch.rejection_reason = notes || null;
  } else if (status === 'pending') {
    // Reset all approval stamps
    patch.manager_id = null; patch.manager_approved_at = null; patch.manager_notes = null;
    patch.hr_id      = null; patch.hr_approved_at      = null; patch.hr_notes      = null;
    patch.rejection_reason = null;
  }
  const { data, error } = await supabase
    .from('leave_requests')
    .update(patch)
    .eq('id', id)
    .select(REQUEST_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function overrideFlexSwapStatus(id, status, actorEmployeeId, notes) {
  const patch = { status };
  if (status === 'approved') {
    patch.manager_id          = actorEmployeeId || null;
    patch.manager_approved_at = new Date().toISOString();
    patch.manager_notes       = notes || null;
  } else if (status === 'pending') {
    patch.manager_id = null; patch.manager_approved_at = null; patch.manager_notes = null;
  }
  const { data, error } = await supabase
    .from('flex_holiday_swaps')
    .update(patch)
    .eq('id', id)
    .select(FLEX_SELECT)
    .single();
  if (error) throw error;
  return data;
}
