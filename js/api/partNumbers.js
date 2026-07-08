// api/partNumbers.js — Part Number Generator v2.
// Numbers hang off the real projects/clients tables (CCC = client.code,
// PPP = project.code). Category = 3-letter governed code (pn_type_codes).
// Items minted only via the pn_create_item RPC. Attribute lists
// (material/finish/vendor/fab_process/color) live in pn_attributes.

import { supabase } from '../config.js';

const PN_ITEM_SELECT = `
  id, project_id, cat_code, seq, part_number, customer_pn,
  name, description, material_id, finish_id, vendor_id, fab_process_id, color_id,
  revision, status, created_at, updated_at,
  type:pn_type_codes(code, description)
`;

// ──────────────────────────────────────────────────────────────
// PROJECTS (real timesheet projects, with codes)
// ──────────────────────────────────────────────────────────────

export async function getPnProjects({ includeArchived = false } = {}) {
  let q = supabase
    .from('projects')
    .select('id, name, code, is_archived, client:clients(id, name, code)')
    .order('name');
  if (!includeArchived) q = q.eq('is_archived', false);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ──────────────────────────────────────────────────────────────
// PER-PROJECT CUSTOMER-PN CONFIG
// ──────────────────────────────────────────────────────────────

export async function getProjectConfig(projectId) {
  const { data, error } = await supabase
    .from('pn_project_config')
    .select('project_id, customer_pn_mode, customer_pn_template')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw error;
  return data; // may be null → treat as 'none'
}

export async function upsertProjectConfig(projectId, { mode, template }) {
  const { data, error } = await supabase
    .from('pn_project_config')
    .upsert({
      project_id: projectId,
      customer_pn_mode: mode,
      customer_pn_template: mode === 'template' ? (template || null) : null,
    })
    .select('project_id, customer_pn_mode, customer_pn_template')
    .single();
  if (error) throw error;
  return data;
}

// ──────────────────────────────────────────────────────────────
// CATEGORY CODES (CAT — 3 letters)
// ──────────────────────────────────────────────────────────────

export async function getCategories({ includeInactive = false } = {}) {
  let q = supabase
    .from('pn_type_codes')
    .select('code, description, covers, is_active, sort_order')
    .order('sort_order')
    .order('code');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createCategory({ code, description, covers, sortOrder = 0 }) {
  const { data, error } = await supabase
    .from('pn_type_codes')
    .insert({ code: (code || '').trim().toUpperCase(), description, covers: covers || null, sort_order: sortOrder })
    .select('code, description, covers, is_active, sort_order')
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(code, updates) {
  const payload = {};
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.covers      !== undefined) payload.covers      = updates.covers || null;
  if (updates.isActive    !== undefined) payload.is_active   = updates.isActive;
  if (updates.sortOrder   !== undefined) payload.sort_order  = updates.sortOrder;
  const { data, error } = await supabase
    .from('pn_type_codes').update(payload).eq('code', code)
    .select('code, description, covers, is_active, sort_order').single();
  if (error) throw error;
  return data;
}

// ──────────────────────────────────────────────────────────────
// ATTRIBUTE LISTS (material / finish / vendor / fab_process / color)
// ──────────────────────────────────────────────────────────────

export async function getAttributes({ kind, includeInactive = false } = {}) {
  let q = supabase
    .from('pn_attributes')
    .select('id, kind, name, is_active, sort_order')
    .order('kind').order('sort_order').order('name');
  if (kind) q = q.eq('kind', kind);
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createAttribute({ kind, name, sortOrder = 0 }) {
  const { data, error } = await supabase
    .from('pn_attributes')
    .insert({ kind, name, sort_order: sortOrder })
    .select('id, kind, name, is_active, sort_order')
    .single();
  if (error) throw error;
  return data;
}

export async function updateAttribute(id, updates) {
  const payload = {};
  if (updates.name      !== undefined) payload.name       = updates.name;
  if (updates.isActive  !== undefined) payload.is_active  = updates.isActive;
  if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;
  const { data, error } = await supabase
    .from('pn_attributes').update(payload).eq('id', id)
    .select('id, kind, name, is_active, sort_order').single();
  if (error) throw error;
  return data;
}

// ──────────────────────────────────────────────────────────────
// ITEMS
// ──────────────────────────────────────────────────────────────

export async function getItems(projectId, { catCode, status } = {}) {
  let q = supabase
    .from('pn_items')
    .select(PN_ITEM_SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (catCode) q = q.eq('cat_code', catCode);
  if (status)  q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Mint a new part number + item atomically (RPC is the only insert path). */
export async function createItem({ projectId, catCode, name, description, customerPn,
                                   materialId, finishId, vendorId, fabProcessId, colorId }) {
  const { data, error } = await supabase.rpc('pn_create_item', {
    p_project_id:     projectId,
    p_cat_code:       catCode,
    p_name:           name,
    p_description:    description || null,
    p_customer_pn:    customerPn || null,
    p_material_id:    materialId || null,
    p_finish_id:      finishId || null,
    p_vendor_id:      vendorId || null,
    p_fab_process_id: fabProcessId || null,
    p_color_id:       colorId || null,
  });
  if (error) throw error;
  return data;
}

export async function updateItem(id, updates) {
  const payload = {};
  if (updates.name         !== undefined) payload.name           = updates.name;
  if (updates.description  !== undefined) payload.description    = updates.description || null;
  if (updates.customerPn   !== undefined) payload.customer_pn    = updates.customerPn || null;
  if (updates.status       !== undefined) payload.status         = updates.status;
  if (updates.materialId   !== undefined) payload.material_id    = updates.materialId || null;
  if (updates.finishId     !== undefined) payload.finish_id      = updates.finishId || null;
  if (updates.vendorId     !== undefined) payload.vendor_id      = updates.vendorId || null;
  if (updates.fabProcessId !== undefined) payload.fab_process_id = updates.fabProcessId || null;
  if (updates.colorId      !== undefined) payload.color_id       = updates.colorId || null;
  const { data, error } = await supabase
    .from('pn_items').update(payload).eq('id', id)
    .select(PN_ITEM_SELECT).single();
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
    .select('id, revision, note, snapshot, changed_at, actor:profiles(name)')
    .eq('item_id', itemId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
