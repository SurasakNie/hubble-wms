# WMS Full Execution Plan — Launch Path + Post-Launch Roadmap

*Created: 2026-07-09 (R56) · **Living document** — update task statuses in place as work closes; archive a task one session after it's ✅ (same rule as PENDING_TASKS.md).*

**What this is:** the single consolidated plan for everything left on this project, in two tracks:

- **Track A — Launch path** (A1–A8, strictly ordered): everything between today and the real-roster go-live. Wraps [PRE_LAUNCH_AUDIT_PLAN.md](PRE_LAUNCH_AUDIT_PLAN.md) (executed at A4) and folds in the 2026-07-09 review findings against it (fixed at A2–A3).
- **Track B — Post-launch roadmap** (B1–B10, ordered by recommended value): supersedes the stale status column in [HE_Integrations_and_WMS_Roadmap.md](HE_Integrations_and_WMS_Roadmap.md) Part 2 and the retired "Future roadmap" section of PENDING_TASKS.md.

**Owner legend:** 🤖 = Claude session in this repo (no prod network — hard 403 to Supabase/Pages, re-confirmed 2026-07-09) · 🧑 = user (prod access, Studio, credentials, or a decision) · 🌐 = any human/agent with real network access (browser + curl against prod).

**Effort legend:** S = under an hour · M = one session · L = multi-session.

---

## Dependency map

```
A0+A1 (Studio migrations, one sitting — do any time)    Track B (post-launch)
                                                          go-live ─→ B2 Sheets daily export (first, tiny)
A2 (doc fixes) ─→ A3 (audit coverage) ─→ A4 (run audit)            B4 toggles (any time, 5 min)
A5 (Help page) ─────────────────────────────┐                      B1 M1 central hub (big build)
                                            ▼                       B3 audit-backlog batch
                                     A7 (team review)               B7/B8/B10 decisions ─→ B6 deferred features
                                            ▼                       B5 BOM (after B1 or parallel)
                                     A8 (roster swap → GO-LIVE)     B9 verify/close
```

A2 must precede A4 (the auditor needs corrected targets/URLs); A3 should precede A4 (or the audit under-tests Part Numbers and CORS). A5 only needs to land before A7 (closeout content — template wording + leave-policy decision — moved off the launch path to **B10**; it no longer gates the team review). A8 is last, always.

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

**Status:** ✅ **DONE 2026-07-10 (R60)** — all 11 corrections applied; grep-clean (no `he-cells.github.io` outside the deliberate CORS negative-control, no `22/22` target). · **Owner:** 🤖 · **Effort:** S–M (docs only, no cache bump) · **Depends:** nothing · **Blocks:** A4

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

**Status:** ✅ **DONE 2026-07-10 (R60)** — CORS block in packet 1E; pn policy SQL in plan/packet 1F (16 policies, `pn_items` INSERT positive control); new Phase 2H walkthrough in plan + packet Phase 2; P1–P4 pn integrity in plan/packet Phase 3; probe scripts extended (both `.sh` + `.ps1`: +6 `pn_*` `check_zero` + `pn_items` write-denied → **41 checks total**, `bash -n` clean); anon re-baseline note (~56) in packet 1A. · **Owner:** 🤖 (docs + probe scripts; no page JS → no cache bump) · **Effort:** M · **Depends:** A2 (same files) · **Blocks:** A4

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
**Superseded 2026-07-11:** the anon script this task assumed existed ("local,
gitignored") was never actually anywhere — user hit "command not found" trying to
run it, and its source doc doesn't exist in any checkout either. Rather than just
documenting what a hypothetical script should add, wrote a real, repo-tracked
`anon_probe.ps1` (repo root) with its table/RPC list derived directly from the app's
own `.from()`/`.rpc()` calls. Real target: **61/61 PASS** (47 tables + 1 dropped-view
check + 13 RPCs) — supersedes the old "~56" placeholder guess, which was never
grounded in an actual derived count.

**Acceptance (A3):** packet contains all snippets above; probe scripts parse (`bash -n`); targets consistent across plan/packet/pass-criteria.

---

## A4 · Execute pre-launch audit Phases 1–4

**Status:** 🟡 in progress, user-driven — **1A/1B/1C/1D done live against prod** (anon 61/61, client 41/41, member 5/5, manager scoping+bounce pass). Along the way, 1C/Phase-2 surfaced a real gap (Team page showed the whole org to members) → built + shipped as **R61 Team-visibility scoping** (`20260713`/`20260713b`, RLS-enforced, all 4 re-audit legs green — see CLAUDE.md R61). **1E + 1G done live 2026-07-15** (`edge_probe.ps1`, credentialed re-run — 22 PASS / 0 WARN on the non-CORS checks): input-validation ✅ (wrong-pw + non-existent both 401 with identical body = no enumeration; oversized 401; no-auth 401), CORS-new-origin ✅ 7/7, non-admin-403 ✅ 7/7 (every admin-only fn denies a member token), admin-malformed-input ✅ 4/4 (400, no 500), and **1G** ✅ (spoofed `actor_id` audit-log insert → 403, `WITH CHECK` holds). **✅ A4-F2 CLOSED 2026-07-15 — 1E + 1G are now fully done.** There was no shared `_shared/cors.ts` — `ALLOWED_ORIGINS` turned out to be a byte-identical literal array copy-pasted into all 7 functions (confirmed by downloading all 7 via `supabase functions download` and diffing). Fixed all 7 in one pass (`https://he-cells.github.io` removed, `https://surasaknie.github.io` promoted to the array's `[0]` fallback slot, `localhost:3030` untouched), redeployed all 7 via `supabase functions deploy`, and re-ran `edge_probe.ps1`: **18 PASS / 0 FAIL / 0 WARN** — every old-origin CORS check now explicitly falls through to the new origin instead of echoing the dead one. **✅ 1F done live 2026-07-15** (Studio SQL, all 3 sub-blocks): core policies ✅ all 9 present (found + fixed 2 doc-naming errors along the way — real names are `jtcr_select_own`/`jtcr_insert_own`/`audit_log_insert`, not the `_own`-suffixed guesses; `audit_log_insert`'s `with_check = (actor_id = auth.uid())` matches 1G exactly); Part Numbers ✅ 16/16 policies + 0-INSERT positive control; R61 ✅ `profiles_select`'s `qual` is an exact match to the migration's intended predicate, all 3 helper fns present with `search_path` pinned, and the trigger check shows only `task_assignments` rows (2, one per BEFORE INSERT/UPDATE event — not a discrepancy) and zero `project_assignments` rows. Docs corrected to match (packet + plan + pass-criteria table). **✅ 1H done live 2026-07-15** — regression re-check, all 3 F-05 RPCs still present (`approve_deletion_request`, `review_name_change_request`, `approve_job_title_change_request`), no drift since 2026-06-30. **That closes all of Phase 1 (1A–1H). Remaining: 2/3/4** — coverage extended for the R61 migrations (R62, docs+scripts only) so the run picks up cleanly. Browser + Studio SQL phases still **cannot run from this container** (hard 403 to prod Supabase + Pages, re-confirmed again this session). · **Owner:** 🧑/🌐 · **Effort:** ~2–4 h human time · **Depends:** A2 + A3 · **Blocks:** A7

**What:** run [PRE_LAUNCH_AUDIT_EXECUTION_PACKET.md](PRE_LAUNCH_AUDIT_EXECUTION_PACKET.md) top to bottom from where it left off: 1E Edge-Fn validation + CORS block (`edge_probe.ps1`) → 1F policy review (+ pn **+ R61 `profiles_select`/helper-fn/trigger-fix check**) → 1G audit-log spoof test → 1H RPC regression → Phase 2 walkthrough (2A–2G, 2H Part Numbers, **2I Team & Projects — new, R61**; during 2F confirm a `provision_client_login` row appears in Admin Logs — closes B9.1) → Phase 3 integrity SQL (+ P1–P4 **+ new `project_assignments` orphan check**) → Phase 4 UI/UX **+ L-CSP live console check** (zero CSP violations on both pages; Inter font renders; login + app boot work).

**Needs from 🧑:** Studio access; sci-fi member/manager/admin creds; a provisioned test client login; member + admin access tokens (from the `login` fn response).

**Report back:** pass/fail per phase + failing detail → 🤖 folds results into the plan docs and fixes anything code-fixable (with cache bump per CLAUDE.md).

**Acceptance:** every pass-criteria row green (with the corrected targets), or failures triaged into fix tasks. **Correction (2026-07-13):** R61 (v=125) was earlier logged here as "unmerged, pending go-ahead" — checked `origin/main` directly and it already has R61 (`app-init.js` on `main` reads `v=125`). It's merged and live; that's not an open item.

---

## A5 · Refresh the Help page (user + admin manual)

**Status:** ✅ **DONE 2026-07-10 (R60 cont.)** — bilingual content added for Part Numbers, 2-tier leave, Client Portal, Manage-client-logins, Part Numbers governance, and a new Admin Logs section (Account Status tab was already covered pre-existing). Cache **JS v=122→v=123**. `npm run check:parse` 56/56. **🟡 Still needed: 🧑 in-browser spot-check in prod** (this container can't render/view the page). · **Owner:** 🤖 build, 🧑 spot-check in prod · **Effort:** M · **Depends:** nothing · **Blocks:** A7

**Why:** `js/pages/help.js` is frozen at Round 42 — grep confirms **zero** mentions of the Client Portal, Admin Logs, Account Status tab, or Part Numbers. Reviewers will read this as the manual; it must describe the app they're reviewing.

**Content to add (each EN + TH, role-gated like the existing tabs):**
- **User Guide:** Part Numbers (what a `CCC-PPP-CAT-SEQ` number means, how to mint, category decision ladder, revisions/Compare); 2-tier leave approval (what `manager_approved` means for the employee).
- **Admin Guide:** Clients → Manage logins (provision/reset/delete client logins, copy-credentials); Client Portal (what clients can see — summary hours, masked expenses); Admin Logs page (filters, what's logged); Account Status tab (Never signed in / Not provisioned / Deactivate–Reactivate); Part Numbers governance (client/project `code` prerequisites, category + attribute list management, customer-PN modes); HR approval step for 2-tier leave.
- Sanity pass over existing sections for drift (login flow, petty-cash placeholder amounts).

**Mechanics:** static content only, no network calls (keep it that way); follow existing help.js section/tab structure and the EN/TH toggle; **cache bump `V` 120→121** in `js/app-init.js` per CLAUDE.md (page JS changed).

**Acceptance:** every WMS nav item has a matching Help section in both languages; grep for "Part Number", "Admin Logs", "Account Status", "Client Portal" hits in `help.js`; page renders clean (ESM parse + in-browser check at A7).

---

## A7 · Team review

**Status:** ⏸ waiting on A4/A5 · **Owner:** 🧑 + team (incl. **CEO**) · **Effort:** external *(closeout content — template wording + leave-policy decision — moved to Track B **B10**, 2026-07-13; it no longer gates this review)*

**Agenda — two parts (part 2 added 2026-07-13):**
1. **Functional + UX feedback** on the live sci-fi-roster app. Findings triage: 🤖 fixes code-fixable items (cache bumps per CLAUDE.md), decisions logged in PENDING_TASKS.
2. **Track B roadmap review — full detail, CEO in the room.** Walk through all of **Track B (B1–B10)**, not just bugs on the shipped app. Lead item: **B1's open question** (see B1's section) — the Central Hub build was scoped as attendance/payroll (Work Location, Clock In/Out, Overtime, late-submission flags), but the real business bills **hours × rate + expenses → client invoice**, with **no overtime** at all, and the core billing math already works today (Reports page) independent of B1. That mismatch surfaced just from describing the actual invoicing process out loud — other Track B items may need the same reality check, so go through B2–B10 with the team too, not only B1. **Exit for part 2:** a revised Track B (scope/priority changes recorded in this doc) that build work resumes against — brainstorm now, build after.

**Exit (both parts):** team + CEO sign-off.

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

*Recommended order: B2 → B4 → B1 → B3 → B5 → B6 (B7/B8/B10 are decision gates that can run any time; B9 folds into A4). **B1's position + scope are provisional — pending the A7 team review, see B1's open question below.***

## B1 · Phase 2 / M1 — Timesheet → Central Hub *(the big one — 🔴 scope in question, see below)*

**Status:** 📋 roadmap (the only unbuilt WMS module) · **🔴 open question raised 2026-07-13 — needs a CEO decision at A7 before build starts** · **Owner:** 🤖 build, 🧑 decisions + Studio applies · **Effort:** L (est. 3–5 sessions, 2–3 migrations) · **Risk:** RSK-1 (touches the core table every page reads)

**🔍 Open question for the A7 team review (CEO decision needed) — raised 2026-07-13:**
The user described the actual billing process: track time worked → **× rate per employee** → **+ other additional** (expenses/travel) → **send invoice to client**. **No overtime** exists in the business model at all. That's a time-and-materials billing workflow — but B1 as originally scoped (below) is attendance/payroll-shaped: Work Location, Clock In/Out, Overtime Hours, late-submission flags. Before flagging this as just an opinion, checked what's actually already built:
- **The core billing math already works today, live, with zero dependency on B1.** `js/pages/reports.js` already computes `hours × billable_rate` per employee, rolled up by project (`_aggregate()` → `amt = hrs * rate`), with a THB "Amount" KPI and CSV export. It reads logged time directly — nothing about it needs Central Hub submission, approval, or locking.
- **No invoice-generation step exists anywhere in the app.** Labor cost (Reports) and expenses (Expenses Report) are two separate reports with no combined per-project/per-client total — whoever sends the invoice today assembles it by hand from two exports. That looks like the real gap in "track time → invoice," and B1 as scoped doesn't address it.
- **The one piece of B1 that's plausibly still worth keeping regardless:** locking a week's hours once they've been billed, so nobody edits time after the client's been invoiced. That's a narrow slice of B1.a (submission + lock), not the attendance/overtime machinery built around it.

**Options to put in front of the CEO at A7:** (a) build B1 as originally scoped below — full attendance/payroll Central Hub; (b) descope to just a billed-hours lock, and separately scope a new, smaller **Invoice** feature (combine labor + expenses per project/client into one client-ready number/document) instead; (c) something else, once the team discusses actual billing pain points together. **Do not start B1 build work until this is decided** — the rest of this section (original scoping) is kept for context, not as a decided plan.

**Why first among builds (original framing, kept for context):** it retroactively hardens two shipped modules — PT weekly wages and evaluation KPIs currently read **logged** hours (acknowledged in `js/pages/expenses-report.js:201`); M1 makes them read **approved-and-locked** hours. Also unlocks 3 deferred features (per-entry PT approval, Business-Trip auto-fill, finance-grade payroll export).

**Design decisions to settle FIRST (🧑, one planning session) — all provisional on the open question above:**
| # | Question | Leaning |
|---|---|---|
| D0 | Does an attendance/payroll Central Hub match our business model at all, given we bill hours × rate with no overtime? | 🔴 **Open — see callout above. CEO decides at A7.** |
| D1 | Submission granularity: per-week `timesheet_submissions` table (week, user, status, approver) vs per-entry status column | Per-week table + entry `status` mirror — spec §4.4 says weekly submit/approve/lock |
| D2 | Clock In/Out mandatory for FT? (PT already hour-logged) | Optional at first — attendance fields nullable |
| D3 | Overtime formula (above standard hours = 8/day? 40/wk?) | Needs HE policy input — **may be moot per D0, since the business has no overtime today** |
| D4 | Who unlocks an approved week | Admin only (spec §4.5) |
| D5 | Late-submission threshold (OD-7) | e.g. Tuesday 12:00 for prior week |

**Build phases (if option (a) is chosen at A7):**
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

## B10 · Closeout content (decisions + wording) *(moved from Track A's A6, 2026-07-13)*

**Status:** 🟡 partial — **item 3 done** (R60 cont., 2026-07-10); **items 1 + 2 still open, blocked on 🧑 decisions** · **Owner:** 🧑 decides, 🤖 wires · **Effort:** M (mostly 🧑 writing time) · **Depends:** nothing · **Blocks:** nothing — no longer gates A7/A8, can land any time

*(Originally Track A's A6, framed as "ideally before team review." Reclassified as post-launch: placeholder template text and the leave-carryover decision don't block reviewers from giving useful feedback on the actual app, and neither has to be settled before the roster swap. Do any time — before go-live if convenient, after if not.)*

1. **Template wording** — all 9 document templates are workflow placeholders. 🧑 supplies final HE wording (EN or EN+TH per template) → paste via the in-app TEMPLATES editor (no code, no migration). Option: 🤖 drafts all 9 for 🧑 to edit — say the word.
2. **Leave pro-rating + Dec-31 reset decision** — record the policy (carry-over? encashment? pro-rate mid-year joiners?). Currently the system defaults to 0 carry-over and has a noted-but-unbuilt Dec-31 reset plan. Decision gets recorded in `HE_WMS_Specification.md` §5; any automation becomes its own B-track task.
3. **Structure-doc re-sync** — ✅ **done.** `HE_interactive_timesheet_plan.md` §7 (File Structure) and §10 (Sidebar Navigation), plus `HE_WMS_Specification.md` §14 (Nav Map), all re-verified directly against `app.html`'s sidebar markup and the real `js/pages`/`js/api`/`js/components` listings — not carried forward from earlier rounds. All three now show the full 19-route nav (Client Portal, Admin Logs, Part Numbers, Help included) and the current file inventory (`app-init.js`/`login-init.js`, `holidays-*`/`expenses-*` submodule splits, `auditLog.js`, `partNumbers.js`).

**Acceptance:** no template renders placeholder text (🔴 still open); leave policy decision written down (🔴 still open); nav trees match `app.html` (✅ met).

---

## Immediate next actions

| When | Who | What |
|---|---|---|
| ✅ Done 2026-07-09 | 🧑 | **A0 + A1** — all three Studio migrations applied + verified (client probe 34/34; 3 lint VERIFY queries 0 rows) |
| ✅ Done 2026-07-10 | 🤖 | **A2 + A3** — all audit-doc fixes + audit coverage extensions (CORS regression block, Part Numbers policy/walkthrough/integrity, probe pn checks → 41) in one push |
| **Now** | 🧑/🌐 | **A4** — run the execution packet against prod (targets now current) |
| ✅ Done 2026-07-10 | 🤖 | **A5** Help page rebuild (JS v=122→v=123) — 🧑 in-browser spot-check still pending |
| Parallel any time | 🤖 | **B10.1** template drafts if wanted (moved off the launch path) |
| Then | 🧑 | **A7** team review → **A8** roster swap (3 confirms) → **GO-LIVE** |
| At go-live | 🤖+🧑 | **B2** Sheets daily export (needs Sheet URL) · **B4** toggles |
| First post-launch build | 🤖 | **B1** M1 Central Hub (planning session first — settle D1–D5) |
