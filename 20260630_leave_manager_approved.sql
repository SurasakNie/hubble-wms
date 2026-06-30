-- ============================================================
-- Migration: add 'manager_approved' to leave_requests.status
-- Run in Supabase Studio → SQL Editor.
--
-- Adds an intermediate status for 2-tier leave approval:
--   pending → manager_approved → approved
-- Used when leave_types.approval_tiers = 2
-- (e.g. Maternity, Paternity, Unpaid Leave).
--
-- Safe to re-run: drops existing status check constraint
-- (if any) by name-pattern before re-adding with new value.
-- ============================================================

do $$
declare
  _cname text;
begin
  select conname into _cname
  from pg_constraint
  where conrelid = 'public.leave_requests'::regclass
    and contype = 'c'
    and conname ilike '%status%'
  limit 1;

  if _cname is not null then
    execute format('alter table public.leave_requests drop constraint %I', _cname);
  end if;
end $$;

alter table public.leave_requests
  add constraint leave_requests_status_check
  check (status in ('pending', 'manager_approved', 'approved', 'rejected', 'cancelled'));

comment on column public.leave_requests.status is
  'pending → (manager_approved) → approved | rejected | cancelled. manager_approved is the intermediate state for 2-tier leave types.';

notify pgrst, 'reload schema';
