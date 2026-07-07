-- ============================================================
-- 20260710_part_numbers.sql — Part Number Generator (PN v1)
-- Run in Supabase Studio → SQL Editor. Idempotent — safe to re-run.
--
-- New module: per-project part-number generation in the house format
-- CC-PPP-AA-BBB (company abbr, project abbr, 2-digit type code, per-
-- project+type increment), with an optional second "customer" part
-- number for projects where the customer imposes their own scheme
-- (template-generated or manual), plus revision history.
--
-- Design invariants:
--   • Counters live in pn_counters (never MAX+1) → a deleted item's
--     number is NEVER reused.
--   • pn_items has NO INSERT policy — the only way to mint a number is
--     the pn_create_item RPC, which increments the counter and inserts
--     the item in one transaction (failed insert rolls the counter back,
--     so no burned numbers).
--   • Generated internal PNs are immutable: a BEFORE UPDATE trigger
--     rejects changes to project_id/type_code/seq/part_number. Editing
--     a project's CC/PPP never retro-changes existing numbers (the
--     rendered string is stored).
--   • uuid PKs on pn_items keep the schema BOM-ready (future parent/
--     child links) without building BOM now.
--
-- RLS: internal roles only; the 'client' role is fully blocked via the
-- RESTRICTIVE client_block_* pattern from 20260708.
-- ============================================================

BEGIN;

-- ── 1. Tables ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pn_projects (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  company_code         text NOT NULL CHECK (company_code ~ '^[A-Z0-9]{2,4}$'),   -- CC
  project_code         text NOT NULL CHECK (project_code ~ '^[A-Z0-9]{2,5}$'),   -- PPP
  customer_pn_mode     text NOT NULL DEFAULT 'none'
                         CHECK (customer_pn_mode IN ('none','template','manual')),
  customer_pn_template text,   -- e.g. 'ACME-{PPP}-{SEQ:4}' — placeholders {CC} {PPP} {AA} {SEQ:n} {SEQ}
  notes                text,
  is_archived          boolean NOT NULL DEFAULT false,
  created_by           uuid REFERENCES profiles(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_code, project_code),
  CHECK (customer_pn_mode <> 'template' OR customer_pn_template IS NOT NULL)
);
COMMENT ON TABLE pn_projects IS 'Part-number project registry (independent of timesheet projects). CC/PPP feed the house format CC-PPP-AA-BBB.';

CREATE TABLE IF NOT EXISTS pn_type_codes (
  code        text PRIMARY KEY CHECK (code ~ '^[0-9]{2}$'),   -- AA
  description text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0
);
COMMENT ON TABLE pn_type_codes IS 'Global AA type-code list for part numbers (editable by admin/manager).';

CREATE TABLE IF NOT EXISTS pn_counters (
  project_id uuid NOT NULL REFERENCES pn_projects(id) ON DELETE CASCADE,
  scope      text NOT NULL,   -- a type code ('00'..'99') or 'customer'
  last_seq   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, scope)
);
COMMENT ON TABLE pn_counters IS 'Monotonic per-(project, type/customer) sequence source. RPC-only — no RLS policies grant access.';

CREATE TABLE IF NOT EXISTS pn_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES pn_projects(id) ON DELETE CASCADE,
  type_code    text NOT NULL REFERENCES pn_type_codes(code),
  seq          int  NOT NULL,
  part_number  text NOT NULL UNIQUE,   -- rendered internal PN, always set, immutable
  customer_pn  text,                   -- optional customer-scheme PN
  name         text NOT NULL,
  description  text,
  revision     text NOT NULL DEFAULT 'A',
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','obsolete')),
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, type_code, seq)
);
COMMENT ON TABLE pn_items IS 'Generated part-number items. INSERT only via pn_create_item RPC.';

CREATE UNIQUE INDEX IF NOT EXISTS pn_items_customer_pn_uq
  ON pn_items (project_id, upper(customer_pn)) WHERE customer_pn IS NOT NULL;
CREATE INDEX IF NOT EXISTS pn_items_project_idx ON pn_items (project_id);

CREATE TABLE IF NOT EXISTS pn_item_revisions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES pn_items(id) ON DELETE CASCADE,
  revision   text NOT NULL,
  note       text,
  changed_by uuid REFERENCES profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE pn_item_revisions IS 'Revision history per part-number item (written by RPCs).';
CREATE INDEX IF NOT EXISTS pn_item_revisions_item_idx ON pn_item_revisions (item_id);

-- ── 2. Seed type codes (edits preserved on re-run) ───────────

INSERT INTO pn_type_codes (code, description, sort_order) VALUES
  ('00', 'Assembly',                      0),
  ('01', 'Part (machined / fabricated)',  1),
  ('02', 'Purchased / COTS',              2),
  ('03', 'Electrical',                    3),
  ('04', 'Pneumatic / Hydraulic',         4),
  ('05', 'Fastener / Hardware',           5),
  ('09', 'Document / Drawing',            9)
ON CONFLICT (code) DO NOTHING;

-- ── 3. Immutability guard + updated_at trigger ───────────────

CREATE OR REPLACE FUNCTION pn_items_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NEW.project_id  IS DISTINCT FROM OLD.project_id
  OR NEW.type_code   IS DISTINCT FROM OLD.type_code
  OR NEW.seq         IS DISTINCT FROM OLD.seq
  OR NEW.part_number IS DISTINCT FROM OLD.part_number THEN
    RAISE EXCEPTION 'pn_items: part number identity (project/type/seq/part_number) is immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pn_items_guard_update_trg ON pn_items;
CREATE TRIGGER pn_items_guard_update_trg
  BEFORE UPDATE ON pn_items
  FOR EACH ROW EXECUTE FUNCTION pn_items_guard_update();

-- ── 4. Template renderer ─────────────────────────────────────
-- Placeholders: {CC} {PPP} {AA} {SEQ:n} (zero-padded to n, grows past
-- n digits instead of truncating) and bare {SEQ} (unpadded).

CREATE OR REPLACE FUNCTION pn_render_template(
  p_tpl text, p_cc text, p_ppp text, p_aa text, p_seq int
) RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := coalesce(p_tpl, '');
  m text;
BEGIN
  v := replace(v, '{CC}',  coalesce(p_cc, ''));
  v := replace(v, '{PPP}', coalesce(p_ppp, ''));
  v := replace(v, '{AA}',  coalesce(p_aa, ''));
  LOOP
    m := substring(v FROM '\{SEQ:([0-9]+)\}');
    EXIT WHEN m IS NULL;
    v := replace(v, '{SEQ:' || m || '}',
                 lpad(p_seq::text, greatest(m::int, length(p_seq::text)), '0'));
  END LOOP;
  v := replace(v, '{SEQ}', p_seq::text);
  RETURN v;
END;
$$;

-- ── 5. RPC: create item (mints the number atomically) ────────

CREATE OR REPLACE FUNCTION pn_create_item(
  p_project_id  uuid,
  p_type_code   text,
  p_name        text,
  p_description text DEFAULT NULL,
  p_customer_pn text DEFAULT NULL   -- used only when project mode = 'manual'
) RETURNS pn_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := get_my_role();
  v_proj pn_projects%ROWTYPE;
  v_seq  int;
  v_cseq int;
  v_pn   text;
  v_cpn  text;
  v_item pn_items%ROWTYPE;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('owner','admin','manager','member') THEN
    RAISE EXCEPTION 'pn_create_item: not authorised (role %)', v_role;
  END IF;

  SELECT * INTO v_proj FROM pn_projects WHERE id = p_project_id AND NOT is_archived;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pn_create_item: project not found or archived';
  END IF;
  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'pn_create_item: item name is required';
  END IF;
  PERFORM 1 FROM pn_type_codes WHERE code = p_type_code AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pn_create_item: unknown or inactive type code %', p_type_code;
  END IF;

  -- Atomic, gap-free counter: the upsert itself row-locks (project, type).
  INSERT INTO pn_counters (project_id, scope, last_seq)
       VALUES (p_project_id, p_type_code, 1)
  ON CONFLICT (project_id, scope)
    DO UPDATE SET last_seq = pn_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  -- lpad() truncates beyond its length arg — greatest() lets seq grow past 999.
  v_pn := format('%s-%s-%s-%s',
                 v_proj.company_code, v_proj.project_code, p_type_code,
                 lpad(v_seq::text, greatest(3, length(v_seq::text)), '0'));

  IF v_proj.customer_pn_mode = 'template' THEN
    INSERT INTO pn_counters (project_id, scope, last_seq)
         VALUES (p_project_id, 'customer', 1)
    ON CONFLICT (project_id, scope)
      DO UPDATE SET last_seq = pn_counters.last_seq + 1
    RETURNING last_seq INTO v_cseq;
    v_cpn := pn_render_template(v_proj.customer_pn_template,
                                v_proj.company_code, v_proj.project_code,
                                p_type_code, v_cseq);
  ELSIF v_proj.customer_pn_mode = 'manual' THEN
    v_cpn := nullif(trim(coalesce(p_customer_pn, '')), '');
  END IF;

  BEGIN
    INSERT INTO pn_items (project_id, type_code, seq, part_number, customer_pn,
                          name, description, created_by)
    VALUES (p_project_id, p_type_code, v_seq, v_pn, v_cpn,
            trim(p_name), nullif(trim(coalesce(p_description, '')), ''), auth.uid())
    RETURNING * INTO v_item;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'pn_create_item: customer part number "%" already exists in this project', v_cpn;
  END;

  INSERT INTO pn_item_revisions (item_id, revision, note, changed_by)
  VALUES (v_item.id, v_item.revision, 'Initial release', auth.uid());

  RETURN v_item;
END;
$$;

-- ── 6. RPC: bump revision (update + history in one transaction) ──

CREATE OR REPLACE FUNCTION pn_bump_revision(
  p_item_id      uuid,
  p_new_revision text,
  p_note         text DEFAULT NULL
) RETURNS pn_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := get_my_role();
  v_item pn_items%ROWTYPE;
  v_rev  text := upper(trim(coalesce(p_new_revision, '')));
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('owner','admin','manager','member') THEN
    RAISE EXCEPTION 'pn_bump_revision: not authorised (role %)', v_role;
  END IF;

  SELECT * INTO v_item FROM pn_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pn_bump_revision: item not found';
  END IF;
  IF v_rev = '' THEN
    RAISE EXCEPTION 'pn_bump_revision: new revision is required';
  END IF;
  IF v_rev = upper(v_item.revision) THEN
    RAISE EXCEPTION 'pn_bump_revision: item is already at revision %', v_rev;
  END IF;

  UPDATE pn_items SET revision = v_rev WHERE id = p_item_id
  RETURNING * INTO v_item;

  INSERT INTO pn_item_revisions (item_id, revision, note, changed_by)
  VALUES (p_item_id, v_rev, nullif(trim(coalesce(p_note, '')), ''), auth.uid());

  RETURN v_item;
END;
$$;

-- ── 7. RLS ───────────────────────────────────────────────────

ALTER TABLE pn_projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pn_type_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pn_counters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pn_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pn_item_revisions ENABLE ROW LEVEL SECURITY;

-- Client role: fully blocked on all 5 tables (RESTRICTIVE, per 20260708).
DO $$
DECLARE
  t   TEXT;
  pol TEXT;
  tbl TEXT[] := ARRAY['pn_projects','pn_type_codes','pn_counters','pn_items','pn_item_revisions'];
BEGIN
  FOREACH t IN ARRAY tbl LOOP
    pol := 'client_block_' || t;
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT auth_is_client())',
      pol, t
    );
  END LOOP;
END $$;

-- pn_projects: read all internal; write admin/manager.
DROP POLICY IF EXISTS pn_projects_select ON pn_projects;
CREATE POLICY pn_projects_select ON pn_projects
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pn_projects_write ON pn_projects;
CREATE POLICY pn_projects_write ON pn_projects
  FOR ALL TO authenticated
  USING (get_my_role() IN ('owner','admin','manager'))
  WITH CHECK (get_my_role() IN ('owner','admin','manager'));

-- pn_type_codes: read all internal; write admin/manager.
DROP POLICY IF EXISTS pn_type_codes_select ON pn_type_codes;
CREATE POLICY pn_type_codes_select ON pn_type_codes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pn_type_codes_write ON pn_type_codes;
CREATE POLICY pn_type_codes_write ON pn_type_codes
  FOR ALL TO authenticated
  USING (get_my_role() IN ('owner','admin','manager'))
  WITH CHECK (get_my_role() IN ('owner','admin','manager'));

-- pn_items: read/update all internal (immutable columns enforced by the
-- guard trigger); delete owner/admin; NO INSERT policy → RPC-only creation.
DROP POLICY IF EXISTS pn_items_select ON pn_items;
CREATE POLICY pn_items_select ON pn_items
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pn_items_update ON pn_items;
CREATE POLICY pn_items_update ON pn_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pn_items_delete ON pn_items;
CREATE POLICY pn_items_delete ON pn_items
  FOR DELETE TO authenticated USING (get_my_role() IN ('owner','admin'));

-- pn_item_revisions: read-only (rows written by the SECURITY DEFINER RPCs).
DROP POLICY IF EXISTS pn_item_revisions_select ON pn_item_revisions;
CREATE POLICY pn_item_revisions_select ON pn_item_revisions
  FOR SELECT TO authenticated USING (true);

-- pn_counters: RLS enabled, NO permissive policies — RPC-only.

-- ── 8. Function hardening (per 20260709 conventions) ─────────

REVOKE ALL ON FUNCTION pn_create_item(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pn_create_item(uuid, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION pn_bump_revision(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pn_bump_revision(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION pn_render_template(text, text, text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pn_render_template(text, text, text, text, int) TO authenticated, service_role;

REVOKE ALL ON FUNCTION pn_items_guard_update() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Reload PostgREST schema cache so the new tables/RPCs are callable immediately.
NOTIFY pgrst, 'reload schema';
