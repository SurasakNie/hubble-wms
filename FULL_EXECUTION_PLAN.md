# WMS Full Execution Plan — Launch Path + Post-Launch Roadmap

*Created: 2026-07-09 (R56) · **Living document** — update task statuses in place as work closes; archive a task one session after it's ✅ (same rule as PENDING_TASKS.md).*

**What this is:** the single consolidated plan for everything left on this project, in two tracks:

- **Track A — Launch path** (A1–A8, strictly ordered): everything between today and the real-roster go-live. Wraps [PRE_LAUNCH_AUDIT_PLAN.md](PRE_LAUNCH_AUDIT_PLAN.md) (executed at A4) and folds in the 2026-07-09 review findings against it (fixed at A2–A3).
- **Track B — Post-launch roadmap** (B1–B9, ordered by recommended value): supersedes the stale status column in [HE_Integrations_and_WMS_Roadmap.md](HE_Integrations_and_WMS_Roadmap.md) Part 2 and the retired "Future roadmap" section of PENDING_TASKS.md.

**Owner legend:** 🤖 = Claude session in this repo (no prod network — hard 403 to Supabase/Pages, re-confirmed 2026-07-09) · 🧑 = user (prod access, Studio, credentials, or a decision) · 🌐 = any human/agent with real network access (browser + curl against prod).

**Effort legend:** S = under an hour · M = one session · L = multi-session.

---

## Dependency map

```
A0+A1 (Studio migrations, one sitting — do any time)    Track B (post-launch)
                                                          go-live ─→ B2 Sheets daily export (first, tiny)
A2 (doc fixes) ─→ A3 (audit coverage) ─→ A4 (run audit)            B4 toggles (any time, 5 min)
A5 (Help page) ────────────────────────────┐                       B1 M1 central hub (big build)
A6 (closeout content) ─────────────────────┤                       B3 audit-backlog batch
                                           ▼                       B7 decisions ─→ B6 deferred features
                                    A7 (team review)               B5 BOM (after B1 or parallel)
                                           ▼                       B8 paid tiers (CEO) · B9 verify/close
                                    A8 (roster swap → GO-LIVE)
```

A2 must precede A4 (the auditor needs corrected targets/URLs); A3 should precede A4 (or the audit under-tests Part Numbers and CORS). A5 and A6 only need to land before A7. A8 is last, always.

---

# Track A — Launch path

## A0 · Apply the PR #26 salvage migrations in Studio *(added 2026-07-09, R57)*

**Status:** ✅ **DONE — applied, verified via SQL, and enforcement proven live via client probe (2026-07-09, R59).** · **Owner:** 🧑 · **Effort:** S (done)

**Why:** salvaged from the orphaned PR #26 audit (2026-07-03, never merged). `20260708`'s hand-maintained client-block list missed 12 internal tables — worst: **`employee_compensation` (salary/rate PII)**, which the app really reads (`js/api/employees.js:210`) and which the F-01 probe never covered (it probed the wrong table name, `compensation_records`). Both migrations are deny-only / defense-in-depth — safe even where base RLS already protects a table.

**Done:**
1. ✅ `20260712_client_block_expanded.sql` applied — `pg_policies` confirms all 12 new `client_block_*` policies + the `audit_log_select_admin` swap to `is_admin()`.
2. ✅ `20260712b_f05_rpc_search_path.sql` applied — `pg_proc.proconfig` confirms `search_path=public, pg_temp` on all 3 F-05 RPCs.
3. ✅ **Live enforcement proven**: `f01_prod_client_probe.ps1` run against a genuine `role='client'` login (`Delos.Test1@example.mail`, Delos Incorporated) — **34 PASS / 0 FAIL**. Own-scope access correct (1 profile, 1 client company, 3 projects); all 23 internal/PII tables incl. the 12 newly-blocked ones return 0 rows; all writes denied.

*(Side note kept for the record: the first two probe attempts used `hubbleengineering@gmail.com`, `role='manager'` — produced a false-alarm 17 PASS/17 FAIL. Non-client roles correctly bypass the RESTRICTIVE `client_block_*` policies (`auth_is_client()` is false for them), so full team-data visibility there was expected, not a leak. Lesson: the F-01 probe must always be run with a genuine `role='client'` login.)*

**Acceptance:** probe 0 FAIL; a client JWT gets 0 rows from all 12 tables; admin still sees Admin Logs (audit_log policy swap is behaviour-preserving). **✅ All met.**

---

## A1 · Apply `20260709_lint_search_path_and_execute_hardening.sql` in Studio

**Status:** ✅ **DONE — applied + verified live 2026-07-09 (R59).** All 3 footer VERIFY queries, run individually in Studio, returned 0 rows (search_path pins present; no anon-executable SECURITY DEFINER fn; trigger fns no longer authenticated-executable). · **Owner:** 🧑 · **Effort:** S (done) · **Depends:** nothing

**Why:** closes Supabase linter security WARNs 0011 (12 functions with mutable `search_path`) and 0028 (27 SECURITY DEFINER functions executable by `anon`). The 0028 item is the one that matters — it's the same class as the real `get_project_stats` anon leak fixed in `20260630`.

**Steps:**
1. Supabase Studio → SQL Editor → paste the whole file → Run. Expect a stream of `NOTICE` lines (one per function touched).
2. Run the three commented `VERIFY` queries at the file footer — **each must return 0 rows**.
3. Re-run Database Linter. Expected residuals, all **by design, do not re-flag**: 0029 (authenticated-executable) on the 9 real RPCs + 10 RLS helpers **+ the 4 pn functions** (`pn_create_item`, `pn_bump_revision`, `pn_item_snapshot`, `pn_render_template` — self-hardened in `20260711`, same acceptance rationale); 0032 stays until B4.
4. Report back → 🤖 flips the migrations table row in `Timesheet_WMS_Master_Plan.md` to ✅.

**Acceptance:** 3 VERIFY queries return 0 rows; linter shows no 0011/0028 WARNs.

---

## A2 · Doc-accuracy corrections (2026-07-09 review findings)

**Status:** 🔴 open · **Owner:** 🤖 · **Effort:** S–M (docs only, no cache bump) · **Depends:** nothing · **Blocks:** A4

**Why:** the audit plan/packet froze at 2026-07-01; three ship events since (repo transfer R53, Part Numbers R54/55, probe view-check R51) made specific lines wrong. An auditor following the packet literally hits a dead URL and two wrong numeric targets.

| # | File · location | Wrong → Right |
|---|---|---|
| 1 | `PRE_LAUNCH_AUDIT_EXECUTION_PACKET.md:229,252` | `he-cells.github.io` "(pending transfer)" → `https://surasaknie.github.io/hubble-wms/` (transfer done 2026-07-03, old URL dead) |
| 2 | `PRE_LAUNCH_AUDIT_PLAN.md:256` (L-CSP section) | same dead-URL phrasing → new URL |
| 3 | Plan 1D + packet 1D + pass-criteria table | client probe target `22/22` → **0 FAIL (~35 checks)** — R51 added the view check, and R57 (PR #26 salvage) added `employee_compensation` + 11 more client-block tables; grows again by ~7 after A3.5's pn additions |
| 4 | Plan 1A + packet 1A + pass-criteria | anon probe `45/45` → note the baseline predates `audit_log` (R45) + 6 `pn_*` tables + 4 pn RPCs; re-baseline per A3.6 |
| 5 | Plan Phase 5 residual-0029 paragraph | add the 4 pn functions to the "ACCEPTED / by-design" list |
| 6 | Plan pass-criteria table | add a row for the Help-page gate (execution-order step 3) |
| 7 | Plan 2E | "upload template" → "create template in the TEMPLATES editor" |
| 8 | `HE_Integrations_and_WMS_Roadmap.md` Part 2 table | Phase 0 "Reports stub pending" → done; Phase 1 "⏸ Before launch" → ✅ LIVE 2026-06-14; Phase 6 "🔨 Next build target" → ✅ R19; Phase 7 "📋 Roadmap" → ✅ R20–22 (wording closeout only). Only Phase 2 stays 📋 |
| 9 | Same file, "Core finding" auth section | mark the OTP/freeze-on-unlink design **superseded** by the shipped 2026-06-12 spec (Employee ID + admin password, optional TOTP w/ Skip) — link the PENDING_TASKS 🔐 section |
| 10 | Same file, files-summary table | drop the never-created `WMS-expansion-roadmap.md` reference |
| 11 | `PENDING_TASKS.md` "🟢 Future roadmap" section | archive the CLIENT-01 entry as ✅ shipped R38–39 (live, audited 0-FAIL); point the section at **this** plan's Track B |

**Acceptance:** grep finds no `he-cells.github.io` in either audit doc; no `22/22`; roadmap table matches the Master Plan dashboard; CLIENT-01 no longer listed as future.

---

## A3 · Audit coverage extensions (Part Numbers + CORS)

**Status:** 🔴 open · **Owner:** 🤖 (docs + probe scripts; no page JS → no cache bump) · **Effort:** M · **Depends:** A2 (same files) · **Blocks:** A4

**Why:** Part Numbers (R54/55) shipped after the audit plan was written — the audit currently never tests it. And Phase 1E sends no `Origin` header, so it cannot catch the exact CORS failure that already took down login once (R53).

### A3.1 · CORS regression test → packet Phase 1E *(highest value)*
Append to the 1E section:

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

### A3.2 · Part Numbers policies → plan/packet Phase 1F
Add `20260710`/`20260711` to the "policies added since R40" list, plus this Studio SQL:
```sql
SELECT tablename, policyname, permissive, cmd FROM pg_policies
WHERE tablename IN ('pn_attributes','pn_project_config','pn_counters',
                    'pn_items','pn_item_revisions','pn_type_codes')
ORDER BY tablename, policyname;
-- Expect 16 policies incl. RESTRICTIVE client_block_* on all 6 tables.
SELECT count(*) FROM pg_policies WHERE tablename='pn_items' AND cmd='INSERT';
-- POSITIVE CONTROL — expect 0: minting is RPC-only (pn_create_item), no INSERT policy.
```

### A3.3 · Part Numbers walkthrough → plan Phase **2H** (new) + packet Phase 2
- [ ] Admin/manager: mint a PN on a real project → format `CCC-PPP-CAT-SEQ`; clear error if the project/client `code` is missing
- [ ] **Member**: can mint, but Categories/Lists/Customer-PN managers are hidden/denied (manage is admin/manager-only)
- [ ] Client login: `#part-numbers` shows nothing / no data (client_block_*)
- [ ] Category picker shows 11 governed codes with "covers" help + decision ladder
- [ ] Attribute dropdowns default to **TBD** when unset; Lists modal opens (R55 regression: the Lists-button bug)
- [ ] Client filter narrows the project picker
- [ ] Revision bump writes a history row; ⓘ info modal → **Compare** diffs two revisions
- [ ] Deep link `#part-numbers?project=<id>` from a Projects row preselects the project
- [ ] Duplicate customer PN (same project, case-insensitive) rejected **without burning a sequence number**
- [ ] Delete an item (admin) → next mint does **not** reuse the number (gap-free, never-reused)
- [ ] Clients page: `code` (CCC) input saves; Projects page: `code` (PPP) input saves; uniqueness enforced

### A3.4 · Part Numbers integrity → plan/packet Phase 3 (all expect 0 rows)
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

### A3.5 · Extend the client probe scripts (`.sh` + `.ps1`)
Add after the existing `check_zero` block (mirror in PowerShell with `Check-MustZero`):
```bash
check_zero "pn_items"          "pn_items"
check_zero "pn_item_revisions" "pn_item_revisions"
check_zero "pn_attributes"     "pn_attributes"
check_zero "pn_type_codes"     "pn_type_codes"
check_zero "pn_project_config" "pn_project_config"
check_zero "pn_counters"       "pn_counters"
check_write_denied "pn_items" "pn_items" \
  '{"project_id":"00000000-0000-0000-0000-000000000000","cat_code":"PRT","seq":1,"part_number":"PROBE-XXX-PRT-999","name":"probe"}'
```
New target ≈ **30 checks** — update plan 1D / packet 1D / pass criteria with the exact printed total.

### A3.6 · Anon-probe re-baseline note → packet Phase 1A
The anon script is local/gitignored, so document what to add: 6 `pn_*` tables + `audit_log` (anon SELECT → 0 rows/denied) and 4 pn RPC calls (`pn_create_item`, `pn_bump_revision`, `pn_item_snapshot`, `pn_render_template` → 401/permission error for anon; grants stripped in `20260711` + A1). New target ≈ **56/56**; re-baseline on first run and record the number.

**Acceptance (A3):** packet contains all snippets above; probe scripts parse (`bash -n`); targets consistent across plan/packet/pass-criteria.

---

## A4 · Execute pre-launch audit Phases 1–4

**Status:** 🔴 blocked on network — **cannot run from this container** (hard 403 to prod Supabase + Pages, re-confirmed 2026-07-09) · **Owner:** 🧑/🌐 · **Effort:** ~2–4 h human time · **Depends:** A2 + A3 · **Blocks:** A7

**What:** run [PRE_LAUNCH_AUDIT_EXECUTION_PACKET.md](PRE_LAUNCH_AUDIT_EXECUTION_PACKET.md) top to bottom: 1A anon probe → 1B member probe → 1C manager probe → 1D client probe → 1E Edge-Fn validation **+ new CORS block** → 1F policy review (+ pn) → 1G audit-log spoof test → 1H RPC regression → Phase 2 walkthrough (2A–2G **+ 2H Part Numbers**; during 2F confirm a `provision_client_login` row appears in Admin Logs — closes B9.1) → Phase 3 integrity SQL (+ P1–P4) → Phase 4 UI/UX **+ L-CSP live console check** (zero CSP violations on both pages; Inter font renders; login + app boot work).

**Needs from 🧑:** Studio access; sci-fi member/manager/admin creds; a provisioned test client login; member + admin access tokens (from the `login` fn response).

**Report back:** pass/fail per phase + failing detail → 🤖 folds results into the plan docs and fixes anything code-fixable (with cache bump per CLAUDE.md).

**Acceptance:** every pass-criteria row green (with the corrected targets), or failures triaged into fix tasks.

---

## A5 · Refresh the Help page (user + admin manual)

**Status:** 🔴 open — gate added 2026-07-09 · **Owner:** 🤖 build, 🧑 spot-check in prod · **Effort:** M · **Depends:** nothing · **Blocks:** A7

**Why:** `js/pages/help.js` is frozen at Round 42 — grep confirms **zero** mentions of the Client Portal, Admin Logs, Account Status tab, or Part Numbers. Reviewers will read this as the manual; it must describe the app they're reviewing.

**Content to add (each EN + TH, role-gated like the existing tabs):**
- **User Guide:** Part Numbers (what a `CCC-PPP-CAT-SEQ` number means, how to mint, category decision ladder, revisions/Compare); 2-tier leave approval (what `manager_approved` means for the employee).
- **Admin Guide:** Clients → Manage logins (provision/reset/delete client logins, copy-credentials); Client Portal (what clients can see — summary hours, masked expenses); Admin Logs page (filters, what's logged); Account Status tab (Never signed in / Not provisioned / Deactivate–Reactivate); Part Numbers governance (client/project `code` prerequisites, category + attribute list management, customer-PN modes); HR approval step for 2-tier leave.
- Sanity pass over existing sections for drift (login flow, petty-cash placeholder amounts).

**Mechanics:** static content only, no network calls (keep it that way); follow existing help.js section/tab structure and the EN/TH toggle; **cache bump `V` 120→121** in `js/app-init.js` per CLAUDE.md (page JS changed).

**Acceptance:** every WMS nav item has a matching Help section in both languages; grep for "Part Number", "Admin Logs", "Account Status", "Client Portal" hits in `help.js`; page renders clean (ESM parse + in-browser check at A7).

---

## A6 · Closeout content (decisions + wording)

**Status:** 🔴 open · **Owner:** 🧑 decides, 🤖 wires · **Effort:** M (mostly 🧑 writing time) · **Depends:** nothing · **Blocks:** A7 (ideally — reviewers should see real template wording)

1. **Template wording** — all 9 document templates are workflow placeholders. 🧑 supplies final HE wording (EN or EN+TH per template) → paste via the in-app TEMPLATES editor (no code, no migration). Option: 🤖 drafts all 9 for 🧑 to edit — say the word.
2. **Leave pro-rating + Dec-31 reset decision** — record the policy (carry-over? encashment? pro-rate mid-year joiners?). Currently the system defaults to 0 carry-over and has a noted-but-unbuilt Dec-31 reset plan. Decision gets recorded in `HE_WMS_Specification.md` §5; any automation becomes a B-track task.
3. **Structure-doc re-sync** — timesheet plan §7 + Spec §14 nav tree to final as-built state (15 pages incl. `#part-numbers`, `#admin-logs`, `#help`).

**Acceptance:** no template renders placeholder text; leave policy decision written down; nav trees match `app.html`.

---

## A7 · Team review

**Status:** ⏸ waiting on A4/A5/A6 · **Owner:** 🧑 + team · **Effort:** external

Functional + UX feedback pass by the team on the live sci-fi-roster app. Findings triage: 🤖 fixes code-fixable items (cache bumps per CLAUDE.md), decisions logged in PENDING_TASKS. Exit = team sign-off.

---

## A8 · Roster swap + go-live (LAST — RSK-0)

**Status:** ⏸ gated on A7 sign-off · **Owner:** 🧑 (Studio) with 🤖-prepared SQL · **Effort:** M, one sitting · **Risk:** RSK-0 — **requires 3 in-session user confirms** before the destructive step

**Pre-flight (same day):** confirm last night's `hubble-wms-backups` dump exists + take an on-demand dump (`supabase/backups/db_dump.ps1`); confirm rollback = restore path documented in the backups README.

**Steps (in order, one sitting):**
1. Recall the real roster (`real-employee-roster.md` memory) — 14 real employees, correct dept codes (mostly Mechanical).
2. **TRUNCATE CASCADE** the employee/timesheet demo data (⚠️ the RSK-0 step — 3 explicit confirms).
3. Seed 14 real employees; set employee-number sequence → 15.
4. Initialize Year for the 6 active leave-eligible employees.
5. Provision real accounts via `provision-users` (remember `email_confirm: true` behavior); distribute credential sheets per-person, never one master sheet.
6. **Rotate the Google OAuth client secret (R10-D) in the same sitting.**
7. Smoke: one real member login + timesheet entry; one admin login; client portal untouched.

**Acceptance:** real roster live, all provisioned users can log in, anon + client probes still green, OAuth secret rotated.

---

# Track B — Post-launch roadmap

*Recommended order: B2 → B4 → B1 → B3 → B5 → B6 (B7/B8 are decision gates that can run any time; B9 folds into A4).*

## B1 · Phase 2 / M1 — Timesheet → Central Hub *(the big one)*

**Status:** 📋 roadmap (the only unbuilt WMS module) · **Owner:** 🤖 build, 🧑 decisions + Studio applies · **Effort:** L (est. 3–5 sessions, 2–3 migrations) · **Risk:** RSK-1 (touches the core table every page reads)

**Why first among builds:** it retroactively hardens two shipped modules — PT weekly wages and evaluation KPIs currently read **logged** hours (acknowledged in `js/pages/expenses-report.js:201`); M1 makes them read **approved-and-locked** hours. Also unlocks 3 deferred features (per-entry PT approval, Business-Trip auto-fill, finance-grade payroll export).

**Design decisions to settle FIRST (🧑, one planning session):**
| # | Question | Leaning |
|---|---|---|
| D1 | Submission granularity: per-week `timesheet_submissions` table (week, user, status, approver) vs per-entry status column | Per-week table + entry `status` mirror — spec §4.4 says weekly submit/approve/lock |
| D2 | Clock In/Out mandatory for FT? (PT already hour-logged) | Optional at first — attendance fields nullable |
| D3 | Overtime formula (above standard hours = 8/day? 40/wk?) | Needs HE policy input |
| D4 | Who unlocks an approved week | Admin only (spec §4.5) |
| D5 | Late-submission threshold (OD-7) | e.g. Tuesday 12:00 for prior week |

**Build phases:**
- **B1.a Schema** — migration: `work_location` enum + `clock_in/clock_out` + `overtime_hours` on `time_entries`; new `timesheet_submissions` (user, week_monday, status draft/submitted/approved/rejected, approver_id, comment, locked_at); RLS (owner writes draft-week entries only; manager approves direct reports via `is_manager_of()`; admin override/unlock); lock-enforcement trigger (reject entry writes in a locked week). Scratch-PG16 test suite like R55's.
- **B1.b Auto-fill engine** — on approval of leave / flex / holiday / trip (M2/M4 triggers): upsert locked, status-tagged timesheet rows for the affected dates; idempotent; conflict rule (existing manual entry on an approved-leave day → flag, don't overwrite).
- **B1.c UI** — Timesheet page: week status banner + Submit button (weekNav component, `ts` prefix stays); Approvals queue for managers (new tab on Team or Notifications page — decide in planning); locked-row styling; reject-with-comment modal (promptModal).
- **B1.d Downstream rewires** — weekly-wage report + `get_evaluation_kpis` read approved hours (flag "includes unapproved" until then); Reports CSV gains status column; Sheets export (B2) gains a status column.
- **B1.e Late flag** — computed badge per OD-7 threshold; visible to manager + admin.

**Acceptance:** submit→approve→lock round-trip works for all roles; locked weeks reject writes at the DB (not just UI); auto-fill covers all 4 sources; KPIs/wages read approved hours; anon + client probes extended and green.

## B2 · Google Sheets daily auto-export

**Status:** ⏸ parked, plan ready (cadence changed weekly→daily 2026-07-09) · **Owner:** 🤖 writes files, 🧑 pastes + runs (Apps Script is outside this repo's deploy) · **Effort:** S–M · **Prereqs:** app live; 🧑 creates the destination Sheet and provides its URL

**Steps:** per [HE_Integrations_and_WMS_Roadmap.md](HE_Integrations_and_WMS_Roadmap.md) Part 1 — create `integrations/google-sheets/Code.gs` (`dailyExport()`, `setUpTrigger()` with `everyDays(1).atHour(23)`, `testConnection()`), `appsscript.json` (`Asia/Bangkok`), README; 🧑 pastes into the Sheet-bound Apps Script project, sets `SUPABASE_URL` + `SERVICE_ROLE_KEY` Script Properties, runs the 6 verification steps (incl. the dedup re-run and Notes-survival check). Service-role key lives ONLY in Script Properties.
**Follow-on:** the parked 09:30 / Monday-AM summary delivery folds into this scheduler.

## B3 · Post-launch audit-backlog batch (one quiet-window session)

**Owner:** 🤖 · **Effort:** M–L

| Item | What | Where |
|---|---|---|
| L-ADMCK | WITH CHECK on ~15 admin UPDATE policies | migration |
| L-INITYR | Initialize-Year error surfacing | `holidays.js` balance tab |
| RLS-M2 | Guard `avatar_url`/`preferences` in the profiles self-update trigger | migration |
| RLS-M3 | Column-set restriction on `ct/trq/ncr` UPDATE | migration |
| XSS re-verify | Agent sweep re-confirming the static-pass closure of XSS-M1–M4 | `requests/employees/evaluation/documents.js` |
| DATE-L1/L2 | Evaluation deadline + `_isRecent` UTC windows | `evaluation.js`, `requests.js` |
| CONV-L1 | Extract duplicated `_nextWeekday` → `format.js` | `holidays.js`, `expenses.js` |
| CONV-L2 | Destroy FullCalendar instance on route change | `tracker.js` |
| MODAL-L1 | `entryModal` stale `_userId` across admin→self switch | `components/entryModal.js` |
| F-09 full | ESLint + Playwright smoke + GitHub Action CI gate | new workflow |

## B4 · Dashboard toggles (5 minutes, 🧑)

- **M-PWPOL:** Auth → set minimum password length.
- **L-PWLEAK (0032):** Auth → Passwords → enable leaked-password protection — **requires Supabase Pro** (ties to B8).

## B5 · BOM management (Part Numbers phase 3)

**Status:** 📋 stated longer-term direction; schema already BOM-ready (uuid-PK `pn_items`) · **Owner:** 🤖 · **Effort:** L (1 design + 2–3 build sessions)

**Design questions first:** `bom_lines` shape (parent_item_id, child_item_id, qty, ref-designators?); cycle prevention (recursive CTE check or trigger); revision interplay (does a parent's BOM snapshot at revision bump, like item snapshots?); where-used query + UI (tree view on the ⓘ modal or its own tab); purchased/OTS parts without children. **Keep `DRONEKYLL_PART_NUMBERING.md` separate** — it's a program-scoped scheme, explicitly not a WMS feature.

## B6 · Deferred features (decision-gated, from P5-CF-03)

| Feature | Gate |
|---|---|
| Finance 2nd-tier expense approval | **B7-D1** role-model decision first |
| Receipt **file upload** (URL-only today) | ⚠️ introduces Supabase Storage → **invalidates the "no Storage → DB dump is a complete backup" assumption**; the backup pipeline must gain a Storage step in the same change |
| Map-based distance auto-fill | nice-to-have; manual km stays |
| Per-diem / OD-12 | needs policy definition |
| Timesheet "Business Trip" auto-fill · per-entry PT approval | delivered by **B1** |

## B7 · Open decisions queue (🧑)

- **D1 Role model:** declare the app's 5 tiers (owner/admin/manager/member/client) final, or plan an HR-Admin/Finance split (the WMS spec's 5-role matrix was never reconciled — the shipped auth kept the app tiers). Finance-approval (B6) hangs on this.
- **D2 Leave carry-over/encashment** ("management's discretion" in policy v1.0; system currently 0 carry-over) + **annual reset automation & pro-rating** (R18 note).
- **D3 FX rate source** for expense conversion (R9-06 — manual memo today).

## B8 · Paid-tier decision (🧑 → CEO)

Recommendation standing since 2026-06-12: **Supabase Pro first** ($25/mo — managed daily backups as an independent second line + HaveIBeenPwned password checks, which also unblocks B4/L-PWLEAK), **GitHub Team second** ($4/user/mo — branch protection on the backups repo's workflow file), Google Cloud not needed.

## B9 · Verify-and-close + placeholders

1. **Client-provisioning audit row — likely already closed:** R39 flagged it (`employee_audit_log` FK'd to employees), but R45's generic `audit_log` + `logAction('provision_client_login', …)` at `js/pages/clients.js:599` covers it. **Verify during A4 Phase 2F** (provision a test client → row appears in Admin Logs) and close.
2. **Phase-2 placeholders** from the original tracker: Reminders tab, Apps/Timesheet preference tabs, optional Google app verification (clears the `…supabase.co` line on the OAuth consent screen).
3. Delete the scratch Supabase project (flagged safe since R39) if not already done; rotate the age keypair per the backups README if the key ever touched a shared machine.

---

## Immediate next actions

| When | Who | What |
|---|---|---|
| ✅ Done 2026-07-09 | 🧑 | **A0 + A1** — all three Studio migrations applied + verified (client probe 34/34; 3 lint VERIFY queries 0 rows) |
| **Now** | 🤖 | **A2 + A3** — all audit-doc fixes + audit coverage extensions (CORS regression block, Part Numbers policy/walkthrough/integrity, probe pn checks) in one push |
| After A2/A3 | 🧑/🌐 | **A4** — run the execution packet against prod |
| Parallel any time | 🤖 | **A5** Help page rebuild (needs cache bump — next is v=123) · **A6.1** template drafts if wanted |
| Then | 🧑 | **A7** team review → **A8** roster swap (3 confirms) → **GO-LIVE** |
| At go-live | 🤖+🧑 | **B2** Sheets daily export (needs Sheet URL) · **B4** toggles |
| First post-launch build | 🤖 | **B1** M1 Central Hub (planning session first — settle D1–D5) |
