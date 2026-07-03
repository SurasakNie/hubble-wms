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
