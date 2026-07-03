// pages/expenses-travel.js — MY TRAVEL tab (mileage + trip request + settlement)

import { S, _fmt, _money, _badge, _settled, _today, _isWeekend, _nextWeekday, _curOpts, _projOptions, _projOptionsReq, _wireCurrencyConvert } from './expenses-state.js';
import { esc, attr, toISODate, todayISO } from '../format.js';
import {
  getMyTravelClaims,
  previewMileage, submitMileageClaim,
  cancelTravelClaim,
  submitTripRequest, getMyTripRequests,
  cancelTripRequest,
  submitSettlement,
} from '../api/expenses.js';

// ── Mileage route location boxes ──────────────────────────────
function _currentRoute() {
  return [...document.querySelectorAll('#ml-route-boxes .ml-loc')].map(i => i.value.trim());
}
// isRound: true → show Start + Destination (return is implied); middle stops removable.
// isRound: false (one-way) → show Start + [stops] + End; middle stops removable.
function _drawRoute(values, isRound) {
  const cont = document.getElementById('ml-route-boxes');
  if (!cont) return;
  const n = values.length;
  cont.innerHTML = values.map((v, i) => {
    const isFirst = i === 0;
    const isLast  = i === n - 1;
    const ph = isFirst ? 'Start point' : (isLast ? 'Destination' : `Stop ${i}`);
    const canRemove = n > 2 && !isFirst && !isLast;
    return `<div style="display:flex;gap:8px;align-items:center;">
      <input class="form-input ml-loc" type="text" value="${esc(v || '')}" placeholder="${esc(ph)}" style="flex:1;">
      ${canRemove ? `<button type="button" class="btn btn-ghost btn-sm ml-loc-remove" data-i="${i}" title="Remove stop">✕</button>` : ''}
    </div>`;
  }).join('');
  cont.querySelectorAll('.ml-loc-remove').forEach(b => b.addEventListener('click', () => {
    const vals = _currentRoute();
    vals.splice(parseInt(b.dataset.i), 1);
    _drawRoute(vals, document.getElementById('ml-trip')?.value === 'round_trip');
  }));
}

// Trip length in days, inclusive of both start and end dates.
function _tripDays() {
  const s = document.getElementById('tp-start')?.value, e = document.getElementById('tp-end')?.value;
  if (!s || !e) return 0;
  const d = Math.round((new Date(e) - new Date(s)) / 86400000) + 1;
  return d > 0 ? d : 0;
}

// Render trip cost_items to a short summary string.
// Supports: {label}, {label,perDay,days,amount}, {label,amount,qty,subtotal,qtyLabel}
function _costItemsText(items) {
  if (!items || !items.length) return '';
  return items.map(it => {
    if (!it || typeof it !== 'object') return String(it);
    if (it.perDay != null) return `Daily ฿${Number(it.perDay).toLocaleString()}/day×${it.days}d = ฿${Number(it.amount).toLocaleString()}`;
    if (it.subtotal != null) return `${it.label} ฿${Number(it.amount).toLocaleString()}×${it.qty} = ฿${Number(it.subtotal).toLocaleString()}`;
    return it.label;
  }).join(' · ');
}

// Line items available in a trip request. Each has an id, display label, and qty label.
// Special: 'daily' = ฿/day × days; 'other' = free text + amount.
const TRIP_ITEM_DEFS = [
  { id: 'tickets',  label: 'Tickets — flight / train / bus',  qtyLabel: 'legs'   },
  { id: 'hotel',    label: 'Hotel / accommodation',            qtyLabel: 'nights' },
  { id: 'local-tx', label: 'Local transport at destination',   qtyLabel: 'days'   },
  { id: 'car-rent', label: 'Car rental',                       qtyLabel: 'days'   },
  { id: 'reg-fee',  label: 'Registration / conference fee',    qtyLabel: 'times'  },
  { id: 'comms',    label: 'Communication / data',             qtyLabel: 'times'  },
  { id: 'printing', label: 'Printing / documents',             qtyLabel: 'times'  },
  { id: 'daily',    label: 'Daily allowance (transport + meals)', special: 'daily' },
  { id: 'other',    label: 'Other',                            special: 'other'   },
];

function _tripItemRow(def) {
  if (def.special === 'daily') return `
    <div class="tp-item-wrap" style="display:flex;flex-direction:column;gap:4px;">
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;">
        <input type="checkbox" class="tp-item" id="tp-item-daily" data-def="daily">
        ${esc(def.label)}
      </label>
      <div id="tp-daily-row" style="display:none;padding-left:26px;display:none;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="text-muted" style="font-size:12px;">฿/day</span>
          <input class="form-input" type="number" id="tp-daily-rate" placeholder="0.00" min="0" step="0.01" style="max-width:110px;">
          <span class="text-muted" id="tp-daily-calc" style="font-size:12px;"></span>
        </div>
      </div>
    </div>`;
  if (def.special === 'other') return `
    <div class="tp-item-wrap" style="display:flex;flex-direction:column;gap:4px;">
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;">
        <input type="checkbox" class="tp-item" id="tp-item-other" data-def="other">
        Other
      </label>
      <div id="tp-other-row" style="display:none;padding-left:26px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input class="form-input" type="text" id="tp-other-text" placeholder="Describe…" style="min-width:160px;">
          <span class="text-muted" style="font-size:12px;">฿</span>
          <input class="form-input" type="number" id="tp-other-amt" placeholder="0.00" min="0" step="0.01" style="max-width:110px;">
        </div>
      </div>
    </div>`;
  return `
    <div class="tp-item-wrap" style="display:flex;flex-direction:column;gap:4px;">
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer;">
        <input type="checkbox" class="tp-item" data-def="${esc(def.id)}">
        ${esc(def.label)}
      </label>
      <div class="tp-qty-row" id="tp-qty-${esc(def.id)}" style="display:none;padding-left:26px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="text-muted" style="font-size:12px;">฿</span>
          <input class="form-input tp-amt" type="number" placeholder="0.00" min="0" step="0.01" style="max-width:110px;" data-def="${esc(def.id)}">
          <span class="text-muted" style="font-size:12px;">×</span>
          <input class="form-input tp-qty" type="number" placeholder="1" min="1" step="1" style="max-width:70px;" data-def="${esc(def.id)}">
          <span class="text-muted" style="font-size:12px;">${esc(def.qtyLabel)}</span>
          <span class="tp-sub text-muted" style="font-size:12px;" data-def="${esc(def.id)}"></span>
        </div>
      </div>
    </div>`;
}

function _updateTripTotal() {
  let total = 0;
  document.querySelectorAll('.tp-item:checked').forEach(cb => {
    const def = cb.dataset.def;
    if (def === 'daily') {
      const rate = Number(document.getElementById('tp-daily-rate')?.value) || 0;
      total += rate * _tripDays();
    } else if (def === 'other') {
      total += Number(document.getElementById('tp-other-amt')?.value) || 0;
    } else {
      const amt = Number(document.querySelector(`.tp-amt[data-def="${def}"]`)?.value) || 0;
      const qty = Number(document.querySelector(`.tp-qty[data-def="${def}"]`)?.value) || 1;
      const sub = Math.round(amt * qty * 100) / 100;
      const span = document.querySelector(`.tp-sub[data-def="${def}"]`);
      if (span) span.textContent = sub > 0 ? `= ฿${sub.toLocaleString('en',{minimumFractionDigits:2})}` : '';
      total += sub;
    }
  });
  const el = document.getElementById('tp-total-display');
  if (el) el.textContent = total.toLocaleString('en', {minimumFractionDigits:2});
  return total;
}

export async function _renderMileage() {
  const wrap = document.getElementById('tv-body');
  wrap.innerHTML = `<div class="page-loading">Loading…</div>`;
  let claims = [];
  if (S.myEmployee) claims = await getMyTravelClaims(S.myEmployee.id).catch(() => []);
  const active  = claims.filter(c => !_settled(c.status));
  const settled = claims.filter(c =>  _settled(c.status));
  const unseenClaimIds = new Set(
    claims.filter(c => ['approved','rejected'].includes(c.status) && localStorage.getItem(`claim_seen_${c.id}`) !== '1').map(c => c.id)
  );
  // Personal vehicle options (exclude public transport code)
  const pvOpts = S.vehicles.filter(v => v.code !== 'public')
    .map(v => `<option value="${attr(v.code)}" data-rate="${v.fuel_rate_per_km}" data-dep="${v.depreciation_per_km}">${esc(v.label)} (฿${(Number(v.fuel_rate_per_km)+Number(v.depreciation_per_km)).toFixed(2)}/km)</option>`).join('');

  wrap.innerHTML = `
    <div style="max-width:540px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
      <div class="form-label" style="font-size:15px;font-weight:600;">New Mileage / Transport Claim</div>
      ${!S.myEmployee ? `<p class="text-muted">No employee record linked. Contact an admin.</p>` : `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <label class="form-label">Travel Date <span class="required">*</span>
          <input class="form-input" type="date" id="ml-date" value="${_today()}" max="${_today()}" style="color-scheme:dark"></label>
        <label class="form-label">Project / Purpose <span class="required">*</span>
          <select class="form-input" id="ml-proj">${_projOptions()}</select></label>
      </div>

      <label class="form-label">Travel Type <span class="required">*</span>
        <select class="form-input" id="ml-ttype">
          <option value="personal">Personal Vehicle</option>
          <option value="public">Public Transport</option>
        </select></label>

      <!-- ── Personal vehicle sub-form ── -->
      <div id="ml-pv-section">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <label class="form-label">Vehicle <span class="required">*</span>
            <select class="form-input" id="ml-veh">${pvOpts || '<option value="">No vehicles configured</option>'}</select></label>
          <label class="form-label">Trip Type <span class="required">*</span>
            <select class="form-input" id="ml-trip">
              <option value="one_way">One Way</option>
              <option value="round_trip">Round Trip</option>
            </select></label>
        </div>
        <div style="margin-bottom:14px;">
          <div class="form-label">Route <span class="required">*</span> <span class="form-hint">one location per box</span></div>
          <div id="ml-route-boxes" style="display:flex;flex-direction:column;gap:8px;margin-top:6px;"></div>
          <div id="ml-round-hint" style="display:none;font-size:12px;color:var(--text-secondary);margin-top:4px;">↩ Returns to start point automatically</div>
          <button type="button" class="btn btn-ghost btn-sm" id="ml-add-loc" style="margin-top:8px;">+ Add stop</button>
        </div>
        <label class="form-label" style="margin-bottom:14px;">Distance (km) <span class="required">*</span>
          <input class="form-input" type="number" id="ml-dist" placeholder="0" min="0" step="0.1"></label>
        <div class="card" style="background:var(--surface-2);padding:10px 14px;">
          <strong>Preview:</strong> <span id="ml-preview">Reimbursement 0.00 + Depreciation 0.00 = <strong>0.00 THB</strong></span>
        </div>
      </div>

      <!-- ── Public transport sub-form ── -->
      <div id="ml-pt-section" style="display:none;">
        <div style="display:flex;flex-direction:column;gap:14px;">
          <label class="form-label">Transport Type <span class="required">*</span>
            <input class="form-input" type="text" id="ml-pttype" placeholder="e.g. Taxi, Bus, Songtaew, MRT…"></label>
          <div>
            <div class="form-label">Route <span class="required">*</span></div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">
              <input class="form-input ml-pt-loc" type="text" placeholder="Start point">
              <input class="form-input ml-pt-loc" type="text" placeholder="Destination">
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Always one-way — full fare is reimbursed.</div>
          </div>
          <label class="form-label">Amount Paid <span class="required">*</span>
            <input class="form-input" type="number" id="ml-manual" placeholder="0.00" min="0" step="0.01"></label>
          <div class="card" style="background:var(--surface-2);padding:10px 14px;">
            <strong>Preview:</strong> <span id="ml-pt-preview">Full fare reimbursed = <strong>0.00 THB</strong></span>
          </div>
        </div>
      </div>

      <label class="form-label">Receipt URL <span class="form-hint">(optional)</span>
        <input class="form-input" type="url" id="ml-rcpt" placeholder="https://…"></label>
      <label class="form-label">Note
        <input class="form-input" type="text" id="ml-note" placeholder="Trip details…"></label>
      <div style="display:flex;gap:10px;"><button class="btn btn-primary" id="ml-submit">Submit Claim</button></div>
      `}
    </div>

    <div class="section-header">My Mileage Claims <span class="text-muted">(${active.length} pending)</span></div>
    <div>${active.length === 0 ? `<p class="empty-state">No pending claims.</p>` : _claimTable(active, unseenClaimIds)}</div>

    <div class="section-header mt-4" style="display:flex;align-items:center;gap:12px">Settled
      <button class="btn btn-ghost btn-sm" id="ml-toggle">${S.showPastClaims?`Hide past (${settled.length})`:`Show past (${settled.length})`}</button>
    </div>
    <div style="${S.showPastClaims?'':'display:none'}">${settled.length === 0 ? `<p class="empty-state">None.</p>` : _claimTable(settled, unseenClaimIds)}</div>
  `;

  unseenClaimIds.forEach(id => localStorage.setItem(`claim_seen_${id}`, '1'));
  if (unseenClaimIds.size) window.refreshExpenseBadge?.();

  if (S.myEmployee) {
    const getTType  = () => document.getElementById('ml-ttype')?.value ?? 'personal';
    const getIsRound = () => document.getElementById('ml-trip')?.value === 'round_trip';

    const updPreview = () => {
      if (getTType() === 'public') {
        const amt = Number(document.getElementById('ml-manual')?.value) || 0;
        const el = document.getElementById('ml-pt-preview');
        if (el) el.innerHTML = `Full fare reimbursed = <strong>${amt.toFixed(2)} THB</strong>`;
        return;
      }
      const veh = document.getElementById('ml-veh');
      const opt = veh?.options[veh?.selectedIndex];
      const p = previewMileage({
        distanceKm:   document.getElementById('ml-dist')?.value ?? 0,
        tripType:     document.getElementById('ml-trip')?.value ?? 'one_way',
        rate:         opt?.dataset.rate ?? 0,
        depreciation: opt?.dataset.dep  ?? 0,
        manualAmount: 0,
      });
      const el = document.getElementById('ml-preview');
      if (el) el.innerHTML = `Reimbursement ${p.reimbursement.toFixed(2)} + Depreciation ${p.depreciation.toFixed(2)} = <strong>${p.total.toFixed(2)} THB</strong> <span class="text-muted">(${p.effectiveKm} effective km)</span>`;
    };

    const applyTType = () => {
      const pub = getTType() === 'public';
      document.getElementById('ml-pv-section').style.display = pub ? 'none' : '';
      document.getElementById('ml-pt-section').style.display = pub ? '' : 'none';
      updPreview();
    };

    const applyTripType = () => {
      const isRound = getIsRound();
      const hint = document.getElementById('ml-round-hint');
      if (hint) hint.style.display = isRound ? '' : 'none';
      _drawRoute(_currentRoute(), isRound);
      updPreview();
    };

    // Initial render: 2 boxes (Start + Destination), one-way
    _drawRoute(['', ''], false);
    applyTType();

    document.getElementById('ml-ttype')?.addEventListener('change', applyTType);
    document.getElementById('ml-trip')?.addEventListener('change', applyTripType);
    document.getElementById('ml-veh')?.addEventListener('change', updPreview);
    document.getElementById('ml-dist')?.addEventListener('input', updPreview);
    document.getElementById('ml-dist')?.addEventListener('change', updPreview);
    document.getElementById('ml-manual')?.addEventListener('input', updPreview);
    document.getElementById('ml-manual')?.addEventListener('change', updPreview);

    document.getElementById('ml-add-loc')?.addEventListener('click', () => {
      const isRound = getIsRound();
      const vals = _currentRoute();
      if (isRound && vals.length >= 2) {
        vals.splice(vals.length - 1, 0, ''); // insert stop before destination
      } else {
        vals.push('');
      }
      _drawRoute(vals, isRound);
    });

    document.getElementById('ml-submit')?.addEventListener('click', _submitMileage);
  }
  document.getElementById('ml-toggle')?.addEventListener('click', () => { S.showPastClaims = !S.showPastClaims; _renderMileage(); });
  wrap.querySelectorAll('.exp-cancel-claim').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await cancelTravelClaim(btn.dataset.id);
        window.showToast?.('Claim cancelled.', 'success');
        _renderMileage();
      } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
    });
  });
}

function _claimTable(claims, unseenIds = new Set()) {
  return `<div class="table-wrapper"><table class="data-table">
    <thead><tr><th>Date</th><th>Route</th><th>Vehicle</th><th>Trip</th><th>Distance</th><th>Reimb.+Dep.</th><th>Status</th><th></th></tr></thead>
    <tbody>${claims.map(c => `<tr${unseenIds.has(c.id) ? ' style="background:rgba(76,175,80,0.07)"' : ''}>
      <td>${_fmt(c.travel_date)}</td>
      <td>${esc(c.route)}</td>
      <td>${c.vehicle_code === 'public' ? esc(c.note?.split(' — ')[0] || 'Public transport') : esc(c.vehicle?.label || c.vehicle_code)}</td>
      <td>${c.vehicle_code === 'public' ? 'One way (public)' : c.trip_type === 'round_trip' ? 'Round trip' : 'One way'}</td>
      <td>${c.vehicle_code === 'public' ? '—' : `${Number(c.distance_km||0)} km`}</td>
      <td style="color:var(--color-success,#66bb6a)">${_money(Number(c.computed_reimbursement)+Number(c.computed_depreciation), c.currency)}</td>
      <td>${_badge(c.status)}${unseenIds.has(c.id) ? ' <span class="badge" style="background:#4caf50;color:#000;font-size:10px;vertical-align:middle;margin-left:4px">NEW</span>' : ''}${c.rejection_reason ? `<br><small class="text-muted">${esc(c.rejection_reason)}</small>` : ''}</td>
      <td style="white-space:nowrap;">${c.status === 'pending' ? `<button class="btn btn-sm btn-ghost exp-cancel-claim" data-id="${esc(c.id)}">Cancel</button>` : c.status === 'manager_approved' ? `<span style="font-size:11px;color:var(--text-muted);">Contact admin</span>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

async function _submitMileage() {
  const btn = document.getElementById('ml-submit'); btn.disabled = true;
  try {
    const projectId = document.getElementById('ml-proj').value;
    if (!projectId) throw new Error('Please select a project / purpose.');
    const ttype    = document.getElementById('ml-ttype').value;
    const isPublic = ttype === 'public';
    const baseNote = document.getElementById('ml-note').value.trim();

    let vehicleCode, tripType, route, distKm, manualAmt, finalNote;

    if (isPublic) {
      const ptType = document.getElementById('ml-pttype')?.value.trim();
      if (!ptType) throw new Error('Please enter the transport type (e.g. Taxi, Bus).');
      const locs = [...document.querySelectorAll('.ml-pt-loc')].map(i => i.value.trim()).filter(Boolean);
      if (locs.length < 2) throw new Error('Enter start point and destination.');
      const manualVal = document.getElementById('ml-manual')?.value;
      if (!(Number(manualVal) > 0)) throw new Error('Enter the amount paid for public transport.');
      vehicleCode = 'public';
      tripType    = 'one_way';
      route       = locs.join(' → ');
      distKm      = 0;
      manualAmt   = manualVal;
      finalNote   = baseNote ? `${ptType} — ${baseNote}` : ptType;
    } else {
      const locs = _currentRoute().filter(Boolean);
      if (locs.length < 2) throw new Error('Enter at least a start and end location.');
      const distVal = document.getElementById('ml-dist')?.value;
      if (!(Number(distVal) > 0)) throw new Error('Enter the distance in km.');
      vehicleCode  = document.getElementById('ml-veh').value;
      tripType     = document.getElementById('ml-trip').value;
      // Round trip: auto-append start to close the loop (A → B → A)
      route        = tripType === 'round_trip' ? [...locs, locs[0]].join(' → ') : locs.join(' → ');
      distKm       = distVal;
      manualAmt    = 0;
      finalNote    = baseNote || null;
    }

    await submitMileageClaim({
      employeeId:   S.myEmployee.id,
      travelDate:   document.getElementById('ml-date').value,
      projectId,
      route,
      tripType,
      vehicleCode,
      distanceKm:   distKm,
      manualAmount: manualAmt,
      note:         finalNote,
      receiptUrl:   document.getElementById('ml-rcpt').value.trim() || null,
    });
    window.showToast?.('Claim submitted.', 'success');
    _renderMileage();
  } catch (err) { window.showToast?.(err.message, 'error'); btn.disabled = false; }
}

export async function _renderTrip() {
  const wrap = document.getElementById('tv-body');
  wrap.innerHTML = `<div class="page-loading">Loading…</div>`;
  let trips = [];
  if (S.myEmployee) trips = await getMyTripRequests(S.myEmployee.id).catch(() => []);
  const today = _today();
  const unseenTripIds = new Set(
    trips.filter(t => ['approved','rejected'].includes(t.status) && localStorage.getItem(`trip_seen_${t.id}`) !== '1').map(t => t.id)
  );
  // Needs settlement: finance-approved, trip ended, no settlement submitted yet
  const needSettle = trips.filter(t => t.status === 'approved' && t.end_date < today && !t.settlement_status);
  const needSettleIds = new Set(needSettle.map(t => t.id));
  // Past: rejected / completed, OR approved+past with a settlement already in progress/closed
  const settled = trips.filter(t =>
    !needSettleIds.has(t.id) &&
    (['rejected','completed','cancelled'].includes(t.status) || (t.status === 'approved' && t.end_date < today))
  );
  const settledIds = new Set(settled.map(t => t.id));
  // Active: everything else (pending, manager_approved, approved-with-future-dates)
  const active = trips.filter(t => !needSettleIds.has(t.id) && !settledIds.has(t.id));

  wrap.innerHTML = `
    <div style="max-width:560px;display:flex;flex-direction:column;gap:18px;margin-bottom:32px;">
      <div class="form-label" style="font-size:15px;font-weight:600;">New Trip Request <span class="text-muted" style="font-weight:400;">(pre-approval for larger trips)</span></div>
      ${!S.myEmployee ? `<p class="text-muted">No employee record linked. Contact an admin.</p>` : `
      <label class="form-label">Destination <span class="required">*</span>
        <input class="form-input" type="text" id="tp-dest" placeholder="City, Country"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <label class="form-label">Start <span class="required">*</span>
          <input class="form-input" type="date" id="tp-start" value="${_nextWeekday()}" style="color-scheme:dark"></label>
        <label class="form-label">End <span class="required">*</span>
          <input class="form-input" type="date" id="tp-end" value="${_nextWeekday()}" style="color-scheme:dark"></label>
      </div>
      <label class="form-label">Purpose <span class="required">*</span>
        <input class="form-input" type="text" id="tp-purpose" placeholder="Client visit, conference…"></label>
      <label class="form-label">Project <span class="required">*</span>
        <select class="form-input" id="tp-proj" required>${_projOptionsReq()}</select></label>
      <div>
        <div class="form-label">This trip will include <span class="form-hint">(check all that apply)</span></div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
          ${TRIP_ITEM_DEFS.map(_tripItemRow).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg-card,#1e1e2e);border-radius:6px;border:1px solid var(--border,#333);">
        <span class="form-label" style="margin:0;">Est. Total</span>
        <span id="tp-total-display" style="font-weight:600;font-size:15px;">0.00</span>
        <select class="form-input" id="tp-cur" style="width:90px;">${_curOpts()}</select>
      </div>
      <div style="display:flex;gap:10px;"><button class="btn btn-primary" id="tp-submit">Submit Request</button></div>
      `}
    </div>

    ${needSettle.length > 0 ? `
    <div class="section-header" style="color:var(--color-warning,#f59e0b);">
      Settlement Required <span class="text-muted">(${needSettle.length})</span>
    </div>
    <div id="tp-settle-area">
      ${needSettle.map(t => _settlementPanel(t)).join('')}
    </div>` : ''}

    <div class="section-header">My Trip Requests <span class="text-muted">(${active.length})</span></div>
    <div>${active.length === 0 ? `<p class="empty-state">No pending requests.</p>` : _tripTable(active, unseenTripIds)}</div>

    <div class="section-header mt-4" style="display:flex;align-items:center;gap:12px">Past
      <button class="btn btn-ghost btn-sm" id="tp-toggle">${S.showPastTrips?`Hide past (${settled.length})`:`Show past (${settled.length})`}</button>
    </div>
    <div style="${S.showPastTrips?'':'display:none'}">${settled.length === 0 ? `<p class="empty-state">None.</p>` : _tripTable(settled, unseenTripIds)}</div>
  `;

  unseenTripIds.forEach(id => localStorage.setItem(`trip_seen_${id}`, '1'));
  if (unseenTripIds.size) window.refreshExpenseBadge?.();

  if (S.myEmployee) {
    // Wire up each standard (qty-based) checkbox
    document.querySelectorAll('.tp-item').forEach(cb => {
      cb.addEventListener('change', () => {
        const def = cb.dataset.def;
        if (def === 'daily') {
          const row = document.getElementById('tp-daily-row');
          if (row) row.style.display = cb.checked ? '' : 'none';
        } else if (def === 'other') {
          const row = document.getElementById('tp-other-row');
          if (row) row.style.display = cb.checked ? '' : 'none';
        } else {
          const row = document.getElementById(`tp-qty-${def}`);
          if (row) row.style.display = cb.checked ? '' : 'none';
        }
        _updateTripTotal();
      });
    });

    // Daily rate + date changes update total
    document.getElementById('tp-daily-rate')?.addEventListener('input', () => {
      const days = _tripDays();
      const rate = Number(document.getElementById('tp-daily-rate').value) || 0;
      const calc = document.getElementById('tp-daily-calc');
      if (calc) calc.textContent = rate ? `× ${days} day${days===1?'':'s'} = ฿${(rate*days).toLocaleString('en',{minimumFractionDigits:2})}` : `(${days} day${days===1?'':'s'})`;
      _updateTripTotal();
    });
    const updDailyOnDate = () => {
      const days = _tripDays();
      const rate = Number(document.getElementById('tp-daily-rate')?.value) || 0;
      const calc = document.getElementById('tp-daily-calc');
      if (calc) calc.textContent = rate ? `× ${days} day${days===1?'':'s'} = ฿${(rate*days).toLocaleString('en',{minimumFractionDigits:2})}` : `(${days} day${days===1?'':'s'})`;
      _updateTripTotal();
    };
    document.getElementById('tp-start')?.addEventListener('change', updDailyOnDate);
    document.getElementById('tp-end')?.addEventListener('change', updDailyOnDate);

    // Qty + amount inputs update total + subtotal label
    wrap.querySelectorAll('.tp-amt, .tp-qty').forEach(inp => {
      inp.addEventListener('input', _updateTripTotal);
    });
    document.getElementById('tp-other-amt')?.addEventListener('input', _updateTripTotal);

    document.getElementById('tp-submit')?.addEventListener('click', _submitTrip);

    // Settlement submit buttons
    wrap.querySelectorAll('.tp-settle-submit').forEach(btn => {
      btn.addEventListener('click', () => _submitSettlement(btn.dataset.id));
    });
  }
  document.getElementById('tp-toggle')?.addEventListener('click', () => { S.showPastTrips = !S.showPastTrips; _renderTrip(); });
  wrap.querySelectorAll('.exp-cancel-trip').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await cancelTripRequest(btn.dataset.id);
        window.showToast?.('Trip request cancelled.', 'success');
        _renderTrip();
      } catch (e) { window.showToast?.(e.message, 'error'); btn.disabled = false; }
    });
  });
}

function _tripTable(trips, unseenIds = new Set()) {
  return `<div class="table-wrapper"><table class="data-table">
    <thead><tr><th>Ref</th><th>Destination</th><th>Dates</th><th>Advance</th><th>Purpose</th><th>Status</th><th>Settlement</th><th></th></tr></thead>
    <tbody>${trips.map(t => {
      const settleCell = t.settlement_status === 'closed'
        ? `<small class="badge badge-approved">Closed</small><br><small class="text-muted">Actual: ${t.settlement_actual_amount != null ? _money(t.settlement_actual_amount, t.currency) : '—'}</small>`
        : t.settlement_status === 'submitted'
        ? `<small class="badge badge-warning">Submitted</small>`
        : '—';
      return `<tr${unseenIds.has(t.id) ? ' style="background:rgba(76,175,80,0.07)"' : ''}>
        <td>${esc(t.travel_ref || '—')}</td>
        <td>${esc(t.destination)}</td>
        <td>${_fmt(t.start_date)} – ${_fmt(t.end_date)}</td>
        <td>${t.estimated_cost ? _money(t.estimated_cost, t.currency) : '—'}</td>
        <td>${esc(t.purpose)}${(t.cost_items && t.cost_items.length) ? `<br><small class="text-muted">Incl: ${esc(_costItemsText(t.cost_items))}</small>` : ''}</td>
        <td>${_badge(t.status)}${unseenIds.has(t.id) ? ' <span class="badge" style="background:#4caf50;color:#000;font-size:10px;vertical-align:middle;margin-left:4px">NEW</span>' : ''}${t.rejection_reason ? `<br><small class="text-muted">${esc(t.rejection_reason)}</small>` : ''}</td>
        <td>${settleCell}</td>
        <td style="white-space:nowrap;">${t.status === 'pending' ? `<button class="btn btn-sm btn-ghost exp-cancel-trip" data-id="${esc(t.id)}">Cancel</button>` : t.status === 'manager_approved' ? `<span style="font-size:11px;color:var(--text-muted);">Contact admin</span>` : ''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// Renders a settlement panel for a single trip (approved + past end_date).
function _settlementPanel(t) {
  const items = (t.cost_items || []);
  const rows = items.length
    ? items.map((it, i) => `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
        <span style="min-width:180px;font-size:13px;">${esc(it.label || `Item ${i+1}`)}</span>
        <span class="text-muted" style="font-size:12px;">Advance: ${it.amount != null ? `฿${Number(it.amount).toLocaleString('en',{minimumFractionDigits:2})}` : (it.subtotal != null ? `฿${Number(it.subtotal).toLocaleString('en',{minimumFractionDigits:2})}` : '—')}</span>
        <span class="text-muted" style="font-size:12px;">→ Actual ฿</span>
        <input class="form-input tp-settle-actual" type="number" placeholder="0.00" min="0" step="0.01"
          data-i="${i}" style="max-width:110px;">
      </div>`).join('')
    : `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
        <span style="font-size:13px;">Total actual expenses ฿</span>
        <input class="form-input tp-settle-actual-total" type="number" placeholder="0.00" min="0" step="0.01" style="max-width:130px;">
      </div>`;
  return `
    <div style="border:1px solid var(--color-warning,#f59e0b);border-radius:8px;padding:16px;margin-bottom:16px;" id="settle-panel-${esc(t.id)}">
      <div style="font-weight:600;margin-bottom:8px;">${esc(t.destination)} &nbsp;·&nbsp; ${_fmt(t.start_date)} – ${_fmt(t.end_date)}</div>
      <div style="margin-bottom:4px;font-size:13px;color:var(--text-muted);">Advance issued: ${t.estimated_cost ? _money(t.estimated_cost, t.currency) : '—'}</div>
      <div style="margin-bottom:12px;font-size:13px;">Enter actual amounts per item below:</div>
      ${rows}
      <label class="form-label" style="margin-top:8px;">Note (optional)
        <input class="form-input tp-settle-note" type="text" id="tp-settle-note-${esc(t.id)}" placeholder="Receipts attached, any explanation…">
      </label>
      <div style="margin-top:8px;display:flex;gap:10px;align-items:center;">
        <button class="btn btn-primary tp-settle-submit" data-id="${esc(t.id)}">Submit Settlement</button>
        <span class="tp-settle-diff text-muted" style="font-size:13px;" id="tp-settle-diff-${esc(t.id)}"></span>
      </div>
    </div>`;
}

async function _submitSettlement(tripId) {
  const panel = document.getElementById(`settle-panel-${tripId}`);
  const btn = panel?.querySelector('.tp-settle-submit');
  if (btn) btn.disabled = true;
  try {
    const advance = Number(panel?.closest('[data-advance]')?.dataset.advance) || 0;
    // Collect per-item actuals
    const actualInputs = panel?.querySelectorAll('.tp-settle-actual');
    let actualItems = [];
    if (actualInputs && actualInputs.length) {
      // We need the original cost_items labels — re-fetch from the trip data cached in the DOM
      // labels are in the row spans
      actualInputs.forEach((inp, i) => {
        const labelEl = inp.closest('div')?.querySelector('span');
        actualItems.push({ label: labelEl?.textContent?.trim() || `Item ${i+1}`, amount: Number(inp.value) || 0 });
      });
    } else {
      // Single total input (no line items)
      const tot = panel?.querySelector('.tp-settle-actual-total');
      actualItems = [{ label: 'Total', amount: Number(tot?.value) || 0 }];
    }
    const note = panel?.querySelector('.tp-settle-note')?.value?.trim() || '';
    const actualTotal = actualItems.reduce((s, i) => s + i.amount, 0);
    if (!(actualTotal >= 0)) throw new Error('Enter at least one actual amount.');
    await submitSettlement(tripId, { actualItems, note });
    window.showToast?.('Settlement submitted for approval.', 'success');
    _renderTrip();
  } catch (err) {
    window.showToast?.(err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

async function _submitTrip() {
  const btn = document.getElementById('tp-submit'); btn.disabled = true;
  try {
    const start = document.getElementById('tp-start').value;
    const end   = document.getElementById('tp-end').value;
    if (start && start < todayISO())  throw new Error('Start date cannot be in the past.');
    if (start && _isWeekend(start)) throw new Error('Start date cannot be a weekend day.');
    if (end   && _isWeekend(end))   throw new Error('End date cannot be a weekend day.');

    const costItems = [];
    let estimatedCost = 0;

    for (const cb of document.querySelectorAll('.tp-item:checked')) {
      const def = cb.dataset.def;
      if (def === 'daily') {
        const perDay = Number(document.getElementById('tp-daily-rate')?.value) || 0;
        if (!(perDay > 0)) throw new Error('Enter the estimated daily amount for "Daily allowance".');
        const days = _tripDays();
        const amount = Math.round(perDay * days * 100) / 100;
        costItems.push({ label: 'Daily allowance (transport + meals)', perDay, days, amount });
        estimatedCost += amount;
      } else if (def === 'other') {
        const text = document.getElementById('tp-other-text')?.value.trim();
        if (!text) throw new Error('Please describe the "Other" items to include.');
        const amount = Math.round((Number(document.getElementById('tp-other-amt')?.value) || 0) * 100) / 100;
        costItems.push({ label: `Other: ${text}`, amount, qty: 1, subtotal: amount });
        estimatedCost += amount;
      } else {
        const defMeta = TRIP_ITEM_DEFS.find(d => d.id === def);
        const label   = defMeta ? defMeta.label : def;
        const amount  = Math.round((Number(document.querySelector(`.tp-amt[data-def="${def}"]`)?.value) || 0) * 100) / 100;
        const qty     = Math.max(1, Math.round(Number(document.querySelector(`.tp-qty[data-def="${def}"]`)?.value) || 1));
        const subtotal = Math.round(amount * qty * 100) / 100;
        costItems.push({ label, amount, qty, subtotal, qtyLabel: defMeta?.qtyLabel || 'times' });
        estimatedCost += subtotal;
      }
    }

    if (costItems.length === 0) throw new Error('Please check at least one item this trip will include.');

    await submitTripRequest({
      employeeId:    S.myEmployee.id,
      destination:   document.getElementById('tp-dest').value.trim(),
      startDate:     start, endDate: end,
      purpose:       document.getElementById('tp-purpose').value.trim(),
      projectId:     document.getElementById('tp-proj').value || null,
      estimatedCost: estimatedCost > 0 ? estimatedCost : null,
      currency:      document.getElementById('tp-cur').value,
      costItems,
    });
    window.showToast?.('Trip request submitted.', 'success');
    _renderTrip();
  } catch (err) { window.showToast?.(err.message, 'error'); btn.disabled = false; }
}
