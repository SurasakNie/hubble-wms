# Mode: `migration` — scaffold a `YYYYMMDD_*.sql`

Goal: create a new SQL migration following the project's conventions. Reference shape:
`20260629_audit_log.sql`. These run **manually in Supabase Studio → SQL Editor** (no
automated runner); the repo keeps them as a record + the applied-migrations ledger.

Ask the user (if unclear): what the migration does, the table/columns or change, and the
RLS intent (who may insert/select/update). Then produce the file + ledger row.

## File name
`YYYYMMDD_<slug>.sql` in the repo root (e.g. `20260629_audit_log.sql`). Use today's date;
if a same-day file already exists for a different change, suffix a letter (`…b`, `…c`).

## Template

```sql
-- ============================================================
-- Migration: <slug> — <one-line purpose>
-- Run in Supabase Studio → SQL Editor.
--
-- <2-4 lines: what this creates/changes and why.>
--
-- RLS:
--   INSERT — <who> (e.g. authenticated; actor_id must equal auth.uid())
--   SELECT — <who> (e.g. admin/owner only via get_my_role())
-- ============================================================

create table if not exists public.<table> (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now()
  -- … columns …
);

comment on table public.<table> is '<what it is, who writes rows>';

create index if not exists idx_<table>_created_at on public.<table> (created_at desc);

alter table public.<table> enable row level security;

create policy "<table>_insert" on public.<table>
  for insert to authenticated
  with check (actor_id = auth.uid());

create policy "<table>_select_admin" on public.<table>
  for select to authenticated
  using (get_my_role() in ('owner', 'admin'));

notify pgrst, 'reload schema';
```

## Standing rules
- **Always end with `notify pgrst, 'reload schema';`** — required after any table/schema
  change so PostgREST picks it up (standing op note in `HE_WMS_Specification.md`).
- Target the `authenticated` role, not `anon`. Use the existing helpers — `get_my_role()`,
  `auth.uid()`, `is_manager_of()` — rather than inlining role logic. Mark any helper
  function `SECURITY DEFINER` with `SET search_path` when it must bypass RLS.
- Prefer `create … if not exists` / idempotent `UPDATE`s so re-running is safe.

## After writing the file
1. **Add a row to the Applied migrations ledger** in `Timesheet_WMS_Master_Plan.md`
   (the table at `## Applied migrations (Supabase — in order)`):
   ```
   | `YYYYMMDD_<slug>.sql` | <date applied or "pending"> | <what it does> |
   ```
2. **Remind the user it must be run in Supabase Studio** before any frontend that depends
   on it goes live. (Currently pending: `20260629_audit_log.sql` is NOT yet applied in prod
   — the audit-log JS depends on it.)
