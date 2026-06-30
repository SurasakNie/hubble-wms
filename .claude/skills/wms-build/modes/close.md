# Mode: `close` — end-of-session docs ritual

Goal: capture the session's work so the next session starts with accurate state. Three
artifacts to update, in order. Determine the next Round number first (current baseline is
**Round 45** — so the next session is **R46** unless told otherwise).

## 1. Round-N entry → `PENDING_TASKS.md`
Add an entry summarizing what changed this round. Match the existing format and status
symbols used throughout the file:

- ✅ done · 🟢 on track / open-low · 🟡 in progress / caveat · 🔴 blocker / P0 · ⏸ paused

Heading style mirrors existing entries, e.g. `### ✅ RNN · <short title> *(YYYY-MM-DD)*`,
followed by exact file changes, version bumps, and any newly-opened or closed items. Carry
forward still-open items (e.g. pending migrations, go-live gates).

## 2. Baseline / memory line → `CLAUDE.md`
Update the "Current baseline after **Round N**" bullet under **## Cache Versioning**. Keep
the shape exactly:

> Current baseline after **Round N** (<short descriptor>, YYYY-MM-DD): **working JS `?v=NNN`
> / CSS `?v=MM`**, tokens.css `?v=KK`. **Next session: bump from v=NNN.** R-N: <one-paragraph
> summary of what shipped — new files, routes, migrations, open items>.

Also update the **wms-build SKILL.md** "Current baseline" section (`.claude/skills/wms-build/
SKILL.md`) to the same numbers, so the skill's own memory stays in sync.

Roll the prior baseline note into the "Prior R…" trail (the bullet keeps a short history of
recent rounds + their commits/versions). Update any "Migrations APPLIED in prod Studio" /
"STILL OPEN" lines if state changed.

## 3. Cache sanity check → `app.html`
Confirm the live values match what you just wrote:
- `const V` at `app.html:737` = the JS `?v=` you recorded.
- CSS `<link>` `?v=` at `app.html:11-14` = the CSS / tokens values you recorded.
If a `.js` page file changed this session but `V` wasn't bumped, bump it now (the
SessionStart hook only *warns*; it never edits).

## Then
Deploy if the session shipped app changes: commit + `git push` (no build step). Note in the
Round entry the commit hash and whether prod was deployed / migration applied.

## Current state to advance from (R45)
- JS `?v=109`, CSS `?v=38`, tokens.css `?v=22`.
- Open P0: F-01 authenticated prod client RLS probe (go-live gate).
- Pending migration: `20260629_audit_log.sql` not yet applied in prod Studio.
