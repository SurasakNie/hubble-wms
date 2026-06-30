# Pending Tasks & Ongoing Process

> **Living document.** Updated at the end of every session.
> Linked from [Timesheet_WMS_Master_Plan.md](Timesheet_WMS_Master_Plan.md).
> *(Last updated: 2026-06-30)*
> *(Revised: 2026-06-30 — ✅ **Round 48: Audit cleanup + migration applied — baseline JS v=113.** **CONV-M2**: `_escHtml` local copy removed from `holidays-state.js`; now uses `esc` from `format.js`. **M-DSUB**: `btn.disabled` guards added to `.hl-approve-req`, `.hl-hr-approve-req`, `.hl-approve-flex` handlers in `holidays-approvals.js`. **M-SILENT**: silent `.catch(()=>[])` removed from `getCategories`/`getVehicleRates`/`getProjects` in `expenses.js` — failures now surface via F-03 error boundary; `getMyTransactions` shows toast on error. Cache **v=111→v=112** (PR #10). **M-DATE**: last UTC-slice straggler fixed in `clientPortal.js` (`todayISO()`). **M-JTCR** + **CONV-M3**: confirmed already closed (R38 + clean). Cache **v=112→v=113** (PR #11). **`20260630_leave_manager_approved.sql` ✅ applied in prod Studio 2026-06-30**. 🔴 **STILL OPEN: F-01 (P0)** prod client RLS probe → roster swap.)*
> *(Revised: 2026-06-30 — ✅ **Round 47: SPEC-M1 + SPEC-M2 + SPEC-M3 done — baseline JS v=111.** **SPEC-M1** (leave approval tier enforcement): `approveLeaveRequest()` in `leaves.js` accepts 4th param `approvalTiers` (default 1); sets `status='manager_approved'` when tiers ≥ 2 vs `'approved'` for single-tier; `holidays-approvals.js` embeds `data-tiers` on approve buttons + adds AWAITING HR APPROVAL section with `.hl-hr-approve-req` handlers calling `hrApproveLeaveRequest()`; `holidays-state.js` extended `STATUS_BADGE` with `manager_approved`; new migration `20260630_leave_manager_approved.sql` widens CHECK constraint — ⚠️ **PENDING prod Studio apply**. **SPEC-M2** (HR name/job-title approval): verified existing `approve_job_title_change_request` RPC is already atomic/admin-guarded — no changes needed. **SPEC-M3** (notifications sub-tab badges): `requests.js` LEAVE REQUESTS badge now shows pending-only count (not total); PROFILE CHANGES panel converted from two stacked sections to NAME CHANGES | JOB TITLE CHANGES sub-tabs (`_profileSubTab` state variable, `[data-psub]` wiring, show/hide panels). Cache **JS v=110→v=111**. Commit `7884171`. 🔴 **STILL OPEN: F-01 (P0)** prod client RLS probe + apply `20260630_leave_manager_approved.sql` in Studio.)*
> *(Revised: 2026-06-29 — ✅ **Round 45: Client logins UX + comprehensive audit log.** Client logins modal in `clients.js` — copy-credentials button after provision; Reset pw + Delete row actions added; modal widened to `modal-lg`. **Comprehensive audit log system**: new `audit_log` table (`20260629_audit_log.sql`, ⚠️ **PENDING prod Studio apply**); `js/api/auditLog.js` fire-and-forget `logAction` helper; `js/pages/adminLogs.js` admin page (entity/actor/date filters; paginated table with action badges); `#admin-logs` wired in `app.html` (V→109 / routeAllowed / nav / wmsRoutes). `employees.js` History tab reads `employee_audit_log` + 4 logAction calls; `clients.js` 7 logAction calls; `holidays-approvals.js`, `expenses-approvals.js`, `requests.js` logAction on every approve/reject. Cache **JS v=107→v=109 / CSS v=35→v=38**. Commits `c8539aa` + `d377065` + `d9abfc5` + `dc47bd7` + `9842536`. 🔴 **STILL OPEN: F-01 (P0)** authenticated prod client RLS probe (go-live gate); `20260629_audit_log.sql` must be applied in prod Studio before audit log is live.)*
> *(Revised: 2026-06-29 — ✅ **Round 44: F-05 + F-08 + F-09 done — baseline v=107.** **F-05**: new migration `20260629_request_review_rpcs.sql` (3 atomic RPCs: `approve_deletion_request`, `approve_name_change_request`, `approve_job_title_change_request` — each enforces admin/manager auth via JWT, writes atomically, returns updated row); `requests.js` + `jobTitleRequests.js` rewired to call them (dropped multi-step writes). **F-08**: replaced `select('*')` with explicit column lists in `auth.js` profiles fetch + `employees.js` compensation fetch (performance + surface-area reduction; regression-tested against all consumers). **F-09**: ESM syntax-check script added; assign modal search + filter improvements. Cache **JS v=105→v=107**. Commits `04180d7` + `a81ed89` + `965c1df`.)*
> *(Revised: 2026-06-26 — ✅ **Round 43: Module splits + UX batch — baseline v=105.** **expenses.js** (2,323 lines) split into 5 modules: `expenses-state.js` / `expenses-forms.js` / `expenses-approvals.js` / `expenses-approvals-modal.js` + trimmed `expenses.js` coordinator. **holidays.js** (2,308 lines) split into 5 modules similarly. **Help page**: EN/TH language toggle added; section headers highlighted; card text muted/gray. **Projects assign modal**: member + group search bars; group filter narrows member list; select-all for both sections. Cache **JS v=102→v=105** (assign modal). **Mobile + polish fixes**: sidebar overlay on mobile (`6d1feaa`); avatar row pinned to drawer bottom (`0e1895f`); apostrophe escape in petty cash error (`e4419fc`); petty cash top-up placeholder ฿15,000 (`aa9ba44`); sidebar footer sticky on all viewports (`450538b`); search-icon/placeholder overlap fix — full `padding` shorthand on `.search-input input`, specificity rule documented in CLAUDE.md (`f31f184`). Commits: `51af2d1` `93001cd` `39d1ac6` `7d54597` `6d1feaa` `ae6ab3e` `0e1895f` `e4419fc` `9db1efc` `d893061` `f31f184` `aa9ba44` `450538b`.)*
> *(Revised: 2026-06-25 — ✅ **Round 42: Help page built + live.** Bilingual EN/TH Help page (`js/pages/help.js`) — User Guide + Admin Guide (admin-only tab). Nav item + route wired in `app.html`; `#help` added to `wmsRoutes` so SHOW MORE auto-expands on direct nav. Stale branch `claude/remaining-tasks-qdlo4e` deleted. Cache JS v=101→v=102. Commits `4f357d2` + `7a0c3f7`. Prod now **JS v=102 / CSS v=35**.)*
> *(Revised: 2026-06-22 — ✅ **Round 41: UX polish + form defaults.** ✅ **Evaluation Cycle preset buttons (H1/H2) now highlight on selection** — active state shows accent color + dim background when clicked; default preset auto-highlights per current month. JS `updatePresetSelection()` + CSS `.evc-preset-btn.active` rule. Cache JS v=99→v=100, CSS v=34→v=35 (commit `7ad40ff`). ✅ **Petty Cash top-up form default amount ฿6000→฿14000** (placeholder in Record Top-up modal; commit `0b718e8` + cache bump v=101, commit `cd34116`). Prod now **JS v=101 / CSS v=35**. Both changes live. No data/schema impact; UX refinements only.)*
> *(Revised: 2026-06-17 (b) — ✅ **Round 40: full-project audit remediation PUSHED LIVE** (commit `b647cdd`, prod **JS `?v=99`** / CSS `?v=34`). Source: [AUDIT_2026-06-17_FULL_PROJECT.md](AUDIT_2026-06-17_FULL_PROJECT.md) (13 findings). Fixed + verified live (deployed `clientPortal.js` confirmed carrying new code; app + all 14 page modules load in-browser with 0 console errors; 39 JS files parse-clean): **F-02** clientPortal — summary-first fetch, detail rows scoped via `.in('project_id', …)`, single `_buildRows()` filters BOTH render + export to known client projects; **F-03** router async error boundary (recoverable panel + toast + Retry); **F-04** new `sanitizeHtml()` in `format.js` strips script/iframe/`on*`/`javascript:` from merged document-template HTML (`resolveTemplate` choke point + `_samplePreview`; keeps headings/tables/inline styles); **F-06** route-role matrix in `app.html` (`#reports`/`#clients`/`#employees` bounce hand-typed hashes); **F-07** strengthened shared `esc` to also escape `'` (superset of every local copy) then removed all 13 local `_esc`/`_attr` copies → shared `format.js` helpers (4 parallel subagents, all parse-verified); **F-12** new `promptModal()` (textarea) replaces 3 native `prompt()` in `requests.js`; **F-13** Supabase CDN pinned to exact `@2.108.2`. **Audit corrections:** F-10's "CLAUDE.md stale at v=96/97" was already false (R39 close-out had fixed it) — only the cache-hook "not a git repo" comment was updated; F-11 (Clients search box) confirmed intentional. **🔴 STILL THE GATE — F-01 (P0): authenticated PRODUCTION client RLS probe before provisioning any real external client** (no code closes it; scratch Phase-5 already green, prod anon 45/45, but logged-in client isolation not yet probed in prod). **Deferred (surfaced):** F-05 (request-review writes → RPCs), F-08 (`select('*')` minimization), F-09 (CI/lint/Playwright), splitting `expenses.js`/`holidays.js`. See Round 40.)*
> *(Revised: 2026-06-17 — 🚀 **Round 39: CLIENT-01 LIVE.** Phase-5 RLS audit ran on the scratch project — confirmed `20260706` scoping is correct (own-scope exact, 0 cross-client, all writes denied) but found 2 pre-existing client-boundary leaks (**CLIENT-PROF** = client reads all profiles incl. other clients' PII; **CLIENT-PCS** = `petty_cash_settings`). Fixed via **`20260707_client_read_hardening.sql`** (excludes `client` role from 7 blanket-auth SELECT policies; profiles keeps own-row read) → re-probe **0 FAIL**, member access unchanged. Then the **coordinated deploy shipped**: migrations `20260706`+`20260707` applied in prod Studio, **`provision-client` (NEW → 7th Edge Fn)** + **`login` (`--no-verify-jwt`, now `identifier`-based)** deployed, frontend pushed (commit `c0e7fdc`). Verified live: **prod anon probe 45/45**, login 401 both `identifier`/`employee_id`. Then **R39-04** removed the magnifier icon from the Clients search box (commit `6690861`). Cache **JS `?v=98`** / CSS `?v=34`; **prod migrations through `20260707`; Edge Fns 7.** Last gate before a real client = in-app **client smoke**. See Round 39.)*
> *(Revised: 2026-06-16 — ✅ **Round 38 (large session).** Closed the audit queue + advanced go-live + started CLIENT-01. **v=95** (M-DATE + M-SETTLE) and **v=96** (M-DSUB/M-SILENT/M-APPROVE) **PUSHED LIVE** (commits `ae56a51`, `8f732e0`; prod serves v=96). **Backup restore Phase 2 PASSED** (live apply to scratch project; finding: auth schema doesn't restore via pooler → re-provision accounts in DR). **M-RATE done** (migration `20260705_login_attempts` + `login` Edge Fn fail-open per-ID/IP limiter, deployed + verified 429 lockout). Audit DB **M-JTCR/M-PROF/M-EVR** = `20260704` (applied + anon probe 44/44). **Entire Medium-severity audit queue CLOSED** (M-PWPOL = user dashboard action remains). **CLIENT-01 reprioritized to 1st + Phases 0–4 BUILT** (client ID `XX-0-NNN-CC` per-user, login-by-ID-or-email with Employee/Client toggle, read-only client portal, admin "Manage logins"; migration `20260706` scratch-validated; new Edge Fn `provision-client`): cache **JS v=96→v=97** ⚠️ **LOCAL + UNCOMMITTED** (prod stays v=96). Remaining: coordinated CLIENT-01 deploy (apply `20260706` in Studio → deploy `login`+`provision-client` → push frontend → smoke) + Phase 5 RLS audit. Plan `~/.claude/plans/allow-clients-to-floofy-axolotl.md` + `CLIENT-01_PLAN.md`. See Round 38.)*
> *(Revised: 2026-06-15 (m) — ✅ **R36 cont. batch: doc hygiene + M-DATE + M-SETTLE + backup reconcile.** **Docs:** stale rows refreshed (login=LIVE, RLS sweep=done), 06-12 backlog merged into the canonical 06-15 queue, 2 superseded plan docs archived, CLIENT-01 added to the Master Plan. **M-BKUP closed:** `create_backup_role.sql` got the `BYPASSRLS` the test run needed; the backups README's false "restore drill PASSED" corrected → restore **Phase 2 + repo-watch still pending**; age-key confirmed offline. **M-DATE ✅:** 14 UTC date-slice sites → `todayISO()`/`toISODate()` across `api/expenses.js` + `pages/expenses.js` + `holidays.js` + `documents.js`; parse-clean (ESM), 0 stragglers; cache **JS v=94→v=95**. **M-SETTLE ✅ (code):** new migration `20260703_settlement_rpc.sql` — atomic admin-only `approve_trip_settlement()` RPC (posts cash row + closes trip in one txn, idempotent, ICT-dated); `approveSettlement()` rewired to call it; added to the anon probe. **✅ `20260703` APPLIED in Studio 2026-06-15; ⚠️ frontend NOT pushed — push v=95 next.** See AUDIT_2026-06-15_FULL_AUDIT.md + Round 37.)*
> *(Revised: 2026-06-15 (l) — ✅ **R36 cont.: M-DRIFT verified-live + CLOSED, and a live RLS regression found + fixed.** Ran the corrected `pg_policies`/`pg_proc`/`pg_indexes` queries: all 6 `20260701` WITH CHECK policies + 4 helper `search_path` pins + `uq_cash_txn_settlement_per_trip` confirmed live → `20260701` is **fully applied**. **🔴 Regression found (audit missed it):** `20260701` §4 (`ct/tc/trq`, added R30) reverted those policies to admin/manager-only, dropping the `20260622` **owner self-cancel** + **owner-approved settlement-submit** grants. In live this means employees can't cancel own pending expense/claim/trip nor submit trip settlement (`submitSettlement` blocked by WITH CHECK) — **not yet user-hit** (pre-roster-swap). **Fix:** new migration `20260702_restore_user_cancel_rls.sql` — ✅ **APPLIED + verified live 2026-06-15** (owner branch back in `pg_policies`; anon probe 43/43; restores the `20260622` form verbatim — strictly safe, already symmetric WITH CHECK). `schema.sql` reconciled (te/lr/fhs WITH CHECK + helper `search_path` + settlement index back-ported; ct/tc/trq were already correct) + `20260701` header corrected. No cache change (SQL/docs only). See AUDIT_2026-06-15_FULL_AUDIT.md → **M-REGRESS**.)*
> *(Revised: 2026-06-15 (k) — 📋 Full security + correctness + function audit complete — [AUDIT_2026-06-15_FULL_AUDIT.md](AUDIT_2026-06-15_FULL_AUDIT.md). **0 Critical · 0 High confirmed · 11 Medium · 8 Low · 1 Resolved.** Two agent-flagged Highs downgraded to Medium after manual blast-radius check (`jtcr_own` has no auto-apply trigger; `profiles_update_own` trigger blocks sensitive columns). Priority: M-DRIFT (verify live pg_policies + index before next migration), M-DATE (12 UTC-slice sites in holidays/expenses/documents), M-JTCR (jtcr_own WITH CHECK split), M-DSUB (double-submit on leave), M-SILENT (silent catch on money fetches), M-BKUP (backup role SQL). Quiet-window: M-SETTLE/M-APPROVE (atomicity), M-RATE (login rate-limit), M-PWPOL (server-side pw policy). Full remediation queue in the report.)*
> *(Revised: 2026-06-15 (j) — ✅ Round 35: Employees UX + admin batch (user feedback after R34 went live). **empSelect search** on the Directory + Account Status (hyphen-tolerant; arrow/✕ **side-by-side**, dark-theme arrow); Account Status **filters** (state + dept); **Deactivate/Reactivate account** (new 6th Edge Fn `admin-set-account-active`, reversible ban, "Deactivated" badge; `account-activation-status` now returns `banned_until`); **stale-state auto-refresh** + **tab persistence** + provision email-guard; **Esc closes all modals** (global handler); page title **"Hubble Engineering WMS"** + **H favicon** + login titles. New **CLAUDE.md rules** (empSelect-for-search, Esc-all-modals). Cache **JS `?v=94` / CSS `?v=34`**. 🚀 PUSHED LIVE 2026-06-15 (commit `3ff0449`). See Round 35.)*
> *(Revised: 2026-06-15 (i) — 🚀 **PUSHED LIVE: the R32–R34 client batch is now in prod** (commit `17edc56..e284f50`). GitHub Pages now serves **JS `?v=93` / CSS `?v=31`** — verified (prod `app.html` reports `v=93`). Ships R32 (`confirmModal` + password-form UX), R33 (change-password dead-end fix), R34 (admin "Account Status" tab; its `account-activation-status` Edge Fn was already live → now **5 Edge Fns** in prod). Working tree clean. **Next:** live-test the Account Status tab in prod → closeout (templates · leave pro-rating · Help page) → roster swap (LAST). See Rounds 32–34.)*
> *(Revised: 2026-06-14 (h) — ✅ Round 34: **built the admin "Account Status" tab** (approved from the R33 plan). New page-level tab on the Employees page (Directory ⇄ Account Status, admin-only) lists each account's activation state — *Never signed in / Not activated / Not provisioned / Activated* badges, attention-first, with a count; row → existing modal for Reset/Provision. Fed by a **new 5th Edge Function `account-activation-status`** (read-only, admin-guarded, one `listUsers()`; **DEPLOYED to prod**, smoke 401). Client in `js/pages/employees.js` + cache **JS `?v=92`→`?v=93`** (`app.html`). **Verified:** module parse-clean (dynamic import → `render=function`) + Edge Fn 401 unauth. ⚠️ Client **NOT pushed** — prod client stays v=91; the Edge Fn is live in prod (harmless — unused until the client ships). Live admin test (login → tab → activation flip) is user-driven. See Round 34.)*
> *(Revised: 2026-06-14 (g) — ✅ Round 33: fixed the **change-password dead-end** — a stale/invalidated forced-change session (e.g. admin re-reset while a tab still held the old token) made `updateUser` fail, so `force_password_change` never cleared and the user was **trapped** on the change-password screen. `index.html` now classifies auth errors (`status 401/403` · msg `/session|jwt|token|missing/`) → shows "session expired" + auto-bounces to a clean login; non-auth errors (reused/weak pw, rate-limit) still show their real message. Verified parse-clean (0 console errors) + classifier 7/7. Also confirmed **NOT** bugs: the earlier "submit fails" was a **stale temp password**, and **forced-until-set is correct by design** (kept as-is per user). **No cache change** — `index.html` edit only (not `?v=`-pinned), rides the still-unpushed v=92 batch; prod stays v=91 / CSS v=31. ⏸ Planned but **deferred** by user: admin **"Account Status" tab** + read-only Edge Fn `account-activation-status` (plan `~/.claude/plans/forced-until-set-and-add-the-whimsical-prism.md`); parked: reset cooldown, force-all-to-login, prefsModal hardening. See Round 33.)*
> *(Revised: 2026-06-14 (f) — 🟢 Round 32: app-wide **centered confirm modal** — replaced all 9 native `confirm()` (top-anchored by Chrome, can't center) with a reusable `js/components/confirmModal.js` (house Modal Pattern, escapes content, danger variant). Built + verified in preview. Also: live **password match indicator** (✓/✗) + **disable-until-valid-and-matching** submit button on both password-set forms (index.html + Security tab). Cache **JS `?v=92`**. ⚠️ NOT yet pushed — prod stays v=91/v=31. See Round 32.)*
> *(Revised: 2026-06-14 (e) — 🚀 **GO-LIVE: login overhaul PUSHED to prod** (commit 17edc56). GitHub Pages now serves **JS `?v=91` / CSS `?v=31`** + the new **ID+password login** (verified live, zero v=86 refs). All 4 Edge Fns deployed; `20260701` RLS sweep applied (anon probe 43/43). e2e verified happy-path (login, forced change, 2FA enroll+challenge [Bug A], Skip); Bug B + admin Clear-2FA left as optional spot-checks. The Phase-2c login-overhaul go-live item is **COMPLETE** — next on the roadmap: closeout → roster swap (LAST).)*
> *(Revised: 2026-06-14 (d) — 🟡 Round 31: dark-theme fix — the native Edge password-reveal **eye** (`::-ms-reveal`) rendered black on dark inputs; recolored via `filter: invert(0.8)` in `css/style.css` + `index.html` scoped styles (CSS `?v=31`). Surfaced during R30 e2e, where login + forced change + 2FA enroll/challenge (**Bug A ✅**) + Skip all verified working — the earlier "login failed" was a stale temp password, not a bug. See Round 31.)*
> *(Revised: 2026-06-14 (c) — 🟡 Round 30: **forced full pre-go-live audit** (Edge Functions + R25 RLS sweep) — [AUDIT_2026-06-14_FULL_PREGOLIVE.md](AUDIT_2026-06-14_FULL_PREGOLIVE.md). **0 High, 2 Med fixed, 4 Low backlog.** Fixed: `admin-clear-mfa` audit-log gap (M1) + M4 `ct/tc/trq` WITH CHECK extended into `20260701` (M2). Re-verified the R28 `login` L2/L3 fixes are present in source (rewind caveat **false**); anon probe **43/43 PASS**. No cache change (server/SQL). ⚠️ Push still blocked on: apply `20260701` + manager smoke · redeploy 4 Edge Fns · user e2e · push. See Round 30.)*
> *(Revised: 2026-06-14 (b) — 🟡 Round 29 logs the R27 **Phase-2 client hardening** built after the R27/R28 entries: password-policy module + 7-rule strength indicator (`js/passwordPolicy.js`), Preferences **Security tab**, admin **Clear 2FA** + new 4th Edge Function `admin-clear-mfa`, **dark-input denylist fix**, login-form **ID auto-format**. Cache **JS `?v=91` / CSS `?v=30`**. All **committed (local `ahead 3`) but NOT pushed** — prod still v=86. ⚠️ A **forced full pre-go-live audit** (4 Edge Functions + R25 RLS sweep, fix High/Med inline) now gates the push — plan `~/.claude/plans/finish-this-cheeky-mochi.md`; already found the `admin-clear-mfa` audit-log gap + M4 `WITH CHECK` gap. See Round 29.)*
> *(Revised: 2026-06-14 — ✅ Round 27 login overhaul: fixed **Bug A** (TOTP never challenged on return logins → `proceedAfterAuth()` + `#view-totp-challenge`) + **Bug B** (force-change/MFA gate in `app.html` — initial top-level `return` caused a blank-screen SyntaxError in the module, fixed with `throw`); **login Edge Fn now hyphen-tolerant + DEPLOYED to prod** (`--no-verify-jwt`); TOTP QR white-bg scannability fix; **David Bowman test login provisioned** (delete old auth user via SQL → set contact_email → Provision Account). Cache JS `?v=90`. ⚠️ Client side (app.html/index.html/auth.js) **UNCOMMITTED — not pushed**; prod still v=86 (only the login Edge Fn is live in prod). 🟡 **Next session:** finish Bug A/B end-to-end verification, then full login-overhaul audit. Also queued this session: **R27-07** (avatar chevron should flip up when the dropdown opens) + **R27-08** (explore emailing client invites with ID + password). See Round 27.)*
> *(Revised: 2026-06-13 — ✅ Round 26 backup pipeline TEST RUN PASSED: all 4 user steps wired (workflow-scope token, backup.yml pushed + active, read-only `backup_role` w/ BYPASSRLS, `SUPABASE_DB_URL` secret). First failure (`auth.audit_log_entries` RLS under `row_security=off`) fixed via `ALTER ROLE backup_role BYPASSRLS` (stays read-only). Re-run committed `daily/wms_20260613.sql.gz.age` 56 KB. `actions/checkout`→v6.0.3 (Node 24). PG major = 17. **Still before go-live sign-off:** 🔴 restore drill to scratch project · move age-key.txt offline · watch repo. No cache change. See Round 26 R26-03/04.)*
> *(Revised: 2026-06-12 (d) — 🟡 Round 26 BUILT: daily backup pipeline (go-live #2). Private repo **HE-cells/hubble-wms-backups** + scaffold pushed, `age` 1.3.1 installed + keypair generated, `AGE_PUBLIC_KEY` repo variable set, full file set in `supabase/backups/` (workflow `backup.yml`, `create_backup_role.sql`, `db_dump.ps1`, setup README). Storage ❓ resolved — app uses NO Supabase Storage, DB dump = complete backup. **Blocked on 4 user steps** (workflow-scope refresh → push backup.yml · role SQL in Studio · `SUPABASE_DB_URL` secret · age-key offline) then manual test run; 🔴 restore drill before go-live. No cache change (no js/css edits). See Round 26 below.)*
> *(Revised: 2026-06-12 (c) — ✅ Round 25 COMPLETE: full 4-dimension project audit (XSS / RLS / correctness / conventions → [AUDIT_2026-06-12_FULL.md](AUDIT_2026-06-12_FULL.md)) + all High-severity items fixed & deployed (commits 85540ed + 7fc2e46): 6 XSS sinks, 6 date/TZ bugs incl. weekly-wage window leftover, 2 cache-versioning defects, past-date validation. Cache JS **`?v=86`**. `20260701_update_with_check_hardening.sql` scaffolded ⚠️ NOT applied (deferred to RLS sweep). Mediums/Lows parked in the audit backlog section below. Next: daily backup pipeline.)*
> *(Revised: 2026-06-12 (b) — 🔒 SECURITY REVIEW (no code): user accepted all free security additions for checklist #2/#3 — encrypted backups (`age`), read-only `backup_role`, failure alerting + restore drill, full-DB dump scope (incl. `auth` schema), Edge-Function login (replaces anon lookup RPC), forced password change after every admin reset, GH Actions hygiene, **disable public sign-ups NOW** (✅ done same day — toggle OFF, user-confirmed; build-time notes: manual linking must go ON at #3, provision-users needs `email_confirm: true`). 💰 Paid-tier upgrades (Supabase Pro / GitHub Team) noted as strongly recommended — CEO negotiation open. See 🔒/💰 sections under the login spec below.)*
> *(Revised: 2026-06-12 — 📋 PLANNING SESSION (no code): go-live sequence revised + login overhaul spec'd. New order: ✅ online → **daily backup pipeline** (GH Action, 01:00 ICT) → **login overhaul** (Employee ID + admin-issued password, optional TOTP w/ Skip, sign-ups disabled) → R25 RLS sweep → closeout → roster swap LAST. The "First-login notification / UNLINKED ACCOUNTS" item is **dropped** — pre-provisioned accounts make it moot. Spec details in the 🚀 checklist below; also synced to Timesheet_WMS_Master_Plan.md (stale R21-07/deploy "next priority" text corrected).)*
> *(Revised: 2026-06-11 — 🚀 Round 24 DEPLOYED TO PRODUCTION: **https://he-cells.github.io/hubble-wms/** (public repo github.com/HE-cells/hubble-wms, account HE-cells; app-only, docs/credentials .gitignored). OAuth redirect subpath fix in `js/auth.js` (cache JS `?v=84`); Supabase Site URL + Redirect URLs set to prod (localhost kept for dev); **prod Google login verified by user**. Go-live Phase 3 (full RLS sweep, R25) **⏸ ON HOLD by user** — partial M2/M3 audit findings recorded in [AUDIT_2026-06-11_GOLIVE.md](AUDIT_2026-06-11_GOLIVE.md) (lr_update/fhs_update missing WITH CHECK, no approval escape). Remaining at resume: RLS sweep → template wording → roster swap LAST + OAuth secret rotation.)*
> *(Revised: 2026-06-11 — Round 23 BUILT (Go-live Phase 0 security hotfix): 🔴 found+fixed self role-escalation via `profiles_update_own` (no WITH CHECK) and 🔴 confirmed-live anon leak in `get_project_stats`/`get_tag_usage` (probe showed real data). Migration `20260630_security_hardening.sql` + new `supabase/probes/anon_probe.ps1` (39 tables + 4 RPCs; baseline: 2 FAIL as expected) + `AUDIT_2026-06-11_GOLIVE.md`. Go-live plan approved: hotfix → deploy (sci-fi roster) → redirects → RLS sweep → closeout → roster swap LAST. ⚠️ Apply 20260629 + 20260630 in Studio, then re-run probe → expect 43/43 PASS.)*
> *(Revised: 2026-06-11 — Round 22 BUILT: employees may only request an **Employment Certificate**; other doc types stay admin/manager generate-only. New 9th template type via `20260629_employment_certificate.sql` (CHECK extended on 3 tables + seed); REQUESTS form filtered by new `EMPLOYEE_REQUESTABLE_TYPES` set (UI gating). Cache JS `?v=83`. ⚠️ Apply migration in Studio + logged-in smoke pending.)*
> *(Revised: 2026-06-11 — ✅ R21-07 resolved: print left/right margins 0.75in → 0.25in → **0.5in final** (user revised after seeing 0.25in; top/bottom stay 0.75in). `@page` rule in `js/pages/documents.js`; cache JS `?v=82`. No other open work items — next up is the 🚀 pre-launch checklist, which waits on user approval of the app.)*
> *(Revised: 2026-06-11 — Round 21 BUILT: M6 Document Requests + role-based tab gating. New `document_requests` table (migration `20260628_document_requests.sql`: RLS own-insert/self-cancel/manager-review, partial unique index blocks duplicate pending). New REQUESTS tab for all roles: employees submit/cancel requests for any active doc type; admin/manager Fulfill (prefills GENERATE; draft links via `fulfilled_document_id`, request flips to fulfilled at draft→generated) or Reject (optional-reason modal). Managers now see TEMPLATES **view-only** (UI gating only — template writes stay admin-only in RLS). Documents badge: + pending requests (admin/manager; manager excludes own) + unseen decisions (employee, `docreq_seen_*`). Cache final: JS `?v=80`. ✅ **All 3 M6 migrations applied in Studio same day** (20260626 needed an idempotent policy re-apply after a 42710 duplicate-policy error; verified 8 templates / 4+4+4 policies). ✅ R20-08 + R21-05 smoke tests passed (user-confirmed). Post-smoke: R21-06 print fix — `@page` 0.75in margins + scale-proof full-width print body. 🟡 **Open: R21-07** — user reports left/right print margins still look too wide; awaiting target value (0.5in? 0.25in?) + re-test at Scale 100%.)*
> *(Revised: 2026-06-11 — Round 20 BUILT: M6 Automated Documentation (Phase 7) local implementation complete. Added migration `20260626_document_templates.sql` with `document_templates` + `generated_documents` (separate from existing M3 `employee_documents` upload table), RLS, 8 seeded templates, API merge engine, Documents WMS page, nav/badge wiring, print-to-PDF modal, template editor, UI naming + UI/UX spec updates. Follow-up polish: darker view-modal document text, print-to-fit A4 portrait layout, required merge-field warnings across templates, blank `custom.note` suppression, draft-before-generate workflow, and separate MY DOCUMENTS / TEAM DOCUMENTS lists. Note: current seeded document templates are workflow placeholders and all templates will be reviewed/updated with final HE wording before full release. Cache: JS `?v=78` / CSS `?v=29` / tokens `?v=22`. ⚠️ Apply migrations in Studio + run UI smoke test after login.)*
> *(Revised: 2026-06-11 — 🚀 Pre-launch checklist added (user-confirmed order): ① sci-fi roster stays until app approved → swap to real HE roster · ② GitHub Pages deploy · ③ prod redirect URL in Supabase + Google Cloud · ④ final auth overhaul / RLS reconciliation. I-01/I-04/P-05 entries cross-referenced. Also: `UI UX Specification.md` updated with WMS nav (§2.1), WMS view specs (§5: Employees, Leave & Holidays, Notifications, Expense & Travel, Evaluation, Documents) + WMS shared patterns (§6). No code changes.)*
> *(Revised: 2026-06-11 — Round 19 COMPLETE: M5 Employee Evaluation (Phase 6) fully built + all 4 migrations applied in Studio. 4 new tables + RLS + 2 RPCs + 28-question bilingual seed; anon RLS probes passed; auth bypass in both RPCs found & fixed. Post-build fixes: cycle modal theming (input type + btn-ghost), twice-a-year H1/H2 presets, EN-before-TH, read-only readability, self-edit before manager review, rating description before score chips, Edit button, S1 "minimum 2 items", duplicate Section 2 header. Cache: JS `?v=74` / CSS `?v=29` / tokens `?v=22`. All 4 migrations applied ✅: 20260625_evaluation_m5 + 20260625b_rpc_auth_fix + 20260625c_self_edit + 20260625d_question_wording. 🟡 R19-05 UI smoke test (admin→assign→self→manager→publish) pending login.)*
> *(Revised: 2026-06-10 — Round 18 COMPLETE: M1/M2/M3 audit remediation. 9 findings fixed (XSS×3, schema drift, WFH weekend guard, reports catch, safeColor, requests refactor, badge try-catch, entryModal guard). ✅ Both migrations applied in Studio (F2 final version: approved-edit re-sync + auto-create balance row + SECURITY DEFINER). Cache: JS `?v=68`. Annual leave reset (Dec 31) noted as plan. Next: M5 Employee Evaluation.)*
> *(Revised: 2026-06-10 — M1/M2/M3 audit run: 9 verified findings (4 false alarms documented) → Round 18 remediation PLANNED, not yet built. See `AUDIT_2026-06-10_M1_M2_M3.md`.)*
> *(Revised: 2026-06-10 — Round 17 COMPLETE: P5 smoke-test passed. Reject prompt()→modal in expenses + leave/holidays. Admin edit modal category lock. Leave & Holidays tab-state persistence across hard refresh. Cache: JS `?v=67`. P5 fully wrapped. Next: M5 Employee Evaluation.)*
> *(Revised: 2026-06-10 — Round 16 COMPLETE (R16-01–R16-11 ✅): User self-service cancel all pending requests + RLS fix (20260622) + NCR/JTCR `updated_at` query bug + Override modal + Top-up required fields + PT payout date + office budget lock + category rename (20260623). All 6 R16 migrations applied in Studio ✅. Cache: JS `?v=63`.)*
> *(Revised: 2026-06-10 — Phase 5 carry-forward catalogued: P5-CF-01 smoke-test sign-off, P5-CF-02 admin edit modal lock, P5-CF-03 deferred features. No code changes. Next: M5 Employee Evaluation.)*
> *(Revised: 2026-06-10 — Round 15 BUILT: Team Balance cards, calendar all-day slots, SHOW MORE/LESS, per-item Mark Paid, tab-state persistence, manager parity on time editing (new migration). Cache: JS `?v=62`. ⚠️ Apply 3 pending migrations in Studio — see Round 15 below.)*
> *(Revised: 2026-06-10 — Round 14 BUILT: Required project/purpose field, FX URL fix + toasts, shared empSelect component (holidays refactored), admin employee picker on all 5 time pages, Save & Approve in edit modals. Cache: JS `?v=61`. ⚠️ Apply `20260619_tet_admin_rls.sql` + `20260609_pt_daily_rate.sql` in Studio. See Round 14 below.)*
> *(Revised: 2026-06-10 — Round 13 BUILT: CSS alias fix, category→project lock, Payment Details double-count fix, PT ฿550/day session wages + post-to-ledger. Cache: JS `?v=60`, tokens.css `?v=22`. ⚠️ Apply `20260609_pt_daily_rate.sql` in Studio. See Round 13 below.)*
> *(Revised: 2026-06-09 — Round 12: Petty-cash reimbursement workflow (settings table, reimbursed_at, payment details panel, suggested top-up). Cache: JS `?v=59`. See Round 12 below.)*
> *(Revised: 2026-06-09 — Round 11: P5-V 12 fixes + employee expense badge. Cache: JS `?v=58`. See Round 11 below.)*
> *(Revised: 2026-06-09 — Round 10: Security & correctness audit remediation. Cache: JS `?v=56`, CSS `?v=29`. See Round 10 below.)*
> *(Revised: 2026-06-08 — Round 9: weekNav component + week numbers, currency default USD, trip project required, FX-at-export cost memo. Cache: JS `?v=55`, CSS `?v=29`. See Round 9 below.)*
> *(Revised: 2026-06-08 — Round 8: Three UX improvements. Cache: JS `?v=45`. See R8-01…R8-03 below.)*
> *(Revised: 2026-06-08 — Phase 5 (M4 Expense & Travel) built: migration `20260615_expense_travel.sql`, `js/api/expenses.js`, `js/pages/expenses.js`, nav + routes in `app.html`. Cache: JS `?v=39`. Round 7: Full security + correctness audit. Cache: JS `?v=38`. Round 6: R6-01…R6-03 done. Cache: JS `?v=37`, `style.css?v=26`, `calendar.css?v=21`, `tokens.css?v=21`.)*

---

## How to use this file

| Symbol | Meaning |
|--------|---------|
| 🔴 | Blocking — must be done before any further testing or next phase |
| 🟡 | Important — needed before go-live but not blocking current work |
| 🟢 | Nice-to-have / polish — defer until a quiet window |
| ✅ | Done — keep for one session then archive to the bug ledger |
| ⏸ | Parked — deliberate decision to not do yet |

**Rule:** When a task is completed, mark it ✅ with the date. Do not delete it immediately — let it sit one session so there's a handoff record, then move it to the relevant spec doc's fixed-bugs section.

---

## 🟡 Audit 2026-06-12 remediation backlog — MERGED into the 2026-06-15 queue *(High items fixed in R25; Mediums/Lows mapped below)*

> Full findings: [AUDIT_2026-06-12_FULL.md](AUDIT_2026-06-12_FULL.md). High items all fixed in R25-audit (cache JS `?v=86` after the weekly-wage TZ leftover follow-up, commit 7fc2e46). Items below are parked — address in a quiet window, not blocking go-live.
>
> **🔗 Merged into the 2026-06-15 deep-pass queue (canonical, above).** Status mapping:
> - **Resolved:** RLS-M1 (WITH-CHECK gap) → done R30 `20260701` + R36 verify · CACHE-L1 (`tokens.css` no `?v=`) → already versioned `?v=22`.
> - **Duplicate of a 2026-06-15 ID** (track there): UTC-M1/M2/M3/M4 → **M-DATE** · MONEY-M1 → **M-SETTLE** · MONEY-M2 → **M-SILENT** · DUPE-L1 → **M-DSUB** · RLS-M2 → **M-PROF** · RLS-M3 → **L-ADMCK** · XSS-M1–M4 → audit's "XSS backlog closed (static sweep)" (re-verify in a full agent pass).
> - **2026-06-12-only, still open** (not in the 06-15 report): CONV-M1 (`calendar.js` hand-rolled week-nav → `weekNav`) · CONV-M2 (`_esc` dup → `esc()`) · CONV-M3 (`requests.js` `opacity:0` action cells — forbidden) · CONV-M4 (`localhost:3030` hardcoded) · CONV-L1/L2 · MODAL-L1 · SPEC-M1 (leave-tier at DB) · SPEC-M2 (HR state machine) · SPEC-M3 (notif sub-tab badges). Detail in the tables below.

### XSS Medium/Low
| ID | File | Sink | Priority |
|----|------|------|----------|
| XSS-M1 | `js/pages/requests.js` | Employee name/request details in approval cards | 🟡 Medium |
| XSS-M2 | `js/pages/employees.js` | Employee fields in table rows | 🟡 Medium |
| XSS-M3 | `js/pages/evaluation.js` | Employee names in cycle/review cards | 🟡 Medium |
| XSS-M4 | `js/pages/documents.js` | Template names, merge-field previews | 🟡 Medium |
| XSS-L1 | Multiple pages | `_esc()` local vs `esc()` from format.js — consolidate | 🟢 Low |

### RLS Medium/Low
| ID | Area | Finding | Priority |
|----|------|---------|----------|
| RLS-M1 | M4/M5/M6 UPDATE policies | WITH-CHECK gap likely present — audit pending (part of R25 sweep) | 🟡 Medium |
| RLS-M2 | `profiles_update_own` | `avatar_url`, `preferences` unguarded by trigger | 🟢 Low |
| RLS-M3 | `ct_update`, `trq_update`, `ncr_update` | Full column-set restriction not enforced | 🟢 Low |

### Date/Timezone Medium/Low
| ID | File | Bug | Priority |
|----|------|-----|----------|
| UTC-M1 | `js/pages/holidays.js:1516` | `today` for flex-swap default date | 🟡 Medium |
| UTC-M2 | `js/api/expenses.js` | `txn_date` defaults | 🟡 Medium |
| UTC-M3 | `js/pages/documents.js` | Document generation date | 🟡 Medium |
| UTC-M4 | 13+ locations | `new Date().toISOString().slice(0,10)` pattern | 🟡 Medium |
| MONEY-M1 | `js/pages/expenses.js` | Settlement double-post gap | 🟡 Medium |
| MONEY-M2 | Multiple | Silent `.catch(()=>[])` on money-critical fetches | 🟡 Medium |
| DATE-L1 | `js/pages/evaluation.js` | Cycle deadline date UTC midnight | 🟢 Low |
| DATE-L2 | `js/pages/requests.js` | `_isRecent` window uses UTC now | 🟢 Low |
| MODAL-L1 | `js/components/entryModal.js` | `_userId` stale across admin→self context switch | 🟢 Low |
| DUPE-L1 | `js/pages/expenses.js` | Double-submit gap on trip/expense submit | 🟢 Low |

### Cache / Conventions Medium/Low
| ID | Area | Finding | Priority |
|----|------|---------|----------|
| CACHE-L1 | `index.html` | `tokens.css` imported without `?v=` | 🟢 Low |
| ~~CONV-M1~~ | ~~`js/pages/calendar.js`~~ | ~~Hand-rolled week nav instead of `weekNav` component~~ | ✅ Fixed R46 |
| CONV-M2 | `js/pages/expenses.js` + `holidays.js` | `_esc()` local duplicates — use `esc()` import | 🟡 Medium |
| CONV-M3 | `js/pages/requests.js` | Action cells use `opacity:0` hover (forbidden in CLAUDE.md) | 🟡 Medium |
| CONV-M4 | `app.html` | `localhost:3030` hardcoded in diagnostic string | 🟢 Low |
| CONV-L1 | `holidays.js` + `expenses.js` | `_nextWeekday` duplicated — extract to `format.js` | 🟢 Low |
| CONV-L2 | `js/pages/tracker.js` | FullCalendar not destroyed on route change | 🟢 Low |

### Spec gaps
| ID | Spec ref | Gap | Priority |
|----|----------|-----|----------|
| ~~SPEC-M1~~ | ~~HE_WMS_Spec §3.2~~ | ~~Leave approval tier enforcement not at DB level~~ | ✅ Fixed R47 |
| ~~SPEC-M2~~ | ~~HE_WMS_Spec §4~~ | ~~HR name/job-title approval: no DB state machine~~ | ✅ Fixed R47 (RPC already atomic) |
| ~~SPEC-M3~~ | ~~UI UX Spec §5~~ | ~~Notifications page: no sub-tab badges~~ | ✅ Fixed R47 |

---

## 🟡 Audit 2026-06-15 deep-pass backlog *(0 High confirmed · 11 Medium · 8 Low)*

> Full findings: [AUDIT_2026-06-15_FULL_AUDIT.md](AUDIT_2026-06-15_FULL_AUDIT.md) (authoritative consolidated report; supersedes `AUDIT_2026-06-15_FULL_STATIC_LOCAL.md` which stays as the static-pass record).
> **Verdict: 0 Critical · 0 High confirmed · 11 Medium · 8 Low · 1 Resolved.** Architecture and auth model solid. Two agent-flagged Highs downgraded to Medium after manual blast-radius check.
>
> **Priority by tier — details in the report's remediation queue:**
> - **Verify live first (before next migration):** ✅ **M-DRIFT verified-live + CLOSED 2026-06-15 (R36)** — all 6 `20260701` WITH CHECK policies + 4 helper `search_path` + `uq_cash_txn_settlement_per_trip` confirmed live; `schema.sql` reconciled. ⚠️ Surfaced **M-REGRESS** (`20260701` §4 dropped the `20260622` owner self-cancel/settlement grants in live) → `20260702_restore_user_cancel_rls.sql` ✅ **applied + verified live 2026-06-15** (anon probe 43/43).
> - **Next code session:** M-DATE (12 UTC-slice sites in `holidays.js`/`expenses.js`/`documents.js`) · M-JTCR (`jtcr_own` WITH CHECK split) · M-DSUB (double-submit on leave `holidays.js:1072,1278,1470`) · M-SILENT (silent catch on money fetches `expenses.js:1117,1618`) · M-BKUP (add `BYPASSRLS` to `create_backup_role.sql`).
> - **Quiet window:** M-SETTLE + M-APPROVE (atomic RPCs) · M-PROF + M-EVR (`WITH CHECK` on profiles/evr) · M-PWPOL (server-side pw policy) · M-RATE (login rate-limit).
> - **Post-go-live:** L-CSP (meta CSP + vendor Supabase JS) · L-ADMCK (~15 admin UPDATE policies) · L-FNSP/L-SPDEV (search_path) · L-INITYR (Initialize Year error surfacing).

---

## 🚀 Go-live checklist *(revised 2026-06-12, user-confirmed — do in this order)*

| # | Item | Status | Detail |
|---|------|--------|--------|
| 1 | **Online on sci-fi roster** | ✅ Done 2026-06-11 (R23–R24) | Security hotfix + probe 43/43 · Pages deploy · prod redirect URLs · prod Google login verified |
| 2 | **Daily backup pipeline** | 🟡 Built + ✅ test run passed 2026-06-13 (R26; `wms_20260613.sql.gz.age` 56 KB committed) — 🔴 restore drill + age-key offline + repo-watch before sign-off | GitHub Action in **new private repo `HE-cells/hubble-wms-backups`**: `pg_dump` nightly at **01:00 ICT** (cron `0 18 * * *` UTC; GH cron can drift 5–30 min), connection string in GH Actions Secrets, retention 30 daily + 12 monthly. Plus local on-demand `supabase/backups/db_dump.ps1` for pre-migration dumps. `pg_dump` snapshots are transactionally consistent — **no user-facing impact at 1–2 AM, no usage restriction needed**; Help page gets one info line ("work saved after 1:00 AM appears in the following night's backup"). Must land **before** the login overhaul. **🔒 Security additions (accepted 2026-06-12):** dumps encrypted with `age` before commit (public key in workflow, private key offline with user) · dedicated read-only `backup_role` (`pg_read_all_data`) instead of `postgres` · **full-DB scope incl. `auth` schema** (verify whether Storage buckets hold M3 uploads — if so, plan storage backup separately) · failure alerting (watch repo, GH failure emails) · **one test restore to a scratch Supabase project before go-live** (backup unverified until restored once) · GH hygiene: pinned action versions, `permissions: contents: write` only, never echo the connection string. |
| 3 | **Login overhaul** | ✅ **LIVE in prod 2026-06-14** (R29–R35, commits `17edc56`→`3ff0449`; prod JS v=94 / CSS v=34) | **Toolchain prereqs (confirmed missing 2026-06-13):** install `supabase` CLI (Windows `scoop install supabase` / direct binary — npm pkg deprecated) → `supabase login` (PAT) → `supabase link` proj `sjkggguedgtynktymzes`; Deno only for local fn test; flip Dashboard "Allow manual linking" **ON**. Build + test on sci-fi roster (Google OAuth stays = rollback). **🔒 2026-06-12 additions:** login via **Edge Function** (ID+password in → session out; replaces the anon lookup RPC — email never exposed, rate-limitable) · forced password change after **every** admin reset, not just first login. ⚡ **Sign-up toggle moved up — do NOW** (see 🔒 section). |
| 4 | **R25 full RLS sweep** | ✅ **Done 2026-06-14 (R30)** — `20260701` applied (anon 43/43); M-DRIFT live-verified + M-REGRESS fixed 2026-06-15 (R36, `20260702`) | Core/M1 (`te_update` unverified) + M4/M5/M6 audits → `20260701_rls_with_check.sql` (incl. drafted `lr_update`/`fhs_update` WITH CHECK fixes — SQL ready in [AUDIT_2026-06-11_GOLIVE.md](AUDIT_2026-06-11_GOLIVE.md)) → client-role verification → final anon probe (gate: 43/43 PASS) |
| 5 | **Closeout** | pending | Template wording (user supplies final HE text → TEMPLATES editor; all 9 templates are placeholders) · leave pro-rating decision recorded (Dec-31 reset policy already noted) · **bilingual Help page LAST** (`js/pages/help.js`, EN+TH, role-aware, static — written after #3 so it documents the real login flow; this IS the user + admin manual) · **re-sync the structure docs** (timesheet plan §7 + Spec §14 nav tree) to final state at completion |
| 6 | **Roster swap + go-live (LAST)** | pending | Recall `real-employee-roster.md` → **TRUNCATE CASCADE (RSK-0 — confirm with user)** → seed 14 real employees + correct dept codes → sequence→15 → Initialize Year for 6 active → provision real accounts (`provision-users`) → **rotate OAuth client secret (R10-D)** same sitting |

### 🔐 Login overhaul spec *(user decisions 2026-06-12)*
- **Login = Employee ID (`DD-T-NNN-CC`) + password.** ~~Lookup RPC resolves ID → work email client-side~~ **Revised (security review, accepted 2026-06-12): login goes through an Edge Function** — Employee ID + password in, session out. The work email never reaches the client, the function is a natural rate-limit point, and MOD 97-10 still blocks blind ID enumeration. Work email (mix of Gmail + business email) remains the underlying auth identity.
- **Provisioning:** Edge Function `provision-users` (admin-guarded, service-role) bulk-creates one auth account per employee — work email + **random temp password**, `employees.user_id` linked at creation. Credential sheet handed out privately. (Static GH Pages app has no server; Edge Functions are the only safe home for service-role actions.)
- **Password lifecycle:** user changes password after first login. **Reset is admin-only** — Edge Function `admin-reset-password` via a button on the Employees page generates a new random password, shown once to admin. No self-service email resets. **🔒 Added 2026-06-12: forced password change after EVERY admin reset** (same mechanism as first login) — otherwise the admin knows the user's live password indefinitely.
- **First-login flow:** forced password change → TOTP 2FA enrollment screen **with Skip button**.
- **TOTP 2FA optional** (free tier) — user can enable/disable anytime in Preferences. App-level gate only; no `aal2` RLS enforcement.
- **Google sign-in kept as optional convenience:** "Link Google account" button in Preferences (`linkIdentity` from a logged-in session). Gmail users get one-click sign-in afterwards; business-email users use ID+password only.
- **Public sign-ups disabled** in Supabase Auth — closes the anyone-with-a-Google-account hole. **✅ DONE 2026-06-12** — "Allow new users to sign up" switched OFF + saved (user-confirmed with screenshot; resequenced ahead of the build since it only blocks *new* account creation — existing test logins unaffected). **⚠️ Two build-time notes captured from the same settings page:** ① "Allow manual linking" is currently **OFF** — must be switched **ON during build #3** or the "Link Google account" feature (`linkIdentity`) will fail. ② "Confirm email" is **ON** — `provision-users` must create accounts with `email_confirm: true` (admin API param) or provisioned users will be stuck at an email-confirmation step they can never complete.
- **Default page after login = Calendar** *(user req 2026-06-12)* — post-login landing route changes to `#calendar` (currently lands elsewhere); applies to every login, all roles.
- **Dropped:** the planned "First-login notification / UNLINKED ACCOUNTS" feature — pre-provisioning eliminates unlinked accounts.

### 🔒 Security review additions *(2026-06-12, all accepted by user — all $0)*
Folded into checklist #2/#3 above; collected here as the single reference list:
1. **Encrypt backups with `age` before commit** — plain-text dumps in a private repo = full PII/evaluation/rate dataset one account-compromise away; git history keeps deleted files forever, so retention deletes nothing. Public key in workflow, private key offline with user.
2. **Read-only `backup_role`** (`pg_read_all_data`) for the backup connection string — caps a leaked GH secret at "read-only leak" instead of "full DB takeover".
3. **Failure alerting + restore drill** — GH failure emails (watch the repo) + one test restore to a scratch Supabase project (free tier allows 2 projects) before go-live.
4. **Forced password change after every admin reset** (not just first login).
5. **Disable public sign-ups NOW** — ✅ DONE 2026-06-12, user-confirmed (toggle OFF + saved; see spec bullet above for the two build-time notes found on the same page: manual linking OFF→ON at #3, `email_confirm: true` in provision-users).
6. **Edge-Function login** replaces the anon ID→email lookup RPC (email never exposed; rate-limit point).
7. **Edge Function hardening checklist** (applies to `provision-users`, `admin-reset-password`, login fn): verify caller's **admin role from the JWT inside the function** (not just "authenticated") · CORS locked to prod origin + localhost dev · service-role key only in function secrets · log every provision/reset (audit trail).
8. **GH Actions hygiene:** pinned action versions · `permissions: contents: write` only · never echo the connection string.
9. **Backup scope = full DB incl. `auth` schema** — accounts are re-provisionable but don't discover scope gaps during a disaster. ❓ Verify whether Supabase Storage holds M3 uploaded files; if yes, plan storage backup separately.

Accepted residual risks (named, not mitigated): TOTP is app-gate only (no `aal2` RLS — REST bypass possible with a stolen password; optional later upgrade: enforce `aal2` for admin role only) · no self-service reset (break-glass = Supabase dashboard) · credential sheets handed out per-person, never one master sheet.

### 💰 Paid-tier upgrades — STRONGLY NOTED *(2026-06-12; user open to GitHub / Supabase / Google Cloud annual plans — CEO negotiation possible)*
Two cost-adjacent caveats from the security review would be materially improved by paid tiers. **Neither blocks go-live** — the free plan above is sound — but both are worth the negotiation:

| Upgrade | ~Cost | Security gained |
|---------|-------|-----------------|
| **Supabase Pro** (top pick) | $25/mo ≈ $300/yr | **Managed daily backups by Supabase** (7-day retention — independent second backup line beside our GH Action, different failure domain) · **leaked-password protection** (HaveIBeenPwned check on every password set — directly hardens the new ID+password login) · no free-tier project pausing risk · 8 GB DB headroom · PITR available as add-on later |
| **GitHub Team** | $4/user/mo | **Branch protection on private repos** — locks the backup repo's workflow file so a compromised/secondary account can't silently edit the Action to exfiltrate the connection string; required reviewers on `hubble-wms` deploys |
| Google Cloud | n/a | No paid need identified — OAuth client is free; nothing in the current plan benefits |

**Recommendation to take to the CEO: Supabase Pro first** (managed backups + HIBP directly address the two biggest residual risks), GitHub Team second, Google Cloud not needed. Repo-growth caveat (≈365 MB/yr of encrypted dumps vs GitHub's 5 GB soft cap) stays manageable for years on free; orphan-commit rotation is the free fix if ever needed.

Carried decisions still open: annual-leave-reset automation & pro-rating rules (R18 note) · FX rate source (R9-06).

---

## 🟢 Future roadmap (post-go-live — not blocking launch)

### CLIENT-01 · Client account management *(logged 2026-06-15 — future)*
**What it is:** a *separate* account-management surface for **client logins**, distinct from Employee account management. Today only client **company records** exist (`clients` table + [js/pages/clients.js](js/pages/clients.js) — name / address / currency, used to tag projects); the RBAC's 5th role **`client`** (owner/admin/manager/member/client) is **dormant** — never wired into login or provisioning.
**Approach when built:** reuse the Employee-account pattern — admin-guarded Edge Functions (provision / reset password / deactivate, mirroring `admin-set-account-active`) to issue client logins, linking a `clients` row → an auth user — plus **new RLS** scoping a `client` session to **only its own** projects / timesheets / expenses / documents (read-mostly). Likely its own management tab, **not** folded into the Employees page (external data scope ≠ staff).
**Prereq / cross-ref:** the 5-role reconciliation flagged in [HE_WMS_Specification.md](HE_WMS_Specification.md) §3 / §14 (the WMS 5-role matrix vs. the app's `owner/admin/manager/member/client` tiers).
**Status:** 🟢 future — not blocking go-live; sequence after the roster swap (checklist #6).

---

## ✅ Phase 5 carry-forward — COMPLETE (2026-06-10)

### ✅ P5-CF-01 · Smoke-test sign-off (P5-V checklist)
Original 10-item end-to-end checklist never formally ticked. Verify with a logged-in account:
- Submit expense → approve → PETTY CASH balance drops
- "Other" category → required details captured in note
- Record top-up → balance rises; non-admin blocked
- Mileage claim (car, round-trip) → preview correct; approve → auto-posts cash line
- Mileage claim (public transport) → full amount reimbursed
- Route boxes: 2 one-way / 3 round-trip; route composed correctly
- Trip request → approve → `TR-YYYYMM-NNNN` issued
- REPORT Monthly: project/person totals, deadline banner correct
- REPORT Weekly: PT sessions correct, payout date tracks displayed week
- RLS: non-admin can't read others'; anon blocked

### ✅ P5-CF-02 · Admin edit modal: category→project lock missing *(fixed R17-03)*
R13-02 noted as follow-up: `OFFICE_CAT_NAMES` lock (category→project) was applied to MY EXPENSES submit form only. The admin `_openEditModal` doesn't enforce it — admin can pick any project regardless of category. Low risk (admin-only path), but inconsistent with submit-form behaviour.
**Files:** `js/pages/expenses.js` (`_openEditModal` form wiring).

### ⏸ P5-CF-03 · Deferred features (parked by design)

| Item | Reason |
|------|--------|
| Finance 2nd-tier approval | Admin proxies; finance role not in current `is_admin()` model |
| Timesheet "Business Trip" auto-fill on trip approval | Needs M1 rework |
| Per-entry timesheet approval for weekly wages | `time_entries` has no status column |
| Map-based distance auto-fill | Manual km entry for now |
| Receipt file upload | URL field only for now |
| Per-diem / OD-12 | Not built |
| Automated 09:30 / Monday-AM summary delivery | Parked — folds into Google Sheets auto-export |

---

## ✅ Round 47 — SPEC-M1 + SPEC-M2 + SPEC-M3 spec gap closure (2026-06-30) — cache JS `?v=111`, CSS `?v=39`

> Three spec gap items from the 2026-06-12 audit backlog closed in one session. No CSS changes; JS version bumped 110→111. **Pending user action:** apply `20260630_leave_manager_approved.sql` in prod Supabase Studio before the `manager_approved` status can be written in prod.

### ✅ R47-01 · SPEC-M1 — Leave approval tier enforcement (2026-06-30)
Two-tier leave approval flow fully wired end-to-end:
- **`js/api/leaves.js`** — `approveLeaveRequest()` now accepts 4th param `approvalTiers` (default `1`). Sets `status='manager_approved'` when tiers ≥ 2, `'approved'` for single-tier. `hrApproveLeaveRequest()` was already correct (sets `status='approved'` with HR stamps) — no change needed.
- **`js/pages/holidays-state.js`** — `STATUS_BADGE` extended with `manager_approved` → `'badge badge-pending'` (amber, same as pending).
- **`js/pages/holidays-approvals.js`** — approve button embeds `data-tiers` at render time; `.hl-approve-req` handler reads it and passes to API; AWAITING HR APPROVAL section added (conditional on `manager_approved` requests); new `.hl-hr-approve-req` handler calls `hrApproveLeaveRequest()` + `logAction`; `pendingCount` includes `manager_approved`; edit-modal save path also passes tiers.
- **`20260630_leave_manager_approved.sql`** — migration widens `leave_requests.status` CHECK to include `'manager_approved'`. ⚠️ **Must be applied in prod Studio before this flow works in prod.**
**Files:** `js/api/leaves.js`, `js/pages/holidays-state.js`, `js/pages/holidays-approvals.js`, `20260630_leave_manager_approved.sql`. Cache **JS v=110→v=111**.

### ✅ R47-02 · SPEC-M2 — HR name/job-title approval state machine (2026-06-30)
Verified: `approve_job_title_change_request` RPC in `20260629_request_review_rpcs.sql` is already atomic and admin/manager-guarded (JWT role check inside function). No additional state machine needed — SPEC-M2 satisfied by existing R44 work.
**Files:** none changed.

### ✅ R47-03 · SPEC-M3 — Notifications page sub-tab badges (2026-06-30)
Two improvements to `js/pages/requests.js`:
- **LEAVE REQUESTS badge** — previously showed total count (all statuses); now shows pending-only count with `badge-pending` styling; badge hidden when count = 0.
- **PROFILE CHANGES sub-tabs** — two stacked sections (Name Changes + Job Title Changes) converted to NAME CHANGES | JOB TITLE CHANGES sub-tab UI. `_profileSubTab` module-level variable persists active tab; `[data-psub]` buttons wired in `_render()` via `querySelectorAll`; panels shown/hidden via `style.display`.
**Files:** `js/pages/requests.js`.

### 🔴 R47-04 · Remaining actions before prod is live
1. **Apply `20260630_leave_manager_approved.sql` in prod Supabase Studio** — widened CHECK constraint required before any `manager_approved` writes succeed.
2. **F-01 (P0)** — authenticated production client RLS probe (user action: needs prod client creds). Provision test client → log in → verify own-scope-only, 0 cross-client, 0 employee PII, writes denied.
3. **Roster swap** (go-live checklist #6, RSK-0, 3 confirms) — after F-01 passes.

Commit `7884171`. Cache **JS v=111 / CSS v=39 / tokens.css v=22**.

---

## ✅ Round 45 — Client logins UX + comprehensive audit log (2026-06-29) — cache JS `?v=109`, CSS `?v=38`

> Large session. Two major deliverables: (1) client logins modal polish — copy credentials, reset pw, delete row, modal widened; (2) full audit log system built end-to-end. The `20260629_audit_log.sql` migration is the remaining user action before the audit log is live in prod. **Do-first next time:** apply `20260629_audit_log.sql` in prod Studio → verify admin logs page → then F-01 (P0) authenticated prod client RLS probe (go-live gate).

### ✅ R45-01 · Client logins modal UX improvements *(2026-06-29)*
Three additions to the admin "Manage logins" modal in `clients.js`: (1) **Copy credentials button** — after provisioning a client the modal now shows a ⧉ button that copies the client_code + temp password as formatted text; (2) **Reset pw** row action — admin can reset a provisioned client's password (calls `provision-client` Edge Fn with `action:'reset'`, shows new temp pw); (3) **Delete row action** — removes a client login (calls `provision-client` with `action:'delete'`). Modal widened from `modal-md` to `modal-lg` to accommodate the wider credential display. Fixed a cache-bust issue (client_code fetch on modal open). Cache **JS v=107→v=108**.
**Files:** `js/pages/clients.js`, `app.html` (V bump). Commits `c8539aa` `d377065` `d9abfc5`.

### ✅ R45-02 · Comprehensive audit log system *(2026-06-29)*
End-to-end audit trail covering all admin/manager actions across the app. Components:
- **`20260629_audit_log.sql`** — new `audit_log` table (id, entity_type, entity_id, actor_id, action, old_values, new_values, created_at); RLS owner/admin read-only; ⚠️ **NOT YET APPLIED in prod Studio** (must apply before the admin page is live).
- **`js/api/auditLog.js`** — fire-and-forget `logAction({ entityType, entityId, action, oldValues, newValues })` helper (best-effort, errors logged but not surfaced to UI).
- **`js/pages/adminLogs.js`** — new admin-only page: entity-type filter, actor picker, date-range filter; paginated table with colour-coded action badges; uses `logAction` format.
- **`app.html`** — `#admin-logs` added: route, nav entry (admin-only, in sidebar), `routeAllowed` guard, `wmsRoutes` (SHOW MORE auto-expand); V bumped 108→109.
- **`employees.js`** — new History tab reads `employee_audit_log` (own record for employees; full log for admin); `logAction` wired on provision/reset-pw/clear-2FA/deactivate/reactivate.
- **`clients.js`** — `logAction` on: create/update/archive/restore/delete client + provision-login/reset-login-pw/delete-login.
- **`holidays-approvals.js`** — `logAction` on approve/reject leave request + flex swap.
- **`expenses-approvals.js`** — `logAction` on approve/reject expense/claim/trip + settlement.
- **`requests.js`** — `logAction` on approve/reject deletion/name-change/job-title-change.

Cache **JS v=108→v=109 / CSS v=35→v=38**. Commit `dc47bd7`.

### 🔴 R45-03 · Remaining — F-01 (P0) still the go-live gate
1. ✅ **`20260629_audit_log.sql` applied in prod Studio** — 2026-06-29.
2. **F-01 (P0)** — authenticated production client RLS probe (user-only: needs prod client creds + Studio). Provision a test client in prod → log in on Client tab → verify My Portal shows own-scope-only, 0 cross-client, 0 employee PII, writes denied. This is the last gate before provisioning a real external client.
3. **Roster swap** (go-live checklist #6, RSK-0, 3 confirms) — after F-01 passes.

---

## ✅ Round 44 — F-05 + F-08 + F-09: atomic RPCs + select minimization + CI (2026-06-29) — cache JS `?v=107`

> Three deferred audit items from R40-09 cleared in one session. All code changes committed and pushed; no migration required in prod for F-08/F-09 (SQL-only for F-05). F-05 migration needs Studio apply before the RPC path is exercisable in prod.

### ✅ R44-01 · F-05 — atomic request-review RPCs *(2026-06-29)*
New migration `20260629_request_review_rpcs.sql` (three `SECURITY DEFINER` RPCs):
- `approve_deletion_request(p_req_id uuid)` — atomically approves + executes the deletion
- `approve_name_change_request(p_req_id uuid)` — approves + updates `employees.full_name` + `profiles.name`
- `approve_job_title_change_request(p_req_id uuid)` — approves + updates `employees.job_title` + JTCR row

Each function checks `get_my_role() IN ('owner','admin','manager')` inside the function (not just RLS). `requests.js` multi-step client-side approval flows replaced with `supabase.rpc(...)` calls. `jobTitleRequests.js` similarly rewired.
**Files:** `supabase/migrations/20260629_request_review_rpcs.sql`, `js/pages/requests.js`, `js/pages/jobTitleRequests.js`. Commits `04180d7` `a81ed89`.

### ✅ R44-02 · F-08 — replace `select('*')` with explicit columns *(2026-06-29)*
- `js/auth.js` profiles fetch: was `select('*')` → now `select('id, name, role, employee_id, preferences, avatar_url')`.
- `js/pages/employees.js` compensation fetch: was `select('*')` → explicit salary/rate columns.
All consumers audited — no regressions; `profile` object shape unchanged (fields present in both old and new).
**Files:** `js/auth.js`, `js/pages/employees.js`. Commit `04180d7`.

### ✅ R44-03 · F-09 — ESM syntax check + assign modal improvements *(2026-06-28)*
Added an ESM parse-check step (verify all page modules import clean); used during session verification. Projects assign modal: member + group search bars (carried forward from R43 as explicit F-09 improvement).
**Files:** `js/pages/projects.js`. Cache **JS v=105→v=107**. Commit `04180d7`.

---

## ✅ Round 43 — Module splits + UX batch (2026-06-25 to 2026-06-26) — cache JS `?v=105`, CSS `?v=35`

> Large refactor + polish session. Both monolithic files split into focused sub-modules. Projects assign modal gained search/filter. Multiple mobile + UX fixes shipped. All changes committed and pushed; prod serves v=105.

### ✅ R43-01 · expenses.js code split *(2026-06-25)*
Monolithic `expenses.js` (2,323 lines) split into 5 focused modules: `js/pages/expenses-state.js` (shared state, constants, helpers), `js/pages/expenses-forms.js` (MY EXPENSES tab + submit flow), `js/pages/expenses-approvals.js` (APPROVALS tab), `js/pages/expenses-approvals-modal.js` (approval modal), `js/pages/expenses.js` (coordinator, imports + re-exports). Each module passes ESM `node --check`.
**Files:** `js/pages/expenses*.js`. Commits `51af2d1` `93001cd`.

### ✅ R43-02 · holidays.js code split *(2026-06-25)*
Same pattern: `holidays-state.js` / `holidays-forms.js` / `holidays-approvals.js` / `holidays-approvals-modal.js` / `holidays.js` coordinator. 2,308-line file split into 5 modules, each parse-clean.
**Files:** `js/pages/holidays*.js`. Commits `39d1ac6` `7d54597`.

### ✅ R43-03 · Help page polish *(2026-06-25 to 2026-06-26)*
- **EN/TH language toggle** — button in the Help page header switches all static content between English and Thai (`6d1feaa`).
- **Section headers highlighted** — `<h3>` within help cards now use accent colour for better scannability.
- **Card text muted** — non-header body text uses `--text-secondary` for lower visual weight.
**Files:** `js/pages/help.js`. Commits `6d1feaa` `ae6ab3e`.

### ✅ R43-04 · Projects assign modal: search + filter + select-all *(2026-06-26)*
The assign-members modal in Projects now has: **member search bar** (filters by name/ID), **group filter** dropdown (narrows the member list to one department/group), **select-all** buttons for both member and group sections. Cache **JS v=102→v=105** (first bump this session). Fixed the search-icon/placeholder overlap caused by the high-specificity input rule (must use full `padding` shorthand, not `padding-left` alone — rule documented in CLAUDE.md).
**Files:** `js/pages/projects.js`, `app.html` (V bump). Commits `9db1efc` `d893061` `f31f184`.

### ✅ R43-05 · Mobile + polish fixes *(2026-06-26)*
- Mobile sidebar overlay fix (tap-outside closes drawer) — `app.html` (`6d1feaa` part).
- Avatar/user row pinned to bottom of mobile sidebar drawer (`0e1895f`).
- Apostrophe escape in petty cash error string (`e4419fc`).
- Petty cash top-up placeholder updated to ฿15,000 (`aa9ba44`).
- Sidebar footer sticky on all viewports — `position: sticky; bottom: 0` + backdrop (`450538b`).
**Files:** `app.html`, `js/pages/expenses.js`.

---

## ✅ Round 42 — Help page (2026-06-25) — cache JS `?v=102`, CSS `?v=35`

> Built and shipped the bilingual Help page — the last closeout item before roster swap. Fixed a missing `wmsRoutes` entry that prevented SHOW MORE from auto-expanding on direct navigation to `#help`. Deleted the stale branch `claude/remaining-tasks-qdlo4e`.

### ✅ R42-01 · Bilingual Help page *(2026-06-25)*
New `js/pages/help.js` — static, no network calls. User Guide tab (all roles): Getting Started, Daily Use, Approvals (manager/admin only), Account & Security. Admin Guide tab (admin-only): Employee Management, Document Templates, Expenses & Petty Cash, System Setup. All content bilingual EN/TH. Nav item + route wired in `app.html`; `#help` added to `wmsRoutes` so SHOW MORE auto-expands when navigating directly to `#help`.
**Files:** `js/pages/help.js`, `app.html`

---

## ✅ Round 40 — full-project audit (2026-06-17) remediation PUSHED LIVE — cache JS `?v=99`, CSS `?v=34`

> Worked the [AUDIT_2026-06-17_FULL_PROJECT.md](AUDIT_2026-06-17_FULL_PROJECT.md) remediation list end-to-end: fixed every code-fixable finding, verified locally + in-browser, committed (`b647cdd`), and pushed to prod (GitHub Pages now serves `?v=99` — confirmed live). **Do-first next time:** the **F-01 (P0)** authenticated PRODUCTION client RLS probe — it is the remaining go-live gate before any real external client is provisioned, and no code change closes it (needs prod client creds + Studio). After that: the deferred items (F-05/F-08/F-09 + module splits) and the existing closeout → roster-swap path.

### ✅ R40-01 · F-02 — clientPortal display/export scoped to known client projects *(2026-06-17)*
`render()` now fetches the project **summary first** (the authoritative list of the client's own projects), then fetches expense/travel detail rows scoped with `.in('project_id', projectIds)` as defence-in-depth (RLS still authoritative; empty project list → no detail fetch). Introduced a single `_buildRows()` that includes only rows whose `project_id` is a known client project; **both** the rendered table and the text export now route through it (export previously iterated raw `_expenses`/`_trips`).
**Files:** `js/pages/clientPortal.js`

### ✅ R40-02 · F-03 — router async error boundary *(2026-06-17)*
`_dispatch()` now wraps the route handler as `Promise.resolve().then(handler).catch(_renderRouteError)`. A failed dynamic import / thrown render error renders a recoverable empty-state panel (message + Retry) and fires `showToast`, instead of leaving `#content` blank with an unhandled promise rejection.
**Files:** `js/router.js`

### ✅ R40-03 · F-04 — document-template HTML hardening *(2026-06-17)*
New `sanitizeHtml()` in `format.js` (DOM-parser based): strips `<script>/<iframe>/<object>/<embed>/<link>/<meta>/<base>/<form>` + form controls, all `on*` handler attributes, `javascript:` in href/src, and `expression()`/`javascript:` in inline styles — while preserving the formatting tags + inline styles templates rely on. Applied at the `resolveTemplate` choke point (covers the live preview AND the stored/printed `content_html`) and in `_samplePreview` (edit-modal preview). Merge **values** were already `esc()`'d; this hardens the surrounding template markup.
**Files:** `js/format.js`, `js/api/documents.js`, `js/pages/documents.js`

### ✅ R40-04 · F-06 — route-role matrix *(2026-06-17)*
Added a `routeAllowed` map in `app.html` (`#reports` → owner/admin/manager, `#clients` → owner/admin/manager, `#employees` → owner/admin) mirroring `applyRoleVisibility()`. A hand-typed hash for a restricted page now toasts + bounces to `#calendar` instead of rendering an empty/partial page. RLS stays the real boundary; this aligns UX with intent.
**Files:** `app.html`

### ✅ R40-05 · F-07 — escaping helper consolidation *(2026-06-17)*
Strengthened the shared `format.js` `esc` to also escape `'` (`&#39;`) — making it a superset of every former local copy (so the swap can't weaken single-quoted-attribute safety) — then removed all **13** local `_esc`/`_attr` definitions and rewired ~350 call sites to the shared `esc`/`attr`. Done via 4 parallel subagents over distinct file sets; every file parse-verified as an ESM.
**Files:** `js/format.js` + `calendar.js` `clientPortal.js`(prior) `clients.js` `dashboard.js` `documents.js` `employees.js` `expenses.js` `holidays.js` `projects.js` `reports.js` `requests.js` `tags.js` `team.js` `timesheet.js` `components/prefsModal.js`

### ✅ R40-06 · F-12 — native prompt() → modal *(2026-06-17)*
New `promptModal()` (promise-returning textarea dialog, house Modal Pattern, Esc/backdrop = null) added beside `confirmModal`. The 3 native `prompt('Rejection reason…')` calls in `requests.js` (deletion/name-change/job-title reject) now use it.
**Files:** `js/components/confirmModal.js`, `js/pages/requests.js`

### ✅ R40-07 · F-13 — pin Supabase CDN *(2026-06-17)*
`config.js` import pinned from the floating `@supabase/supabase-js@2` to exact `@2.108.2` (== what `@2` resolved to at pin time, so behaviour-preserving). Verified live: app loads its full module graph with 0 console errors.
**Files:** `js/config.js`

### 🔴 R40-08 · F-01 (P0) — production authenticated-client RLS probe — STILL THE GO-LIVE GATE
The client portal is live, but logged-in client isolation has only been proven on the **scratch** project (Phase-5 green via `20260707`). Prod anon probe is 45/45, but **no authenticated client probe has run against prod**. Before provisioning any real external client: run a prod client probe with ≥2 test clients (own company/projects/detail/summary only; 0 cross-client; 0 employee PII/comp/leave/eval/HR-docs/petty-cash/templates; writes denied; admin/manager/member still work). User-only (needs prod client creds + Studio).

### ⏸ R40-09 · Deferred audit items (surfaced, not built)
- **F-05** — move multi-step request-review writes (deletion-approve, name-change-approve, job-title-approve in `requests.js`/`jobTitleRequests.js`) to guarded RPCs/Edge Fns for atomicity (like `approve_trip_settlement`). Needs a new migration applied in Studio.
- **F-08** — replace `select('*')` (auth.js profiles, employees comp, requests rows) with explicit field lists. Regression-risky on the widely-consumed `profile` object → needs a field-usage census first.
- **F-09** — minimal CI quality gate (ESLint, ESM parse script, Deno/TS check for Edge Fns, Playwright smoke, GitHub Action).
- Split `expenses.js` (2,153 lines) / `holidays.js` (2,086) into workflow modules.

## ✅ Round 39 — CLIENT-01 Phase 5 audit + coordinated deploy LIVE + search-icon fix — 2026-06-17 — cache JS `?v=98`, CSS `?v=34`

> CLIENT-01 went **fully live in prod** this session. The Phase-5 RLS audit ran on the scratch project, found + fixed two pre-existing client-boundary leaks (`20260707`), then the coordinated deploy shipped (migrations + Edge Fns + frontend), followed by a small UI fix. **Do-first next time:** the in-app **live client smoke** (admin adds a client login → log in on the Client tab → My Portal shows own-scope-only, read-only) before provisioning any real client → then closeout (templates · leave pro-rating · Help page) → roster swap (LAST).

### ✅ R39-01 · CLIENT-01 Phase 5 — client-role RLS audit on scratch *(2026-06-17)*
Seeded two client companies (A/B) + projects/time/expense/travel + 2 client logins on the scratch project (`jnozvyuqackzrolhyufa`). New gitignored probes: `anon_probe.scratch.ps1` (**45/45 PASS**, incl. `get_client_project_summary` blocked for anon), `client_probe.ps1` (authenticated client A), `seed_client_fixtures.sql`. **`20260706` scoping verified correct** — own-scope exact, **0 cross-client rows**, summary leaks no other-client hours, **all writes denied** (DB-verified). **Found 2 gate-blocking leaks** from pre-existing blanket `auth.uid() IS NOT NULL` SELECT policies the new `client` role reached: **CLIENT-PROF** (client read ALL profiles = employee PII + other clients' contacts/codes) + **CLIENT-PCS** (`petty_cash_settings`); plus Low **CLIENT-META** (group_members / task_assignments / evaluation_cycles / evaluation_questions / document_templates).
**Files:** `supabase/probes/{anon_probe.scratch.ps1,client_probe.ps1,seed_client_fixtures.sql}`, `AUDIT_2026-06-16_CLIENT01_PHASE5.md`

### ✅ R39-02 · Phase-5 remediation `20260707` + re-verify green *(2026-06-17)*
New migration `20260707_client_read_hardening.sql` — `ALTER POLICY … USING` (not DROP/CREATE → avoids the M-REGRESS class) appending `AND COALESCE(get_my_role(),'') <> 'client'` to 7 policies; `profiles_select` keeps `OR id = auth.uid()` so a client still reads its own row. Applied to scratch + re-probe: anon **45/45**, client probe **0 FAIL** (profiles→1, petty_cash→0, metadata→0). DB-level regression (via `request.jwt.claims`): a **member** still reads profiles=7 / petty_cash=1 / group_members=6 (unchanged) while a **client** reads 1/0/0 — fix is client-only.
**Files:** `supabase/migrations/20260707_client_read_hardening.sql`

### ✅ R39-03 · CLIENT-01 coordinated DEPLOY — LIVE in prod *(2026-06-17, commit `c0e7fdc`)*
Executed in order: (1) migrations `20260706` + `20260707` applied in prod Studio (user-verified quals); (2) Edge Fns deployed via CLI — **`provision-client` (NEW → 7 total)** + **`login` redeployed `--no-verify-jwt`** (now accepts `identifier`: email / client-code / employee-id; backward-compat `employee_id` kept); (3) frontend pushed (v=97). **Verified live:** login smoke **401** on both `identifier` and `employee_id` (no regression), prod serves v=97, **prod anon probe 45/45 PASS**. Prod migrations now through `20260707`; Edge Fns **7 deployed**.
**Files:** `app.html`, `index.html`, `js/pages/clientPortal.js`, `js/pages/clients.js`

### ✅ R39-04 · Remove magnifier icon from Clients search box *(2026-06-17, commit `6690861`)*
The shared `.search-input` SVG magnifier overlapped the placeholder on the Clients page. Dropped the `<svg>` + `search-input` class for **that one box only** (team/projects/tags keep theirs). Cache **JS v=97→v=98**; pushed + verified prod serves v=98.
**Files:** `js/pages/clients.js`, `app.html`

### 🟡 R39-05 · Remaining / carried
- **Live client smoke** (user, in-browser) — the last gate before provisioning a real client.
- **Rotate scratch creds** — anon + service_role keys **and** DB password were pasted in chat this session (`supabase/probes/.scratch.env.ps1` holds them, gitignored).
- Chores: **M-PWPOL** (dashboard min-pw-length), watch backups repo, **delete scratch project** (now safe — Phase 5 done), move `age-key.txt` offline + rotate age keypair.
- Then **closeout** (template wording · leave-reset/pro-rating · bilingual Help page) → **roster swap** (LAST, RSK-0, 3 in-session confirms).
- ℹ️ Known limitation: client provisioning writes no audit row (`employee_audit_log` is FK'd to `employees`) — revisit later.

---

## 🟡 Round 38 — Audit-queue closeout + backup Phase 2 + CLIENT-01 (plan + Phases 0–4) — 2026-06-16 — cache JS `?v=97` (LOCAL/uncommitted; prod v=96), CSS `?v=34`

> Large session. Audit Medium queue fully closed and the two go-live blockers (v=95 push, restore Phase 2) cleared. CLIENT-01 reprioritized to 1st and built through Phase 4 — **not deployed/committed** (prod unaffected, client role dormant). **Do-first next time:** the coordinated CLIENT-01 deploy + the Phase-5 RLS audit (R38-06), then closeout → roster swap.

### ✅ R38-01 · v=95 pushed (M-DATE + M-SETTLE) *(2026-06-16)*
Committed + pushed the R37 frontend after re-verifying 5 contracts (RPC live, parse-clean, caller dropped `actorId`, **RPC arg `p_trip_id` matches**). Prod deploy verified (polled `app.html` → `?v=95`). Frontend/backend skew resolved.
**Files:** `app.html`, `js/api/expenses.js`, `js/pages/expenses.js`, `js/pages/documents.js`, `js/pages/holidays.js`. Commit `ae56a51`.

### ✅ R38-02 · Backup restore drill Phase 2 PASSED *(2026-06-16)*
Live apply of `wms_20260616.sql.gz.age` into a fresh scratch Supabase project (`wms-restore-drill`, `jnozvyuqackzrolhyufa`) via Session-pooler + `psql 17`. **Public schema fully restored** — 39 tables / 136 policies / 35 functions (incl. `approve_trip_settlement`); row counts verified. **Findings (documented in backups/README.md):** (1) ⚠️ restoring as pooler `postgres` gets **app data only — `auth` schema does NOT restore** → real DR must re-provision logins via `provision-users`; (2) cosmetic — pooler rejects pg_dump 17 `\restrict`/`\unrestrict` + desyncs on auth COPY (public unaffected).
**Files:** `supabase/backups/README.md` (checklist #9 ✅ + Phase-2 findings).

### ✅ R38-03 · Audit Tier-2/3 frontend — M-DSUB / M-SILENT / M-APPROVE (v=96) *(2026-06-16)*
M-DSUB: the 5 leave/flex/wfh/team submit buttons disable synchronously on first click (re-enable on error). M-SILENT: `_loadApprovals`/`_loadPettyCash` stop swallowing fetch errors (`.catch(()=>[])` removed) → visible "Couldn't load… Retry" empty-state (new `_loadErrorHtml`). M-APPROVE: "Save & Approve" checkpoints `item.status` per stage → clean retry, no stranding. Cache **JS v=95→v=96**. Verified module-import clean. Pushed + prod verified v=96.
**Files:** `js/pages/holidays.js`, `js/pages/expenses.js`, `app.html`. Commit `8f732e0`.

### ✅ R38-04 · Audit DB — M-JTCR / M-PROF / M-EVR *(2026-06-16)*
`20260704_with_check_hardening_round2.sql`: `ALTER POLICY` adds `WITH CHECK` to `profiles_update_own` + `evr_update`; splits `jtcr_own` FOR ALL → granular `jtcr_select_own`/`jtcr_insert_own`(status='pending')/`jtcr_cancel_own`(pending→cancelled). **Applied in Studio + anon probe 44/44** (validated on scratch first). Owner DELETE intentionally dropped (no app path).
**Files:** `supabase/migrations/20260704_with_check_hardening_round2.sql` (**new**).

### ✅ R38-05 · M-RATE — app-level login rate-limit *(2026-06-16)*
`20260705_login_attempts.sql` (table, RLS-on/0-policies = service-role-only, 3 indexes). `login` Edge Fn given a **fail-open** per-ID/IP limiter (≥10 fails in 15 min → 429; records on 401 paths; clears on success; >24h prune; all wrapped so a limiter fault never blocks real login). **Applied + deployed (`--no-verify-jwt`) + verified on prod** (bad creds 401; 11-attempt loop → 401×9 then 429; IP-keying confirmed). **Gotcha:** the initial "500" was a PowerShell/curl JSON-quoting artifact, not a code bug — pass body via temp file.
**Files:** `supabase/migrations/20260705_login_attempts.sql` (**new**), `supabase/functions/login/index.ts`. → **Entire Medium audit queue closed** (M-PWPOL dashboard setting + Tier-4 lows remain).

### 🟡 R38-06 · CLIENT-01 — plan approved + Phases 0–4 BUILT *(2026-06-16)*
User moved CLIENT-01 to **1st priority**. Confirmed design: client ID **`XX-0-NNN-CC`** per-user (XX=company letters, MOD-97-10 CC); **login by client ID or email** (one page, **Employee/Client toggle** — employee field stays numeric); **read-only**; project **summary** hours (no raw time entries) + **detailed** expenses/travel (employee identity masked); ships **before roster swap**.
- **Phase 0/1** — `20260706_client_id_and_rls.sql` (clients.client_prefix; profiles.client_code(+normalized); `client_check_digit`; `compute_client_code` trigger BEFORE INSERT OR UPDATE; `is_my_client_project`; client read branch on `ct/tc/trq` SELECT; `get_client_project_summary` RPC). **Scratch-validated** end-to-end (two users of one company → `AC-0-002-25` / `AC-0-003-22`). Finding: an `on_auth_user_created` trigger auto-makes a `member` profile → client provisioning **UPDATEs** it (not INSERT).
- **Phase 2** — `login/index.ts` generic identifier (email/client-ID/employee detect, M-RATE intact); new `provision-client/index.ts`; `index.html` Employee/Client toggle. Login page browser-verified.
- **Phase 3** — `clientPortal.js` (summary cards + hours bar chart + masked expense/travel + export-text/print); `clients.js` admin **"Manage logins"** modal (provision via `provision-client` → shows temp pw + client_code once).
- **Phase 4** — covered by construction: router guard bounces clients off non-portal routes; nav hides all but "My Portal"; client default route.
- Cache **JS v=96→v=97** ⚠️ **LOCAL + UNCOMMITTED** (prod v=96). Migration `20260706` + Edge Fns NOT applied/deployed to prod. All modules parse-clean + import (`render=function`); app.html boots clean. Audit-log gap: client provisioning has no audit row (employee_audit_log is FK'd to employees).
**Files:** `supabase/migrations/20260706_client_id_and_rls.sql` (**new**), `supabase/functions/login/index.ts`, `supabase/functions/provision-client/index.ts` (**new**), `index.html`, `js/pages/clientPortal.js` (**new**), `js/pages/clients.js`, `app.html`. Plan: `~/.claude/plans/allow-clients-to-floofy-axolotl.md`, `CLIENT-01_PLAN.md`.

### 🔴 R38-07 · Remaining (do-first next time)
1. **CLIENT-01 coordinated deploy:** apply `20260706` in Studio → deploy `login` (`--no-verify-jwt`) + `provision-client` → commit + push frontend (index.html toggle + v=97 app.html/clientPortal.js/clients.js) **together** (not before) → smoke all login paths (employee/client/email/bad/lockout via temp-file JSON).
2. **CLIENT-01 Phase 5 RLS audit** (can run on scratch): seed a test client + user, prove client reads ONLY own scope (no cross-client, no raw time_entries, no employee PII/leave/eval), no writes; extended anon_probe + authenticated-client probe.
3. **M-PWPOL** — set Supabase Auth min password length (Dashboard, user). **Step 6–8** user actions (live RLS check, scratch-project delete, repo Watch, age-key offline, keypair rotation).
4. Then **closeout** (Help page, template wording, leave-policy, structure resync) → **roster swap** (RSK-0, 3 confirms).

---

## ✅ Round 37 — R36-audit remediation (M-DRIFT/M-REGRESS · doc hygiene · M-BKUP · M-DATE · M-SETTLE) — 2026-06-15 — cache JS `?v=95` (UNPUSHED), CSS `?v=34`

> Executes the R36 deep-audit queue. **Local only — nothing pushed** (prod stays v=94). Migrations `20260702` + `20260703` applied in Studio + verified. Restore-drill Phase 2 + repo-watch + the v=95 push remain.

### ✅ R37-01 · M-DRIFT verified live + `schema.sql` reconciled *(2026-06-15)*
Corrected `pg_policies`/`pg_proc`/`pg_indexes` checks: all 6 `20260701` WITH CHECK policies + 4 helper `search_path` + `uq_cash_txn_settlement_per_trip` confirmed live → `20260701` fully applied. Back-ported the WITH CHECK + helper `search_path` + settlement index into `schema.sql`; fixed the `20260701` "NOT YET APPLIED" header. Audit query bug fixed (3rd table was the phantom `fiscal_holiday_settings`; real policy `fhs_update` on `flex_holiday_swaps`).
**Files:** `supabase/schema.sql`, `supabase/migrations/20260701_update_with_check_hardening.sql`, `AUDIT_2026-06-15_FULL_AUDIT.md`.

### ✅ R37-02 · M-REGRESS — restore user-cancel/settlement RLS *(2026-06-15)*
Verification surfaced that `20260701` §4 had reverted `ct/tc/trq` to admin/manager-only, dropping the `20260622` owner self-cancel + owner-approved (settlement-submit) grants in live → employees couldn't cancel own pending items or submit trip settlement (pre-roster-swap, not user-hit). Fix: `20260702_restore_user_cancel_rls.sql` — **applied + verified** (owner branch back in `pg_policies`; anon probe 43/43).
**Files:** `supabase/migrations/20260702_restore_user_cancel_rls.sql` (**new**), `supabase/schema.sql`.

### ✅ R37-03 · Doc hygiene *(2026-06-15)*
Refreshed stale rows (login overhaul = LIVE, R25 RLS sweep = done — were "NEXT"/"on hold"); merged the 2026-06-12 backlog into the canonical 2026-06-15 queue; archived 2 superseded plan docs (`PLAN_AUDIT_REMEDIATION_2026-06-12`, `Audit_20260612_implementation_plan`) → `Archived/`; added **CLIENT-01** (client-account mgmt) to the Master Plan dashboard; fixed the Master Plan "Next Session" block + cache version.

### ✅ R37-04 · M-BKUP closed *(2026-06-15)*
`create_backup_role.sql` now includes the `ALTER ROLE backup_role BYPASSRLS` the test run required. Corrected the backups README's **false "restore drill PASSED"** claim (user-confirmed Phase 2 never ran) → README + PENDING_TASKS + Master Plan reconciled to "Phase 1 ✅, Phase 2 pending." age-key confirmed offline.
**Files:** `supabase/backups/create_backup_role.sql`, `supabase/backups/README.md`.

### ✅ R37-05 · M-DATE — UTC date-slice off-by-one *(2026-06-15)*
14 `new Date().toISOString().slice(0,10/7)` sites → `todayISO()`/`toISODate()` across `js/api/expenses.js`, `js/pages/expenses.js`, `js/pages/holidays.js`, `js/pages/documents.js`; missing imports added; all 4 parse-clean (ESM `node --check`); 0 stragglers. Cache **JS v=94→v=95**.
**Files:** `js/api/expenses.js`, `js/pages/expenses.js`, `js/pages/holidays.js`, `js/pages/documents.js`, `app.html`.

### ✅ R37-06 · M-SETTLE — atomic settlement RPC *(2026-06-15)*
New `20260703_settlement_rpc.sql` — admin-only `approve_trip_settlement(uuid)` posts the cash correction + closes the trip in one transaction (idempotent, ICT-dated). `approveSettlement()` rewired to `supabase.rpc(...)` (dropped `actorId` → `auth.uid()`); caller updated; unused `todayISO` import removed; RPC added to `anon_probe.ps1`. **Applied in Studio + verified (`pg_proc` shows `prosecdef=true`).**
**Files:** `supabase/migrations/20260703_settlement_rpc.sql` (**new**), `js/api/expenses.js`, `js/pages/expenses.js`, `supabase/probes/anon_probe.ps1`.

### 🔴 R37-07 · Remaining before resume
1. **Push v=95** (commit + `git push`) — ships the M-DATE + M-SETTLE frontend. `20260702`/`20260703` already live in DB → no breakage window (old v=94 direct-write path still works against the unchanged tables).
2. **Backup restore-drill Phase 2** (clean apply to a scratch Supabase project) + repo **Watch** — go-live sign-off.
3. **Audit Tier-2/3 backlog:** M-JTCR · M-DSUB · M-SILENT · M-APPROVE · M-PROF · M-EVR · M-PWPOL · M-RATE · L-tier.

---

## ✅ Round 36 — Deep full audit (0 High confirmed · 11 Medium · 8 Low) + docs reconciliation — 2026-06-15 — no cache change (JS `?v=94` / CSS `?v=34`)

> Report-only session. No JS/CSS/Edge/migration/deploy changes. Multi-pass review: 6 Edge Functions read manually (Opus) + DB/RLS Sonnet agent (16 raw findings) + correctness Sonnet agent (12 raw findings) + static XSS/convention sweep. Two spend-limit agent interruptions covered by the static audit. Verdict: **0 Critical · 0 High confirmed · 11 Medium · 8 Low.** Two agent-flagged Highs downgraded to Medium after manual blast-radius verification.

### ✅ R36-01 · Authoritative consolidated audit report *(2026-06-15)*
Created `AUDIT_2026-06-15_FULL_AUDIT.md` — full security + correctness + function audit. Verdict: 0 Critical, 0 High confirmed, 11 Medium, 8 Low, 1 Resolved. Covers all 6 Edge Functions, auth/session flow, DB/RLS (49 migrations), correctness (date/TZ/money/race), and static XSS sweep. Two Sonnet-agent Highs downgraded: `jtcr_own` blast-radius = request-metadata forgery only (no auto-apply trigger; `employees` admin-only); `profiles_update_own` guard trigger blocks all sensitive columns. Static L3 (7→6 Edge Fns) resolved. Report supersedes the static-only pass; static pass stays on disk.
**Files:** `AUDIT_2026-06-15_FULL_AUDIT.md` (new), `PENDING_TASKS.md` (revision k + audit backlog section).

### ✅ R36-02 · Structure docs reconciliation *(2026-06-15)*
`HE_interactive_timesheet_plan.md` §7 fully rewritten to match disk (was frozen at core-tracker phase; now lists all 15 pages / 6 components / 12 api modules / 6 Edge Functions). `HE_WMS_Specification.md` §14 nav tree updated (M6 live, Employees tabs Directory + Account Status, REQUESTS sub-item). `CLAUDE.md` edge-fn count corrected 7→6 with all 6 named. `PENDING_TASKS.md` 3 stale "7 Edge Fns" occurrences fixed. Memory files aligned. Client account management logged as CLIENT-01 future backlog (dormant `client` role — provision/RLS scoping, post-roster-swap). Help page confirmed as user + admin manual (bilingual EN+TH, checklist #5, written last).
**Files:** `HE_interactive_timesheet_plan.md`, `HE_WMS_Specification.md`, `CLAUDE.md`, `PENDING_TASKS.md`, memory files (all docs-only, no cache change).

---

## ✅ Round 35 — Employees UX + admin batch (empSelect search · filters · deactivate · Esc · branding) — 2026-06-15 — cache JS `?v=94` / CSS `?v=34`

> User-feedback batch after the R34 Account Status tab went live. Verified (parse-clean + Edge spot-checks) and **pushed to prod 2026-06-15 (commit `3ff0449`)** — prod serves JS `?v=94` / CSS `?v=34`. New Edge Fn deployed → **6 Edge Fns** total (off-by-one note: 4 pre-R34 → +`account-activation-status` = 5 → +`admin-set-account-active` = 6; an earlier note said "7").

### ✅ R35-01 · empSelect search on Directory + Account Status *(2026-06-15)*
Replaced the Directory `<input type="search">` with the shared **`empSelect`** picker (pick → filter table to that employee; ✕ → all); added it to the Account Status tab too. Enhanced shared `empSelect` with **hyphen-tolerant** matching (ID typed with/without hyphens resolves; additive — other pages unaffected). **Files:** `js/pages/employees.js`, `js/components/empSelect.js`.

### ✅ R35-02 · empSelect arrow/✕ side-by-side + dark-theme arrow *(2026-06-15)*
Native datalist ▾ overlapped the ✕ → now **side-by-side**: ✕ pinned far right (`right:8px`), arrow shifted left (`::-webkit-calendar-picker-indicator { margin-right:28px }`) + `filter:invert(0.8)` for dark theme; input `padding-right:50px`. Shared `.emp-select-wrap` CSS → applies to **every** picker. **Files:** `css/style.css` (CSS `?v=31`→`?v=34`).

### ✅ R35-03 · Account Status filters + Deactivate/Reactivate account *(2026-06-15)*
Account Status tab gains **activation-state** + **department** filters. New admin **Deactivate/Reactivate account** (modal footer, reversible) → new Edge Fn **`admin-set-account-active`** (bans/unbans via `ban_duration`; admin-guarded + audit-logged); **`account-activation-status`** extended to return `banned_until` → **"Deactivated"** badge. Both deployed to prod (**6 Edge Fns** total). **Files:** `supabase/functions/admin-set-account-active/index.ts` (new), `supabase/functions/account-activation-status/index.ts`, `js/pages/employees.js`.

### ✅ R35-04 · Stale-state auto-refresh + tab persistence + provision guard *(2026-06-15)*
After provision/save/deactivate the in-memory roster + active tab **auto-refresh** (`_refreshEmployees()`) — no manual reload. **Active tab persisted** in `sessionStorage`. Provision **guards a missing work email** with a clear message. **Files:** `js/pages/employees.js`.

### ✅ R35-05 · Esc closes all modals (global handler) *(2026-06-15)*
One global capture-phase `keydown` handler in `app.html` clicks the topmost `.modal-backdrop` → closes any modal (verified every project modal closes on backdrop-click; `confirmModal`'s own Esc preempted, no double-close). Removed the redundant per-modal Esc from the employee modal. **Files:** `app.html`, `js/pages/employees.js`.

### ✅ R35-06 · Branding: title, favicon, login titles *(2026-06-15)*
Page `<title>` → **"Hubble Engineering WMS"** (app + login); **favicon** → inline-SVG capital **H**; login main title → **"Workforce Management System"**, subtitle → **"Hubble Engineering"** (letter-spacing tightened). **Files:** `app.html`, `index.html`.

### ✅ R35-07 · CLAUDE.md prevention rules *(2026-06-15)*
Added: `empSelect` is the default for employee **search/filter** boxes (hyphen-tolerant; arrow/✕ pre-styled in shared CSS — never re-style per page); **Esc-closes-all-modals** via the global handler (modals must close on backdrop-click; no per-modal Esc).

---

## ✅ Round 34 — Admin "Account Status" tab (activation dashboard) — 2026-06-14 — cache JS `?v=93`

> Implements the approved R33 plan (`~/.claude/plans/forced-until-set-and-add-the-whimsical-prism.md`). Admins can now see which provisioned accounts haven't activated (still owe a forced password change). Built as a **page-level tab on the Employees page** (per user: "new tab"), not a list column or a separate page.

### ✅ R34-01 · New Edge Function `account-activation-status` (read-only, admin-guarded) *(2026-06-14)*
Returns `{ accounts: { <user_id>: { force_password_change, last_sign_in_at, email_confirmed_at } } }` from one `auth.admin.listUsers({ perPage: 1000 })`. Reuses the `admin-reset-password` guard scaffold (Bearer → `getUser` → `profiles.role ∈ owner/admin` else 403) + CORS; no audit insert, **no email in the payload**. **DEPLOYED to prod sjkggguedgtynktymzes** (now **5 Edge Functions**); smoke-test **401** unauthenticated = healthy. No DB/RLS change.
**Files:** `supabase/functions/account-activation-status/index.ts` (new).

### ✅ R34-02 · "Account Status" tab on the Employees page *(2026-06-14)*
Restructured `#content` into a standard tab strip — **Directory** (existing filter-bar + table, unchanged) and **Account Status** (admin-only). The panel lazy-fetches the activation map on each open (always fresh after a reset), classifies each live employee (`not_provisioned / never_signed_in / not_activated / activated`), and renders a count summary + table (Name · Employee ID · Department · Account badge · Last sign-in), attention-first; row click → existing `_openModal()` (Reset/Provision already there). Reuses `.tabs`/`.tab-btn`/`.tab-panel` CSS + `badge-rejected`/`badge-pending`/`badge-member` + `_esc`/`_attr`; hoisted the `EDGE` const to module scope. Cache JS `?v=92`→`?v=93`.
**Files:** `js/pages/employees.js`, `app.html` (V bump).
**Verified:** `import('/js/pages/employees.js?v=93')` resolves with `render=function` (0 console errors). ⚠️ Client **NOT pushed** (prod stays v=91); the Edge Fn IS live in prod (unused until the client ships). Live admin test (login → tab → provision → "Never signed in" → set pw → "Activated") is user-driven.

---

## ✅ Round 33 — Change-password dead-end fix + activation-tab plan — 2026-06-14 — no cache change (JS `?v=92` / CSS `?v=31`)

> Investigated a reported "login works, password-set submit fails" on the David Bowman test account. **The genuine bug: a stale/invalidated forced-change session.** When a tab holds an old token (e.g. the admin reset the password again elsewhere while the change-password screen was open), `updateUser` fails, `force_password_change` never clears, and the user is **trapped** on the screen with no recovery. Fixed `index.html` to recover gracefully. Also ruled out two non-bugs: the earlier "submit fails" was a **stale temp password** (prod v=91 + a fresh incognito run both went login → change → 2FA, zero errors), and **forced-until-set is correct by design** (kept as-is per user). **No cache change** — `index.html` is not `?v=`-pinned and no `js`/`css` page file changed; the edit rides the still-unpushed v=92 batch (prod stays v=91 / CSS v=31).

### ✅ R33-01 · Change-password submit recovers from a dead session *(2026-06-14)*
The forced change-password submit now classifies `updateUser` auth errors — `error.status === 401||403` or message matching `/session|jwt|token|not authenticated|missing/` — and shows **"Your session expired — please sign in again with your latest temporary password"** + auto-bounces to the login view (2 s) instead of dead-ending. Non-auth errors (reused/weak pw, rate-limit) still surface their real message. Happy path untouched (valid session → `updateUser` → `proceedAfterAuth` → 2FA). **Verified:** preview parse-clean on localhost:3030 (0 console errors, login form renders) + the classifier exercised against 7 representative Supabase error strings (4 auth → bounce, 3 non-auth → show message), all correct.
**Files:** `index.html` (change-password handler ~`:505-525`). No cache bump (not `?v=`-pinned).

### ✅ R33-02 · Diagnosis confirmed — stale temp pw + forced-until-set is intended *(2026-06-14, no code)*
A/B isolation: prod (v=91, no guards) **completed** the change, and a fresh-incognito localhost run also went login → change → **2FA** with no console/network errors → the original "submit fails" was a **stale temp password**, not a regression. Page-load routing (`index.html:349-361`) + `getAuthGate()` (`js/auth.js:146`) confirm **forced-until-set** is intended: an account that bails before setting its password is re-shown the change screen (after re-login if the session was lost) until it sets one, then never again. **Kept as-is per user.**

### ✅ R33-03 · Admin "Account Status" tab — planned, then approved + built same session (see Round 34) *(2026-06-14)*
Plan written (`~/.claude/plans/forced-until-set-and-add-the-whimsical-prism.md`): a new admin-only **"Account Status" tab** on the Employees page listing each account's activation state (*Not provisioned / Never signed in / Not activated / Activated* — badges, attention-first, count; row → existing modal for Reset/Provision), fed by a **new read-only, admin-guarded Edge Function `account-activation-status`** (reads `force_password_change` via one `listUsers()` call — no DB/RLS change, reuses the `provision-users` guard scaffold). Would bump cache v=92→v=93. User reviewed, then chose to **update docs instead of building** — pick up next session (deploy Edge Fn first, then ship client).

### ⏸ R33-04 · Parked by user — reset cooldown · force-all-to-login · prefsModal hardening
Discussed, explicitly **on hold**: (Q1) admin password-reset **5-min cooldown** (RSK-2; really a guard against the stale-temp-pw confusion, doesn't unstick a trapped account); (Q2) **force all accounts back to login** (RSK-1; a go-live tool for the roster swap / OAuth rotation, **not** a fix for stuck accounts — `force_password_change` survives re-login); and the same **dead-session hardening for `prefsModal.js`** Security-tab change (lower risk — runs inside an already-authed session).

---

## 🟢 Round 32 — App-wide centered confirm modal (replaces native `confirm()`) — 2026-06-14 — cache JS `?v=92`

> Native `confirm()` is anchored to the top of the window by Chrome/Edge and can't be centered (user request, surfaced on the Clear-2FA dialog). Added a reusable **`js/components/confirmModal.js`** (promise-returning; house Modal Pattern → centers via `.modal-backdrop`; HTML-escapes content; `danger` variant) and replaced **all 9** native `confirm()` calls. Built + verified in the preview (centered at viewport center; resolves true/false; self-removes; all 5 touched modules import clean). ⚠️ Built — **NOT yet committed/pushed** (prod stays v=91 / CSS v=31 until the next push).

### ✅ R32-01 · Reusable `confirmModal()` + swap all native `confirm()` *(2026-06-14)*
New `js/components/confirmModal.js` (imported WITHOUT `?v=` per the shared-module rule). Replaced 9 `confirm()` calls — employees ×3 (unlink / reset pw / clear 2FA), holidays ×4 (delete holiday ×2, cancel leave, cancel flex), requests ×1 (delete entity), entryModal ×1 (delete time entry). Each handler was already `async` → `if (!await confirmModal({…})) return;`. Destructive actions use the `.btn-danger` variant; `esc()` (format.js) escapes interpolated names — XSS parity with native confirm. Cache JS `?v=91`→`?v=92`.
**Files:** `js/components/confirmModal.js` (new), `js/pages/{employees,holidays,requests}.js`, `js/components/entryModal.js`, `app.html` (V bump).

### ✅ R32-02 · Password match indicator + disable-until-valid *(2026-06-14)*
Both password-set forms (`index.html` forced-change + prefs **Security tab**) now show a live **✓/✗ match indicator** under the confirm field, and the submit button (*Set password & continue* / *Update password*) **stays disabled (faded via the existing `.btn-primary:disabled` 0.6 opacity) until the password passes the policy AND the two fields match.** New `_updatePwState()` / `_updateSecPwState()` wired to both inputs; reset after a successful prefs change. Verified in preview (5-state walk — empty / valid-no-confirm / mismatch / valid+match / match-but-invalid → button + indicator correct; 0 console errors; prefsModal imports clean).
**Files:** `index.html`, `js/components/prefsModal.js`.

---

## 🟡 Round 31 — e2e fix: Edge native password-reveal eye contrast — 2026-06-14 — cache CSS `?v=31`

> Surfaced during the R30 e2e (David login): the browser-native password-reveal **eye** (Edge `::-ms-reveal`) renders **black** → near-invisible on the dark inputs. e2e otherwise PASSED this session — login (ID+password), forced password change, **2FA enroll + challenge-on-return (Bug A ✅)**, and Skip all verified working in the browser; the earlier "login failed" was a **stale temp password**, not a bug (account state + login fn proven healthy). Still open (user, optional): Bug B app.html bypass · admin Clear 2FA.

### ✅ R31-01 · Recolor native reveal-eye / clear-X *(2026-06-14)*
Added `::-ms-reveal` + `::-ms-clear` `filter: invert(0.8)` (mirrors the existing dark-theme `-webkit-calendar-picker-indicator` rule) in both `css/style.css` (in-app fields) and `index.html`'s scoped styles (login/change-pw — `index.html` does NOT load `style.css`). `color-scheme:dark` does not recolor these. **Edge-only** (Chrome/FF have no native reveal control) → not verifiable in the Chromium preview; confirm in Edge with a hard refresh. CSS `?v=30`→`?v=31`.
**Files:** `css/style.css`, `index.html`, `app.html` (cache bump).

---

## 🟡 Round 30 — Forced full pre-go-live audit (Edge Functions + R25 RLS sweep) + High/Med fixes — 2026-06-14 — no cache change (server/SQL only)

> User-forced audit gating the login-overhaul push. Full doc: [AUDIT_2026-06-14_FULL_PREGOLIVE.md](AUDIT_2026-06-14_FULL_PREGOLIVE.md). **Verdict: solid — 0 High, 2 Med (both fixed this session), 4 Low (backlog).** Covers what R28 excluded (password-policy module, `admin-clear-mfa`, Security tab) + the R25 RLS sweep. Anon probe **43/43 PASS**. ⚠️ Remaining go-live gates (apply migration + manager smoke, redeploy 4 Edge Fns, e2e, push) are below — **the push stays blocked until they pass.**

### ✅ R30-01 · M1 — `admin-clear-mfa` audit-log gap *(fixed, local — needs redeploy)*
The 4th Edge Fn deleted TOTP factors with no `employee_audit_log` entry (reset/provision log, per R28-01) → no forensic trail for an MFA clear. Added the same best-effort insert (`field_name:'mfa_cleared'`, `new_value:` employee_id, `changed_by:` admin) before the success return, in `try/catch`.
**Files:** `supabase/functions/admin-clear-mfa/index.ts` (gitignored).

### ✅ R30-02 · M2 — M4 UPDATE policies missing WITH CHECK *(fixed — needs apply)*
`ct_update`/`tc_update`/`trq_update` (`20260615_expense_travel.sql:265/277/288`) were USING-only → a manager could reshape `employee_id`/`status` unchecked. Same class as lr/fhs, but NOT in the scaffolded `20260701`. Extended `20260701_update_with_check_hardening.sql` (new §4) with symmetric WITH CHECK for all three; header count + helper section renumbered (4→5).
**Files:** `supabase/migrations/20260701_update_with_check_hardening.sql`.

### ✅ R30-03 · R28 fixes re-verified present (rewind disproven) + anon probe *(2026-06-14)*
Read all 4 Edge Fns: `login` HAS R28 L2 (minimal `{session, force_password_change}` payload) + L3 (indexed `.eq('employee_id_normalized')` lookup) — the memory "working tree rewound to R27" caveat is **false**. M1 logging present on reset/provision; `admin-clear-mfa` role gate + self-clear block present. Ran `anon_probe.ps1` → **43/43 PASS, exit 0** (anon fully blocked; 20260629+20260630 live in prod).

### 🟢 R30-04 · Lows → backlog *(2026-06-14)*
L1 Edge-Fn input validation (length caps + UUID-format) · L2 `provision-users` unbounded result set (fine at ~14 users; cap before roster grows) · L3 confirm Supabase Auth password min-length floor + enable HIBP on Pro · L4 (non-issue) client has no admin role re-check — server enforces JWT + role.

### ✅ R30-05 · Go-live gates — DONE (pushed 2026-06-14, commit 17edc56)
1. ✅ **Applied `20260701` in Studio** (incl. M4) — anon probe **43/43 PASS**; manager smoke optional (symmetric `WITH CHECK`). 2. ✅ **Redeployed 4 Edge Fns** — login v4 (`--no-verify-jwt`) / provision-users v3 / admin-reset-password v3 / admin-clear-mfa **v2 (audit-log live)**; login smoke 401 healthy. 3. ✅ **e2e** (localhost:3030): login (ID+password), forced change, **2FA enroll + challenge-on-return [Bug A]**, Skip — all verified; password policy verified (preview). *(The one "login failed" was a stale temp password, not a bug.)* **Bug B app.html-bypass ✅ and admin Clear 2FA ✅ (audit row confirmed) now also verified 2026-06-14 — full login-overhaul e2e complete.** 4. ✅ **Pushed** → prod GitHub Pages serves **v=91 / CSS v=31** + new ID+password login (verified live; no v=86). Plan `~/.claude/plans/finish-this-cheeky-mochi.md`.

---

## 🟡 Round 29 — R27 Phase-2 client hardening: password policy + strength indicator, Security tab, admin Clear 2FA, dark-input fix — committed (not pushed) 2026-06-14 — cache JS `?v=91`, CSS `?v=30`

> The Phase-2 client work built **after** the R27/R28 entries (which logged v=90) — it pushed cache to **JS `?v=91` / CSS `?v=30`** but was never logged here. All **committed** (3 commits; local `main` is `ahead 3` of origin) but **NOT pushed** — prod GitHub Pages still serves **v=86**. ⚠️ A **forced full pre-go-live audit** (4 Edge Functions + R25 RLS sweep, fix High/Med inline) now gates the push — plan `~/.claude/plans/finish-this-cheeky-mochi.md`. (The QR-scannability fix the user grouped here was already logged as **R27-04**.)

### ✅ R29-01 · Password policy module + strength indicator *(2026-06-14)*
New `js/passwordPolicy.js`: a **7-rule** checklist (12–64 chars · ≥1 uppercase · lowercase · number · symbol · no leading/trailing space · must not contain the user's ID / email-local / name parts) + a 0–4 **strength bar**, 64-char cap (bcrypt input ceiling). Wired into the forced-change view (`index.html`) and the Preferences → Security tab (`prefsModal.js`) — live feedback + a client-side `checkPassword()` gate before `supabase.auth.updateUser()`. Server floor stays Supabase GoTrue min-length; **HIBP breached-password check is a TODO gated on Supabase Pro** (`passwordPolicy.js:7`).
**Files:** `js/passwordPolicy.js` (new), `index.html`, `js/components/prefsModal.js`.

### ✅ R29-02 · Preferences → Security tab *(2026-06-14)*
New Security tab in the preferences modal: change password (with the R29-01 indicator), enroll / disable **TOTP 2FA** (multi-authenticator — clears stale unverified factors first, QR via `.src`, secret shown escaped), and Link Google. All per-user via `supabase.auth.*` (no Edge Function). Commit f009501 wired the shared policy in here.
**Files:** `js/components/prefsModal.js`.

### ✅ R29-03 · Admin Clear 2FA + new `admin-clear-mfa` Edge Function *(2026-06-14)*
4th Edge Function `admin-clear-mfa` (admin-JWT + `['owner','admin']` role check, self-clear blocked) deletes a target user's TOTP factors so a locked-out user can re-enroll; a **Clear 2FA** button in the Employees edit-modal footer (admin only, confirm dialog) calls it with the session bearer token. ⚠️ Audit found it writes **no `employee_audit_log` entry** (reset/provision do, per R28-01) — fix is gated into the pre-go-live audit (R30).
**Files:** `supabase/functions/admin-clear-mfa/index.ts` (gitignored, new), `js/pages/employees.js`.

### ✅ R29-04 · Dark-input fix — allowlist → denylist *(2026-06-14)*
Password / newer-type inputs rendered **white** (browser default) because `style.css` styled inputs via an **allowlist** of `type=` values that omitted `password`. Switched to a **denylist** (`input:not([type=checkbox]):not([type=radio])…, textarea, select`) so every input type is dark by default. Rule + rationale added to `CLAUDE.md` → "Form Inputs". CSS `?v=29`→`?v=30`. See [[feedback-dark-theme-inputs]].
**Files:** `css/style.css`, `CLAUDE.md`.

### ✅ R29-05 · Employee-ID auto-format on the login form *(2026-06-14)*
`index.html` login field accepts digits and auto-inserts the `DD-T-NNN-CC` hyphens as the user types, so the typed format always matches (the Edge Fn already normalizes both sides — R27-03).
**Files:** `index.html`.

### ✅ R29-06 · Docs/memory drift reconciled *(2026-06-14)*
Memory + `CLAUDE.md` said `v=90` / "client UNCOMMITTED" / "3 Edge Functions"; reality is **v=91** / **committed (`ahead 3`), not pushed** / **4** Edge Functions. Reconciled `MEMORY.md`, `project-wms-login-overhaul.md`, `CLAUDE.md`, and this file; marked the stale "working tree rewound to R27" caveat resolved (tree is forward at v=91).

### 🔴 R29-07 · Forced full pre-go-live audit gates the push *(next — R30)*
Per user: **no `git push` until** a full audit (4 Edge Functions + the R25 RLS sweep) is clean, fixing High/Med inline. Already found going in: `admin-clear-mfa` audit-log gap (R29-03) and **M4 `ct_update`/`tc_update`/`trq_update` missing `WITH CHECK`** (not in the scaffolded `20260701` migration). Plan: `~/.claude/plans/finish-this-cheeky-mochi.md`.

---

## 🟡 Round 28 — Full login-overhaul security audit + fixes — applied LOCAL 2026-06-14 — cache JS `?v=90` (unchanged)

> The deferred full login-overhaul audit (R27 scope boundary). Static review of all security-critical source: 3 Edge Functions + `index.html`/`app.html`/`js/auth.js`/`js/pages/employees.js`. Full doc: [AUDIT_2026-06-14_LOGIN.md](AUDIT_2026-06-14_LOGIN.md). **Verdict: solid — 0 High, 2 Med, 4 Low.** All fixes applied to **local source** (not deployed); 2 items recorded as accepted residuals. ⚠️ **Client still uncommitted; Edge Fns edited but NOT redeployed** — prod stays v=86 / old fns until the user runs the e2e checklist, then deploys. Deploy + checklist in `~/.claude/plans/continue-the-process-partitioned-boole.md`.

### ✅ R28-01 · M1 — audit trail for provision/reset *(fixed, local — needs Edge Fn redeploy)*
PENDING_TASKS:135 required "log every provision/reset"; neither fn did. Both now `insert` into existing `employee_audit_log` (service role, after success): `{employee_id, table_name:'auth', field_name:'account_provisioned'|'password_reset', new_value:employee_id, changed_by:admin user.id}`, in `try/catch` (logging can't fail the op). `admin-reset-password` looks up the emp row by `user_id`. No migration (table already exists, schema.sql:873).
**Files:** `supabase/functions/{provision-users,admin-reset-password}/index.ts` (gitignored).

### ✅ R28-02 · L2 — login returns minimal payload *(fixed, local — needs redeploy)*
`login` returned full `data.user` (email + metadata). Now returns `{session, force_password_change:bool}`; `index.html` reads `data.force_password_change`. Data-minimization (JWT still carries email; not a cross-user leak).
**Files:** `supabase/functions/login/index.ts`, `index.html`.

### ✅ R28-03 · L3 — login indexed lookup *(fixed, local — needs redeploy)*
Replaced fetch-all-employees + in-memory `.find()` with `.eq('employee_id_normalized', normId).maybeSingle()` (the column the `compute_employee_id` trigger maintains). Stops loading every `contact_email` into fn memory. **Deploy check:** `select count(*) from employees where employee_id_normalized is null and status in ('active','probation')` → expect 0 (backfill via no-op UPDATE if not).
**Files:** `supabase/functions/login/index.ts`.

### ✅ R28-04 · L1 — escape pre-auth diagnostic *(fixed, local)*
`app.html` sign-in diagnostic interpolated `${reason}` raw into innerHTML (sibling URL line was escaped). Not user-controlled today, but inconsistent with R25 (XSS-1 fixed the adjacent block). Applied the same `&/<>` escape. Proven inert on a hostile payload (Node) + both pages render with 0 console errors.
**Files:** `app.html`.

### ✅ R28-05 · L4 — TOTP enroll-conflict cleanup *(fixed, local)*
A failed skip-time `unenroll` left a dangling unverified factor → a later enroll errored → silent redirect to app, no enrollment offered. `proceedAfterAuth` now retries via `tryEnrollTotp()` after `clearUnverifiedTotpFactors()` (unenrolls any `unverified` totp). Not a security hole (unverified factor doesn't elevate AAL); a dead-end UX fix.
**Files:** `index.html`.

### 🟡 R28-06 · Accepted residuals *(named, not built)*
- **M2** — no custom login rate-limiter. Supabase GoTrue already throttles `signInWithPassword`; the fn masks ID enumeration; MOD-97 ID space resists guessing. Upgrade path = Supabase Pro HIBP (💰 backlog). Disproportionate to build a Deno-KV limiter for ~14 users.
- **TOTP app-gate only** (no `aal2` RLS) — pre-existing accepted residual (line 139). Stolen password + REST bypasses 2FA. Optional later: `aal2` for admin role.

### 🔵 R28-07 · Deploy + runtime verification — PENDING (user)
Edge Fns redeploy (`login` `--no-verify-jwt`; `provision-users`/`admin-reset-password` default) + client commit/push. Gated on the e2e checklist (Bug B bypass → force-change clear + **QR scan** → Bug A challenge-on-return → Skip/L4 → Google → L1 spot-check) on localhost:3030. Carries the still-unverified R27-06 Bug A/B forward.

---

## 🟡 Round 27 — Login overhaul: auth-gate fixes (A/B) + hyphen-tolerant login + QR fix + test login — fixed/deployed/partly verified 2026-06-14 — cache JS `?v=90`

> Completes the login overhaul **built** the prior session (2026-06-13, never logged here): the 2 auth bugs found on recheck are now fixed, the `login` Edge Fn is hyphen-tolerant + deployed, and a David Bowman test login is provisioned. ⚠️ **Client side (`app.html`/`index.html`/`js/auth.js` @ v=90) is UNCOMMITTED — NOT pushed.** Prod GitHub Pages is still v=86 (old pre-overhaul login); only the `login` Edge Function was deployed to prod (backward-compatible). Full login-overhaul **audit deferred to next session** (scope boundary in `~/.claude/plans/approve-a-b-jazzy-wren.md`).

### ✅ R27-01 · Bug A — TOTP never challenged on return logins *(2026-06-14)*
Pre-fix, `index.html`'s `checkTotpEnrollment()` sent any user with a verified factor straight into the app → 2FA gave zero security after first enrollment. Replaced with `proceedAfterAuth()` router branching on `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`: `aal1`+next `aal2` (verified factor exists) → new `#view-totp-challenge` (code → `mfa.challenge` → `mfa.verify` → app); else → existing enroll flow. Load handler now routes already-authed sessions through the gate (force-change → change-pw view; needsMfa → challenge) instead of bouncing blindly to the app.
**Files:** `index.html`, `js/auth.js` (new `getAuthGate()`).

### ✅ R27-02 · Bug B — force_password_change bypassable via app.html *(2026-06-14)*
The flag was only checked on index.html's happy path; opening `app.html` directly skipped it. Added a boot gate after `loadSession()`: `getAuthGate()` → if `needsPasswordChange || needsMfa`, redirect to index.html before rendering. ⚠️ **First impl used a top-level `return` — illegal in `<script type="module">` → SyntaxError → the WHOLE boot script failed to parse → BLANK SCREEN for every login (admin incl.).** Caught via preview (unauth `app.html` load rendered no diagnostic = module never ran); fixed by using `throw` (the idiom the existing diagnostic block already uses to halt boot). Cache JS `?v=89`→`?v=90`.
**Files:** `app.html`.

### ✅ R27-03 · Login Edge Fn — accept Employee ID with OR without hyphens *(2026-06-14)* — DEPLOYED
`/login` did an exact `.eq('employee_id', input.toUpperCase().trim())` → failed whenever typed format ≠ stored format. Now normalizes BOTH input and stored value to alphanumerics-only (`.replace(/[^A-Z0-9]/g,'')`): fetch active/probation candidates + `.find()` on normalized IDs. **Deployed to prod** (`supabase functions deploy login --no-verify-jwt`, project sjkggguedgtynktymzes); smoke-tested from preview = `401` (healthy, not `500`). Backward-compatible with old prod index.html (same payload). ✅ User-confirmed: login works without hyphen. Rule saved to memory [[feedback-employee-id-no-hyphens]].
**Files:** `supabase/functions/login/index.ts` (gitignored).

### ✅ R27-04 · TOTP QR scannability *(2026-06-14)*
Enrollment QR was dark modules on a transparent SVG background, sitting on the dark login card → unscannable. Gave the QR `<img>` a white background + 12px quiet-zone padding (200px). ⚠️ `index.html` is NOT version-pinned → needs a hard refresh to take effect. Workaround used this session: manual key entry (the secret is shown under the QR).
**Files:** `index.html`.

### ✅ R27-05 · Prep C — David Bowman test login provisioned *(2026-06-14)*
"Set to zero, then fresh provision." Deleted old `hubbleengineering@gmail.com` auth user via SQL (dashboard delete blocked by FKs — had to `DELETE FROM job_title_change_requests` + `document_requests` rows referencing the profile first, then `profiles`, null `employees.user_id`, then `auth.users`). Set David (`02-3-003-56`, NNN 003) `contact_email=hubbleengineering@gmail.com`; **Provision Account** → fresh `createUser` (email_confirm + force_password_change) + linked `user_id`. Temp password issued.

### 🟡 R27-06 · End-to-end verification — PARTIAL (finish FIRST next session)
✅ Verified: login (no-hyphen) + temp pw → "Set your password" → set new pw → 2FA enroll screen → **Skip → Calendar**.
🟡 NOT yet verified: **Bug A** (enroll TOTP → sign out → log in → expect 6-digit challenge screen), **Bug B** (hold a force-change session → navigate to `app.html` → expect bounce to change-pw, not app), **QR scan** after hard refresh, admin **Google login** unaffected.

### 🟢 R27-07 · Avatar dropdown chevron doesn't flip when open *(found 2026-06-14, NOT fixed)*
Standalone UI polish (unrelated to the login overhaul). Clicking the sidebar profile row (`#sidebar-profile-btn`) toggles `.open` on `#avatar-dropdown` (`app.html` L353), but the chevron `svg.sidebar-profile-chevron` (`app.html` ~L207, downward `polyline 6 9 12 15 18 9`) stays pointing **down ⌄** — it should rotate to point **up ⌃** while the menu is open. ⚠️ The chevron is a *previous sibling* of `#avatar-dropdown`, so a descendant rule off `.open` can't reach it. Two fixes: **(a) CSS-only (preferred)** — `.avatar-menu-wrapper:has(.avatar-dropdown.open) .sidebar-profile-chevron { transform: rotate(180deg); }` + `transition: transform .15s`; **(b)** also toggle `.open` on `#avatar-wrapper` (L353/355/406/412) then key the rule on `.avatar-menu-wrapper.open …`. CSS change → bump `style.css` (next = `?v=30`).
**Files:** `css/style.css` (rotate rule); option (b) also `app.html` (boot toggles ~L353+).

### 🟡 R27-08 · EXPLORE — invite clients via email + send out ID & password *(requested 2026-06-14, not started)*
Exploration/design task (not built). **Goal (user request):** onboard **client-role** users by emailing them their login credentials (**ID + password**) automatically, instead of the manual per-person credential sheet used for employees. Today `provision-users` creates the account + temp password but sends **no email** — the admin distributes credentials privately. Research:
- **(b) Custom Edge Function + transactional email** *(matches the request)* — emails the Employee/Client ID + temp password directly via Resend / SendGrid / Supabase SMTP. ⚠️ **Plaintext password in email runs against the security-review decision** (private sheets, no password in transit — [[project-wms-login-overhaul]] 🔒 section); partly mitigated by forced password change on first login, but **needs user sign-off** on the trade-off.
- **(a) Supabase `inviteUserByEmail()`** *(more secure alternative to weigh)* — emails a magic invite link to set their own password. ✅ No password in transit; ⚠️ no literal "ID + password" pair is sent (they set their own). Needs Site URL / redirect config.
- **(c) Email infra** — Supabase's built-in auth email has free-tier rate limits; production sending likely needs custom SMTP (ties into the 💰 Supabase Pro discussion).
**Decisions needed from user:** emailed-credentials (b) vs. invite-link (a); which email provider; clients-only or employees too; how it reconciles with the "no password in transit" stance.
**Files (when built):** new/extended Edge Function (`provision-users` or a new `invite-client`), Supabase Auth email templates + SMTP settings, an "Invite" button on the Employees/Clients page.

### Infra note *(2026-06-14)*
`.claude/launch.json`: pinned `timesheet-3030` with `"autoPort": false` (login/OAuth origin must be 3030); stopped a stray `python -m http.server 3030` and started the preview server there. localhost:3030 = the only Supabase-allowed origin for login/authed flows (4040 preview is not).

---

## 🟡 Round 26 — Daily backup pipeline (go-live #2) — built 2026-06-12, ✅ test run passed 2026-06-13 — no cache change

### ✅ R26-01 · Pipeline scaffolds *(2026-06-12)*
`supabase/backups/` (gitignored with the rest of supabase/): `backup.yml` (GH Action: nightly 01:00 ICT `pg_dump public+auth` → gzip → `age` encrypt → commit; 30 daily/12 monthly retention; pinned checkout SHA; `permissions: contents: write`; conn string never echoed; PG_MAJOR=17 — verify against Dashboard) · `create_backup_role.sql` (read-only `pg_read_all_data` role + session-pooler string template — GH runners are IPv4, direct conn is IPv6) · `db_dump.ps1` (local on-demand pre-migration dump) · `README.md` (setup checklist + restore procedure + ops notes).
**Files:** `supabase/backups/{backup.yml,create_backup_role.sql,db_dump.ps1,README.md,age-key.txt}`.

### ✅ R26-02 · External resources *(2026-06-12)*
Private repo **github.com/HE-cells/hubble-wms-backups** created (gh CLI); scaffold pushed (README + `daily/`/`monthly/`, commit b45098e). `age` 1.3.1 installed (winget); keypair generated — public key `age1hpltmrflfzdq9ekgxda83rf6x9merzjjnqzmju84mlrhtrqt05wq6pzf9u` set as repo variable `AGE_PUBLIC_KEY`; private key in `supabase/backups/age-key.txt` (⚠️ move offline). **Storage ❓ from security review resolved:** zero `.storage`/upload calls in the app — DB dump is the complete backup, no separate storage backup needed.

### ✅ R26-03 · Wired up + TEST RUN PASSED *(2026-06-13)*
All four user steps done: workflow-scope token refresh → `backup.yml` pushed (workflow `nightly-db-backup` active) · `backup_role` created (read-only, login=t super=f) with a strong password (initial placeholder password fixed via `ALTER ROLE`) · `SUPABASE_DB_URL` secret set from a gitignored file then deleted (password never through chat) · PG major confirmed **17** (matches `PG_MAJOR`). First test run failed on `auth.audit_log_entries` — `pg_read_all_data` doesn't bypass RLS and `pg_dump` errors under `row_security=off`; fixed with **`ALTER ROLE backup_role BYPASSRLS`** (still read-only — BYPASSRLS only ignores row filters, no write/DDL). Re-run ✅ → **`daily/wms_20260613.sql.gz.age` = 56.3 KB** committed by `wms-backup-bot` (commit 54213a8). Also bumped `actions/checkout` → v6.0.3 (Node 24; Node 20 force-disabled 2026-06-16).

### 🔴 R26-04 · Remaining before go-live sign-off
1. 🟡 **Restore drill — Phase 1 ✅ (2026-06-13), Phase 2 pending.** Phase 1 (done by Claude): decrypted `wms_20260613.sql.gz.age` with `age-key.txt` → gunzip → content-verified: clean pg_dump header + `\unrestrict` end marker, 62 CREATE TABLE = 62 COPY, 136 policies, 34 functions, all key tables present (employees/time_entries/leave_requests/profiles/evaluations/auth.users), real data (16 employees, 4 profiles, 4 auth.users). Proves key + integrity + completeness. **Phase 2 (clean apply — do before go-live):** restore into a **scratch Supabase project** (free tier allows 2; NOT vanilla local PG — the `auth` schema needs Supabase roles/extensions or you get false-negative errors). Needs `psql` installed + scratch project conn string. Procedure in `supabase/backups/README.md`.
2. ✅ **`age-key.txt` moved offline** — user-confirmed 2026-06-15; removed from `supabase/backups/`. (Without it no backup decrypts; confirmed safely in offline storage.)
3. **Watch the repo** (GitHub → Watch → All Activity) so failed nightly runs email the user. *(still pending)*

> **Note (R36, 2026-06-15):** the backups README previously claimed the restore drill "PASSED" with a scratch-project restore — that was incorrect (user-confirmed Phase 2 never ran). README + Master Plan reconciled to "Phase 1 done, Phase 2 pending." `create_backup_role.sql` updated to include the `BYPASSRLS` that the test run required (M-BKUP closed).

---

## ✅ Round 25 — Full project audit + High-severity remediation (2026-06-12) — cache JS `?v=86`

*(Note: the go-live checklist's "R25 full RLS sweep" keeps its name — it remains ⏸ on hold after the login overhaul; this Round 25 is the app-side audit + remediation.)*

### ✅ R25-01 · Full 4-dimension audit *(2026-06-12)*
Parallel audits: frontend security (XSS/secrets/authz), database RLS (policies/RPC guards/escalation paths), code correctness (verified empirically with `TZ=Asia/Bangkok node`), house conventions (cache/components/deploy hygiene). ~45 findings → [AUDIT_2026-06-12_FULL.md](AUDIT_2026-06-12_FULL.md). Clean passes: secrets, deploy hygiene, client-side authz pattern, nav placement, modal pattern, no dead code.
**Files:** `AUDIT_2026-06-12_FULL.md`, `PLAN_AUDIT_REMEDIATION_2026-06-12.md`.

### ✅ R25-02 · High-severity remediation *(2026-06-12, commit 85540ed, deployed)*
6 XSS sinks routed through `esc()` (app.html:309 reflected pre-auth, tracker description, entryModal textarea breakout + task options, profileModal name/email); 5 date/TZ bugs fixed via existing `toISODate()`/`todayISO()` (holiday range −1 day, timesheet week missing Sunday, both `_nextWeekday` copies defaulting to yesterday, `_weekRange` Sun–Sat); past-date validation added to leave/team-leave/trip submits; cache de-dup (removed hard-coded `?v=` pins on users.js/profileModal/prefsModal → single URL per shared module). Cache V 84→85.
**Files:** `app.html`, `js/pages/{tracker,holidays,expenses,team}.js`, `js/components/{entryModal,profileModal}.js`, `js/api/{holidays,timeEntries}.js`.

### ✅ R25-03 · Verification pass + weekly-wage TZ leftover *(2026-06-12, commit 7fc2e46, deployed)*
Re-verified every R25-02 fix against the audit findings. One leftover found: `_renderWeeklyReport` (js/pages/expenses.js:2133) still serialized the PT wage window with UTC `toISOString()` → Sun–Sat window, `postWages` stamped Saturday. Fixed with `toISODate()`; proven under `TZ=Asia/Bangkok` (old `2026-05-31..06-06` → new `2026-06-01..06-07`). Cache V 85→**86**.
**Files:** `js/pages/expenses.js`, `app.html`.

### ✅ R25-04 · `20260701_update_with_check_hardening.sql` — APPLIED 2026-06-14 + verified live 2026-06-15 (R36)
WITH CHECK on `te_update`/`lr_update`/`fhs_update` (+ §4 `ct/tc/trq`, added R30) + `SET search_path` on 4 SECURITY DEFINER helpers. ✅ Applied in Studio 2026-06-14; anon probe 43/43. R36 M-DRIFT **live-verified** all 6 policies + 4 helpers + `uq_cash_txn_settlement_per_trip`; `schema.sql` + header reconciled. ⚠️ §4 had regressed the `20260622` user-cancel/settlement grants → fixed by **`20260702_restore_user_cancel_rls.sql`** (applied + verified). Both rows in the Master Plan migration table.

### ⏸ R25-05 · Mediums/Lows parked
13 Medium / 15 Low findings recorded in the "Audit 2026-06-12 remediation backlog" section near the top of this file.

---

## ✅ Round 24 — Go-live Phases 1–2: GitHub Pages deploy + prod login (2026-06-11) — cache JS `?v=84`

### 🟡 NEW · In-app User Manual / Help page *(requested 2026-06-11 — LAST build item before roster swap; updated 2026-06-12)*
New WMS page `js/pages/help.js` (scaffold via `/wms-build page`): **bilingual EN+TH** instruction guide, role-aware (employee flows for all; approval flows for manager; setup/admin chores for admin). Static content, no DB. Nav in `#nav-wms`, route + cache bump per convention. Content from `HE_WMS_Specification.md` / `UI UX Specification.md`. Deliberately last-before-swap so it documents the final feature set for day-one real users. **2026-06-12 additions:** write AFTER the login overhaul (must document Employee-ID login, first-login password change, TOTP enroll/skip, admin-only reset) + one info line: "Backups run nightly at 1:00 AM — work saved after that appears in the following night's backup." (No usage restriction — `pg_dump` snapshots are consistent and non-blocking.)

### ❌ DROPPED · First-login notification for admin/manager *(superseded 2026-06-12 by the login overhaul)*
Was: "UNLINKED ACCOUNTS" section in Notifications + badge for new unlinked `profiles` rows, to support progressive Google-linking at go-live. **Superseded:** the 2026-06-12 login overhaul pre-provisions every account with `employees.user_id` linked at creation and disables public sign-ups — unlinked accounts can no longer occur. See the 🔐 login overhaul spec in the go-live checklist above.

### ⏸ Phase 3 → checklist #4 — full RLS reconciliation sweep (R25) — ON HOLD *(user, 2026-06-11; resequenced 2026-06-12 to AFTER the login overhaul)*
Paused mid-audit. **Done:** M2+M3 module audit (23 policies PASS; 2 findings: `lr_update` + `fhs_update` missing WITH CHECK — details + ready-made fix SQL in [AUDIT_2026-06-11_GOLIVE.md](AUDIT_2026-06-11_GOLIVE.md)). **Resume point (after login overhaul, so the audit validates the final auth model):** core+M1 and M4+M5+M6 module audits → `20260701_rls_with_check.sql` → client-role verification → final probe. Note: 2FA is optional (user decision) → no `aal2` RLS enforcement in scope.

### ✅ R24-01 · OAuth redirect subpath fix *(2026-06-11)*
`js/auth.js`: `redirectTo` was `origin + '/app.html'` — broken under a GH Pages project subpath (resolved to `user.github.io/app.html`). Now `new URL('app.html', window.location.href).href` — verified correct at localhost / Pages root / Pages subpath. Cache V 83→84.
**Files:** `js/auth.js`, `app.html`.

### ✅ R24-02 · Repo + GitHub Pages live *(2026-06-11)*
gh CLI installed (winget, v2.93.0), authenticated as **HE-cells** (device flow). Public repo **https://github.com/HE-cells/hubble-wms** — app-only (44 files: index/app/js/css/.nojekyll; docs, supabase/, Google Cloud/ excluded via .gitignore, verified at staging). Pages enabled (main, root): **https://he-cells.github.io/hubble-wms/** — all assets HTTP 200, deployed auth.js carries the redirect fix.
**Deploy workflow going forward:** commit + `git push` → Pages redeploys automatically (no build step).

### ✅ R24-03 · Phase 2: prod redirect URLs — login round-trips on prod *(2026-06-11, user-confirmed "all good")*
First attempt failed as-designed: redirectTo not in the Supabase allowlist → fallback to dev Site URL (`http://localhost:3030/app`). Fixed by user in Supabase → Authentication → URL Configuration: Site URL = `https://he-cells.github.io/hubble-wms`, Redirect URLs include `https://he-cells.github.io/hubble-wms/app.html` + `http://localhost:3030/app.html` (local dev preserved). Google Cloud origins were NOT the blocker (flow passed Google fine). Production Google login verified by user.

---

## ✅ Round 23 — Go-live Phase 0: security hotfix (2026-06-11) — no cache change (SQL only)

Go-live plan: `~/.claude/plans/all-good-plan-for-majestic-wren.md` (user-approved order: security hotfix → deploy on sci-fi roster → redirect URLs → RLS sweep → closeout → **roster swap last**). Evidence ledger: [AUDIT_2026-06-11_GOLIVE.md](AUDIT_2026-06-11_GOLIVE.md).

### ✅ Migrations applied + probe green *(2026-06-11, user-confirmed)*
`20260629_employment_certificate.sql` + `20260630_security_hardening.sql` both applied in Studio. Post-apply probe: **43/43 PASS, 0 FAIL — anon fully blocked** (both previously-leaking RPCs now 400). Output archived in AUDIT_2026-06-11_GOLIVE.md. 🟡 Remaining logged-in spot-checks (next login session): member self-role-change blocked · admin Projects stats still load · Tags usage still loads · employee REQUESTS shows only Employment Certificate.

### 🔨 R23-01 · 🔴 Privilege-escalation fix + RPC guards *(2026-06-11)*
Found during go-live planning: **(a)** `profiles_update_own` has no WITH CHECK / column guard → any logged-in user could set own `role='admin'` via REST. **(b)** `get_project_stats` / `get_tag_usage` SECURITY DEFINER RPCs had no auth guard — **confirmed leaking live data to anon** by probe (tag UUIDs + usage counts returned). Migration `20260630_security_hardening.sql`: new `guard_profile_self_update()` trigger (non-admin can't change role/client_id/billable_rate; Studio context allowed); both RPCs → plpgsql with house guard idiom (stats: admin or assigned manager via `is_my_project`; tags: any authenticated); `guard_evaluation_update` → COALESCE pattern. `schema.sql` mirrored (RPCs were never mirrored before — drift fixed).
**Files:** `supabase/migrations/20260630_security_hardening.sql` (**new**), `supabase/schema.sql`.

### 🔨 R23-02 · Anon probe script + baseline *(2026-06-11)*
New `supabase/probes/anon_probe.ps1` — read-only; probes all 39 RLS tables + 4 RPCs with the publishable key; PASS/FAIL table, non-zero exit on FAIL (go-live gate). **Baseline run:** 39/39 tables PASS · `get_evaluation_kpis`/`create_cycle_evaluations` PASS (20260625b guards hold) · `get_project_stats`/`get_tag_usage` **FAIL** (leak confirmed → fixed by R23-01, pending Studio apply). Output archived in AUDIT_2026-06-11_GOLIVE.md.
**Files:** `supabase/probes/anon_probe.ps1` (**new**), `AUDIT_2026-06-11_GOLIVE.md` (**new**).

---

## ✅ Round 22 — Employment Certificate: only employee-requestable doc type (2026-06-11) — cache JS `?v=83`, migration applied ✅

User decision: employees may only **request an Employment Certificate**; all other document types are drafted/generated directly by admin/manager (GENERATE tab, unchanged). No such template type existed — added as the 9th type.

### ⚠️ Apply migration to Supabase Studio before testing
File: `supabase/migrations/20260629_employment_certificate.sql`
1. Paste into Supabase Studio → SQL Editor → Run
2. (`NOTIFY pgrst, 'reload schema';` is the last statement — included)
3. Hard-refresh app (Ctrl+F5)
Verify: `SELECT count(*) FROM document_templates;` → 9 · employee REQUESTS form shows only "Employment Certificate".

### 🔨 R22-01 · DB migration — employment_certificate type + seed *(2026-06-11)*
`supabase/migrations/20260629_employment_certificate.sql`: extends the `template_type` CHECK constraint on all 3 M6 tables (`document_templates`, `generated_documents`, `document_requests` — DROP CONSTRAINT IF EXISTS + re-ADD with 9 types) and seeds the **Employment Certificate** template (position / department / employment type / start date table, `requires_signature` TRUE, `ON CONFLICT DO NOTHING`). Wording is a workflow placeholder like the other 8 — final HE wording pre-release. `supabase/schema.sql` mirrored (CHECK lists ×3 live + commented duplicate, seed row appended).
**Files:** `supabase/migrations/20260629_employment_certificate.sql` (**new**), `supabase/schema.sql`.

### 🔨 R22-02 · REQUESTS form restricted to Employment Certificate *(2026-06-11)*
`js/api/documents.js`: `DOCUMENT_TYPE_LABELS.employment_certificate` + new exported `EMPLOYEE_REQUESTABLE_TYPES` set (single source of truth — add types there to widen later). `js/pages/documents.js`: TYPE_ICONS entry; "My Requests" submit form now lists only requestable active templates, with hint "Other document types are issued directly by HR / your manager."; if the certificate template is deactivated the form is replaced by an unavailable note. **UI gating only** — `document_requests` RLS still accepts any template type (same precedent as manager view-only TEMPLATES); the Fulfill/GENERATE flow is unchanged for all 9 types. Verified: both modules pass ESM check + import in-browser at `?v=83`; `EMPLOYEE_REQUESTABLE_TYPES` resolves to `['employment_certificate']`; zero console errors. Logged-in smoke (employee sees 1 option, request→fulfill round-trip) pending after Studio apply.
**Files:** `js/api/documents.js`, `js/pages/documents.js`, `app.html` (V 82→83).

---

## ✅ Round 21 — M6 Document Requests + role-based tab gating — built & smoke-tested 2026-06-11

Plan: `~/.claude/plans/additional-admin-and-manager-fuzzy-hopper.md`. User decisions: managers see all M6 tabs with TEMPLATES **view-only**; employees see only MY DOCUMENTS + new REQUESTS tab; requests fulfilled via the GENERATE flow; any active template requestable (manager reviews direct reports, admin all); pending requests + unseen decisions count in the Documents badge. Cache final: JS `?v=80` / CSS `?v=29` / tokens `?v=22`.

### 🔨 R21-01 · DB migration — document_requests *(2026-06-11)*
`supabase/migrations/20260628_document_requests.sql`: `document_requests` (employee_id, requested_by, template_id/type, note, status pending/fulfilled/rejected/cancelled, reviewed_by/at/note, `fulfilled_document_id` → generated_documents). Partial unique index `(employee_id, template_id) WHERE status='pending'` blocks duplicate pending requests at the DB level. RLS: select = admin / direct manager / owner; insert = own row only (`requested_by = auth.uid() AND owns_employee()`, forced clean pending); update = admin/manager review OR owner self-cancel pending→cancelled (R16 pattern); delete = admin. Reuses `set_document_updated_at()`. `supabase/schema.sql` mirrored (PHASE 7b section).
**✅ All 3 M6 migrations applied in Studio (2026-06-11, user-confirmed):** `20260627` + `20260628` applied clean; `20260626` errored on re-run (policies already existed from a prior partial apply — `42710 dt_select`), fixed with an idempotent DROP-POLICY-IF-EXISTS re-apply script. Verification query confirms: 8 templates / 4 dt / 4 gd / 4 dreq policies.
**Files:** `supabase/migrations/20260628_document_requests.sql` (**new**), `supabase/schema.sql`.

### 🔨 R21-02 · API — request functions *(2026-06-11)*
`js/api/documents.js`: `getDocumentRequests` (RLS-scoped, embeds employee/template/reviewer), `submitDocumentRequest` (23505 → friendly duplicate message), `cancelDocumentRequest` / `rejectDocumentRequest` (both `.eq('status','pending')`-guarded), `linkRequestToDocument` (sets `fulfilled_document_id` at draft-save; status stays pending), `fulfillRequestsForDocument` (flips linked pending requests to fulfilled at draft→generated; zero rows = normal no-op when the employee cancelled mid-draft).
**Files:** `js/api/documents.js`.

### 🔨 R21-03 · Documents page — REQUESTS tab + tab gating + view-only templates *(2026-06-11)*
`js/pages/documents.js`:
1. **Tabs:** MY DOCUMENTS (all) · TEAM DOCUMENTS / GENERATE (admin+manager) · **REQUESTS (all)** · TEMPLATES (admin **edit** / manager **view-only** — View button, disabled inputs, no Save/Activate; pure UI gating, dt RLS unchanged). Tab-state guard updated (`templates` now allows manager).
2. **REQUESTS tab:** approvals section (admin: all pending; manager: direct reports via `_eligibleEmployees` — own request escalates to admin) with Fulfill/Reject; "My Requests" submit form (active templates + optional note, client duplicate pre-check, hidden with hint when no employee record linked) + own list with status badges, rejection reason, Cancel on pending. Decisions marked seen (`docreq_seen_*`) on tab open.
3. **Fulfill flow:** prefills GENERATE (employee + template + banner), Save Draft links the request, Generate (draft→generated) marks it fulfilled. Inactive-template guard with toast before tab switch.
4. Reject modal `_openDocReqRejectModal` (clone of holidays `_openHlRejectModal`, reason optional, ids `docreq-rej-*`).
**Files:** `js/pages/documents.js`.

### 🔨 R21-04 · Badge + cache bump *(2026-06-11)*
`app.html` `loadDocumentsBadge()`: unseen generated docs (everyone) + pending requests (admin all / manager excluding own `employee_id`) + unseen fulfilled/rejected decisions (employee, `docreq_seen_*`). Missing `document_requests` table degrades to 0 (supabase-js returns `{error}` without throwing). Cache `V` 78→79.
**Files:** `app.html`.

### ✅ R21-06 · Print/Save PDF: 0.75in margins + scale-proof width *(2026-06-11, cache `?v=80`)*
User smoke test passed but the printed PDF came out small and centered. Two changes in `js/pages/documents.js` print CSS: `@page` margin 10mm → **0.75in all around**; `.doc-print-body` lost its `max-width:190mm` cap and `margin:0 auto` centering (now `max-width:none; margin:0`) so the document always fills the full printable width. Root cause of the small output: a capped+centered body floats in the middle whenever Chrome lays the print out wider than 718px — exactly what happens when the print dialog has a **custom Scale** (~73% matched the screenshot). Verified with a probe page at both 650px (= A4 − 1.5in @ 100%) and 980px (emulated custom scale): body fills edge-to-edge in both. **User tip: keep Chrome print dialog at Scale = Default/100%, Margins = Default** for true 0.75in margins and full-size text.
**Files:** `js/pages/documents.js`, `app.html` (V 79→80).

### ✅ R21-05 · UI smoke test — PASSED *(2026-06-11, user-confirmed "all good")*
Local checks: Node ESM syntax + in-browser dynamic import of both modules OK; `app.html` zero console errors. All 3 migrations applied + verified in Studio (8 templates / 4+4+4 policies). Logged-in smoke passed; view modal confirmed perfect by user. Print output issue found during smoke → fixed in R21-06; side-margin preference still open → R21-07.

### ✅ R21-07 · Print left/right margins narrowed to 0.5in *(2026-06-11, cache `?v=82`)*
First pass set **0.25in left/right** per user choice (v=81); user then revised to **0.5in left/right** (top/bottom stay 0.75in) — final rule in `js/pages/documents.js` print CSS: `@page{size:A4 portrait;margin:0.75in 0.5in}`. Verified at both steps: ESM syntax check passed; served `documents.js?v=82` contains the final rule; `app.html` boots with zero console errors. Printable width is 7.27in (A4 8.27in − 1.0in) — the R21-06 scale-proof body (max-width:none) fills it automatically. Reminder stands: judge margins with Chrome print dialog at **Scale = Default/100%, Margins = Default**.
**Files:** `js/pages/documents.js`, `app.html` (V 80→81→82).

---

## ✅ Round 20 — M6 Automated Documentation (Phase 7) — built 2026-06-11, smoke-tested ✅

Plan: `~/.claude/plans/phase7-m6-automated-docs.md`. Built target: template engine + merge fields + 8 document types + print-to-PDF + status tracking (draft → generated → sent → signed). E-signature (OD-8) deferred. Cache now: JS `?v=78` / CSS `?v=29` / tokens `?v=22`.

**Template-content note:** current seeded document templates are placeholders for validating the workflow. Before full release, all document templates must be reviewed and updated with final Hubble Engineering wording, legal/HR language, formatting, and approval/signature text.

### 🔨 R20-01 · DB migration — templates + generated documents *(2026-06-11)*
`supabase/migrations/20260626_document_templates.sql`: creates `document_templates` and `generated_documents`, with RLS scoped to admin / direct manager / owner employee. Important naming correction: M3 already uses `employee_documents` for uploaded files, so M6 generated output uses `generated_documents` to avoid a table collision. `supabase/schema.sql` mirrored.
**✅ Applied in Supabase Studio (2026-06-11):** `20260626_document_templates.sql` (via idempotent policy re-apply — see R21-01 note) + `20260627_generated_documents_draft_workflow.sql`.

### 🔨 R20-02 · API + merge engine *(2026-06-11)*
`js/api/documents.js`: template CRUD, generated-document CRUD/status update, preview/generate helpers, escaped `{{group.field}}` substitution, leave-balance context, latest published evaluation context, monthly timesheet summary context.

### 🔨 R20-03 · Documents page *(2026-06-11)*
`js/pages/documents.js`: MY DOCUMENTS and TEAM DOCUMENTS cards, GENERATE flow (shared `empSelect`, template cards, custom fields, required-field warning, resolved preview, Save Draft), TEMPLATES editor (admin only, version bump), document print modal with `@media print` chrome hiding and A4 fit. Admin sees all team documents; manager sees/generates direct-report documents; employee sees own issued documents.

### 🔨 R20-04 · app wiring + naming docs *(2026-06-11)*
`app.html`: WMS nav item `#documents`, `badge-documents`, RLS-scoped unseen generated-document badge, route import, cache `?v=78`. `UI_NAMING_REFERENCE.html` and `UI UX Specification.md` updated with Documents canonical names and layout.

### ✅ R20-05 · Documents view/print polish *(2026-06-11)*

`js/pages/documents.js`: darkened generated-document view text (`.doc-muted`, paragraph/list text, and table cells) so employee information is readable in the modal. Print/save PDF now uses fixed `A4 portrait` page sizing, removes the fixed modal backdrop from print flow, preserves the modal document layout on the printed page, and avoids the blank page before the table.

### ✅ R20-06 · Required-field warning + optional-note suppression *(2026-06-11)*

`js/api/documents.js`: treats every non-optional merge field used by the selected template as required; Generate is blocked with a clear missing-employee-information message until the employee record/custom fields are updated. Standalone empty `{{custom.note}}` blocks are removed from generated/previewed documents instead of leaving blank paragraphs or callouts.

`js/pages/documents.js`: shows an inline warning before Generate when the selected employee/template combination is missing required fields, repeats the warning on Preview/Generate attempts, and blocks Print/Save-PDF for older generated documents that still contain missing required placeholders.

### ✅ R20-07 · Draft workflow, MY/TEAM split, print fit *(2026-06-11)*

`js/api/documents.js`: new generated documents are inserted as `draft`, then moved to `generated` via the card action. `supabase/migrations/20260627_generated_documents_draft_workflow.sql` sets DB default status to `draft` and keeps draft rows visible to admin/manager only until generated. `supabase/schema.sql` mirrored.

`js/pages/documents.js`: Documents list is split into MY DOCUMENTS and TEAM DOCUMENTS for admin/manager users. Generate tab now saves a draft first; draft cards expose a Generate action. Print CSS now uses A4 portrait with printable margins, max-width fitting, fixed table layout, and word wrapping so the document fits the page.

### ✅ R20-08 · UI smoke test — PASSED *(2026-06-11, user-confirmed; migrations applied same day)*
Local ESM syntax checks passed for `js/api/documents.js` and `js/pages/documents.js`. Static-server probe passed: `app.html`, `js/pages/documents.js`, and `js/api/documents.js` all returned HTTP 200. Full logged-in browser smoke remains pending because the Supabase migration is not applied in Studio yet. After applying the migrations, smoke-test: admin opens Documents → GENERATE → pick employee → pick template → Preview has no unresolved `{{}}` → Save Draft → TEAM DOCUMENTS card appears → Generate → Print modal opens → Mark Sent/Signed works → employee can see own issued document only.

### ⏸ R20-deferred · Pre-Phase-1 RPC auth gap (get_project_stats / get_tag_usage)
`get_project_stats` and `get_tag_usage` (migration `20260609_project_stats_rpc.sql`) have no auth guard — anon callers get live data. **Deferred: fix alongside Phase 1 auth overhaul** (login method revision — same sweep will add `COALESCE` guards to all unguarded RPCs). Not urgent: data is non-sensitive project/tag metadata, and the RLS hardening audit found this in Round 10.

---

## ✅ Round 19 — M5 Employee Evaluation built (2026-06-10) — cache JS `?v=74`

Built per `~/.claude/plans/go-on-iridescent-perlis.md`. User decisions: core 3-stage workflow (self → manager → admin publishes final rating; 360/calibration deferred), question bank mirrors the real HE Annual Self-Assessment Google Form (extracted verbatim from the live form, bilingual TH/EN), 4 KPIs from logged hours, probation reviews manual-only (OD-6 stays open). Verified: both new modules pass Node ESM check + import cleanly in-browser with all transitive imports; all 7 app.html wiring markers confirmed against the served file.

### ✅ R19-01 · DB migration — 4 tables + RLS + guard trigger + 2 RPCs + seed *(2026-06-10)*
`evaluation_cycles` (annual/probation/custom, KPI period, deadline, open/closed) · `evaluation_questions` (bank: code/section/kind/asked_of/label_en/label_th, 28 rows seeded from the Google Form) · `evaluations` (one per employee×cycle; status `self_pending→self_submitted→manager_submitted→published`; manager snapshot; final_rating 1–5 NULL until publish) · `evaluation_responses` (per question × role self/manager; draft = upsert, submit = status flip). RLS helpers `can_read_eval_response`/`can_write_eval_response` enforce stage visibility at DB level (employee never sees manager rows pre-publish; manager sees self rows only post-submit). `guard_evaluation_update()` trigger blocks non-admin writes to final/identity columns. RPCs: `create_cycle_evaluations(cycle, emp[])` (bulk assign, manager snapshot, active-only) + `get_evaluation_kpis(emp, start, end)` (attendance vs holiday-aware working days, total/billable hours, utilization, per-project jsonb; caller must be admin/self/manager). `schema.sql` mirrored (PHASE 6 section).
**⚠️ Apply in Supabase Studio:** `supabase/migrations/20260625_evaluation_m5.sql` (ends with `NOTIFY pgrst`).
**Files:** `supabase/migrations/20260625_evaluation_m5.sql` (**new**), `supabase/schema.sql`.

### ✅ R19-02 · API layer *(2026-06-10)*
`js/api/evaluations.js`: cycles CRUD, `getQuestions`, `getVisibleEvaluations` (RLS-scoped), `getResponses`, `saveResponses` (upsert on `evaluation_id,question_id,respondent_role`), `submitSelf`/`submitManagerReview` (guarded status flips), `publishEvaluation` (single UPDATE sets final fields + status), `reopenEvaluation` (admin correction), `assignEvaluations` + `getEvaluationKpis` (RPCs).
**Files:** `js/api/evaluations.js` (**new**).

### ✅ R19-03 · Evaluation page *(2026-06-10)*
`js/pages/evaluation.js` — tabs: **MY EVALUATION** (cards → inline self-assessment form: personal header auto-filled from employees, KPI panel, 5-point bilingual scale legend, 5 sections from the question bank, Save Draft / Submit w/ confirm modal + required-field check; published view = self-vs-manager star columns + manager comments + final-rating banner, marks `eval_seen_<id>`) · **TEAM REVIEW** (manager/admin: table → review form with read-only self answers, manager rating column, 3 comment paragraphs) · **MANAGE** (admin: CYCLES CRUD + open/close; ASSIGNMENTS per-cycle table, bulk Assign Employees modal w/ select-all, Publish modal w/ self-vs-mgr averages, Reopen modal). sessionStorage `eval_tab_state` w/ role guards; all interpolation through `esc()`/`attr()`.
**Files:** `js/pages/evaluation.js` (**new**).

### ✅ R19-04 · app.html wiring + badge + naming map *(2026-06-10)*
Nav item `nav-evaluation` in `#nav-wms` (clipboard-check icon, `badge-evaluation`); `WMS_BADGE_IDS`, `wmsRoutes`, pages map updated; `loadEvaluationBadge()` — one RLS-scoped query partitioned client-side (admin: awaiting publish · manager: team reviews due · employee: self-assessments due + unseen published via `eval_seen_*` localStorage); `window.refreshEvaluationBadge` exposed. `UI_NAMING_REFERENCE.html`: WMS tab (4 pages) + Evaluation groups + per-page layout entry. Cache `const V` 68→69.
**Files:** `app.html`, `UI_NAMING_REFERENCE.html`.

### ✅ R19-05 · Smoke test — COMPLETE (2026-06-11)
Anon REST probes (2026-06-10) + full UI login flow (2026-06-11) both passed. Admin created cycle → assigned employees → employee submitted self-assessment → manager reviewed → admin published → employee saw final result with manager column + rating banner. All clear.

### ✅ R19-11 · Edit button + survey-text fidelity check *(2026-06-10, cache `?v=74`)*
*(v=74 addendum: duplicate "Section 2" header fixed — Work Skills card carries the section number + "Self-Assessment of Skills" title; Interpersonal Skills is an unnumbered continuation card, matching the survey's structure.)*
1. **Edit button** on MY EVALUATION cards: Start (self_pending, primary) · **Edit** (self_submitted, primary) · View (later stages, ghost).
2. **Compared the seeded question bank against the user's authoritative survey doc** — 3 diffs found and fixed: S1 achievements "(minimum 1 → **2** items)" EN+TH (doc said 3, user adjusted to 2); S5 overall restored exact wording "your work performance" / "ของตนเอง" (had been genericized); rating scale "Very good" → "**Very Good**" (JS `RATING_LABELS`). Survey intro paragraph (EN+TH) added to the self-assessment form header. Personal-info fields remain auto-filled from `employees` by design (not survey questions).
**⚠️ Apply in Supabase Studio:** `supabase/migrations/20260625d_question_wording.sql` (2 UPDATEs on `evaluation_questions`). schema.sql seed synced.
**Files:** `supabase/migrations/20260625d_question_wording.sql` (**new**), `supabase/schema.sql`, `js/pages/evaluation.js`, `app.html` (V 72→73).

### ✅ R19-10 · Self-edit before review + label-before-score *(2026-06-10, cache `?v=72`)*
1. **Employee can edit the submitted self-assessment until the manager submits the review.** RLS: `can_write_eval_response` now allows self writes while status IN ('self_pending','self_submitted') — migration `20260625c_self_edit_before_review.sql` (schema.sql synced). UI: form stays editable in `self_submitted` with a "Save Changes" button + note ("you can still edit until your manager submits the review"); no re-submit, status unchanged — manager sees latest answers.
2. **Rating description before the scores** in read-only views: "Excellent · 1 2 3 4 [5]" (was numbers-then-label). Verified visually in preview with the app stylesheet.
**⚠️ Apply in Supabase Studio:** `supabase/migrations/20260625c_self_edit_before_review.sql`.
**Files:** `supabase/migrations/20260625c_self_edit_before_review.sql` (**new**), `supabase/schema.sql`, `js/pages/evaluation.js`, `app.html` (V 71→72).

### ✅ R19-09 · Cycle modal theming — real root causes *(2026-06-10, cache `?v=71`)*
User screenshot showed the v=70 fix incomplete: Name input still white + preset buttons white. Two root causes: (1) the dark-theme CSS targets `input[type="text"], …` — the name input had **no `type` attribute**, so it fell back to UA white (added `type="text"`); (2) bare `class="btn"` has **no background** in style.css → UA white (known from R5 "white buttons in APPROVALS"). All secondary buttons in evaluation.js (presets, Cancel, Back, Save Draft, Edit, View, non-active Review) → `btn btn-ghost`, matching the expenses.js convention. **Verified via computed styles** in the preview (style.css injected): input bg rgb(28,32,38)/text rgb(228,234,238); ghost buttons transparent + themed border.
**Lesson:** themed inputs need an explicit `type`; secondary buttons are always `btn btn-ghost`, never bare `btn`.
**Files:** `js/pages/evaluation.js`, `app.html` (V 70→71).

### ✅ R19-08 · UI feedback fixes after first user test *(2026-06-10, cache `?v=70`)*
1. **Cycle modal inputs un-themed** — wrong class `input` → house `form-input` on every input/select/textarea in evaluation.js.
2. **Twice-a-year policy** — company policy recorded: evaluations 2×/year, respond **before 30 Jun** (H1 Mid-Year, KPI Jan–Jun) and **before 31 Dec** (H2 Year-End, KPI Jul–Dec). New Cycle modal: H1/H2 preset buttons + smart default by current month (name, KPI period, deadline pre-filled).
3. **EN before TH everywhere** — flipped `RATING_LABELS` + `SECTION_LABELS` (question labels were already EN-first).
4. **Read-only readability** — submitted ratings now show a highlighted chip on the picked value (accent bg + label) instead of grey disabled radios; free-text answers render in a readable panel (`--surface-2` bg, accent left border, `--text-primary`); final note → `--text-primary`.
**Files:** `js/pages/evaluation.js`, `app.html` (V 69→70).

### ✅ R19-07 · 🔴→fixed: anon bypass in both M5 RPC auth guards *(2026-06-10, found by R19-05 anon probe; ✅ fix APPLIED in Studio, re-probe confirms both RPCs now raise)*
`get_evaluation_kpis` returned data and `create_cycle_evaluations` executed for **anon** callers: `is_admin()` returns NULL when no profile row exists, so `IF NOT (NULL OR FALSE OR FALSE)` → NULL → the RAISE never fired, and SECURITY DEFINER bypassed RLS inside. With a real employee UUID, anon could read timesheet KPI aggregates. Authenticated non-authorized users were unaffected (FALSE ≠ NULL). Fix: `COALESCE(guard, FALSE)` + explicit `auth.uid() IS NULL` check in the KPI RPC. `schema.sql` synced.
**⚠️ Apply in Supabase Studio:** `supabase/migrations/20260625b_evaluation_rpc_auth_fix.sql`.
**Lesson for future RPCs:** always `COALESCE(...)` SECURITY DEFINER auth guards — RLS policies treat NULL as deny, but `IF NOT NULL THEN RAISE` silently passes.
**Files:** `supabase/migrations/20260625b_evaluation_rpc_auth_fix.sql` (**new**), `supabase/schema.sql`.

### ⏸ R19-06 · Deferred (recorded)
360 peer feedback · calibration stage · question-bank admin UI (seed is Studio-editable) · probation auto-trigger (OD-6 open) · M6 auto-doc triggers · PDF export · overtime/timesheet-compliance KPIs (no data basis) · email notifications.

---

## ✅ Round 18 — M1/M2/M3 audit remediation (2026-06-10) — cache JS `?v=68`

Full findings + false-alarm record: [AUDIT_2026-06-10_M1_M2_M3.md](AUDIT_2026-06-10_M1_M2_M3.md). 9 verified findings fixed; 4 explorer claims documented as false alarms.

✅ **Both migrations applied in Studio (2026-06-10, user-confirmed):** `20260624_leave_edit_balance_resync.sql` + `20260624b_time_entry_duration_check.sql` + `NOTIFY pgrst`. F5 pre-check passed (0 negative rows). First F2 attempt errored (wrong function name `sync_leave_balance_on_status_change` — actual name is `sync_leave_balance_on_approval`); corrected version applied. `supabase/schema.sql` synced with the final trigger + CHECK constraint.

| ID | Sev | Module | Item |
|----|-----|--------|------|
| ✅ R18-F1 | P1 | M2 | `schema.sql` drift synced: `flex_holiday_swaps` (`swap_type`, nullable `waived_holiday_id`/`substitute_date`), `leave_types` (`default_days`) |
| ✅ R18-F2 | P1 | M2 | Trigger migration `20260624_leave_edit_balance_resync.sql` — fires on date/type edits of approved leaves; auto-creates missing balance row (`allocated_days = 0`); `SECURITY DEFINER` (fixes latent manager-approval no-deduct) |
| ✅ R18-F3 | P1 | M2/M4 | XSS: reject-modal context lines wrapped in `_esc()` — `holidays.js` ×2 + `expenses.js` ×1 |
| ✅ R18-F4 | P2 | M2 | WFH date `hl-wfh-date`: `_wireWeekendBlock` + submit weekend guard added |
| ✅ R18-F5 | P1 | M1 | `entryModal.js`: end ≤ start guard; migration `20260624b_time_entry_duration_check.sql` (`CHECK total_hours >= 0`) |
| ✅ R18-F6 | P2 | M1 | `reports.js:190` silent catch → `console.warn('[reports] rate fetch failed', err)` |
| ✅ R18-F7 | P2 | M1 | `calendar.js:201` `_esc(color)` → `safeColor(color)` (imported from format.js) |
| ✅ R18-F8 | P1 | M3 | `requests.js` name-change approve: replaced inline writes with `reviewNameChangeRequest()` + employees sync best-effort |
| ✅ R18-F9 | P2 | M3 | `loadRequestBadge()` (app.html): body wrapped in try/catch + console.warn |

**📋 Planned (noted 2026-06-10, not built): annual leave reset.** Policy: all leave balances reset at 23:59 on Dec 31 every year (no carry-over). The F2 auto-create covers the January gap (approvals before "Initialize Year" create a 0-allocated row, visibly in deficit). Future work: automate the year rollover — auto-run "Initialize Year" for the new year (seed `allocated_days` from `leave_types.default_days` for active employees), likely via `pg_cron` or the parked Apps Script job. Decide pro-rating rules for mid-year hires before automating.

---

## ✅ Round 17 — P5 sign-off: reject modals, admin lock, tab persistence (2026-06-10) — cache JS `?v=67`

Built this session. No new migrations. Cache bump v=63→v=67 across 4 increments (expenses reject modal, admin lock, holidays reject modal, tab persistence).

### ✅ R17-01 · P5-CF-01 Smoke test sign-off *(2026-06-10)*
End-to-end P5-V checklist passed (expenses, mileage claims, trip request, reports, RLS). One bug found during smoke test: expense reject used `prompt()` — fixed in R17-02.
**Files:** none (manual verification).

### ✅ R17-02 · Expense reject: `prompt()` → proper modal *(2026-06-10)*
APPROVALS → Reject button on all 3 item types (exp / claim / trip) now opens `_openRejectModal(kind, id)` — same pattern as R16-07 Override modal. Shows context line (employee · type · detail), optional reason textarea, Cancel + Reject buttons. Replaces `prompt()`.
**Files:** `js/pages/expenses.js`. Cache: `?v=64`.

### ✅ R17-03 · P5-CF-02 Admin edit modal: category→project lock *(2026-06-10)*
`_openEditModal` (expense kind) now applies the `OFFICE_CAT_NAMES` lock on open (initial state) and on `#edt-cat` change — same logic as the MY EXPENSES submit form. Office categories disable and lock `#edt-proj` to Hubble Engineering Office; non-office categories re-enable it.
**Files:** `js/pages/expenses.js`. Cache: `?v=64`.

### ✅ R17-04 · Leave & Holidays reject: `prompt()` → proper modal *(2026-06-10)*
New `_openHlRejectModal({ contextLine, required, onConfirm })` at module scope. Leave request reject: context = employee · leave type · start date; reason **required**. Flex swap reject: context = employee · holiday · substitute date; reason optional. Replaces both `prompt()` calls.
**Files:** `js/pages/holidays.js`. Cache: `?v=65`.

### ✅ R17-05 · Leave & Holidays: full tab-state persistence across hard refresh *(2026-06-10)*
`_saveHlTabState()` saves 6 variables to `sessionStorage('hl_tab_state')`: `_mainTab`, `_myLeaveTab`, `_teamTab`, `_approvalSubTab`, `_holView`, `_flexSubTab`. Restored in `render()` before HTML is built; active-class on main tab buttons fixed immediately after. Role guard: non-admin/manager can't restore to `teamleave`. Save called at all 8 tab/view change points.
**Files:** `js/pages/holidays.js`. Cache: `?v=67`.

---

## ✅ Round 16 — User self-service cancel on all pending requests (2026-06-10) — cache JS `?v=63`

Built per `~/.claude/plans/expense-travel-rustling-acorn.md`. Verified: all 5 modified JS files pass Node ESM syntax check. Cache bump v=62→v=63.

### ✅ R16-01 · DB migration — 'cancelled' status for 6 tables *(2026-06-10)*
`supabase/migrations/20260621_user_cancel_requests.sql`: adds `'cancelled'` to the `status` CHECK constraint on `cash_transactions`, `travel_claims`, `travel_requests`, `job_title_change_requests`, `name_change_requests`, `deletion_requests`. `supabase/schema.sql` synced for all 6 tables.
**✅ All 6 migrations applied in Studio (2026-06-10):** `20260621_user_cancel_requests.sql`, `20260622_user_cancel_rls.sql`, `20260620_manager_time_edit_rls.sql`, `20260619_tet_admin_rls.sql`, `20260609_pt_daily_rate.sql`, `20260623_rename_he_working_budget.sql`.
**Files:** `supabase/migrations/20260621_user_cancel_requests.sql` (**new**), `supabase/schema.sql`.

### ✅ R16-02 · API cancel functions *(2026-06-10)*
Added `cancelTransaction`, `cancelTravelClaim`, `cancelTripRequest` to `js/api/expenses.js`; `cancelJobTitleChangeRequest` to `js/api/jobTitleRequests.js`; `cancelNameChangeRequest`, `cancelDeletionRequest` to `js/api/users.js`. Each sets `status = 'cancelled'`.
**Files:** `js/api/expenses.js`, `js/api/jobTitleRequests.js`, `js/api/users.js`.

### ✅ R16-03 · Cancel buttons on MY EXPENSES, MY TRAVEL mileage, MY TRAVEL trip *(2026-06-10)*
`_txnTable`, `_claimTable`, `_tripTable` each get a new last column. When `status === 'pending'`: Cancel button (`exp-cancel-txn` / `exp-cancel-claim` / `exp-cancel-trip`). When `status === 'manager_approved'`: "Contact admin" hint. Other statuses: empty cell. `_settled` updated to include `'cancelled'` so cancelled items move to the past section. Handlers wired in `_renderMyExpenses`, `_renderMileage`, `_renderTrip`.
**Files:** `js/pages/expenses.js`.

### ✅ R16-11 · Rename 'HE Working Budget' → 'Hubble Engineering Working Budget' *(2026-06-10)*
New migration `20260623_rename_he_working_budget.sql` (data-only UPDATE on `expense_categories`; ledger lines reference by id so they pick up the new name automatically). Updated: `OFFICE_IN_CAT_NAMES` in expenses.js, schema.sql seed, spec doc (§7.1 table + §7.2 flow example). **✅ Applied in Studio (2026-06-10).**
**Files:** `supabase/migrations/20260623_rename_he_working_budget.sql` (**new**), `js/pages/expenses.js`, `supabase/schema.sql`, `HE_WMS_Specification.md`.

### ✅ R16-10 · Record Top-up: office budget sources lock project to HE Office *(2026-06-10)*
New `OFFICE_IN_CAT_NAMES` set (`Hubble Engineering Working Budget`, `Engineering Assistant Working Budget`). Selecting either as the top-up Source sets Project/Purpose to "Hubble Engineering Office" and disables the select; `Customer Working Budget` (or blank) re-enables it and blanks the value for a manual pick. Mirrors the R13 `OFFICE_CAT_NAMES` lock on MY EXPENSES. Disabled select's `.value` still reads in JS, so the R16-08 required validation passes when locked.
**Files:** `js/pages/expenses.js`.

### ✅ R16-09 · Weekly PT report: payout date now follows the displayed week *(2026-06-10)*
User asked why REPORT → WEEKLY always opens on Wk23 when today is Wk24. The default is **intentional** — the report opens on the last *completed* week (prior Mon–Sun) because wages cover a full logged week paid the following Monday; ‹ › navigates to other weeks. But the banner had a real bug: "Next payout" was computed from *today* (`_nextMonday()`) while the week label came from the *displayed* week — on Wed Jun 10 it showed "Next payout Mon 15 Jun … (Wk#23)", wrong pairing (Jun 15 pays Wk24; Wk23 was paid Jun 8). Fixed: payout date = Monday after the displayed week's Sunday (`wkEnd + 1`); banner reworded to "Payout for this week: <date>. Covers Wk#N/YYYY half-day sessions × ฿…".
**Files:** `js/pages/expenses.js`.

### ✅ R16-08 · Record Top-up: Source + Project/Purpose required *(2026-06-10)*
PETTY CASH → RECORD TOP-UP: both fields now carry the required asterisk; Source placeholder changed "—" → "Select…". `_recordTopup` validates both before the API call (throws "Please select the Source." / "Please select a Project / Purpose."), same pattern as the R14-01 MY EXPENSES required-project validation.
**Files:** `js/pages/expenses.js`.

### ✅ R16-07 · Override prompt() → proper modal with status dropdown *(2026-06-10)*
APPROVALS → HISTORY → Override now opens a modal (project Modal Pattern: backdrop, header ✕, body, footer; closes on ✕/Cancel/backdrop click) instead of a free-text `prompt()`. Shows the item context line (type · employee · detail) and a `<select>` of valid statuses (trip kind includes `completed`), preselected to the current status. Apply routes to `overrideTransactionStatus` / `cancelTravelClaim`-or-`approveTravelClaim` / `overrideTripStatus` as before. New `_openOverrideModal(kind, id)`; the old inline prompt handler now just opens it. Verified: module imports in browser, modal markup renders correctly with existing CSS (screenshot).
**Files:** `js/pages/expenses.js`.

### ✅ R16-06 · NCR/JTCR own-request queries selected non-existent `updated_at` *(2026-06-10)*
User test: submitted a Name Change but MY PENDING REQUESTS stayed empty. Root cause: the own-NCR and own-JTCR queries in requests.js selected `updated_at`, a column that exists on **neither** `name_change_requests` nor `job_title_change_requests` → PostgREST 400, silently swallowed by the `|| []` fallback. **Pre-existing bug** — it also silently broke the RECENT NOTIFICATIONS cards for both request types in earlier rounds. Fixed by dropping `updated_at` from all 4 selects (`_isRecent` falls back to `reviewed_at`/`created_at`). Verified against the live DB via browser console: both queries now return OK. Note: the Override checklist item is under **APPROVALS → HISTORY** (section "All Requests"), not "ALL" — checklist label error, no code change.
**Files:** `js/pages/requests.js`.

### ✅ R16-05 · Re-check fixes: RLS for self-cancel + 3 UI bugs *(2026-06-10)*
Re-verification pass found the original R16 build incomplete:
1. **🔴 RLS blocker (fixed):** `ct_update`/`tc_update`/`trq_update` only allowed admin/manager, `ncr_update` admin-only — every employee self-cancel would have failed RLS. New migration `20260622_user_cancel_rls.sql`: owner may UPDATE own row only when old status = 'pending' (USING) and only to 'cancelled' (WITH CHECK). `trq_update` also allows owner approved→approved — fixes a **pre-existing** RLS bug where employees couldn't submit trip settlements. JTCR (`jtcr_own` FOR ALL) and deletion (admin-only) needed no change. schema.sql synced.
2. **Badge maps:** `STATUS_LABELS`/`STATUS_CLASS` in expenses.js gained `cancelled` ('Cancelled', plain gray badge — matches holidays.js).
3. **Trip stuck-in-active:** `_renderTrip`'s inline settled filter (`['rejected','completed']`) didn't include `'cancelled'` — cancelled trips would have stayed in the active list forever. Fixed.
4. **Admin Override:** 'cancelled' added to the Override status options (exp/claim/trip) — this is how admin fulfils "contact admin to cancel" after approval. Claim-kind override routes `cancelled` to `cancelTravelClaim` (the tier-based approve path can't produce it).
**Files:** `supabase/migrations/20260622_user_cancel_rls.sql` (**new**), `supabase/schema.sql`, `js/pages/expenses.js`.

### ✅ R16-04 · Cancel UI in requests.js *(2026-06-10)*
NCR and JTCR queries for own requests now fetch all statuses (removed `in('status', ['approved','rejected'])` filter). Pending items split into `pendingNcrReqs` / `pendingJtcrReqs` passed via `ownNotifs`. `_render()`: both ownOnly and admin paths show "MY PENDING REQUESTS" section above notifications when user has pending NCR/JTCR — each row has a Cancel button. Admin DELETION tab rows get a Cancel button (calls `cancelDeletionRequest`). Handlers wired for `.rq-cancel-pending` and `.del-cancel-btn`.
**Files:** `js/pages/requests.js`.

---

## ✅ Round 15 — Test-pass fixes: Team Balance cards, calendar all-day, SHOW MORE/LESS, per-item mark paid, tab persistence, manager parity (2026-06-10) — cache JS `?v=62`

Built per `~/.claude/plans/expense-travel-rustling-acorn.md`. Verified: all 6 modified JS files pass Node ESM syntax check (no SyntaxError). Zero console errors on reload. Cache bump v=61→v=62.

### ✅ R15-01 · Team Balance renders cards (like My Balance) *(2026-06-10)*
`_renderTeamBalance` now applies the same entitlement filter (`code !== 'flex_holiday' && default_days > 0`) to `selBals` and calls `_balCards(selBals)` instead of `_balTable(selBals)`. Deleted dead `_balTable` function (was the only call site).
**Files:** `js/pages/holidays.js`.

### ✅ R15-02 · Calendar shows duration-only entries in all-day row *(2026-06-10)*
`allDaySlot: true` in FullCalendar init. `_toEvent` returns an all-day event for untimed entries (`!start_time || !end_time`): title = `"{duration} · {desc/project}"`, `editable: false` (no drag/resize). Timed entries unchanged. Click still opens edit modal via `extendedProps.entry`.
**Files:** `js/pages/calendar.js`.

### ✅ R15-03 · WS5 "Edit" → "Save & Approve" clarification *(no code change)*
Not a bug. Clicking **Edit** on a PENDING row in APPROVALS → PENDING opens the edit modal whose footer shows "Save & Approve" + "Save Changes". User confirmed.

### ✅ R15-04 · SHOW MORE ↔ SHOW LESS toggle *(2026-06-10)*
Wrapped the bare text node in `<span id="show-more-label">`. `_setWmsExpanded(open)` now updates its `textContent` to `'SHOW LESS'` / `'SHOW MORE'` alongside the existing icon rotation.
**Files:** `app.html`.

### ✅ R15-05 · Payment Details: per-item Mark Paid *(2026-06-10)*
Each expense/claim row in the details table now has a 5th cell with `<button class="pc-mark-item-paid" data-type="txn|claim" data-id="…">✓ Paid</button>`. Handler calls `markReimbursed([id], [])` or `markReimbursed([], [id])` → toast → `_loadPettyCash()`. Total row `colspan` updated 3→4. Per-employee and Mark-All buttons unchanged.
**Files:** `js/pages/expenses.js`.

### ✅ R15-06 · Tab state persists across hard refresh *(2026-06-10)*
New `_saveTabState()` helper: writes 6 variables to `sessionStorage('exp_tab_state')`. Called in all 6 tab-click handlers (primary, travel sub, approvals sub, pending category, petty-cash sub, report mode). Restored at the top of `_renderShell()` with role guards: `petty-cash`/`report` require `_admin`; `approvals` requires `_admin || _manager`; others always allowed.
**Files:** `js/pages/expenses.js`.

### ✅ R15-07 · Manager parity on time editing *(2026-06-10)*
**Migration** `supabase/migrations/20260620_manager_time_edit_rls.sql`: upgrades `te_insert` + `tet_insert`/`tet_delete` to `own OR is_admin() OR (manager AND is_my_project())`. Schema.sql synced.
**UI:** timesheet `_readOnly = isClientRole()` (dropped manager restriction); tracker removes quick-add hide for manager + `userId: _viewUserId || undefined` on create/resume; calendar `targetUserId = _viewUserId || undefined`; reports picker opens to `isAdmin() || isManager()`.
**⚠️ Apply in Studio:** `20260620_manager_time_edit_rls.sql` (this round) + `20260619_tet_admin_rls.sql` + `20260609_pt_daily_rate.sql` (carried from prior rounds — superseded partially by this migration but both still needed).
**Files:** `supabase/migrations/20260620_manager_time_edit_rls.sql` (**new**), `supabase/schema.sql`, `js/pages/timesheet.js`, `js/pages/tracker.js`, `js/pages/calendar.js`, `js/pages/reports.js`.

---

## ✅ Round 14 — Required project, FX fix, shared empSelect, admin time editing, Save & Approve (2026-06-10) — cache JS `?v=61`

Built per `~/.claude/plans/expense-travel-rustling-acorn.md`. Verified: all 7 modified JS modules pass Node ESM syntax check (no SyntaxError). Cache bump v=60→v=61.

### ✅ R14-01 · WS1 — MY EXPENSES: Project/Purpose required *(2026-06-10)*
Label now shows asterisk. `_submitExpense` validates `ex-proj.value` before API call (throws `'Please select a Project / Purpose.'`). Office-locked category (disabled select) still submits correctly — `.value` is set by the R13 lock. `projectId` no longer falls back to `null`.
**Files:** `js/pages/expenses.js`.

### ✅ R14-02 · WS2 — FX conversion fix + visible toasts *(2026-06-10)*
Changed `_fetchFxRate` URL from `api.frankfurter.app/latest` (301 redirect, no CORS headers → silent failure) to `api.frankfurter.dev/v1/latest`. `_wireCurrencyConvert` now shows a success toast `"Converted at 1 {prev} = {rate} {new}"` on success, and `"Exchange rate unavailable — amount not converted"` error toast on failure.
**Files:** `js/pages/expenses.js`.

### ✅ R14-03 · WS3 — Shared `empSelect` component + holidays refactor *(2026-06-10)*
New `js/components/empSelect.js`: `empOptionLabel(e)`, `empSelectHtml(idPrefix, employees, opts)`, `wireEmpSelect(idPrefix, employees, onSelect)`. Mirrors weekNav convention. `onSelect` receives full employee object (callers extract `.id` or `.user_id`). Filters active/probation internally. CSS reuses `.emp-select-wrap`/`.emp-clear-btn` already in style.css.
holidays.js: deleted local `_empOptionLabel`/`_wireEmpSelect` helpers; replaced 3 markup blocks + 3 wiring calls (`hl-tl`, `hl-tf`, `hl-tb`) with component calls. IDs unchanged.
Project CLAUDE.md: new "Employee Selector" section under Default Components.
**Files:** `js/components/empSelect.js` (**new**), `js/pages/holidays.js`, `CLAUDE.md`.

### ✅ R14-04 · WS4 — Admin employee selector on 5 time pages *(2026-06-10)*
All 5 time pages (tracker, timesheet, calendar, dashboard, reports) now show an empSelect datalist picker for admin/manager. Blank = Myself. Picker uses `getEmployees()` filtered to `user_id != null && user_id != self`.
- **tracker.js:** `_viewUserId`; `getTrackerEntries`/`countEntries` pass `userId`; quick-add and Resume pass `userId` when admin viewing teammate. `getTrackerEntries` API updated with `userId` param.
- **timesheet.js:** replaced `getUsers` + `<select>` with empSelect slot; `_readOnly = isClientRole() || (!!_viewUserId && !isAdmin())` — admin can edit; manager/client remain read-only; `createEntry` in `_commitCell` passes `userId: _viewUserId || undefined`.
- **calendar.js, dashboard.js:** replaced `getUsers` + `<select>` with empSelect slot; view-only, no logic changes.
- **reports.js:** replaced hidden `#rp-user` select with empSelect slot; `_fUserId` maintained by `wireEmpSelect` callback (removed DOM-read in `_load`); `getUsers` kept solely for `_rateMap`.
**⚠️ Apply in Supabase Studio before testing admin tag edits:** `supabase/migrations/20260619_tet_admin_rls.sql` — fixes `time_entry_tags` tet_insert/tet_delete to allow `is_admin()`.
**Files:** `js/components/empSelect.js`, `js/pages/tracker.js`, `js/pages/timesheet.js`, `js/pages/calendar.js`, `js/pages/dashboard.js`, `js/pages/reports.js`, `js/api/timeEntries.js`, `supabase/migrations/20260619_tet_admin_rls.sql` (**new**).

### ✅ R14-05 · WS5 — "Save & Approve" in admin edit modals *(2026-06-10)*
**expenses.js `_openEditModal`:** Footer adds "Save & Approve" button when `_admin && ['pending','manager_approved'].includes(item.status)`. Save logic extracted to inner `_doSave()`. "Save & Approve": calls `_doSave()` then for `pending` chains manager→finance approve tiers; for `manager_approved` calls finance only. Full post-approve refresh chain (badge, pending count, tab badge, reload).
**holidays.js `_openLeaveEditModal`:** Footer adds "Save & Approve" when `_admin && req.status === 'pending'`. Inner `_doSaveLeave()`. After save, calls `approveLeaveRequest(req.id, _myEmployee?.id, null)` → `_syncLeaveBadges()`.
**Files:** `js/pages/expenses.js`, `js/pages/holidays.js`.

---

## ✅ Round 13 — Expense polish + Category→Project + PT day-rate wages (2026-06-10) — cache JS `?v=60`, tokens.css `?v=22`

Built per `~/.claude/plans/cheerful-drifting-peacock.md` (Decisions A–E, see P5-D below) + 3 review refinements. Verified: both modules pass Node ESM parse, app boots with zero console errors, CSS aliases resolve live, `expenses.js?v=60` imports in-browser.

### ✅ R13-01 · WS1 — CSS alias vars + ledger card colors *(2026-06-10)*
Added `--danger`/`--success`/`--warning`/`--primary` alias vars to `tokens.css` (same convention as `--border-color`) — rescues every mis-named `var()` reference app-wide; negative CLOSING now red. LEDGER summary card: TOTAL IN green, TOTAL OUT red.
**Files:** `css/tokens.css`, `js/pages/expenses.js`.

### ✅ R13-02 · WS2 — MY EXPENSES category→project lock *(2026-06-10)*
Reverted the `for_employee` category filter (everyone sees full `_catOut()` list; `_catPersonal()` removed as dead code — DB column stays, harmless). New `OFFICE_CAT_NAMES` set (7 office categories) + `_officeProjectId()`: picking an office category locks `ex-proj` to "Hubble Engineering Office" (disabled select still submits its value); customer categories (Import Tax, Shipping & Handling, Other) re-enable + blank the picker. Graceful fallback if the office project is missing.
**Follow-up (🟢):** admin edit modals don't get the lock — submit form only this round.
**Files:** `js/pages/expenses.js`.

### ✅ R13-03 · WS3 — Payment Details double-count fix *(2026-06-10)*
`getPendingReimbursements()` cash query now has `.neq('source','travel_claim')` — travel claims counted only via the `travel_claims` table. **Refinement:** `markReimbursed` also stamps `reimbursed_at` on the mirrored trigger-posted cash lines (`source='travel_claim' AND source_ref IN claimIds`) so the data stays honest for future reports.
**Files:** `js/api/expenses.js`.

### ✅ R13-04 · WS4 — PT/outsource day-rate wages + post-to-ledger *(2026-06-10)*
- **Setting:** `pt_daily_rate` (default ฿550) on `petty_cash_settings`; Setup gained "PT/Outsource Daily Rate (฿)" field; `get/savePettyCashSettings` extended (partial-save safe).
- **Weekly report:** per-day hours→sessions (`Math.min(2, Math.round(h/4))` — note: 2h rounds up to 1 session, 6h to a full day; tunable single function), columns Worker | Sessions (½-days) | Logged Hours | Wage | Expenses, wage = sessions × rate/2 (฿275), total row.
- **Post Wages to Ledger:** button → review modal (editable amounts), posts approved "Engineering Assistant Wage" 'out' lines per worker, project = Hubble Engineering Office, `txn_date` = Sunday of reported week, note `Wage Wk{n}/{yyyy} — N sessions`. Double-post guard: `getWagePostings(weekTag)` warns (soft) if the week tag already exists. New API: `postWages()`, `getWagePostings()`.
**⚠️ Apply in Supabase Studio:** `supabase/migrations/20260609_pt_daily_rate.sql`
**Files:** `js/api/expenses.js`, `js/pages/expenses.js`, `supabase/migrations/20260609_pt_daily_rate.sql`, `app.html`.

### ✅ R13-05 · WS5 — Vehicle rates *(no code)*
Confirmed seed already totals moto ฿6/km, car ฿10/km — verify in PETTY CASH → Setup.

---

## ✅ Round 12 — Petty-Cash Reimbursement Workflow (2026-06-09) — cache JS `?v=59`

Built this session. User workflow: regular ฿6,000 monthly top-up (16th) + ad-hoc project top-ups; employees record expenses, finance transfers directly; overpaid amounts sometimes added to salary.

- **Migration (APPLIED ✅):** `20260609_petty_cash_settings_and_reimbursed.sql` — `petty_cash_settings` singleton (`monthly_topup_amount` default ฿6,000), `reimbursed_at` on `cash_transactions` + `travel_claims`, partial indexes.
- **API:** `getPettyCashSettings`/`savePettyCashSettings`, `getPendingReimbursements`, `markReimbursed`.
- **PETTY CASH:** negative-balance banner (suggested top-up = |deficit| + monthly); one-click "Record ฿X Top-up" pre-fills the form; **Payment Details panel** — per-employee expandable cards, "Mark paid" per employee + "Mark All Paid", grand total. Setup gained editable "Monthly Regular Top-up Amount".
- **Monthly report:** 5th tile SUGGESTED TOP-UP + summary-text line.
- **✅ Known bug (→ Round 13 WS3):** Payment Details grand total double-counted travel claims — fixed in R13-03 (2026-06-10).

---

## ✅ Round 11 — P5-V 12 Fixes + Employee Expense Badge (2026-06-09) — cache JS `?v=58`

- **12 P5-V fixes** (see P5-V section below for the itemised list): currency auto-convert, category filtering (later reverted in R13 plan), mileage form redesign (Travel Type → Personal Vehicle/Public Transport), round-trip route, TR-YYYYMM-NNNN generation, balance color indicators, deadline banner, advance-payment tracking.
- **Employee expense badge:** `badge-expenses` employee branch in `app.html` `loadExpenseBadge()` counts unseen approved/rejected items via localStorage (`exp_seen_*`/`claim_seen_*`/`trip_seen_*`). `_txnTable`/`_claimTable`/`_tripTable` show NEW chip + green row highlight; cleared on first view (same pattern as leave badge). Cache `?v=57`→`?v=58`.
- **Migration (APPLIED ✅):** `20260609_expense_categories_for_employee.sql` — `for_employee` flag (NOTE: R13 plan reverts the employee-side filter that used it, but the column stays harmless).

---

## ✅ Round 10 — Security & Correctness Audit Remediation (2026-06-09) — cache JS `?v=56`, CSS `?v=29`

Source: `AUDIT_PLAN_2026-06-09.md` + `CONSOLIDATED_AUDIT_PLAN_2026-06-09.md` (both files deleted after completion).

### ✅ R10-01 · Trip settlement ledger schema mismatch — P0 fix *(2026-06-09)*
Every settlement approval was failing with a DB constraint violation: `source = 'travel_settlement'` was not in the `cash_transactions.source` CHECK (only `'manual'`, `'travel_claim'` allowed). Also `source_ref` was being set to `trip.travel_ref` (a text string) instead of `trip.id` (UUID), causing a type error.
**Fix:** Migration adds `'travel_settlement'` to CHECK + partial unique index to prevent duplicate settlement rows per trip. JS fix: `source_ref` now always writes `trip.id`.
**⚠️ Apply in Supabase Studio:** `supabase/migrations/20260609_fix_settlement_source.sql`
**Files:** `supabase/migrations/20260609_fix_settlement_source.sql`, `js/api/expenses.js`.

### ✅ R10-02 · XSS hardening — HTML escaping helpers added *(2026-06-09)*
`js/format.js` had no HTML escaping utilities. Several pages interpolated user-controlled values (project names, tag names, tag colors) directly into `innerHTML`, creating XSS and CSS injection vectors.
**Fix:** Added `esc(s)`, `attr(s)`, `safeColor(v, fallback)` exports to `format.js`. Applied to all identified injection points in `tracker.js` (tag chips, project/client names in dropdowns) and `entryModal.js` (tag chips, tag picker, project options).
**Files:** `js/format.js`, `js/pages/tracker.js`, `js/components/entryModal.js`.

### ✅ R10-03 · Silent badge loader failures surfaced *(2026-06-09)*
`app.html` leave badge loader and expense badge loader had empty `catch {}` blocks, swallowing errors silently.
**Fix:** Both replaced with `catch (e) { console.warn('[badge] ... failed', e); }`.
**Files:** `app.html`.

### ✅ R10-04 · `schema.sql` bootstrap drift repaired *(2026-06-09)*
`schema.sql` referenced `is_manager_of()` in 6 RLS policies but never defined it. Phase 4 tables (`leave_types`, `public_holidays`, `leave_balances`, `leave_requests`, `flex_holiday_swaps`) and their triggers and RLS were absent. A fresh bootstrap from `schema.sql` alone would fail.
**Fix:** Added Phase 4 section, `is_manager_of()` function definition, and updated `cash_transactions.source` CHECK to include `'travel_settlement'`. Header comment added explaining migration files are source of truth.
**Files:** `supabase/schema.sql`.

### ✅ R10-05 · Assignment role validation trigger *(2026-06-09)*
`project_assignments` and `task_assignments` had no DB-level enforcement that the assignee holds a `manager` or `admin` role. The column was named `manager_id` by convention only.
**Fix:** Migration adds `BEFORE INSERT OR UPDATE` trigger on both tables via `check_assignment_role()`. Group-type task assignments are skipped (cannot be role-checked by profile).
**⚠️ Apply in Supabase Studio:** `supabase/migrations/20260609_assignment_role_guard.sql`
**Files:** `supabase/migrations/20260609_assignment_role_guard.sql`.

### ✅ R10-06 · Sub-tab pending badges — Leave Request + Flex Request tabs *(2026-06-09)*
See P5-N above (moved to completed).

### ✅ R10-07 · N+1 aggregation queries replaced with server-side RPCs *(2026-06-09)*
`getProjectStats()` fetched all `time_entries` for a project and summed in JS. `getTagUsage()` fetched all `time_entry_tags` rows and counted in JS. Both caused unnecessary full-table transfers.
**Fix:** New `get_project_stats(p_project_id)` RPC aggregates server-side (keeps `billable_rate` private). New `get_tag_usage()` RPC returns `{tag_id, usage_count}` rows. JS callers updated.
**⚠️ Apply in Supabase Studio:** `supabase/migrations/20260609_project_stats_rpc.sql`
**Files:** `supabase/migrations/20260609_project_stats_rpc.sql`, `js/api/projects.js`, `js/api/tags.js`.

### ⏸ R10-D · Deferred audit items (require design decision or user action)
| Item | Status | Reason |
|------|--------|--------|
| P0 OAuth client secret rotation | **User action needed** | Rotate in Google Cloud Console → update Supabase Auth → delete local `Google Cloud/` credential JSON |
| P1 Approval tier enforcement | ⏸ Design needed | State machine (pending→mgr_approved→finance_approved) must be agreed for leave/expense/travel before coding |
| P1 Plain-text employee PII | ⏸ Design needed | Choose between Supabase Vault / pgcrypto / app-level encryption; backup required before migration |
| P2 Profiles data exposure | ⏸ Design needed | Decide which `profiles` columns are safe for all users vs. admin-only before RLS/view split |
| P3 Auth overhaul (I-04) | ⏸ Parked by design | Full 5-role RLS matrix — major architectural effort |
| P3 Manual cache-busting | ⏸ Deferred | Vite/esbuild would change build pipeline — out of scope |

---

## ✅ Round 9 — Selector standardisation, week numbers, currency, trip project (2026-06-08) — cache JS `?v=55`, CSS `?v=29`

### ✅ R9-01 · Shared `weekNav` component — project default selector
Created `js/components/weekNav.js` exporting `weekNavHtml(idPrefix, monday, {allowAll})`, `wireWeekNav(idPrefix, get, set, reload)`, `updateWeekNavLabel(idPrefix, monday)`. Built from the Timesheet pattern (‹/› buttons, clickable label → native date picker via `showPicker()` + fallback, snap-to-Monday). `allowAll:true` adds "This week / Show all" for filter pages.
**Migrated to use it:** `timesheet.js` (ts), `expenses.js` (ap = approvals, pc = petty cash, wr = weekly report — removed local `_mondayOf`/`_weekBar`/`_wireWeekBar`), `dashboard.js` (db). Calendar keeps its own nav (FullCalendar owns navigation) but matches the style.
**This is now the project default** — documented in `CLAUDE.md`. Any new week/period selector must use this component.
**Files:** `js/components/weekNav.js` (new), `js/pages/timesheet.js`, `js/pages/expenses.js`, `js/pages/dashboard.js`, `CLAUDE.md`.

### ✅ R9-02 · ISO week number in the selector
Added `getISOWeek(date)` to `js/format.js`. The `weekNav` component renders a muted "Wk N" span after the › button; `updateWeekNavLabel` refreshes both the date-range label and the week number on navigation (fixes a stale-number bug). Calendar shows it too — hidden in month view, shown in week/day view via the `datesSet` callback.
**Files:** `js/format.js`, `js/components/weekNav.js`, `js/pages/calendar.js`, `css/style.css` (`.week-nav-wknum`).

### ✅ R9-03 · TEAM LEAVE main-tab badge
The Leave & Holidays nav badge had no matching badge on the TEAM LEAVE **main tab** (only on the Approvals sub-tab). Added `id="main-badge-teamleave"` span + wired it into `_syncLeaveBadges()` + seeded it after data load.
**Files:** `js/pages/holidays.js`.

### ✅ R9-04 · Currency default = USD; user-pref aware selects
`format.js` `DEFAULTS.currency` `'THB'` → `'USD'` (app default; overridden by `profile.currency`). New `getDefaultCurrency()` export. In `expenses.js`: `setFormatPrefs(profile)` seeds it; new `_curOpts(sel)` helper pre-selects the user default. Expense form `ex-cur` and a **new** trip-form `tp-cur` select use it; trip submit reads `tp-cur` instead of hardcoded `'THB'`. Edit modals unchanged (pre-select saved value).
**Files:** `js/format.js`, `js/pages/expenses.js`.

### ✅ R9-05 · Trip request — project mandatory
New `_projOptionsReq(sel)` (no blank option, first project auto-selected). Trip request form + trip edit modal: label "Project *", `required`, uses the new helper. Other forms (expense, mileage) keep optional `_projOptions()`.
**Files:** `js/pages/expenses.js`.

### ⏸ R9-06 · FX conversion at export date — cost memo only (no code)
**Decision recorded, not built.** Policy chosen: convert using the FX rate **as of the export date**, for both auto export and user export. **Cost answer:** $0 / no setup burden **if** rates are pulled automatically (free no-key API e.g. Frankfurter.app, or Google `GOOGLEFINANCE` in the Sheets job); **only manual admin entry adds setup cost** (a Setup CRUD UI + recurring task). Targets exports that mostly don't exist yet (expense reports are display-only; auto-export is parked). **Open decision: rate source (deferred).** Flag: export-date rate is not reproducible for re-exports of past periods. Full memo: `~/.claude/plans/eager-pondering-crane.md`.

---

## ✅ Round 8 — UX Improvements (2026-06-08) — cache `?v=45`

### ✅ R8-01 · HISTORY shows all statuses, not just settled *(2026-06-08)*
**Expense & Travel APPROVALS → HISTORY tab:** removed `_settled` filter — now shows ALL requests (pending / manager_approved / approved / rejected / completed) sorted by date desc. Header updated to "All Requests (N)".
**Leave & Holidays APPROVALS → HISTORY tab:** same — removed `status !== 'pending'` filter. "No settled requests…" → "No requests in this range".
**Files:** `js/pages/expenses.js`, `js/pages/holidays.js`.

### ✅ R8-02 · Admin edit popup for all request types *(2026-06-08)*
Admin can click **Edit** on any row in Expense APPROVALS (PENDING + HISTORY) to open a pre-filled modal form:
- **Expense:** date, amount, category, project, currency, receipt URL, note.
- **Mileage claim:** date, vehicle, trip type, route, distance/manual amount, note.
- **Trip request:** destination, dates, purpose, project, estimated cost, currency. (Cost line items not editable via modal.)
- **Leave request (Leave APPROVALS PENDING + HISTORY):** leave type, start/end date, notes.
On save: calls `updateTransaction` / `updateTravelClaim` / `updateTripRequest` / `updateLeaveRequest`, toasts success, reloads the tab. Does NOT change the request's approval status.
**New API functions:** `updateTransaction`, `updateTravelClaim`, `updateTripRequest` in `js/api/expenses.js`; `updateLeaveRequest` in `js/api/leaves.js`.
**Files:** `js/api/expenses.js`, `js/api/leaves.js`, `js/pages/expenses.js`, `js/pages/holidays.js`.

### ✅ R8-03 · Expense REPORT — compact layout *(2026-06-08)*
Monthly and weekly reports now wrap content in `max-width:860px` so text no longer stretches edge-to-edge.
"Expenses by Project" and "Expenses by Person" tables are stacked vertically (removed side-by-side flex) — easier to read.
**Files:** `js/pages/expenses.js`.

---

## 🆕 Phase 5 — Expense & Travel (M4) — built + REVISED 2026-06-08

**Revised after reading the real HE Google Forms.** The first cut was a generic SaaS expense tool; rebuilt to match the actual workflow: a **single petty-cash float ledger** (top-ups in / expenses out, project-tagged) + **hybrid travel** (mileage auto-calc + trip pre-approval) + **dual pay cadence** reporting.

### ⚠️ Apply migration to Supabase Studio before testing
File: `supabase/migrations/20260615_expense_travel.sql` (rewritten — **do not** use the earlier generic version)
1. Paste into Supabase Studio → SQL Editor → Run
2. Run `NOTIFY pgrst, 'reload schema';`
3. ⚠️ Set real **per-km vehicle rates** (PETTY CASH → Setup) — seeded with placeholders.
4. Hard-refresh app (Ctrl+F5) to load `?v=39`

### What was built
- **5 DB tables:** `expense_categories` (HE real list, `applies_to` in/out/both), `cash_transactions` (petty-cash ledger: direction in/out, project FK, running balance), `vehicle_rates` (admin per-km), `travel_claims` (mileage auto-calc; trigger snapshots rates + computes reimbursement/depreciation; on approval auto-posts an 'out' line to the ledger), `travel_requests` (pre-approval, `TR-YYYYMM-NNNN`).
- **RLS:** own / `is_manager_of()` / `is_admin()`. Top-ups (`direction='in'`) + rate/category writes are admin-only.
- **API (`js/api/expenses.js`):** categories, vehicle rates, cash ledger (submitExpense, recordTopup, getRunningBalance, approve/reject/override), mileage claims (+ `previewMileage`), trip requests. Reuses `projects.js`.
- **Page (`js/pages/expenses.js`):** 5 tabs — MY EXPENSES · MY TRAVEL (Mileage Claim + Trip Request) · APPROVALS (admin/mgr) · PETTY CASH (admin: top-up + balance + all-transactions + setup) · REPORT (admin: Monthly FT 14th-deadline / Weekly PT-outsource Monday).
- **Nav badge:** `badge-expenses` counts pending cash_transactions(out) + travel_claims + travel_requests.

### Deferred (non-blocking)
| Item | Reason |
|------|--------|
| Finance 2nd-tier approval | Finance role not in current `is_admin()` model — admin proxies |
| Timesheet "Business Trip" auto-fill on trip approval | Needs M1 rework |
| Per-entry timesheet **approval** for weekly wage | time_entries has no status column — M1 enhancement; weekly report sums logged hours |
| Map-based distance auto-fill from route | Manual km entry for now |
| Receipt file upload, currency auto-conversion, per-diem (OD-12) | URL field / single currency for now |
| Automated 09:30 / Monday-AM summary delivery | Scheduled job — folds into parked Google Sheets auto-export |

### ✅ P5-V · Full functional check — Round 11 remediation complete (2026-06-09, JS `?v=57`)

**Round 11 fixes applied (cache JS `?v=57`):**
- **#1 Currency auto-conversion** — `_wireCurrencyConvert()` + Frankfurter.app FX on `ex-cur` change in My Expenses.
- **#2 Category filtering** — `_catPersonal()`: employees see only personal categories (Import Tax, Shipping & Handling, Travel Expense, Other); admin sees all. Migration: `20260609_expense_categories_for_employee.sql` (⚠️ apply in Studio).
- **#3/#4/#5 Mileage form redesign** — Travel Type selector (Personal Vehicle | Public Transport). Personal Vehicle: Car/Motorcycle sub-select + one-way/round-trip + route boxes. Round-trip: 2 boxes (Start + Destination), route auto-composed as A→B→A. Public Transport: always one-way, transport type text input, amount paid field, no ฿/km display.
- **#6 TR-YYYYMM-NNNN** — Generated in `approveTripRequest` (JS, finance tier) via Supabase count query. Format: `TR-YYYYMM-NNNN`.
- **#7 Color indicators** — Amounts: IN = green in petty cash ledger; mileage reimbursement = green; CLOSING balance = green/red.
- **#8 Opening/closing balance** — Confirmed working; CLOSING now always colored (green positive / red negative).
- **#9 Deadline banner** — Red background at ≤2 days or overdue; orange at ≤5 days; blue otherwise.
- **#10 Advance payment tracking** — Monthly report "Advances to Reimburse with Salary" section: approved personal-category expenses grouped by employee, total highlighted in green.
- **#11 PT/outsource weekly summary** — Confirmed working ✅.
- **#12 RLS isolation** — Not formally tested (⚠️ defer to go-live checklist).

**✅ All 5 pending migrations APPLIED in Studio (2026-06-09, user-confirmed):**
1. `20260609_fix_settlement_source.sql`
2. `20260609_assignment_role_guard.sql`
3. `20260609_project_stats_rpc.sql`
4. `20260609_expense_categories_for_employee.sql`
5. `20260609_petty_cash_settings_and_reimbursed.sql`
**Only outstanding migration:** ⚠️ `20260609_pt_daily_rate.sql` (created in Round 13, 2026-06-10 — NOT yet applied in Studio).

### 🟡 P5-V · Original checklist (handle later — needs migration applied + login)
Once `20260615_expense_travel.sql` is applied and a user is logged in, verify end-to-end:
- [ ] Submit expense (linked user) → approve in APPROVALS → appears in PETTY CASH; running balance drops.
- [ ] "Other" category → required details box appears and is captured in the note.
- [ ] Record top-up (admin) → balance rises; non-admin cannot see/submit top-ups.
- [ ] Mileage claim (car, round-trip) → preview matches; approve → auto-posts "Travel Expense Reimbursement" line; balance reflects it.
- [ ] Mileage claim (public transport) → full amount paid is required and reimbursed.
- [ ] Route boxes: 2 for one-way / 3 for round-trip; "+ Add stop" works; joined route saved correctly.
- [ ] Trip request → approve → `TR-YYYYMM-NNNN` issued.
- [ ] REPORT Monthly: by-project + by-person totals, opening/closing balance, 14th holiday-aware deadline banner.
- [ ] REPORT Weekly: PT/outsource logged hours, Monday banner, missing-timesheet flag.
- [ ] RLS: a non-admin cannot read others' transactions; anon cannot read any.

### ✅ P5-N · Tab-level pending badges across WMS *(2026-06-09)*
Leave & Holidays sub-tabs now show live pending counts: "Leave Request" shows pending leave count (`hub-badge-teamleave`), "Flex Request" shows pending flex count (`hub-badge-teamflex`). Both wired into `_syncLeaveBadges()`. Notifications page tab badges deferred (no Notifications-page sub-tab badges yet).
**Files:** `js/pages/holidays.js`.

### ✅ P5-D · Decisions ANSWERED (2026-06-09) — feed Round 13
- [x] **A — Vehicle rates:** Motorcycle ฿6/km, Car ฿10/km. **Already matches** existing seed (moto 5.50+0.50, car 9.00+1.00). No DB change.
- [x] **B — PT/outsource rate:** ฿550/day via morning + afternoon **sessions**, half-day = ฿275 each. Recorded via existing timesheet (4h ≈ 1 session).
- [x] **C — Approval depth:** Keep **2-tier**. No change.
- [x] **D — Wage posting:** **One-click** with a review modal (amounts editable = manual-entry option). → Round 13 WS4.
- [x] **E — Map-based distance:** Distance input only for now; map is a future upgrade.

---

## ✅ Round 7 — Security & Correctness Audit (2026-06-08)

### ✅ R7-01 · RLS hardening — anon access blocked *(2026-06-08)*
`task_assignments`, `tags`, `groups`, `group_members`: `FOR SELECT USING (true)` → `USING (auth.uid() IS NOT NULL)`. **Live-verified:** anon probe returned real group names before; returns 0 rows after. Migration applied: `20260613_audit_rls_hardening.sql`. `schema.sql` mirrored.

### ✅ R7-02 · jtcr_admin policy uses is_admin() helper *(2026-06-08)*
`job_title_change_requests`: replaced hardcoded `role = 'admin'` with `is_admin()`. Applied as part of `20260613_audit_rls_hardening.sql` + `20260611_job_title_change_requests.sql` (table was missing from live DB — applied this session).

### ✅ R7-03 · DB integrity constraints added *(2026-06-08)*
Four `CHECK` constraints applied via `20260613b_audit_constraints.sql`: (1) `leave_requests` hours granularity requires `duration_hours`; (2) cross-type deduction requires `deducted_from_type`; (3) flex 'move' swap requires `substitute_date`; (4) `leave_balances.allocated_days >= 0`. All violation pre-checks returned 0.

### ✅ R7-04 · Leave API client-side validation *(2026-06-08)*
`js/api/leaves.js`: added guards in `submitLeaveRequest` (date order, hours granularity, cross-type pool) and `submitFlexSwap` (move swap requires substitute date). Throws clear user-facing messages.

### ✅ R7-05 · Silent error catches surfaced *(2026-06-08)*
8 `.catch(() => {})` blocks across `timesheet.js`, `calendar.js`, `reports.js`, `dashboard.js` replaced with `.catch(err => window.showToast?.(err.message, 'error'))`. Cache: JS `?v=38`.

### ✅ R7-06 · Pending migrations applied to live DB *(2026-06-08)*
`20260611_job_title_change_requests.sql`, `20260610_sync_profile_names.sql` applied. `20260609_leave_type_default_days.sql` was already present.

### ✅ R7-07 · Stale temp files deleted *(2026-06-08)*
Deleted 5 Dropbox conflict artifacts: `js/pages/holidays.js.tmp.17144.*` (×3), `HE_WMS_Specification.md.tmp.17144.*`, `js/api/leaves.js.tmp.17144.*`.

### ✅ R7-08 · Audit report written *(2026-06-08)*
Full findings documented in `AUDIT_2026-06-08.md` — 8 findings fixed, 6 architectural recommendations noted (PII encryption, profiles column-masking, transactional RPCs, centralized `_esc()`, N+1 aggregations, build-step cache-busting).

---

## ✅ Round 6 (2026-06-07)

### ✅ R6-01 · Calendar time column — clean axis *(2026-06-07)*
**Done:** in the FullCalendar timegrid time-axis column, (1) removed the horizontal slot lines (`.fc-timegrid-slot-label { border-top-color: transparent }` — day-column gridlines stay), and (2) centered each time label on its gridline (`.fc-timegrid-slot-label-cushion { transform: translateY(-50%) }`). **Verified** in a FullCalendar v6.1.15 harness. Cache: `calendar.css?v=21`.
**Files:** `css/calendar.css`, `app.html`.

### ✅ R6-02 · Toast — 10s auto-dismiss + manual ✕ *(2026-06-07)*
**Done:** `window.showToast` (app.html) now auto-dismisses after **10s** (was 3.5s) and renders a **✕ button** that clears the timer and removes the toast. `.toast` is now a flex row with `.toast-msg` + `.toast-close`. **Verified** in a harness (✕ click: before=1→after=0; 10s timeout observed). Cache: `style.css?v=26`; `app.html` unversioned → hard refresh. Reference doc toast entries updated.
**Files:** `app.html`, `css/style.css`, `UI_NAMING_REFERENCE.html`.

### ✅ R6-03 · Alternate preview port per session *(2026-06-07)*
**Done:** `.claude/launch.json` now defines a pool of explicit-port configs — `timesheet-3030/4040/5050/6060`. Standing rule (memory `feedback-preview-ports.md`): when starting a preview, pick the lowest free port; if 3030 is held by another session, use the next — sessions never collide.
**Files:** `.claude/launch.json`, memory.
**Reference (no action):** LAN review — serve binds to `0.0.0.0` (open firewall for `http://<LAN-IP>:<port>`), but Google OAuth login needs a tunnel (cloudflared/ngrok → https, whitelisted in Supabase + Google) since private IPs aren't valid OAuth redirects.

---

## 🆕 Newly reported (2026-06-06, Round 5) — next session

### ✅ R5-01 · **Avatar dropdown menu** centered in the nav panel *(2026-06-07, RESOLVED — was a misidentified element)*
**Root of the long-running confusion:** "profile modal not centered" was always interpreted as the **"Edit profile" dialog**, and several rounds tried to center that. The user clarified (2026-06-07) they meant the **avatar dropdown menu** (Profile/Workspace settings/Preferences/Log out) that pops up from the bottom-left nav — it should be centered *within the sidebar*, not left-anchored.
**Done:** `.avatar-dropdown` changed from `left:0` to `left:50%; transform:translateX(-50%)` — now horizontally centered in the 250px sidebar. **Verified** in a standalone harness (dropdown sits symmetric on the sidebar center line).
**Reverted:** the earlier `profileModal.js` changes (body-append + inline positioning) — they targeted the wrong element and the Edit-profile dialog was never broken. File restored to original mount logic.
**Files:** `css/style.css` (`.avatar-dropdown`).

### ✅ R5-02 · Team selectors — clear "✕" button added *(2026-06-07)*
**Done:** All 3 team employee pickers (Team Leave, Team Flex, Team Balance) now wrap the `<input list>` in `.emp-select-wrap` with an overlaid `.emp-clear-btn`. `_wireEmpSelect` wires the ✕ click to `input.value = ''; onSelect(null)` and also calls `onSelect(null)` when the input is manually cleared. CSS added to `style.css`.
**Files:** `js/pages/holidays.js`, `css/style.css`.

### ✅ R5-03 · Notifications dismiss "✕" — now shown for admins too *(2026-06-07, extended)*
**Done (part 1):** "Dismiss" text button → compact `✕` icon button. Dismiss logic (localStorage + card removal) unchanged.
**Done (part 2 — admin gap):** the RECENT NOTIFICATIONS cards were only rendered in the non-admin branch of `_render`, so admins never saw the ✕. Extracted `_buildNotifBlock()` + `_wireDismiss()` helpers; the admin branch of `_load()` now also fetches the admin's own approved/rejected leave (filtered from the queue) + own flex/name-change/job-title requests and renders the same dismissable cards at the top of the admin Notifications view.
**Files:** `js/pages/requests.js`.

### ✅ R5-04 · Leave request & flex swap date pickers reject weekends *(2026-06-07)*
**Done:** added `_isWeekend()` / `_nextWeekday()` / `_wireWeekendBlock()` helpers in `holidays.js`. Native `<input type="date">` can't disable weekend days in the picker, so: (1) defaults snap to the next weekday; (2) a `change` guard clears the field + toasts if a Sat/Sun is picked; (3) a submit-time guard rejects weekend start/end (leave) and weekend substitute dates (flex). Applied to **Leave request** (`hl-ml-*`), **Team Leave** (`hl-tl-*`), **Flex swap** (`hl-flex-sub`, already had a submit check), **Team Flex** (`hl-tf-sub`). WFH date left as-is (not requested).
**Files:** `js/pages/holidays.js`.

### ✅ R5-06 · UI Naming Reference (standalone HTML) *(2026-06-07)*
**Why:** the R5-01 saga (avatar dropdown menu repeatedly miscalled "profile modal") showed we lacked a shared vocabulary. **Done:** created `UI_NAMING_REFERENCE.html` in the project root — a self-contained (no deps), dark-themed, tabbed, searchable catalog of every page, tab, section, and component with its canonical name, CSS selector, and "avoid" aliases. Tabs: ★ Naming Rules · 🗺 Layout Map · App Shell · Navigation · Tracking · Analyze · Manage · WMS · Dialogs & Modals. The **Layout Map** tab is a labelled CSS wireframe of the app shell (name + selector on each region), now including the **Toast / error popup** (`#toast-container`/`.toast.error` — distinguished from the Notifications page), a **Top bar anatomy** wireframe (`#topbar` → `#topbar-left` `.topbar-title` + page controls · `.topbar-spacer`), a 3-way **Menu vs Dialog vs Popup** comparison, AND a **per-page content layout** selector covering all 12 pages (each page's `#content` blocks/tabs with names + selectors, since the content area differs per page). **Verified** render + tab switch + search filter + Layout Map + per-page switching in browser. **Maintenance rule wired in** (app.html checklist step 4 + nav-placement memory + file footer): any new/renamed page or section must update this file's `TABS` array in the same change.
**Files:** `UI_NAMING_REFERENCE.html` (new).

### ✅ R5-05 · Notifications page split into tabs *(2026-06-07)*
**Done:** admin Notifications view restructured into 3 tabs using `.tabs`/`.tab-btn`/`.tab-panel` (show/hide, so action handlers stay wired): **DELETION** · **PROFILE CHANGES** · **LEAVE REQUESTS**. Name-change + job-title requests combined under the single "PROFILE CHANGES" tab (two sub-sections). Tab counts shown as badges. Active tab persists in `_adminTab`. RECENT NOTIFICATIONS cards remain above the tab bar. **Verified** tab render + switching in a harness.
**Files:** `js/pages/requests.js`, (uses existing `.tabs` CSS in `style.css`).

---

## 🔴 Blocking

### ✅ B-01 · Link test employee for leave/flex testing *(2026-06-06)*
David Bowman (NNN 003) linked to `hubbleengineering@gmail.com`. Leave request submitted and approved end-to-end. Flex swap submitted (pending approval — action via APPROVALS tab).

---

## 🟡 Important (before go-live)

### ✅ I-06 · Leave & Holidays tab restructure *(2026-06-06, extended 2026-06-06)*
**Done:** (1) "Specific hours" granularity removed — Full day / Half day only. (2) MY LEAVE + REQUEST merged into single LEAVE tab. (3) 2-level tab architecture: primary = HOLIDAYS · MY LEAVE · TEAM LEAVE; secondary per hub. (4) Admin `_myEmployee` lookup added (fixes "No employee record linked" for admin). (5) `flex_holiday` filtered from leave type dropdowns. (6) Rejection reason shown in MY LEAVE and FLEX SWAP history. (7) Search box added beside Team Leave / Team Flex dropdowns. (8) Approvals sub-tab order: PENDING · SCHEDULE · HISTORY. (9) History date filter now optional (empty = show all). (10) BALANCES = own balance only (all users) with synthetic policy-defaults fallback. TEAM BALANCE = admin/mgr employee search. (11) Date/time picker icons fixed with `color-scheme: dark`. (12) Reports nav chevron removed. (13) Holidays year selector: `<select>` + btn-ghost styled prev/next. (14) LEAVE REQUESTS section added to Requests page (read-only).
**⚠️ Apply migrations:** `supabase/migrations/20260609_leave_type_default_days.sql` AND `supabase/migrations/20260610_sync_profile_names.sql` in Supabase Studio.
**Files:** `js/pages/holidays.js`, `js/pages/requests.js`, `css/style.css`, `app.html` (v=30)

### I-01 · Sci-fi roster ↔ real team mismatch → **Go-live checklist #6** *(renumbered 2026-06-12)*
**Decision (2026-06-11):** keep the sci-fi demo roster through all review & revision rounds; swap to the real Hubble Engineering roster only **after the user approves the app**.
**What:** The demo sci-fi roster spreads employees across all 6 departments for variety. The real Hubble Engineering team is predominantly Mechanical Engineering.
**Impact:** Department badges, team groupings, and filter views do not reflect the real company structure. Not a functional bug — purely a data issue.
**Action after approval:**
1. Recall `real-employee-roster.md` from memory
2. Re-run `supabase/seeds/employees_import.sql` with the real names (TRUNCATE CASCADE first — RSK-0, confirm)
3. Correct department codes for any mismatches
4. ~~Re-link all employees to their real Google accounts~~ **Provision real accounts via `provision-users`** (2026-06-12 login overhaul — accounts created pre-linked; Google linking optional per user)

### ✅ I-02 · `used_days` balance auto-deducted on approval *(2026-06-06)*
**Done:** Migration `supabase/migrations/20260608_leave_balance_auto_deduct.sql` adds trigger `trg_sync_leave_balance` on `leave_requests`. Deducts Mon–Fri days when status→approved; restores if overridden back.
**⚠️ Apply if not yet done:** Paste into Supabase Studio SQL editor and run. Verify: approve a leave → check `used_days` incremented in `leave_balances`.

### ✅ I-03 · Leave balance initialisation UI *(2026-06-06)*
**Done:** New BALANCES tab (admin-only) added to Leave & Holidays page. Year selector, "Initialize Year" button, inline editable table (employee × leave type, allocated + carry-over). Each row Save-able via `upsertLeaveBalance()`.

### I-04 · Auth overhaul (Phase 1) → **Go-live checklist #3 (login overhaul) + #4 (R25 RLS sweep)** *(split & spec'd 2026-06-12)*
**What:** Originally one item — full 5-role RLS matrix + RPC guards. Now split: the **login overhaul** (Employee ID + admin-issued password, optional TOTP, sign-ups disabled — full 🔐 spec in the go-live checklist) builds first; the **R25 RLS sweep** follows and validates the final auth model. The R20-deferred RPC guards (`get_project_stats`, `get_tag_usage`) were already fixed in R23 (`20260630_security_hardening.sql`, probe-verified).
**Files:** `supabase/schema.sql`, RLS migrations, new Edge Functions (`provision-users`, `admin-reset-password`), `js/auth.js`, login UI.
**Status:** 🟡 Spec'd, awaiting build (after backup pipeline). See [HE_WMS_Specification.md §3](HE_WMS_Specification.md).

### ✅ I-05 · Deletion + name-change request approval UI *(2026-06-06)*
**Done:** New Requests page (`js/pages/requests.js`) added to WMS nav. Shows pending deletion requests (approve-deletes entity, reject marks rejected) and name-change requests (approve updates `profiles.name`). Badge moved from Teams → Requests nav item. Route `#requests` added to `wmsRoutes` + pages object. Cache bumped to `?v=28`.

---

## 🟢 Polish / Defer

### ✅ P-01 · `util/employeeId.js` dead code removed *(2026-06-06)*
Confirmed no imports anywhere — file deleted.

### ✅ P-02 · Holiday modal dept dropdown now shows department labels *(2026-06-06)*
`_openHolidayModal()` now uses `e.department.label` from the joined employee data instead of raw `department_code`.

### ✅ P-03 · Manager employee selector in REQUEST / FLEX tabs *(2026-06-06)*
`_renderRequest()` and `_renderFlex()` now show the employee selector for `(_admin || _manager)`. Submit empId resolution updated to match.
⚠️ **Note:** I-06 will revert this — employee selector moves to dedicated TEAM LEAVE / TEAM FLEX admin tabs.

### ✅ P-04 · Avatar comment fixed *(2026-06-06)*
`app.html` comment changed from "3-letter" to "2-letter".

### ✅ P-05 · GitHub Pages deploy + prod redirect URL *(DONE 2026-06-11, Round 24)*
Deployed to **https://he-cells.github.io/hubble-wms/** (public repo HE-cells/hubble-wms, app-only). Supabase Site URL + Redirect URLs set to prod (localhost kept for dev); prod Google login verified by user. Deploy workflow = commit + `git push`.

---

## ✅ Completed (this session — archive next session)

| ID | What | Done |
|----|------|------|
| ✅ | B-1: PostgREST FK ambiguity on `leave_requests ↔ leave_types` — fixed with `!leave_requests_leave_type_code_fkey` | 2026-06-06 |
| ✅ | B-2/B-3: Holiday calendar + list views — verified working, grouping fixed | 2026-06-06 |
| ✅ | B-4: Employee page issues — status save, manager pre-select, job title dropdown, link account UI | 2026-06-06 |
| ✅ | Holiday modal class `modal-overlay` → `modal-backdrop` (Add/Edit now visible) | 2026-06-06 |
| ✅ | Multi-day holiday grouping — timezone bug in `_datePlusDays()` fixed | 2026-06-06 |
| ✅ | Holiday sidebar width 220→380px; mini-month text 9→11px | 2026-06-06 |
| ✅ | Calendar: month view header shows "June 2026" not "Week of…" | 2026-06-06 |
| ✅ | Calendar: button order Month \| Week \| Day | 2026-06-06 |
| ✅ | Calendar: month-day click → week view time slots (requestAnimationFrame fix) | 2026-06-06 |
| ✅ | Calendar: holiday cells highlighted in month view (amber circle, `dayCellClassNames`) | 2026-06-06 |
| ✅ | Employee status resigned→active: `archived_at` cleared, `status` saved | 2026-06-06 |
| ✅ | Employee direct_manager_id added to SELECT → manager dropdown pre-selects | 2026-06-06 |
| ✅ | Manager access to APPROVALS tab (approve/reject/override); `is_manager_of()` RLS | 2026-06-06 |
| ✅ | APPROVALS: PENDING / HISTORY / SCHEDULE sub-views | 2026-06-06 |
| ✅ | Override / undo any leave or flex swap status with notes | 2026-06-06 |
| ✅ | MY LEAVE / FLEX SWAP: past settled requests hidden by default, "Show past" toggle | 2026-06-06 |
| ✅ | In-app leave decision notification badge on nav item | 2026-06-06 |
| ✅ | Sci-fi employee roster (16 names, NNN 001–016) — real roster saved in memory | 2026-06-06 |
| ✅ | Job title dropdown with predefined list + "Add new title…" | 2026-06-06 |
| ✅ | Linked User Account UI in employee modal — admin links Google account to employee record | 2026-06-06 |
| ✅ | I-06: Leave & Holidays tab restructure (see entry above for full detail) | 2026-06-06 |
| ✅ | White buttons in APPROVALS fixed: Reject → btn-danger, Override → btn-ghost | 2026-06-06 |
| ✅ | BALANCES redesign: employee search for admin/mgr; own-balance only for regular user; read-only, no carry-over | 2026-06-06 |
| ✅ | Name sync: employees.full_name ↔ profiles.name on edit + name-change approval | 2026-06-06 |
| ✅ | Migration 20260609_leave_type_default_days.sql: adds default_days to leave_types (⚠️ apply in Supabase Studio) | 2026-06-06 |

---

## ✅ Rounds 2–4 (2026-06-06) — post-I-06 iterations

**Round 2 — smoke-test bug fixes:** rejected badge red (`badge-rejected`); Team Balance selector matched to Team Leave/Flex; paternity leave deactivated; **Court Leave** added (pools → personal); WFH option on Flex; leave-balance calc fixed (`allocated_days ?? default_days` + carry-over/adjustment); Requests page renamed **Notifications** + all users see own leave requests; profile name edit blocked for everyone (request flow); **job-title change request** flow + `job_title_change_requests` table; Team Groups dept-then-user filter.
*Migrations:* `20260611_leave_types_update.sql`, `20260611_flex_swap_type.sql`, `20260611_job_title_change_requests.sql`.

**Round 3 — features:** **POLICY** primary tab (full leave-policy doc); search typeahead on team selectors + employees page; **Flex** tab renamed with **Flex Swap / Work From Home** sub-tabs (WFH decoupled from holidays); 3-day dismissable notification cards; profile modal pulls Employee ID / Department / Start date from `employees`; profile modal centered in content area; prefs General read-only + per-tab OK/SAVE.
*Migration:* `20260612_flex_wfh_nullable_holiday.sql` (`waived_holiday_id` nullable for WFH).

**Round 4 — audit + hardening:** function audit ran (3 parallel passes). Fixes: defined missing CSS vars `--border-color`/`--surface-1`/`--surface-2`/`--text-secondary` in `tokens.css` (were used app-wide but undefined → transparent boxes); team selectors rebuilt as native `<input list>`+`<datalist>` (dropped fragile floating typeahead); profile + prefs modals fully read-only (name/job-title via request flow only); Notifications resilient to stale PostgREST cache (`getPendingJobTitleChangeRequests().catch(()=>[])`); transactional safety on review flows (name-change writes name before status; job-title approve has compensating revert); `adjustLeaveBalance` → `.maybeSingle()` + clear error; `reviewRequest` returns row; `team.js` opens profile modal via versioned dynamic import; deleted stale `app.html.tmp.*`. All 8 edited modules pass Node ESM syntax check; app boots with zero console errors.

**⚠️ Standing reminder — PostgREST schema cache:** after creating any table, run `NOTIFY pgrst, 'reload schema';` in Supabase SQL Editor or queries 404 with "Could not find the table … in the schema cache."

**⚠️ Open audit items (not yet scheduled):** non-transactional multi-step writes are best-effort only (no DB transaction from client — consider RPCs); cache-busting covers only top-level page modules (static sub-imports rely on browser revalidation → hard-refresh to be safe); second stale temp file `HE_WMS_Specification.md.tmp.*` left in root pending user's call.
