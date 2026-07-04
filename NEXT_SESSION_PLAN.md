# Handoff — Post-Transfer Follow-Up (Round 53 continuation)

*Created: 2026-07-03 · From: Claude (Sonnet 5, Claude Code) · For: whichever session/agent picks this up next*

## Context

The GitHub account transfer (`HE-cells` → `SurasakNie` for both `hubble-wms` and
`hubble-wms-backups`) is **complete and working** — see `REPO_TRANSFER_CHECKLIST.md` for
the full narrative, including two real production outages hit and fixed during the
cutover (a case-sensitivity bug in Supabase's Redirect URLs, and — much more seriously —
every Edge Function's CORS `ALLOWED_ORIGINS` list being hardcoded to the old domain,
which broke Employee ID + password login for everyone until fixed).

This doc tracks the **five follow-up items** the user asked for after the transfer itself
was done. Work through them in whatever order makes sense; none block each other except
where noted.

---

## 1. Full security/code audit — 🟡 status depends on how this session ended

The user asked for a full security/code audit in the style of this project's past audits
(`AUDIT_2026-06-17_FULL_PROJECT.md`, `AUDIT_2026-06-15_FULL_AUDIT.md` — XSS, RLS,
correctness, conventions dimensions).

**Check first: does an `AUDIT_2026-07-03_*.md`-style file already exist in the repo root
(or is one referenced in `PENDING_TASKS.md`'s most recent revision note)?**

- **If yes** (the prior session finished the audit and wrote it up): your job is to
  **review the findings with the user and fix whatever's agreed** — typically all
  Critical/High findings get fixed immediately, Medium/Low get triaged into the backlog,
  following this project's established practice (see how past audits were remediated in
  `PENDING_TASKS.md` Round 40, 44, 48–51 for the pattern: fix Highs, note Mediums/Lows in
  a backlog section, bump cache version and commit if any `.js`/CSS changed).
- **If no** (this session ended before the audit finished, or was ended intentionally to
  hand off): the audit needs to be run from scratch. Four parallel investigative agents
  were dispatched covering these four dimensions — reuse this exact scope, it was
  carefully written to reference the project's actual history and known bug classes
  rather than being generic:
  1. **XSS / input-sanitization** — every `.innerHTML =`/`.insertAdjacentHTML(`/template-
     literal HTML construction across `js/pages/*.js`, `js/components/*.js`,
     `js/api/*.js`; verify consistent use of the shared `esc()`/`attr()`/`sanitizeHtml()`
     helpers in `js/api/format.js` (no local escaping copies should exist — Round 40
     consolidated 13 of them, confirm none crept back).
  2. **RLS / SQL security** — read every `.sql` migration in the repo root plus
     `supabase/probes/`; check every table for RLS enablement + correct role/ownership
     scoping + WITH CHECK clauses on writes; hunt for circular-dependency bugs like the
     historical `get_my_role()` incident, SECURITY DEFINER functions/views that bypass
     RLS without re-checking authorization internally, and any `client`-role-reachable
     data that isn't scoped to that client (cross-tenant leaks are this app's
     highest-severity historical bug class — see `client_project_totals` and
     `get_my_role()` incidents). Check `search_path` pinning on all SECURITY DEFINER
     functions.
  3. **Correctness/logic** — date/timezone handling (ICT vs UTC slicing — a recurring bug
     class here), double-submit protection on approval/money flows, the fragile client-
     side error handling around the Edge-Function fetch call in `clients.js` that threw
     `TypeError: Cannot read properties of undefined (reading 'success')` when the CORS
     bug was live (now server-fixed, but the client code itself is still fragile and
     worth hardening with a real try/catch + user-facing error), and the `login_attempts`
     rate-limiter's fail-open behavior being handled correctly client-side for all its
     response codes (200/401/429/500).
  4. **Conventions** — full compliance sweep against `CLAUDE.md`'s documented rules:
     shared `empSelect`/`weekNav` component usage (no hand-rolled pickers or nav bars),
     cache-versioning correctness (`?v=` in `app.html` matching claims in `CLAUDE.md`,
     no `?v=` pins on shared `js/api/`/`js/components/` imports), the Modal Pattern
     (backdrop-click-to-close is required for the global Esc handler to work — flag any
     bespoke per-modal Esc handler or any modal missing backdrop-click-close),
     `.row-actions`/`.table-actions` usage (never `opacity:0` on action cells), and the
     dark-theme input rule (full `padding` shorthand required near any icon adornment,
     never `padding-left`/`padding-right` alone — a documented recurring bug class).

  Dispatch these as 4 parallel `general-purpose` subagents (not `Explore` — that agent
  type is search-only and explicitly doesn't produce review-quality findings). Have each
  return a severity-rated (Critical/High/Medium/Low), file:line-cited report, then
  synthesize into a new `AUDIT_2026-07-0X_FULL_PROJECT.md` following this repo's existing
  audit-doc format, and propose fixes for anything Critical/High to the user before
  implementing.

## 2. Re-run `f01_prod_client_probe.sh`

**This cannot be run from a Claude Code cloud/sandboxed session** — confirmed this
session via `curl -v ... CONNECT tunnel failed, response 403` reaching Supabase directly,
and a second confirmation via `WebFetch` also getting a 403 reaching the public Pages
site. It must be run from a machine with real, unrestricted internet access (the user has
one at `D:\Dropbox\Claude Working Folder\Interactive Timesheet\hubble-wms` on Windows).

The first attempt this session failed with `{"code":400,"error_code":"invalid_credentials"}`
— **not a transfer-related bug**, just an unconfirmed/wrong test client login. Ask the
user whether they've since reset a test client's password via the admin Clients page to a
known value, then have them run:

```powershell
cd "D:\Dropbox\Claude Working Folder\Interactive Timesheet\hubble-wms"
git pull origin main   # they were previously ~100 commits stale on a local main; re-verify each time
bash f01_prod_client_probe.sh <exact_client_code> "<exact_password>"
```

Expect all checks to PASS (Supabase/RLS was never touched by the GitHub transfer) —
if anything fails, that would be a genuinely new and unexpected finding worth digging
into immediately, not something to explain away as transfer-related.

## 3. Spot-check the Add-Member modal "App link"

Already confirmed correct in source and merged to `main` before this doc was written:
`js/pages/team.js:573` reads `new URL('index.html', window.location.href).href` (fixed
from the old `${window.location.origin}/index.html`, which dropped the `/hubble-wms/`
Pages subpath). This session could not click-through-verify it live (same network block
as above — a Claude Code cloud session can't reach the deployed Pages site).

Ask the user to do a 10-second live check: log in as admin → Team page → **Add Member** →
confirm the shown "App link" reads exactly
`https://surasaknie.github.io/hubble-wms/index.html`. If it doesn't, something regressed
between the source fix and what's actually deployed — check Pages build status and
whether a hard-refresh (cache-bust) is needed.

## 4. Decide on the `Claude Design Import` GitHub App

Purely the user's call — not something to investigate further. On the old `HE-cells`
account, two GitHub Apps were installed: `Claude` and `Claude Design Import`. On the new
`SurasakNie` account, only `Claude` was already present (which is why this session's own
GitHub API access kept working seamlessly through the whole transfer with no manual
reinstall needed). Ask the user: do they actually use the Design Import feature (Figma or
similar design-file import) for this project? If yes, they need to install it manually on
`SurasakNie` via GitHub's own UI (no API/tool can do this on their behalf — it's an
OAuth-consent action). If no, there's nothing to do.

## 5. "The other tasks left" — full open-items list as of this handoff

Everything below is copied from the Final Verification Checklist in
`REPO_TRANSFER_CHECKLIST.md` (section 14) — check that file for the authoritative,
up-to-date state before assuming anything below is still accurate:

- [x] Pages loads clean on the new URL (confirmed indirectly via a working login)
- [x] Google sign-in works (fixed a case-sensitivity bug mid-transfer)
- [x] Employee ID + password login works (fixed the Edge Function CORS bug — the big one)
- [x] Admin actions backed by Edge Functions retested and working post-CORS-fix
- [ ] `f01_prod_client_probe.sh` — **this doc's item 2 above**
- [x] `hubble-wms-backups` nightly cron confirmed running post-transfer
- [x] Watch re-armed on the backups repo
- [ ] Add-Member "App link" — **this doc's item 3 above**
- [x] Local git remotes updated (also discovered and fixed a ~100-commit-stale local
      `main` in the process — worth a reminder to always `git pull`, not just `git fetch`,
      before assuming a local file "doesn't exist")
- [ ] GitHub Apps — **this doc's item 4 above** (`Claude` already fine; `Claude Design
      Import` is the only open question, and it's optional)
- [x] Users notified of the URL change

**Bottom line: items 2 and 4 need the user's direct action (things only they can do —
run a script on their own machine, or click through a GitHub OAuth consent screen). Item
3 needs a 10-second live check from the user. Item 1 (the audit) is the only piece of
substantive engineering work left, and its status depends on whether the prior session
finished it before ending — check for an `AUDIT_2026-07-0X_*.md` file first.**

---

## 6. CONSOLIDATED POST-TRANSFER VERIFICATION CHECKLIST (as of 2026-07-03, Round 54)

*This section supersedes the scattered items above — it merges (a) the audit's
`⚠️ PENDING prod Studio apply` migrations, (b) the peer session's Edge-Function / role-login
test list, (c) this round's PR money-flow changes, and (d) the leftover items 2–4 from
this doc. **The audit itself is DONE** (`AUDIT_2026-07-03_FULL_PROJECT.md`, all
Critical/High fixed on branch `claude/next-session-plan-h9psa4` → PR #26). What remains is
almost entirely things a cloud session cannot do: run SQL in Studio, click through the
live app, decide an OAuth consent.*

### Do first — apply the two pending migrations in Supabase Studio
These are the only items that make the audit's RLS fixes actually take effect in prod;
until applied, the Critical finding (12 client-readable internal tables incl. salary) is
still live. Both are independent of the PR merge — just run the SQL.
- [ ] Apply `20260710_client_block_expanded.sql` (the Critical client-block gap + `is_admin()` swap)
- [ ] Apply `20260711_f05_rpc_search_path.sql` (M-2 `search_path` hardening)

### Dependency chain — one test-client password covers three checks
Reset ONE test client's password in the admin Clients page to a known value first (the
last probe run failed on bad credentials, not a real bug). Then, in order:
- [ ] Re-run `f01_prod_client_probe.sh <client_code> "<pw>"` → expect all checks PASS, incl. the 12 new tables now returning 0 rows
- [ ] Log in as that client through the **real login form** → confirms the client portal still loads (it only reads the 5 intentionally-allowed tables, so the migration shouldn't break it — this proves it)

### Independent — one click-through pass, any order
- [ ] `provision-client` — Clients page → provision a test client
- [ ] `admin-clear-mfa` — clear 2FA on a test account
- [ ] `admin-set-account-active` — deactivate then reactivate a test account
- [ ] `account-activation-status` — Employees → Account Status tab loads without error
- [ ] **Manager**-role login through the UI
- [ ] TOTP/2FA challenge screen (only if a test account has 2FA enabled — separate code path)
- [ ] **PR #26 money-flow spot-check** (this round's new status-guards touch approval): a normal expense/leave approve + reject, the two-stage "Save & Approve", and one admin **status override on a travel claim** (that override path was rewired to a new `overrideTravelClaimStatus` + also fixes a latent bug where an override to rejected/pending got coerced to manager_approved)
- [ ] Add-Member "App link" reads exactly `https://surasaknie.github.io/hubble-wms/index.html`

### Your call / comms — not tests
- [ ] `Claude Design Import` GitHub App — install on `SurasakNie` only if you use design-file import (OAuth consent, only you can do it)
- [ ] "URL changed" message to users should say **"you'll need to sign in again"** — sessions don't carry across domains and locally-cached UI state (dismissed notifications, "seen" flags) resets on the new origin

### Known caveat — noted, low risk, no action needed unless a flow gets wired
- Supabase's `Site URL` is `http://localhost:3030` by design, so any **native** Supabase auth
  email (magic link, signup confirm, native password reset) would embed a dead localhost
  link. Safe today because this app uses admin-provisioned passwords + its own admin-reset
  Edge Function, not self-serve email flows. **Only becomes a bug if someone ever wires
  "forgot password" (or any signup/magic-link flow) to Supabase's native email** instead of
  the app's own path — at which point set `Site URL` to the prod origin. Worth a glance:
  confirm the login screen has no "forgot password" link pointing at Supabase native reset.
