// api/users.js — profiles, groups, group_members, deletion_requests

import { supabase } from '../config.js';

// ──────────────────────────────────────────────────────────────
// PROFILES
// ──────────────────────────────────────────────────────────────

const PROFILE_SELECT_ADMIN = 'id, name, email, job_title, role, billable_rate, currency, client_id, created_at, working_days, daily_capacity_hours, week_start';
const PROFILE_SELECT_SAFE  = 'id, name, email, job_title, role, created_at';

export async function getUsers(isAdmin = false) {
  const sel = isAdmin ? PROFILE_SELECT_ADMIN : PROFILE_SELECT_SAFE;
  const { data, error } = await supabase
    .from('profiles')
    .select(sel)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function updateProfile(id, updates) {
  const payload = {};
  const safe = ['name', 'email', 'job_title', 'working_days', 'daily_capacity_hours',
                 'week_start', 'date_format', 'time_format', 'duration_format', 'currency'];
  for (const key of safe) {
    if (updates[key] !== undefined) payload[key] = updates[key];
  }
  const { data, error } = await supabase
    .from('profiles').update(payload).eq('id', id)
    .select(PROFILE_SELECT_SAFE).single();
  if (error) throw error;
  return data;
}

export async function updateBillableRate(id, rate) {
  const { data, error } = await supabase
    .from('profiles').update({ billable_rate: rate }).eq('id', id)
    .select('id, billable_rate').single();
  if (error) throw error;
  return data;
}

export async function updateRole(id, role) {
  const { data, error } = await supabase
    .from('profiles').update({ role }).eq('id', id)
    .select('id, role').single();
  if (error) throw error;
  return data;
}

// ──────────────────────────────────────────────────────────────
// GROUPS
// ──────────────────────────────────────────────────────────────

export async function getGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, leader_id, leader:profiles!leader_id(id, name, email), group_members(user_id)')
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function setGroupLeader(groupId, leaderId) {
  const { error } = await supabase
    .from('groups')
    .update({ leader_id: leaderId || null })
    .eq('id', groupId);
  if (error) throw error;
}

export async function createGroup(name) {
  const { data, error } = await supabase
    .from('groups').insert({ name }).select('id, name').single();
  if (error) throw error;
  return data;
}

export async function deleteGroup(id) {
  const { error } = await supabase.from('groups').delete().eq('id', id);
  if (error) throw error;
}

export async function addGroupMember(groupId, userId) {
  const { error } = await supabase
    .from('group_members').upsert({ group_id: groupId, user_id: userId });
  if (error) throw error;
}

export async function removeGroupMember(groupId, userId) {
  const { error } = await supabase
    .from('group_members').delete()
    .eq('group_id', groupId).eq('user_id', userId);
  if (error) throw error;
}

export async function getUserGroups(userId) {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, group:groups(id, name)')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(r => r.group);
}

// ──────────────────────────────────────────────────────────────
// NAME-CHANGE REQUESTS
// ──────────────────────────────────────────────────────────────

/** Employee submits a request to change their display name. */
export async function submitNameChangeRequest({ requestedName, reason }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('name_change_requests')
    .insert({ requested_by: user.id, requested_name: requestedName, reason })
    .select('id').single();
  if (error) throw error;
  return data;
}

/** Returns the caller's own pending name-change request, or null if none. */
export async function getMyPendingNameRequest() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('name_change_requests')
    .select('id, requested_name, reason, created_at')
    .eq('requested_by', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Returns the caller's most recent name-change request (any status), or null. */
export async function getMyLatestNameRequest() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('name_change_requests')
    .select('id, requested_name, reason, status, review_note, reviewed_at, created_at')
    .eq('requested_by', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Admin: returns all pending name-change requests with requester info. */
export async function getPendingNameChangeRequests() {
  const { data, error } = await supabase
    .from('name_change_requests')
    .select('id, requested_name, reason, created_at, requested_by, requester:profiles!requested_by(id, name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Admin: approve or reject a name-change request (F-05 atomic RPC).
 * On approval the RPC updates profiles.name AND employees.full_name AND the
 * request status in ONE transaction — no partial/half-applied state, and the
 * employee record sync no longer needs a separate best-effort write at the
 * call site. See f05_request_review_rpcs.sql → review_name_change_request.
 */
export async function reviewNameChangeRequest(id, approved, note = '') {
  const { error } = await supabase.rpc('review_name_change_request', {
    p_request_id: id,
    p_approved:   approved,
    p_note:       note || null,
  });
  if (error) throw error;
}

// ──────────────────────────────────────────────────────────────
// DELETION REQUESTS
// ──────────────────────────────────────────────────────────────

export async function getPendingRequests() {
  const { data, error } = await supabase
    .from('deletion_requests')
    .select('id, entity_type, entity_id, reason, status, created_at, requester:profiles!requested_by(name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function submitDeletionRequest({ entityType, entityId, reason }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('deletion_requests')
    .insert({ requested_by: user.id, entity_type: entityType, entity_id: entityId, reason })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function reviewRequest(id, approved, note = '') {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('deletion_requests')
    .update({ status: approved ? 'approved' : 'rejected', reviewed_by: user.id, review_note: note })
    .eq('id', id)
    .select('id, status')
    .single();
  if (error) throw error;
  return data;
}

export async function cancelNameChangeRequest(id) {
  const { data, error } = await supabase.from('name_change_requests')
    .update({ status: 'cancelled' }).eq('id', id).select('id, status').single();
  if (error) throw error; return data;
}

export async function cancelDeletionRequest(id) {
  const { data, error } = await supabase.from('deletion_requests')
    .update({ status: 'cancelled' }).eq('id', id).select('id, status').single();
  if (error) throw error; return data;
}
