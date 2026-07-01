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
- Current baseline after **Round 50** (pre-launch audit Phase 5 must-fix items closed, 2026-07-01): **working JS `?v=114` / CSS `?v=39`**, tokens.css `?v=22`. **Next session: bump from v=114.** R50: **CONV-M4 verified resolved** (no `3030` in shipped code) + **L-CSP fixed** — CSP `<meta>` tag added to `app.html`/`index.html`; caught 2 bugs in the plan's draft policy first (missing `fonts.gstatic.com` in `font-src`; `script-src 'self'` would've silently blocked both files' inline `<script type="module">` blocks) — fixed by externalizing them into new `js/app-init.js` / `js/login-init.js` (byte-diff-verified against the originals, only import paths + cache version changed). **⚠️ Not live-verified** — this container has no network access to prod (confirmed 403 via the proxy gateway); post-push spot-check for 0 CSP console violations still needed. See `PRE_LAUNCH_AUDIT_EXECUTION_PACKET.md` for the rest of the audit (Phases 1–4), which also requires live prod/Studio access this container doesn't have. Prior R49: **F-01 (P0) CLOSED** — prod client RLS probe 22/22 PASS. Root cause of leaks: `get_my_role()` causes circular RLS dependency inside RESTRICTIVE policies; fixed via new `auth_is_client()` SECURITY DEFINER function + RESTRICTIVE `client_block_*` policies on 11 internal tables (`20260708_client_block_internal_tables.sql` — applied in prod Studio 2026-06-30). Probe scripts: `f01_prod_client_probe.sh` (bash) + `f01_prod_client_probe.ps1` (PowerShell). **`20260708` ✅ applied in prod Studio 2026-06-30.** **NEXT: pre-launch audit (`PRE_LAUNCH_AUDIT_PLAN.md`) → team review → roster swap (RSK-0, 3 confirms).** **✅ F-05 RPCs VERIFIED in prod 2026-06-30 (R49 recheck):** all 3 present — `approve_deletion_request`, **`review_name_change_request`** (NOT `approve_name_change_request` — that name never existed; it takes an `approved` boolean, handles approve+reject), `approve_job_title_change_request`. main's `requests.js`/`jobTitleRequests.js` call them correctly. (Earlier R44 docs named the middle RPC wrong — corrected.) Prior R48: v=113, CONV-M2/M-DSUB/M-SILENT/M-DATE closed, `20260630_leave_manager_approved.sql` applied. Prior R47: `?v=111`, SPEC-M1/M2/M3. Prior R46: `?v=110`/CSS`?v=39`, CONV-M1 calendar weekNav. Prior R45: `?v=109`/CSS`?v=38`, audit log + client logins UX. **Edge Fns: 7 deployed.** **Migrations APPLIED in prod Studio:** through `20260708` + `20260629_audit_log.sql` + `20260629_request_review_rpcs.sql` (F-05, verified 2026-06-30) + `20260630_leave_manager_approved.sql` + **`20260701_drop_client_project_totals.sql`** (applied 2026-07-01 — Security Advisor "Security Definer View" ERROR cleared). Commits this session: PRs #12 (docs R48) + #13/#14 (probe scripts) + #15 (F-01 fix) + #16/#17 (audit plan). R49 recheck: 6 stale branches confirmed safe to delete (squash-merged R40–R45; main far ahead). **R51 (branch `claude/supabase-error-o5h7qu`, 2026-07-01): dropped the legacy SECURITY DEFINER view `client_project_totals`** — it aggregated `time_entries` across ALL tenants with no filter and, being definer-rights, bypassed the `client_block_*` table RLS, so it was a cross-tenant leak vector the F-01 probe never covered. Dead code: the app reads client summaries via the `get_client_project_summary()` RPC (`clientPortal.js`), not this view. **F-01 probe now covers views** — added a `client_project_totals` leak check to both `f01_prod_client_probe.sh` (new `check_view_blocked` helper) and `.ps1` (reuses `Check-MustZero`); ~23 checks now, view check PASSes on HTTP 404 (dropped).
- **Production:** https://he-cells.github.io/hubble-wms/ (repo github.com/HE-cells/hubble-wms, account HE-cells). Deploy = commit + `git push` (no build step). Repo is app-only — docs/supabase/credentials are .gitignored.

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

Close on: ✕ button, Cancel button, backdrop click.

**Esc closes the topmost modal automatically** — one global capture-phase handler in `app.html` (`keydown` → clicks the topmost `.modal-backdrop`). For Esc to reach a modal, that modal **must** close on a backdrop click (the standard `if (e.target === backdrop / e.currentTarget / '…-backdrop') close()`). **Do not add per-modal Esc handlers** — just follow the backdrop-click rule and Esc works for free.

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
