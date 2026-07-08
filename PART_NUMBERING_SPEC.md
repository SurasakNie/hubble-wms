# Part Numbering System v1 — Full Specification (rev A)

> Reference spec for the `#part-numbers` page (`pn_*` tables).
> The part number is an item's **permanent identity**: once minted, no segment ever
> changes. Anything that can change (description, revision, status, sourcing) lives
> in the database, not the number.

---

## 1. Format

```
CCC - PPP - CAT - SEQ
 │     │     │     └── Sequence number
 │     │     └──────── Item category
 │     └────────────── Project / Product
 └──────────────────── Company / Client
```

Example: `HBL-HYD-PCA-001` — Hubble, Hydraulics project, printed circuit assembly #1.

| Segment | Content | Width | Rules |
|---|---|---|---|
| `CCC` | Company/client code | 3 (schema allows 2–4) | A–Z, 0–9. Assigned once per client in the project registry, never changed. |
| `PPP` | Project/product code | 3 (schema allows 2–5) | A–Z, 0–9. Unique per company. Assigned at project creation, never changed. |
| `CAT` | Item category | exactly 3 letters | From the governed list below (§2). Frozen into the number at minting. |
| `SEQ` | Sequence | 3 digits, zero-padded | Counts per **project + category** (`…-PRT-001`, `-002`… independent of `…-ASM-001`). Gap-free, minted atomically, deleted numbers never reused, grows to 4+ digits past 999. |

---

## 2. Category codes (`CAT`) — 11 codes

| Code | Name | Covers (exclusive definition) |
|---|---|---|
| `ASM` | Assembly | Mechanical / machine-level items with a BOM. Assembly drawings carry the assembly's own number. |
| `PCA` | Printed circuit assembly | Populated/assembled boards (PCBA). Has a BOM (bare `PCB` + components). |
| `PCB` | Printed circuit board | **Bare** boards only. |
| `CBL` | Cable / harness | Cables, wiring harnesses, looms — made or bought. |
| `ELC` | Electrical component | Electrical/electronic items **other than** PCA/PCB/cable: connectors, sensors, motors, drives, PSUs, switches. |
| `PRT` | Manufactured part | Single piece **made to our drawing**: machined, fabricated, sheet-metal, 3D-printed, molded. |
| `OTS` | Off-the-shelf item | Bought-to-catalog items not covered by a more specific code. **Includes fasteners & hardware, pneumatic/hydraulic components, and raw material stock.** |
| `FMW` | Firmware / software | Firmware images, software releases, PLC programs, configuration sets. |
| `DOC` | Document | **Standalone documents only** — specs, test procedures/reports, manuals, work instructions, certificates, label artwork. *A document that defines exactly one part uses that part's number instead (§3).* |
| `PKG` | Packaging | Boxes, crates, foam inserts, protective packaging designed for a product. |
| `TOL` | Tooling | Jigs, fixtures, molds, gauges, test equipment — makes/verifies product but doesn't ship in it. |

### Picking a code — decision ladder (first match wins)

1. Bare circuit board? → `PCB`
2. Populated circuit board? → `PCA`
3. Anything else with a BOM? → `ASM`
4. Cable or harness? → `CBL`
5. Electrical/electronic? → `ELC`
6. Made to our drawing? → `PRT`
7. Bought physical item? → `OTS`
8. Code/config? → `FMW` · Standalone document? → `DOC` · Packaging? → `PKG` · Tooling/test gear? → `TOL`

Every item matches exactly one code: a bought connector is `ELC` (step 5 before 7),
a bought cable is `CBL`, a fastener is `OTS`, a populated board is `PCA`.

### Governance

- **Codes are frozen once used** — never renamed or deleted after appearing in a
  minted number; only **deactivated** (no new items; existing numbers stay valid).
- **Descriptions are editable anytime** — the code is the identity, the description
  is the guidance.
- **New codes**: admin/manager adds one only when an item genuinely fails the
  decision ladder. `DOC` can be split later (`DRW`/`SPC`/`RPT`…) if document volume
  ever demands it — existing items keep `DOC`.

---

## 3. Drawings and files: one identity, one number

**The defining drawing of a part carries the part's own number** — the title block
of the drawing for `HBL-CNV-PRT-014` says `HBL-CNV-PRT-014`. No separate `DOC`
number, no cross-reference table. The same applies to assembly drawings (`ASM`/`PCA`
number) and to the digital artifacts around a part: CAD model, STEP, PDF are all
named with the part's number, distinguished by file extension and revision.

Consequences:

- Revising the drawing **is** revising the part: one revision bump, one shared history.
- Tabulated drawings (one drawing, a family of parts) carry the base part's number;
  the table lists variants.
- `DOC` numbers exist only for documents with no single defining part.

---

## 4. What is *not* in the number (deliberately)

- **Revision** — tracked via `pn_bump_revision` + `pn_item_revisions`. Rev A and
  rev C of `…-PRT-014` are the same part number.
- **Make/buy status** — sourcing can change; the number must not lie. `PRT` vs
  `OTS` records how the item was *defined*.
- **Description / material / size** — database attributes, displayed next to the
  number everywhere.

---

## 5. Customer part numbers (per project)

Each project chooses a mode:

- **None** — internal PN only.
- **Template** — auto-generated from `{CC}` `{PPP}` `{AA}` `{SEQ:n}` placeholders
  (`{AA}` emits the 3-letter `CAT` code).
- **Manual** — entered per item, case-insensitively unique per project.

---

## 6. Implementation status / migration required

The currently deployed implementation (migration `20260710_part_numbers.sql`,
applied in prod Studio 2026-07-07) uses **2-digit numeric** category codes
(`00`–`09`, 7 seeds) with `CHECK (code ~ '^[0-9]{2}$')` on `pn_type_codes.code`.
To reach this spec:

1. **Migration** (new `YYYYMMDD_*.sql`): relax the CHECK to `^[A-Z]{3}$`, seed the
   11 codes above with the exclusive descriptions and ladder-order `sort_order`,
   deactivate `00`–`09`.
2. **Minted items**: remint anything already created under numeric codes *now*,
   while adoption is zero — immutability makes this impossible later.
3. **UI**: category picker shows code + name + "covers" text (decision ladder as
   help text); replace "AA" wording with "category code"; surface the §3 drawing
   rule as help text near `DOC`.
4. **Docs**: this spec is the reference; CLAUDE.md baseline updated at session close.
