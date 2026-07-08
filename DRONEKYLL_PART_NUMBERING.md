# DroneKyll Part Numbering System v3.1

**Hubble Engineering Limited** — Mongkok, Kowloon, Hong Kong

Specification Document — Version 3.1 | March 31, 2026
Supersedes: Version 2.0 (March 16, 2026)

> Source of truth: Google Doc (`1hLGSvDpGhY1AMC76wr5_g1ZWHkoLEQbW`). This MD copy
> is kept in-repo for reference — revisit after the roster swap.
> Note: this is a **separate scheme** from the WMS `CCC-PPP-CAT-SEQ` system
> (`PART_NUMBERING_SPEC.md`); DroneKyll numbers are program-scoped and flat.

---

## 1. Purpose

Defines the part numbering system for the DroneKyll program. Replaces the v2.0
system with shorter, cleaner part numbers, a part/assembly type flag, a two-level
revision scheme, and simplified configuration tracking.

The goal remains simplicity. Every part or assembly gets a unique number with a
type flag. Revisions use a two-level Major.Minor scheme. A Google Sheet
configuration matrix tracks which parts go into each build. The part number itself
does not encode where or how the part is used.

## 2. Key Changes from v2.0

- **Shorter part numbers**: `DKL-0-025` instead of `DKL-FVF-RF-01-025`
- **No unit designation** (FVF/PRD) in the part number — configurations track that
- **No section codes** (NO/CA/RF) in the part number
- **Part/assembly type flag**: `-0` (part), `-1` (assembly) or `-HW` (hardware)
  replaces v2.0 type codes (01/00)
- **Two-level major/minor revision scheme**: `Rev 01.000` replaces v2.0 format (1.001)
- **Descriptive name** limited to 15 characters, CamelCase (replaces UPPER CASE names)
- **Configuration Google Sheet** with x/blank matrix and narrative column replaces
  the v2.0 BOM workbook

## 3. Part Number Format

### 3.1 Structure

```
DKL-0-025 NoseConeBody Rev 01.000
```

| Element | Example | Meaning |
|---|---|---|
| Prefix | `DKL` | DroneKyll rocket identifier |
| Type | `0` | `0` = individual part, `1` = assembly, `HW` = hardware |
| Sequential # | `025` | Unique part number (3 digits, assigned sequentially) |
| Name | `NoseConeBody` | Descriptive phrase, max 15 characters |
| Major Rev | `01` | 2-digit major revision (01 through 99) |
| Minor Rev | `000` | 3-digit minor revision (000 through 999) |

### 3.2 Part Number Rules

- The part number (`DKL-0-025`) is **permanent** — it never changes regardless of revisions.
- Type flag: `0` = individual part, `1` = assembly, `HW` = hardware. Always present after prefix.
- Sequential numbers are assigned in order as new parts are created: 001, 002, 003…
- Descriptive names: max 15 characters, CamelCase preferred. Redundant to the
  3-digit part number but human readable.
- The part number does **not** indicate where or how the part is used — that lives
  in the configuration matrix.

### 3.3 Examples

| Part Number | Name | Full Designation |
|---|---|---|
| DKL-0-001 | Collar | DKL-0-001 Collar Rev 01.000 |
| DKL-0-003 | Barrel | DKL-0-003 Barrel Rev 01.000 |
| DKL-0-009 | Canard | DKL-0-009 Canard Rev 02.000 |
| DKL-0-024 | NoseConeTip | DKL-0-024 NoseConeTip Rev 01.002 |
| DKL-0-025 | NoseConeBody | DKL-0-025 NoseConeBody Rev 01.000 |
| DKL-1-030 | NoseAssembly | DKL-1-030 NoseAssembly Rev 01.000 |
| DKL-HW-001 | ShldrScrw3x60 | DKL-HW-001 ShldrScrw3x60 Rev 01.000 |

## 4. Revision Scheme

### 4.1 Format

Two-level scheme: **Major.Minor** — `Rev 01.000`

| Level | Format | When to Increment | Example |
|---|---|---|---|
| Major | 01, 02…99 | Function changes. Changes form, fit, or function significantly. | Adding lenses and camera board to Nose Cone Tip: 01 → 02 |
| Minor | 000, 001…999 | Bumps, slight size changes, geometry tweaks, tolerance changes, print settings. | Widening a slot: 01.000 → 01.001 |

### 4.2 Revision Rules

- Every new part starts at **Rev 01.000**.
- When the major rev increments (01 → 02), **minor resets to 000**.
- Major revisions are for function changes (e.g., adding lenses to the nose section).
- Minor revisions cover geometry tweaks, slight size changes, print settings, and
  surface finish adjustments.
- All revision history is recorded in the configuration Google Sheet narrative column.

### 4.3 Revision Examples

| Revision | What Changed | Why This Level |
|---|---|---|
| Rev 01.000 | Initial release | Starting point |
| Rev 01.001 | Added groove for key guide | Minor geometry change |
| Rev 01.002 | Increased wall thickness 2mm → 2.5mm | Minor tweak |
| Rev 01.003 | Repositioned mounting holes | Minor geometry change |
| Rev 02.000 | Added camera board mount and lens cutouts | Function change to form/fit/function |

## 5. Configuration Matrix

A Google Sheet tracks which parts are used in each build configuration. This
replaces the old FVF/PRD designation and BOM workbook from v2.0 — usage is tracked
centrally in one place, not encoded in the part number.

### 5.1 Spreadsheet Structure

- **Columns** represent builds (Flight Unit Build 1, Flight Unit Build 2, Shepherd
  Production, etc.)
- **Rows** include part numbers on the left with type, name, and current revision
- **Cells** contain an `x` if the part is used in that build, blank if not
- **Far right column** is narrative about that part and revision changes

### 5.2 Configuration Layout (example)

| Part # | Type | Name | Rev | FU B1 | FU B2 | Shepherd | Narrative |
|---|---|---|---|---|---|---|---|
| DKL-0-003 | Part | Barrel | 01.003 | x | x | x | Groove added 01.001; repositioned 01.003 |
| DKL-0-009 | Part | Canard | 02.000 | x | x | x | Shepherd uses 02.000 (new airfoil) |
| DKL-0-024 | Part | NoseConeTip | 02.000 | x | x | x | Shepherd has lens cutouts 02.000 |
| DKL-0-019 | Part | CameraMount | 01.000 |  |  | x | Shepherd Production only |
| DKL-0-025 | Part | NoseConeBody | 01.000 | x | x | x | Shared across all builds |

### 5.3 Workflow

- **New part**: add a row with initial Rev 01.000 and mark which builds use it.
- **Part revised**: update the Rev column and describe the change in the narrative column.
- **New build/configuration**: add a new column. No part numbers need to change.

## 6. STL File Naming

Filename = part number + name + revision + date (YYYYMMDD):

```
DKL-0-025_NoseConeBody_Rev01.000_20260331.stl
```

| Example | Description |
|---|---|
| DKL-0-001_Collar_Rev01.000_20260331.stl | Collar, initial release |
| DKL-0-003_Barrel_Rev01.001_20260331.stl | Barrel, minor revision |
| DKL-0-024_NoseConeTip_Rev02.000_20260331.stl | Nose Cone Tip, major revision |
| DKL-HW-001_ShldrScrw3x60_Rev01.000_20260331.stl | Hardware item |
| DKL-1-030_NoseAssembly_Rev01.000_20260331.stl | Assembly |

## 7. Migration from v2.0

Sequential IDs preserved where possible; type flag added, names shortened,
revision format updated.

| Old (v2.0) | New (v3.1) | Name |
|---|---|---|
| DKL-FVF-01-001 | DKL-0-001 | Collar |
| DKL-FVF-01-002 | DKL-0-002 | CollarNeckDown |
| DKL-FVF-01-003 | DKL-0-003 | Barrel |
| DKL-FVF-01-004 | DKL-0-004 | NoseCone |
| DKL-FVF-01-005 | DKL-0-005 | CompHolder |
| DKL-FVF-01-006 | DKL-0-006 | CtrRingServo |
| DKL-FVF-01-007 | DKL-0-007 | CtrRingMtrStop |
| DKL-FVF-01-008 | DKL-0-008 | CtrRingMtrLock |
| DKL-FVF-01-009 | DKL-0-009 | Canard |
| DKL-FVF-01-010 | DKL-0-010 | TailFin |
| DKL-FVF-01-011 | DKL-0-011 | LockBarServo |
| DKL-FVF-01-012 | DKL-0-012 | CompHldrCover |
| DKL-FVF-01-013 | DKL-0-013 | CanardCore |
| DKL-FVF-01-014 | DKL-0-014 | Linkage |
| DKL-FVF-01-015 | DKL-0-015 | CanardBtmDisc |
| DKL-FVF-01-016 | DKL-0-016 | ServoArm |
| DKL-FVF-01-017 | DKL-0-017 | WtBalHolder |
| DKL-FVF-01-018 | DKL-0-018 | WtBalCover |
| DKL-FVF-01-019 | DKL-0-019 | CameraMount |
| DKL-FVF-01-020 | DKL-0-020 | LensCover |
| DKL-FVF-01-021 | DKL-0-021 | GearSleeve |
| DKL-FVF-01-022 | DKL-0-022 | MainGear |
| DKL-FVF-01-023 | DKL-0-023 | CanardHolder |
| DKL-FVF-01-024 | DKL-0-024 | NoseConeTip |
| DKL-FVF-01-025 | DKL-0-025 | NoseConeBody |
| DKL-FVF-01-026 | DKL-0-026 | Collar |
| DKL-FVF-01-027 | DKL-0-027 | Barrel |

Hardware migration:

| Old (v2.0) | New (v3.1) | Name |
|---|---|---|
| DKL-FVF-HW-001 | DKL-HW-001 | ShldrScrw3x60 |
| DKL-FVF-HW-002 | DKL-HW-002 | CompSprng3x4 |
| DKL-FVF-HW-003 | DKL-HW-003 | FltHdScrw2 |
| DKL-FVF-HW-004 | DKL-HW-004 | HexNutM5 |
| DKL-FVF-HW-005 | DKL-HW-005 | Magnet15x15x10 |

Revision mapping:

| v2.0 Revision | v3.1 Revision | Note |
|---|---|---|
| 1.001 | Rev 01.000 | Initial release |
| 1.002 | Rev 01.001 | v2.0 minor maps to v3.1 minor |
| 1.003 | Rev 01.002 | v2.0 minor maps to v3.1 minor |
| 1.004 | Rev 01.003 | v2.0 minor maps to v3.1 minor |
| 2.001 | Rev 02.000 | v2.0 major maps to v3.1 major |

## 8. Future Programs

The system extends to future product lines by swapping the program prefix:

- **DroneKyll**: `DKL-0-001`, `DKL-1-001`, `DKL-HW-001`, …
- **Phasyr**: `PHY-0-001`, `PHY-1-001`, `PHY-HW-001`, …
- **Launchyr**: `LNY-0-001`, `LNY-1-001`, `LNY-HW-001`, …

Revision scheme, configuration matrix, and file naming conventions remain the same
across all programs.

## 9. Quick Reference

| | |
|---|---|
| Part Number Format | `DKL-0-025` |
| Assembly Format | `DKL-1-030` |
| Full Designation | `DKL-0-025 NoseConeBody Rev 01.000` |
| Initial Revision | Rev 01.000 |
| Major Rev Change | 01 → 02 (resets minor to 000) |
| Minor Rev Change | 01.000 → 01.001 |
| Hardware | `DKL-HW-001` |
| Name Limit | 15 characters max, CamelCase |
| Type Flag | `0` = part, `1` = assembly, `HW` = hardware |
| Phasyr | `PHY-0-001` |
| Launchyr | `LNY-0-001` |
| STL Filename | `DKL-0-025_NoseConeBody_Rev01.000_20260331.stl` |
| Where is usage tracked? | Google Sheet configuration matrix |
| Where are changes logged? | Google Sheet narrative column |

*End of document.*
