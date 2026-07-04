-- 20260711_f05_rpc_search_path.sql
--
-- Round 54 audit M-2 follow-up.
--
-- The three F-05 request-review RPCs (f05_request_review_rpcs.sql) were created
-- with `SET search_path = public` only. Postgres always implicitly searches
-- pg_temp FIRST for unqualified relation names unless pg_temp is explicitly
-- placed (and thus repositioned) in search_path -- the exact reasoning
-- documented in 20260709_lint_search_path_and_execute_hardening.sql for the 12
-- functions it hardened, but these 3 SECURITY DEFINER RPCs were never in its
-- scope. They reference their tables unqualified (deletion_requests, clients,
-- profiles, employees, ...), so an attacker who could create a same-named
-- pg_temp relation could shadow them inside the definer context.
--
-- Not exploitable through the app today (PostgREST gives no client a way to
-- CREATE TEMP TABLE), so this is defense-in-depth + consistency with the
-- established convention, not an active leak. Fixed the cheap, behaviour-
-- preserving way: ALTER each function to list pg_temp LAST, matching 20260709.
--
-- Idempotent: matches every overload via oid::regprocedure, skips names that
-- don't exist. Safe to re-run.

BEGIN;

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
        'approve_deletion_request',
        'review_name_change_request',
        'approve_job_title_change_request'
      ])
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    RAISE NOTICE 'M-2 search_path pinned (pg_temp last): %', r.sig;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFY (run separately after COMMIT — expect the 3 rows to show
-- 'search_path=public, pg_temp' in proconfig):
--   SELECT p.proname, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname = ANY (ARRAY['approve_deletion_request',
--       'review_name_change_request','approve_job_title_change_request']);
-- ============================================================
