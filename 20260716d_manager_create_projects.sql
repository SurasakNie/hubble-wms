-- 20260716d_manager_create_projects.sql
-- Let managers create projects (user decision, R63 follow-up).
--
-- WHY: R63 walkthrough — a manager reported "can't create a new project". The
-- CREATE NEW PROJECT button already shows to managers (js/pages/projects.js:52
-- `canCreate = isAdmin() || isManager()`), but the INSERT failed server-side:
-- the projects INSERT policy only permitted admin/owner. The user chose to let
-- managers create projects (widening the earlier "self-assign only" scope for
-- creation specifically — editing/archiving others' projects stays admin-only).
--
-- WHAT: additive PERMISSIVE INSERT policy so a manager (get_my_role()='manager')
-- can INSERT into projects; admin/owner unchanged. SELECT is untouched (managers
-- already read the projects table), so the createProject() RETURNING select
-- works. No UPDATE/DELETE grant — those row actions stay admin-only by design.
--
-- ⚠️ BEFORE RUNNING (base projects RLS was never committed to this repo):
--   1. Dump the existing INSERT policy so the name doesn't collide and you can
--      see what admin currently gets:
--        SELECT policyname, cmd, qual, with_check
--        FROM pg_policies WHERE tablename='projects' ORDER BY cmd, policyname;
--   2. If an INSERT policy already grants managers, this file is a no-op — skip.
--      If the existing admin INSERT policy has a different name, leave it; this
--      adds a SEPARATE permissive policy (multiple PERMISSIVE INSERT policies
--      OR together, so admin access is unaffected).
--
-- CONVENTIONS: no BEGIN/COMMIT wrapper; each statement autocommits;
-- DROP POLICY IF EXISTS + CREATE POLICY (never ALTER POLICY by name).
-- After running: NOTIFY pgrst.

DROP POLICY IF EXISTS projects_insert_manager ON public.projects;
CREATE POLICY projects_insert_manager ON public.projects
FOR INSERT TO authenticated
WITH CHECK (
  is_admin()
  OR get_my_role() = 'manager'
);

NOTIFY pgrst, 'reload schema';

-- -- VERIFY -------------------------------------------------------------------
-- (a) Policy present:
--   SELECT policyname, cmd, with_check FROM pg_policies
--   WHERE tablename='projects' AND policyname='projects_insert_manager';
--
-- (b) Behavioral (real manager token): CREATE NEW PROJECT as a manager now
--   succeeds (was failing). A member (get_my_role()='member') still cannot
--   INSERT (no #projects nav for them anyway). Admin/owner unchanged.
