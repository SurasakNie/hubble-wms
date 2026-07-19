-- 20260716_manager_scope_time_and_requests.sql
-- Give managers row visibility (SELECT) + approval rights (UPDATE) over their
-- DIRECT REPORTS on the time/leave/expense tables.
--
-- WHY: R63 live walkthrough found a manager sees ZERO of their team's time
-- entries, leave requests, flex swaps, or expense/travel claims — the approvals
-- and team-calendar views come back empty. Root cause: 20260713 re-scoped only
-- profiles_select. The base RLS on these six tables is own-row (+ admin), with
-- NO manager->direct-report grant, so a manager can only ever see their own
-- rows. The Team page works because it reads profiles (already scoped); the
-- request/entry tables were never given the equivalent manager scope.
--
-- WHAT: one new SECURITY DEFINER helper is_my_report_emp() (keyed on
-- employees.id, the FK these tables use — distinct from is_my_report(), which
-- keys on profiles/auth user ids and is used for time_entries.user_id), plus
-- additive PERMISSIVE SELECT + UPDATE policies per table. Multiple PERMISSIVE
-- policies combine with OR, so these only ADD manager->report access on top of
-- whatever own/admin base policies already exist — they never narrow anything.
--
-- ⚠️ BEFORE RUNNING (base schema for these tables was never committed to this
--    repo — apply the same reconcile step used for profiles in R61):
--   1. Dump the existing policies so names don't collide and so you can confirm
--      admin already has access (these policies deliberately DON'T re-grant a
--      broad admin/own path beyond what's needed, but they're written to be
--      correct even if the base policy is missing):
--        SELECT tablename, policyname, cmd, qual, with_check
--        FROM pg_policies
--        WHERE tablename IN ('time_entries','leave_requests','flex_holiday_swaps',
--                            'cash_transactions','travel_claims','travel_requests')
--        ORDER BY tablename, cmd, policyname;
--   2. Confirm the ownership key column on each table matches what's assumed
--      here: time_entries.user_id (auth uid); the other five use employee_id
--      (employees.id). If any differ, adjust the matching policy below.
--   3. Confirm RLS is ENABLED on each table (it must be, since members already
--      only see their own rows). If a table shows rowsecurity=false, stop and
--      investigate — these policies would be inert.
--
-- CONVENTIONS (per prior migrations):
--   * NO BEGIN/COMMIT wrapper — the Supabase SQL Editor silently ran only a
--     fragment of wrapped files (R54/R55). Each statement autocommits.
--   * search_path pinned on the helper; anon EXECUTE revoked.
--   * DROP POLICY IF EXISTS + CREATE POLICY (never ALTER POLICY by name).
--
-- After running: execute the VERIFY block at the footer, then
--   NOTIFY pgrst, 'reload schema';

-- -- Helper ------------------------------------------------------------------

-- Target employees.id row belongs to a direct report of the caller.
-- (is_my_report(uuid) already exists for the profiles/user-id keyed case;
-- this variant keys on employees.id, which the request tables FK to.)
CREATE OR REPLACE FUNCTION public.is_my_report_emp(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM employees mgr
    JOIN employees rep ON rep.direct_manager_id = mgr.id
    WHERE mgr.user_id = auth.uid()
      AND rep.id = p_employee_id
  );
$$;

-- Caller's own employees.id (used for the own-row clause on employee_id tables).
CREATE OR REPLACE FUNCTION public.my_employee_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM employees WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.is_my_report_emp(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_employee_id()       FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_my_report_emp(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_employee_id()       TO authenticated, service_role;

-- -- time_entries (keyed on user_id = auth uid) -------------------------------

DROP POLICY IF EXISTS time_entries_select_scope ON public.time_entries;
CREATE POLICY time_entries_select_scope ON public.time_entries
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()          -- own
  OR is_admin()                 -- owner/admin: all
  OR is_my_report(user_id)      -- manager: direct reports
);

-- -- leave_requests / flex_holiday_swaps / cash_transactions /
-- -- travel_claims / travel_requests (keyed on employee_id = employees.id) ----

DROP POLICY IF EXISTS leave_requests_select_scope ON public.leave_requests;
CREATE POLICY leave_requests_select_scope ON public.leave_requests
FOR SELECT TO authenticated
USING (
  employee_id = my_employee_id()
  OR is_admin()
  OR is_my_report_emp(employee_id)
);

-- Managers approve/reject their reports' leave (2-tier flow); admin unchanged.
DROP POLICY IF EXISTS leave_requests_update_scope ON public.leave_requests;
CREATE POLICY leave_requests_update_scope ON public.leave_requests
FOR UPDATE TO authenticated
USING (
  is_admin()
  OR is_my_report_emp(employee_id)
)
WITH CHECK (
  is_admin()
  OR is_my_report_emp(employee_id)
);

DROP POLICY IF EXISTS flex_holiday_swaps_select_scope ON public.flex_holiday_swaps;
CREATE POLICY flex_holiday_swaps_select_scope ON public.flex_holiday_swaps
FOR SELECT TO authenticated
USING (
  employee_id = my_employee_id()
  OR is_admin()
  OR is_my_report_emp(employee_id)
);

DROP POLICY IF EXISTS flex_holiday_swaps_update_scope ON public.flex_holiday_swaps;
CREATE POLICY flex_holiday_swaps_update_scope ON public.flex_holiday_swaps
FOR UPDATE TO authenticated
USING (
  is_admin()
  OR is_my_report_emp(employee_id)
)
WITH CHECK (
  is_admin()
  OR is_my_report_emp(employee_id)
);

DROP POLICY IF EXISTS cash_transactions_select_scope ON public.cash_transactions;
CREATE POLICY cash_transactions_select_scope ON public.cash_transactions
FOR SELECT TO authenticated
USING (
  employee_id = my_employee_id()
  OR is_admin()
  OR is_my_report_emp(employee_id)
);

DROP POLICY IF EXISTS cash_transactions_update_scope ON public.cash_transactions;
CREATE POLICY cash_transactions_update_scope ON public.cash_transactions
FOR UPDATE TO authenticated
USING (
  is_admin()
  OR is_my_report_emp(employee_id)
)
WITH CHECK (
  is_admin()
  OR is_my_report_emp(employee_id)
);

DROP POLICY IF EXISTS travel_claims_select_scope ON public.travel_claims;
CREATE POLICY travel_claims_select_scope ON public.travel_claims
FOR SELECT TO authenticated
USING (
  employee_id = my_employee_id()
  OR is_admin()
  OR is_my_report_emp(employee_id)
);

DROP POLICY IF EXISTS travel_claims_update_scope ON public.travel_claims;
CREATE POLICY travel_claims_update_scope ON public.travel_claims
FOR UPDATE TO authenticated
USING (
  is_admin()
  OR is_my_report_emp(employee_id)
)
WITH CHECK (
  is_admin()
  OR is_my_report_emp(employee_id)
);

DROP POLICY IF EXISTS travel_requests_select_scope ON public.travel_requests;
CREATE POLICY travel_requests_select_scope ON public.travel_requests
FOR SELECT TO authenticated
USING (
  employee_id = my_employee_id()
  OR is_admin()
  OR is_my_report_emp(employee_id)
);

DROP POLICY IF EXISTS travel_requests_update_scope ON public.travel_requests;
CREATE POLICY travel_requests_update_scope ON public.travel_requests
FOR UPDATE TO authenticated
USING (
  is_admin()
  OR is_my_report_emp(employee_id)
)
WITH CHECK (
  is_admin()
  OR is_my_report_emp(employee_id)
);

NOTIFY pgrst, 'reload schema';

-- -- VERIFY (run individually; Studio only shows the last grid) ---------------
--
-- (a) Helpers present + search_path pinned (expect 2 rows, both with search_path):
--   SELECT proname, proconfig FROM pg_proc
--   WHERE proname IN ('is_my_report_emp','my_employee_id');
--
-- (b) New policies present (expect the *_select_scope / *_update_scope rows):
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE policyname LIKE '%_scope'
--   ORDER BY tablename, cmd;
--
-- (c) Behavioral (real tokens): as a MANAGER, GET /rest/v1/leave_requests and
--   /rest/v1/time_entries return the manager's own rows PLUS their direct
--   reports' rows (previously only own); as a MEMBER, still only own rows; as
--   a CLIENT, still zero (client_block_* RESTRICTIVE unaffected). Approve a
--   report's pending leave end-to-end (2D/2B walkthrough) — must succeed.
