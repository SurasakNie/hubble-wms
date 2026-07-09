# Project Instructions — WMS / Interactive Timesheet

> These rules apply to every session in this project.
> They extend (not override) the global CLAUDE.md.

---

## Project Tooling

- **`wms-build` skill** (`.claude/skills/wms-build/`) — three modes for the recurring scaffolding chores. Invoke explicitly or by intent:
  - `/wms-build page` — scaffold a new WMS page (module + 4-step nav wiring + route + cache bump).
  - `/wms-build migration` — scaffold `YYYYMMDD_*.sql` (RLS template + `NOTIFY pgrst` + Studio reminder + master-plan row).
  - `/wms-build close` — end-of-session docs ritual (Round N entry, memory, cache baseline).
- **Cache-bump nudge** (`SessionStart` hook → `.claude/hooks/check-cache.ps1`) — read-only; if any `js`/`css` file is newer than `app.html`'s last edit, it warns at session start that the cache version may be un-bumped. Never edits files. (This project is not a git repo, so it uses a modification-time heuristic.)

---

## Default Components

### Employee Selector

**Always use the shared `empSelect` component** for any employee datalist picker. Never write a custom one.

```js
import { empSelectHtml, wireEmpSelect, empOptionLabel } from '../components/empSelect.js';
```

**Pattern — admin/manager picker in a topbar slot:**
```js
// In topbar HTML (only render if admin/manager):
`<span id="mypage-emp-slot" style="display:inline-flex;margin-left:var(--sp-3);"></span>`

// After fetching employees:
const emps = (await getEmployees()).filter(e => e.user_id && e.user_id !== profile.id);
slot.innerHTML = empSelectHtml('mypage', emps, { placeholder: 'Myself' });
wireEmpSelect('mypage', emps, emp => { _viewUserId = emp?.user_id || null; _reload(); });
```

**Pattern — employee picker inside a page section (e.g. Team Leave):**
```js
// In innerHTML template:
${empSelectHtml('mypage', employees, { selectedId: _currentEmpId })}

// After HTML is in the DOM:
wireEmpSelect('mypage', employees, emp => { _currentEmpId = emp?.id ?? null; _reload(); });
```

**Key rules:**
- Component filters `active`/`probation` employees internally — pass the full list.
- `onSelect` receives the full **employee object** (not just id). Extract what you need: `emp?.id` (leave pages) or `emp?.user_id` (time pages).
- Time pages: filter out employees without `user_id` before passing — `emps.filter(e => e.user_id && e.user_id !== profile.id)`.
- `idPrefix` must be unique per page to avoid ID collisions (e.g. `'tk'`, `'ts'`, `'cal'`, `'db'`, `'rp'`, `'hl-tl'`).
- Data source: `getEmployees()` from `js/api/employees.js` (includes `user_id`).
- CSS: `.emp-select-wrap` / `.emp-clear-btn` already in `style.css` — no new CSS needed. The native datalist arrow (▾) and the ✕ clear button are pre-styled to sit **side-by-side** (arrow shifted left via `::-webkit-calendar-picker-indicator { margin-right }`, ✕ pinned far right; arrow dark-theme-recolored with `filter: invert(0.8)`). **Never hide or re-style these per page** — adjust the shared `.emp-select-wrap` rules if ever needed.
- **`empSelect` is also the default for employee *search / filter* boxes**, not just single-pick pickers (e.g. the Employees Directory: pick → filter to that employee, ✕ → show all). Matching is **hyphen-tolerant** (an ID typed with or without hyphens resolves). **Never hand-roll an employee `<input type="search">`.**

---

### Week / Period Selector

**Always use the shared `weekNav` component.** Never write a custom week-navigation bar.

```js
import { weekNavHtml, wireWeekNav, updateWeekNavLabel } from '../components/weekNav.js';
```

**Pattern — page always has a week (e.g. Timesheet):**
```js
// In render / innerHTML template:
${weekNavHtml('mypage', _monday)}

// After HTML is in the DOM:
wireWeekNav('mypage', () => _monday, d => { _monday = d; }, _reload);

// At the top of _reload():
updateWeekNavLabel('mypage', _monday);
```

**Pattern — list/filter page with "Show all" (e.g. Expenses Approvals, Petty Cash):**
```js
// allowAll: true adds "This week" when no week is set, and "Show all" when one is.
${weekNavHtml('mypage', _weekState, { allowAll: true })}

wireWeekNav('mypage', () => _weekState, v => { _weekState = v; }, _reload);
```

**What the component gives you automatically:**
- ‹ prev / next › buttons (`.week-nav-btn` style)
- Clickable label that opens the native date picker (`showPicker()` + fallback)
- Any picked date is snapped to Monday of that week
- ISO week number ("Wk N") shown automatically (via `getISOWeek` in `format.js`); `updateWeekNavLabel` keeps it in sync
- "This week" / "Show all" buttons when `allowAll: true`
- All CSS comes from the existing `.week-nav` / `.week-nav-btn` / `.week-nav-label` classes in `style.css` — no new CSS needed

**`idPrefix` must be unique per page** to avoid ID collisions (e.g. `'ts'`, `'ap'`, `'pc'`).

---

## Cache Versioning

- JS modules: bump `const V` in `app.html` on every session that changes a `.js` **page** file.
- CSS: bump the `?v=` suffix on the `<link>` tag in `app.html` when `style.css` changes.
- **Shared modules (`js/api/*.js`, `js/components/*.js`) are imported WITHOUT `?v=` pins.** Never add per-file version suffixes to api or component imports — doing so creates multiple module instances (split state) and causes post-deploy skew. Only the `V` constant in the `pages` map needs bumping.
- **⚠️ Split-page submodules (`holidays-*.js`, `expenses-*.js`) ARE `?v=`-pinned inside their coordinator's imports (`holidays.js`/`expenses.js`) — bump those pins to the current `V` whenever ANY submodule changes.** A stale pin means returning browsers keep an old cached submodule forever while the rest of the app updates (R57 lesson: pins sat at v=103–106 while the app reached v=120, spanning several submodule edits).
- Current baseline after **Round 58** (modal backdrop-click fix, 2026-07-09): **working JS `?v=122` / CSS `?v=40`**, tokens.css `?v=22`, `login-init.js?v=2`. **Next session: bump from v=122.** R58: **backdrop click no longer closes any modal** (user-reported: accidental outside-clicks were dismissing modals) — removed the `if (e.target === backdrop) close()`-style listener from all **35 sites across 16 files** (every page/component with a `.modal-backdrop`: `confirmModal`/`promptModal`, `entryModal`, `prefsModal`, `profileModal`, `clients`, `documents`, `employees`, `evaluation`, `expenses-approvals`, `expenses-report`, `holidays-approvals`, `holidays-holidays`, `partNumbers`, `projects`, `tags`, `team`). Esc still works: each modal now sets `backdrop._escClose = close` (or `() => close(false)` where `close` takes a param) where the backdrop-click listener used to live, and the global handler in `js/app-init.js` calls `_escClose?.()` instead of synthesizing a `.click()` on the backdrop — the old mechanism relied on that synthetic click going through the *same* `e.target === backdrop` branch as a real click, so removing backdrop-close would have silently broken Esc too without this change. Verified for real in a headless-Chromium/Playwright harness against the actual shipped `confirmModal.js` (not a reimplementation): backdrop click leaves the modal open, ✕/Cancel/Confirm/Escape all still work correctly, and the modal stays fully functional after an ignored backdrop click. Also updated 2 stale doc-comments in `confirmModal.js` that listed "backdrop click" as a way to get a `false`/`null` result. `check:parse` 56/56. Submodule pins bumped 121→122 in `holidays.js`/`expenses.js` (4 submodules touched). Modal Pattern rule in this file rewritten to match — **never re-add** a backdrop-click-closes listener; set `_escClose` instead. Prior R57: **salvaged the orphaned PR #26 audit** (branch `claude/next-session-plan-h9psa4`, a parallel 2026-07-03 full audit that was never merged or tracked; its report was gitignored/local-only so the PR body is the only record). Landed: **`20260712_client_block_expanded.sql`** (⚠️ **pending Studio — plan task A0**: RESTRICTIVE `client_block_*` on 12 tables `20260708` missed, worst `employee_compensation` salary PII — the app reads it at `js/api/employees.js:210` while the F-01 probe checked the wrong name `compensation_records`; + `audit_log_select_admin` → `is_admin()`) + **`20260712b_f05_rpc_search_path.sql`** (⚠️ pending Studio: `search_path` pins on the 3 F-05 RPCs); both renamed from the branch's 20260710/20260711 (dates since taken by Part Numbers) and wrapper-stripped. Probe scripts extended to ~35 checks (`employee_compensation` + 11 tables; stale root `.ps1` duplicate deleted — canonical copy is `supabase/probes/f01_prod_client_probe.ps1`). Code fixes re-applied: `safeColor()` on project-dot colors (`projects.js`/`tracker.js`), submodule pins 104/103/106→121, `.ts-remove-btn` opacity 0→0.6, approval prior-status guards + new `overrideTravelClaimStatus` (`api/expenses.js`/`leaves.js` — override was silently coerced to `manager_approved` before), `confirmModal` bespoke Esc handler removed, `clients.js` delete-login now checks the Edge-Fn response, `copyLastWeek` ICT date fix (`api/timeEntries.js`), login 401/429/500 messaging, doc-merge `sanitizeHtml` gap, misc attribute escaping. `check:parse` 56/56. PR #26 closed as salvaged. Prior R56 (same day, docs-only): Sheets export cadence weekly→daily; `FULL_EXECUTION_PLAN.md` created (Track A launch path A0–A8 / Track B post-launch roadmap — **start there for sequencing**); audit plan/packet + roadmap review findings logged as tasks A2/A3; Help-page refresh gated before team review. Prior R55: **PN v2 rework to `PART_NUMBERING_SPEC.md`** — format `CC-PPP-AA-BBB`→**`CCC-PPP-CAT-SEQ`** (CAT = 3-letter governed code, 11 seeds ASM/PCA/PCB/CBL/ELC/PRT/OTS/FMW/DOC/PKG/TOL with "covers" help + decision ladder). **Retired the `pn_projects` registry** → part numbers now hang off the **real `projects`/`clients`** tables via a new 3-char `code` column on each (`clients.code`=CCC set on Clients page, `projects.code`=PPP on Projects page; unique indexes; RPC reads CC from the project's client). Added **`pn_attributes`** (one table, 5 kinds: material/finish/vendor/fab_process/color; admin/manager-managed) + item FK columns; **`pn_project_config`** (per-project customer-PN mode/template, replaces the old pn_projects fields); **revision `snapshot jsonb`** captured at mint + each bump so the new **info/compare modal** can diff two revisions. Rewrote `pn_create_item` (now takes real project_id + 5 attribute ids; errors clearly if client/project code missing) + `pn_bump_revision` + new `pn_item_snapshot`. UI: Part Numbers page rewritten (real-project picker `name (CCC-PPP)`, deep-link `#part-numbers?project=<id>`, category picker w/ covers help, 5 attribute dropdowns, Material/Finish/Updated columns, ⓘ info→details+revisions+**Compare**, Categories/Lists/Customer-PN managers); Clients + Projects pages got code inputs; Projects rows got a **Part Numbers** deep-link button. Files: **`20260711_part_numbers_v2.sql`** (**✅ applied in prod Studio 2026-07-08** — 11 letter category codes verified; **no BEGIN/COMMIT wrapper on purpose** — the wrapped v1 file silently ran only a fragment in the SQL Editor; verified on scratch PG16: v1→v2 transform idempotent + 12 behavioral/RLS tests pass), rewritten `js/api/partNumbers.js` + `js/pages/partNumbers.js`, edited `js/api/clients.js`+`js/pages/clients.js`, `js/api/projects.js`+`js/pages/projects.js`. **Post-launch refinements (v=117→v=120):** attribute fields default to **TBD** when unset (dropdowns/table/info); **client filter** dropdown narrows the project picker; fixed the **Lists** button — the click handler passed the event object into `_openAttributesModal` as the `kind` arg, so it threw while building the modal and never opened (now `() => _openAttributesModal()` + arg guard). Cache **`v=116→v=120`**. **Merged to `main` (fast-forward) + deployed 2026-07-08.** ⚠️ **GitHub Pages gotcha:** setting this repo **private** unpublishes the Pages site (Free plan serves Pages only from public repos), and flipping back to public does **NOT** re-enable Pages — you must re-set Source in Settings→Pages (Deploy from a branch → main → /root). Keep the repo **public**: it's app-only, secrets are gitignored, and security is Supabase RLS + Edge-Fn CORS, not repo privacy (the published site is public by URL regardless). **`DRONEKYLL_PART_NUMBERING.md` is a separate program-scoped scheme — NOT built into the WMS system.** Prior R54: **new `#part-numbers` page (PN v1)** — own project registry (`pn_projects`: CC/PPP codes + customer-PN mode none/template/manual), editable AA type-code list (`pn_type_codes`, 7 seeds), items minted ONLY via the `pn_create_item` SECURITY DEFINER RPC (atomic `pn_counters` upsert → gap-free, deleted numbers never reused; **no INSERT policy on `pn_items`**), dual part numbers (internal `CC-PPP-AA-BBB` always + optional customer PN via `pn_render_template` placeholders `{CC}{PPP}{AA}{SEQ:n}` or manual entry with case-insensitive per-project unique index), `pn_bump_revision` RPC + `pn_item_revisions` history, immutability guard trigger on identity columns. New files: `20260710_part_numbers.sql` (**✅ applied in prod Studio 2026-07-07** — 7 type-code seeds verified; **⚠️ had to apply the autocommit variant: the `BEGIN…COMMIT`-wrapped file silently ran only a fragment in the Supabase SQL Editor and reported "Success, no rows" while creating nothing — strip the transaction wrapper if a wrapped migration ever "succeeds" but leaves no objects**), `js/api/partNumbers.js`, `js/pages/partNumbers.js`; registered in `app.html` nav + `app-init.js` (wmsRoutes/pages map). Whole migration verified on a scratch PG16 cluster with Supabase stubs — 14/14 behavioral+RLS tests pass (numbering per project+type, template/manual customer PNs, dup rejection without burning a counter, member mints but can't manage, client sees 0 rows). 🟡 **KNOWN FOLLOW-UP — PN v2: the AA type-code scheme needs rework** (user flagged "AA still not that great"). Current model is a flat editable code+description list (7 seeds) with no rule for *which* code a new item should get — rework the AA taxonomy/assignment logic next session. Longer-term still BOM management (schema BOM-ready: uuid-PK `pn_items`). Prior R53: **repo transfer completed** — `hubble-wms` + `hubble-wms-backups` both now live under account **`SurasakNie`** (prod: `https://surasaknie.github.io/hubble-wms/`). **⚠️ Biggest finding: every Supabase Edge Function's `ALLOWED_ORIGINS` CORS array was hardcoded to the old `he-cells.github.io` domain — this broke Employee ID + password login completely (not an edge case, a total outage on that path) plus every admin action backed by an Edge Function (password reset, provisioning, etc.).** Client-side CSP was already correct, which gave false confidence — CORS is a separate, server-side check each function does independently; the transfer gives zero signal this needs fixing. Symptom: DevTools Console shows `Access-Control-Allow-Origin ... he-cells.github.io ... not equal to the supplied origin`; UI just shows a silent `net::ERR_FAILED`. Google OAuth doesn't touch these functions, so testing only Google login masks this entirely. **Fixed** by adding `https://surasaknie.github.io` to `ALLOWED_ORIGINS` in every deployed Edge Function (`login`, `admin-reset-password`, and others) and redeploying each. Second real issue: Supabase's Redirect URLs allow-list match is case-sensitive, and entering the new entry with the account's display casing (`SurasakNie`) instead of the browser-normalized lowercase hostname broke Google login (silent fallback to `Site URL` = `localhost:3030`, "site can't be reached") until corrected — **always enter `*.github.io` URLs in lowercase in any auth allow-list or CORS config.** Also fixed a real, pre-existing CSP bug caught during the first live console check since Round 50: `style-src` was missing `https://fonts.googleapis.com`, so the Google Fonts CSS (`@font-face` for Inter) was silently blocked by CSP the whole time, even though `font-src` correctly allowed `fonts.gstatic.com` for the font files themselves — fixed in both `app.html`/`index.html`. Full narrative + troubleshooting table in `REPO_TRANSFER_CHECKLIST.md`. Prior R52: **repo-transfer checklist** added + **team.js App-link subpath fix** — the Add-Member modal's link was `origin + '/index.html'` (dropped the `/hubble-wms/` Pages subpath → 404); now `new URL('index.html', window.location.href).href`, same idiom as `auth.js`. Cache **v=114→v=115**. Prior R50: **CONV-M4 verified resolved** (no `3030` in shipped code) + **L-CSP fixed** — CSP `<meta>` tag added to `app.html`/`index.html`; caught 2 bugs in the plan's draft policy first (missing `fonts.gstatic.com` in `font-src`; `script-src 'self'` would've silently blocked both files' inline `<script type="module">` blocks) — fixed by externalizing them into new `js/app-init.js` / `js/login-init.js` (byte-diff-verified against the originals, only import paths + cache version changed). **⚠️ Not live-verified** — this container has no network access to prod (confirmed 403 via the proxy gateway); post-push spot-check for 0 CSP console violations still needed. See `PRE_LAUNCH_AUDIT_EXECUTION_PACKET.md` for the rest of the audit (Phases 1–4), which also requires live prod/Studio access this container doesn't have. Prior R49: **F-01 (P0) CLOSED** — prod client RLS probe 22/22 PASS. Root cause of leaks: `get_my_role()` causes circular RLS dependency inside RESTRICTIVE policies; fixed via new `auth_is_client()` SECURITY DEFINER function + RESTRICTIVE `client_block_*` policies on 11 internal tables (`20260708_client_block_internal_tables.sql` — applied in prod Studio 2026-06-30). Probe scripts: `f01_prod_client_probe.sh` (bash) + `f01_prod_client_probe.ps1` (PowerShell). **`20260708` ✅ applied in prod Studio 2026-06-30.** **NEXT: pre-launch audit (`PRE_LAUNCH_AUDIT_PLAN.md`) → team review → roster swap (RSK-0, 3 confirms).** **✅ F-05 RPCs VERIFIED in prod 2026-06-30 (R49 recheck):** all 3 present — `approve_deletion_request`, **`review_name_change_request`** (NOT `approve_name_change_request` — that name never existed; it takes an `approved` boolean, handles approve+reject), `approve_job_title_change_request`. main's `requests.js`/`jobTitleRequests.js` call them correctly. (Earlier R44 docs named the middle RPC wrong — corrected.) Prior R48: v=113, CONV-M2/M-DSUB/M-SILENT/M-DATE closed, `20260630_leave_manager_approved.sql` applied. Prior R47: `?v=111`, SPEC-M1/M2/M3. Prior R46: `?v=110`/CSS`?v=39`, CONV-M1 calendar weekNav. Prior R45: `?v=109`/CSS`?v=38`, audit log + client logins UX. **Edge Fns: 7 deployed.** **Migrations APPLIED in prod Studio:** through `20260708` + `20260629_audit_log.sql` + `20260629_request_review_rpcs.sql` (F-05, verified 2026-06-30) + `20260630_leave_manager_approved.sql` + **`20260701_drop_client_project_totals.sql`** (applied 2026-07-01 — Security Advisor "Security Definer View" ERROR cleared). Commits this session: PRs #12 (docs R48) + #13/#14 (probe scripts) + #15 (F-01 fix) + #16/#17 (audit plan). R49 recheck: 6 stale branches confirmed safe to delete (squash-merged R40–R45; main far ahead). **R51 (branch `claude/supabase-error-o5h7qu`, 2026-07-01): dropped the legacy SECURITY DEFINER view `client_project_totals`** — it aggregated `time_entries` across ALL tenants with no filter and, being definer-rights, bypassed the `client_block_*` table RLS, so it was a cross-tenant leak vector the F-01 probe never covered. Dead code: the app reads client summaries via the `get_client_project_summary()` RPC (`clientPortal.js`), not this view. **F-01 probe now covers views** — added a `client_project_totals` leak check to both `f01_prod_client_probe.sh` (new `check_view_blocked` helper) and `.ps1` (reuses `Check-MustZero`); ~23 checks now, view check PASSes on HTTP 404 (dropped).
- **Production:** https://surasaknie.github.io/hubble-wms/ (repo github.com/SurasakNie/hubble-wms, account SurasakNie). Deploy = commit + `git push` (no build step). Repo is app-only — docs/supabase/credentials are .gitignored. **Backups repo:** github.com/SurasakNie/hubble-wms-backups (nightly `nightly-db-backup` cron, verified live post-transfer). Transferred from `HE-cells` 2026-07-03 (R53) — old `he-cells.github.io` URL is dead, no redirect. Full transfer record + findings: `REPO_TRANSFER_CHECKLIST.md`.

---

## Modal Pattern

All modals follow this DOM structure (appended to `document.body`):

```html
<div class="modal-backdrop">
  <div class="modal modal-lg">
    <div class="modal-header">...</div>
    <div class="modal-body">...</div>
    <div class="modal-footer">...</div>
  </div>
</div>
```

Close on: ✕ button, Cancel button, Esc. **Backdrop click does NOT close the modal** (changed R58, 2026-07-09 — accidental outside-clicks were closing modals unintentionally; confirmed real in a Playwright check against the shipped `confirmModal.js`).

**Esc closes the topmost modal automatically** — one global capture-phase handler in `js/app-init.js` (`keydown` → calls `_escClose()` on the topmost `.modal-backdrop`). Every modal must set `backdrop._escClose = close` (the zero-arg function that dismisses it) right where it used to wire the backdrop-click listener — e.g. `mount.querySelector('#xx-backdrop')._escClose = close;`. If `close` takes a parameter (e.g. `confirmModal`'s `close(result)`), wrap it: `backdrop._escClose = () => close(false);`. **Do not add per-modal Esc `keydown` handlers** — just set `_escClose` and Esc works for free. **Never re-add a `backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); })`-style handler** — that's the exact pattern this round removed from all 35 sites across 16 files.

---

## Action Buttons in Tables

Use `.row-actions` (expense rows) or `.table-actions` (holiday/leave rows).
Both share the same CSS rule — `display:flex; flex-wrap:nowrap; white-space:nowrap`.
Never use `opacity:0` on action cells; buttons must always be visible.

---

## Form Inputs (dark theme) — never ship a white input box

This app is a **dark theme**. Every text-like form field MUST render dark. A white/browser-default input background is a bug.

- **It's already automatic.** `style.css` styles inputs with a **denylist** — `input:not([type="checkbox"]):not([type="radio"])…), textarea, select`. So **any** input is dark by default, including new types (`password`, `tel`, `datetime-local`, `week`, `month`, type-less). You normally need **no** class and **no** per-field styling. Just use a plain `<input>`.
- **Never** give an input a light/`#fff` background. (The *only* legitimate white box in the app is the TOTP QR code, which needs a light quiet-zone to scan.)
- **If a white input ever appears:** do not patch the one field. Find why it escaped the global rule (an excluded `type=`, a custom control, or an inline/scoped override) and **fix the global rule** so it can't recur. The historical cause was the rule being an *allowlist* of `type=` values that omitted `password` — fixed 2026-06-14 by switching to the denylist above.
- **`index.html` (login page) has its OWN scoped input styles** — it does *not* load `style.css`. If you add fields there, style them dark explicitly.
- **⚠️ The denylist selector has very high specificity** (its long `:not()` chain ≈ `(0,10,1)`). Its `padding: 8px 10px` shorthand will **override any left/right-only `padding-*` override** on an input, no matter where that override lives. So **never use `padding-left`/`padding-right` alone to make room for an icon inside an input** (e.g. a search magnifier) — the gutter will be silently clobbered and the placeholder/text overlaps the icon. **Always set the full `padding` shorthand** (and `!important` where a scoped class still loses the specificity war, as `.search-input input` does). This is the standard pattern for any input with an absolutely-positioned adornment.
