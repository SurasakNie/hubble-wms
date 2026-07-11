// api/projects.js — CRUD for projects, tasks, task_assignments, project_assignments

import { supabase } from '../config.js';

// ──────────────────────────────────────────────────────────────
// PROJECTS
// ──────────────────────────────────────────────────────────────

const PROJECT_SELECT = `
  id, name, code, color, access, is_billable, estimated_hours,
  is_archived, is_favorite, created_at,
  client:clients(id, name, code)
`;

export async function getProjects({ includeArchived = false, clientId } = {}) {
  let q = supabase
    .from('projects')
    .select(PROJECT_SELECT)
    .order('name');

  if (!includeArchived) q = q.eq('is_archived', false);
  if (clientId)         q = q.eq('client_id', clientId);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getProject(id) {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_SELECT + ', tasks(id, name, task_assignments(assignee_type, assignee_id))')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createProject({ name, code = null, clientId, color = '#03a9f4', access = 'public', isBillable = true, estimatedHours }) {
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, code: code || null, client_id: clientId || null, color, access, is_billable: isBillable, estimated_hours: estimatedHours || null })
    .select(PROJECT_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, updates) {
  const payload = {};
  if (updates.name            !== undefined) payload.name             = updates.name;
  if (updates.code            !== undefined) payload.code             = updates.code || null;
  if (updates.color           !== undefined) payload.color            = updates.color;
  if (updates.access          !== undefined) payload.access           = updates.access;
  if (updates.isBillable      !== undefined) payload.is_billable      = updates.isBillable;
  if (updates.estimatedHours  !== undefined) payload.estimated_hours  = updates.estimatedHours;
  if (updates.isArchived      !== undefined) payload.is_archived      = updates.isArchived;
  if (updates.isFavorite      !== undefined) payload.is_favorite      = updates.isFavorite;
  if (updates.clientId        !== undefined) payload.client_id        = updates.clientId;

  const { data, error } = await supabase
    .from('projects')
    .update(payload)
    .eq('id', id)
    .select(PROJECT_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Get total tracked hours and billable amount for a project.
 */
export async function getProjectStats(projectId) {
  const { data, error } = await supabase
    .rpc('get_project_stats', { p_project_id: projectId })
    .single();
  if (error) throw error;
  return {
    totalHours:    Number(data?.total_hours)    || 0,
    billableAmount: Number(data?.billable_amount) || 0,
  };
}

// ──────────────────────────────────────────────────────────────
// TASKS
// ──────────────────────────────────────────────────────────────

export async function getTasks(projectId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, name, project_id, task_assignments(assignee_type, assignee_id)')
    .eq('project_id', projectId)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function getAssignedTasks(userId, groupIds = []) {
  // Get tasks directly assigned to the user or their groups
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id, name, project_id,
      project:projects(id, name, color, client:clients(name)),
      task_assignments!inner(assignee_type, assignee_id)
    `)
    .or(
      `task_assignments.assignee_id.eq.${userId},` +
      (groupIds.length ? `task_assignments.assignee_id.in.(${groupIds.join(',')})` : 'task_assignments.assignee_type.eq.user')
    );
  if (error) throw error;
  return data || [];
}

export async function createTask(projectId, name) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ name, project_id: projectId })
    .select('id, name, project_id')
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(id, name) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ name })
    .eq('id', id)
    .select('id, name')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

// Task assignments
export async function assignTask(taskId, assigneeType, assigneeId) {
  const { error } = await supabase
    .from('task_assignments')
    .upsert({ task_id: taskId, assignee_type: assigneeType, assignee_id: assigneeId });
  if (error) throw error;
}

export async function unassignTask(taskId, assigneeType, assigneeId) {
  const { error } = await supabase
    .from('task_assignments')
    .delete()
    .eq('task_id', taskId)
    .eq('assignee_type', assigneeType)
    .eq('assignee_id', assigneeId);
  if (error) throw error;
}

// ──────────────────────────────────────────────────────────────
// PROJECT ASSIGNMENTS (manager ↔ project)
// ──────────────────────────────────────────────────────────────

export async function getManagerProjects(managerId) {
  const { data, error } = await supabase
    .from('project_assignments')
    .select('project_id, project:projects(id, name, color)')
    .eq('manager_id', managerId);
  if (error) throw error;
  return data || [];
}

// Managers assigned to a given project (inverse of getManagerProjects).
// Returns an array of manager user-ids.
export async function getProjectManagers(projectId) {
  const { data, error } = await supabase
    .from('project_assignments')
    .select('manager_id')
    .eq('project_id', projectId);
  if (error) throw error;
  return (data || []).map(r => r.manager_id);
}

export async function assignManager(projectId, managerId) {
  const { error } = await supabase
    .from('project_assignments')
    .upsert({ project_id: projectId, manager_id: managerId });
  if (error) throw error;
}

export async function unassignManager(projectId, managerId) {
  const { error } = await supabase
    .from('project_assignments')
    .delete()
    .eq('project_id', projectId)
    .eq('manager_id', managerId);
  if (error) throw error;
}

// ──────────────────────────────────────────────────────────────
// HELPERS FOR ENTRY MODAL
// ──────────────────────────────────────────────────────────────

/**
 * Load projects + tasks grouped for the entry modal dropdown.
 * Members get only assigned tasks; others get all.
 */
export async function getProjectsForEntry(profile) {
  const isRestricted = profile.role === 'member' || profile.role === 'client';

  if (!isRestricted) {
    // All projects + tasks
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, color, client:clients(name), tasks(id, name)')
      .eq('is_archived', false)
      .order('name');
    if (error) throw error;
    return data || [];
  }

  // Members: projects that have tasks assigned to them
  const { data: userGroups } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', profile.id);
  const groupIds = (userGroups || []).map(g => g.group_id);

  const { data, error } = await supabase
    .from('projects')
    .select(`
      id, name, color, client:clients(name),
      tasks!inner(
        id, name,
        task_assignments!inner(assignee_type, assignee_id)
      )
    `)
    .eq('is_archived', false)
    .order('name');
  if (error) throw error;

  // Filter tasks to only those assigned to this user/group
  return (data || []).map(p => ({
    ...p,
    tasks: (p.tasks || []).filter(t =>
      (t.task_assignments || []).some(a =>
        (a.assignee_type === 'user' && a.assignee_id === profile.id) ||
        (a.assignee_type === 'group' && groupIds.includes(a.assignee_id))
      )
    ),
  })).filter(p => p.tasks.length > 0);
}
