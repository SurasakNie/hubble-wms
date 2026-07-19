# Phase 2 — Live Browser Walkthrough Guide

> Companion to the Phase 2 checklist in `PRE_LAUNCH_AUDIT_PLAN.md` (sections 2A–2I).
> A 2026-07-16 static code audit already traced this checklist through source — see
> that file's per-section notes and the matching entry in `PENDING_TASKS.md` for what
> was found. This guide is for the **live click-through** that audit couldn't do
> (no network access to prod from that session).

**App:** https://surasaknie.github.io/hubble-wms/
**Accounts needed:** one sci-fi roster login each for **member**, **manager**, **admin**, **client** (before the roster swap).
**Before you start:** open DevTools Console in each session — a couple of the checks below rely on catching a silently-swallowed error, not just a visual glitch.

Go through the sections in order: **Member → Manager → Admin → Client** (later roles need to see what earlier roles created).

---

## ✅ R63 status (2026-07-16) — first walkthrough done, fixes applied

The first live run is complete; all findings were root-caused and fixed (cache
v=126). **Update 2026-07-16: all 3 migrations applied in Studio (user-confirmed)
and v=126 merged to `main` + deployed** — plus one post-audit fix in the same
deploy: Calendar/Timesheet now also default to "Myself" like the Tracker.
**What still needs a RE-TEST now that everything is live:**

1. **Manager sees their team's rows** (`20260716`) — as a manager, confirm Team
   Calendar, Timesheet employee-picker, Leave approvals, Flex approvals, and
   Expense approvals now show direct reports' rows (were empty). Approve a
   report's pending leave end-to-end.
2. **Admin cross-user views** (`20260716`) — as admin, pick another employee in
   Calendar/Timesheet and confirm their entries display (Tracker now defaults to
   "Myself").
3. **Maternity leave** (`20260716b`) — set an employee's Gender = Female in the
   employee modal; confirm Maternity appears in their leave-type dropdown and is
   hidden for a male/unset employee.
4. **Mileage total distance** (`20260716c`) — submit a round-trip claim; the
   stored reimbursement must equal distance × rate (not ×2).
5. **Duplicate customer PN** — re-test on a project whose Customer-PN mode is
   **manual** (the first test was almost certainly a `none`-mode project, where
   there is no customer PN to duplicate and the internal number is always fresh).
6. **Manager creates a project** (`20260716d`, PENDING Studio) — after applying
   that migration, log in as a manager, click CREATE NEW PROJECT, fill it in, and
   confirm it saves (was failing: the button showed but the DB INSERT was
   admin-only). Editing/archiving others' projects stays admin-only by design.

Everything else from the first run is fixed in v=126 (calendar arrows, billable
role-gating, tracker default, leave year range, balance-card order, PN category
required, code-duplicate error messages, employee-edit audit logging, manager
self-assign) or confirmed by-design.

**Two walkthrough notes resolved as by-design / decided (no v=126 code change):**
- **Member "can access the employee page"** — that was the **Team** page, which
  members are meant to see (R61 same-group scoping). The admin Employees
  Directory (`#employees`) is gated to admin only and its nav item is hidden for
  everyone else, so there's no leak.
- **Petty cash — member can't access** — intended; petty cash stays admin-only.
- **Client bounced from `#part-numbers`** — intended; clients are confined to
  the portal, so a manual hash is redirected there.
- **Manager "can't create a project"** — you chose to **let managers create**;
  handled by migration `20260716d` (re-test item 6 above), not a by-design block.

---

## 🧑 Member account

### 2A · Calendar & Timesheet
- [ ] Calendar renders the current month with holidays shown
- [ ] Weekly timesheet: add / edit / delete an entry
- [ ] 🔎 **Check specifically:** after saving an entry, is there any submit/approval step, or does it just save as final? (Static audit found no submit-for-approval flow anywhere in code — confirm that's real.)
- [ ] 🔎 **Check specifically:** look for a WFH toggle near the entry itself. If WFH is only reachable through a separate Flex Swap request form, that matches the audit finding (no standalone toggle).
- [ ] Confirm you only see your own entries, not teammates'

### 2B · Leave & Holidays
- [ ] My Leave: request leave, confirm balance cards look right
- [ ] Watch status flow: pending → manager_approved → (later) approved
- [ ] Flex Swaps: submit a request
- [ ] Holidays: calendar + list view render (read-only for you)

### 2C · Expenses & Petty Cash
- [ ] Submit an expense with a receipt URL, confirm status flow
- [ ] Try a petty cash draw
- [ ] Confirm per-diem rate displays correctly

### 2D · Employees & Requests
- [ ] Directory: search and filter by department
- [ ] Submit a **name-change request** (leave it pending for the admin step below)
- [ ] Submit a **job-title request** (leave it pending)
- [ ] Open your own profile: confirm name is read-only
- [ ] 🔎 **Check specifically:** is there any avatar upload/edit control anywhere? (Audit found none — only an initials placeholder.)
- [ ] Security tab: enroll TOTP 2FA

---

## 🧑‍💼 Manager account

### 2A · Calendar & Timesheet
- [ ] Confirm you see your team's entries, not just your own

### 2B · Leave & Holidays
- [ ] 🔎 **Scrutinize this one:** open Team Leave — do you see only your direct reports, or every employee in the company? This is the one item the static audit could **not** confirm from code (client-side filtering only excluded your own rows; no RLS was found in the repo to verify server-side scoping) — your answer here resolves an open, unverified finding.
- [ ] Approve or reject the flex swap request submitted above

### 2C · Expenses & Petty Cash
- [ ] Approve or reject the expense submitted above as member

### 2I · Team & Projects
- [ ] Team page: confirm you see same-group staff + direct reports
- [ ] Confirm any client rows shown are read-only — no rate/role/group/delete controls
- [ ] Go to Projects → assign modal → **Managers** section, toggle yourself onto a project you're not currently on — confirm **no error** (this exercises a table that was completely unwritable until a recent fix)
- [ ] Recheck your Team page — the newly-assigned project's client should now appear (read-only)

---

## 🛡️ Admin account

### 2D · Employees & Requests
- [ ] **Approve** the name-change request from the member step
- [ ] **Approve** the job-title request from the member step
- [ ] Submit + **reject** a second pair of test requests (name-change and job-title) — this exercises a different code path than approve (reject bypasses the atomic RPC per the static audit)
- [ ] Account Status tab: provision, reset password, and deactivate a test account

### 2A · Calendar & Timesheet
- [ ] Confirm you see all employees' entries, not just your own

### 2E · Clients & Documents
- [ ] Add a client, manage its logins, provision a client login
- [ ] Documents: create a template in the TEMPLATES editor, merge with employee data, preview it
- [ ] Reports: confirm project stats and tag usage render

### 2F · Admin Logs
- [ ] Confirm log entries appeared for every approve/reject/provision action done above
- [ ] Test entity, actor, and date-range filters
- [ ] Scroll past 20 rows to confirm pagination works
- [ ] 🔎 **Check specifically:** edit a plain employee field directly (e.g. job title, not via the request flow) — then check whether that shows up in Admin Logs. Audit found only account-state actions (provision/reset/deactivate) get logged, not plain field edits — confirm whether that's expected (there's a separate trigger-based log table it may belong to instead).

### 2H · Part Numbers
- [ ] Mint a Part Number on a real project — confirm format `CCC-PPP-CAT-SEQ`
- [ ] Try minting on a project whose client/project is missing its `code` — confirm a clear error message
- [ ] Try a duplicate customer PN (same project) — confirm it's rejected, and a follow-up mint doesn't skip a sequence number
- [ ] Delete an item, then mint again — confirm the deleted number is never reused
- [ ] Category picker shows the 11 governed codes with "covers" help text
- [ ] Attribute dropdowns default to **TBD** when unset; Lists modal opens correctly
- [ ] Clients/Projects pages: confirm the `code` (CCC/PPP) inputs save and reject duplicates

### 2I · Team & Projects
- [ ] Team page: confirm you see all staff + all clients, with clients still read-only

---

## 🏢 Client account (separate login)

### 2G · Client Portal
- [ ] Confirm only your own company name and project show
- [ ] Hours-by-project bar chart renders
- [ ] Expenses & travel table shows only your own rows
- [ ] Download the text export
- [ ] 🔎 **Check specifically:** scan the notes/destination fields in the table and export for any employee names. Nothing currently strips free-text fields, so if staff ever typed a name into an expense note or travel destination, it would show up here — flag anything you find.
- [ ] Confirm no employee names appear anywhere on the page

### 2H · Part Numbers
- [ ] Confirm `#part-numbers` shows no data at all

---

## Reporting back

For each checkbox, note pass/fail. For any fail, include a screenshot or the exact error text. Send results back and they'll be folded into `PRE_LAUNCH_AUDIT_PLAN.md` + `PENDING_TASKS.md`, following the same format as prior audit rounds.
