-- 20260717_manager_group_member_scope.sql
-- Re-scope manager data-visibility from "direct reports" to "same-group MEMBERS",
-- per the role-tiered access model (R63 follow-up).
--
-- MODEL (authoritative):
--   owner/admin : see + approve time/leave/flex/expense for EVERYONE (all groups).
--   manager     : see + approve for SELF + same-group users whose role = 'member'.
--                 A manager can see the NAMES of same-group admins/managers
--                 (Team page / profiles) but NOT their time/leave/flex/expense.
--   member      : own data only; cannot approve anything. Can see the NAMES of
--                 ALL same-group staff (other members, managers, admins) via the
--                 Team page / profiles_select, but NOT any of their data.
--   client      : unchanged (blocked by client_block_* RESTRICTIVE policies).
--
-- Name/roster visibility already matches this (profiles_select uses shares_group
-- for all same-group staff, 20260713) — this migration only changes the six
-- DATA tables + lets a manager read same-group members' employee rows so the
-- time-page employee picker can list them.
--
-- SUPERSEDES 20260716's manager scope: that release scoped these tables to
-- is_my_report_emp() (direct reports). This replaces those *_scope policies with
-- a same-group-member predicate. (is_my_report_emp/my_employee_id from 20260716
-- are kept — my_employee_id is still used for the own-row clause.)
--
-- ⚠️ BEFORE RUNNING: dump current policies so you can see what's there
--   (20260716's *_scope policies will be dropped + recreated by this file):
--     SELECT tablename, policyname, cmd FROM pg_policies
--     WHERE policyname LIKE '%_scope' OR tablename='employees'
--     ORDER BY tablename, cmd, policyname;
--   Confirm key columns: time_entries.user_id (auth uid); the other five use
--   employee_id (employees.id); employees.user_id links to profiles.id.
--
-- CONVENTIONS: no BEGIN/COMMIT wrapper; each statement autocommits;
-- DROP POLICY IF EXISTS + CREATE POLICY; search_path pinned on helpers;
-- anon EXECUTE revoked. After running: run the VERIFY block, then NOTIFY pgrst.

-- -- Helpers ------------------------------------------------------------------

-- Target user shares >=1 group with the caller AND target's role = 'member'.
CREATE OR REPLACE FUNCTION public.shares_group_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_members a
    JOIN group_members b ON b.group_id = a.group_id
    JOIN profiles p ON p.id = b.user_id
    WHERE a.user_id = auth.uid()
      AND b.user_id = p_user_id
      AND p.role = 'member'
  );
$$;

-- Same, but the target is identified by employees.id (the FK the request/expense
-- tables use). Maps employees.id -> employees.user_id -> group + role check.
CREATE OR REPLACE FUNCTION public.shares_group_member_emp(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM employees e
    JOIN group_members a ON a.user_id = auth.uid()
    JOIN group_members b ON b.group_id = a.group_id AND b.user_id = e.user_id
    JOIN profiles p ON p.id = e.user_id
    WHERE e.id = p_employee_id
      AND p.role = 'member'
  );
$$;

REVOKE ALL ON FUNCTION public.shares_group_member(uuid)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shares_group_member_emp(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shares_group_member(uuid)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_group_member_emp(uuid) TO authenticated, service_role;

-- -- time_entries (keyed on user_id = auth uid) --------------------------------

DROP POLICY IF EXISTS time_entries_select_scope ON public.time_entries;
CREATE POLICY time_entries_select_scope ON public.time_entries
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()                                            -- own
  OR is_admin()                                                   -- owner/admin: all
  OR (get_my_role() = 'manager' AND shares_group_member(user_id)) -- manager: same-group members
);

-- -- leave_requests / flex_holiday_swaps / cash_transactions /
-- -- travel_claims / travel_requests (keyed on employee_id = employees.id) -----
-- SELECT: own OR admin OR (manager AND same-group member).
-- UPDATE: admin OR (manager AND same-group member) — members cannot approve;
--         members' own-row updates (submit/cancel) come from the base policy.

DROP POLICY IF EXISTS leave_requests_select_scope ON public.leave_requests;
CREATE POLICY leave_requests_select_scope ON public.leave_requests
FOR SELECT TO authenticated
USING (
  employee_id = my_employee_id()
  OR is_admin()
  OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id))
);

DROP POLICY IF EXISTS leave_requests_update_scope ON public.leave_requests;
CREATE POLICY leave_requests_update_scope ON public.leave_requests
FOR UPDATE TO authenticated
USING      (is_admin() OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id)))
WITH CHECK (is_admin() OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id)));

DROP POLICY IF EXISTS flex_holiday_swaps_select_scope ON public.flex_holiday_swaps;
CREATE POLICY flex_holiday_swaps_select_scope ON public.flex_holiday_swaps
FOR SELECT TO authenticated
USING (
  employee_id = my_employee_id()
  OR is_admin()
  OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id))
);

DROP POLICY IF EXISTS flex_holiday_swaps_update_scope ON public.flex_holiday_swaps;
CREATE POLICY flex_holiday_swaps_update_scope ON public.flex_holiday_swaps
FOR UPDATE TO authenticated
USING      (is_admin() OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id)))
WITH CHECK (is_admin() OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id)));

DROP POLICY IF EXISTS cash_transactions_select_scope ON public.cash_transactions;
CREATE POLICY cash_transactions_select_scope ON public.cash_transactions
FOR SELECT TO authenticated
USING (
  employee_id = my_employee_id()
  OR is_admin()
  OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id))
);

DROP POLICY IF EXISTS cash_transactions_update_scope ON public.cash_transactions;
CREATE POLICY cash_transactions_update_scope ON public.cash_transactions
FOR UPDATE TO authenticated
USING      (is_admin() OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id)))
WITH CHECK (is_admin() OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id)));

DROP POLICY IF EXISTS travel_claims_select_scope ON public.travel_claims;
CREATE POLICY travel_claims_select_scope ON public.travel_claims
FOR SELECT TO authenticated
USING (
  employee_id = my_employee_id()
  OR is_admin()
  OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id))
);

DROP POLICY IF EXISTS travel_claims_update_scope ON public.travel_claims;
CREATE POLICY travel_claims_update_scope ON public.travel_claims
FOR UPDATE TO authenticated
USING      (is_admin() OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id)))
WITH CHECK (is_admin() OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id)));

DROP POLICY IF EXISTS travel_requests_select_scope ON public.travel_requests;
CREATE POLICY travel_requests_select_scope ON public.travel_requests
FOR SELECT TO authenticated
USING (
  employee_id = my_employee_id()
  OR is_admin()
  OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id))
);

DROP POLICY IF EXISTS travel_requests_update_scope ON public.travel_requests;
CREATE POLICY travel_requests_update_scope ON public.travel_requests
FOR UPDATE TO authenticated
USING      (is_admin() OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id)))
WITH CHECK (is_admin() OR (get_my_role() = 'manager' AND shares_group_member_emp(employee_id)));

-- -- employees picker: manager reads same-group members' employee rows ---------
-- So getEmployees() (time-page employee picker) lists the members a manager can
-- actually view. Additive — own/admin/existing policies remain. This exposes a
-- same-group member's employee record (name/contact/DOB/gender) to their
-- manager, which the manage-members model implies. Compensation stays separate
-- (employee_compensation has its own admin-only RLS).

DROP POLICY IF EXISTS employees_select_mgr_group_member ON public.employees;
CREATE POLICY employees_select_mgr_group_member ON public.employees
FOR SELECT TO authenticated
USING (
  get_my_role() = 'manager' AND shares_group_member_emp(id)
);

NOTIFY pgrst, 'reload schema';

-- -- VERIFY (run individually) ------------------------------------------------
-- (a) Helpers present + search_path pinned (expect 2 rows):
--   SELECT proname, proconfig FROM pg_proc
--   WHERE proname IN ('shares_group_member','shares_group_member_emp');
--
-- (b) Policies recreated (expect the *_scope rows + employees_select_mgr_group_member):
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE policyname LIKE '%_scope' OR policyname='employees_select_mgr_group_member'
--   ORDER BY tablename, cmd;
--
-- (c) Behavioral (real tokens):
--   * MANAGER: GET /rest/v1/time_entries and /leave_requests return own rows +
--     same-group MEMBERS' rows; a same-group ADMIN's or MANAGER's rows do NOT
--     appear. The time-page employee picker lists same-group members by name.
--     Approving a same-group member's pending leave succeeds; a non-member's
--     (or other-group member's) does not.
--   * MEMBER: only own rows; approve is impossible (no update policy grants it).
--   * ADMIN/OWNER: all rows, all groups (unchanged).
--   * CLIENT: still zero (client_block_* RESTRICTIVE unaffected).
