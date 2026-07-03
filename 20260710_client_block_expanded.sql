-- 20260710_client_block_expanded.sql
--
-- Round 54 audit follow-up to 20260708_client_block_internal_tables.sql.
--
-- That migration's hand-maintained 11-table array missed several internal
-- tables that the client JS never reads but that ARE reachable via a direct
-- PostgREST call from any authenticated 'client'-role session, same bug
-- class as the original F-01 leak:
--   - employee_compensation   -- salary/rate PII, most sensitive miss
--   - evaluations             -- parent of the 3 evaluation_* tables that
--                                 WERE blocked (evaluation_cycles/questions/
--                                 responses) -- the base table itself wasn't
--   - employee_documents, employee_audit_log
--   - leave_balances, flex_holiday_swaps       -- siblings of blocked leave_requests
--   - job_title_change_requests, name_change_requests, deletion_requests
--   - travel_claims           -- internal reimbursement/approval-tier table;
--                                 distinct from travel_requests, which IS
--                                 intentionally client-visible (client portal
--                                 reads travel_requests directly, never
--                                 travel_claims -- verified via clientPortal.js)
--   - project_assignments, groups
--
-- Also folds in M-3: audit_log_select_admin still gated on get_my_role(),
-- the function root-caused as the source of the original circular-RLS-
-- dependency bug (see 20260708's header). Switches it to is_admin(), the
-- purpose-built replacement already hardened + granted in
-- 20260709_lint_search_path_and_execute_hardening.sql. Uses DROP+CREATE
-- (not ALTER POLICY), per 20260708's own documented lesson that ALTER POLICY
-- silently no-ops when the policy name doesn't match prod.
--
-- Tables intentionally accessible to the client role (unchanged, NOT blocked):
--   profiles, clients, projects, cash_transactions, travel_requests

BEGIN;

-- Step 1: extend the RESTRICTIVE client-block list
DO $$
DECLARE
  t   TEXT;
  pol TEXT;
  tbl TEXT[] := ARRAY[
    'employee_compensation',
    'evaluations',
    'employee_documents',
    'employee_audit_log',
    'leave_balances',
    'flex_holiday_swaps',
    'job_title_change_requests',
    'name_change_requests',
    'deletion_requests',
    'travel_claims',
    'project_assignments',
    'groups'
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

-- Step 2: audit_log_select_admin -- get_my_role() -> is_admin()
DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_admin" ON public.audit_log
  FOR SELECT TO authenticated
  USING (is_admin());

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFY (run separately after COMMIT)
--
-- All 12 new tables should now reject a client-role session (expect 0 rows
-- / empty array from each, when queried with a client JWT):
--   SELECT * FROM employee_compensation LIMIT 1;
--   SELECT * FROM evaluations LIMIT 1;
--   SELECT * FROM employee_documents LIMIT 1;
--   SELECT * FROM employee_audit_log LIMIT 1;
--   SELECT * FROM leave_balances LIMIT 1;
--   SELECT * FROM flex_holiday_swaps LIMIT 1;
--   SELECT * FROM job_title_change_requests LIMIT 1;
--   SELECT * FROM name_change_requests LIMIT 1;
--   SELECT * FROM deletion_requests LIMIT 1;
--   SELECT * FROM travel_claims LIMIT 1;
--   SELECT * FROM project_assignments LIMIT 1;
--   SELECT * FROM groups LIMIT 1;
--
-- Sanity: an owner/admin session should still see audit_log rows normally
-- (policy logic unchanged, only the underlying role-check function swapped).
--
-- Extend supabase/probes/f01_prod_client_probe.ps1 (and its bash sibling,
-- see the M-1 cleanup in this same round) with these 12 tables so the probe
-- catches any future regression the same way it now covers
-- client_project_totals from R51.
-- ============================================================
