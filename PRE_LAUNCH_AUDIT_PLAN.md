# Pre-Launch Audit Plan
*Created: 2026-06-30 · Status: PENDING · Gate: must pass before roster swap*

This audit runs after the team review and before the real-employee roster swap.
It has five phases. Each phase has a clear pass/fail gate.

---

## Phase 1 — Security re-audit (database + Edge Functions)

### 1A · Anon probe (re-run against prod)
Re-run the anon probe (equiv. `anon_probe.scratch.ps1`) against prod after all
migrations through `20260708` are applied. Target: **45/45 PASS** (same as R39).

Checks: no table is readable without auth, no RPC leaks to anon, auth
endpoints return 401 for bad creds.

### 1B · Authenticated member probe
Log in as a regular `member` employee. Manually verify:
- [ ] Can only see own time entries (not other employees')
- [ ] Cannot access `#clients`, `#employees`, `#reports`, `#admin-logs` (route bounces)
- [ ] Cannot see compensation records of other employees
- [ ] Cannot approve leave or expense requests (buttons absent)
- [ ] Cannot read or write petty cash settings

### 1C · Manager probe
Log in as a `manager`. Verify:
- [ ] Can see direct reports' time/leave/flex (not non-reports)
- [ ] Approve leave: single-tier → status `approved`; 2-tier → status `manager_approved` then HR approves
- [ ] Cannot access `#employees` (admin-only tab)
- [ ] Cannot see compensation records

### 1D · Client probe (already passed — re-run as regression)
Re-run `f01_prod_client_probe.ps1`. Target: **22/22 PASS**.

### 1E · Edge Function input validation
For each of the 7 Edge Functions, send malformed input and verify 400/422:
- `login` — wrong password, non-existent ID, oversized payload
- `provision-users` — non-admin caller (expect 403), missing required fields
- `admin-reset-password` — non-admin caller, invalid employee_id format
- `admin-set-account-active` — non-admin caller, invalid UUID
- `admin-clear-mfa` — non-admin caller
- `account-activation-status` — non-admin caller
- `provision-client` — non-admin caller, missing client_id

### 1F · New policy review (since R40 audit)
Policies added after the last full audit (`20260701`):
- `20260704` — WITH CHECK on profiles_update_own, evr_update, jtcr split
- `20260706` — client role scoping (is_my_client_project)
- `20260707` — client_read_hardening (7 policies)
- `20260708` — client_block_* RESTRICTIVE on 11 tables (new function auth_is_client)
- `20260629` — audit_log INSERT (actor_id = auth.uid() enforced?)
- `20260630` — leave_requests status CHECK widened (manager_approved)

Verify each in Studio: `SELECT tablename, policyname, permissive, cmd, qual, with_check FROM pg_policies WHERE policyname IN (...) ORDER BY tablename, policyname;`

### 1G · Audit log INSERT policy
The `audit_log` table must enforce `actor_id = auth.uid()` in WITH CHECK.
A member must not be able to insert a log row with a different actor_id.
Test: try INSERT via REST with a spoofed actor_id → expect 403.

### 1H · F-05 request-review RPCs exist in prod — ✅ VERIFIED 2026-06-30
main's `requests.js` + `jobTitleRequests.js` call three R44 RPCs. Confirmed all
three present in prod (3/3) on 2026-06-30:
```sql
SELECT proname FROM pg_proc
WHERE proname IN ('approve_deletion_request','review_name_change_request','approve_job_title_change_request');
-- Returned 3 rows. (NOTE the name-change RPC is review_name_change_request —
--  it takes an `approved` boolean and handles approve AND reject. The name
--  `approve_name_change_request` never existed; earlier R44 docs were wrong.)
```
Regression-only at re-audit: re-run the query (expect 3) + functionally confirm
via Phase 2D (approve a name-change request end-to-end).

---

## Phase 2 — Functional walkthrough (role by role)

Use the production app at https://he-cells.github.io/hubble-wms/.
Test with the sci-fi roster accounts (before roster swap).

### 2A · Calendar & Timesheet
- [ ] Calendar renders current month, public holidays shown
- [ ] Weekly timesheet: add/edit/delete entries, submit for approval
- [ ] WFH toggle works, flex swap request submits
- [ ] Admin/manager sees all team entries; member sees own only

### 2B · Leave & Holidays
- [ ] My Leave: request leave, view balance cards, see status flow
- [ ] 2-tier leave: request → manager_approved → HR approves → approved
- [ ] Team Leave: manager sees direct reports' leave, admin sees all
- [ ] Flex Swaps: request, approve (manager), reject
- [ ] Holidays: calendar view + list view, admin can add/edit/delete
- [ ] Balance tab: admin can initialize year, edit allocations

### 2C · Expenses & Petty Cash
- [ ] Submit expense, attach receipt (if applicable), status flow
- [ ] Trip settlement: submit travel request → trip done → settle
- [ ] Approvals: manager/admin approves/rejects, settlement confirmed
- [ ] Petty Cash: admin top-up, member draw, reconcile
- [ ] Per-diem rate shown correctly

### 2D · Employees & Requests
- [ ] Directory: search, filter by dept, view profile
- [ ] Account Status tab (admin): provision, reset, deactivate
- [ ] Name-change request: submit → admin approves/rejects
- [ ] Job-title request: submit → admin approves/rejects
- [ ] Profile: edit own name, avatar; Security tab TOTP enroll/disable

### 2E · Clients & Documents
- [ ] Admin: add client, manage logins, provision client login
- [ ] Documents: upload template, merge with employee data, preview
- [ ] Reports: project stats, tag usage (admin/manager only)

### 2F · Admin Logs
- [ ] Log entries appear for: leave approve/reject, expense approve/reject, client provision, employee edit
- [ ] Filters (entity, actor, date range) work
- [ ] Pagination works at >20 rows

### 2G · Client Portal (separate login)
- [ ] Own company name and project shown
- [ ] Hours by project bar chart renders
- [ ] Expenses & travel table shows own rows only
- [ ] Export (text) download contains correct data only
- [ ] No employee names visible anywhere

---

## Phase 3 — Data integrity checks

Run in Studio SQL Editor:

```sql
-- Leave balances: no negative available days (would indicate a bug in used_days calc)
SELECT lb.*, (lb.allocated_days + COALESCE(lb.carried_over_days,0) + COALESCE(lb.manual_adjustment_days,0) - lb.used_days) AS available
FROM leave_balances lb
WHERE (lb.allocated_days + COALESCE(lb.carried_over_days,0) + COALESCE(lb.manual_adjustment_days,0) - lb.used_days) < 0;
-- Expected: 0 rows

-- Orphaned time entries (no matching employee)
SELECT te.id, te.user_id FROM time_entries te
LEFT JOIN profiles p ON p.id = te.user_id WHERE p.id IS NULL;
-- Expected: 0 rows

-- Leave requests with invalid status
SELECT id, status FROM leave_requests
WHERE status NOT IN ('pending','manager_approved','approved','rejected','cancelled');
-- Expected: 0 rows

-- Cash transactions with no project
SELECT id, direction, amount FROM cash_transactions WHERE project_id IS NULL;
-- Expected: 0 rows (or only top-up rows if petty cash has no project)

-- Duplicate leave balances (same employee + type + year)
SELECT employee_id, leave_type_code, year, COUNT(*)
FROM leave_balances GROUP BY 1,2,3 HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- Profiles with role='client' but no client_id (broken provisioning)
SELECT id, role, client_id FROM profiles WHERE role='client' AND client_id IS NULL;
-- Expected: 0 rows
```

---

## Phase 4 — UI/UX consistency

### 4A · Dark theme compliance
- [ ] No white input boxes on any page (use browser DevTools to spot-check)
- [ ] Check: expenses form, leave request form, petty cash form, document merge
- [ ] Password inputs dark (the historical failure mode)

### 4B · Responsive behavior
- [ ] App usable at 1280px (laptop), 1920px (desktop)
- [ ] Tables scroll horizontally inside `.table-wrapper` on narrow viewports
- [ ] Modals don't overflow on 1280px

### 4C · Error states
- [ ] F-03 error boundary: disconnect Supabase URL (edit config temporarily), reload → "Something went wrong" + Retry panel appears
- [ ] Empty states: all tables/lists have a meaningful empty message (no blank panels)
- [ ] Toast notifications appear for: success saves, errors, denials

### 4D · Navigation & routing
- [ ] Hand-type `#employees` as a member → bounces to `#calendar` with toast
- [ ] Hand-type `#clients` as a manager → bounces
- [ ] Esc key closes topmost modal
- [ ] Back button after navigation doesn't break state

### 4E · Shared components
- [ ] `empSelect` datalist: hyphen-tolerant search, ✕ clear button works, no white background
- [ ] `weekNav`: prev/next, click label opens date picker, "This week" / "Show all" where applicable
- [ ] Confirm modal (not native `confirm()`): appears for all destructive actions

---

## Phase 5 — Deferred items triage

Review each deferred item and decide: **fix before launch** or **accept for post-launch**.

| Item | Description | Recommendation |
|------|-------------|----------------|
| F-05 | Atomic request-review RPCs | ✅ **DONE (R44) + prod-VERIFIED 2026-06-30** — all 3 RPCs present in prod (`approve_deletion_request`, `review_name_change_request`, `approve_job_title_change_request`); code calls them correctly. See Phase 1H. No action. |
| F-08 | Replace `select('*')` with field lists | ✅ **DONE in R44** (auth.js profiles + employees comp). Remaining `select('*')` sites (requests rows) → accept post-launch. |
| F-09 | CI quality gate (ESLint, ESM parse, Playwright smoke, GitHub Action) | Partial: ESM syntax-check script added in R44. Full CI gate (ESLint/Playwright/Action) → accept post-launch: dev hygiene, not a launch blocker |
| M-PWPOL | Dashboard min-pw-length setting (user action) | Accept post-launch: admin action, low risk |
| L-CSP | Content Security Policy header | Fix before: security header missing |
| L-ADMCK | Admin-caller double-check in Edge Fns (belt+suspenders beyond JWT) | Accept post-launch: JWT + RLS already enforce it |
| L-FNSP / L-SPDEV | Supabase linter security WARNs (0011 search_path, 0028 anon-executable, 0029 authenticated-executable) | ✅ **Migration written (R51): `20260709_lint_search_path_and_execute_hardening.sql` — pending Studio apply.** See L-FNSP/L-SPDEV section below for the residual-warning acceptance rationale. |
| L-PWLEAK | 0032 leaked-password protection disabled | Accept post-launch (or on Pro): one-time Dashboard toggle, no SQL. Track with M-PWPOL. |
| CONV-M4 | `localhost:3030` hardcoded URL in one file | ✅ **Verified resolved (R50 recheck)** — grepped `js/`, `app.html`, `index.html`: zero occurrences in shipped code; only mentions are in docs referring to the local dev preview server. No code change needed. |
| CONV-L1/L2 | Minor convention lints | Accept post-launch |
| MODAL-L1 | Modal pattern minor lint | Accept post-launch |

### CONV-M4 — ✅ resolved, no action needed
Re-verified 2026-07-01 (R50): no `3030` reference anywhere in `js/`, `app.html`, or `index.html`. Already resolved in a prior session (or never actually shipped) — docs were stale.

### L-CSP — ✅ fixed (R50)
Added a `<meta http-equiv="Content-Security-Policy">` tag to both `app.html` and
`index.html` (GitHub Pages doesn't allow custom response headers, so a meta tag
is the only option for a static site).

Two corrections were needed vs. the original draft below:
1. **Missing `fonts.gstatic.com`** in `font-src` — the app loads the Inter font via
   `fonts.googleapis.com`, which redirects to `fonts.gstatic.com` for the actual
   glyph files. Without it, fonts would silently fail to load under the new policy.
2. **Both files had an inline `<script type="module">` block** (`app.html:325`,
   `index.html:327`). A bare `script-src 'self'` does not cover inline scripts —
   pasting the original draft verbatim would have broken login and app boot
   entirely. Fixed by **externalizing** both blocks into `js/app-init.js` and
   `js/login-init.js` (referenced via `<script type="module" src="...">`), keeping
   `script-src` strict with no `'unsafe-inline'` needed for scripts. `style-src`
   still needs `'unsafe-inline'` (the app has many inline `style="..."` attributes;
   externalizing those is out of scope here).

Policy shipped in both files:
```
default-src 'none';
script-src 'self' cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline';
connect-src https://sjkggguedgtynktymzes.supabase.co https://sjkggguedgtynktymzes.functions.supabase.co;
img-src 'self' data:;
font-src 'self' https://fonts.gstatic.com;
frame-ancestors 'none';
```
(`frame-ancestors 'none'` added beyond the original draft as low-risk clickjacking
hardening, consistent with `default-src 'none'`.)

Cache bump: `app.html`'s page-module `V` constant `113→114` (now lives in
`js/app-init.js`); `js/login-init.js` versioned independently as `?v=1`.

**⚠️ Not yet verified live** — this container has no network access to prod
Supabase or GitHub Pages (confirmed via a hard 403 gateway policy denial), so
"0 CSP violations in console" could not be checked from here. **Still needs a
post-push spot-check**: hard-refresh https://he-cells.github.io/hubble-wms/ and
index.html, open DevTools → Console, confirm zero CSP violations, and confirm
login + app boot + font rendering all still work.

### L-FNSP / L-SPDEV — migration written (R51), pending Studio apply

Migration `20260709_lint_search_path_and_execute_hardening.sql` closes the
database-linter security WARNs. Cross-checked every function against the
`.rpc()` calls in `js/` before deciding what to lock down:

- **0011 (12 fns)** — pin `search_path = public, extensions, pg_temp`. These are
  SECURITY **INVOKER** trigger/compute helpers (no privilege escalation
  possible), so this is hygiene/defence-in-depth, not a high-risk hole.
- **0028 (anon)** — the item that actually matters. Strip the default `PUBLIC`
  + `anon` EXECUTE grant on all 27 flagged SECURITY DEFINER fns, so an
  unauthenticated caller cannot reach a definer-rights function even if a
  future body forgets its internal auth guard (cf. the real `get_project_stats`
  / `get_tag_usage` anon leak fixed in `20260630_security_hardening.sql`).
- **0029 (authenticated)** — fully revoked on the 8 trigger fns (never callable
  as RPCs anyway; triggers don't check caller EXECUTE).

**Residual warnings that are ACCEPTED / by-design (do not re-flag):** 0029 will
still fire for the **9 real RPCs** (called from `js/` by admins/managers) and
the **10 RLS-helper fns** (invoked inside policy `USING`/`CHECK` as the
`authenticated` user). Both MUST keep EXECUTE for `authenticated` — revoking
would break the app and RLS. These are intentional, not unfinished.

**Apply:** run the file in Supabase Studio → SQL Editor, then run the commented
`VERIFY` queries at the bottom (each should return 0 rows). Grants-only, no
data/policy/schema change, idempotent, reversible. Not runnable from the Claude
Code container (403 to prod). 0032 leaked-password protection is a separate
Dashboard toggle (L-PWLEAK).

---

## Pass criteria (all phases)

| Phase | Gate |
|-------|------|
| 1A anon probe | 45/45 PASS |
| 1B–1D role probes | 0 issues found |
| 1E–1H policy/RPC checks | All policies present; F-05 RPCs in prod ✅ verified 2026-06-30 (3 rows) — regression re-check only |
| 2A–2G functional walkthrough | 0 blocking bugs |
| 3 data integrity | All queries return 0 rows |
| 4A–4E UI/UX | 0 dark-theme violations, 0 broken states |
| 5 triage | F-05 ✅ verified in prod (Phase 1H, done); CONV-M4 ✅ verified resolved; L-CSP ✅ fixed (⚠️ live console check still pending — see below); others explicitly deferred |

**All phases green → roster swap may proceed.**

---

## Execution order

1. ✅ Phase 5 must-fix items: CONV-M4 (verified resolved) + L-CSP (fixed — CSP meta tag added
   to `app.html`/`index.html`, inline scripts externalized) — **done 2026-07-01 (R50)**.
   F-05 is done + prod-verified 2026-06-30 — no action.
2. Phases 1–4 (security re-audit incl. 1H, functional walkthrough, data integrity, UI/UX) —
   **⚠️ blocked from this Claude Code container**: confirmed via the environment's proxy
   status that it gets a hard 403 policy denial reaching both prod Supabase and GitHub
   Pages. These phases (plus the L-CSP live console check) must be run by a human with real
   network access, or in the Supabase Studio SQL Editor. See
   `PRE_LAUNCH_AUDIT_EXECUTION_PACKET.md` for ready-to-run commands/queries/checklists.
3. Team review (functional feedback, UX)
4. Sign-off → **Roster Swap (RSK-0)**
