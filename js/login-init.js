import { supabase } from './config.js';
import { signInWithGoogle, loadSession, getSession } from './auth.js';
import { checkPassword, renderPwFeedback } from './passwordPolicy.js';

// ── helpers ──────────────────────────────────────────────────
const EDGE = 'https://sjkggguedgtynktymzes.supabase.co/functions/v1';

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showErr(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.classList.add('visible');
}

function clearErr(elId) {
  document.getElementById(elId).classList.remove('visible');
}

function setLoading(btn, label, loading) {
  btn.disabled = loading;
  const span = btn.querySelector('span') ?? btn;
  if (loading) {
    span.textContent = label;
    span.classList.add('loading-dots');
  } else {
    span.classList.remove('loading-dots');
  }
}

// ── redirect if already logged in (route through gates) ─────
loadSession().then(async profile => {
  if (!profile) return;
  const session = getSession();
  const meta = session?.user?.user_metadata ?? {};
  if (meta.force_password_change) {
    _pwCtx = { email: session?.user?.email };
    renderPwFeedback(_pwFeedback, '', _pwCtx);
    showView('view-change-password');
    return;
  }
  await proceedAfterAuth();
});

// ── VIEW: Login ──────────────────────────────────────────────
const btnSignin  = document.getElementById('btn-signin');
const btnGoogle  = document.getElementById('btn-google');
const empIdInput = document.getElementById('f-emp-id');
const pwInput    = document.getElementById('f-password');

// Allow Enter key in password field to submit
pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnSignin.click(); });
empIdInput.addEventListener('keydown', e => { if (e.key === 'Enter') pwInput.focus(); });

// Employee / Client login toggle. Employee keeps the numeric-only ID field
// (unchanged); Client lets the user type a client ID (XX-0-NNN-CC) or an email.
// The server detects the identifier type — we only adjust the input UX here.
let _loginMode = 'employee';
const loginToggle = document.getElementById('login-toggle');
const lblId       = document.getElementById('lbl-id');
const loginSubId  = document.getElementById('login-sub-id');
loginToggle?.querySelectorAll('.login-toggle-btn').forEach(b => {
  b.addEventListener('click', () => {
    _loginMode = b.dataset.mode;
    loginToggle.querySelectorAll('.login-toggle-btn').forEach(x => x.classList.toggle('active', x === b));
    clearErr('login-error');
    empIdInput.value = '';
    if (_loginMode === 'client') {
      lblId.textContent = 'CLIENT ID OR EMAIL';
      empIdInput.placeholder = 'AC-0-001-28  or  you@company.com';
      empIdInput.setAttribute('inputmode', 'text');
      loginSubId.textContent = 'Enter your Client ID (or email) and password';
    } else {
      lblId.textContent = 'EMPLOYEE ID';
      empIdInput.placeholder = '12-3-456-78';
      empIdInput.setAttribute('inputmode', 'numeric');
      loginSubId.textContent = 'Enter your Employee ID and password';
    }
    empIdInput.focus();
  });
});

// Auto-format the Employee ID as DD-T-NNN-CC (2-1-3-2 digits) while typing.
// Digits-only entry (12345678) and hyphenated entry (12-3-456-78) both resolve to
// the same display; login is hyphen-tolerant server-side, so either way works.
// Client mode is free text (client ID or email) — no reformatting.
empIdInput.addEventListener('input', () => {
  if (_loginMode !== 'employee') return;
  const d = empIdInput.value.replace(/\D/g, '').slice(0, 8);
  let out = d.slice(0, 2);
  if (d.length > 2) out += '-' + d.slice(2, 3);
  if (d.length > 3) out += '-' + d.slice(3, 6);
  if (d.length > 6) out += '-' + d.slice(6, 8);
  empIdInput.value = out;
});

// Employee mode: numbers only — block typed letters/symbols (the auto-format
// inserts hyphens). Client mode: allow letters/@/. for the client ID or email.
empIdInput.addEventListener('beforeinput', e => {
  if (_loginMode !== 'employee') return;
  if (e.inputType === 'insertText' && e.data && /\D/.test(e.data)) e.preventDefault();
});

btnSignin.addEventListener('click', async () => {
  clearErr('login-error');
  const identifier = empIdInput.value.trim();
  const password   = pwInput.value;
  if (!identifier || !password) {
    showErr('login-error', _loginMode === 'client'
      ? 'Please enter your Client ID (or email) and password.'
      : 'Please enter your Employee ID and password.');
    return;
  }

  btnSignin.disabled = true;
  btnSignin.textContent = 'Signing in…';

  try {
    const res = await fetch(`${EDGE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json();

    if (!res.ok || !data.session) {
      showErr('login-error', data.error || 'Invalid ID or password.');
      return;
    }

    // Set the session in the Supabase client. Surface failures — don't proceed
    // to the change-password view with no session (that later breaks updateUser).
    const { error: _ssErr } = await supabase.auth.setSession({
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (_ssErr) {
      showErr('login-error', 'Could not establish your session: ' + (_ssErr.message || _ssErr));
      return;
    }

    // Check if forced password change is required (server sends just the flag)
    if (data.force_password_change) {
      _pwCtx = { employeeId: identifier };
      renderPwFeedback(_pwFeedback, '', _pwCtx);
      showView('view-change-password');
      return;
    }

    await proceedAfterAuth();
  } catch {
    showErr('login-error', 'Connection error. Please try again.');
  } finally {
    btnSignin.disabled = false;
    btnSignin.textContent = 'Sign in';
  }
});

btnGoogle.addEventListener('click', async () => {
  btnGoogle.disabled = true;
  try {
    await signInWithGoogle();
  } catch (err) {
    btnGoogle.disabled = false;
    showErr('login-error', err.message || 'Google sign-in failed.');
  }
});

// ── VIEW: Change password ────────────────────────────────────
// Context for the "not your ID/email/name" rule; populated when this view opens.
let _pwCtx = {};
const _newPwInput  = document.getElementById('f-new-password');
const _confPwInput = document.getElementById('f-confirm-password');
const _pwFeedback  = document.getElementById('pw-feedback');
const _pwMatch     = document.getElementById('pw-match');
const _changeBtn   = document.getElementById('btn-change-password');
function _updatePwState() {
  const newPw = _newPwInput.value, confPw = _confPwInput.value;
  renderPwFeedback(_pwFeedback, newPw, _pwCtx);
  const allMet = checkPassword(newPw, _pwCtx).allMet;
  const match  = confPw.length > 0 && newPw === confPw;
  _pwMatch.textContent = confPw.length === 0 ? '' : (match ? '✓ Passwords match' : '✗ Passwords don’t match');
  _pwMatch.style.color = match ? '#9ccc65' : '#ef5350';
  _changeBtn.disabled  = !(allMet && match);
}
_newPwInput.addEventListener('input', _updatePwState);
_confPwInput.addEventListener('input', _updatePwState);
_updatePwState();   // start disabled until the password is valid AND matches

document.getElementById('btn-change-password').addEventListener('click', async () => {
  clearErr('change-error');
  const newPw  = _newPwInput.value;
  const confPw = document.getElementById('f-confirm-password').value;

  if (!checkPassword(newPw, _pwCtx).allMet) {
    showErr('change-error', 'Your password doesn’t meet all the requirements listed below.');
    renderPwFeedback(_pwFeedback, newPw, _pwCtx);
    return;
  }
  if (newPw !== confPw) {
    showErr('change-error', 'Passwords do not match.');
    return;
  }

  const btn = document.getElementById('btn-change-password');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    // Guard: a forced-change session can be silently dropped (e.g. a failed token
    // refresh after an admin reset) → updateUser would throw "Auth session missing!".
    // Detect it and route back to a clean sign-in instead of the raw error.
    const { data: { session: _sess } } = await supabase.auth.getSession();
    if (!_sess) {
      showErr('change-error', 'Your session was lost — please sign in again with your temporary password.');
      setTimeout(() => showView('view-login'), 1800);
      return;
    }
    const { error } = await supabase.auth.updateUser({
      password: newPw,
      data: { force_password_change: false },
    });

    if (error) {
      // A dead/invalidated session — e.g. the password was reset again
      // elsewhere while this tab still held the old token — makes updateUser
      // fail with an auth error. The flag then never clears and the user is
      // trapped on this screen. Route auth failures to a clean sign-in
      // (with the latest temp password) instead of dead-ending here.
      const m = (error.message || '').toLowerCase();
      if (error.status === 401 || error.status === 403 ||
          /session|jwt|token|not authenticated|missing/.test(m)) {
        showErr('change-error', 'Your session expired — please sign in again with your latest temporary password.');
        setTimeout(() => showView('view-login'), 2000);
      } else {
        showErr('change-error', error.message);
      }
      return;
    }

    await proceedAfterAuth();
  } catch {
    showErr('change-error', 'Failed to update password. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Set password & continue';
  }
});

// ── TOTP enrollment + challenge ───────────────────────────────
let _totpFactorId      = null;  // pending enrollment factor
let _challengeFactorId = null;  // verified factor for challenge flow

async function proceedAfterAuth() {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') {
    // Verified factor exists — need challenge before entering app
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.find(f => f.status === 'verified');
    if (!factor) { window.location.href = 'app.html#calendar'; return; }
    _challengeFactorId = factor.id;
    showView('view-totp-challenge');
    document.getElementById('f-challenge-code').focus();
    return;
  }

  // No verified factor — start enrollment. A prior "Skip" may have left an
  // unverified factor behind (if its cleanup unenroll failed), which makes a
  // fresh enroll error out. Clean up stale unverified factors and retry once.
  try {
    let enrollData = await tryEnrollTotp();
    if (!enrollData) {
      await clearUnverifiedTotpFactors();
      enrollData = await tryEnrollTotp();
    }
    if (!enrollData) { window.location.href = 'app.html#calendar'; return; }

    _totpFactorId = enrollData.id;
    document.getElementById('totp-qr-img').src = enrollData.totp.qr_code;
    document.getElementById('totp-secret').textContent = enrollData.totp.secret;
    showView('view-totp');
  } catch {
    window.location.href = 'app.html#calendar';
  }
}

async function tryEnrollTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'Hubble WMS',
    friendlyName: 'Authenticator',
  });
  return error ? null : data;
}

// Remove any leftover unverified TOTP factors (e.g. an enrollment that was
// shown then skipped, where the skip-time unenroll failed) so a fresh
// enroll won't collide with them.
async function clearUnverifiedTotpFactors() {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of (factors?.totp ?? [])) {
    if (f.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
    }
  }
}

document.getElementById('btn-verify-totp').addEventListener('click', async () => {
  clearErr('totp-error');
  const code = document.getElementById('f-totp-code').value.trim();
  if (code.length !== 6) {
    showErr('totp-error', 'Enter the 6-digit code from your authenticator app.');
    return;
  }

  const btn = document.getElementById('btn-verify-totp');
  btn.disabled = true;
  btn.textContent = 'Verifying…';

  try {
    // Challenge first, then verify
    const { data: challengeData, error: challErr } =
      await supabase.auth.mfa.challenge({ factorId: _totpFactorId });
    if (challErr) throw challErr;

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId:    _totpFactorId,
      challengeId: challengeData.id,
      code,
    });

    if (verifyErr) {
      showErr('totp-error', 'Incorrect code. Check your authenticator and try again.');
      return;
    }

    window.location.href = 'app.html#calendar';
  } catch (e) {
    showErr('totp-error', e?.message || 'Verification failed. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify & continue';
  }
});

document.getElementById('btn-skip-totp').addEventListener('click', async () => {
  // Unenroll the pending factor so it doesn't linger, then proceed
  if (_totpFactorId) {
    await supabase.auth.mfa.unenroll({ factorId: _totpFactorId }).catch(() => {});
  }
  window.location.href = 'app.html#calendar';
});

// ── VIEW: TOTP challenge (return login) ──────────────────────
const challengeCodeInput = document.getElementById('f-challenge-code');
challengeCodeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-verify-challenge').click();
});

document.getElementById('btn-verify-challenge').addEventListener('click', async () => {
  clearErr('challenge-error');
  const code = challengeCodeInput.value.trim();
  if (code.length !== 6) {
    showErr('challenge-error', 'Enter the 6-digit code from your authenticator app.');
    return;
  }

  const btn = document.getElementById('btn-verify-challenge');
  btn.disabled = true;
  btn.textContent = 'Verifying…';

  try {
    const { data: challengeData, error: challErr } =
      await supabase.auth.mfa.challenge({ factorId: _challengeFactorId });
    if (challErr) throw challErr;

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId:    _challengeFactorId,
      challengeId: challengeData.id,
      code,
    });

    if (verifyErr) {
      showErr('challenge-error', 'Incorrect code. Check your authenticator and try again.');
      return;
    }

    window.location.href = 'app.html#calendar';
  } catch (e) {
    showErr('challenge-error', e?.message || 'Verification failed. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify & continue';
  }
});
