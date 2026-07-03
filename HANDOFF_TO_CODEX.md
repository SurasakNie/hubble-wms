# Handoff to Codex — Pre-Launch Audit Phases 1–4

*Created: 2026-07-01 · From: Claude (Sonnet 5, Claude Code) · For: Codex*

## Why you're getting this

This is the **Hubble Engineering WMS** — a vanilla HTML/CSS/JS timesheet + workforce
management app on a Supabase backend, deployed to GitHub Pages
(https://surasaknie.github.io/hubble-wms/, repo `SurasakNie/hubble-wms` — transferred
from `HE-cells` 2026-07-03; the old `he-cells.github.io` URL is dead, no redirect,
see [REPO_TRANSFER_CHECKLIST.md](REPO_TRANSFER_CHECKLIST.md)). It's gated
for go-live behind a 5-phase pre-launch audit. I (Claude) wrote the audit plan,
closed out Phase 5's must-fix items, and assembled everything Phases 1–4 need to
run — but I'm running in a Claude Code container with **no network access to prod
Supabase or GitHub Pages** (confirmed via a hard 403 policy denial at the outbound
proxy: `curl "$HTTPS_PROXY/__agentproxy/status"` shows `connect_rejected` for both
`sjkggguedgtynktymzes.supabase.co` and `he-cells.github.io`). If you have real
network access, you can pick up exactly where I left off.

## Read these two files first

1. **[PRE_LAUNCH_AUDIT_PLAN.md](PRE_LAUNCH_AUDIT_PLAN.md)** — the full 5-phase plan,
   pass/fail gates, and current status. Phase 5's must-fix items (CONV-M4, L-CSP)
   are done and merged (PR #20, commit `8dcbaac`) — don't redo them.
2. **[PRE_LAUNCH_AUDIT_EXECUTION_PACKET.md](PRE_LAUNCH_AUDIT_EXECUTION_PACKET.md)** —
   copy-paste-ready SQL (Phases 1F/1G/1H/3), curl commands with exact payload
   shapes for all 7 Edge Functions (Phase 1E), and linear browser checklists
   (Phases 1B/1C/2/4). This is the actual work list — don't re-derive commands
   from the plan doc, they're already assembled here.

## What you're being asked to do

Execute **Phases 1–4** of the audit plan, using the execution packet as your
script. In order:

| Phase | What | Where |
|---|---|---|
| 1A | Anon probe re-run | Prod, via the local (gitignored) `anon_probe.scratch.ps1` — target 45/45 PASS |
| 1B | Member role probe | Live app in browser, sci-fi roster member account |
| 1C | Manager role probe | Live app in browser, sci-fi roster manager account |
| 1D | Client RLS probe re-run | `./f01_prod_client_probe.sh <email> <password>` — target 22/22 PASS |
| 1E | Edge Function input validation | curl, 7 functions — packet has exact commands |
| 1F | New policy review | Supabase Studio SQL Editor |
| 1G | Audit log INSERT policy test | curl REST insert with spoofed `actor_id` — expect 403 |
| 1H | F-05 RPC regression check | Supabase Studio SQL Editor — should already be 3/3, just re-confirm |
| 2 | Functional walkthrough | Live app in browser, all roles |
| 3 | Data integrity queries | Supabase Studio SQL Editor — all should return 0 rows |
| 4 | UI/UX consistency + **L-CSP live check** | Live app in browser + DevTools console |

The **L-CSP live check in Phase 4** is the one item that's new since the plan was
written: I added a `<meta http-equiv="Content-Security-Policy">` tag to `app.html`
and `index.html` (PR #20) and externalized their inline `<script type="module">`
boot code into `js/app-init.js` / `js/login-init.js` to keep the policy strict.
I could not verify this live. **Specifically confirm**: zero CSP violations in
DevTools console on both pages, the Inter font renders correctly, and login +
app boot both still work end-to-end (a wrong `script-src` would break boot
entirely, a wrong `font-src` would silently drop the font).

## What you'll need that isn't in this repo

Credentials are intentionally not committed (`CLAUDE.md`: "Repo is app-only —
docs/supabase/credentials are .gitignored"). You'll need, from the user:
- Supabase Studio access (SQL Editor) for Phases 1F/1G/1H/3
- Sci-fi roster test account credentials for member/manager/admin/client roles
  (Phases 1B/1C/2/4)
- A test client login (email + password) already provisioned via the admin
  Clients page, for Phase 1D
- Admin and member access tokens (obtainable by logging in as those roles and
  capturing the `access_token` from the `login` Edge Function response) for the
  Phase 1E/1G curl commands

The anon key is already public/hardcoded in `f01_prod_client_probe.sh` and is
safe to reuse — it's a publishable key, not a secret.

## What "done" looks like

The pass criteria table at the bottom of `PRE_LAUNCH_AUDIT_PLAN.md` — every
phase green means Phases 1–4 clear and the plan moves to **team review** and
then the **roster swap**.

## What NOT to do

- **Do not run the roster swap** (`TRUNCATE CASCADE`, seeding real employees,
  rotating the OAuth secret). That's explicitly LAST, requires 3 in-session
  user confirms (RSK-0), and is out of scope for an audit pass.
- If you find a real bug while auditing (not just a checklist fail to report),
  use your judgement on whether it's small enough to fix inline — if so, follow
  the project's conventions in `CLAUDE.md` (dark-theme input rule, modal
  pattern, cache-version bump on any `.js` page file or `style.css` change,
  shared `empSelect`/`weekNav` components, etc.) and bump the cache version
  accordingly. If it's ambiguous or architecturally significant, flag it
  instead of guessing.
- Don't touch `js/app-init.js` / `js/login-init.js` / the CSP meta tags unless
  the live check in Phase 4 finds them actually broken — they were verified
  byte-for-byte against the original inline code before merge, so a failure
  there most likely means a **policy value** is wrong (missing origin, etc.),
  not the extraction itself.

## Reporting back

Update `PRE_LAUNCH_AUDIT_PLAN.md` (check off phases, note pass/fail results)
and add a new Round entry to `PENDING_TASKS.md` following the existing format
(see the Round 50 entry at the top for the pattern: what was tested, what
passed/failed, cache version if it changed, migrations applied if any). Commit
and push to a branch, then open a PR — this repo's convention is
squash-merge, PR-per-session, no direct pushes to `main`.
