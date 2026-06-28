// auth.js — Google OAuth flow, session management, role guard

import { supabase } from './config.js';
import { setFormatPrefs } from './format.js';

let _session = null;
let _profile = null;
let _authError = null;   // diagnostic: why loadSession returned null

/** Return the last auth failure reason (for diagnostics). */
export function getAuthError() { return _authError; }

// ──────────────────────────────────────────────────────────────
// SIGN IN / OUT
// ──────────────────────────────────────────────────────────────

/**
 * Initiate Google OAuth sign-in via Supabase.
 * Browser will redirect to Google, then back to app.html.
 */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Resolve against the current page URL (not origin) so the redirect is
      // correct at localhost, GitHub Pages root, AND a project subpath
      // (origin + '/app.html' breaks under https://user.github.io/repo/).
      redirectTo: new URL('app.html', window.location.href).href,
    },
  });
  if (error) throw error;
}

/**
 * Sign out and redirect to the login page.
 */
export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

// ──────────────────────────────────────────────────────────────
// SESSION & PROFILE
// ──────────────────────────────────────────────────────────────

/**
 * Load the current session and fetch the user's profile.
 * Sets format preferences from the profile.
 * @returns {object|null} profile row, or null if not authenticated
 */
export async function loadSession() {
  _authError = null;

  // getSession() awaits the client's internal init, which includes the
  // detectSessionInUrl OAuth code exchange — so a session present in the URL
  // after the OAuth redirect is resolved here.
  let { data: { session }, error: sessErr } = await supabase.auth.getSession();

  // Belt-and-suspenders: if we just came back from OAuth (code in URL) but the
  // session isn't ready yet, give the exchange a moment and retry once.
  if (!session && /[?&#](code|access_token)=/.test(window.location.href)) {
    await new Promise(r => setTimeout(r, 400));
    ({ data: { session }, error: sessErr } = await supabase.auth.getSession());
  }

  if (sessErr) {
    _authError = `getSession error: ${sessErr.message}`;
    console.error(_authError);
    return null;
  }

  _session = session;
  if (!session) {
    _authError = 'no-session (OAuth code not exchanged, or not signed in)';
    return null;
  }

  // Explicit column list (F-08): the profile object flows to every page, so we
  // fetch only the fields actually read across js/ + app.html (census-verified).
  // If a new consumer needs another column, add it here.
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, client_id, job_title, currency, date_format, time_format, duration_format, week_start, working_days, daily_capacity_hours')
    .eq('id', session.user.id)
    .single();

  if (error) {
    _authError = `profile fetch failed: ${error.message} (code ${error.code || '?'})`;
    console.error(_authError);
    return null;
  }

  _profile = profile;
  setFormatPrefs(profile);
  return profile;
}

/** Return the cached profile (call loadSession first). */
export function getProfile() { return _profile; }

/** Return the cached Supabase session. */
export function getSession() { return _session; }

// ──────────────────────────────────────────────────────────────
// ROLE HELPERS
// ──────────────────────────────────────────────────────────────

export function isAdmin()      { return !!_profile && ['owner','admin'].includes(_profile.role); }
export function isManager()    { return !!_profile && _profile.role === 'manager'; }
export function isMember()     { return !!_profile && _profile.role === 'member'; }
export function isClientRole() { return !!_profile && _profile.role === 'client'; }
export function canViewReports() { return !!_profile && ['owner','admin','manager'].includes(_profile.role); }

/**
 * Check if the current user has at least the given minimum role level.
 * Levels: owner > admin > manager > member > client
 */
const ROLE_LEVELS = { owner: 5, admin: 4, manager: 3, member: 2, client: 1 };
export function hasRole(minRole) {
  if (!_profile) return false;
  return (ROLE_LEVELS[_profile.role] || 0) >= (ROLE_LEVELS[minRole] || 0);
}

// ──────────────────────────────────────────────────────────────
// GUARDS
// ──────────────────────────────────────────────────────────────

/**
 * Redirect to login if not authenticated.
 * Call at the top of app.html's init script.
 * @returns {object|null} profile, or null (and redirects)
 */
export async function requireAuth() {
  const profile = await loadSession();
  if (!profile) {
    window.location.href = 'index.html';
    return null;
  }
  return profile;
}

/**
 * Check whether the current session requires a forced password change or an
 * MFA challenge (aal1 session with a verified TOTP factor).
 * Call after loadSession() so _session is populated.
 * @returns {{ needsPasswordChange: boolean, needsMfa: boolean }}
 */
export async function getAuthGate() {
  const needsPasswordChange = !!_session?.user?.user_metadata?.force_password_change;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const needsMfa = aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2';
  return { needsPasswordChange, needsMfa };
}

/**
 * Redirect with an error message if the user doesn't have the required role.
 */
export function requireRole(minRole) {
  if (!hasRole(minRole)) {
    console.warn(`Access denied: requires ${minRole}`);
    window.location.hash = '#calendar';
    return false;
  }
  return true;
}

// ──────────────────────────────────────────────────────────────
// AVATAR HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * Get the user's initials from their name.
 */
export function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join('');
}
