// api/clients.js

import { supabase } from '../config.js';

const CLIENT_SELECT = 'id, name, code, address, currency, is_active';

export async function getClients({ activeOnly = true } = {}) {
  let q = supabase.from('clients').select(CLIENT_SELECT).order('name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createClient({ name, code = null, address = '', currency = 'THB' }) {
  const { data, error } = await supabase
    .from('clients')
    .insert({ name, code: code || null, address, currency })
    .select(CLIENT_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateClient(id, { name, code, address, currency, isActive }) {
  const payload = {};
  if (name      !== undefined) payload.name      = name;
  if (code      !== undefined) payload.code      = code || null;
  if (address   !== undefined) payload.address   = address;
  if (currency  !== undefined) payload.currency  = currency;
  if (isActive  !== undefined) payload.is_active = isActive;
  const { data, error } = await supabase
    .from('clients').update(payload).eq('id', id)
    .select(CLIENT_SELECT).single();
  if (error) throw error;
  return data;
}

export async function deleteClient(id) {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
}
