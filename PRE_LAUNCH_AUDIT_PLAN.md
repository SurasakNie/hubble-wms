# Pre-Launch Audit Plan
*Created: 2026-06-30 · Status: PENDING · Gate: must pass before roster swap*

This audit runs after the team review and before the real-employee roster swap.
It has five phases. Each phase has a clear pass/fail gate.

---

## Phase 1 — Security re-audit (database + Edge Functions)

### 1A · Anon probe (re-run against prod)
⚠️ **The previously-referenced `anon_probe.scratch.ps1` never actually existed in
this repo** — confirmed 2026-07-11 after the user hit a "command not found" trying
to run it. Neither the script nor its source doc (`AUDIT_2026-06-11_GOLIVE.md`) turn
up in any checkout; that reference had been pointing at nothing for several rounds.
**Replaced with a real, repo-tracked script: `anon_probe.ps1`** (repo root), whose
table/RPC list is derived directly from the app's own `.from()`/`.rpc()` calls
(`grep -rohE ".from\('[a-z_]+'\)" js/` / `.rpc\('[a-z_]+'`), not reconstructed from
memory. Run `./anon_probe.ps1` against prod after all migrations through `20260712b`
are applied. **Target: 61/61 PASS** (47 tables + 1 dropped-view check + 13 RPCs — a
real derived total, not the old "~56" placeholder guess).

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
Re-run `f01_prod_client_probe.ps1` **against a genuine `role='client'` login**
(never an admin/manager — a non-client role correctly bypasses the RESTRICTIVE
`client_block_*` policies and produces a false-alarm mixed PASS/FAIL, R59 lesson).
Target: **0 FAIL**. The check count has grown well past the old R49 bar — R51
added the `client_project_totals` view check, R57 (PR #26 salvage) added
`employee_compensation` + 11 more `client_block_*` tables (R59 ran **34/34, 0 FAIL**),
and **A3.5 adds 6 `pn_*` tables + a `pn_items` write-denied check → 41 checks total**.
Expect **41 PASS / 0 FAIL** for a populated client (0-project clients WARN on
`get_client_project_summary`, still no FAIL).

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
- `20260710` — Part Numbers v1 policies (pn_projects/pn_type_codes/pn_counters/pn_items/pn_item_revisions)
- `20260711` — Part Numbers v2 policies (pn_attributes/pn_project_config + client_block_* RESTRICTIVE on all 6 pn_* tables)
- `20260712` — client_block_* RESTRICTIVE on 12 more tables (incl. `employee_compensation`) + `audit_log_select_admin` → `is_admin()`
- `20260629` — audit_log INSERT (actor_id = auth.uid() enforced?)
- `20260630` — leave_requests status CHECK widened (manager_approved)
- `20260713` — Team-visibility scoping: `profiles_select` replaced with a role-scoped predicate + 3 new helpers (`shares_group`, `is_my_report`, `is_client_on_my_projects`)
- `20260713b` — drops the mis-attached `trg_project_assignment_role` trigger from `project_assignments` (fixes a pre-existing bug: the table was unwritable since creation)

Verify each in Studio: `SELECT tablename, policyname, permissive, cmd, qual, with_check FROM pg_policies WHERE policyname IN (...) ORDER BY tablename, policyname;`

**Part Numbers policy check (A3):**
```sql
SELECT tablename, policyname, permissive, cmd FROM pg_policies
WHERE tablename IN ('pn_attributes','pn_project_config','pn_counters',
                    'pn_items','pn_item_revisions','pn_type_codes')
ORDER BY tablename, policyname;
-- Expect 16 policies incl. RESTRICTIVE client_block_* on all 6 tables.
SELECT count(*) FROM pg_policies WHERE tablename='pn_items' AND cmd='INSERT';
-- POSITIVE CONTROL — expect 0: minting is RPC-only (pn_create_item), no INSERT policy.
```

**Team-visibility policy check (R61 — `20260713`/`20260713b`):**
```sql
SELECT policyname, cmd, qual FROM pg_policies
WHERE tablename='profiles' AND policyname='profiles_select';
-- Expect 1 row; qual references shares_group()/is_my_report()/
-- is_client_on_my_projects()/is_admin(), not a bare auth.uid() check.

SELECT proname, proconfig FROM pg_proc
WHERE proname IN ('shares_group','is_my_report','is_client_on_my_projects');
-- Expect 3 rows, each with search_path pinned in proconfig.

SELECT event_object_table, trigger_name FROM information_schema.triggers
WHERE action_statement ILIKE '%check_assignment_role%';
-- Expect only task_assignments rows — commonly 2 (information_schema.triggers
-- gives one row per event for a multi-event trigger), not a discrepancy.
-- project_assignments must NOT appear (would mean the fix didn't apply and
-- the Projects Managers section in 2I still throws on every write).
```

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

Use the production app at https://surasaknie.github.io/hubble-wms/
(transfer completed 2026-07-03 — see
[REPO_TRANSFER_CHECKLIST.md](REPO_TRANSFER_CHECKLIST.md); the old URL is dead, no redirect).
Test with the sci-fi roster accounts (before roster swap).

> **2026-07-16 note:** the container running that session has a hard 403 network
> denial to `surasaknie.github.io` (proxy-enforced egress policy, not fixable
> client-side). Every box below was instead traced through the real source
> (page JS + API + RLS/RPC SQL) as a **static code audit** — marked 🔍-verified
> where the code confirms the behavior, 🐛 where a real gap was found, and
> ⚠️-unverified where the source needed to confirm it (usually RLS on an
> older, pre-`20260629` table) isn't in this repo's tracked SQL. None of this
> replaces an actual click-through before go-live sign-off — see the
> 2026-07-16 entry in `PENDING_TASKS.md` for full detail per finding.

> **2026-07-16 (b) — LIVE walkthrough done + R63 fixes applied.** The user ran the
> full 2A–2I click-through on prod and returned results; every finding was
> root-caused and fixed (cache v=126, branch `claude/phase-2-static-audit-66040`).
> Status legend below: **✅ live-pass** · **🔧 fixed R63 (client-side, in v=126)** ·
> **🗄 fixed R63 pending Studio migration** · **📋 by-design (docs corrected)** ·
> **🔁 re-test after migration/deploy**. Live gaps + fixes by section:
> - **2A**: 🔧 calendar prev/next (view-aware now); 🔧 billable checkbox admin/manager-only; 🔧 Tracker defaults to "Myself"; 🗄🔁 admin/manager cross-user entries were empty → `20260716` adds the missing `time_entries` manager/admin RLS. Submit-for-approval + standalone WFH toggle: confirmed **not built** (product decision, not scheduled).
> - **2B**: ✅ 2-tier leave, flex, holidays, balance tab; 🔧 year selector 3→5; 🔧 balance-card order stabilized; 🗄🔁 manager saw none of a report's leave/flex → same `20260716` RLS; 🔧🗄 maternity now female-only (needs `20260716b` gender column, apply before deploy).
> - **2C**: ✅ expense/trip/petty-cash flows; 🗄🔁 manager couldn't see a report's expense to approve → `20260716`; 🔧🗄 mileage round-trip ×2 removed (client done; `20260716c` for the trigger). Petty-cash member access: **📋 stays admin-only** (checklist corrected).
> - **2D**: ✅ approve/reject requests, account status; 🔧 employee field edits now audit-logged (see 2F). Avatar edit still absent (deferred).
> - **2E**: ✅ clients/documents/reports all live-pass.
> - **2F**: ✅ filters/pagination/existing events; 🔧 plain employee edits now log `update_employee`.
> - **2G**: ✅ client portal fully live-pass (own data only, no employee names, export clean).
> - **2H**: ✅ mint/format/delete-gap/category-help; 🔧 category now required (placeholder + guard); 🔧 CCC/PPP dup-code human error toast; 📋🔁 "duplicate customer PN made the same number" = expected (dedupe only in `manual` customer-PN mode; internal number always fresh) → re-test with a manual-mode project.
> - **2I**: ✅ member/manager/admin Team views + admin assign; 🔧 managers now get a self-assign Join/Leave button on Projects (couldn't reach the admin modal). Manager editing others' projects stays 📋 admin-only.

### 2A · Calendar & Timesheet
- [x] 🔍 Calendar renders current month, public holidays shown (`calendar.js` — holiday fetch errors are silently swallowed though, worth a UX check)
- [ ] 🐛 Weekly timesheet: add/edit/delete entries work, but **no "submit for approval" step exists anywhere** in `timesheet.js`/`calendar.js` — entries save as final immediately. Confirm intentional vs. missing.
- [ ] 🐛 **No standalone WFH toggle** — WFH is only reachable via the flex-swap request form (`js/api/leaves.js`), not a per-entry toggle. Flex swap submit itself works.
- [ ] ⚠️ Admin/manager sees all team entries; member sees own only — role-scoping is client-side (`_viewUserId` gated by `isAdmin()/isManager()`); no RLS for `time_entries` found in this repo's tracked SQL to confirm server-side enforcement (see note above — likely pre-dates the tracked-migration convention, not necessarily missing in prod)

### 2B · Leave & Holidays
- [x] 🔍 My Leave: request leave, view balance cards, see status flow — balance math correct, no off-by-one
- [x] 🔍 2-tier leave: request → manager_approved → HR approves → approved — each step guards on the correct prior status, no double-approval race
- [ ] ⚠️ Team Leave: manager UI (`holidays.js`/`holidays-team.js`) shows **all** employees' leave, not just direct reports — only the manager's own rows are excluded client-side. Same "no RLS found in repo" caveat as 2A applies; **do not treat as confirmed until a live Studio `pg_policies` check on `leave_requests`/`leave_balances`** (same pattern as R61's `profiles_select` verification)
- [x] 🔍 Flex Swaps: request, approve (manager), reject — same solid guard pattern as leave approval
- [x] 🔍 Holidays: calendar view + list view, admin CRUD — all correctly admin-gated
- [x] 🔍 Balance tab: admin can initialize year, edit allocations — correctly gated, skips existing rows on init

### 2C · Expenses & Petty Cash
- [x] 🔍 Submit expense, status flow — correct; receipt URL optional, not enforced (by design, not flagged as a bug)
- [x] 🔍 Trip settlement: request → done → settle — sound, relies on `approve_trip_settlement` RPC (not in this repo's SQL to verify server-side idempotency directly, but design/comments consistent)
- [x] 🔍 Approvals: manager/admin approve/reject, settlement confirmed — two-tier pattern consistent across cash/travel-claim/travel-request; admin overrides intentionally skip the prior-status guard
- [x] 🔍 Petty Cash: top-up/draw/reconcile — running balance correctly sums `status='approved'` only
- [ ] 🧑 Per-diem/mileage rate: client-preview only, DB trigger is source of truth (not in repo to verify computation) — **still-open item from R62:** 23 expense-out rows with no `project_id` (allowed by design), incl. one ~456k THB outlier, deferred to A7/CEO review, not a code bug

### 2D · Employees & Requests
- [x] 🔍 Directory: search, filter by dept, view profile — correct
- [x] 🔍 Account Status tab (admin): provision, reset, deactivate — correct Edge-Function pattern; activation-state fallback fails "open" (shows Activated) on missing data — confirm intentional
- [ ] 🐛 Name-change request: submit → admin **approve** is RPC-based (atomic, correct) but **reject and cancel bypass the RPC**, writing directly to `name_change_requests` — relies on unverified RLS to block non-admins from doing the same
- [ ] 🐛 Job-title request: same pattern — approve is RPC-based, **reject/cancel bypass it**
- [ ] 🐛 Profile: name edit is correctly read-only (request-flow only) — but **no avatar-edit UI exists anywhere**, only an initials placeholder; Security tab TOTP enroll/disable is correctly implemented

### 2E · Clients & Documents
- [x] 🔍 Admin: add client, manage logins, provision client login — row-level admin gating solid; the quick-add form itself has no client-side admin guard (relies on RLS, not verified in repo) — confirm `clients` INSERT RLS live
- [x] 🔍 Documents: template editor / merge / preview — correctly gated, flow intact
- [x] 🔍 Reports: project stats, tag usage (admin/manager only) — **R61's manager rate-hiding reconfirmed correct** (`showAmount = isAdmin()`, rate fetch nested inside that gate)

### 2F · Admin Logs
- [x] 🔍 Log entries appear for leave approve/reject, expense approve/reject, client provision — all confirmed via `logAction` call sites
- [ ] 🐛 Employee edit: only account-state actions (provision/reset/deactivate/2FA-clear) are logged to `audit_log` — **plain field edits (name/title/salary) get no admin-log entry**; confirm whether the separate trigger-based `employee_audit_log` table is meant to be the record of these instead
- [x] 🔍 Filters (entity, actor, date range) and pagination (`PAGE_SIZE=50`, correctly handles the >20-row case) — correct

### 2G · Client Portal (separate login)
- [x] 🔍 Own company name and project shown; hours-by-project chart; expenses/travel scoped to own rows via RLS-backed project ids; text export reuses the same filtered data — all correct by construction, no employee-name fields ever requested
- [ ] 🐛 **Freeform fields not sanitized** — expense `note` and travel `destination`/`travel_ref` pass through verbatim to the client-facing table/export; if staff type an employee's name into one, it leaks with no redaction. Soft/process risk, not an RLS bug.
- [ ] ⚠️ `get_client_project_summary()` RPC body isn't in this repo to verify it never joins in an employee/name field — recommend pulling the live DDL for a one-time check

### 2H · Part Numbers (R54/55 — new)
- [x] 🔍 Admin/manager: mint a PN on a real project → format `CCC-PPP-CAT-SEQ`; clear error if the project/client `code` is missing — confirmed in `pn_create_item` (`20260711_part_numbers_v2.sql`)
- [x] 🔍 **Member**: can mint, but Categories/Lists/Customer-PN managers are hidden/denied — UI-gated correctly; DB-level write policies also admin/manager-only (defense in depth)
- [x] 🔍 Client login: `#part-numbers` shows nothing — `client_block_*` RESTRICTIVE policies confirmed on all 6 `pn_*` tables
- [x] 🔍 Category picker shows 11 governed codes with "covers" help + decision ladder — confirmed seeded correctly
- [x] 🔍 Attribute dropdowns default to **TBD**; Lists modal opens — **R55 Lists-button bug confirmed still fixed** (double-guarded: no-arg click handler + a type-check fallback in `_openAttributesModal`)
- [x] 🔍 Client filter narrows the project picker — confirmed
- [x] 🔍 Revision bump writes a history row; Compare diffs two revisions — confirmed
- [x] 🔍 Deep link `#part-numbers?project=<id>` preselects the project — confirmed
- [x] 🔍 Duplicate customer PN rejected without burning a sequence number — **initially mis-flagged as broken by the audit pass, then verified false-positive**: the exception handler's `RAISE EXCEPTION` is uncaught and aborts the entire RPC transaction, so the earlier counter increment rolls back too. Confirmed correct.
- [x] 🔍 Delete an item → next mint doesn't reuse the number — confirmed, counter is monotonic and untouched by delete
- [ ] ⚠️ Clients/Projects `code` inputs save + uniqueness enforced — DB schema/constraints confirmed, but the actual page UI wasn't in this pass's reviewed files; still needs a quick look

### 2I · Team & Projects (R61 — new)
- [x] 🔍 Team page as **member**: same-group staff only, zero client rows, no rate column — confirmed (`profiles_select` policy + `team.js` rate-cell gating both correct)
- [x] 🔍 Team page as **manager**: same-group + reports + read-only project-clients only, no rate/role/group/delete on those rows — confirmed
- [x] 🔍 Team page as **admin/owner**: all staff + all clients, clients still read-only — confirmed
- [x] 🔍 Projects → assign modal → **Managers** section writes to `project_assignments` with no error — confirmed; the 20260713b trigger fix drops `trg_project_assignment_role` from `project_assignments` only, `task_assignments`' own trigger and `check_assignment_role()` itself are untouched
- [x] 🔍 Assign a manager to a project → that project's client appears read-only on their Team page — confirmed end-to-end via `is_client_on_my_projects()`, exactly matching what `assignManager` writes

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

-- Orphaned project assignments (20260713b regression — table was unwritable
-- until this round; confirm still clean once the 2I walkthrough starts using it)
-- NOTE: no surrogate id column on this table (project_id + manager_id is its
-- natural key, per js/api/projects.js) — verified live 2026-07-15 (42703 without this fix).
SELECT pa.project_id, pa.manager_id FROM project_assignments pa
LEFT JOIN projects p ON p.id = pa.project_id
LEFT JOIN profiles pr ON pr.id = pa.manager_id
WHERE p.id IS NULL OR pr.id IS NULL;
-- Expected: 0 rows
```

### Part Numbers integrity (A3 — all expect 0 rows)
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
post-push spot-check**: hard-refresh https://surasaknie.github.io/hubble-wms/ and its
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
still fire for the **9 real RPCs** (called from `js/` by admins/managers), the
**10 RLS-helper fns** (invoked inside policy `USING`/`CHECK` as the `authenticated`
user), **and the 4 `pn_*` functions** (`pn_create_item`, `pn_bump_revision`,
`pn_item_snapshot`, `pn_render_template` — self-hardened in `20260711` with pinned
`search_path`; they must stay authenticated-executable for the Part Numbers page to
mint/bump). All of these MUST keep EXECUTE for `authenticated` — revoking
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
| 1A anon probe | 61/61 PASS via `anon_probe.ps1` (real script, replaces the never-existent `anon_probe.scratch.ps1`) |
| 1B–1C role probes | 0 issues found |
| 1D client probe | 0 FAIL (41 checks: 34 R59 baseline + 7 Part Numbers; run as a real `role='client'` login) |
| 1E–1H policy/RPC checks | ✅ **1E + 1G done 2026-07-15** (22 PASS credentialed, A4-F2 CORS fixed → 18 PASS post-fix). ✅ **1F done 2026-07-15** — all policies present (16 pn incl. positive control; R61 `profiles_select` role-scoped exact-match, 3 helper fns search_path-pinned, trigger check shows only `task_assignments` rows, zero `project_assignments`). F-05 RPCs in prod ✅ verified 2026-06-30 (3 rows) — 1H regression re-check still to run. |
| 2A–2I functional walkthrough | 0 blocking bugs (2H = Part Numbers, 2I = Team & Projects / R61 scoping). **2026-07-16: run as a static code audit only** (no network access to prod from that container) — 4 non-blocking gaps found (2A submit-flow/WFH, 2D reject-bypass/avatar, 2F edit-logging, 2G note-sanitization) + 1 unverified RLS claim (2B team-leave scoping); see per-section notes above and the 2026-07-16 entry in `PENDING_TASKS.md`. **A live click-through is still owed before go-live sign-off.** |
| 3 data integrity | All queries return 0 rows (incl. P1–P4 Part Numbers + the `project_assignments` orphan check) |
| 4A–4E UI/UX | 0 dark-theme violations, 0 broken states, 0 CSP console violations |
| 5 triage | F-05 ✅ verified in prod (Phase 1H, done); CONV-M4 ✅ verified resolved; L-CSP ✅ fixed (⚠️ live console check still pending — see below); others explicitly deferred |
| Help-page gate (exec-order step 3) | `js/pages/help.js` covers Part Numbers, Admin Logs, Account Status, Client Portal in EN + TH before team review (A5) |

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
3. **Refresh the Help page** (`js/pages/help.js`) — ✅ **done 2026-07-10 (R60 cont., plan task A5).**
   Was frozen at Round 42 with zero mentions of Client Portal, Admin Logs, the Account Status tab,
   or Part Numbers; now covers all four (bilingual EN/TH), cache **JS v=123**. It's the user +
   admin manual reviewers will read. **🟡 Still needed:** an in-browser spot-check in prod — this
   container can't render pages to verify visually.
4. Team review (functional feedback, UX)
5. Sign-off → **Roster Swap (RSK-0)**
