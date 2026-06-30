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
| F-05 | Multi-step request-review writes → guarded RPCs (atomicity) | Fix before: data integrity risk if request partially applied |
| F-08 | Replace `select('*')` with field lists (auth.js profiles, employees comp, requests) | Accept post-launch: regression risk, field-usage census needed first |
| F-09 | CI quality gate (ESLint, ESM parse, Playwright smoke, GitHub Action) | Accept post-launch: dev hygiene, not a launch blocker |
| M-PWPOL | Dashboard min-pw-length setting (user action) | Accept post-launch: admin action, low risk |
| L-CSP | Content Security Policy header | Fix before: security header missing |
| L-ADMCK | Admin-caller double-check in Edge Fns (belt+suspenders beyond JWT) | Accept post-launch: JWT + RLS already enforce it |
| CONV-M4 | `localhost:3030` hardcoded URL in one file | Fix before: will fail silently in prod |
| CONV-L1/L2 | Minor convention lints | Accept post-launch |
| MODAL-L1 | Modal pattern minor lint | Accept post-launch |

### CONV-M4 — must fix before launch
Find and fix the hardcoded `localhost:3030` before roster swap.

### L-CSP — must fix before launch
Add a Content Security Policy header. Since this is a GitHub Pages static site,
CSP must be delivered via a `<meta http-equiv="Content-Security-Policy">` tag in
`app.html` (GitHub Pages doesn't allow custom response headers).

Minimum policy for this app:
```
default-src 'none';
script-src 'self' cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline';
connect-src https://sjkggguedgtynktymzes.supabase.co https://sjkggguedgtynktymzes.functions.supabase.co;
img-src 'self' data:;
font-src 'self';
```
Test in browser DevTools → Console for any CSP violations after adding.

---

## Pass criteria (all phases)

| Phase | Gate |
|-------|------|
| 1A anon probe | 45/45 PASS |
| 1B–1D role probes | 0 issues found |
| 1E–1G policy checks | All policies present and correct |
| 2A–2G functional walkthrough | 0 blocking bugs |
| 3 data integrity | All queries return 0 rows |
| 4A–4E UI/UX | 0 dark-theme violations, 0 broken states |
| 5 triage | F-05 + CONV-M4 + L-CSP fixed; others explicitly deferred |

**All phases green → roster swap may proceed.**

---

## Execution order

1. Team review (functional, UX feedback) — parallel to audit prep
2. Phase 5 triage items fixed (F-05, CONV-M4, L-CSP)
3. Phase 1 security re-audit
4. Phase 2–4 functional + UI walkthrough
5. Phase 3 data integrity queries
6. Sign-off → **Roster Swap (RSK-0)**
