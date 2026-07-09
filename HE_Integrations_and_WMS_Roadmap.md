# Plan — Daily Google Sheets Auto-Export + WMS Expansion Roadmap

> **Date:** 2026-06-02 · **Updated:** 2026-07-09 · **Status:** Plan for approval · **Author:** Claude (Opus 4.8)
> **Scope decision (confirmed with user):** Build the daily Google Sheets export now via Google
> Apps Script; document the WMS expansion as a roadmap only.
>
> **Revised 2026-07-09:** cadence changed from weekly (Friday night only) to **daily** (every
> night) per user request. Still $0, still zero app/schema changes — only the Apps Script trigger
> and function name change (`weeklyExport()` → `dailyExport()`, `onWeekDay(FRIDAY)` →
> `everyDays(1)`). Supabase read volume rises ~7× (one full-history fetch per day instead of per
> week) — trivial at current team scale, noted in the cost analysis below.

## Context

The deployed **TIMESHEET** app is a static (GitHub Pages) vanilla-JS Clockify-style tracker on
Supabase. Two goals prompted this plan:

1. **Automatic daily export to Google Sheets.** Every night (~23:59 Asia/Bangkok), all
   time entries should be pushed to **one** Google Sheet with **one tab per employee**, so the
   sheet accumulates a complete record from the start date to today. Columns:
   **Date · Project · Client · Employee · Description · Time spent · Notes**.
2. **Expand the system toward the WMS** (the `WMS-handoff-v1.0.md` / `The System.md` vision:
   admin-seeded auth, leave/holiday, employee DB, expense/travel, evaluation, auto-doc). For now
   this is a **documented roadmap only** — not built.

**Why the export is the whole challenge:** the data shape is already perfect — `getEntries()` in
`js/api/timeEntries.js` returns `date`, `project.name`, `project.clients.name`, `total_hours`,
`description`, and `user_id` per row. The only real problem is that a **static site cannot run a
nightly cron**, and the browser anon key is RLS-gated (can't read *all* employees' rows). So
the scheduler must live server-side with an elevated read path.

**Decision (confirmed with user):** run the job in **Google Apps Script** bound to the target
Sheet, on a daily `Asia/Bangkok` trigger, reading Supabase via the **`service_role`** key stored
privately in Script Properties. **This requires zero changes to the deployed app, UI, or RLS.**

---

## Part 1 — Google Sheets daily auto-export (BUILD NOW)

### Architecture (no app/Supabase changes)

```
Google Sheet  ──bound──►  Apps Script project (Code.gs)
                              │  daily trigger: ~23:00–24:00 ICT
                              ▼
                          PostgREST GET  https://<ref>.supabase.co/rest/v1/time_entries
                              │  Authorization: Bearer <service_role>   (bypasses RLS → all users)
                              ▼
                          group by employee → get/create tab → append only NEW entry ids
```

- **No Supabase schema migration**, **no Edge Function**, **no `pg_cron`**, **no service account**.
- The `service_role` key bypasses RLS (returns every user's rows) and lives **only** in Script
  Properties — never in the repo, never in the deployed frontend. (RSK-1: powerful key; mitigated
  by Apps Script properties being private to the owner account.)

### Files to create (for version control / reference — the user pastes `Code.gs` into Apps Script)

| File | Purpose |
|---|---|
| `integrations/google-sheets/Code.gs` | The Apps Script: fetch, group, incremental append, trigger setup. |
| `integrations/google-sheets/appsscript.json` | Manifest pinning `"timeZone": "Asia/Bangkok"`. |
| `integrations/google-sheets/README.md` | Step-by-step setup + the security note on the service_role key. |

### `Code.gs` design

**Config** — read from `PropertiesService.getScriptProperties()` (set once in the Apps Script UI):
`SUPABASE_URL`, `SERVICE_ROLE_KEY`, optional `START_DATE` (default: all history), optional
`SPREADSHEET_ID` (default: the bound sheet).

**Functions:**

- `dailyExport()` — trigger entry point:
  1. **Fetch all entries** via PostgREST with embedded joins, paginating in 1000-row pages
     (PostgREST default cap) using `Range` headers or `&limit=1000&offset=N` until a short page:
     ```
     GET /rest/v1/time_entries?select=
       id,date,total_hours,description,
       user:profiles(name,email),
       project:projects(name,client:clients(name))
       &order=date.asc&limit=1000&offset=0
     ```
  2. **Group by employee** (`user.name`, fall back to `user.email`, then `user_id`).
  3. For each employee: `getOrCreateSheet(name)` — sanitize the tab name (strip `: \ / ? * [ ]`,
     trim to 100 chars, de-dupe), write the header row if the tab is new.
  4. **Incremental append:** read the hidden **`EntryID`** key column of the tab into a Set;
     append only entries whose `id` is not already present, in `date.asc` order. This yields a
     cumulative start→today record with **no duplicates**, and picks up back-dated entries on the
     next run. (Edits/deletes to already-pushed rows do not propagate — accepted, append-only.)
- `setUpTrigger()` — run once manually: deletes existing triggers, creates
  `ScriptApp.newTrigger('dailyExport').timeBased().everyDays(1).atHour(23).create()`.
  (Apps Script daily triggers fire within the 23:00–24:00 window in the project timezone — close
  enough to "11:59 PM"; the ~1h window is a documented caveat.)
- `testConnection()` — logs the fetched row count + first row, for setup verification.

**Column mapping (per tab):**

| Sheet column | Source | Notes |
|---|---|---|
| Date | `date` | Written as a real Date value, `dd/mm/yyyy` display format → sortable in Sheets. |
| Project | `project.name` | |
| Client | `project.client.name` | Blank if no client. |
| Employee | `user.name` | Redundant inside a per-employee tab, but requested (eases later consolidation). |
| Description | `description` | The single free-text field. |
| Time spent | `total_hours` | Written as `h:mm` text (matches app convention). |
| Notes | — | **Left blank** by the export; reserved for manual annotation, preserved across runs. |
| `EntryID` (hidden) | `id` | Dedup key; column hidden via `hideColumns()`. |

> **Schema note:** the data model has only a single free-text field (`description`). There is no
> separate "Notes" field. So **Description** maps to the entry's `description`, and **Notes** is a
> blank column for *manual* annotation in the Sheet. Because the export only ever appends new rows
> (never rewrites old ones), anything typed into Notes survives every future run.

### Verification (user-run — cannot be driven by the preview MCP)

1. Create the destination Google Sheet; **Extensions → Apps Script**; paste `Code.gs` +
   `appsscript.json`.
2. Set Script Properties (`SUPABASE_URL`, `SERVICE_ROLE_KEY`); set project timezone `Asia/Bangkok`.
3. Run `testConnection()` → authorize scopes → confirm the log shows a sensible **row count** and a
   sample row with name/project/client populated.
4. Run `dailyExport()` once manually → confirm: one **tab per employee**, header row, rows in date
   order, `Time spent` as `h:mm`, hidden `EntryID` column present.
5. Run `dailyExport()` **again** → confirm **no rows duplicated** (incremental dedup works); type a
   value in a `Notes` cell, re-run, confirm it **survives**.
6. Run `setUpTrigger()` → confirm a daily trigger appears under **Triggers**.

---

## Part 2 — WMS expansion roadmap (DOCUMENT ONLY, do not build)

Create `WMS-expansion-roadmap.md`: a gap analysis between the current build and
`WMS-handoff-v1.0.md`, plus a phased plan. Also add a short pointer + the new integration entry to
`HE_interactive_timesheet_plan.md` (RSK-2, reversible).

### Sequencing decision (2026-06-06)

**Auth model overhaul is deliberately deferred to last.** All intermediate phases (3–7) gate access on the existing `is_admin()` helper (owner/admin roles). A single RLS reconciliation sweep applies the WMS 5-role matrix (Employee/Manager/HR Admin/Finance/System Admin) when the auth model is flipped immediately before going live. Build order: **Phase 3 → 4 → 5 → 2 → 6 → 7 → Phase 1 (last, before launch).**

---

### Core finding — two foundational reworks gate everything else

1. **Auth model is fundamentally different.**
   - *Today:* self-service Google OAuth; anyone with a Google account can sign in; `profiles` row
     auto-created by the `handle_new_user()` trigger.
   - *WMS (`The System.md` + handoff §3):* **admin-seeded only** — no self-registration. Admin
     creates the account → system issues a one-time OTP (72h, single-use) → first login forces
     email/Google linking + password set + profile verification → unlinking all methods **freezes**
     the account (preserve, never delete) → only admin regenerates. Optional 2FA (TOTP/email OTP).
   - *Impact:* requires disabling open OAuth signup, an admin user-provisioning UI, an OTP/onboarding
     flow, account-status (`active`/`pending`/`frozen`) state + RLS, and a freeze-on-unlink hook.
     This is the **single biggest divergence** and should be Phase 1 of any WMS work.

2. **Timesheet semantics differ.**
   - *Today:* project-time tracking (start/end, billable, tags) — no attendance, no submit/approve.
   - *WMS (M1):* attendance-oriented — Work Location (Office/Remote/Trip), Clock In/Out, Overtime,
     **weekly submit → manager approve → lock**, and **auto-fill** from approved Leave/Holiday/Trip.
     The existing project-time grid becomes one *facet* of an approval-gated weekly timesheet.
   - *Impact:* add `status`, `work_location`, submission/approval/lock columns + an approval UI and
     state machine. KPI/payroll/export must read **approved-and-locked** rows only (handoff RSK-06).

### Suggested phasing (each gated by PM sign-off; respects the handoff's RSK register)

> Auth (Phase 1) is last by design — see sequencing decision above. All phases use `is_admin()` until Phase 1 lands.

| Phase | Scope | Depends on | Status |
|---|---|---|---|
| **0 (done/near-done)** | Current tracker, Projects, Clients, Team, Tags; Reports stub still pending. | — | ✅ Done |
| **3 — Employee DB (M3)** | Master employee record; Employee ID (`DD-T-NNN-CC`); audit trail, doc-expiry alerts. | — | ✅ Built & working |
| **4 — Leave & Holiday (M2)** | Leave types/balances, holiday calendar, 3-tier request flow → auto-fills timesheet. | Phase 3 | ✅ Built & working |
| **5 — Expense & Travel (M4)** | Claims + travel approval; trip approval auto-fills timesheet. | Phase 3 | ✅ Built & signed off (R17, 2026-06-10) |
| **2 — Timesheet → central hub (M1)** | Attendance fields, weekly submit/approve/lock, auto-fill slots. | Phase 3 | 📋 Roadmap |
| **6 — Evaluation (M5)** | KPIs auto-derived from *approved* timesheets; review cycle. | Phases 2 + 4 | 🔨 Next build target |
| **7 — Auto-Doc (M6)** | Template engine + merge fields + e-signature; offer→onboarding pipeline. | Phases 3 + 6 | 📋 Roadmap |
| **1 — Auth overhaul** ⚠️ **LAST** | Admin-seeded accounts, OTP onboarding, link/unlink + freeze, RLS reconciliation sweep. | All phases complete | ⏸ Before launch |

The roadmap doc will also restate the handoff's **12 open decisions (OD-1…OD-12)** as blockers and
note that the WMS uses a **5-role** matrix (Employee/Manager/HR Admin/Finance/System Admin) vs. the
app's current 5-tier (owner/admin/manager/member/client) — the two role models must be reconciled
in Phase 1.

### Answer to "what changes in the current build?"

- **From the export feature: nothing.** No page, UI, RLS, or schema change — automation is entirely
  external (Apps Script + service_role key).
- **From the WMS expansion: substantial, but later** — chiefly the auth overhaul (Phase 1) and the
  attendance/approval timesheet (Phase 2). Documented now, built only on sign-off.

---

## Cost analysis

### Part 1 — Google Sheets daily export: **$0**

| Component | Cost | Why |
|---|---|---|
| Google Apps Script | Free | Runs on Google's infra; no paid tier needed. |
| Google Sheets | Free | Part of the existing Google/Workspace account. |
| Daily time-driven trigger | Free | — |
| Supabase reads (PostgREST) | Free | One full read per day, well inside the free tier (~7× the original weekly-cadence volume — still trivial at current team scale). |
| GitHub Pages | Free (unchanged) | No app changes at all. |

**Apps Script quotas are runtime, not dollars** — ~90 min/day total runtime, 6 min per execution,
`UrlFetchApp` ~20k calls/day. A daily run of a few hundred to a couple thousand rows uses a tiny
fraction, even at 7×/week instead of 1×/week. The only ceiling is tens of thousands of entries in
one run (the 6-min cap), which is far off and solvable later with batching. **Effectively free
indefinitely at normal team scale.** The only non-dollar "cost" is the `service_role` key
sensitivity (keep it in private Script Properties only).

### Part 2 — WMS expansion: deferred, optional, decision-gated

Documenting the roadmap is free. *Building* it later introduces real costs, mostly from leaving
free tiers:

| Driver | Likely cost | Trigger |
|---|---|---|
| Email delivery (OTP, onboarding, approval/leave/expiry notices) | ~$0–15/mo | Supabase built-in auth email is rate-limited; add a provider (Resend/Postmark/SES), most have ~3k/mo free tiers. |
| Supabase Pro plan | ~$25/mo | Once free limits (storage, backups, rows) are exceeded — likely after Employee DB + documents + history grow. |
| Document storage (M6 auto-docs, passports, certs) | Storage-tier dependent | Free tier ~1 GB; PDFs/scans push past it. |
| E-signature (M6) | $10–40/user/mo (DocuSign/Adobe) | **Largest cost.** Handoff OD-8 lists "built-in" specifically to avoid it. |
| SMS OTP (handoff OD-2, optional) | per-message | Only if SMS 2FA is chosen; TOTP/email OTP avoids it. |

**Bottom line:** the change being approved now is **genuinely $0**. Expansion costs are deferred and
decision-gated, and the biggest (e-signature) already has a free "built-in" path flagged in the
handoff.

---

## Files summary

| Action | Path |
|---|---|
| **Create** | `integrations/google-sheets/Code.gs` |
| **Create** | `integrations/google-sheets/appsscript.json` |
| **Create** | `integrations/google-sheets/README.md` |
| **Create** | `WMS-expansion-roadmap.md` |
| **Modify** | `HE_interactive_timesheet_plan.md` — add an "Integrations: daily Google Sheets export" note + a pointer to the roadmap; bump the status table. |

**No changes** to `js/`, `css/`, `supabase/`, `app.html`, or `index.html`.
