-- 20260716b_employee_gender.sql
-- Add a gender field to employees, used to scope maternity-leave eligibility.
--
-- WHY: R63 walkthrough — maternity leave was offered to every employee because
-- there was no attribute to gate it on. The My Leave request-type dropdown now
-- hides "Maternity Leave" unless employees.gender = 'female'
-- (js/pages/holidays-my-leave.js). Admins set gender in the employee modal
-- (Personal tab).
--
-- Nullable on purpose: existing rows stay unset, so maternity is simply hidden
-- for them until an admin fills it in — no backfill, no forced value.
--
-- CONVENTIONS: no BEGIN/COMMIT wrapper; each statement autocommits.
-- After running: NOTIFY pgrst so PostgREST picks up the new column.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS gender text
  CHECK (gender IN ('female','male'));

NOTIFY pgrst, 'reload schema';

-- -- VERIFY -------------------------------------------------------------------
-- Column present + nullable + check constraint:
--   SELECT column_name, is_nullable, data_type
--   FROM information_schema.columns
--   WHERE table_name='employees' AND column_name='gender';
--   -- expect 1 row, is_nullable = YES
--
-- Then in the app: edit an employee, set Gender = Female, save; log in as that
-- employee and confirm "Maternity Leave" now appears in the leave-type dropdown
-- (and does NOT appear for a male/unset employee).
