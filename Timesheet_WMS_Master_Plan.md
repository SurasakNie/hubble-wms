# Timesheet → WMS — Master Plan

> **Entry point for this project. Start here.** *(Last updated: 2026-06-15)*
>
> This is a **thin index** — a progress dashboard plus pointers to the detailed docs.
> It intentionally duplicates **no** content; open the linked sub-doc for the full detail of any area.

**What this project is:** a Clockify-like time-tracking web app branded **TIMESHEET** (Hubble Engineering),
vanilla HTML/CSS/JS on a Supabase backend, deployed to GitHub Pages. The built app is the foundation for a
larger **Workforce Management System (WMS)** — admin-seeded auth, leave/holiday, employee DB, expense/travel,
evaluation, and automated documentation — with modules built progressively against the roadmap.

---

## 🔴 Next Session — First Priority

> **⏱ UPDATED 2026-06-30 (R49) — supersedes the blocks below.** **Prod serves JS v=113 / CSS v=39** (migrations applied in Studio through `20260708` + `20260629_audit_log.sql` + `20260630_leave_manager_approved.sql`; **Edge Fns: 7**). **✅ F-01 (P0) CLOSED (R49)** — authenticated prod client RLS probe **22/22 PASS**. Root cause of leaks: `get_my_role()` causes a circular RLS dependency inside RESTRICTIVE policies; fixed via new `auth_is_client()` SECURITY DEFINER function + `client_block_*` RESTRICTIVE policies on 11 internal tables (`20260708`, applied). Probe scripts: `f01_prod_client_probe.{sh,ps1}`. **The go-live gate is cleared.** Since R39: R40 full-project audit remediation (`b647cdd` v=99), R44 **F-05/F-08/F-09** (atomic request-review RPCs + select minimization + ESM check), R45 audit-log system + client-logins UX, R46 calendar weekNav, R47 SPEC-M1/2/3 (2-tier leave approval), R48 CONV-M2/M-DSUB/M-SILENT/M-DATE. **▶ Next priority:** **pre-launch audit** ([PRE_LAUNCH_AUDIT_PLAN.md](PRE_LAUNCH_AUDIT_PLAN.md): must-fix CONV-M4 + L-CSP → audit Phases 1–4 → team review) → **roster swap (LAST, RSK-0, 3 confirms).** **⚠️ Pre-launch must-verify:** `20260629_request_review_rpcs.sql` (F-05) apply in prod is UNCONFIRMED while main's code calls those RPCs — if unapplied, approving deletion/name-change/job-title requests fails live (audit Phase 1H). Details in [PENDING_TASKS.md](PENDING_TASKS.md) Round 49. *(Blocks below kept for history; their framing is obsolete.)*

> ✅ **2026-07-03 (R53): GitHub account transfer completed.** Both repos (`hubble-wms`, `hubble-wms-backups`) now live under **`SurasakNie`** (Supabase unchanged). Prod: **https://surasaknie.github.io/hubble-wms/**. Google login briefly broke mid-transfer from a case-sensitivity bug in Supabase's Redirect URLs allow-list (fixed same-session) — also fixed a real, pre-existing CSP bug (Google Fonts stylesheet blocked by `style-src`). Full narrative + findings: [REPO_TRANSFER_CHECKLIST.md](REPO_TRANSFER_CHECKLIST.md).
>
> 🚀 **LIVE IN PRODUCTION (2026-06-11, Round 24):** **https://he-cells.github.io/hubble-wms/** — public repo github.com/HE-cells/hubble-wms (app-only; docs/supabase/credentials .gitignored). Deploy = commit + `git push`. Go-live Phases 0–2 done: R23 security hotfix applied + anon probe 43/43 PASS · Pages deploy · prod redirect URLs + Google login verified. R21-07 print margins resolved (0.5in sides, v=82). Sci-fi roster stays through testing; real roster swap is LAST.

**▶ Next session first priority:** 🔨 **LOGIN OVERHAUL (go-live #3)** — backup pipeline (#2) is done (test passed 2026-06-13; see below). The overhaul is the biggest, most sensitive change (RSK-1 — rewrites auth for everyone). **Recommended: plan it first** (no implementation plan exists yet, only the requirements spec in PENDING_TASKS 🔐 section). **Toolchain prerequisites confirmed missing 2026-06-13** (install before building Edge Functions): `supabase` CLI NOT installed (Windows: `scoop install supabase` or direct binary; npm pkg deprecated) · then `supabase login` (personal access token) + `supabase link` project `sjkggguedgtynktymzes` · Deno only needed for local fn testing (cloud provides runtime). Node 24 + npx present. **Dashboard prereq:** flip "Allow manual linking" **ON** (currently OFF) before the Link-Google feature works. Build/test on the sci-fi roster; Google OAuth stays working throughout = rollback path (never locked out).
>
> **Backup pipeline (go-live #2) — ✅ TEST RUN PASSED 2026-06-13 (R26).** Repo **HE-cells/hubble-wms-backups** live *(transferring with the app repo — after transfer, verify the nightly cron is still enabled and re-Watch from the new account; see REPO_TRANSFER_CHECKLIST.md)*; `nightly-db-backup` active (01:00 ICT cron); read-only `backup_role` (+BYPASSRLS so `pg_dump` clears `auth` RLS); secret set; dump `daily/wms_20260613.sql.gz.age` (56 KB) committed; checkout→v6.0.3. **Restore drill Phase 1 ✅** (Claude decrypted + content-verified: 62 tables/COPY, 136 policies, 34 functions, 16 employees + 4 auth.users). **Still before go-live sign-off:** 🔴 restore Phase 2 = clean apply into a scratch Supabase project (deferred — do after the overhaul, near go-live; NOT vanilla local PG) · move `age-key.txt` offline · Watch the repo. *(Storage ❓ resolved: no Supabase Storage — DB dump is complete.)*

**Go-live sequence (revised 2026-06-12, user-confirmed):**
1. ✅ Online on sci-fi roster (Phases 0–2, Round 24)
2. 🟡 **Daily backup pipeline** (above) — ✅ test run passed 2026-06-13; restore drill + age-key offline + repo-watch remain before sign-off
3. 🔨 **Login overhaul (NEXT)** — login = Employee ID + admin-issued random password (admin-only reset); first login forces password change + optional TOTP 2FA with Skip; public sign-ups disabled; Edge Functions `provision-users` / `admin-reset-password` / login; optional "Link Google account" in Preferences; **default page after login = Calendar**. Full spec in PENDING_TASKS.md 🔐 section. **Prereqs (2026-06-13): install supabase CLI + `supabase login`/`link`; flip "Allow manual linking" ON.** Plan first (RSK-1, auth-wide). *(Replaces progressive-Google-linking; UNLINKED ACCOUNTS notification dropped.)*
4. ⏸ **R25 full RLS sweep** (on hold; resumes after overhaul) — core/M1 + M4/M5/M6 audits → `20260701_rls_with_check.sql` (incl. drafted `lr_update`/`fhs_update` WITH CHECK fixes from [AUDIT_2026-06-11_GOLIVE.md](AUDIT_2026-06-11_GOLIVE.md)) → client-role check → final anon probe
5. Closeout: template wording (user supplies text) · leave pro-rating decision · bilingual Help page (written after overhaul, documents the new login)
6. **Roster swap + go-live (LAST):** TRUNCATE CASCADE (RSK-0 — confirm), seed 14 real employees, sequence→15, Initialize Year ×6, provision real accounts, rotate OAuth client secret

**🟡 Pending logged-in spot-checks (R22/R23):** member self-role-change blocked · admin Projects stats load · Tags usage loads · employee REQUESTS shows only Employment Certificate.

**Standing actions before further testing:**
- After any new table migration, run `NOTIFY pgrst, 'reload schema';` in Supabase SQL Editor.
- Hard-refresh (Ctrl+F5) to load the latest JS (`?v=84` / `style.css?v=29` / `tokens.css?v=22`).
- **UI naming:** cite [UI_NAMING_REFERENCE.html](UI_NAMING_REFERENCE.html) for canonical element names; **update it whenever a page/section is added** (rule wired into the `app.html` add-page checklist).

> ⚠️ **Roster mismatch note:** The sci-fi demo roster does not reflect the real Hubble Engineering team composition (predominantly Mechanical Engineering). When going live, swap to the real roster (memory: `real-employee-roster.md`); department codes will need correcting then.

---

## Progress dashboard

| Area | Status | Detail doc |
|---|---|---|
| **Built app** — core + WMS pages | ✅ All 6 WMS modules built & smoke-tested (M6 ✅ 2026-06-11) | [HE_interactive_timesheet_plan.md](HE_interactive_timesheet_plan.md) |
| **WMS — Phase 3: Employee DB (M3)** | ✅ Built & working | [HE_WMS_Specification.md](HE_WMS_Specification.md) §6 |
| **WMS — Phase 4: Leave & Holiday (M2)** | ✅ Built & working | [HE_WMS_Specification.md](HE_WMS_Specification.md) §5 |
| **WMS — Phase 5: Expense & Travel (M4)** | ✅ Built & signed off (R17) | [HE_WMS_Specification.md](HE_WMS_Specification.md) §7 |
| **WMS — Phase 6: Employee Evaluation (M5)** | ✅ Built & signed off (R19) | [HE_WMS_Specification.md](HE_WMS_Specification.md) §8 |
| **WMS — Phase 1: Auth overhaul** | ✅ **LIVE in prod 2026-06-14** (R29–R31, commit 17edc56; ID+password login, forced change, optional TOTP, 4 Edge Fns; R25 RLS sweep applied R30, anon probe 43/43) | [HE_WMS_Specification.md](HE_WMS_Specification.md) §3 · PENDING_TASKS.md |
| Pre-launch: GitHub Pages deploy + prod redirect URL | ✅ Done 2026-06-11 (R24) — **https://he-cells.github.io/hubble-wms/**, prod Google login verified | [HE_interactive_timesheet_plan.md](HE_interactive_timesheet_plan.md) §11 |
| Pre-launch: daily DB backup (01:00 ICT GH Action + local dump script) | 🟡 ✅ Test run passed 2026-06-13 (R26); age-key offline ✅ — **restore-drill Phase 2 (scratch project) + repo-watch remain** | [supabase/backups/README.md](supabase/backups/README.md) · PENDING_TASKS.md |
| Pre-launch: Deletion-request approval flow | ✅ Built as Notifications page | [HE_interactive_timesheet_plan.md](HE_interactive_timesheet_plan.md) §5 |
| **Integration:** weekly Google Sheets auto-export | ⏸ Parked — plan ready, blocked until app live + Sheet URL | [HE_Integrations_and_WMS_Roadmap.md](HE_Integrations_and_WMS_Roadmap.md) Part 1 |
| **WMS — Phase 7: Automated Documentation (M6)** | ✅ Complete (R20–22): built, all migrations applied, smoke-tested; R21-07 margins resolved (0.5in). 🟡 Template wording still placeholder — final HE wording before release | [HE_WMS_Specification.md](HE_WMS_Specification.md) §9 |
| **WMS — Phase 2** | 📋 Roadmap only (not built) | [HE_WMS_Specification.md](HE_WMS_Specification.md) + [roadmap plan](HE_Integrations_and_WMS_Roadmap.md) Part 2 |
| Phase-2 placeholders (Reminders, Apps/Timesheet prefs, Google verification) | ⏸ Deferred | [HE_interactive_timesheet_plan.md](HE_interactive_timesheet_plan.md) §11 |
| **Client account management (CLIENT-01)** | ✅ **LIVE in prod (R39, 2026-06-17).** Wires the dormant 5th `client` role: client ID `XX-0-NNN-CC` per-user, login-by-ID-or-email (Employee/Client toggle), read-only portal (project-hour summary + masked expense/travel + export), admin "Manage logins". Phases 0–5 complete — migrations `20260706`+`20260707` applied, `provision-client`+`login` deployed (7 Edge Fns), frontend v=98; Phase-5 audit **0 FAIL**. Last gate: in-app **client smoke** before a real client. (Shipped pre-roster-swap as planned.) | [PENDING_TASKS.md](PENDING_TASKS.md) → R39 · `AUDIT_2026-06-16_CLIENT01_PHASE5.md` · `CLIENT-01_PLAN.md` · [HE_WMS_Specification.md](HE_WMS_Specification.md) §3/§14 |
| **Design / UI reference** | — | [UI UX Specification.md](UI%20UX%20Specification.md) (design-only) |
| **Employee ID system** | ✅ Spec v6 adopted (`DD-T-NNN-CC`, MOD 97-10) + `DD` is permanent for full-time | [employee_id_system_v2.html](employee_id_system_v2.html) · [HE_WMS_Specification.md §6.1](HE_WMS_Specification.md) |

Legend: ✅ done · ⚠️ built with known bugs · 🔨 in progress · ⏸ deferred/parked · 📋 roadmap only

> **Auth sequencing decision (2026-06-06):** Phase 1 (auth overhaul) is deliberately last — all WMS modules are built against the current `is_admin()` guard. A single RLS reconciliation sweep applies the WMS 5-role matrix when the auth model is flipped before launch.
> **Revised 2026-06-12:** login method finalized — Employee ID + admin-issued password (admin-only reset), optional TOTP 2FA with first-login Skip, public sign-ups disabled, Google as optional linked identity. Build order: daily backup → login overhaul → R25 RLS sweep. Full spec in [PENDING_TASKS.md](PENDING_TASKS.md).

---

## Applied migrations (Supabase — in order)

| File | Applied | What it does |
|------|---------|--------------|
| `schema.sql` | 2026-05-22 | Core schema: profiles, clients, projects, time_entries, groups, tags |
| `20260601_calendar_edit_rls.sql` | 2026-06-01 | Calendar RLS for edit |
| `20260601_calendar_insert_rls.sql` | 2026-06-01 | Calendar RLS for insert |
| `20260602_groups_leader.sql` | 2026-06-02 | Groups leader column |
| `20260602_profiles_select_all_members.sql` | 2026-06-02 | Profiles visibility for members |
| `20260602_rls_visibility_and_assign_fix.sql` | 2026-06-02 | RLS visibility + assign fix |
| `20260604_name_change_requests.sql` | 2026-06-04 | Name change request table |
| `20260604b_name_change_reviewed_at.sql` | 2026-06-04 | reviewed_at column on name changes |
| `20260606_employee_database.sql` | 2026-06-06 | M3 Employee DB (tables, triggers, RLS, sequences) |
| `20260606_employee_dept_lock.sql` | 2026-06-06 | Department lock for full-time employees |
| `20260607_leave_holiday.sql` | 2026-06-07 | M2 Leave & Holiday (leave_types, balances, requests, flex_swaps) |
| `20260607b_manager_leave_rls.sql` | 2026-06-07 | Manager RLS: `is_manager_of()` + updated leave/employee policies |
| `20260608_leave_balance_auto_deduct.sql` | 2026-06-06 | Trigger `trg_sync_leave_balance` — auto-deduct `used_days` on approve, restore on override |
| `20260609_leave_type_default_days.sql` | 2026-06-06 | Adds `default_days` to `leave_types` |
| `20260610_sync_profile_names.sql` | 2026-06-06 | Sync `employees.full_name` ↔ `profiles.name` |
| `20260611_leave_types_update.sql` | 2026-06-06 | Deactivate paternity; add Court Leave (pools → personal) |
| `20260611_flex_swap_type.sql` | 2026-06-06 | `flex_holiday_swaps.swap_type` ('move'/'wfh'); `substitute_date` nullable |
| `20260611_job_title_change_requests.sql` | 2026-06-06 | New `job_title_change_requests` table + RLS |
| `20260612_flex_wfh_nullable_holiday.sql` | 2026-06-06 | `flex_holiday_swaps.waived_holiday_id` nullable (standalone WFH) |
| `20260613_audit_rls_hardening.sql` | 2026-06-08 | RLS hardening: anon→auth on 4 tables + jtcr_admin |
| `20260613b_audit_constraints.sql` | 2026-06-08 | 4 DB CHECK constraints on leave/flex tables |
| `20260615_expense_travel.sql` | 2026-06-08 | M4 Expense & Travel — petty-cash float model (5 tables: expense_categories, cash_transactions, vehicle_rates, travel_claims, travel_requests; RLS, triggers, seeds) |
| `20260615b_trip_settlement.sql` | 2026-06-08 | Trip settlement fields on `travel_requests` |
| `20260616_leave_policy_alignment.sql` | 2026-06-08 | Leave policy alignment |
| `20260617_remove_paternity_leave.sql` | 2026-06-08 | Remove paternity leave type |
| `20260609_fix_settlement_source.sql` | 2026-06-09 | Adds `travel_settlement` to `cash_transactions.source` CHECK + partial unique index |
| `20260609_assignment_role_guard.sql` | 2026-06-09 | Role-guard trigger on `project_assignments` + `task_assignments` |
| `20260609_project_stats_rpc.sql` | 2026-06-09 | `get_project_stats(UUID)` + `get_tag_usage()` server-side RPCs |
| `20260609_expense_categories_for_employee.sql` | 2026-06-09 | `for_employee` flag on `expense_categories` |
| `20260609_petty_cash_settings_and_reimbursed.sql` | 2026-06-09 | `petty_cash_settings` singleton + `reimbursed_at` on transactions/claims |
| `20260609_pt_daily_rate.sql` | 2026-06-10 | `pt_daily_rate` setting on `petty_cash_settings` |
| `20260619_tet_admin_rls.sql` | 2026-06-10 | Admin RLS for `time_entry_tags` insert/delete |
| `20260620_manager_time_edit_rls.sql` | 2026-06-10 | Manager parity on time-entry insert/tag RLS |
| `20260621_user_cancel_requests.sql` | 2026-06-10 | Adds `'cancelled'` to CHECK constraints on 6 tables |
| `20260622_user_cancel_rls.sql` | 2026-06-10 | Owner self-cancel RLS (pending→cancelled); fixes trip settlement submit RLS |
| `20260623_rename_he_working_budget.sql` | 2026-06-10 | Renames `'HE Working Budget'` → `'Hubble Engineering Working Budget'` |
| `20260624_leave_edit_balance_resync.sql` | 2026-06-10 | R18-F2: balance sync on date/type edits of approved leaves; auto-creates missing balance row (allocated 0); `SECURITY DEFINER` (fixes manager-approval no-deduct) |
| `20260624b_time_entry_duration_check.sql` | 2026-06-10 | R18-F5: `CHECK (total_hours IS NULL OR total_hours >= 0)` on `time_entries` |
| `20260625_evaluation_m5.sql` | 2026-06-10 | M5 Employee Evaluation — 4 tables (`evaluation_cycles`, `evaluation_questions`, `evaluations`, `evaluation_responses`), RLS helpers, guard trigger, 2 RPCs (`create_cycle_evaluations`, `get_evaluation_kpis`), 28-question bilingual seed |
| `20260625b_evaluation_rpc_auth_fix.sql` | 2026-06-10 | Anon-bypass fix in both M5 RPCs — `COALESCE(guard, FALSE)` + `auth.uid() IS NULL` guard |
| `20260625c_self_edit_before_review.sql` | 2026-06-11 | Employee can edit self-assessment after submitting until manager submits (`can_write_eval_response` allows `self_submitted` status) |
| `20260625d_question_wording.sql` | 2026-06-11 | S1 "minimum 2 items" + S5 "your work performance" exact wording (idempotent UPDATEs on `evaluation_questions`) |
| `20260626_document_templates.sql` | 2026-06-11 | M6 Automated Documentation — `document_templates` + `generated_documents`, RLS (admin/manager/owner), 8 seeded templates |
| `20260627_generated_documents_draft_workflow.sql` | 2026-06-11 | Default status `draft`; drafts visible to admin/manager only |
| `20260628_document_requests.sql` | 2026-06-11 | `document_requests` table — RLS own-insert/self-cancel/manager-review; partial unique index blocks duplicate pending |
| `20260629_employment_certificate.sql` | 2026-06-11 | 9th template type `employment_certificate`: CHECK extended on 3 M6 tables + Employment Certificate seed (only employee-requestable type; UI-gated in documents.js) |
| `20260630_security_hardening.sql` | 2026-06-11 | 🔴 R23 go-live hotfix: `guard_profile_self_update()` trigger (blocks self role-escalation), auth guards on `get_project_stats`/`get_tag_usage` (anon leak confirmed by probe; post-apply probe 43/43 PASS), COALESCE in `guard_evaluation_update` |
| `20260701_update_with_check_hardening.sql` | 2026-06-14 (verified live R36) | R25 RLS hardening: WITH CHECK on `te_update`/`lr_update`/`fhs_update` + (§4, added R30) `ct_update`/`tc_update`/`trq_update`; `SET search_path` on 4 SECURITY DEFINER helpers. ⚠️ §4 regressed the `20260622` owner self-cancel/settlement grants — corrected by `20260702`. |
| `20260702_restore_user_cancel_rls.sql` | 2026-06-15 | R36 regression fix: restores `20260622` owner self-cancel (ct/tc/trq) + owner-approved settlement-submit (trq) grants that `20260701` §4 dropped in live. ✅ Applied + verified (owner branch back in `pg_policies`; anon probe 43/43). |
| `20260703_settlement_rpc.sql` | 2026-06-15 | M-SETTLE: atomic admin-only `approve_trip_settlement(uuid)` RPC — posts the correcting cash row + closes the trip in one transaction (replaces 2 client writes); idempotent + ICT-dated. ✅ Applied in Studio 2026-06-15; ⚠️ the v=95 frontend that calls it is **not yet pushed**. |
| `20260709_lint_search_path_and_execute_hardening.sql` | pending | **L-FNSP + L-SPDEV** — closes the Supabase linter security WARNs. (1) 0011: pins `search_path` on 12 SECURITY INVOKER trigger/compute fns. (2) 0028: strips the default PUBLIC/`anon` EXECUTE grant on all 27 flagged SECURITY DEFINER fns; re-grants EXECUTE to `authenticated`+`service_role` on the 9 real RPCs + 10 RLS helpers, fully revokes the 8 trigger fns (also closes 0029 for those). Idempotent (name-keyed ALTER/REVOKE/GRANT). ⚠️ Not applied — run in Studio. 0032 leaked-password protection is a Dashboard toggle (no SQL). |
| `20260711_part_numbers_v2.sql` | pending | **PN v2 (spec-driven)** — `PART_NUMBERING_SPEC.md`: format `CC-PPP-AA-BBB`→`CCC-PPP-CAT-SEQ` (3-letter category, 11 governed seeds); retires `pn_projects` → uses real `projects`/`clients` (new 3-char `code` on each); `pn_attributes` (material/finish/vendor/fab_process/color); `pn_project_config`; revision `snapshot jsonb` (for Compare); rewritten `pn_create_item`/`pn_bump_revision` + `pn_item_snapshot`. ⚠️ **NOT applied — run in Studio (no BEGIN/COMMIT wrapper on purpose).** Verified on scratch PG16 (v1→v2 transform + 12 behavioral/RLS tests). |
| `20260710_part_numbers.sql` | 2026-07-07 | **PN v1 — Part Number Generator** (`#part-numbers`): 5 tables (`pn_projects`, `pn_type_codes` seeded ×7, `pn_counters`, `pn_items`, `pn_item_revisions`) + RLS (internal roles; `client_block_*` RESTRICTIVE on all 5; `pn_items` has NO INSERT policy — RPC-only) + immutability guard trigger + RPCs `pn_create_item` (atomic counter, gap-free, numbers never reused) / `pn_bump_revision` / `pn_render_template`. ✅ Applied in prod Studio 2026-07-07 (7 type-code seeds verified). Note: applied via the autocommit variant — the `BEGIN…COMMIT`-wrapped file wouldn't run end-to-end in the SQL Editor (only a fragment executed, reporting "Success, no rows"). |

---

## What's built in Phase 3 — Employee DB (M3)

- Full employee record: personal, employment, compensation (encrypted-deferred), documents, skills
- Auto-computed Employee ID: `DD-T-NNN-CC` format, MOD 97-10 check digit, DB trigger
- Global number sequence (NNN, never reused); department lock for full-time
- Job title dropdown with predefined list + "Add new" option
- **Linked User Account UI** (Employment tab): admin links an employee record to a Google Auth account — required for employees to submit leave requests
- Status lifecycle: pending → active → resigned/terminated (archive, no delete)
- Manager tree: `direct_manager_id` self-referential FK; manager can see direct reports via updated RLS

**Demo roster:** 16 sci-fi employees, NNN 001–016, all active. Next hire: NNN 017.
See [HE_WMS_Specification.md §6.4](HE_WMS_Specification.md) for full roster.

---

## What's built in Phase 4 — Leave & Holiday (M2)

*(Current as-built tab structure after Rounds 2–4. `holidays.js` uses a 2-level tab architecture.)*

**Primary tabs:** `HOLIDAYS` · `MY LEAVE` · `TEAM LEAVE` (admin/mgr) · `POLICY`

- **HOLIDAYS** — year calendar + list view; multi-day clusters grouped ("13–15 Apr 2026"); Add / Edit (range modal) / Delete (whole cluster); 2026 Thai holidays seeded.
- **MY LEAVE** (secondary: Leave · **Flex** · My Balance)
  - *Leave* — submit own request (Full day / Half day; cross-pool Annual↔Personal; document path) + own history (past hidden by default).
  - *Flex* — sub-tabs **Flex Swap** (waive a holiday → weekday substitute) and **Work From Home** (standalone, no holiday waived); unified history.
  - *My Balance* — own balances with synthetic policy-default fallback.
- **TEAM LEAVE** (admin/mgr; secondary: Team Leave · Team Flex · Approvals · Team Balance)
  - Employee picker is a native `<input list>`+`<datalist>` autocomplete.
  - *Approvals* sub-views: **PENDING** / **SCHEDULE** / **HISTORY** (override any status + notes). Manager sees direct reports only (`is_manager_of()` RLS).
- **POLICY** — read-only leave-policy document (entitlements, advance-notice rules, per-type sections) sourced from `leave_types`.

**Leave types:** Annual 12 / Personal 6 / Sick 30 / Maternity 98 / **Court Leave** (pools → personal) / Flex Holiday. Paternity **deactivated** (not in policy v1.0). `used_days` auto-deducts on approval (trigger).

**Notifications page** (`requests.js`, in WMS nav): all users see own leave requests + 3-day dismissable cards for resolved requests; admin sees deletion / name-change / job-title-change queues with approve/reject + nav badge.

**Modals:** Profile + Preferences are **read-only**; name and job-title changes go through the request flow.

---

## ⚠️ Known issues / pending before next phase

| # | Priority | Issue | Fix |
|---|----------|-------|-----|
| ✅ P-1 | — | Test employee linked (B-01, David Bowman NNN 003) | Done + tested |
| P-2 | 🟡 | Sci-fi demo roster dept codes don't match real team (mostly Mechanical) | At go-live, swap to real roster from `real-employee-roster.md` memory |
| ✅ P-3 | — | `util/employeeId.js` dead code | Removed (P-01) |
| ✅ P-4 | — | Deletion-request approval UI | Built — now the Notifications page |
| ✅ P-5 | — | `used_days` not auto-deducted on approval | Trigger `trg_sync_leave_balance` (`20260608_*`) |
| ✅ R5-01 | — | "Profile modal not centered" — was actually the **avatar dropdown menu** | Centered `.avatar-dropdown` in the nav panel (`left:50%`); profileModal edits reverted |
| ✅ R5-02 | — | Team selectors need a clear "✕" | Overlaid `.emp-clear-btn` added to all 3 pickers |
| ✅ R5-03 | — | Notifications per-card dismiss "✕" + admin coverage | Dismiss → ✕ icon; admins now also get the dismissable cards |
| ✅ R5-04 | — | Leave/flex date pickers allowed weekends | `_wireWeekendBlock` + submit guards; defaults snap to next weekday |
| ✅ R5-05 | — | Notifications page not tabbed | Tabs: Deletion · Profile Changes (name+job-title) · Leave Requests |
| ✅ R5-06 | — | No shared UI vocabulary (the R5-01 mix-up) | Built `UI_NAMING_REFERENCE.html` (tabbed, searchable, layout maps) |

---

## Sub-document index (live docs)

| Doc | What's in it / when to open it |
|---|---|
| [PENDING_TASKS.md](PENDING_TASKS.md) | **🔴 Start here each session** — living task list; blocking issues, important pre-launch items, polish backlog, completed log. Updated every session. |
| [HE_interactive_timesheet_plan.md](HE_interactive_timesheet_plan.md) | **Canonical plan for the built app** — full design system, 5-tier RBAC, data model + RLS, page-by-page specs with build status, fixed-bugs ledger, applied-migrations ledger. |
| [UI UX Specification.md](UI%20UX%20Specification.md) | **Design-only reference** — dark-theme color palette, typography, layout, original view/modal specs. |
| [HE_WMS_Specification.md](HE_WMS_Specification.md) | **Full WMS specification (v2.3)** — all 6 modules (M1–M6), auth lifecycle, leave policy, roles matrix, risk register, open decisions, demo employee roster. |
| [HE_Integrations_and_WMS_Roadmap.md](HE_Integrations_and_WMS_Roadmap.md) | **Two-part plan** — Part 1: Google Sheets auto-export. Part 2: WMS expansion phasing (Phases 1–7) + cost analysis. |

---

## Reference specs (HTML, not moved)

| File | Purpose |
|---|---|
| [UI_NAMING_REFERENCE.html](UI_NAMING_REFERENCE.html) | **Canonical UI naming map** — standalone, tabbed, searchable. Every page/tab/section/component with its name, CSS selector, and "avoid" aliases; a Layout-Map tab with shell wireframe, **top-bar anatomy**, toast/error-popup (vs Notifications page), and per-page content wireframes. **Cite this for element names; keep in sync when pages/sections change.** |
| [employee_id_system_v2.html](employee_id_system_v2.html) | **Current** employee-ID spec — v6, `DD-T-NNN-CC`, MOD 97-10 check. Also contains the 16-name sci-fi reference roster. |
| [employee_id_schemes_comparison.html](employee_id_schemes_comparison.html) | Survey of 17 candidate ID schemes that led to the v6 decision. |

---

## Archived (retired — see `Archived/`)

| File | Why retired |
|---|---|
| [Archived/HE_interactive_timesheet_plan_draft.md](Archived/HE_interactive_timesheet_plan_draft.md) | Pre-build draft, superseded by the canonical plan. |
| [Archived/employee_id_system_specification_initial_idea.md](Archived/employee_id_system_specification_initial_idea.md) | Abandoned first ID scheme (`T-FFS-D-NNN`). Replaced by v6 spec. |
| [Archived/HANDOFF_20260601.md](Archived/HANDOFF_20260601.md) | Point-in-time session log; content folded into the canonical plan. |
| [Archived/WMS-handoff-v1.0.md](Archived/WMS-handoff-v1.0.md) | Superseded by `HE_WMS_Specification.md`. |
| [Archived/Additional design system.md](Archived/Additional%20design%20system.md) | Informal PM notes; merged into `HE_WMS_Specification.md`. |
