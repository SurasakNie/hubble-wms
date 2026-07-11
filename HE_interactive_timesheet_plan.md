# Interactive Timesheet App — Canonical Plan

> **Last updated: 2026-06-11.** This is the single source of truth for the TIMESHEET app —
> full design + data model + page specs, annotated with current build status.
> Supersedes `HE_interactive_timesheet_plan_draft.md` (kept as a historical pre-build artifact).
> For the most recent session narrative, see `HANDOFF_20260601.md`.

**State in one line:** ✅ **Live in production** ([surasaknie.github.io/hubble-wms](https://surasaknie.github.io/hubble-wms) — transferred from `he-cells.github.io` 2026-07-03, see [REPO_TRANSFER_CHECKLIST.md](REPO_TRANSFER_CHECKLIST.md)) since 2026-06-11. All Timesheet + WMS modules (M2–M6) built & deployed; the login overhaul is live (R29–R35). Remaining: closeout (Help page, template wording) → real-roster swap (LAST). See [PENDING_TASKS.md](PENDING_TASKS.md).

**Status legend (used throughout):** ✅ DONE · ⛔ STUB · ⏸ DEFERRED

---

## Progress Status

| Area | State |
|---|---|
| Backend (Supabase schema, RLS, OAuth, login) | ✅ 100% — login works end-to-end |
| Pages built | ✅ **15 of 15** — core tracker + all WMS pages (M2–M6) |
| Reports page | ✅ Done — filter bar, stacked bar, grouped table, donut, CSV export |
| Google Sheets daily export | ⏸ PARKED — plan ready; blocked until app is live + Sheet URL provided |
| Deletion-request approval flow | ✅ Built as the Notifications page (`requests.js`) |
| GitHub Pages deploy + prod redirect URL | ✅ Live since R24 — he-cells.github.io/hubble-wms *(account transfer pending — see REPO_TRANSFER_CHECKLIST.md)* |
| Documents / M6 automated documentation | ✅ Live — migrations applied; templates + doc requests (R21) |
| Phase-2 (Reminders, Apps/Timesheet prefs, Google verification) | ⏸ DEFERRED |
| **Overall** | ✅ **Live in prod** (R23–R35: deploy, login overhaul, R25 RLS sweep). Remaining: closeout → roster swap |

---

## 1. Context

A Clockify-like time-tracking web app, branded **TIMESHEET** (Google consent screen reads
"Hubble Engineering Timesheet"). Users log in with Google (OAuth). Data lives in a single
central Supabase database. Five-tier RBAC (owner / admin / manager / member / client).

- **No build step** — vanilla HTML/CSS/JS, deploy target = **GitHub Pages** (deploys on push).
- **Strict dark theme only** (per `UI UX Specification.md` §1.1).
- **Formats:** THB currency · dd/mm/yyyy dates · 24-hour time · h:mm duration · **Monday** week start.

Defining features: drag-calendar, weekly Timesheet matrix grid, Time Tracker quick-add,
Dashboard + Reports with stacked-bar and donut charts, Tags, billable flag, manager
approval workflow.

---

## 2. Live Connection Details ✅

All already wired into `js/config.js` and verified (key returns HTTP 200).

- **Supabase project ref:** `sjkggguedgtynktymzes`
- **URL:** `https://sjkggguedgtynktymzes.supabase.co`
- **Key:** publishable key `sb_publishable_ZO6nGx_2VNMO9dK_fN72Cg_LlprwmWQ` (anon, browser-safe, RLS-gated)
- **Owner user:** `surasak.niemkaew@gmail.com` (role = `owner` in `profiles`)
- **Region:** Singapore / ap-southeast-1
- **Redirect URLs configured:** `http://localhost:3030/app.html` + `http://localhost:3030/**`

### Preview server
- `.claude/launch.json` runs `npx serve .` on **port 3030**.
- Start via `preview_start(name="timesheet-preview")`; test login at `http://localhost:3030/index.html`.
- ⚠️ **The preview MCP browser does NOT share the user's Google session** — it cannot drive the
  OAuth flow. Use it only to confirm pages load without JS errors; the user tests real login.

---

## 3. Stack ✅

| Layer | Choice | Reason |
|---|---|---|
| Database + Auth | Supabase (Postgres + Google OAuth) | RLS for RBAC, relational schema, free tier |
| Frontend | Vanilla HTML / CSS / JS | No build toolchain — GitHub Pages deploy on push |
| Calendar | FullCalendar.js v6 (`timeGridWeek`) | Drag-create / drag-resize / drag-move |
| Charts | Chart.js v4 (CDN ESM) | Donut + stacked bar |
| Icons | Lucide (CDN) | Clean, free, matches dark theme |
| Hosting | GitHub Pages | Free, deploys on push (⏸ not yet set up) |

---

## 4. Design System ✅

> Color tokens, typography, and layout — design-only reference: [`UI UX Specification.md §1`](UI%20UX%20Specification.md).
> This section records only the **format defaults**, which are app-specific and not in the UX spec.

### Format defaults
- Currency **THB** · Date **dd/mm/yyyy** · Time **24-hour** · Duration **h:mm** · Week starts **Monday**.

---

## 5. Roles (5-tier) ✅

| Role | Access |
|---|---|
| `owner` | Full access (identical to admin) |
| `admin` | All data, all users, manage everything, approve deletion requests, set billable rates |
| `manager` | Only assigned projects; can add clients/projects/tasks; deletions require admin approval |
| `member` | Sees only tasks assigned to them; logs/edits own time entries; view-only on Projects + Team |
| `client` | Read-only — own client's projects only; **aggregate totals only** (no names/descriptions) |

### Manager request/approval workflow ⏸ DEFERRED
- Manager submits a `deletion_request` (`entity_type`, `entity_id`, `reason`).
- Admin sees pending requests as a badge on the Notifications nav item.
- Admin approves → entity deleted; rejects → request closed with note.
- **Status:** the `deletion_requests` table exists in `schema.sql`; the submit/queue/approve UI is not built.

### Per-role nav access matrix
*(✅ = enforced today via RLS + sidebar role-filtering; "→ request" rows use the Notifications approval flow.)*

| Item | owner / admin | manager | member | client |
|---|---|---|---|---|
| Time Tracker | log time | log time | log time | — |
| Timesheet | all users' data | own + assigned | own data | own client's projects (aggregate) |
| Calendar | all users' data | own + assigned | own data | own client's projects (aggregate) |
| Dashboard | all users' data | own + assigned | own data | own client's projects (aggregate) |
| Reports ✅ | full + export | view + export (assigned) | — | — |
| Projects | full CRUD + color | add only, delete → request | view only | own client's projects only |
| Team | full CRUD | — | view only (no rate) | view only (no rate) |
| Clients | full CRUD | add only, delete → request | — | — |
| Tags | full CRUD | apply only | apply only | — |

---

## 6. Data Model ✅

Schema applied in `supabase/schema.sql` (all tables, RLS, triggers, `client_project_totals` view).
**Do NOT re-run the full `schema.sql`** — it is already applied (see §12 / §13).

```sql
-- Extends Supabase auth.users
profiles (
  id UUID PK → auth.users,
  name TEXT, email TEXT, job_title TEXT,
  role TEXT CHECK IN ('owner','admin','manager','member','client') DEFAULT 'member',
  billable_rate DECIMAL(10,2),       -- admin/owner-only visibility
  currency TEXT DEFAULT 'THB',
  client_id UUID → clients,          -- populated for 'client' role only
  working_days INT[] DEFAULT '{1,2,3,4,5}',  -- 1=Mon … 7=Sun
  daily_capacity_hours DECIMAL(4,2) DEFAULT 8.0,
  week_start INT DEFAULT 1,
  date_format TEXT DEFAULT 'dd/mm/yyyy',
  time_format TEXT DEFAULT '24h',
  duration_format TEXT DEFAULT 'h:mm'
)

groups (id UUID PK, name TEXT)
group_members (group_id → groups, user_id → profiles, PK (group_id, user_id))

clients (id UUID PK, name TEXT, address TEXT, currency TEXT DEFAULT 'THB')

projects (
  id UUID PK, name TEXT, client_id → clients,
  color TEXT DEFAULT '#03a9f4',     -- hex, admin-editable, used in calendar + charts
  access TEXT CHECK IN ('public','private') DEFAULT 'public',
  is_billable BOOLEAN DEFAULT true,
  estimated_hours DECIMAL(8,2),     -- powers Progress column
  is_archived BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false
)

project_assignments (project_id → projects, manager_id → profiles, PK (project_id, manager_id))

tasks (id UUID PK, name TEXT, project_id → projects)

task_assignments (
  task_id → tasks,
  assignee_type TEXT CHECK IN ('user','group'),
  assignee_id UUID,
  UNIQUE (task_id, assignee_type, assignee_id)
)

tags (id UUID PK, name TEXT UNIQUE, color TEXT DEFAULT '#8b97a2')

time_entries (
  id UUID PK,
  user_id → profiles,
  task_id → tasks (nullable — direct project entry allowed),
  project_id → projects,
  date DATE,
  start_time TIME,                  -- null if total_hours entered directly
  end_time TIME,
  total_hours DECIMAL(5,2),         -- computed from start/end OR direct input
  description TEXT,
  is_billable BOOLEAN DEFAULT true
)

time_entry_tags (time_entry_id → time_entries, tag_id → tags, PK (time_entry_id, tag_id))

deletion_requests (
  id UUID PK,
  requested_by → profiles,
  entity_type TEXT CHECK IN ('client','project','task'),
  entity_id UUID,
  reason TEXT,
  status TEXT CHECK IN ('pending','approved','rejected') DEFAULT 'pending',
  reviewed_by → profiles (nullable),
  review_note TEXT,
  created_at TIMESTAMPTZ
)

name_change_requests (                 -- added 2026-06-04
  id UUID PK,
  requested_by → profiles,
  requested_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT CHECK IN ('pending','approved','rejected') DEFAULT 'pending',
  reviewed_by → profiles (nullable),
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,             -- stamped on admin decision; powers 3-day banner window
  created_at TIMESTAMPTZ
)
-- Trigger profiles_name_change_guard: BEFORE UPDATE on profiles raises if `name`
-- changes and the caller is not admin/owner — enforces approval at the DB layer.

CREATE VIEW client_project_totals AS
  SELECT p.client_id, p.id AS project_id, p.name AS project_name,
         DATE_TRUNC('week', te.date) AS week_start,
         SUM(te.total_hours) AS total_hours
  FROM time_entries te JOIN projects p ON te.project_id = p.id
  GROUP BY p.client_id, p.id, p.name, DATE_TRUNC('week', te.date);
```

### RLS Policies (as deployed, incl. the 2026-06-01 migrations)
- `time_entries` SELECT: member/manager see own rows; admin/owner see all; client has **no direct row
  access** — sees `client_project_totals` filtered to `client_id = profiles.client_id`.
- `time_entries` INSERT (`te_insert`): own rows; **admin/owner may insert for any `user_id`**
  (enables Calendar "Teammates" create). Managers insert own rows only.
- `time_entries` UPDATE/DELETE (`te_update`/`te_delete`): admin/owner edit any entry;
  manager edits entries on assigned projects; member edits own rows.
- `projects` SELECT (`projects_select`): admin/owner see all; manager sees `project_assignments`
  rows; client sees own client's projects; member sees all (read-only). *(Re-asserted by a
  hotfix applied 2026-06-01 — see §13.)*
- `projects` INSERT: admin/owner/manager; UPDATE: admin/owner only; DELETE: admin/owner directly
  or via approved request.
- `clients` SELECT: admin/owner/manager all; client sees own row only. INSERT: admin/owner/manager;
  DELETE: admin/owner directly or via approved request.
- `deletion_requests` INSERT: manager only; SELECT/UPDATE: own + admin/owner.
- `profiles.billable_rate`: visibility restricted to admin/owner via **app-layer masking** in API
  helpers (raw column filtered out for other roles).

---

## 7. File Structure (actual, as built)

> Reconciled to disk **2026-07-10 (R60 cont., plan task A6.3)** — re-verified against the actual
> repo listing, not carried forward (the previous version here was frozen at R35, before
> `help.js`, `adminLogs.js`, `clientPortal.js`, `partNumbers.js`, `app-init.js`/`login-init.js`, the
> `holidays-*`/`expenses-*` submodule splits, `auditLog.js`, and `partNumbers.js` (api) existed).
> `supabase/` is **gitignored** except `supabase/probes/f01_prod_client_probe.ps1` — present locally,
> not in the public app repo. Newer migration `.sql` files are committed at **repo root** instead (see
> below); the full historical applied-migrations ledger with status lives in
> [Timesheet_WMS_Master_Plan.md](Timesheet_WMS_Master_Plan.md) §Applied migrations — treat that table,
> not a file count here, as authoritative.

```
/
├── index.html              ✅ login: Employee ID + password, optional TOTP, forced-change, diagnostics
├── app.html                ✅ main shell: sidebar + top bar + content + router + role-nav + global Esc-closes-modals
├── css/  (4)
│   ├── tokens.css          ✅ CSS variables (colors, spacing, radii)
│   ├── style.css           ✅ layout, sidebar, top bar, tables, forms, modals, grid, emp-select, week-nav
│   ├── calendar.css        ✅ FullCalendar dark-theme overrides
│   └── charts.css          ✅ Chart.js container sizing
├── js/
│   ├── app-init.js         ✅ app.html's externalized bootstrap (R50, CSP script-src hardening) — holds the `V` cache-version const + wmsRoutes/pages route maps + global Esc-closes-modals handler
│   ├── login-init.js       ✅ index.html's externalized bootstrap (R50, same CSP reason), versioned independently (`?v=2`)
│   ├── config.js           ✅ Supabase URL + publishable key
│   ├── auth.js             ✅ session, role guard, getAuthGate(), getAuthError(), isAdmin/isManager/isClientRole
│   ├── router.js           ✅ hash-based SPA routing
│   ├── format.js           ✅ date/time/duration/currency + getISOWeek / toISODate / todayISO + shared `esc()` / `sanitizeHtml()`
│   ├── passwordPolicy.js   ✅ shared password policy + 7-rule strength indicator
│   ├── pages/  (29 files, 19 nav routes — 2 pages split into coordinator + submodules)
│   │   ├── tracker.js  timesheet.js  calendar.js  dashboard.js  reports.js
│   │   ├── projects.js  team.js  clients.js  tags.js
│   │   ├── employees.js (Directory + Account Status tab)   requests.js (Notifications)
│   │   ├── holidays.js + holidays-{state,my-leave,team,approvals,holidays}.js (coordinator + 5 submodules, R43 split — submodule imports are `?v=`-pinned inside `holidays.js`, bump on ANY submodule change)
│   │   ├── expenses.js + expenses-state.js + expenses-travel.js + expenses-approvals.js + expenses-petty-cash.js + expenses-report.js (coordinator + 5 submodules, R43 split, same `?v=`-pin rule)
│   │   ├── evaluation.js  documents.js
│   │   ├── clientPortal.js (CLIENT-01, R39)   adminLogs.js (R45)   partNumbers.js (R54, reworked R55)
│   │   └── help.js (R42, refreshed R60 — Part Numbers/2-tier leave/Client Portal/Admin Logs added)
│   ├── components/  (6)
│   │   ├── entryModal.js   profileModal.js   prefsModal.js (General/Format/Security)
│   │   └── weekNav.js      empSelect.js      confirmModal.js (also exports `promptModal`)
│   └── api/  (14)
│       ├── timeEntries.js   projects.js   clients.js   tags.js   users.js
│       ├── employees.js   leaves.js   holidays.js   jobTitleRequests.js
│       ├── expenses.js   evaluations.js   documents.js
│       └── auditLog.js (R45)   partNumbers.js (R54/55)
└── supabase/  (mostly gitignored — local only, except the client probe below)
    ├── schema.sql          ✅ applied — do not re-run (gitignored, local only)
    ├── probes/f01_prod_client_probe.ps1  ✅ tracked — client RLS gate, 41 checks (R60, A3.5)
    ├── functions/          ✅ 7 Edge Functions (Deno service-role, gitignored): login ·
    │                          provision-users · admin-reset-password · admin-clear-mfa ·
    │                          account-activation-status · admin-set-account-active · provision-client
    ├── seeds/ · backups/   gitignored — see Master Plan / backups README
    └── (root-level, tracked) recent migration `.sql` files — e.g. `20260709_lint_search_path_and_execute_hardening.sql`,
        `20260710_part_numbers.sql`, `20260711_part_numbers_v2.sql`, `20260712_client_block_expanded.sql`,
        `20260712b_f05_rpc_search_path.sql`, `f05_request_review_rpcs.sql` — a **partial, recent-only** set;
        the full historical migration ledger (50+ files across the project) lives in the Master Plan table,
        not as a complete set of files in this working copy.
```

> Repo root also holds the project docs (`*.md`), the bash client-probe counterpart
> `f01_prod_client_probe.sh` (tracked at root, mirrors the `.ps1` above), and 3 reference artifacts:
> `employee_id_system_v2.html`, `employee_id_schemes_comparison.html`, `UI_NAMING_REFERENCE.html`.

**Reconciliation notes:**
- `js/components/` has **no separate `sidebar.js` / `topbar.js` / `modal.js`** — the sidebar, top bar, and modal shell are realized inline within `app.html` / `router.js`. The shared modal/widget modules that DO exist: `entryModal`, `profileModal`, `prefsModal`, `confirmModal` (+ `promptModal` export), `weekNav`, `empSelect`.
- `js/api/` has **no `tasks.js`** (tasks handled within projects/entries helpers); `requests.js` (pages) powers the Notifications page (deletion + profile-change + job-title + leave-request queues) — there is no matching `api/requests.js`, those calls live in `api/jobTitleRequests.js` and inline in the page.
- **`supabase/functions/`** is the login overhaul's service-role home — all admin-guarded (`login` deployed `--no-verify-jwt`). Not in the public app repo.
- Shared `api`/`components` imports are deliberately **not** `?v=`-pinned (only the page-level `V` constant in `app-init.js` is) — see CLAUDE.md Cache Versioning.

---

## 8. Page Specs with Status (matched to `UI UX Specification.md` §3)

> Original design specs (pre-build): [`UI UX Specification.md §3`](UI%20UX%20Specification.md).
> Sections below are the **implementation record** — what was actually built, RBAC details, and deviations from spec.

### 8.1 Time Tracker (`#tracker`) ✅
**Spec (§3.1):** quick-input bar — "What have you worked on?", `+ Task @Project` cyan link,
🏷 tag + `$` billable icons, start/end/date/duration controls, solid-cyan `ADD`. Data list
grouped by day with daily totals; row = description · project dot+name · 🏷 · `$` · time range ·
📅 · duration · ▶ resume · ⋮.
**Built:** single-row quick-add with current-time default, editable duration, day-grouped list,
resume, pagination.

### 8.2 Timesheet (`#timesheet`) ✅
**Spec (§3.2):** Teammates dropdown · list/grid toggle · week picker with `< >`. Matrix grid:
projects/tasks × Mo–Su + **Total**, footer grand totals, bottom actions `+ Add new row` ·
`Copy last week` · `Save as template`; click cell → inline edit.
**Built:** week nav + click-to-pick, inline cell edit, daily footer, Add/× row, Copy-last-week.
Day header "Mo / Jun 1" format; Sa/Su columns darker; project column shows "Project - Client".
*(Save-as-template = phase 2.)*

### 8.3 Calendar (`#calendar`) ✅
**Spec (§3.3):** `[CALENDAR | Week | Day]` toggles · ⚙ · Teammates dropdown · date range ·
`[-][+]` zoom top-left of grid.
**Built:** FullCalendar v6 `timeGridWeek`, `firstDay: 1` (Monday). Clockify-style dark events
(`rgba(28,32,38,0.92)` bg, left colour bar via `--ev-color`, no white edge), description wraps,
"Project · Client" pinned bottom-left + duration bottom-right. Drag-create / move / resize wired
to shared `entryModal`. `[−][+]` zoom in time-axis header. Daily totals under column headers.
Weekend columns darker. Teammates dropdown (admin/manager) filters by member; admin can
drag-create for teammates. `allDaySlot: false`; 24h slot labels.

### 8.4 Dashboard (`#dashboard`) ✅
**Spec (§3.4):** "Dashboard" title · Project dropdown · "Only me" dropdown · date picker.
Layout — 3 KPI cards (Total time · Top Project · Top Client) · stacked bar (hours × days) ·
donut + legend · Most-tracked-activities list.
**Built:** 3 KPI cards, stacked bar + donut, top-10 activities, Chart.js v4.

### 8.5 Reports (`#reports`) ✅ Built
**Access:** `canViewReports()` guard (admin/owner/manager only).

**Top bar (§3.5):** filter dropdowns (Team · Client · Project · Task · Tag · Status · Description)
· cyan `APPLY FILTER`.
**Summary bar:** Total · Billable · Amount (THB) · Export · Print.
**Content:**
- Stacked bar chart (dates × hours, stacked by project) — **Chart.js v4** (CDN ESM, same pattern as `dashboard.js`).
- Grouping controls: `Group by: Project, Description` (chained).
- Data table: **TITLE · DURATION · AMOUNT** (grouped rows).
- Companion donut chart for table data.
- Export → CSV download `report_YYYY-MM-DD.csv`.

**API:** `getEntries({dateFrom, dateTo, userId, projectId})` in `js/api/timeEntries.js` returns
full entries with project/tag joins — **aggregate in-page, no new SQL needed.**
**Build conventions:** CDN ESM import for Chart.js (cached by `dashboard.js`); destroy charts
before re-render (`_destroyCharts()` pattern from `dashboard.js`); reuse `.filter-bar`,
`.table-wrapper`, `.badge`, `.btn btn-primary`; use `formatDuration` / `formatAmount` from `js/format.js`.

### 8.6 Projects (`#projects`) ✅
**Spec (§3.6):** "Projects" title · cyan `CREATE NEW PROJECT`. Filter bar Active · Client · Access ·
Billing · search. Table ☐ · NAME · CLIENT · TRACKED · AMOUNT · PROGRESS · ACCESS · ★ · ⋮.
**Built:** full table (TRACKED / AMOUNT / PROGRESS / ACCESS), 12-color picker, async stats
hydration, create/edit modal, archive/restore, hard delete (admin), client filter, search, RBAC
(admin edits, manager creates, member read-only). TRACKED = Σ`total_hours`; AMOUNT = THB over
billable entries; PROGRESS = TRACKED / `estimated_hours`.

### 8.7 Team (`#team`) ✅
**Spec (§3.7):** Title · tabs `[ MEMBERS | GROUPS | REMINDERS ]` · cyan `ADD NEW MEMBER`.
Members filter bar All · Billable rate · Role · Group · search. Table ☐ · NAME · EMAIL ·
BILLABLE RATE (THB)[Change] · ROLE (cyan badges) · GROUP dropdown · ⋮.
**Built:** Members/Groups tabs, rate masking (`—` for non-admin), inline role & group management,
Edit Profile modal on row click. *(Reminders tab = phase 2 placeholder.)*
**Name-change review (2026-06-04):** a pending name-change request shows a `name change ↗` chip on
the member's row; clicking opens a review modal (current → requested name + reason) with
Approve / Reject (reject is two-step with optional note). Approve writes `profiles.name` and updates
the row + sidebar live. Pending count rolls into the Notifications nav badge (with deletion requests).

### 8.8 Clients (`#clients`) ✅
**Spec (§3.8):** "Clients" title. Filter bar Show-active dropdown · search · quick-add form.
Table ☐ · NAME · ADDRESS · CURRENCY · ✏ · ⋮.
**Built:** quick-add, search, active filter, edit/archive/delete.

### 8.9 Tags (`#tags`) ✅
**Spec:** table NAME · color swatch · usage count · ⋮. Admin/owner full CRUD; others apply only.
**Built:** 24-swatch picker, usage count, edit/delete.

---

## 9. Modals & Overlays ✅ (matched to `UI UX Specification.md` §4)

> Original modal/overlay specs: [`UI UX Specification.md §4`](UI%20UX%20Specification.md).

### Time Entry Modal (`entryModal.js`) ✅
Shared by Calendar drag, Tracker click-to-edit, Timesheet cell. Fields: Task (Project→Task),
Date, time mode (Start+End ⟷ Total hours), Tags (compact inline picker + chips on one row),
Billable toggle (cyan when on), Description. Footer: Cancel · SAVE · Delete (edit) ·
**Duplicate** (clones current form state as a new entry, closes, calendar refetches).
`openCreateModal(profile, { …, userId })` lets admin create an entry for a specific teammate
(threaded to `createEntry`).

### Edit Profile Modal (`profileModal.js` — §4.1) ✅
Triggered from Team row or avatar → Profile. Large avatar + name + email + helper text.
Form: Week start · Working days (day-button selector, cyan when active) · Daily work capacity
(number + "hours per day"). Footer: Cancel · cyan SAVE.
**Display name** — editable input for admin/owner only; non-admins see it as static read-only
text (no helper hint shown).

### Preferences Modal (`prefsModal.js` — §4.2)
Tabs `General | Timesheet | Format | Apps`.
- **General** ✅ — Profile info (Name, Email, Job title) + static Access-role display.
  **Name is admin/owner-editable only (2026-06-04).** Non-admins see name as read-only.
  - No request: "Request change →" link → inline form (new name + required reason).
  - Pending: "Pending: …" badge (no link).
  - **Approved** (within 3 days, not dismissed): 🟢 green banner — *"Name change approved.
    Your display name is now '…'."* + ✕ dismiss.
  - **Rejected** (within 3 days, not dismissed): 🔴 red banner — *"Name change rejected.
    Requested: '…'. Admin note: '…'. Please send the required documents to
    admin@example.com."* + ✕ dismiss + new request form still available.
  - Banners auto-hide after 3 days (`reviewed_at`) and on ✕ dismiss (keyed to request id in
    `localStorage`).
  - Email stays disabled.
- **Format** ✅ — Start of week · Date format · Time format · Duration format (all dropdowns).
- **Timesheet / Apps** ⏸ — phase-2 placeholders.
Footer: cyan SAVE (right-aligned).

### Preferences notification dot (sidebar dropdown) ✅
An orange dot (`#ffb74d`) appears next to "Preferences" in the avatar dropdown for non-admins
when their latest name-change request has an unread decision (approved or rejected, within 3 days,
not dismissed). Dot clears immediately when the banner is dismissed. Powered by
`refreshPrefsNotification()` called at boot and after each dismiss.

### Sidebar profile row + dropdown (bottom-left of sidebar, global) ✅
Two-line profile widget pinned to the bottom of the sidebar. Layout:
`[SN avatar]  **Firstname** (bold)  ∨`
`             Company name (muted, 2nd line)`

- Avatar: 34 × 34 px rounded square, muted dark bg (`#37434f`), white 2-letter initials.
- First line: **bold** first name (`font-weight: 600`, `--text-primary`).
- Second line: company name (`--font-xs`, `--text-muted`). Hard-coded `"Hubble Engineering"` for
  all non-client roles; for `client` role, fetched from `clients.name` via `profile.client_id`.
- Chevron `∨` pushed to the right edge.
- Click anywhere on the row → dropdown opens **upward** (`bottom: calc(100% + 6px)`).
- Menu items: Profile · Workspace settings · **Preferences** (orange dot when unread decision) · Log out.
- The topbar no longer contains an avatar control.

---

## 10. Sidebar Navigation ✅ (branded "TIMESHEET") — re-synced 2026-07-10 (R60 cont., plan task A6.3)

> Original nav spec: [`UI UX Specification.md §2`](UI%20UX%20Specification.md). Source of truth for
> this section is `app.html`'s sidebar markup — re-verified against it directly, not carried forward
> from an earlier round (the previous version here predated Employees/Holidays/Expenses/Evaluation/
> Documents/Notifications/Admin Logs/Part Numbers/Help/Client Portal entirely).

```
TIMESHEET                       ← brand header
  ⏱  Time Tracker
  📊  Timesheet
  📅  Calendar
  🏢  My Portal                 ← client role ONLY (#client-portal, CLIENT-01)
ANALYZE
  ▦   Dashboard
  📈  Reports
MANAGE
  📄  Projects
  👥  Teams
  👤  Clients
  🏷  Tags
  ▾  SHOW MORE                  ← reveals the WMS section below
WMS  (behind SHOW MORE, role-filtered)
  🧑‍💼 Employees
  🌴  Leave & Holidays
  🧾  Expense & Travel
  ✅  Evaluation
  📁  Documents
  🔔  Notifications              ← route is #requests; visible label is "Notifications"
  📜  Admin Logs                 ← admin ONLY, hidden for everyone else
  #️⃣  Part Numbers
  ❓  Help
─────────────────────────────
[SN]  Firstname               ← bold
      Hubble Engineering  ∨   ← muted, 2nd line; click → dropdown ↑
```
Nav items are role-filtered at render (verified: full sidebar shows for owner). `My Portal` and
`Admin Logs` are the two entries hidden by default in markup (`style="display:none"`) and toggled
on per-role in `app-init.js`, rather than filtered by the general WMS role matrix.
Profile row is global (all roles); company line shows client name for `client` role.

**19 nav-routable pages** total: `#tracker` `#timesheet` `#calendar` `#client-portal` `#dashboard`
`#reports` `#projects` `#team` `#clients` `#tags` `#employees` `#holidays` `#expenses` `#evaluation`
`#documents` `#requests` `#admin-logs` `#part-numbers` `#help` (verified against `app.html`'s
sidebar markup + the `wmsRoutes`/`pages` maps in `app-init.js`).

---

## 11. Build Status & Remaining Roadmap

> ⚠️ **Superseded — this is the core-tracker-era roadmap.** Every WMS module (M2 Leave/Holiday, M4 Expense & Travel, M5 Evaluation, M6 Auto-Doc, Employees + Account Status, the login overhaul) is built & **live in prod** (R23–R35). For current status use [PENDING_TASKS.md](PENDING_TASKS.md) + [Timesheet_WMS_Master_Plan.md](Timesheet_WMS_Master_Plan.md). The table below is kept for history; statuses updated 2026-06-15.

| Page / module | State |
|---|---|
| `index.html` (login + diagnostics) | ✅ |
| `app.html` (shell, sidebar, avatar, router, role-based nav) | ✅ |
| `config.js` · `auth.js` · `router.js` · `format.js` | ✅ |
| `api/*` (timeEntries, projects, clients, tags, users) | ✅ |
| `entryModal.js` · `profileModal.js` · `prefsModal.js` | ✅ (profile + prefs now **read-only**; name/job-title via request flow — Round 4) |
| `tracker.js` · `clients.js` · `projects.js` · `tags.js` · `calendar.js` · `timesheet.js` · `team.js` · `dashboard.js` | ✅ |
| `reports.js` | ✅ Done — filter bar, KPI summary, stacked bar chart, grouped table, companion donut, CSV export, RBAC (Amount hidden from managers) |
| Google Sheets daily export | ⏸ PARKED — plan ready; needs app live + user-created Sheet URL |
| Deletion-request approval flow | ✅ Built as the **Notifications page** (`requests.js`) — deletion + name-change + job-title requests |
| Documents / M6 automated documentation | ✅ Live — `documents.js` + `api/documents.js`; templates, doc requests (R21), draft→generate; all migrations applied |
| GitHub Pages deploy + prod redirect URL | ✅ Live since R24 — he-cells.github.io/hubble-wms *(account transfer pending — see REPO_TRANSFER_CHECKLIST.md)* |
| Phase-2 placeholders (Reminders, Apps/Timesheet prefs, Google verification) | ⏸ |

### Remaining work, in order
1. **GitHub Pages deploy** (⏸) — push to Pages; add the production redirect URL to Supabase +
   Google Cloud Console. **Pre-launch blocker.**
2. ~~**Deletion-request approval flow**~~ ✅ **Built (2026-06-06)** as the **Notifications page**
   (`js/pages/requests.js`) — admin queue for deletion + name-change + job-title-change requests,
   approve/reject, nav badge. Managers still insert own rows only.
3. **Google Sheets daily export** (⏸ PARKED) — Apps Script + `Code.gs`. Needs: (a) app live,
   (b) user creates blank Google Sheet and provides URL. Plan documented in the plan file.
4. **Phase-2 placeholders** (⏸) — Reminders tab, Apps/Timesheet preference tabs, optional Google
   app verification (clears the `…supabase.co` line on the consent screen before public launch).

---

## 12. Fixed Bugs — Do Not Reintroduce

1. **"Database error saving new user" on first login.** `handle_new_user()` ran as
   `supabase_auth_admin` with a restricted `search_path` and couldn't resolve `profiles`. Fix in
   `schema.sql`: `SET search_path = ''`, schema-qualified `public.profiles`, granted
   `supabase_auth_admin` USAGE/INSERT/EXECUTE. **Keep these if you ever rewrite the trigger.**
2. **Silent bounce to login hid real errors.** `app.html` + `index.html` render an on-screen
   DIAGNOSTIC box on auth failure (`getAuthError()` from `auth.js`). **Keep until the app is stable.**
3. **Key format.** `supabase-js@2` accepts the new `sb_publishable_*` key. **Do NOT swap back to a
   hand-typed legacy JWT.**
4. **Re-running full `schema.sql`** errors with "policy already exists". The schema is applied —
   **only run targeted snippets, never the whole file.**
5. **`projects` SELECT RLS** returned 0 rows for owner/admin (deployed `projects_select` was missing
   the `is_admin()` branch). Fixed by the projects_select hotfix (applied 2026-06-01).
6. **Calendar white event border.** FC's default `border: 1px solid` overrode `border: none`.
   Triple-locked: (1) CSS `--fc-event-border-color: transparent`, (2) `border:none!important` +
   `box-shadow:none!important`, (3) `eventDidMount` sets `--fc-event-border-color: transparent`.
7. **Undefined CSS variables render transparent (Round 4).** `--border-color`, `--surface-1`,
   `--surface-2`, `--text-secondary` were used in inline styles app-wide but never defined →
   transparent/borderless boxes. Now defined in `tokens.css`. **Do not reference a CSS var without
   either defining it in `tokens.css` or giving an inline fallback `var(--x, fallback)`.**
8. **PostgREST "table not in schema cache" (recurring).** After creating a table, PostgREST's cache
   is stale until reloaded. Always run `NOTIFY pgrst, 'reload schema';`. Client code that queries a
   freshly-added table should also degrade gracefully (e.g. `.catch(() => [])`) so one missing table
   can't break a whole page.
9. **Hand-rolled floating dropdown was fragile (Round 4).** A custom `position:fixed` typeahead for
   the team employee selectors failed twice. Replaced with native `<input list>` + `<datalist>`.
   **Prefer native form controls over hand-positioned floating elements.**

---

## 13. Applied Migrations Ledger

All applied to the live database. **⚠️ Do NOT re-run the full `schema.sql`.**

| File (in `supabase/migrations/`) | Policies changed | Status |
|---|---|---|
| `20260601_calendar_edit_rls.sql` | `te_update` / `te_delete` — admin/owner edit any entry; manager edits assigned-project entries | ✅ Applied |
| `20260601_calendar_insert_rls.sql` | `te_insert` — admin/owner insert for any `user_id` (enables Calendar Teammates create) | ✅ Applied |
| *projects_select hotfix* | `projects_select` — re-asserts admin/member/manager/client visibility (fixes empty Projects page for owner) | ✅ Applied — **note: the `.sql` file is not on disk; applied directly** |
| `20260604_name_change_requests.sql` | new `name_change_requests` table + RLS (`ncr_insert`/`ncr_select`/`ncr_update`) + `profiles_name_change_guard` trigger blocking non-admin name edits | ✅ Applied (live since Phase 3) |
| `20260604b_name_change_reviewed_at.sql` | adds `reviewed_at` column (stamps the admin decision time → powers the 3-day employee rejection/approval banner) | ✅ Applied (live since Phase 3) |
| `20260620_manager_time_edit_rls.sql` | `te_insert`/`tet_insert`/`tet_delete` — manager parity on time-entry edit (own OR admin OR manager+`is_my_project()`) | ✅ Applied 2026-06-10 |
| `20260624b_time_entry_duration_check.sql` | `chk_te_hours_nonneg` — `CHECK (total_hours IS NULL OR total_hours >= 0)` on `time_entries` (R18-F5; UI guard in `entryModal.js`) | ✅ Applied 2026-06-10 |

> **Note:** this ledger covers core-tracker (M1) migrations only. The complete applied-migrations table for all WMS phases lives in [Timesheet_WMS_Master_Plan.md](Timesheet_WMS_Master_Plan.md) §Applied migrations.

---

## 14. Confirmed Decisions

- Currency **THB** · billable-rate terminology (not "pay rate") · dd/mm/yyyy · 24h · h:mm · Monday start.
- Theme: **dark only**.
- `owner` ≡ `admin` permissions.
- Billable rate: admin/owner-only visibility (app-layer masking).
- Client role: aggregate totals only via `client_project_totals` view.
- Export: **CSV only** from the Reports page (`report_YYYY-MM-DD.csv`). Google Sheets daily auto-export via Apps Script is planned but parked until go-live.
- **English UI only.**
- Phase-2 placeholders: Reminders tab, Apps + Timesheet preference tabs.
- **Sidebar profile widget** (2026-06-04): avatar moved from topbar top-right → sidebar
  bottom-left. 2-letter initials; bold first name on line 1; muted company name on line 2;
  chevron `∨` right-aligned; dropdown opens upward. Company = `"Hubble Engineering"` for all
  non-client roles; `client` role shows `clients.name` (fetched via `profile.client_id`).
- **Display-name changes require admin approval** (2026-06-04): employees cannot self-edit their
  name. They submit a name-change request **with a reason**; admin/owner approves (writes the name)
  or rejects. Enforced both in UI and at the DB layer (`profiles_name_change_guard` trigger).

---

## 15. Verification Steps (end-to-end)

Steps 1–7 are now **regression checks** (already passing); steps 8–13 include the **pending
acceptance criteria** for the remaining roadmap.

1. Open `index.html` (dark theme) → Google login button. ✅
2. Click → OAuth consent → redirect to `app.html#tracker`. ✅
3. Quick-add: type description, pick `@Project`, toggle `$`, ADD → row in today's group + Supabase row. ✅
4. `#calendar` → drag blank Tue 10:00–11:30 → modal pre-filled → save → block on Calendar AND in Tracker. ✅
5. Drag block edge → 12:00 → `end_time` + duration update. ✅
6. `#timesheet` → grid shows weekly totals; `Copy last week` duplicates entries to current week. ✅
7. `#dashboard` → 3 KPI cards + stacked bar (Mon–Sun) + donut populate. ✅
8. Log in as `member` → Reports/Clients hidden; Team shows no billable-rate column. ✅
9. Log in as `client` (with `client_id`) → only Calendar/Dashboard/Timesheet, scoped to own projects, no names/descriptions. ✅
10. **Reports:** as admin/owner/manager → filters + summary bar + stacked bar + grouped table + donut render; APPLY FILTER re-aggregates; Group-by changes re-render without refetch. *(built 2026-06-04 — user to verify with live data)*
11. **Reports CSV:** Export → `report_YYYY-MM-DD.csv`; AMOUNT column present for admin/owner, absent for manager. *(built 2026-06-04 — user to verify)*
12. **Deletion flow:** manager deletes a project → `deletion_requests` row → admin sees it in Notifications → approve → project deleted.
13. **Documents flow (pending smoke ⏸):** admin/manager opens Documents → Generate → pick employee/template → preview → Save Draft → TEAM DOCUMENTS → Generate → print/save PDF → mark sent/signed.
13. Preferences → change date format to `mm/dd/yyyy` → save → all dates re-render. ✅

---

## House Rules (from user's CLAUDE.md)
Plan-first · concise · evidence before "done" · flag RSK-0 (irreversible) before acting · don't add
features or refactor beyond the ask (surface, don't silently expand) · end every response with the
🟢 / 🟡 / 🔴 status block.
