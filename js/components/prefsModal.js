// components/prefsModal.js — Preferences modal (§4.2)
// General tab is fully read-only. Name changes are requested from the Profile modal.

import { updateProfile }  from '../api/users.js';
import { setFormatPrefs, esc, attr } from '../format.js';
import { supabase }       from '../config.js';
import { checkPassword, renderPwFeedback } from '../passwordPolicy.js';

const ROLE_LABELS = { owner:'Owner', admin:'Admin', manager:'Manager', member:'Member', client:'Client' };

export function openPrefsModal(profile) {
  document.getElementById('modal-mount').innerHTML = `
    <div class="modal-backdrop" id="prefs-modal-backdrop">
      <div class="modal modal-lg">
        <div class="modal-header">
          <span class="modal-title">Preferences</span>
          <button class="modal-close" id="prefs-close">✕</button>
        </div>

        <!-- Tabs -->
        <div class="tabs" style="padding:0 var(--sp-5); margin-bottom:0; border-bottom:1px solid var(--border);">
          <button class="tab-btn active" data-tab="general">General</button>
          <button class="tab-btn" data-tab="timesheet">Timesheet</button>
          <button class="tab-btn" data-tab="format">Format</button>
          <button class="tab-btn" data-tab="security">Security</button>
          <button class="tab-btn" data-tab="apps">Apps</button>
        </div>

        <div class="modal-body" style="padding-top:var(--sp-4);">

          <!-- General tab (read-only) -->
          <div class="tab-panel active" id="tab-general">
            <div style="font-size:var(--font-xs);color:var(--text-muted);text-transform:uppercase;
                        letter-spacing:1px;font-weight:600;margin-bottom:var(--sp-3);">Profile info</div>
            <div class="form-group">
              <label>Name</label>
              <div style="color:var(--text-primary);padding:8px 0;">${esc(profile.name || '—')}</div>
            </div>
            <div class="form-group">
              <label>Job title</label>
              <div style="color:var(--text-primary);padding:8px 0;">${esc(profile.job_title || '—')}</div>
            </div>
            <div class="form-group">
              <label>Email</label>
              <div style="color:var(--text-primary);padding:8px 0;">${esc(profile.email || '—')}</div>
            </div>
            <div class="form-group">
              <label>Access role</label>
              <div style="color:var(--text-primary);padding:8px 0;">
                ${ROLE_LABELS[profile.role] || profile.role}
              </div>
            </div>
          </div>

          <!-- Timesheet tab (placeholder) -->
          <div class="tab-panel" id="tab-timesheet">
            <div class="empty-state" style="padding:var(--sp-6) 0;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
              <div class="empty-state-title">Timesheet settings</div>
              <div class="empty-state-sub">Coming in a future update</div>
            </div>
          </div>

          <!-- Format tab -->
          <div class="tab-panel" id="tab-format">
            <div style="font-size:var(--font-xs);color:var(--text-muted);text-transform:uppercase;
                        letter-spacing:1px;font-weight:600;margin-bottom:var(--sp-3);">Date and time format</div>
            <div class="form-group">
              <label>Start of the week</label>
              <select id="pref-weekstart">
                <option value="1" ${(profile.week_start||1)===1?'selected':''}>Monday</option>
                <option value="7" ${profile.week_start===7?'selected':''}>Sunday</option>
              </select>
            </div>
            <div class="form-group">
              <label>Date format</label>
              <select id="pref-datefmt">
                <option value="dd/mm/yyyy" ${(profile.date_format||'dd/mm/yyyy')==='dd/mm/yyyy'?'selected':''}>dd/mm/yyyy</option>
                <option value="mm/dd/yyyy" ${profile.date_format==='mm/dd/yyyy'?'selected':''}>mm/dd/yyyy</option>
                <option value="yyyy-mm-dd" ${profile.date_format==='yyyy-mm-dd'?'selected':''}>yyyy-mm-dd</option>
              </select>
            </div>
            <div class="form-group">
              <label>Time format</label>
              <select id="pref-timefmt">
                <option value="24h" ${(profile.time_format||'24h')==='24h'?'selected':''}>24-hour</option>
                <option value="12h" ${profile.time_format==='12h'?'selected':''}>12-hour (AM/PM)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Duration format</label>
              <select id="pref-durfmt">
                <option value="h:mm"    ${(profile.duration_format||'h:mm')==='h:mm'?'selected':''}>h:mm</option>
                <option value="hh:mm"   ${profile.duration_format==='hh:mm'?'selected':''}>hh:mm</option>
                <option value="decimal" ${profile.duration_format==='decimal'?'selected':''}>Decimal (e.g. 1.50)</option>
              </select>
            </div>
          </div>

          <!-- Security tab -->
          <div class="tab-panel" id="tab-security">
            <div style="font-size:var(--font-xs);color:var(--text-muted);text-transform:uppercase;
                        letter-spacing:1px;font-weight:600;margin-bottom:var(--sp-3);">Change password</div>
            <div class="form-group">
              <label>New password</label>
              <input type="password" id="sec-new-pw" placeholder="At least 12 characters" autocomplete="new-password">
            </div>
            <div id="sec-pw-feedback" style="margin:-2px 0 12px;"></div>
            <div class="form-group">
              <label>Confirm new password</label>
              <input type="password" id="sec-confirm-pw" placeholder="Repeat new password" autocomplete="new-password">
            </div>
            <div id="sec-pw-match" style="font-size:var(--font-sm);min-height:16px;margin:-6px 0 10px;"></div>
            <button class="btn btn-primary" id="sec-change-pw-btn" style="width:auto;">Update password</button>
            <div id="sec-pw-msg" style="font-size:var(--font-sm);margin-top:var(--sp-2);"></div>

            <div style="height:1px;background:var(--border);margin:var(--sp-5) 0;"></div>

            <div style="font-size:var(--font-xs);color:var(--text-muted);text-transform:uppercase;
                        letter-spacing:1px;font-weight:600;margin-bottom:var(--sp-3);">Two-factor authentication</div>
            <div id="sec-2fa-status" style="color:var(--text-muted);font-size:var(--font-sm);margin-bottom:var(--sp-3);">Checking…</div>
            <div id="sec-2fa-controls"></div>
            <div id="sec-2fa-msg" style="font-size:var(--font-sm);margin-top:var(--sp-2);"></div>
          </div>

          <!-- Apps tab (placeholder) -->
          <div class="tab-panel" id="tab-apps">
            <div class="empty-state" style="padding:var(--sp-6) 0;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              <div class="empty-state-title">App integrations</div>
              <div class="empty-state-sub">Coming in a future update</div>
            </div>
          </div>

        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" id="prefs-cancel">Cancel</button>
          <button class="btn btn-primary" id="prefs-save">OK</button>
        </div>
      </div>
    </div>`;

  const close = () => document.getElementById('modal-mount').innerHTML = '';
  document.getElementById('prefs-close').onclick   = close;
  document.getElementById('prefs-cancel').onclick  = close;
  document.getElementById('prefs-modal-backdrop').onclick = e => {
    if (e.target === e.currentTarget) close();
  };

  // Only the Format tab has editable fields → SAVE; all others → OK (just close).
  const TAB_IS_EDITABLE = { general: false, timesheet: false, format: true, security: false, apps: false };

  function _updateSaveBtn(tab) {
    const btn = document.getElementById('prefs-save');
    if (!btn) return;
    if (TAB_IS_EDITABLE[tab]) {
      btn.textContent = 'SAVE';
      btn.onclick = saveHandler;
    } else {
      btn.textContent = 'OK';
      btn.onclick = close;
    }
  }

  // Tab switching
  document.querySelectorAll('#modal-mount .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#modal-mount .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#modal-mount .tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
      _updateSaveBtn(btn.dataset.tab);
      if (btn.dataset.tab === 'security') _render2fa();
    });
  });

  // ── Security tab: change password + 2FA enable/disable ───────
  document.getElementById('sec-change-pw-btn').onclick = _changePassword;
  const _secNewPw     = document.getElementById('sec-new-pw');
  const _secConfirmPw = document.getElementById('sec-confirm-pw');
  const _secPwFb      = document.getElementById('sec-pw-feedback');
  const _secPwMatch   = document.getElementById('sec-pw-match');
  const _secChangeBtn = document.getElementById('sec-change-pw-btn');
  const _secPwCtx = { email: profile.email, name: profile.name };
  function _updateSecPwState() {
    const np = _secNewPw.value, cp = _secConfirmPw.value;
    renderPwFeedback(_secPwFb, np, _secPwCtx);
    const allMet = checkPassword(np, _secPwCtx).allMet;
    const match  = cp.length > 0 && np === cp;
    _secPwMatch.textContent = cp.length === 0 ? '' : (match ? '✓ Passwords match' : '✗ Passwords don’t match');
    _secPwMatch.style.color = match ? 'var(--success,#66bb6a)' : 'var(--danger,#ef5350)';
    _secChangeBtn.disabled  = !(allMet && match);
  }
  _secNewPw.addEventListener('input', _updateSecPwState);
  _secConfirmPw.addEventListener('input', _updateSecPwState);
  _updateSecPwState();   // start disabled until valid AND matching

  async function _changePassword() {
    const msg = document.getElementById('sec-pw-msg');
    const np  = document.getElementById('sec-new-pw').value;
    const cp  = document.getElementById('sec-confirm-pw').value;
    msg.textContent = '';
    if (!checkPassword(np, _secPwCtx).allMet) {
      msg.style.color = 'var(--danger,#ef5350)';
      msg.textContent = 'Password doesn’t meet all the requirements below.';
      renderPwFeedback(_secPwFb, np, _secPwCtx);
      return;
    }
    if (np !== cp)      { msg.style.color = 'var(--danger,#ef5350)'; msg.textContent = 'Passwords do not match.'; return; }
    const btn = document.getElementById('sec-change-pw-btn');
    const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Updating…';
    try {
      const { error } = await supabase.auth.updateUser({ password: np, data: { force_password_change: false } });
      if (error) throw error;
      msg.style.color = 'var(--success,#66bb6a)'; msg.textContent = 'Password updated.';
      window.showToast?.('Password updated', 'success');
      document.getElementById('sec-new-pw').value = '';
      document.getElementById('sec-confirm-pw').value = '';
      _updateSecPwState();
    } catch (e) {
      msg.style.color = 'var(--danger,#ef5350)'; msg.textContent = e?.message || 'Could not update password.';
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  // Render current 2FA state → Enable or Disable control.
  async function _render2fa() {
    const statusEl = document.getElementById('sec-2fa-status');
    const ctrl     = document.getElementById('sec-2fa-controls');
    if (!statusEl || !ctrl) return;
    statusEl.textContent = 'Checking…'; ctrl.innerHTML = '';
    let verified = false;
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      verified = (data?.totp || []).some(f => f.status === 'verified');
    } catch { /* show as off */ }
    if (verified) {
      statusEl.innerHTML = '🔒 Two-factor authentication is <strong style="color:var(--success,#66bb6a)">enabled</strong>.';
      ctrl.innerHTML = `<button class="btn btn-ghost" id="sec-2fa-disable" style="width:auto;">Disable 2FA</button>`;
      document.getElementById('sec-2fa-disable').onclick = _disable2fa;
    } else {
      statusEl.innerHTML = 'Two-factor authentication is <strong>off</strong>. Add an authenticator app for extra security.';
      ctrl.innerHTML = `<button class="btn btn-primary" id="sec-2fa-enable" style="width:auto;">Enable 2FA</button>`;
      document.getElementById('sec-2fa-enable').onclick = _enable2fa;
    }
  }

  async function _enable2fa() {
    const ctrl = document.getElementById('sec-2fa-controls');
    const msg  = document.getElementById('sec-2fa-msg');
    msg.textContent = '';
    ctrl.innerHTML = `<div style="color:var(--text-muted);font-size:var(--font-sm);">Loading…</div>`;
    // Clear any stale unverified factors so enroll doesn't collide.
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of (data?.all || [])) {
        if (f.factor_type === 'totp' && f.status === 'unverified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
        }
      }
    } catch { /* ignore */ }
    let enrollData;
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Hubble WMS' });
      if (error) throw error;
      enrollData = data;
    } catch (e) {
      msg.style.color = 'var(--danger,#ef5350)'; msg.textContent = e?.message || 'Could not start enrollment.';
      _render2fa(); return;
    }
    const factorId = enrollData.id;
    ctrl.innerHTML = `
      <div style="text-align:center;margin:var(--sp-3) 0;">
        <img id="sec-2fa-qr" alt="2FA QR code"
             style="background:#fff;padding:12px;border-radius:8px;border:2px solid var(--border);width:200px;height:200px;">
        <div style="font-size:var(--font-xs);color:var(--text-muted);margin-top:var(--sp-2);">Can't scan? Enter this key manually:</div>
        <div style="font-family:monospace;font-size:var(--font-sm);color:var(--text-primary);letter-spacing:1px;
                    background:var(--bg-input,#1e2329);border:1px solid var(--border);border-radius:4px;padding:8px 10px;
                    word-break:break-all;margin-top:4px;">${esc(enrollData.totp.secret)}</div>
      </div>
      <div class="form-group">
        <label>Verification code</label>
        <input type="text" id="sec-2fa-code" placeholder="000000" maxlength="6" inputmode="numeric" autocomplete="one-time-code">
      </div>
      <button class="btn btn-primary" id="sec-2fa-verify" style="width:auto;">Verify &amp; enable</button>
      <button class="btn btn-ghost" id="sec-2fa-cancel" style="width:auto;">Cancel</button>`;
    // Set the QR via the DOM property — Supabase's qr_code is an SVG data-URI whose
    // double-quotes would break the HTML attribute if interpolated into innerHTML
    // (it leaks the rest of the tag as visible text). Property assignment is quote-safe.
    document.getElementById('sec-2fa-qr').src = enrollData.totp.qr_code;
    document.getElementById('sec-2fa-cancel').onclick = async () => {
      await supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
      msg.textContent = ''; _render2fa();
    };
    document.getElementById('sec-2fa-verify').onclick = async () => {
      const code = document.getElementById('sec-2fa-code').value.trim();
      if (code.length !== 6) { msg.style.color = 'var(--danger,#ef5350)'; msg.textContent = 'Enter the 6-digit code.'; return; }
      try {
        const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId });
        if (ce) throw ce;
        const { error: ve } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
        if (ve) { msg.style.color = 'var(--danger,#ef5350)'; msg.textContent = 'Incorrect code. Try again.'; return; }
        msg.style.color = 'var(--success,#66bb6a)'; msg.textContent = 'Two-factor authentication enabled.';
        window.showToast?.('2FA enabled', 'success');
        _render2fa();
      } catch (e) {
        msg.style.color = 'var(--danger,#ef5350)'; msg.textContent = e?.message || 'Verification failed.';
      }
    };
  }

  async function _disable2fa() {
    const msg = document.getElementById('sec-2fa-msg');
    msg.textContent = '';
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of (data?.totp || [])) {
        await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
      }
      msg.style.color = 'var(--text-muted)'; msg.textContent = 'Two-factor authentication disabled. You can re-enable it anytime.';
      window.showToast?.('2FA disabled', 'success');
      _render2fa();
    } catch (e) {
      msg.style.color = 'var(--danger,#ef5350)'; msg.textContent = e?.message || 'Could not disable 2FA.';
    }
  }

  // ── SAVE handler (Format tab only) ───────────────────────────
  async function saveHandler() {
    try {
      const updates = {
        week_start:      parseInt(document.getElementById('pref-weekstart')?.value || 1),
        date_format:     document.getElementById('pref-datefmt')?.value           || 'dd/mm/yyyy',
        time_format:     document.getElementById('pref-timefmt')?.value           || '24h',
        duration_format: document.getElementById('pref-durfmt')?.value            || 'h:mm',
      };
      await updateProfile(profile.id, updates);
      setFormatPrefs(updates);
      window.showToast?.('Preferences saved', 'success');
      close();
    } catch (err) {
      window.showToast?.(err.message, 'error');
    }
  }

  // Default button state — General tab is active on open (OK, not SAVE)
  _updateSaveBtn('general');
}
