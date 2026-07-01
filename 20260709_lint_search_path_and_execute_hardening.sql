-- ============================================================
-- Migration: lint_search_path_and_execute_hardening
-- Run in Supabase Studio → SQL Editor.
--
-- Closes the Supabase database-linter security WARNs (L-FNSP / L-SPDEV):
--   1. 0011 function_search_path_mutable  (12 functions)
--   2. 0028 anon_security_definer_function_executable
--   3. 0029 authenticated_security_definer_function_executable
--
-- Idempotent: uses ALTER/REVOKE/GRANT keyed on function name (no bodies
-- recreated), matches every overload/signature via oid::regprocedure, and
-- skips names that don't exist. Safe to re-run.
--
-- NOT covered here (dashboard-only, see footer): 0032
-- auth_leaked_password_protection — a Supabase Auth toggle, no SQL.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 0011 — pin search_path on the 12 flagged functions
--
-- These are SECURITY INVOKER trigger/compute helpers (none appear in the
-- SECURITY DEFINER lint lists). Pinning `public, extensions, pg_temp`:
--   • satisfies the linter (an explicit, non-mutable search_path),
--   • keeps unqualified `public.*` and extension-function references working
--     (so no function body needs rewriting), and
--   • lists pg_temp LAST, closing the temp-schema relation-hijack vector that
--     an unset search_path leaves open.
-- ------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'compute_total_hours',
        'employee_check_digit',
        'compute_employee_id',
        'set_leave_request_updated',
        'set_flex_swap_validity',
        'compute_leave_days',
        'set_cash_txn_updated',
        'set_travel_request_meta',
        'compute_travel_claim',
        'check_assignment_role',
        'set_document_updated_at',
        'client_check_digit'
      ])
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
    RAISE NOTICE '0011 search_path pinned: %', r.sig;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2. 0028 / 0029 — trigger & internal SECURITY DEFINER functions
--
-- Never called via /rest/v1/rpc and never referenced in an RLS USING/CHECK
-- expression. Trigger functions do NOT require EXECUTE on the invoking role
-- (Postgres fires them regardless), so revoking from every client role is
-- safe and closes BOTH the anon and authenticated warnings for these.
-- ------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = ANY (ARRAY[
        'compute_client_code',
        'enforce_name_change_via_request',
        'guard_evaluation_update',
        'guard_profile_self_update',
        'handle_new_user',
        'log_employee_change',
        'post_travel_claim_to_ledger',
        'sync_leave_balance_on_approval'
      ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    RAISE NOTICE '0028/0029 locked down trigger fn: %', r.sig;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. 0028 — real RPCs + RLS-helper SECURITY DEFINER functions
--
-- These MUST stay callable by signed-in users:
--   • RPCs        — invoked from client JS via .rpc() by admins/managers
--   • RLS helpers — invoked during policy evaluation as the authenticated user
--                   (revoking authenticated here would break RLS everywhere)
--
-- So: strip the default PUBLIC grant (which is what lets `anon` in → closes
-- 0028), then re-grant EXECUTE to authenticated + service_role. The 0029
-- (authenticated) warning is expected to remain for these — it is by design.
-- ------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = ANY (ARRAY[
        -- RLS helpers (evaluated inside policies)
        'auth_is_client',
        'can_read_eval_response',
        'can_write_eval_response',
        'get_my_role',
        'is_admin',
        'is_manager_of',
        'is_my_client_project',
        'is_my_project',
        'my_client_id',
        'owns_employee',
        -- RPCs called from client JS
        'approve_deletion_request',
        'approve_job_title_change_request',
        'approve_trip_settlement',
        'create_cycle_evaluations',
        'get_client_project_summary',
        'get_evaluation_kpis',
        'get_project_stats',
        'get_tag_usage',
        'review_name_change_request'
      ])
  LOOP
    EXECUTE format('REVOKE ALL   ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL   ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    RAISE NOTICE '0028 restricted to authenticated: %', r.sig;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFY (run separately after COMMIT — should return 0 rows)
--
-- 2a. Any of the 12 still missing a search_path?
--   SELECT p.proname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname = ANY (ARRAY['compute_total_hours','employee_check_digit',
--       'compute_employee_id','set_leave_request_updated','set_flex_swap_validity',
--       'compute_leave_days','set_cash_txn_updated','set_travel_request_meta',
--       'compute_travel_claim','check_assignment_role','set_document_updated_at',
--       'client_check_digit'])
--     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c
--                     WHERE c LIKE 'search_path=%');
--
-- 2b. Can anon still EXECUTE any flagged SECURITY DEFINER function?
--   SELECT p.oid::regprocedure::text
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosecdef
--     AND has_function_privilege('anon', p.oid, 'EXECUTE');
--
-- 2c. Do the 8 trigger fns still grant EXECUTE to authenticated? (expect 0)
--   SELECT p.proname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname = ANY (ARRAY['compute_client_code','enforce_name_change_via_request',
--       'guard_evaluation_update','guard_profile_self_update','handle_new_user',
--       'log_employee_change','post_travel_claim_to_ledger','sync_leave_balance_on_approval'])
--     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
-- ============================================================

-- ============================================================
-- 4. 0032 auth_leaked_password_protection — DASHBOARD ACTION (no SQL)
--
-- Not fixable from the SQL Editor. Enable in the Supabase Dashboard:
--   Authentication → Policies (Password) → "Leaked password protection"
--   (checks new/changed passwords against HaveIBeenPwned.org).
-- Requires a Pro plan on this project. Track alongside M-PWPOL
-- (min-password-length) — both are one-time admin toggles.
-- ============================================================
