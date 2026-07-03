// components/profileModal.js — Profile modal (§4.1) — read-only view + request flows

import { submitNameChangeRequest } from '../api/users.js';
import { supabase } from '../config.js';
import { submitJobTitleChangeRequest } from '../api/jobTitleRequests.js';
import { esc } from '../format.js';

export async function openProfileModal(profile) {
  const wd = profile.working_days || [1,2,3,4,5];
  const days = [
    { label: 'Mo', val: 1 }, { label: 'Tu', val: 2 }, { label: 'We', val: 3 },
    { label: 'Th', val: 4 }, { label: 'Fr', val: 5 }, { label: 'Sa', val: 6 },
    { label: 'Su', val: 7 },
  ];

  const initials = (profile.name || '?').trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0,2).join('');

  // Fetch employee record for authoritative job_title, employee_id, department, start_date
  let emp = null;
  try {
    const { data } = await supabase.from('employees')
      .select('id, employee_id, job_title, start_date, department_code, department:departments(code, label)')
      .eq('user_id', profile.id)
      .maybeSingle();
    emp = data || null;
  } catch (_) { /* graceful degradation */ }

  const displayJobTitle = esc(emp?.job_title || profile.job_title || '—');

  document.getElementById('modal-mount').innerHTML = `
    <div class="modal-backdrop modal-backdrop-content" id="profile-modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Edit profile</span>
          <button class="modal-close" id="pm-close">✕</button>
        </div>
        <div class="modal-body">

          <!-- Identity -->
          <div style="display:flex; align-items:center; gap:var(--sp-4); margin-bottom:var(--sp-2);">
            <div style="width:56px;height:56px;border-radius:var(--radius);background:#1565c0;
                        color:#fff;font-size:20px;font-weight:600;display:flex;align-items:center;
                        justify-content:center;flex-shrink:0;">${esc(initials)}</div>
            <div>
              <div style="font-weight:600;font-size:var(--font-md)">${esc(profile.name) || '—'}</div>
              <div class="text-muted" style="font-size:var(--font-sm)">${esc(profile.email || '')}</div>
              <div class="text-muted" style="font-size:var(--font-xs);margin-top:2px;">
                User log-in credentials are managed by Google
              </div>
            </div>
          </div>

          ${emp ? `
          <!-- Employee record details -->
          <div style="background:var(--surface-2);border:1px solid var(--border-color);border-radius:var(--radius);
                      padding:10px 14px;margin-bottom:var(--sp-3);display:flex;flex-wrap:wrap;gap:16px;">
            <div>
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Employee ID</div>
              <div style="font-size:13px;font-weight:600;">${esc(emp.employee_id || '—')}</div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Department</div>
              <div style="font-size:13px;font-weight:600;">${esc((emp.department?.label || emp.department_code) || '—')}</div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Start Date</div>
              <div style="font-size:13px;font-weight:600;">${emp.start_date ? new Date(emp.start_date + 'T00:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'}</div>
            </div>
          </div>` : ''}

          <!-- Display name — read-only for all users; name change via request flow -->
          <div class="form-group">
            <label>Display name</label>
            <div style="color:var(--text-primary);padding:6px 0 2px;">${esc(profile.name || '—')}</div>
            <div id="pm-ncr-area">
              <button class="btn btn-sm btn-ghost" id="pm-req-name-change" style="margin-top:4px;font-size:12px;">Request name change…</button>
            </div>
          </div>

          <!-- Job title — read-only; change via request flow -->
          <div class="form-group">
            <label>Job title</label>
            <div style="color:var(--text-primary);padding:6px 0 2px;">${displayJobTitle}</div>
            <div id="pm-jtcr-area">
              <button class="btn btn-sm btn-ghost" id="pm-req-job-title" style="margin-top:4px;font-size:12px;">Request job title change…</button>
            </div>
          </div>

          <!-- Week start -->
          <div class="form-group">
            <label>Week start</label>
            <div style="color:var(--text-primary);padding:6px 0;">${profile.week_start===7 ? 'Sunday' : 'Monday'}</div>
          </div>

          <!-- Working days (read-only) -->
          <div class="form-group">
            <label>Working days</label>
            <div style="display:flex; gap:var(--sp-2); flex-wrap:wrap;">
              ${days.map(d => `
                <div style="
                  width:36px;height:36px;border-radius:50%;border:1px solid var(--border);
                  background:${wd.includes(d.val) ? 'var(--accent)' : 'transparent'};
                  color:${wd.includes(d.val) ? '#fff' : 'var(--text-muted)'};
                  cursor:default;font-size:var(--font-xs);font-weight:500;
                  display:flex;align-items:center;justify-content:center;
                ">${d.label}</div>
              `).join('')}
            </div>
          </div>

          <!-- Daily capacity (read-only) -->
          <div class="form-group">
            <label>Daily work capacity</label>
            <div style="color:var(--text-primary);padding:6px 0;">${profile.daily_capacity_hours||8} hours per day</div>
          </div>

        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="pm-cancel">Close</button>
        </div>
      </div>
    </div>`;

  const close = () => document.getElementById('modal-mount').innerHTML = '';
  document.getElementById('pm-close').onclick  = close;
  document.getElementById('pm-cancel').onclick = close;
  document.getElementById('profile-modal-backdrop').onclick = e => { if (e.target === e.currentTarget) close(); };

  // Name change request — inline form
  function _showNcrForm() {
    document.getElementById('pm-ncr-area').innerHTML = `
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
        <input class="form-input" type="text" id="pm-ncr-name" placeholder="Requested display name" style="font-size:13px;">
        <textarea class="form-input" id="pm-ncr-reason" rows="2" placeholder="Reason (optional)" style="font-size:13px;resize:vertical;"></textarea>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-primary" id="pm-ncr-submit">Submit request</button>
          <button class="btn btn-sm btn-ghost" id="pm-ncr-cancel">Cancel</button>
        </div>
      </div>`;
    document.getElementById('pm-ncr-cancel').addEventListener('click', _hideNcrForm);
    document.getElementById('pm-ncr-submit').addEventListener('click', async () => {
      const name   = document.getElementById('pm-ncr-name').value.trim();
      const reason = document.getElementById('pm-ncr-reason').value.trim();
      if (!name) { window.showToast?.('Enter the requested name', 'error'); return; }
      document.getElementById('pm-ncr-submit').disabled = true;
      try {
        await submitNameChangeRequest({ requestedName: name, reason });
        document.getElementById('pm-ncr-area').innerHTML =
          `<div style="color:var(--text-muted);font-size:12px;padding-top:4px;">Name change request submitted.</div>`;
        window.showToast?.('Name change request submitted', 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
        document.getElementById('pm-ncr-submit').disabled = false;
      }
    });
  }
  function _hideNcrForm() {
    document.getElementById('pm-ncr-area').innerHTML =
      `<button class="btn btn-sm btn-ghost" id="pm-req-name-change" style="margin-top:4px;font-size:12px;">Request name change…</button>`;
    document.getElementById('pm-req-name-change').addEventListener('click', _showNcrForm);
  }
  document.getElementById('pm-req-name-change').addEventListener('click', _showNcrForm);

  // Job title change request — inline form
  function _showJtcrForm() {
    document.getElementById('pm-jtcr-area').innerHTML = `
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
        <input class="form-input" type="text" id="pm-jtcr-title" placeholder="Requested job title" style="font-size:13px;">
        <textarea class="form-input" id="pm-jtcr-reason" rows="2" placeholder="Reason (optional)" style="font-size:13px;resize:vertical;"></textarea>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-primary" id="pm-jtcr-submit">Submit request</button>
          <button class="btn btn-sm btn-ghost" id="pm-jtcr-cancel">Cancel</button>
        </div>
      </div>`;
    document.getElementById('pm-jtcr-cancel').addEventListener('click', _hideJtcrForm);
    document.getElementById('pm-jtcr-submit').addEventListener('click', async () => {
      const title  = document.getElementById('pm-jtcr-title').value.trim();
      const reason = document.getElementById('pm-jtcr-reason').value.trim();
      if (!title) { window.showToast?.('Enter the requested job title', 'error'); return; }
      document.getElementById('pm-jtcr-submit').disabled = true;
      try {
        if (!emp) throw new Error('No employee record linked to your account.');
        await submitJobTitleChangeRequest({
          employeeId:     emp.id,
          requestedBy:    profile.id,
          currentTitle:   emp.job_title || profile.job_title || null,
          requestedTitle: title,
          reason,
        });
        document.getElementById('pm-jtcr-area').innerHTML =
          `<div style="color:var(--text-muted);font-size:12px;padding-top:4px;">Job title change request submitted.</div>`;
        window.showToast?.('Job title change request submitted', 'success');
      } catch (err) {
        window.showToast?.(err.message, 'error');
        document.getElementById('pm-jtcr-submit').disabled = false;
      }
    });
  }
  function _hideJtcrForm() {
    document.getElementById('pm-jtcr-area').innerHTML =
      `<button class="btn btn-sm btn-ghost" id="pm-req-job-title" style="margin-top:4px;font-size:12px;">Request job title change…</button>`;
    document.getElementById('pm-req-job-title').addEventListener('click', _showJtcrForm);
  }
  document.getElementById('pm-req-job-title').addEventListener('click', _showJtcrForm);
}
