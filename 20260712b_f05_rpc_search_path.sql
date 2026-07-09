-- 20260712b_f05_rpc_search_path.sql
--
-- Salvaged from PR #26 (branch claude/next-session-plan-h9psa4, authored
-- 2026-07-04 as "20260711_f05_rpc_search_path.sql" — renamed here because
-- main's 20260711 date slot was later taken by the Part Numbers v2
-- migration). Content unchanged except this header and the removed
-- transaction wrapper.
--
-- ⚠️ NO BEGIN/COMMIT wrapper on purpose: wrapped migrations have twice run
-- only a fragment in the Supabase SQL Editor. The single DO block below is
-- idempotent — safe to re-run.
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

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFY (run separately after applying — expect the 3 rows to show
-- 'search_path=public, pg_temp' in proconfig):
--   SELECT p.proname, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname = ANY (ARRAY['approve_deletion_request',
--       'review_name_change_request','approve_job_title_change_request']);
-- ============================================================
