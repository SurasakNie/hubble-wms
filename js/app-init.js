import { loadSession, getAuthGate, getAuthError, signOut, getProfile, getInitials } from './auth.js';
import { route, startRouter, setDefault } from './router.js';
import { isAdmin, isManager, isMember, isClientRole, canViewReports } from './auth.js';
import { supabase } from './config.js';
import { getMyLatestNameRequest } from './api/users.js';

// ── Boot ────────────────────────────────────────────────────
const profile = await loadSession();
if (!profile) {
  // DIAGNOSTIC: show the real reason instead of silently bouncing to login.
  const reason = getAuthError() || 'unknown';
  document.body.innerHTML = `
    <div style="max-width:560px;margin:80px auto;font-family:Inter,system-ui,sans-serif;
                background:#2c323a;border:1px solid #3a444e;border-radius:10px;padding:28px;color:#e4eaee">
      <h2 style="margin:0 0 12px;color:#ef9a9a">Sign-in diagnostic</h2>
      <p style="color:#8b97a2;font-size:13px;margin:0 0 16px">
        You were redirected here after Google sign-in, but the app could not
        establish your session. Reason:</p>
      <pre style="background:#1c2026;border:1px solid #3a444e;border-radius:6px;
                  padding:12px;font-size:13px;color:#ffcc80;white-space:pre-wrap">${reason.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
      <p style="color:#8b97a2;font-size:12px;margin:16px 0 0">
        URL: <code>${window.location.href.replace(/(code|access_token)=[^&]+/g,'$1=…').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></p>
      <p style="margin:20px 0 0"><a href="index.html" style="color:#03a9f4">← Back to login</a></p>
    </div>`;
  throw new Error('Not authenticated: ' + reason);
}

// Gate check — bounce sessions that still need password change or MFA.
// Halt boot via throw (top-level `return` is illegal in a module script);
// the redirect navigates away, so the thrown error never surfaces.
const gate = await getAuthGate();
if (gate.needsPasswordChange || gate.needsMfa) {
  window.location.href = 'index.html';
  throw new Error('Auth gate not satisfied — redirecting to login');
}

// Show app
document.getElementById('app').style.display = 'flex';

// ── Sidebar profile row ──────────────────────────────────────
const avatarBtn         = document.getElementById('avatar-btn');
const dropdown          = document.getElementById('avatar-dropdown');
const sidebarProfileBtn = document.getElementById('sidebar-profile-btn');

// Icon: up to 2-letter initials
avatarBtn.textContent = getInitials(profile.name);

// Dropdown header: full name + email
document.getElementById('avatar-name').textContent  = profile.name  || profile.email;
document.getElementById('avatar-email').textContent = profile.email || '';

// Single-line label: "Firstname · Company"
const firstName = (profile.name || '').split(/\s+/)[0] || profile.email;
let company = 'Hubble Engineering';
if (profile.role === 'client' && profile.client_id) {
  const { data: cl } = await supabase
    .from('clients').select('name').eq('id', profile.client_id).single();
  company = cl?.name || 'Client';
}
document.getElementById('sidebar-profile-name').textContent    = firstName;
document.getElementById('sidebar-profile-company').textContent = company;

// Entire profile row toggles dropdown
sidebarProfileBtn.addEventListener('click', e => {
  e.stopPropagation();
  dropdown.classList.toggle('open');
});
document.addEventListener('click', () => dropdown.classList.remove('open'));

// ── Mobile sidebar toggle ────────────────────────────────────
const appEl      = document.getElementById('app');
const mobMenuBtn = document.getElementById('mob-menu-btn');
const sidebarEl  = document.getElementById('sidebar');
const backdropEl = document.getElementById('sidebar-backdrop');

function _openSidebar()  { appEl.classList.add('sidebar-open'); }
function _closeSidebar() { appEl.classList.remove('sidebar-open'); }

mobMenuBtn?.addEventListener('click', e => { e.stopPropagation(); _openSidebar(); });
backdropEl?.addEventListener('click', _closeSidebar);

// Close sidebar when any nav link is tapped on mobile
sidebarEl?.querySelectorAll('.nav-item').forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth <= 768) _closeSidebar();
  });
});

// Esc closes the topmost open modal (any .modal-backdrop). Capture phase so it runs
// before a modal's own Esc handler (e.g. confirmModal) and only the top one closes.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const backs = document.querySelectorAll('.modal-backdrop');
  if (backs.length) backs[backs.length - 1].click();
}, true);

// ── SHOW MORE toggle (reveals #nav-wms) ─────────────────────
const showMoreBtn  = document.querySelector('.sidebar-show-more');
const navWms       = document.getElementById('nav-wms');
const showMoreIcon = showMoreBtn?.querySelector('svg');

function _setWmsExpanded(open) {
  if (!navWms) return;
  navWms.style.display = open ? '' : 'none';
  if (showMoreIcon) showMoreIcon.style.transform = open ? 'rotate(180deg)' : '';
  const showMoreLbl = document.getElementById('show-more-label');
  if (showMoreLbl) showMoreLbl.textContent = open ? 'SHOW LESS' : 'SHOW MORE';
  _updateShowMoreBadge();
}

// Roll-up badge: when SHOW MORE is collapsed, the WMS-page badges are hidden
// with the section — so surface their combined count on the SHOW MORE row.
// When expanded, hide the roll-up (individual page badges are visible instead).
const WMS_BADGE_IDS = ['badge-leave', 'badge-requests', 'badge-expenses', 'badge-evaluation', 'badge-documents'];
function _updateShowMoreBadge() {
  const rollup = document.getElementById('badge-showmore');
  if (!rollup || !navWms) return;
  const expanded = navWms.style.display !== 'none';
  let total = 0;
  for (const id of WMS_BADGE_IDS) {
    const b = document.getElementById(id);
    if (b && !b.classList.contains('hidden')) total += parseInt(b.textContent, 10) || 0;
  }
  if (!expanded && total > 0) {
    rollup.textContent = total;
    rollup.classList.remove('hidden');
  } else {
    rollup.classList.add('hidden');
  }
}
// Let the per-page badge loaders refresh the roll-up after they update.
window.refreshShowMoreBadge = _updateShowMoreBadge;

showMoreBtn?.addEventListener('click', () => {
  _setWmsExpanded(navWms.style.display === 'none');
});

// Auto-expand SHOW MORE when navigating directly to a WMS route
const wmsRoutes = new Set(['#employees', '#holidays', '#requests', '#expenses', '#evaluation', '#documents', '#help', '#admin-logs']);
const currentHash = window.location.hash.split('?')[0];
if (wmsRoutes.has(currentHash)) _setWmsExpanded(true);

document.getElementById('menu-logout').addEventListener('click', () => signOut());

document.getElementById('menu-prefs').addEventListener('click', async () => {
  dropdown.classList.remove('open');
  const { openPrefsModal } = await import('./components/prefsModal.js');
  openPrefsModal(profile);
});

document.getElementById('menu-profile').addEventListener('click', async () => {
  dropdown.classList.remove('open');
  const { openProfileModal } = await import('./components/profileModal.js');
  await openProfileModal(profile);
});

// ── Role-based sidebar visibility ──────────────────────────
function applyRoleVisibility() {
  const role = profile.role;
  const adminRoles = ['owner', 'admin'];

  // CLIENT-01: clients see ONLY their read-only portal — hide every other nav
  // item + section labels + SHOW MORE. (Defense-in-depth on top of the router
  // guard below and the RLS scoping.)
  if (isClientRole()) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.style.display = el.classList.contains('nav-client-portal') ? '' : 'none';
    });
    document.querySelectorAll('.nav-section-label').forEach(el => { el.style.display = 'none'; });
    const sm = document.querySelector('.sidebar-show-more');
    if (sm) sm.style.display = 'none';
    return;
  }

  // Reports: admin/owner/manager only
  const reportItem = document.querySelector('.nav-reports');
  if (reportItem) reportItem.style.display =
    canViewReports() ? '' : 'none';

  // Projects: all roles see it (per plan)
  // Clients: admin/owner/manager only
  const clientsItem = document.querySelector('.nav-clients');
  if (clientsItem) clientsItem.style.display =
    (isAdmin() || isManager()) ? '' : 'none';

  // Team: all roles see it (members/clients = view only)
  // Tags: admin/owner full CRUD; others = apply only (show to all)

  // Employees: admin/owner only (WMS Phase 3)
  const employeesItem = document.querySelector('.nav-employees');
  if (employeesItem) employeesItem.style.display = isAdmin() ? '' : 'none';

  // Admin Logs: admin/owner only
  const adminLogsItem = document.querySelector('.nav-admin-logs');
  if (adminLogsItem) adminLogsItem.style.display = isAdmin() ? '' : 'none';

  // Leave & Holidays: visible to all authenticated users (M2 Phase 4)
  // (employees submit their own leave requests; admin approves)

  // Time Tracker: not for client role
  if (isClientRole()) {
    const trackerItem = document.querySelector('[data-route="#tracker"]');
    if (trackerItem) trackerItem.style.display = 'none';
  }
}

applyRoleVisibility();

// ── Pending-requests badge (deletion + name-change) ──────────
async function loadRequestBadge() {
  if (!isAdmin()) return;
  try {
    const [{ count: delCount }, { count: ncrCount }, { count: jtcrCount }] = await Promise.all([
      supabase.from('deletion_requests')
        .select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('name_change_requests')
        .select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('job_title_change_requests')
        .select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    const total = (delCount || 0) + (ncrCount || 0) + (jtcrCount || 0);
    const badge = document.getElementById('badge-requests');
    if (badge) {
      badge.textContent = total;
      badge.classList.toggle('hidden', total === 0);
    }
    window.refreshShowMoreBadge?.();
  } catch (e) { console.warn('[badge] request badge failed', e); }
}
window.refreshRequestBadge = loadRequestBadge;
loadRequestBadge();

// ── Leave badge ──────────────────────────────────────────────
// Admin/Manager: count of leave requests pending their approval.
// Employee: count of unseen approved/rejected decisions on their own requests.
async function loadLeaveBadge() {
  const badge = document.getElementById('badge-leave');
  if (!badge) return;
  try {
    if (isAdmin() || isManager()) {
      const { count } = await supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'manager_approved']);
      const n = count || 0;
      badge.textContent = n;
      badge.classList.toggle('hidden', n === 0);
    } else {
      const { data } = await supabase
        .from('leave_requests')
        .select('id, status')
        .in('status', ['approved', 'rejected'])
        .order('updated_at', { ascending: false })
        .limit(50);
      const unseen = (data || []).filter(r => localStorage.getItem(`lr_seen_${r.id}`) !== '1');
      if (unseen.length > 0) { badge.textContent = unseen.length; badge.classList.remove('hidden'); }
      else { badge.textContent = ''; badge.classList.add('hidden'); }
    }
  } catch (e) { console.warn('[badge] leave badge load failed', e); }
  window.refreshShowMoreBadge?.();
}
window.refreshLeaveBadge = loadLeaveBadge;
loadLeaveBadge();

// ── Expense & Travel badge (admin/mgr: pending expenses + mileage claims + trip requests) ──
async function loadExpenseBadge() {
  const badge = document.getElementById('badge-expenses');
  if (!badge) return;
  try {
    if (isAdmin() || isManager()) {
      const [{ count: ct }, { count: tc }, { count: tr }, { count: ts }] = await Promise.all([
        supabase.from('cash_transactions').select('id', { count: 'exact', head: true })
          .eq('direction', 'out').in('status', ['pending', 'manager_approved']),
        supabase.from('travel_claims').select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'manager_approved']),
        supabase.from('travel_requests').select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'manager_approved']),
        supabase.from('travel_requests').select('id', { count: 'exact', head: true })
          .eq('settlement_status', 'submitted'),
      ]);
      const total = (ct || 0) + (tc || 0) + (tr || 0) + (ts || 0);
      badge.textContent = total;
      badge.classList.toggle('hidden', total === 0);
    } else {
      const { data: emp } = await supabase.from('employees').select('id').eq('user_id', profile.id).maybeSingle();
      if (!emp) { badge.classList.add('hidden'); return; }
      const [{ data: txns }, { data: claims }, { data: trips }] = await Promise.all([
        supabase.from('cash_transactions').select('id').eq('employee_id', emp.id).in('status', ['approved', 'rejected']),
        supabase.from('travel_claims').select('id').eq('employee_id', emp.id).in('status', ['approved', 'rejected']),
        supabase.from('travel_requests').select('id').eq('employee_id', emp.id).in('status', ['approved', 'rejected']),
      ]);
      const unseen = [
        ...(txns || []).filter(r => localStorage.getItem(`exp_seen_${r.id}`) !== '1'),
        ...(claims || []).filter(r => localStorage.getItem(`claim_seen_${r.id}`) !== '1'),
        ...(trips || []).filter(r => localStorage.getItem(`trip_seen_${r.id}`) !== '1'),
      ];
      badge.textContent = unseen.length;
      badge.classList.toggle('hidden', unseen.length === 0);
    }
  } catch (e) { console.warn('[badge] expense badge load failed', e); }
  window.refreshShowMoreBadge?.();
}
window.refreshExpenseBadge = loadExpenseBadge;
loadExpenseBadge();

// ── Evaluation badge (M5) ────────────────────────────────────
// One RLS-scoped query; partition client-side:
//   admin   → evaluations awaiting final rating (manager_submitted)
//   manager → team evaluations awaiting review (self_submitted, not own)
//   everyone → own evaluations awaiting self-assessment + unseen published results
async function loadEvaluationBadge() {
  const badge = document.getElementById('badge-evaluation');
  if (!badge) return;
  try {
    const { data: emp } = await supabase.from('employees').select('id').eq('user_id', profile.id).maybeSingle();
    const myEmpId = emp?.id || null;
    const { data } = await supabase
      .from('evaluations')
      .select('id, status, employee_id')
      .in('status', ['self_pending', 'self_submitted', 'manager_submitted', 'published']);
    const rows = data || [];
    let n = 0;
    if (isAdmin()) n += rows.filter(r => r.status === 'manager_submitted').length;
    if (isAdmin() || isManager()) n += rows.filter(r => r.status === 'self_submitted' && r.employee_id !== myEmpId).length;
    if (myEmpId) {
      n += rows.filter(r => r.employee_id === myEmpId && r.status === 'self_pending').length;
      n += rows.filter(r => r.employee_id === myEmpId && r.status === 'published'
                        && localStorage.getItem(`eval_seen_${r.id}`) !== '1').length;
    }
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
  } catch (e) { console.warn('[badge] evaluation badge load failed', e); }
  window.refreshShowMoreBadge?.();
}
window.refreshEvaluationBadge = loadEvaluationBadge;
loadEvaluationBadge();

// ── Documents badge (M6) ───────────────────────────────────
// RLS scopes rows: admin all, managers direct reports, employees own.
// Counts: unseen generated documents (everyone) + pending document requests
// (admin/manager, excluding own) + unseen request decisions (employee).
// document_requests ships in migration 20260628 — its queries degrade to 0 until applied.
async function loadDocumentsBadge() {
  const badge = document.getElementById('badge-documents');
  if (!badge) return;
  try {
    const [{ data: docs }, { data: reqs }, { data: emp }] = await Promise.all([
      supabase.from('generated_documents').select('id, status').eq('status', 'generated'),
      supabase.from('document_requests').select('id, status, employee_id'),
      supabase.from('employees').select('id').eq('user_id', profile.id).maybeSingle(),
    ]);
    const myEmpId = emp?.id || null;
    let n = (docs || []).filter(r => localStorage.getItem(`doc_seen_${r.id}`) !== '1').length;
    const reqRows = reqs || [];
    if (isAdmin() || isManager()) {
      // Manager's own request escalates to admin, so it never counts toward their own badge.
      n += reqRows.filter(r => r.status === 'pending' && (isAdmin() || r.employee_id !== myEmpId)).length;
    }
    if (myEmpId) {
      n += reqRows.filter(r => r.employee_id === myEmpId
                        && ['fulfilled', 'rejected'].includes(r.status)
                        && localStorage.getItem(`docreq_seen_${r.id}`) !== '1').length;
    }
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
  } catch (e) { console.warn('[badge] documents badge load failed', e); }
  window.refreshShowMoreBadge?.();
}
window.refreshDocumentsBadge = loadDocumentsBadge;
loadDocumentsBadge();

// ── Preferences notification dot (non-admin: unread name-change decision) ──
async function refreshPrefsNotification() {
  const dot = document.getElementById('prefs-notif-dot');
  if (!dot || isAdmin()) return;
  try {
    const req = await getMyLatestNameRequest();
    const decided  = req?.status === 'approved' || req?.status === 'rejected';
    const dismissed = req ? localStorage.getItem(`ncr_dismissed_${req.id}`) === '1' : true;
    const DECISION_TTL_MS = 3 * 24 * 60 * 60 * 1000;
    const reviewedAt = req?.reviewed_at ? new Date(req.reviewed_at).getTime() : null;
    const fresh = reviewedAt === null ? decided : (Date.now() - reviewedAt) < DECISION_TTL_MS;
    dot.style.display = (decided && !dismissed && fresh) ? '' : 'none';
  } catch (e) {
    dot.style.display = 'none';
  }
}
window.refreshPrefsNotification = refreshPrefsNotification;
refreshPrefsNotification();

// ── Toast helper (global) ────────────────────────────────────
window.showToast = function(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const text = document.createElement('span');
  text.className = 'toast-msg';
  text.textContent = msg;
  const close = document.createElement('button');
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '✕';
  const timer = setTimeout(() => toast.remove(), 10000);   // auto-dismiss after 10s
  close.onclick = () => { clearTimeout(timer); toast.remove(); };
  toast.append(text, close);
  container.appendChild(toast);
};

// ── Page routes ──────────────────────────────────────────────
// Version query busts the browser cache so a hard refresh always loads the latest page JS.
// Bump this alongside the CSS ?v= when page modules change.
const V = '?v=114';
const pages = {
  '#client-portal': () => import('./pages/clientPortal.js' + V),
  '#tracker':   () => import('./pages/tracker.js'   + V),
  '#timesheet': () => import('./pages/timesheet.js' + V),
  '#calendar':  () => import('./pages/calendar.js'  + V),
  '#dashboard': () => import('./pages/dashboard.js' + V),
  '#reports':   () => import('./pages/reports.js'   + V),
  '#projects':  () => import('./pages/projects.js'  + V),
  '#team':      () => import('./pages/team.js'       + V),
  '#clients':   () => import('./pages/clients.js'   + V),
  '#tags':      () => import('./pages/tags.js'       + V),
  '#employees': () => import('./pages/employees.js'  + V),
  '#holidays':  () => import('./pages/holidays.js'   + V),
  '#requests':  () => import('./pages/requests.js'   + V),
  '#expenses':  () => import('./pages/expenses.js'   + V),
  '#evaluation': () => import('./pages/evaluation.js' + V),
  '#documents': () => import('./pages/documents.js'  + V),
  '#help':       () => import('./pages/help.js'       + V),
  '#admin-logs': () => import('./pages/adminLogs.js'  + V),
};

// Route-role matrix — defence-in-depth that mirrors the nav visibility rules
// in applyRoleVisibility(). A manually typed hash for a role-restricted page
// bounces to a safe default instead of rendering an empty/partial page. RLS
// remains the authoritative data boundary; this only aligns UX with intent.
const routeAllowed = {
  '#reports':   () => canViewReports(),          // owner/admin/manager
  '#clients':   () => isAdmin() || isManager(),  // owner/admin/manager
  '#employees':  () => isAdmin(),                  // owner/admin
  '#admin-logs': () => isAdmin(),
};

for (const [hash, loader] of Object.entries(pages)) {
  route(hash, async () => {
    // CLIENT-01: clients are confined to their read-only portal — bounce any
    // other route (covers a manually typed hash) back to the portal.
    if (isClientRole() && hash !== '#client-portal') { window.location.hash = '#client-portal'; return; }
    // Role gate for restricted pages (errors thrown here surface via the
    // router's async error boundary).
    const gate = routeAllowed[hash];
    if (gate && !gate()) {
      window.showToast?.('You don’t have access to that page.', 'error');
      window.location.hash = '#calendar';
      return;
    }
    const topbarLeft = document.getElementById('topbar-left');
    if (topbarLeft) topbarLeft.innerHTML = '';
    const mod = await loader();
    mod.render(profile);
  });
}

setDefault(isClientRole() ? '#client-portal' : '#calendar');
startRouter();
