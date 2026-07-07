// api/partNumbers.js — Part Number Generator: PN projects, type codes,
// items (created via the pn_create_item RPC — the only way to mint a
// number), and revision history.

import { supabase } from '../config.js';

const PN_PROJECT_SELECT = `
  id, name, company_code, project_code,
  customer_pn_mode, customer_pn_template, notes, is_archived, created_at
`;

const PN_ITEM_SELECT = `
  id, project_id, type_code, seq, part_number, customer_pn,
  name, description, revision, status, created_at, updated_at,
  type:pn_type_codes(code, description)
`;

// ──────────────────────────────────────────────────────────────
// PN PROJECTS
// ──────────────────────────────────────────────────────────────

export async function getPnProjects({ includeArchived = false } = {}) {
  let q = supabase
    .from('pn_projects')
    .select(PN_PROJECT_SELECT)
    .order('name');
  if (!includeArchived) q = q.eq('is_archived', false);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createPnProject({ name, companyCode, projectCode, customerPnMode = 'none', customerPnTemplate, notes }) {
  const { data, error } = await supabase
    .from('pn_projects')
    .insert({
      name,
      company_code: (companyCode || '').trim().toUpperCase(),
      project_code: (projectCode || '').trim().toUpperCase(),
      customer_pn_mode: customerPnMode,
      customer_pn_template: customerPnTemplate || null,
      notes: notes || null,
    })
    .select(PN_PROJECT_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updatePnProject(id, updates) {
  const payload = {};
  if (updates.name               !== undefined) payload.name                 = updates.name;
  if (updates.companyCode        !== undefined) payload.company_code         = (updates.companyCode || '').trim().toUpperCase();
  if (updates.projectCode        !== undefined) payload.project_code         = (updates.projectCode || '').trim().toUpperCase();
  if (updates.customerPnMode     !== undefined) payload.customer_pn_mode     = updates.customerPnMode;
  if (updates.customerPnTemplate !== undefined) payload.customer_pn_template = updates.customerPnTemplate || null;
  if (updates.notes              !== undefined) payload.notes                = updates.notes || null;
  if (updates.isArchived         !== undefined) payload.is_archived          = updates.isArchived;

  const { data, error } = await supabase
    .from('pn_projects')
    .update(payload)
    .eq('id', id)
    .select(PN_PROJECT_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// ──────────────────────────────────────────────────────────────
// TYPE CODES (AA)
// ──────────────────────────────────────────────────────────────

export async function getTypeCodes({ includeInactive = false } = {}) {
  let q = supabase
    .from('pn_type_codes')
    .select('code, description, is_active, sort_order')
    .order('sort_order')
    .order('code');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createTypeCode({ code, description, sortOrder = 0 }) {
  const { data, error } = await supabase
    .from('pn_type_codes')
    .insert({ code: (code || '').trim(), description, sort_order: sortOrder })
    .select('code, description, is_active, sort_order')
    .single();
  if (error) throw error;
  return data;
}

export async function updateTypeCode(code, updates) {
  const payload = {};
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.isActive    !== undefined) payload.is_active   = updates.isActive;
  if (updates.sortOrder   !== undefined) payload.sort_order  = updates.sortOrder;

  const { data, error } = await supabase
    .from('pn_type_codes')
    .update(payload)
    .eq('code', code)
    .select('code, description, is_active, sort_order')
    .single();
  if (error) throw error;
  return data;
}

// ──────────────────────────────────────────────────────────────
// ITEMS
// ──────────────────────────────────────────────────────────────

export async function getItems(projectId, { typeCode, status } = {}) {
  let q = supabase
    .from('pn_items')
    .select(PN_ITEM_SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (typeCode) q = q.eq('type_code', typeCode);
  if (status)   q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Mint a new part number + item atomically (RPC is the only insert path). */
export async function createItem({ projectId, typeCode, name, description, customerPn }) {
  const { data, error } = await supabase.rpc('pn_create_item', {
    p_project_id:  projectId,
    p_type_code:   typeCode,
    p_name:        name,
    p_description: description || null,
    p_customer_pn: customerPn || null,
  });
  if (error) throw error;
  return data;
}

export async function updateItem(id, updates) {
  const payload = {};
  if (updates.name        !== undefined) payload.name        = updates.name;
  if (updates.description !== undefined) payload.description = updates.description || null;
  if (updates.customerPn  !== undefined) payload.customer_pn = updates.customerPn || null;
  if (updates.status      !== undefined) payload.status      = updates.status;

  const { data, error } = await supabase
    .from('pn_items')
    .update(payload)
    .eq('id', id)
    .select(PN_ITEM_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteItem(id) {
  const { error } = await supabase.from('pn_items').delete().eq('id', id);
  if (error) throw error;
}

// ──────────────────────────────────────────────────────────────
// REVISIONS
// ──────────────────────────────────────────────────────────────

export async function bumpRevision(itemId, newRevision, note) {
  const { data, error } = await supabase.rpc('pn_bump_revision', {
    p_item_id:      itemId,
    p_new_revision: newRevision,
    p_note:         note || null,
  });
  if (error) throw error;
  return data;
}

export async function getRevisions(itemId) {
  const { data, error } = await supabase
    .from('pn_item_revisions')
    .select('id, revision, note, changed_by, changed_at, actor:profiles(name)')
    .eq('item_id', itemId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
