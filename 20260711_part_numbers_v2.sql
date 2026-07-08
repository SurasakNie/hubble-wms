-- ============================================================
-- 20260711_part_numbers_v2.sql — Part Number Generator v2
-- Run in Supabase Studio → SQL Editor. Idempotent — safe to re-run.
--
-- ⚠️ NO BEGIN/COMMIT wrapper on purpose: the v1 wrapped file ran only a
-- fragment in the Supabase SQL Editor ("Success, no rows"). Each statement
-- autocommits; a partial run is safe to re-run because everything is guarded.
--
-- Aligns the implementation to PART_NUMBERING_SPEC.md:
--   • Format CC-PPP-AA-BBB → CCC-PPP-CAT-SEQ. CAT is a 3-LETTER governed code
--     (11 seeds) instead of a 2-digit number.
--   • Part numbers now hang off the REAL projects/clients tables: CCC = a new
--     `code` on clients, PPP = a new `code` on projects. The separate
--     pn_projects registry is retired.
--   • 5 admin/manager-managed attribute lists (Material, Finish, Vendor,
--     Fabrication Process, Color) → pn_attributes; item columns reference them.
--   • Each revision snapshots the item's descriptive fields (jsonb) so the UI
--     can diff two revisions.
--
-- Adoption is zero (test data only), so v1 items are wiped and reminted here —
-- part numbers are immutable, so this is impossible to do later (spec §6.2).
-- ============================================================

-- ── 1. Codes on the real core tables ─────────────────────────
ALTER TABLE clients  ADD COLUMN IF NOT EXISTS code text;   -- CCC (per client)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS code text;   -- PPP (per project)

ALTER TABLE clients  DROP CONSTRAINT IF EXISTS clients_code_chk;
ALTER TABLE clients  ADD  CONSTRAINT clients_code_chk  CHECK (code IS NULL OR code ~ '^[A-Z0-9]{2,4}$');
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_code_chk;
ALTER TABLE projects ADD  CONSTRAINT projects_code_chk CHECK (code IS NULL OR code ~ '^[A-Z0-9]{2,5}$');

CREATE UNIQUE INDEX IF NOT EXISTS clients_code_uq  ON clients  (upper(code))             WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projects_code_uq ON projects (client_id, upper(code))  WHERE code IS NOT NULL;

-- ── 2. Retire v1 registry + item tables + old RPCs (wipe test data) ──
DROP FUNCTION IF EXISTS pn_create_item(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS pn_bump_revision(uuid, text, text);
DROP TABLE IF EXISTS pn_item_revisions CASCADE;
DROP TABLE IF EXISTS pn_items          CASCADE;
DROP TABLE IF EXISTS pn_counters       CASCADE;
DROP TABLE IF EXISTS pn_projects       CASCADE;

-- ── 3. Category codes (pn_type_codes kept, converted to 3-letter) ────
DELETE FROM pn_type_codes WHERE code ~ '^[0-9]{2}$';   -- drop v1 numeric seeds
ALTER TABLE pn_type_codes DROP CONSTRAINT IF EXISTS pn_type_codes_code_check;
ALTER TABLE pn_type_codes DROP CONSTRAINT IF EXISTS pn_type_codes_code_chk;
ALTER TABLE pn_type_codes ADD  CONSTRAINT pn_type_codes_code_chk CHECK (code ~ '^[A-Z]{3}$');
ALTER TABLE pn_type_codes ADD COLUMN IF NOT EXISTS covers text;

-- 11 governed codes in decision-ladder order (spec §2). ON CONFLICT DO NOTHING
-- preserves admin edits on re-run.
INSERT INTO pn_type_codes (code, description, covers, sort_order) VALUES
  ('PCB', 'Printed circuit board',      'Bare boards only.', 1),
  ('PCA', 'Printed circuit assembly',   'Populated/assembled boards (PCBA). Has a BOM (bare PCB + components).', 2),
  ('ASM', 'Assembly',                   'Mechanical / machine-level items with a BOM. Assembly drawings carry the assembly''s own number.', 3),
  ('CBL', 'Cable / harness',            'Cables, wiring harnesses, looms — made or bought.', 4),
  ('ELC', 'Electrical component',       'Electrical/electronic items other than PCA/PCB/cable: connectors, sensors, motors, drives, PSUs, switches.', 5),
  ('PRT', 'Manufactured part',          'Single piece made to our drawing: machined, fabricated, sheet-metal, 3D-printed, molded.', 6),
  ('OTS', 'Off-the-shelf item',         'Bought-to-catalog items not covered by a more specific code. Includes fasteners & hardware, pneumatic/hydraulic components, and raw material stock.', 7),
  ('FMW', 'Firmware / software',        'Firmware images, software releases, PLC programs, configuration sets.', 8),
  ('DOC', 'Document',                   'Standalone documents only — specs, test procedures/reports, manuals, work instructions, certificates, label artwork. A document that defines exactly one part uses that part''s number instead.', 9),
  ('PKG', 'Packaging',                  'Boxes, crates, foam inserts, protective packaging designed for a product.', 10),
  ('TOL', 'Tooling',                    'Jigs, fixtures, molds, gauges, test equipment — makes/verifies product but doesn''t ship in it.', 11)
ON CONFLICT (code) DO NOTHING;

-- ── 4. Attribute lists (single table, admin/manager-managed) ─────────
CREATE TABLE IF NOT EXISTS pn_attributes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('material','finish','vendor','fab_process','color')),
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS pn_attributes_kind_name_uq ON pn_attributes (kind, upper(name));
COMMENT ON TABLE pn_attributes IS 'Managed lookup lists (material/finish/vendor/fab_process/color) for part-number items.';

-- ── 5. Per-project customer-PN config (replaces the old pn_projects fields) ──
CREATE TABLE IF NOT EXISTS pn_project_config (
  project_id           uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  customer_pn_mode     text NOT NULL DEFAULT 'none' CHECK (customer_pn_mode IN ('none','template','manual')),
  customer_pn_template text,
  created_by           uuid REFERENCES profiles(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (customer_pn_mode <> 'template' OR customer_pn_template IS NOT NULL)
);
COMMENT ON TABLE pn_project_config IS 'Per-project customer part-number mode/template. Projects with no row default to none.';

-- ── 6. Item / counter / revision tables (pointed at real projects) ──
CREATE TABLE IF NOT EXISTS pn_counters (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope      text NOT NULL,   -- a category code or 'customer'
  last_seq   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, scope)
);

CREATE TABLE IF NOT EXISTS pn_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,   -- numbers must never vanish
  cat_code       text NOT NULL REFERENCES pn_type_codes(code),
  seq            int  NOT NULL,
  part_number    text NOT NULL UNIQUE,        -- rendered CCC-PPP-CAT-SEQ, immutable
  customer_pn    text,
  name           text NOT NULL,
  description    text,
  material_id    uuid REFERENCES pn_attributes(id),
  finish_id      uuid REFERENCES pn_attributes(id),
  vendor_id      uuid REFERENCES pn_attributes(id),
  fab_process_id uuid REFERENCES pn_attributes(id),
  color_id       uuid REFERENCES pn_attributes(id),
  revision       text NOT NULL DEFAULT 'A',
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','obsolete')),
  created_by     uuid REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, cat_code, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS pn_items_customer_pn_uq ON pn_items (project_id, upper(customer_pn)) WHERE customer_pn IS NOT NULL;
CREATE INDEX IF NOT EXISTS pn_items_project_idx ON pn_items (project_id);

CREATE TABLE IF NOT EXISTS pn_item_revisions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES pn_items(id) ON DELETE CASCADE,
  revision   text NOT NULL,
  note       text,
  snapshot   jsonb,     -- descriptive fields captured at this revision (for Compare)
  changed_by uuid REFERENCES profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pn_item_revisions_item_idx ON pn_item_revisions (item_id);

-- ── 7. Immutability guard ────────────────────────────────────
CREATE OR REPLACE FUNCTION pn_items_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, extensions, pg_temp AS $$
BEGIN
  IF NEW.project_id  IS DISTINCT FROM OLD.project_id
  OR NEW.cat_code    IS DISTINCT FROM OLD.cat_code
  OR NEW.seq         IS DISTINCT FROM OLD.seq
  OR NEW.part_number IS DISTINCT FROM OLD.part_number THEN
    RAISE EXCEPTION 'pn_items: part number identity (project/category/seq/part_number) is immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS pn_items_guard_update_trg ON pn_items;
CREATE TRIGGER pn_items_guard_update_trg BEFORE UPDATE ON pn_items
  FOR EACH ROW EXECUTE FUNCTION pn_items_guard_update();

-- ── 8. Helpers + RPCs ────────────────────────────────────────
CREATE OR REPLACE FUNCTION pn_render_template(
  p_tpl text, p_cc text, p_ppp text, p_aa text, p_seq int
) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v text := coalesce(p_tpl, ''); m text;
BEGIN
  v := replace(v, '{CC}',  coalesce(p_cc, ''));
  v := replace(v, '{PPP}', coalesce(p_ppp, ''));
  v := replace(v, '{AA}',  coalesce(p_aa, ''));   -- emits the 3-letter CAT code
  LOOP
    m := substring(v FROM '\{SEQ:([0-9]+)\}');
    EXIT WHEN m IS NULL;
    v := replace(v, '{SEQ:' || m || '}', lpad(p_seq::text, greatest(m::int, length(p_seq::text)), '0'));
  END LOOP;
  v := replace(v, '{SEQ}', p_seq::text);
  RETURN v;
END; $$;

-- Resolve an item's descriptive fields into a jsonb snapshot (for revision Compare).
CREATE OR REPLACE FUNCTION pn_item_snapshot(p_item_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'name',        i.name,
    'description', i.description,
    'revision',    i.revision,
    'status',      i.status,
    'customer_pn', i.customer_pn,
    'category',    i.cat_code || ' — ' || coalesce(tc.description, ''),
    'material',    m.name,
    'finish',      f.name,
    'vendor',      v.name,
    'fab_process', fp.name,
    'color',       c.name
  )
  FROM pn_items i
  LEFT JOIN pn_type_codes tc ON tc.code = i.cat_code
  LEFT JOIN pn_attributes m  ON m.id  = i.material_id
  LEFT JOIN pn_attributes f  ON f.id  = i.finish_id
  LEFT JOIN pn_attributes v  ON v.id  = i.vendor_id
  LEFT JOIN pn_attributes fp ON fp.id = i.fab_process_id
  LEFT JOIN pn_attributes c  ON c.id  = i.color_id
  WHERE i.id = p_item_id
$$;

-- Mint a part number + item atomically (only insert path into pn_items).
CREATE OR REPLACE FUNCTION pn_create_item(
  p_project_id     uuid,
  p_cat_code       text,
  p_name           text,
  p_description    text DEFAULT NULL,
  p_customer_pn    text DEFAULT NULL,
  p_material_id    uuid DEFAULT NULL,
  p_finish_id      uuid DEFAULT NULL,
  p_vendor_id      uuid DEFAULT NULL,
  p_fab_process_id uuid DEFAULT NULL,
  p_color_id       uuid DEFAULT NULL
) RETURNS pn_items LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := get_my_role();
  v_cc text; v_ppp text; v_mode text; v_tpl text;
  v_seq int; v_cseq int; v_pn text; v_cpn text; v_item pn_items%ROWTYPE;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('owner','admin','manager','member') THEN
    RAISE EXCEPTION 'pn_create_item: not authorised (role %)', v_role;
  END IF;

  SELECT p.code, cl.code INTO v_ppp, v_cc
    FROM projects p LEFT JOIN clients cl ON cl.id = p.client_id
   WHERE p.id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pn_create_item: project not found';
  END IF;
  IF v_cc IS NULL THEN
    RAISE EXCEPTION 'pn_create_item: the project''s client has no company code — set it on the Clients page first';
  END IF;
  IF v_ppp IS NULL THEN
    RAISE EXCEPTION 'pn_create_item: this project has no project code — set it on the Projects page first';
  END IF;
  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'pn_create_item: item name is required';
  END IF;
  PERFORM 1 FROM pn_type_codes WHERE code = p_cat_code AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pn_create_item: unknown or inactive category code %', p_cat_code;
  END IF;

  INSERT INTO pn_counters (project_id, scope, last_seq) VALUES (p_project_id, p_cat_code, 1)
  ON CONFLICT (project_id, scope) DO UPDATE SET last_seq = pn_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  v_pn := format('%s-%s-%s-%s', v_cc, v_ppp, p_cat_code,
                 lpad(v_seq::text, greatest(3, length(v_seq::text)), '0'));

  SELECT customer_pn_mode, customer_pn_template INTO v_mode, v_tpl
    FROM pn_project_config WHERE project_id = p_project_id;
  v_mode := coalesce(v_mode, 'none');
  IF v_mode = 'template' THEN
    INSERT INTO pn_counters (project_id, scope, last_seq) VALUES (p_project_id, 'customer', 1)
    ON CONFLICT (project_id, scope) DO UPDATE SET last_seq = pn_counters.last_seq + 1
    RETURNING last_seq INTO v_cseq;
    v_cpn := pn_render_template(v_tpl, v_cc, v_ppp, p_cat_code, v_cseq);
  ELSIF v_mode = 'manual' THEN
    v_cpn := nullif(trim(coalesce(p_customer_pn, '')), '');
  END IF;

  BEGIN
    INSERT INTO pn_items (project_id, cat_code, seq, part_number, customer_pn, name, description,
                          material_id, finish_id, vendor_id, fab_process_id, color_id, created_by)
    VALUES (p_project_id, p_cat_code, v_seq, v_pn, v_cpn, trim(p_name),
            nullif(trim(coalesce(p_description, '')), ''),
            p_material_id, p_finish_id, p_vendor_id, p_fab_process_id, p_color_id, auth.uid())
    RETURNING * INTO v_item;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'pn_create_item: customer part number "%" already exists in this project', v_cpn;
  END;

  INSERT INTO pn_item_revisions (item_id, revision, note, snapshot, changed_by)
  VALUES (v_item.id, v_item.revision, 'Initial release', pn_item_snapshot(v_item.id), auth.uid());
  RETURN v_item;
END; $$;

CREATE OR REPLACE FUNCTION pn_bump_revision(
  p_item_id uuid, p_new_revision text, p_note text DEFAULT NULL
) RETURNS pn_items LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text := get_my_role(); v_item pn_items%ROWTYPE; v_rev text := upper(trim(coalesce(p_new_revision, '')));
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('owner','admin','manager','member') THEN
    RAISE EXCEPTION 'pn_bump_revision: not authorised (role %)', v_role;
  END IF;
  SELECT * INTO v_item FROM pn_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pn_bump_revision: item not found'; END IF;
  IF v_rev = '' THEN RAISE EXCEPTION 'pn_bump_revision: new revision is required'; END IF;
  IF v_rev = upper(v_item.revision) THEN RAISE EXCEPTION 'pn_bump_revision: item is already at revision %', v_rev; END IF;

  UPDATE pn_items SET revision = v_rev WHERE id = p_item_id RETURNING * INTO v_item;
  INSERT INTO pn_item_revisions (item_id, revision, note, snapshot, changed_by)
  VALUES (p_item_id, v_rev, nullif(trim(coalesce(p_note, '')), ''), pn_item_snapshot(p_item_id), auth.uid());
  RETURN v_item;
END; $$;

-- ── 9. RLS ───────────────────────────────────────────────────
ALTER TABLE pn_attributes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pn_project_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE pn_counters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pn_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pn_item_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pn_type_codes     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text; pol text;
  tbl text[] := ARRAY['pn_attributes','pn_project_config','pn_counters','pn_items','pn_item_revisions','pn_type_codes'];
BEGIN
  FOREACH t IN ARRAY tbl LOOP
    pol := 'client_block_' || t;
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, t);
    EXECUTE format('CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT auth_is_client())', pol, t);
  END LOOP;
END $$;

-- Read-all-internal + admin/manager-write lists
DROP POLICY IF EXISTS pn_attributes_select ON pn_attributes;
CREATE POLICY pn_attributes_select ON pn_attributes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pn_attributes_write ON pn_attributes;
CREATE POLICY pn_attributes_write ON pn_attributes FOR ALL TO authenticated
  USING (get_my_role() IN ('owner','admin','manager')) WITH CHECK (get_my_role() IN ('owner','admin','manager'));

DROP POLICY IF EXISTS pn_type_codes_select ON pn_type_codes;
CREATE POLICY pn_type_codes_select ON pn_type_codes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pn_type_codes_write ON pn_type_codes;
CREATE POLICY pn_type_codes_write ON pn_type_codes FOR ALL TO authenticated
  USING (get_my_role() IN ('owner','admin','manager')) WITH CHECK (get_my_role() IN ('owner','admin','manager'));

DROP POLICY IF EXISTS pn_project_config_select ON pn_project_config;
CREATE POLICY pn_project_config_select ON pn_project_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pn_project_config_write ON pn_project_config;
CREATE POLICY pn_project_config_write ON pn_project_config FOR ALL TO authenticated
  USING (get_my_role() IN ('owner','admin','manager')) WITH CHECK (get_my_role() IN ('owner','admin','manager'));

-- pn_items: SELECT+UPDATE all internal, DELETE owner/admin, NO INSERT (RPC-only)
DROP POLICY IF EXISTS pn_items_select ON pn_items;
CREATE POLICY pn_items_select ON pn_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pn_items_update ON pn_items;
CREATE POLICY pn_items_update ON pn_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pn_items_delete ON pn_items;
CREATE POLICY pn_items_delete ON pn_items FOR DELETE TO authenticated USING (get_my_role() IN ('owner','admin'));

DROP POLICY IF EXISTS pn_item_revisions_select ON pn_item_revisions;
CREATE POLICY pn_item_revisions_select ON pn_item_revisions FOR SELECT TO authenticated USING (true);

-- pn_counters: RLS enabled, no permissive policies (RPC-only).

-- ── 10. Function hardening ───────────────────────────────────
REVOKE ALL ON FUNCTION pn_create_item(uuid,text,text,text,text,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pn_create_item(uuid,text,text,text,text,uuid,uuid,uuid,uuid,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION pn_bump_revision(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pn_bump_revision(uuid,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION pn_item_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pn_item_snapshot(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION pn_render_template(text,text,text,text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pn_render_template(text,text,text,text,int) TO authenticated, service_role;
REVOKE ALL ON FUNCTION pn_items_guard_update() FROM PUBLIC, anon, authenticated;

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
