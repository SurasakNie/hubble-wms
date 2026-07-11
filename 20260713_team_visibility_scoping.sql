-- 20260713_team_visibility_scoping.sql
-- Scope profiles SELECT visibility per role (Team page + raw-API boundary).
--
-- WHY: the Team page (and the profiles table generally) let every logged-in
-- staff user read EVERY profile. Users must instead see a role-scoped subset:
--   member       -> self + anyone sharing >=1 group (staff only, no clients)
--   manager      -> self + same-group staff + direct reports + client accounts
--                   on the manager's assigned projects
--   owner/admin  -> everyone (unchanged max access)
--   client       -> own row only (UNCHANGED - clients stay portal-only; the
--                   "same-company clients" idea was dropped because clients get
--                   no Team page and it would widen the audited CLIENT-01
--                   isolation / break the f01 client probe's "profiles = 1 row")
--
-- Enforced in RLS (not just UI) so a raw GET /rest/v1/profiles is also scoped.
--
-- CONVENTIONS (per prior migrations):
--   * NO BEGIN/COMMIT wrapper - the Supabase SQL Editor silently ran only a
--     fragment of wrapped files (R54/R55). Each statement autocommits.
--   * search_path pinned on every function (R59 / 20260709 hardening).
--   * DROP POLICY + CREATE POLICY, never ALTER POLICY by name (20260708: ALTER
--     silently no-ops if the prod policy name differs).
--   * New SECURITY DEFINER helpers so they bypass RLS on the tables they read
--     and avoid the circular-RLS trap (20260708) - mirrors auth_is_client().
--
-- After running: execute the VERIFY block at the footer, then
--   NOTIFY pgrst, 'reload schema';

-- -- Helpers ---------------------------------------------------------------

-- Caller and target share at least one group.
CREATE OR REPLACE FUNCTION public.shares_group(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_members a
    JOIN group_members b ON b.group_id = a.group_id
    WHERE a.user_id = auth.uid()
      AND b.user_id = p_user_id
  );
$$;

-- Target is a direct report of the caller (employees.direct_manager_id chain),
-- mapped through employees.user_id on both sides. Distinct from is_manager_of(),
-- which keys on employees.id; this one keys on profiles/auth user ids so it can
-- be used inside the profiles policy.
CREATE OR REPLACE FUNCTION public.is_my_report(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM employees mgr
    JOIN employees rep ON rep.direct_manager_id = mgr.id
    WHERE mgr.user_id = auth.uid()
      AND rep.user_id = p_user_id
  );
$$;

-- Target is a client-role account whose company (profiles.client_id) is the
-- client of at least one project the caller (a manager) is assigned to.
CREATE OR REPLACE FUNCTION public.is_client_on_my_projects(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles cli
    JOIN projects p            ON p.client_id = cli.client_id
    JOIN project_assignments pa ON pa.project_id = p.id
    WHERE cli.id = p_user_id
      AND cli.role = 'client'
      AND pa.manager_id = auth.uid()
  );
$$;

-- Lock down EXECUTE (0028 hardening convention): no anon, authenticated + service_role only.
REVOKE ALL ON FUNCTION public.shares_group(uuid)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_my_report(uuid)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_client_on_my_projects(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shares_group(uuid)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_my_report(uuid)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_client_on_my_projects(uuid) TO authenticated, service_role;

-- -- Replace the blanket profiles SELECT policy ------------------------------
-- OLD profiles_select (live): authenticated read ALL profiles, except a client
-- reads only its own row:
--   (auth.uid() IS NOT NULL) AND (COALESCE(get_my_role(),'') <> 'client' OR id = auth.uid())
-- NEW: role-scoped. Self clause preserves the client own-row behavior exactly.

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
FOR SELECT TO public
USING (
  auth.uid() IS NOT NULL
  AND (
    id = auth.uid()                                   -- self (all roles; keeps client own-row)
    OR is_admin()                                     -- owner/admin: everyone
    OR (
      get_my_role() = 'manager' AND (
        (role <> 'client' AND (shares_group(id) OR is_my_report(id)))  -- same-group staff + direct reports
        OR is_client_on_my_projects(id)                                -- clients on the manager's projects
      )
    )
    OR (
      get_my_role() = 'member'
      AND role <> 'client'
      AND shares_group(id)                            -- member: same-group staff only
    )
  )
);

-- profiles_update_admin / profiles_update_own are unchanged (UPDATE policies).

NOTIFY pgrst, 'reload schema';

-- -- VERIFY (run individually; Supabase Studio only shows the last grid) ------
-- Each should behave as noted. Run while impersonating via the REST API with a
-- role token, or eyeball the policy is present:
--
-- (a) Policy present + shape:
--   SELECT policyname, cmd, qual FROM pg_policies
--   WHERE tablename='profiles' AND policyname='profiles_select';
--
-- (b) Helpers present + search_path pinned (expect 3 rows, all with search_path):
--   SELECT proname, proconfig FROM pg_proc
--   WHERE proname IN ('shares_group','is_my_report','is_client_on_my_projects');
--
-- (c) Behavioral (run the f01 client probe + the new member/manager probe
--     checks from a real token): a member gets only same-group rows; a manager
--     gets same-group + reports + project-clients; admin gets all; a client
--     still gets exactly 1 row (own). See f01_prod_client_probe.* + anon_probe.ps1.
