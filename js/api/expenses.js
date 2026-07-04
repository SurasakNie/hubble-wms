// api/expenses.js — M4 Expense & Travel (petty-cash float model)
//
// Petty-cash ledger (cash_transactions): top-ups (in) + expenses (out), project-tagged.
// Travel: mileage claims (travel_claims, auto-calc) + trip pre-approval (travel_requests).

import { supabase } from '../config.js';

// ── SELECT constants ──────────────────────────────────────────
const TXN_SELECT = `
  id, employee_id, txn_date, direction, amount, currency,
  category_id, project_id, note, receipt_url, status, source, source_ref,
  manager_approved_by, manager_approved_at, finance_approved_by, finance_approved_at,
  rejected_by, rejected_at, rejection_reason, created_at, updated_at,
  employee:employees(id, full_name, employee_id, employment_type_code),
  category:expense_categories(id, name, applies_to),
  project:projects(id, name)
`;

const CLAIM_SELECT = `
  id, employee_id, travel_request_id, travel_date, project_id, route, trip_type,
  vehicle_code, distance_km, rate_per_km, depreciation_per_km, manual_amount,
  computed_reimbursement, computed_depreciation, currency, note, receipt_url, status,
  manager_approved_by, manager_approved_at, finance_approved_by, finance_approved_at,
  rejected_by, rejected_at, rejection_reason, created_at, updated_at,
  employee:employees(id, full_name, employee_id),
  project:projects(id, name),
  vehicle:vehicle_rates(code, label)
`;

const TRIP_SELECT = `
  id, employee_id, destination, start_date, end_date, purpose, project_id,
  estimated_cost, currency, cost_items, status, travel_ref,
  manager_approved_by, manager_approved_at, finance_approved_by, finance_approved_at,
  rejected_by, rejected_at, rejection_reason, created_at, updated_at,
  settlement_status, settlement_actual_amount, settlement_actual_items,
  settlement_note, settlement_submitted_at, settlement_approved_by, settlement_approved_at,
  employee:employees(id, full_name, employee_id),
  project:projects(id, name)
`;

// ── CATEGORIES ────────────────────────────────────────────────
export async function getCategories() {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('id, name, applies_to, sort_order, for_employee')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function upsertCategory({ id, name, appliesTo = 'out', isActive = true, sortOrder = 0 }) {
  const row = { name, applies_to: appliesTo, is_active: isActive, sort_order: sortOrder };
  if (id) row.id = id;
  const { data, error } = await supabase.from('expense_categories').upsert(row).select().single();
  if (error) throw error;
  return data;
}

// ── VEHICLE RATES ─────────────────────────────────────────────
export async function getVehicleRates() {
  const { data, error } = await supabase
    .from('vehicle_rates')
    .select('code, label, fuel_rate_per_km, depreciation_per_km, is_active, sort_order')
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function upsertVehicleRate({ code, label, fuelRatePerKm = 0, depreciationPerKm = 0, isActive = true, sortOrder = 0 }) {
  const { data, error } = await supabase
    .from('vehicle_rates')
    .upsert({ code, label, fuel_rate_per_km: fuelRatePerKm, depreciation_per_km: depreciationPerKm, is_active: isActive, sort_order: sortOrder })
    .select().single();
  if (error) throw error;
  return data;
}

// ── CASH LEDGER ───────────────────────────────────────────────

// Employee submits an expense-OUT line (pending approval).
export async function submitExpense({ employeeId, txnDate, categoryId, projectId, amount, currency, note, receiptUrl }) {
  if (!employeeId)           throw new Error('No employee record linked to your account.');
  if (!txnDate)              throw new Error('Please select the expense date.');
  if (!amount || Number(amount) <= 0) throw new Error('Amount must be greater than zero.');

  const { data, error } = await supabase
    .from('cash_transactions')
    .insert({
      employee_id: employeeId,
      txn_date:    txnDate,
      direction:   'out',
      amount:      Number(amount),
      currency:    currency || 'THB',
      category_id: categoryId || null,
      project_id:  projectId || null,
      note:        note || null,
      receipt_url: receiptUrl || null,
      status:      'pending',
      source:      'manual',
    })
    .select(TXN_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// Admin records a top-up (money IN). Auto-approved.
export async function recordTopup({ employeeId, txnDate, categoryId, projectId, amount, currency, note, actorId }) {
  if (!txnDate)              throw new Error('Please select the date.');
  if (!amount || Number(amount) <= 0) throw new Error('Amount must be greater than zero.');
  if (!employeeId)           throw new Error('A submitter employee record is required.');

  const { data, error } = await supabase
    .from('cash_transactions')
    .insert({
      employee_id: employeeId,
      txn_date:    txnDate,
      direction:   'in',
      amount:      Number(amount),
      currency:    currency || 'THB',
      category_id: categoryId || null,
      project_id:  projectId || null,
      note:        note || null,
      status:      'approved',
      source:      'manual',
      finance_approved_by: actorId || null,
      finance_approved_at: new Date().toISOString(),
    })
    .select(TXN_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function getMyTransactions(employeeId) {
  const { data, error } = await supabase
    .from('cash_transactions')
    .select(TXN_SELECT)
    .eq('employee_id', employeeId)
    .order('txn_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getAllTransactions({ direction, status, employeeId, projectId, fromDate, toDate } = {}) {
  let q = supabase.from('cash_transactions').select(TXN_SELECT);
  if (direction)  q = q.eq('direction', direction);
  if (status)     q = q.eq('status', status);
  if (employeeId) q = q.eq('employee_id', employeeId);
  if (projectId)  q = q.eq('project_id', projectId);
  if (fromDate)   q = q.gte('txn_date', fromDate);
  if (toDate)     q = q.lte('txn_date', toDate);
  const { data, error } = await q.order('txn_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Running balance = Σ approved 'in' − Σ approved 'out', optionally up to a cutoff date.
export async function getRunningBalance(uptoDate) {
  let q = supabase
    .from('cash_transactions')
    .select('direction, amount')
    .eq('status', 'approved');
  if (uptoDate) q = q.lte('txn_date', uptoDate);
  const { data, error } = await q;
  if (error) throw error;
  let inSum = 0, outSum = 0;
  for (const r of data || []) {
    if (r.direction === 'in') inSum += Number(r.amount);
    else outSum += Number(r.amount);
  }
  return { in: inSum, out: outSum, balance: inSum - outSum };
}

export async function approveTransaction(id, tier, actorId) {
  // Guard on the prior status so a retried call can't re-fire the ledger-posting
  // trigger: manager tier only advances pending; finance tier only advances
  // manager_approved. (The admin override path uses overrideTransactionStatus.)
  const patch = tier === 'finance'
    ? { status: 'approved', finance_approved_by: actorId, finance_approved_at: new Date().toISOString() }
    : { status: 'manager_approved', manager_approved_by: actorId, manager_approved_at: new Date().toISOString() };
  const prior = tier === 'finance' ? 'manager_approved' : 'pending';
  const { data, error } = await supabase
    .from('cash_transactions').update(patch).eq('id', id).eq('status', prior).select(TXN_SELECT).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This item was already updated — refresh and try again.');
  return data;
}

export async function rejectTransaction(id, actorId, reason) {
  const { data, error } = await supabase
    .from('cash_transactions')
    .update({ status: 'rejected', rejected_by: actorId, rejected_at: new Date().toISOString(), rejection_reason: reason || null })
    .eq('id', id).in('status', ['pending', 'manager_approved']).select(TXN_SELECT).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This item was already updated — refresh and try again.');
  return data;
}

export async function overrideTransactionStatus(id, status) {
  const { data, error } = await supabase
    .from('cash_transactions').update({ status }).eq('id', id).select(TXN_SELECT).single();
  if (error) throw error;
  return data;
}

// ── TRAVEL CLAIMS (mileage) ───────────────────────────────────

// Client-side preview of the reimbursement (the DB trigger is the source of truth).
export function previewMileage({ distanceKm, tripType, rate, depreciation, manualAmount }) {
  const mult = tripType === 'round_trip' ? 2 : 1;
  const eff  = (Number(distanceKm) || 0) * mult;
  const reimbursement = Math.round((eff * (Number(rate) || 0) + (Number(manualAmount) || 0)) * 100) / 100;
  const dep           = Math.round((eff * (Number(depreciation) || 0)) * 100) / 100;
  return { effectiveKm: eff, reimbursement, depreciation: dep, total: reimbursement + dep };
}

export async function submitMileageClaim({ employeeId, travelDate, projectId, route, tripType, vehicleCode, distanceKm, manualAmount, currency, note, receiptUrl, travelRequestId }) {
  if (!employeeId)  throw new Error('No employee record linked to your account.');
  if (!travelDate)  throw new Error('Please select the travel date.');
  if (!route)       throw new Error('Please enter the route.');
  if (!tripType)    throw new Error('Please choose one-way or round-trip.');
  if (!vehicleCode) throw new Error('Please select a vehicle type.');

  const { data, error } = await supabase
    .from('travel_claims')
    .insert({
      employee_id:       employeeId,
      travel_request_id: travelRequestId || null,
      travel_date:       travelDate,
      project_id:        projectId || null,
      route:             route.trim(),
      trip_type:         tripType,
      vehicle_code:      vehicleCode,
      distance_km:       distanceKm ? Number(distanceKm) : 0,
      manual_amount:     manualAmount ? Number(manualAmount) : 0,
      currency:          currency || 'THB',
      note:              note || null,
      receipt_url:       receiptUrl || null,
      status:            'pending',
    })
    .select(CLAIM_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function getMyTravelClaims(employeeId) {
  const { data, error } = await supabase
    .from('travel_claims').select(CLAIM_SELECT)
    .eq('employee_id', employeeId).order('travel_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getAllTravelClaims({ status, employeeId, fromDate, toDate } = {}) {
  let q = supabase.from('travel_claims').select(CLAIM_SELECT);
  if (status)     q = q.eq('status', status);
  if (employeeId) q = q.eq('employee_id', employeeId);
  if (fromDate)   q = q.gte('travel_date', fromDate);
  if (toDate)     q = q.lte('travel_date', toDate);
  const { data, error } = await q.order('travel_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function approveTravelClaim(id, tier, actorId) {
  // Prior-status guard (mirrors approveTransaction) so a retry can't re-post the
  // ledger. Admin status overrides go through overrideTravelClaimStatus, not here.
  const patch = tier === 'finance'
    ? { status: 'approved', finance_approved_by: actorId, finance_approved_at: new Date().toISOString() }
    : { status: 'manager_approved', manager_approved_by: actorId, manager_approved_at: new Date().toISOString() };
  const prior = tier === 'finance' ? 'manager_approved' : 'pending';
  const { data, error } = await supabase
    .from('travel_claims').update(patch).eq('id', id).eq('status', prior).select(CLAIM_SELECT).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This claim was already updated — refresh and try again.');
  return data;
}

export async function rejectTravelClaim(id, actorId, reason) {
  const { data, error } = await supabase
    .from('travel_claims')
    .update({ status: 'rejected', rejected_by: actorId, rejected_at: new Date().toISOString(), rejection_reason: reason || null })
    .eq('id', id).in('status', ['pending', 'manager_approved']).select(CLAIM_SELECT).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This claim was already updated — refresh and try again.');
  return data;
}

// Admin status override — sets an arbitrary status directly (mirrors
// overrideTransactionStatus). Kept separate from approveTravelClaim so the
// forward-approval guards above can't be bypassed accidentally, and so an
// override to 'rejected'/'pending' lands on the chosen status instead of being
// coerced to 'manager_approved' (the pre-fix behaviour of the reused approve fn).
export async function overrideTravelClaimStatus(id, status) {
  const { data, error } = await supabase
    .from('travel_claims').update({ status }).eq('id', id).select(CLAIM_SELECT).single();
  if (error) throw error;
  return data;
}

// ── TRIP REQUESTS (pre-approval) ──────────────────────────────
export async function submitTripRequest({ employeeId, destination, startDate, endDate, purpose, projectId, estimatedCost, currency, costItems }) {
  if (!employeeId)  throw new Error('No employee record linked to your account.');
  if (!destination) throw new Error('Please enter the destination.');
  if (!startDate || !endDate) throw new Error('Please select start and end dates.');
  if (endDate < startDate) throw new Error('End date must be on or after start date.');
  if (!purpose)     throw new Error('Please describe the purpose of travel.');

  const { data, error } = await supabase
    .from('travel_requests')
    .insert({
      employee_id:    employeeId,
      destination:    destination.trim(),
      start_date:     startDate,
      end_date:       endDate,
      purpose:        purpose.trim(),
      project_id:     projectId || null,
      estimated_cost: estimatedCost ? Number(estimatedCost) : null,
      currency:       currency || 'THB',
      cost_items:     Array.isArray(costItems) ? costItems : [],
      status:         'pending',
    })
    .select(TRIP_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function getMyTripRequests(employeeId) {
  const { data, error } = await supabase
    .from('travel_requests').select(TRIP_SELECT)
    .eq('employee_id', employeeId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getAllTripRequests({ status, employeeId } = {}) {
  let q = supabase.from('travel_requests').select(TRIP_SELECT);
  if (status)     q = q.eq('status', status);
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function approveTripRequest(id, tier, actorId) {
  const patch = tier === 'finance'
    ? { status: 'approved', finance_approved_by: actorId, finance_approved_at: new Date().toISOString() }
    : { status: 'manager_approved', manager_approved_by: actorId, manager_approved_at: new Date().toISOString() };

  // Generate TR-YYYYMM-NNNN reference on final (finance-tier) approval.
  if (tier === 'finance') {
    const { data: trip } = await supabase.from('travel_requests').select('start_date').eq('id', id).single();
    const d = trip?.start_date ? new Date(trip.start_date + 'T00:00:00') : new Date();
    const ym     = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `TR-${ym}-`;
    const { count } = await supabase
      .from('travel_requests')
      .select('id', { count: 'exact', head: true })
      .like('travel_ref', `${prefix}%`);
    patch.travel_ref = `${prefix}${String((count || 0) + 1).padStart(4, '0')}`;
  }

  const { data, error } = await supabase
    .from('travel_requests').update(patch).eq('id', id).select(TRIP_SELECT).single();
  if (error) throw error;
  return data;
}

export async function rejectTripRequest(id, actorId, reason) {
  const { data, error } = await supabase
    .from('travel_requests')
    .update({ status: 'rejected', rejected_by: actorId, rejected_at: new Date().toISOString(), rejection_reason: reason || null })
    .eq('id', id).select(TRIP_SELECT).single();
  if (error) throw error;
  return data;
}

export async function completeTripRequest(id) {
  const { data, error } = await supabase
    .from('travel_requests').update({ status: 'completed' }).eq('id', id).select(TRIP_SELECT).single();
  if (error) throw error;
  return data;
}

export async function overrideTripStatus(id, status) {
  const { data, error } = await supabase
    .from('travel_requests').update({ status }).eq('id', id).select(TRIP_SELECT).single();
  if (error) throw error;
  return data;
}

// ── TRIP SETTLEMENT ───────────────────────────────────────────

// Employee submits actual amounts after the trip is done.
// actualItems: array of {label, amount} matching the original cost_items.
export async function submitSettlement(id, { actualItems, note }) {
  const actualTotal = (actualItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const { data, error } = await supabase
    .from('travel_requests')
    .update({
      settlement_status:        'submitted',
      settlement_actual_items:  actualItems || [],
      settlement_actual_amount: Math.round(actualTotal * 100) / 100,
      settlement_note:          note || null,
      settlement_submitted_at:  new Date().toISOString(),
    })
    .eq('id', id)
    .select(TRIP_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// Admin approves settlement — atomic RPC posts the correcting cash_transactions
// entry AND closes the trip in one transaction (M-SETTLE, migration 20260703).
// The RPC is admin-guarded, computes the diff server-side, and is idempotent;
// the actor comes from auth.uid() server-side, so no actorId arg is needed.
export async function approveSettlement(id) {
  const { data, error } = await supabase.rpc('approve_trip_settlement', { p_trip_id: id });
  if (error) throw error;
  return data;
}

// ── USER CANCEL ───────────────────────────────────────────────

export async function cancelTransaction(id) {
  const { data, error } = await supabase.from('cash_transactions')
    .update({ status: 'cancelled' }).eq('id', id).select(TXN_SELECT).single();
  if (error) throw error; return data;
}

export async function cancelTravelClaim(id) {
  const { data, error } = await supabase.from('travel_claims')
    .update({ status: 'cancelled' }).eq('id', id).select(CLAIM_SELECT).single();
  if (error) throw error; return data;
}

export async function cancelTripRequest(id) {
  const { data, error } = await supabase.from('travel_requests')
    .update({ status: 'cancelled' }).eq('id', id).select(TRIP_SELECT).single();
  if (error) throw error; return data;
}

// ── ADMIN EDITS ───────────────────────────────────────────────

export async function updateTransaction(id, { txnDate, amount, categoryId, projectId, currency, note, receiptUrl }) {
  const { data, error } = await supabase
    .from('cash_transactions')
    .update({
      txn_date:    txnDate,
      amount:      Number(amount),
      currency:    currency || 'THB',
      category_id: categoryId || null,
      project_id:  projectId || null,
      note:        note || null,
      receipt_url: receiptUrl || null,
    })
    .eq('id', id)
    .select(TXN_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateTravelClaim(id, { travelDate, projectId, route, tripType, vehicleCode, distanceKm, manualAmount, currency, note, receiptUrl }) {
  const { data, error } = await supabase
    .from('travel_claims')
    .update({
      travel_date:   travelDate,
      project_id:    projectId || null,
      route:         route?.trim() || null,
      trip_type:     tripType,
      vehicle_code:  vehicleCode,
      distance_km:   distanceKm !== '' ? Number(distanceKm) : 0,
      manual_amount: manualAmount !== '' ? Number(manualAmount) : 0,
      currency:      currency || 'THB',
      note:          note || null,
      receipt_url:   receiptUrl || null,
    })
    .eq('id', id)
    .select(CLAIM_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function updateTripRequest(id, { destination, startDate, endDate, purpose, projectId, estimatedCost, currency }) {
  const { data, error } = await supabase
    .from('travel_requests')
    .update({
      destination:    destination?.trim(),
      start_date:     startDate,
      end_date:       endDate,
      purpose:        purpose?.trim() || null,
      project_id:     projectId || null,
      estimated_cost: estimatedCost ? Number(estimatedCost) : null,
      currency:       currency || 'THB',
    })
    .eq('id', id)
    .select(TRIP_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// ── PETTY CASH SETTINGS ────────────────────────────────────────
// Singleton row; monthly_topup_amount is the regular monthly float replenishment,
// pt_daily_rate is the PT/outsource day rate (half-day session = rate / 2).
export async function getPettyCashSettings() {
  const { data } = await supabase
    .from('petty_cash_settings')
    .select('monthly_topup_amount, pt_daily_rate')
    .single();
  return {
    monthlyTopup: Number(data?.monthly_topup_amount ?? 6000),
    ptDailyRate:  Number(data?.pt_daily_rate ?? 550),
  };
}

export async function savePettyCashSettings({ monthlyTopup, ptDailyRate }) {
  const row = { id: true, updated_at: new Date().toISOString() };
  if (monthlyTopup !== undefined) row.monthly_topup_amount = Number(monthlyTopup);
  if (ptDailyRate  !== undefined) row.pt_daily_rate        = Number(ptDailyRate);
  const { error } = await supabase.from('petty_cash_settings').upsert(row);
  if (error) throw error;
}

// ── PT/OUTSOURCE WAGE POSTING ──────────────────────────────────
// Admin posts the weekly PT wages straight into the ledger as approved 'out' lines.
// entries: [{ employeeId, amount, txnDate, categoryId, projectId, note }]
export async function postWages(entries, actorId) {
  const rows = entries
    .filter(e => Number(e.amount) > 0)
    .map(e => ({
      employee_id: e.employeeId,
      txn_date:    e.txnDate,
      direction:   'out',
      amount:      Number(e.amount),
      currency:    'THB',
      category_id: e.categoryId || null,
      project_id:  e.projectId || null,
      note:        e.note || null,
      status:      'approved',
      source:      'manual',
      finance_approved_by: actorId || null,
      finance_approved_at: new Date().toISOString(),
    }));
  if (!rows.length) throw new Error('No wage amounts greater than zero to post.');
  const { data, error } = await supabase.from('cash_transactions').insert(rows).select('id');
  if (error) throw error;
  return data;
}

// Existing wage lines for a week tag (e.g. 'Wk24/2026') — double-post guard.
export async function getWagePostings(weekTag) {
  const { data, error } = await supabase
    .from('cash_transactions')
    .select('id, txn_date, amount, note, employee:employees(id, full_name)')
    .eq('direction', 'out')
    .ilike('note', `%${weekTag}%`)
    .order('txn_date');
  if (error) throw error;
  return data || [];
}

// ── PENDING REIMBURSEMENTS ─────────────────────────────────────
// Approved expenses + mileage claims where finance has not yet transferred money.
export async function getPendingReimbursements() {
  const [{ data: txns, error: e1 }, { data: claims, error: e2 }] = await Promise.all([
    supabase
      .from('cash_transactions')
      .select('id, txn_date, amount, currency, note, category:expense_categories(name), employee:employees(id, full_name, employee_id)')
      .eq('direction', 'out')
      .eq('status', 'approved')
      .is('reimbursed_at', null)
      .neq('source', 'travel_claim')   // mirrored claim lines are counted via the travel_claims query below
      .order('txn_date'),
    supabase
      .from('travel_claims')
      .select('id, travel_date, computed_reimbursement, computed_depreciation, currency, route, vehicle_code, note, employee:employees(id, full_name, employee_id)')
      .eq('status', 'approved')
      .is('reimbursed_at', null)
      .order('travel_date'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { txns: txns || [], claims: claims || [] };
}

// Set reimbursed_at = now() on the supplied IDs (finance confirms payment sent).
export async function markReimbursed(txnIds = [], claimIds = []) {
  const now = new Date().toISOString();
  const ops = [];
  if (txnIds.length)   ops.push(supabase.from('cash_transactions').update({ reimbursed_at: now }).in('id', txnIds));
  if (claimIds.length) {
    ops.push(supabase.from('travel_claims').update({ reimbursed_at: now }).in('id', claimIds));
    // Also stamp the mirrored ledger lines the approval trigger auto-posted for these claims.
    ops.push(supabase.from('cash_transactions').update({ reimbursed_at: now }).eq('source', 'travel_claim').in('source_ref', claimIds));
  }
  const results = await Promise.all(ops);
  const failed = results.find(r => r.error);
  if (failed) throw failed.error;
}
