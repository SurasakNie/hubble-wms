# Pre-Launch Audit — Execution Packet
*Created: 2026-07-01 (R50) · Companion to [PRE_LAUNCH_AUDIT_PLAN.md](PRE_LAUNCH_AUDIT_PLAN.md)*

**Why this exists:** the Claude Code container this was assembled in has no network
access to prod Supabase or GitHub Pages — confirmed via a hard 403 policy denial at
the environment's outbound proxy (`curl "$HTTPS_PROXY/__agentproxy/status"` shows
`connect_rejected` for both `sjkggguedgtynktymzes.supabase.co` and
`he-cells.github.io`). So Phases 1A, 1D, 1E, 1F, 1G, 3 (Studio SQL / curl) and
Phases 1B, 1C, 2, 4 (live-browser) of the audit plan cannot be executed from that
container under any circumstances.

This doc consolidates everything needed to run those phases **without re-deriving
anything from the plan** — copy-paste SQL, copy-paste curl, and linear checklists.
Run these from a machine with real network access (or Supabase Studio for the SQL
sections), then report pass/fail back so the results can be folded into
`PRE_LAUNCH_AUDIT_PLAN.md` / `PENDING_TASKS.md`.

---

## Phase 1A — Anon probe

Re-run the anon probe script (kept locally, gitignored — not in this repo checkout).
If you don't have it handy, it re-checks the same 39 tables + 4 RPCs as the R23
baseline (`AUDIT_2026-06-11_GOLIVE.md`) with no auth token, expecting every one to
be denied/empty.

```
./anon_probe.scratch.ps1   # or whatever your local copy is named
```

**Target: 45/45 PASS** (same bar as R39/R40).

---

## Phase 1D — Client RLS probe (regression re-run)

```bash
chmod +x f01_prod_client_probe.sh
./f01_prod_client_probe.sh <test_client_email_or_code> <test_client_password>
```

Needs a test client account already provisioned (admin Clients page → provision a
login). **Target: 22/22 PASS** (same as R49).

---

## Phase 1E — Edge Function input validation

All 7 functions live at `https://sjkggguedgtynktymzes.supabase.co/functions/v1/<name>`.
Exact payload shapes below are pulled directly from the calling code
(`js/login-init.js`, `js/pages/clients.js`, `js/pages/employees.js`) so these are
real malformed variants of real requests, not guesses.

```bash
EDGE="https://sjkggguedgtynktymzes.supabase.co/functions/v1"

# 1. login — wrong password (expect 401/400, generic error, no user enumeration)
curl -si -X POST "$EDGE/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"99-9-999-99","password":"wrong"}' | head -5

# 2. login — non-existent ID (expect same generic error as wrong password, not a
#    distinct "user not found" — distinguishing the two is a user-enumeration leak)
curl -si -X POST "$EDGE/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"00-0-000-00","password":"whatever"}' | head -5

# 3. login — oversized payload (expect 400/413, not a 500 crash)
curl -si -X POST "$EDGE/login" \
  -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"12-3-456-78\",\"password\":\"$(python3 -c 'print("A"*200000)')\"}" | head -5

# 4. provision-users — no auth header (expect 401)
curl -si -X POST "$EDGE/provision-users" \
  -H 'Content-Type: application/json' \
  -d '{"employee_ids":["00000000-0000-0000-0000-000000000000"]}' | head -5

# 5. provision-users — authenticated as non-admin (expect 403). Get a member token
#    by logging in as a non-admin sci-fi roster account first, e.g. via curl #1's
#    shape with real member creds, then:
MEMBER_TOKEN="<paste access_token from a successful member login response>"
curl -si -X POST "$EDGE/provision-users" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $MEMBER_TOKEN" \
  -d '{"employee_ids":["00000000-0000-0000-0000-000000000000"]}' | head -5

# 6. provision-users — missing required field (expect 400/422)
curl -si -X POST "$EDGE/provision-users" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{}' | head -5

# 7. admin-reset-password — non-admin caller (expect 403)
curl -si -X POST "$EDGE/admin-reset-password" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $MEMBER_TOKEN" \
  -d '{"target_user_id":"00000000-0000-0000-0000-000000000000"}' | head -5

# 8. admin-reset-password — invalid UUID format (expect 400/422, not a 500)
curl -si -X POST "$EDGE/admin-reset-password" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"target_user_id":"not-a-uuid"}' | head -5

# 9. admin-set-account-active — non-admin caller (expect 403)
curl -si -X POST "$EDGE/admin-set-account-active" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $MEMBER_TOKEN" \
  -d '{"target_user_id":"00000000-0000-0000-0000-000000000000","active":false}' | head -5

# 10. admin-set-account-active — invalid UUID (expect 400/422)
curl -si -X POST "$EDGE/admin-set-account-active" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"target_user_id":"not-a-uuid","active":false}' | head -5

# 11. admin-clear-mfa — non-admin caller (expect 403)
curl -si -X POST "$EDGE/admin-clear-mfa" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $MEMBER_TOKEN" \
  -d '{"target_user_id":"00000000-0000-0000-0000-000000000000"}' | head -5

# 12. account-activation-status — non-admin caller (expect 403)
curl -si -X POST "$EDGE/account-activation-status" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $MEMBER_TOKEN" | head -5

# 13. provision-client — non-admin caller (expect 403)
curl -si -X POST "$EDGE/provision-client" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $MEMBER_TOKEN" \
  -d '{"client_id":"00000000-0000-0000-0000-000000000000","email":"x@x.com","name":"X"}' | head -5

# 14. provision-client — missing client_id (expect 400/422)
curl -si -X POST "$EDGE/provision-client" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"email":"x@x.com","name":"X"}' | head -5
```

**Pass criteria:** every non-admin call returns 401/403 (never 200, never a 500
that could indicate an unhandled crash leaking a stack trace); every malformed-input
call returns 400/422 with a JSON error body, not a 500.

---

## Phase 1F — New policy review (SQL, run in Studio)

```sql
SELECT tablename, policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE policyname IN (
  -- 20260704
  'profiles_update_own', 'evr_update', 'jtcr_own_select', 'jtcr_own_insert',
  -- 20260706 (client scoping — exact names may vary, check by table too)
  -- 20260707 (client_read_hardening)
  -- 20260708 (client_block_* RESTRICTIVE)
  'client_block_time_entries', 'client_block_leave_requests', 'client_block_employees',
  -- 20260629 (audit_log)
  'audit_log_insert_own',
  -- 20260630 (leave_requests status widen — CHECK constraint, not a policy; see next query)
  'lr_update'
)
ORDER BY tablename, policyname;
```
If a name above doesn't match what's actually in prod, run the broader query first
to discover real names, then narrow:
```sql
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('profiles','evaluation_responses','job_title_change_requests',
                     'time_entries','leave_requests','employees','audit_log')
ORDER BY tablename, policyname;
```

**Pass:** all expected policies present, `with_check` non-null where a WITH CHECK
is expected (especially `profiles_update_own`, `audit_log_insert_own`).

---

## Phase 1G — Audit log INSERT policy (spoofed actor_id test)

Run as an authenticated **non-admin** member (use their access token):
```bash
curl -si -X POST "https://sjkggguedgtynktymzes.supabase.co/rest/v1/audit_log" \
  -H "apikey: sb_publishable_ZO6nGx_2VNMO9dK_fN72Cg_LlprwmWQ" \
  -H "Authorization: Bearer <MEMBER_TOKEN>" \
  -H 'Content-Type: application/json' \
  -H 'Prefer: return=representation' \
  -d '{"actor_id":"00000000-0000-0000-0000-000000000000","action":"test","entity_type":"test"}'
```
**Expected: 403** (WITH CHECK rejects because `actor_id != auth.uid()`).

---

## Phase 1H — F-05 RPC regression check (SQL, run in Studio)

```sql
SELECT proname FROM pg_proc
WHERE proname IN ('approve_deletion_request','review_name_change_request','approve_job_title_change_request');
-- Expected: 3 rows (already verified 2026-06-30 — this is just a regression re-check)
```

---

## Phase 3 — Data integrity (SQL, run in Studio)

Run each block; every one should return **0 rows**.

```sql
-- 1. Negative leave balances
SELECT lb.*, (lb.allocated_days + COALESCE(lb.carried_over_days,0) + COALESCE(lb.manual_adjustment_days,0) - lb.used_days) AS available
FROM leave_balances lb
WHERE (lb.allocated_days + COALESCE(lb.carried_over_days,0) + COALESCE(lb.manual_adjustment_days,0) - lb.used_days) < 0;

-- 2. Orphaned time entries
SELECT te.id, te.user_id FROM time_entries te
LEFT JOIN profiles p ON p.id = te.user_id WHERE p.id IS NULL;

-- 3. Leave requests with invalid status
SELECT id, status FROM leave_requests
WHERE status NOT IN ('pending','manager_approved','approved','rejected','cancelled');

-- 4. Cash transactions with no project (review manually — top-ups may legitimately have none)
SELECT id, direction, amount FROM cash_transactions WHERE project_id IS NULL;

-- 5. Duplicate leave balances
SELECT employee_id, leave_type_code, year, COUNT(*)
FROM leave_balances GROUP BY 1,2,3 HAVING COUNT(*) > 1;

-- 6. Client profiles missing client_id
SELECT id, role, client_id FROM profiles WHERE role='client' AND client_id IS NULL;
```

---

## Phase 1B — Member role probe (browser checklist)

Log in as a regular `member` sci-fi roster account at
https://he-cells.github.io/hubble-wms/ and walk through in order:

1. [ ] Timesheet/Tracker shows only own time entries, not other employees'
2. [ ] Hand-type `#clients`, `#employees`, `#reports`, `#admin-logs` in the URL bar — each bounces (toast + redirect to `#calendar`)
3. [ ] Employee Directory / profile views show no compensation figures for anyone
4. [ ] Leave & Expense approval buttons are absent everywhere (no way to approve own or others' requests)
5. [ ] Petty Cash settings tab is not visible / not writable

## Phase 1C — Manager role probe (browser checklist)

Log in as a `manager` sci-fi roster account:

1. [ ] Team Leave / Team Time show only direct reports, not the whole company
2. [ ] Approve a leave request that has a single-tier policy → status becomes `approved`
3. [ ] Approve a leave request that has a 2-tier policy → status becomes `manager_approved`, then log in as HR/admin and approve again → `approved`
4. [ ] Hand-type `#employees` — bounces (admin-only)
5. [ ] No compensation records visible anywhere

---

## Phase 2 — Functional walkthrough (browser checklist, one pass through the whole app)

Use https://he-cells.github.io/hubble-wms/ with sci-fi roster accounts, one role at a time (member → manager → admin → client).

- [ ] **Calendar/Timesheet**: month renders with holidays; add/edit/delete a time entry; submit for approval; WFH toggle; flex swap request; admin/manager sees all team entries, member sees own only
- [ ] **Leave**: request leave; balance cards correct; 2-tier flow (pending → manager_approved → HR approves → approved); Team Leave scoped by role; Flex Swaps request/approve/reject; Holidays calendar+list view, admin CRUD; Balance tab Initialize Year + edit allocations (admin)
- [ ] **Expenses**: submit expense with receipt URL, status flow; trip settlement (request → done → settle); approvals by manager/admin; Petty Cash top-up/draw/reconcile; per-diem rate shown correctly
- [ ] **Employees & Requests**: Directory search/filter/profile; Account Status tab provision/reset/deactivate; name-change and job-title requests submit → admin approve/reject; own profile edit + avatar; Security tab TOTP enroll/disable
- [ ] **Clients & Documents**: admin adds client, manages logins, provisions client login; upload a document template, merge with employee data, preview; Reports (project stats, tag usage) admin/manager only
- [ ] **Admin Logs**: entries appear for leave/expense approve-reject, client provision, employee edit; entity/actor/date filters work; pagination kicks in past 20 rows
- [ ] **Client Portal** (separate client login): own company/project shown; hours-by-project chart renders; expenses/travel table scoped to own rows; text export contains only own data; zero employee names visible anywhere

---

## Phase 4 — UI/UX consistency (browser checklist)

- [ ] **Dark theme**: no white input boxes anywhere (spot-check expenses form, leave request form, petty cash form, document merge, password inputs) via DevTools
- [ ] **Responsive**: usable at 1280px and 1920px; tables scroll horizontally inside `.table-wrapper`; modals don't overflow at 1280px
- [ ] **Error states**: temporarily break the Supabase URL in config to trigger the F-03 error boundary → "Something went wrong" + Retry panel appears; empty lists show a meaningful message, not a blank panel; toasts appear for success/error/denial
- [ ] **Navigation**: hand-typed `#employees` as member bounces to `#calendar` with toast; hand-typed `#clients` as manager bounces; Esc closes topmost modal; back button after navigation doesn't break state
- [ ] **Shared components**: `empSelect` hyphen-tolerant search + ✕ clear + no white background; `weekNav` prev/next + date picker + This week/Show all; confirm modal (not native `confirm()`) appears for destructive actions
- [ ] **L-CSP live check (R50 follow-up)**: hard-refresh both `app.html` and `index.html`, open DevTools → Console, confirm **zero CSP violations**; specifically confirm the Inter font renders (would silently fail if `font-src` were wrong) and that login/app boot both still work (would break entirely if `script-src` were wrong for the now-externalized `js/app-init.js` / `js/login-init.js`)

---

## Reporting back

For each phase above, note pass/fail (and any specific failing row/response) and
send it back so `PRE_LAUNCH_AUDIT_PLAN.md` and `PENDING_TASKS.md` can be updated
before the team review → roster swap gate.
