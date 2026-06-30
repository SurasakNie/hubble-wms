---
name: wms-build
description: >-
  Scaffolding for the WMS / Interactive Timesheet app's recurring chores. Three
  modes, dispatched on the first argument: `page` (scaffold a new WMS page —
  module + nav wiring + route + cache bump), `migration` (scaffold a
  YYYYMMDD_*.sql with RLS template + NOTIFY pgrst + Studio reminder + applied-
  migrations row), and `close` (end-of-session docs ritual — Round-N entry,
  memory/baseline bump, cache sanity check). Invoke explicitly (`/wms-build page`)
  or by intent ("scaffold a new page", "new migration", "close out this session").
---

# wms-build

Dispatch on the first token of `$ARGUMENTS`:

| Arg | Mode | Read |
|-----|------|------|
| `page` | Scaffold a new WMS page | `modes/page.md` |
| `migration` | Scaffold a `YYYYMMDD_*.sql` | `modes/migration.md` |
| `close` | End-of-session docs ritual | `modes/close.md` |

If no mode is given (or it's unrecognized), ask the user which of the three they
want before doing anything. Read the matching mode file and follow it.

## Project non-negotiables (every mode must honor these)

These come from `CLAUDE.md` — re-check it if anything here looks stale.

- **Shared components, never hand-rolled.** Any employee picker/search uses
  `empSelect` (`js/components/empSelect.js`); any week/period bar uses `weekNav`
  (`js/components/weekNav.js`). Unique `idPrefix` per page.
- **Dark theme — never ship a white input.** `style.css` styles inputs via a
  `:not()` **denylist**, so any plain `<input>` is dark automatically. Never set a
  light/`#fff` background; never use `padding-left`/`padding-right` alone on an
  input (the high-specificity denylist `padding` shorthand clobbers it — use the
  full `padding` shorthand). `index.html` is the exception: it has its own scoped
  input styles and does not load `style.css`.
- **Modals** follow the `.modal-backdrop > .modal[.modal-lg] > header/body/footer`
  structure appended to `document.body`; close on ✕ / Cancel / backdrop click. Esc
  is handled globally — never add a per-modal Esc handler; just close on backdrop.
- **Table action buttons** use `.row-actions` / `.table-actions`; never `opacity:0`.
- **Cache versioning.** Bump `const V` in `app.html` whenever a `.js` **page** file
  changes; bump the CSS `?v=` on the `<link>` when `style.css` changes. **Shared
  modules (`js/api/*.js`, `js/components/*.js`) are imported WITHOUT `?v=` pins** —
  never add per-file suffixes there (it splits module state). Only the `V` constant
  feeding the `pages` map gets bumped.
- **Deploy = commit + `git push`** (no build step). Repo is app-only; docs /
  supabase / credentials are gitignored.

## Current baseline (keep in sync via `close` mode)

After **Round 45** (client logins UX + comprehensive audit log, 2026-06-29):
working **JS `?v=109`**, **CSS `?v=38`**, **tokens.css `?v=22`**. Next session
bumps from `v=109`. This is the single source of truth the `close` mode advances.
