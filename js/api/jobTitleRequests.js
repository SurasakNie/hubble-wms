// api/jobTitleRequests.js — Job title change request CRUD

import { supabase } from '../config.js';

const SELECT = `
  id, employee_id, requested_by, current_title, requested_title, reason,
  status, reviewed_by, reviewed_at, review_note, created_at,
  employee:employees!job_title_change_requests_employee_id_fkey(id, full_name, employee_id),
  requester:profiles!job_title_change_requests_requested_by_fkey(id, name, email)
`;

export async function submitJobTitleChangeRequest({ employeeId, requestedBy, currentTitle, requestedTitle, reason }) {
  const { data, error } = await supabase
    .from('job_title_change_requests')
    .insert({
      employee_id:     employeeId,
      requested_by:    requestedBy,
      current_title:   currentTitle || null,
      requested_title: requestedTitle,
      reason:          reason || null,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function getPendingJobTitleChangeRequests() {
  const { data, error } = await supabase
    .from('job_title_change_requests')
    .select(SELECT)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// reviewerId is accepted for call-site compatibility but unused: the RPC stamps
// reviewed_by from auth.uid() server-side.
export async function approveJobTitleChangeRequest(id, reviewerId) {
  // F-05 atomic RPC: updates employees.job_title AND marks the request approved
  // in one transaction. Replaces the prior fetch → update → update sequence that
  // needed a manual compensating revert (no client-side transaction existed).
  // See f05_request_review_rpcs.sql → approve_job_title_change_request.
  const { error } = await supabase.rpc('approve_job_title_change_request', { p_request_id: id });
  if (error) throw error;
}

export async function rejectJobTitleChangeRequest(id, reviewerId, note) {
  const { data, error } = await supabase
    .from('job_title_change_requests')
    .update({
      status:      'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    })
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function cancelJobTitleChangeRequest(id) {
  const { data, error } = await supabase.from('job_title_change_requests')
    .update({ status: 'cancelled' }).eq('id', id).select('id, status').single();
  if (error) throw error; return data;
}
