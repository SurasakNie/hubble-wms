# Pre-Launch Audit — Execution Packet
*Created: 2026-07-01 (R50) · Companion to [PRE_LAUNCH_AUDIT_PLAN.md](PRE_LAUNCH_AUDIT_PLAN.md)*

**Why this exists:** the Claude Code container this was assembled in has no network
access to prod Supabase or GitHub Pages — confirmed via a hard 403 policy denial at
the environment's outbound proxy (`curl "$HTTPS_PROXY/__agentproxy/status"` shows
`connect_rejected` for both `sjkggguedgtynktymzes.supabase.co` and
`surasaknie.github.io`). So Phases 1A, 1D, 1E, 1F, 1G, 3 (Studio SQL / curl) and
Phases 1B, 1C, 2, 4 (live-browser) of the audit plan cannot be executed from that
container under any circumstances.

This doc consolidates everything needed to run those phases **without re-deriving
anything from the plan** — copy-paste SQL, copy-paste curl, and linear checklists.
Run these from a machine with real network access (or Supabase Studio for the SQL
sections), then report pass/fail back so the results can be folded into
`PRE_LAUNCH_AUDIT_PLAN.md` / `PENDING_TASKS.md`.

---

## Phase 1A — Anon probe

⚠️ **`anon_probe.scratch.ps1` never actually existed in this repo or anywhere else
reachable** — it had been referenced as "kept locally, gitignored" for several
rounds, but neither the script nor its source doc (`AUDIT_2026-06-11_GOLIVE.md`)
turned up in any checkout when actually searched (2026-07-11). That reference was
pointing at nothing.

**Replaced with a real, repo-tracked script: `anon_probe.ps1`** (repo root). Its
table/RPC list is derived directly from `grep -rohE ".from\('[a-z_]+'\)" js/` and
`grep -rohE ".rpc\('[a-z_]+'" js/` against the actual app code — not reconstructed
from memory — plus 4 known schema objects the client never queries directly
(`pn_counters`, `login_attempts`, `pn_item_snapshot`, `pn_render_template` —
server-side-only, but still must deny anon per the A1 hardening migration).

```powershell
./anon_probe.ps1
```

**Target: 61/61 PASS** (47 tables + 1 dropped-view regression check + 13 RPCs) —
this is a real, derived total, not the old placeholder guess of "~56". If it prints
a different total, the table/RPC list has drifted from the app's actual `.from()`/
`.rpc()` calls since 2026-07-11 — re-derive with the two `grep` commands above
before trusting a stale count.

---

## Phase 1D — Client RLS probe (regression re-run)

```bash
chmod +x f01_prod_client_probe.sh
./f01_prod_client_probe.sh <test_client_email_or_code> <test_client_password>
```

Needs a test client account already provisioned (admin Clients page → provision a
login). **Run it against a genuine `role='client'` login — never an admin/manager**
(a non-client role correctly bypasses the RESTRICTIVE `client_block_*` policies and
produces a false-alarm mixed PASS/FAIL — R59 lesson). **Target: 0 FAIL. 41 checks**
(34 verified in R59 + 7 added by A3.5: 6 `pn_*` tables + a `pn_items` write-denied
check). 0-project clients WARN on `get_client_project_summary` but still 0 FAIL.

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

### CORS regression test (A3.1 — catches the R53 outage class)

The R53 repo transfer silently broke login because every Edge Function's
`ALLOWED_ORIGINS` was hardcoded to the old `he-cells.github.io` domain. The input-
validation block above sends no `Origin` header, so it cannot catch this. Run:

```bash
EDGE="https://sjkggguedgtynktymzes.supabase.co/functions/v1"
NEW_O="https://surasaknie.github.io"; OLD_O="https://he-cells.github.io"
for FN in login provision-users admin-reset-password admin-set-account-active \
          admin-clear-mfa account-activation-status provision-client; do
  echo "== $FN — new origin (EXPECT ACAO: $NEW_O)"
  curl -si -X OPTIONS "$EDGE/$FN" -H "Origin: $NEW_O" \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: authorization,content-type' \
    | grep -i '^access-control-allow-origin' || echo '  !! no ACAO — FAIL'
  echo "== $FN — old origin (EXPECT no ACAO echo)"
  curl -si -X OPTIONS "$EDGE/$FN" -H "Origin: $OLD_O" \
    -H 'Access-Control-Request-Method: POST' \
    | grep -i "access-control-allow-origin.*he-cells" \
    && echo '  !! old origin still allowed — remove from ALLOWED_ORIGINS' || echo '  ok'
done
```
**Pass:** all 7 echo the new origin; none echo the old one.

---

## Phase 1F — New policy review (SQL, run in Studio)

```sql
SELECT tablename, policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE policyname IN (
  -- 20260704
  'profiles_update_own', 'evr_update', 'jtcr_select_own', 'jtcr_insert_own',
  -- 20260706 (client scoping — exact names may vary, check by table too)
  -- 20260707 (client_read_hardening)
  -- 20260708 (client_block_* RESTRICTIVE)
  'client_block_time_entries', 'client_block_leave_requests', 'client_block_employees',
  -- 20260629 (audit_log)
  'audit_log_insert',
  -- 20260630 (leave_requests status widen — CHECK constraint, not a policy; see next query)
  'lr_update'
)
ORDER BY tablename, policyname;
```
**Names verified live 2026-07-15** against the actual policy names on `job_title_change_requests` and `audit_log` (the doc previously guessed `jtcr_own_select`/`jtcr_own_insert`/`audit_log_insert_own` — real names have the `_own` suffix/position swapped: `jtcr_select_own`/`jtcr_insert_own`/`audit_log_insert`). If a name above still doesn't match what's in prod, run the broader query first to discover real names, then narrow:
```sql
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('profiles','evaluation_responses','job_title_change_requests',
                     'time_entries','leave_requests','employees','audit_log')
ORDER BY tablename, policyname;
```

**Pass:** all expected policies present, `with_check` non-null where a WITH CHECK
is expected (especially `profiles_update_own`, `audit_log_insert` — the latter's
`with_check` should read `(actor_id = auth.uid())`).

### Part Numbers policy review (A3.2 — `20260710`/`20260711`)

```sql
SELECT tablename, policyname, permissive, cmd FROM pg_policies
WHERE tablename IN ('pn_attributes','pn_project_config','pn_counters',
                    'pn_items','pn_item_revisions','pn_type_codes')
ORDER BY tablename, policyname;
-- Expect 16 policies incl. RESTRICTIVE client_block_* on all 6 tables.
SELECT count(*) FROM pg_policies WHERE tablename='pn_items' AND cmd='INSERT';
-- POSITIVE CONTROL — expect 0: minting is RPC-only (pn_create_item), no INSERT policy.
```

**Pass:** 16 rows total, one RESTRICTIVE `client_block_*` per pn table, and 0 INSERT
policies on `pn_items`.

### Team-visibility scoping review (R61 — `20260713`/`20260713b`)

```sql
-- profiles_select must now be role-scoped, not the old blanket-read policy
SELECT policyname, cmd, qual FROM pg_policies
WHERE tablename='profiles' AND policyname='profiles_select';
-- Expect 1 row; qual should reference shares_group()/is_my_report()/
-- is_client_on_my_projects()/is_admin() — not a bare "auth.uid() IS NOT NULL".

-- The 3 new SECURITY DEFINER helpers, search_path pinned (0028/0011 hardening)
SELECT proname, proconfig FROM pg_proc
WHERE proname IN ('shares_group','is_my_report','is_client_on_my_projects');
-- Expect 3 rows, each with a search_path entry in proconfig (none NULL).

-- project_assignments trigger-fix regression (20260713b) — the fix removed a
-- mis-attached trigger that made the table permanently unwritable
SELECT event_object_table, trigger_name FROM information_schema.triggers
WHERE action_statement ILIKE '%check_assignment_role%';
-- Expect only task_assignments rows — commonly 2 (information_schema.triggers
-- gives one row per event for a multi-event trigger, e.g. BEFORE INSERT OR
-- UPDATE), not a discrepancy. What matters: zero project_assignments rows.
-- If project_assignments still appears, the fix migration didn't apply and
-- the Projects page's Managers section (2I) will still throw on every write.
```

**Pass:** `profiles_select` present with the role-scoped `qual`; all 3 helper
functions present with pinned `search_path`; the trigger query returns only
`task_assignments` rows (2 is normal) and zero `project_assignments` rows.

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

-- 7. Orphaned project assignments (20260713b regression — table was unwritable
--    until this round, so this should already be 0, but confirm before/after
--    the 2I Managers-section walkthrough puts real rows in it)
SELECT pa.id, pa.project_id, pa.manager_id FROM project_assignments pa
LEFT JOIN projects p ON p.id = pa.project_id
LEFT JOIN profiles pr ON pr.id = pa.manager_id
WHERE p.id IS NULL OR pr.id IS NULL;
```

### Part Numbers integrity (A3.4 — all expect 0 rows)

```sql
-- P1. Internal PN uniqueness (belt+braces vs the UNIQUE constraint)
SELECT part_number, COUNT(*) FROM pn_items GROUP BY 1 HAVING COUNT(*)>1;
-- P2. Counter consistency: last_seq must cover MAX(seq) per (project, category)
SELECT i.project_id, i.cat_code, MAX(i.seq) AS max_seq, c.last_seq
FROM pn_items i
LEFT JOIN pn_counters c ON c.project_id=i.project_id AND c.scope=i.cat_code
GROUP BY i.project_id, i.cat_code, c.last_seq
HAVING c.last_seq IS NULL OR MAX(i.seq) > c.last_seq;
-- P3. Items whose project/client lost its code (should be impossible post-v2)
SELECT i.id, i.part_number FROM pn_items i
JOIN projects p ON p.id=i.project_id
LEFT JOIN clients cl ON cl.id=p.client_id
WHERE p.code IS NULL OR cl.code IS NULL;
-- P4. Revisions missing their snapshot (v2 wiped test data; all current rows are v2-minted)
SELECT id, item_id, revision FROM pn_item_revisions WHERE snapshot IS NULL;
```

---

## Phase 1B — Member role probe (browser checklist)

Log in as a regular `member` sci-fi roster account at
https://surasaknie.github.io/hubble-wms/ (see
[REPO_TRANSFER_CHECKLIST.md](REPO_TRANSFER_CHECKLIST.md)) and walk through in order:

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

Use https://surasaknie.github.io/hubble-wms/ with sci-fi roster accounts, one role at a time (member → manager → admin → client).

- [ ] **Calendar/Timesheet**: month renders with holidays; add/edit/delete a time entry; submit for approval; WFH toggle; flex swap request; admin/manager sees all team entries, member sees own only
- [ ] **Leave**: request leave; balance cards correct; 2-tier flow (pending → manager_approved → HR approves → approved); Team Leave scoped by role; Flex Swaps request/approve/reject; Holidays calendar+list view, admin CRUD; Balance tab Initialize Year + edit allocations (admin)
- [ ] **Expenses**: submit expense with receipt URL, status flow; trip settlement (request → done → settle); approvals by manager/admin; Petty Cash top-up/draw/reconcile; per-diem rate shown correctly
- [ ] **Employees & Requests**: Directory search/filter/profile; Account Status tab provision/reset/deactivate; name-change and job-title requests submit → admin approve/reject; own profile edit + avatar; Security tab TOTP enroll/disable
- [ ] **Clients & Documents**: admin adds client, manages logins, provisions client login; upload a document template, merge with employee data, preview; Reports (project stats, tag usage) admin/manager only
- [ ] **Admin Logs**: entries appear for leave/expense approve-reject, client provision, employee edit; entity/actor/date filters work; pagination kicks in past 20 rows
- [ ] **Client Portal** (separate client login): own company/project shown; hours-by-project chart renders; expenses/travel table scoped to own rows; text export contains only own data; zero employee names visible anywhere
- [ ] **Part Numbers** (2H): admin/manager mints `CCC-PPP-CAT-SEQ` on a real project (clear error if project/client `code` missing); member can mint but Categories/Lists/Customer-PN managers are hidden/denied; client `#part-numbers` shows no data; category picker = 11 governed codes + "covers"/decision-ladder help; attribute dropdowns default **TBD**, Lists modal opens; client filter narrows the project picker; revision bump writes history + ⓘ→Compare diffs two revisions; deep link `#part-numbers?project=<id>` preselects; duplicate customer PN rejected without burning a seq; delete → next mint doesn't reuse the number; Clients `code` + Projects `code` inputs save with uniqueness enforced
- [ ] **Team & Projects** (2I, R61 new): member's Team page shows same-group staff only — zero client rows, no billable-rate column; manager's Team page shows same-group staff + direct reports + read-only client rows (no rate/role/group/delete controls) scoped to clients on the manager's own assigned projects; admin/owner Team page shows all staff + all clients (clients read-only); Projects → assign modal's **Managers** section toggles a manager on/off `project_assignments` without the old `record "new" has no field "assignee_type"` error; assigning a manager to a project makes that project's client appear on the manager's Team page (positive-control follow-through)

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
