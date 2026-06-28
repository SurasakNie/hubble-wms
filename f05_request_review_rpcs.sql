-- ============================================================
-- F-05 — Atomic request-review RPCs
-- Run in Supabase Studio → SQL Editor (idempotent: CREATE OR REPLACE).
--
-- Replaces 3 multi-step client-side approval flows (deletion, name-change,
-- job-title) that did 2–3 separate writes from the browser with manual
-- rollback patches. Each RPC below runs all writes in ONE transaction, so a
-- partial failure rolls back automatically — no half-applied approvals.
--
-- All are SECURITY DEFINER with search_path=public and an admin/owner guard,
-- mirroring the existing approve_trip_settlement / get_client_project_summary
-- RPC conventions. After running, the NOTIFY pgrst reloads the API schema.
-- ============================================================

-- ── 1. Deletion request: delete the entity + mark approved ───────────────
create or replace function approve_deletion_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role        text := get_my_role();
  v_entity_type text;
  v_entity_id   uuid;
begin
  if v_role not in ('owner', 'admin') then
    raise exception 'approve_deletion_request: not authorised (role %)', v_role;
  end if;

  select entity_type, entity_id
    into v_entity_type, v_entity_id
    from deletion_requests
   where id = p_request_id and status = 'pending'
   for update;

  if not found then
    raise exception 'approve_deletion_request: request % not found or not pending', p_request_id;
  end if;

  -- Delete the target entity (allowed types only).
  if v_entity_type = 'client' then
    delete from clients  where id = v_entity_id;
  elsif v_entity_type = 'project' then
    delete from projects where id = v_entity_id;
  elsif v_entity_type = 'task' then
    delete from tasks    where id = v_entity_id;
  else
    raise exception 'approve_deletion_request: unknown entity_type %', v_entity_type;
  end if;

  update deletion_requests
     set status = 'approved', reviewed_by = auth.uid(), updated_at = now()
   where id = p_request_id;
end;
$$;

-- ── 2. Name change: update profile + employee record + mark reviewed ─────
create or replace function review_name_change_request(
  p_request_id uuid,
  p_approved   boolean,
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role          text := get_my_role();
  v_requested_name text;
  v_requested_by   uuid;
begin
  if v_role not in ('owner', 'admin') then
    raise exception 'review_name_change_request: not authorised (role %)', v_role;
  end if;

  select requested_name, requested_by
    into v_requested_name, v_requested_by
    from name_change_requests
   where id = p_request_id and status = 'pending'
   for update;

  if not found then
    raise exception 'review_name_change_request: request % not found or not pending', p_request_id;
  end if;

  if p_approved then
    update profiles  set name = v_requested_name           where id = v_requested_by;
    update employees set full_name = v_requested_name      where user_id = v_requested_by;
  end if;

  update name_change_requests
     set status      = case when p_approved then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(),
         review_note = p_note,
         reviewed_at = now()
   where id = p_request_id;
end;
$$;

-- ── 3. Job-title change: update employee + mark approved ─────────────────
create or replace function approve_job_title_change_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role            text := get_my_role();
  v_employee_id     uuid;
  v_requested_title text;
begin
  if v_role not in ('owner', 'admin') then
    raise exception 'approve_job_title_change_request: not authorised (role %)', v_role;
  end if;

  select employee_id, requested_title
    into v_employee_id, v_requested_title
    from job_title_change_requests
   where id = p_request_id and status = 'pending'
   for update;

  if not found then
    raise exception 'approve_job_title_change_request: request % not found or not pending', p_request_id;
  end if;

  update employees
     set job_title = v_requested_title
   where id = v_employee_id;

  update job_title_change_requests
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request_id;
end;
$$;

-- Reload PostgREST schema cache so the new RPCs are callable immediately.
NOTIFY pgrst, 'reload schema';
