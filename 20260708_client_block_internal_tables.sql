-- 20260708_client_block_internal_tables.sql
--
-- F-01 remediation: RESTRICTIVE client-block policies on all internal tables
-- that must be completely invisible to the 'client' role.
--
-- Root cause: 20260707_client_read_hardening.sql used ALTER POLICY (by name)
-- which silently no-ops when the policy name doesn't match prod. Additionally,
-- using get_my_role() directly in a RESTRICTIVE policy on other tables causes
-- a circular RLS dependency (get_my_role reads profiles; profiles has its own
-- RLS; the function silently returns NULL inside the policy evaluation context).
--
-- Fix: new SECURITY DEFINER helper auth_is_client() that bypasses the circular
-- dependency, plus RESTRICTIVE policies on all 11 leaking tables using it.
--
-- Tables intentionally accessible to the client role (NOT blocked here):
--   profiles          -- client reads own row (id = auth.uid())
--   clients           -- client reads own company row (clients_select policy)
--   projects          -- client reads own projects (is_my_client_project())
--   cash_transactions -- client reads expense rows for own projects
--   travel_requests   -- client reads travel rows for own projects
--
-- Probe result after applying: 22 PASS / 0 FAIL / 0 WARN (2026-06-30)

BEGIN;

-- Step 1: SECURITY DEFINER helper -- bypasses RLS circular dependency
CREATE OR REPLACE FUNCTION public.auth_is_client()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'client'
  )
$$;

-- Step 2: RESTRICTIVE policies using the new helper
DO $$
DECLARE
  t   TEXT;
  pol TEXT;
  tbl TEXT[] := ARRAY[
    'time_entries',
    'leave_requests',
    'employees',
    'petty_cash_settings',
    'document_templates',
    'group_members',
    'task_assignments',
    'evaluation_cycles',
    'evaluation_questions',
    'evaluation_responses',
    'login_attempts'
  ];
BEGIN
  FOREACH t IN ARRAY tbl LOOP
    pol := 'client_block_' || t;
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT auth_is_client())',
      pol, t
    );
    RAISE NOTICE 'Created RESTRICTIVE policy % on %', pol, t;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
