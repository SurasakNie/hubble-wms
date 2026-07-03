// api/timeEntries.js — CRUD for time_entries + time_entry_tags

import { supabase } from '../config.js';
import { timesToHours, todayISO, toISODate } from '../format.js';

// Base query with joined project + task + tags
const SELECT_FULL = `
  id, user_id, project_id, task_id, date,
  start_time, end_time, total_hours, description, is_billable,
  created_at, updated_at,
  project:projects(id, name, color, client_id, clients(name)),
  task:tasks(id, name),
  time_entry_tags(tag:tags(id, name, color))
`;

// ──────────────────────────────────────────────────────────────
// FETCH
// ──────────────────────────────────────────────────────────────

/**
 * Fetch time entries for a user, optionally filtered by date range.
 * Returns entries sorted by date DESC, start_time DESC.
 */
export async function getEntries({ userId, dateFrom, dateTo, projectId, limit = 50, offset = 0 } = {}) {
  let q = supabase
    .from('time_entries')
    .select(SELECT_FULL)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (userId)    q = q.eq('user_id', userId);
  if (dateFrom)  q = q.gte('date', dateFrom);
  if (dateTo)    q = q.lte('date', dateTo);
  if (projectId) q = q.eq('project_id', projectId);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Fetch entries for a specific week (Mon–Sun).
 * @param {string} monday - ISO date of Monday
 * @param {string} [userId] - defaults to current user via RLS
 */
export async function getWeekEntries(monday, userId) {
  const sun = new Date(monday + 'T00:00:00');
  sun.setDate(sun.getDate() + 6);
  const sundayISO = toISODate(sun);
  return getEntries({ userId, dateFrom: monday, dateTo: sundayISO, limit: 500 });
}

/**
 * Fetch all entries (admin) or own entries (member/manager).
 * For the Time Tracker list view.
 */
export async function getTrackerEntries({ limit = 50, offset = 0, userId } = {}) {
  return getEntries({ limit, offset, userId });
}

/**
 * Count total entries (for pagination).
 */
export async function countEntries({ userId } = {}) {
  let q = supabase
    .from('time_entries')
    .select('id', { count: 'exact', head: true });
  if (userId) q = q.eq('user_id', userId);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

// ──────────────────────────────────────────────────────────────
// CREATE
// ──────────────────────────────────────────────────────────────

/**
 * Create a new time entry.
 * If start_time + end_time are provided, total_hours is computed by DB trigger.
 * If total_hours is provided directly (no times), that value is used.
 */
export async function createEntry({ projectId, taskId, date, startTime, endTime, totalHours, description, isBillable = true, tagIds = [], userId = null }) {
  const { data: { user } } = await supabase.auth.getUser();

  const payload = {
    user_id:     userId || user.id,  // admin can pass explicit userId to log for a teammate
    project_id:  projectId,
    task_id:     taskId || null,
    date:        date || todayISO(),
    start_time:  startTime || null,
    end_time:    endTime   || null,
    total_hours: (startTime && endTime) ? null : (totalHours || null),
    description: description || null,
    is_billable: isBillable,
  };

  const { data, error } = await supabase
    .from('time_entries')
    .insert(payload)
    .select(SELECT_FULL)
    .single();

  if (error) throw error;

  // Attach tags
  if (tagIds.length > 0) {
    await setEntryTags(data.id, tagIds);
  }

  return data;
}

// ──────────────────────────────────────────────────────────────
// UPDATE
// ──────────────────────────────────────────────────────────────

/**
 * Update a time entry by ID.
 */
export async function updateEntry(id, { projectId, taskId, date, startTime, endTime, totalHours, description, isBillable, tagIds } = {}) {
  const payload = {};
  if (projectId   !== undefined) payload.project_id  = projectId;
  if (taskId      !== undefined) payload.task_id      = taskId;
  if (date        !== undefined) payload.date          = date;
  if (startTime   !== undefined) payload.start_time   = startTime;
  if (endTime     !== undefined) payload.end_time      = endTime;
  if (description !== undefined) payload.description   = description;
  if (isBillable  !== undefined) payload.is_billable   = isBillable;

  // If times cleared, allow explicit total_hours
  if (startTime === null && endTime === null && totalHours !== undefined) {
    payload.total_hours = totalHours;
  } else if (startTime || endTime) {
    payload.total_hours = null; // let trigger recompute
  }

  const { data, error } = await supabase
    .from('time_entries')
    .update(payload)
    .eq('id', id)
    .select(SELECT_FULL)
    .single();

  if (error) throw error;

  if (tagIds !== undefined) {
    await setEntryTags(id, tagIds);
  }

  return data;
}

/**
 * Update only start/end times (used by calendar drag-resize / drag-move).
 * @param {string} id
 * @param {string} startTime - "HH:MM"
 * @param {string} endTime   - "HH:MM"
 * @param {string} [date]    - ISO date (for drag-move to different day)
 */
export async function updateEntryTimes(id, startTime, endTime, date) {
  const payload = { start_time: startTime, end_time: endTime, total_hours: null };
  if (date) payload.date = date;

  const { data, error } = await supabase
    .from('time_entries')
    .update(payload)
    .eq('id', id)
    .select('id, start_time, end_time, total_hours, date')
    .single();

  if (error) throw error;
  return data;
}

// ──────────────────────────────────────────────────────────────
// DELETE
// ──────────────────────────────────────────────────────────────

export async function deleteEntry(id) {
  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ──────────────────────────────────────────────────────────────
// TAGS
// ──────────────────────────────────────────────────────────────

/**
 * Replace the full tag set for an entry.
 */
export async function setEntryTags(entryId, tagIds = []) {
  // Delete existing
  await supabase.from('time_entry_tags').delete().eq('time_entry_id', entryId);
  // Insert new
  if (tagIds.length > 0) {
    const rows = tagIds.map(tid => ({ time_entry_id: entryId, tag_id: tid }));
    const { error } = await supabase.from('time_entry_tags').insert(rows);
    if (error) throw error;
  }
}

// ──────────────────────────────────────────────────────────────
// AGGREGATIONS (for Timesheet matrix)
// ──────────────────────────────────────────────────────────────

/**
 * Get weekly hours per project per date for the Timesheet grid.
 * Returns: { [projectId]: { [isoDate]: totalHours, _total: number, project: {...} } }
 */
export async function getWeekMatrix(monday) {
  const entries = await getWeekEntries(monday);
  const matrix  = {};

  for (const entry of entries) {
    const pid = entry.project_id;
    if (!matrix[pid]) {
      matrix[pid] = { _total: 0, project: entry.project, _entries: {} };
    }
    if (!matrix[pid][entry.date]) {
      matrix[pid][entry.date] = { hours: 0, entryIds: [] };
    }
    const hrs = Number(entry.total_hours) || 0;
    matrix[pid][entry.date].hours += hrs;
    matrix[pid][entry.date].entryIds.push(entry.id);
    matrix[pid]._total += hrs;
  }

  return matrix;
}

/**
 * Copy all entries from last week to this week.
 */
export async function copyLastWeek(thisMonday) {
  const lastMonday = new Date(thisMonday + 'T00:00:00');
  lastMonday.setDate(lastMonday.getDate() - 7);
  const lastMon = toISODate(lastMonday);

  const lastWeekEntries = await getWeekEntries(lastMon);
  const { data: { user } } = await supabase.auth.getUser();

  const rows = lastWeekEntries.map(e => {
    // Shift date by 7 days
    const d = new Date(e.date + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    return {
      user_id:     user.id,
      project_id:  e.project_id,
      task_id:     e.task_id,
      date:        toISODate(d),
      start_time:  e.start_time,
      end_time:    e.end_time,
      total_hours: e.start_time ? null : e.total_hours,
      description: e.description,
      is_billable: e.is_billable,
    };
  });

  if (rows.length === 0) return 0;

  const { error } = await supabase.from('time_entries').insert(rows);
  if (error) throw error;
  return rows.length;
}
