# Hubble Engineering — WMS Specification

> **Status:** Active specification — supersedes `WMS-handoff-v1.0.md` and `Additional design system.md` (both archived 2026-06-05)
> **Version:** 2.3 · **Last updated:** 2026-06-11
> **Audience:** Development team + PM
> **Scope:** Full Workforce Management System — 6 modules, auth, roles, risks, open decisions
> **Prepared by:** Lead ME / PM
>
> **Build state (updated 2026-06-15):** ✅ **Live in production.** All modules built & deployed — M2 Leave & Holiday, M3 Employee DB (+ Account Status tab), M4 Expense & Travel, M5 Evaluation, M6 Automated Documentation — plus the login overhaul (ID + password, optional TOTP) and the R25 RLS sweep (R23–R35). Remaining: closeout (Help page, template wording) → real-roster swap (LAST).
> See [PENDING_TASKS.md](PENDING_TASKS.md) for the full ledger.
> Demo roster uses sci-fi employees (privacy, pre-launch). Real roster in memory: `real-employee-roster.md`.
> **⚠️ Standing op note:** after any table migration run `NOTIFY pgrst, 'reload schema';`.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Identity & Authentication](#3-identity--authentication)
4. [Module M1 — Timesheet (Central Hub)](#4-module-m1--timesheet-central-hub)
5. [Module M2 — Leave & Holiday Management](#5-module-m2--leave--holiday-management)
6. [Module M3 — Employee Database](#6-module-m3--employee-database)
7. [Module M4 — Expense & Travel](#7-module-m4--expense--travel)
8. [Module M5 — Employee Evaluation](#8-module-m5--employee-evaluation)
9. [Module M6 — Automated Documentation](#9-module-m6--automated-documentation)
10. [Cross-Module Integration Map](#10-cross-module-integration-map)
11. [Roles & Permissions Matrix](#11-roles--permissions-matrix)
12. [Risk Register](#12-risk-register)
13. [Open Decisions (Pending PM Sign-off)](#13-open-decisions-pending-pm-sign-off)
14. [Appendix A — UI Navigation Map (SHOW MORE)](#14-appendix-a--ui-navigation-map-show-more)
15. [Appendix B — Reference Links](#15-appendix-b--reference-links)

---

## 1. System Overview

**System name:** Workforce Management System (WMS)
**Type:** Integrated HR & Operations platform
**Target users:** Employees, Managers, HR Admins, System Admins

### Core Design Principles

| Principle | Definition |
|---|---|
| Admin-seeded identity | No self-registration. All accounts created by admin only. |
| Timesheet as central hub | Almost every HR activity has a time dimension. Timesheet is the single source of truth for attendance, leave, travel, project hours, and evaluation metrics. |
| Account freeze over deletion | Frozen accounts preserve full audit history. No hard deletes on user records. |
| Auto-fill over manual entry | Approved leave, holidays, and business trips auto-populate the timesheet. No duplicate entry. |
| Document generation from live data | All HR documents pull directly from employee records. No copy-paste. |

---

## 2. Architecture

### 2.1 Module Dependency Diagram

```
                        Employee Database (M3)
                                │
                                │ (master record — feeds all modules)
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
         ▼                      ▼                      ▼
  Leave & Holiday (M2)    Expense & Travel (M4)   Employee Evaluation (M5)
         │                      │                      │
         │ auto-fill             │ auto-fill             │ KPI feed
         └──────────────────────┼──────────────────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │  TIMESHEET (M1)     │  ◄── Central Hub
                     │  Single source of   │
                     │  truth for time,    │
                     │  attendance, cost   │
                     └─────────────────────┘
                                │
                                │ data feed
                                ▼
                    Automated Documentation (M6)
```

### 2.2 Data Flow Summary

| Source | Feeds Into | Via |
|---|---|---|
| Employee DB | All modules | Employee ID (foreign key) |
| Approved Leave | Timesheet | Auto-fill on approval |
| Approved Business Trip | Timesheet | Auto-fill on travel approval |
| Public / Flex Holidays | Timesheet | Calendar sync |
| Timesheet (approved) | Evaluation KPIs | Aggregation query |
| Timesheet (approved) | Auto-Doc reports | Report generation trigger |
| Employee DB + Evaluation | Auto-Doc letters | Merge field population |

---

## 3. Identity & Authentication

> **Build status:** Deferred — implemented last before launch. All modules in Phases 3–7 use the current 5-tier RBAC (`is_admin()`) until this phase lands and a single RLS reconciliation sweep applies the WMS 5-role matrix.

> **⚠️ Implementation decisions (2026-06-12, user-confirmed) — supersede details below where they differ; §3 body kept as original design reference until rewritten at build:**
> - **Username = Employee ID** (`DD-T-NNN-CC`). Login form resolves ID → work email via lookup RPC, then Supabase `signInWithPassword`.
> - **Accounts pre-provisioned with the work email + `employees.user_id` linked at creation** (Edge Function `provision-users`, admin-guarded). §3.1 STEP 1 "link email or Google" is dropped — there is nothing to link. **Public sign-ups disabled** in Supabase Auth.
> - **First login:** forced password change → **optional TOTP 2FA enrollment with a Skip button**. 2FA is user-toggleable in Preferences afterwards (resolves OD-1: optional for all roles).
> - **Password reset: admin-only** — Edge Function `admin-reset-password` (button on Employees page) issues a new random password, shown once. No self-service email resets. (§3.5 freeze/recovery model simplifies accordingly — accounts can no longer become unlinked/frozen by the employee.)
> - **Google Sign-In stays optional:** "Link Google account" button in Preferences (`linkIdentity` from a logged-in session). Work emails are currently a mix of Gmail and business addresses — both supported; only Google-hosted emails benefit from the Google button.
> - Sequencing: daily DB backup pipeline lands first → login overhaul → R25 RLS sweep validates the final model. Full task detail in [PENDING_TASKS.md](PENDING_TASKS.md) go-live checklist.

### 3.1 Account Lifecycle

```
[1] Admin creates account in system
         │
         ▼
[2] System generates: username + temporary password (OTP)
    Rules:
    - Valid for 72 hours
    - Single use — invalidated on first login
    - Auto-generated by password generator: 12+ chars, mixed case, digit, symbol
    - Admin cannot set the password manually
    - Credentials delivered to employee (email or printed)
         │
         ▼
[3] Employee first login with OTP
    → Forced to complete onboarding steps before access granted:

    STEP 1: Link email OR Google account (mandatory)
    STEP 2: Set new password (mandatory unless OAuth primary)
    STEP 3: Complete profile verification (mandatory)
             - Confirm name, contact number, department
             - Upload profile photo (optional)
         │
         ▼
[4] Account status → ACTIVE
    → All modules unlocked per role
```

> **Email naming convention (updated 2026-06-12):** Work emails are a **mix** — some Gmail (`firstname.hubbleeng@gmail.com` format), some business addresses. Both are supported as the auth identity; only Google-hosted addresses can use the optional Google sign-in link.

### 3.2 Authentication Methods

| Method | Status | Notes |
|---|---|---|
| Email + Password | Required (default) | Must be set on first login |
| Google Sign-In (OAuth 2.0) | Optional | Scopes: `openid email profile` only — no Gmail content access |
| Both linked | Supported | Either method can be used to log in |

### 3.3 Two-Factor Authentication (2FA)

| 2FA Method | Support | Notes |
|---|---|---|
| Authenticator App (TOTP) | ✅ Primary — recommended | Google Authenticator or equivalent; no additional cost |
| Email OTP (Gmail) | ✅ Fallback | No additional service cost |
| SMS OTP | ⚠️ Optional | Adds per-message cost — TBD; see [OD-2](#13-open-decisions-pending-pm-sign-off) |

> **Default implementation:** required for Admin roles, optional for all others. See [OD-1](#13-open-decisions-pending-pm-sign-off).

### 3.4 Email Linking Rules

| Scenario | Result |
|---|---|
| Employee links email | Account ACTIVE; password reset enforced |
| Employee links Google (OAuth) | Account ACTIVE; OAuth is primary auth |
| Employee links both | Account ACTIVE; either method valid |
| Employee unlinks one of two linked methods | Account remains ACTIVE |
| Employee unlinks ALL linked methods | **Account FROZEN immediately** |
| OTP expires before first login | Account remains in PENDING state; admin must regenerate |

### 3.5 Account Freeze & Recovery

**Freeze trigger:** All linked email/OAuth methods removed by employee.

**Freeze behavior:**
- Employee cannot log in
- A banner is shown directing the employee to contact admin
- All module access suspended
- All data and records preserved — no deletion
- Admin is notified immediately (system alert)

**Admin recovery flow:**
```
Admin opens user record → sees FROZEN badge
         │
         ▼
Admin clicks "Regenerate Credentials"
         │
         ▼
New OTP generated → delivered via alternate contact (phone / printed)
         │
         ▼
Employee logs in with new OTP → must re-do all first-time onboarding steps
    (re-link email/Google + set password + complete profile verification)
```

### 3.6 Session Management

| Parameter | Value |
|---|---|
| Idle timeout | 30 minutes |
| Absolute session limit | 8 hours |
| Token type | JWT (short-lived access) + refresh token |
| Concurrent sessions | TBD — see [OD-5](#13-open-decisions-pending-pm-sign-off) |

---

## 4. Module M1 — Timesheet (Central Hub)

> Timesheet is the architectural center of the system. It is the single source of truth for employee time across all dimensions: attendance, leave, travel, project work, and overtime.

### 4.1 Daily Entry Fields

| Field | Type | Required |
|---|---|---|
| Date | Date | ✅ |
| Work Location | Enum: Office / Remote / Business Trip | ✅ |
| Clock In | Time | ✅ |
| Clock Out | Time | ✅ |
| Total Hours | Calculated | Auto |
| Overtime Hours | Calculated (above standard hours) | Auto |
| Project Code | Reference → Project | ✅ if applicable |
| Task Code | Reference → Task | Optional |
| Remarks | Text | Optional |
| Status | Enum: Working / Leave / Holiday / Business Trip | Auto / Manual |

### 4.2 Auto-Fill Sources

| Source | Auto-Fill Value | Trigger |
|---|---|---|
| Approved Leave (M2) | Status = Leave type (e.g. Annual Leave) | On leave approval |
| Public Holiday (M2 calendar) | Status = Public Holiday | Calendar sync |
| Approved Flex Holiday (M2) | Status = Flex Holiday | On flex approval |
| Approved Business Trip (M4) | Status = Business Trip | On travel approval |

> No duplicate entry required by employee. Auto-filled rows are locked (read-only to employee).

### 4.3 Project Cost Tracking

| Metric | Calculation |
|---|---|
| Labor cost per project | Hours logged to project × employee rate |
| Engineering hours per project | Sum of hours by department/role |
| Department utilization rate | Billable hours / total available hours × 100% |

> Employee rate is sourced from Employee DB (access-controlled field). Visible to: PM, Finance, HR Admin only.

### 4.4 Submission & Approval Flow

```
Employee logs daily entries (or batch end-of-week)
         │
         ▼
Employee submits weekly timesheet
    → System validates: no empty days, no missing project codes (if required)
         │
         ▼
Manager receives notification
    → Review → Approve / Reject with comment
         │
         ▼
Approved → timesheet LOCKED
    → Feeds: payroll export, project cost report, evaluation KPIs
Rejected → returned to employee with comment; employee can re-edit and resubmit
```

### 4.5 Lock & Edit Rules

| State | Employee | Manager | Admin |
|---|---|---|---|
| Draft | Edit ✅ | View | View |
| Submitted | Read-only | Approve/Reject | Override |
| Approved / Locked | Read-only | Read-only | Unlock only |

### 4.6 Late Submission

- Flag raised after threshold (TBD — see [OD-7](#13-open-decisions-pending-pm-sign-off))
- Late flag visible to manager and HR Admin
- No automatic rejection — manager decides action

---

## 5. Module M2 — Leave & Holiday Management

### 5.1 Leave Types & Entitlements

Source: **Hubble Engineering Leave Policy v1.0 (15 May 2026)** — [Google Doc](https://docs.google.com/document/d/159Rcjy5LYlmpHWLJ0MiodNNkKYb3Qwp1/)

| Leave Type | Entitlement | Approval Required | Supports Doc Attachment | Granularity |
|---|---|---|---|---|
| Annual Leave | **12 days / year** | Manager | No | Full day · Half-day · 1–3 hours |
| Sick Leave | **30 days / year** | Manager | Yes (medical cert required for ≥3 consecutive days) | Full day · Half-day · 1–3 hours |
| Personal Leave | **6 days / year** | Manager | No | Full day · Half-day · 1–3 hours |
| Maternity Leave | **98 days** (paid portion per Thai LPA) | Manager + HR | Yes | Full days only |
| Paternity Leave | ⚠️ **Deactivated (2026-06-06)** — not in Leave Policy v1.0; `is_active = false`. Reactivate when policy confirms. | Manager + HR | Yes | Full days only |
| Court Leave | **Added 2026-06-06** — pools → Personal Leave when own balance exhausted | Manager | No | Full day · Half day |
| Flex Holiday | Public holiday swap (unlimited per year) **or Work-From-Home** (`swap_type` = 'move' / 'wfh') | Manager | No | Full day |
| Unpaid Leave | N/A | Manager + HR | Optional | Full day |

> **Carry-over and encashment rules** for Annual Leave and Personal Leave are **TBD** — marked "at management's discretion" in Leave Policy §4. Until confirmed, the system defaults to 0 carry-over.

> **As-built granularity (Round 2+):** the implemented forms offer **Full day / Half day only** — the "1–3 hour" increment shown above was a design-stage option and is not in the current UI.

### 5.1a Advance Notice Requirements

Per Leave Policy §5.1:

| Request type | Minimum advance notice |
|---|---|
| Leave that extends a public holiday (e.g. days before/after Songkran, New Year) | **2 weeks** |
| All other planned leave (Annual, Personal, Unpaid, Flex Holiday) | **1 week** |
| Sick leave and family emergencies | Exempt — notify as early as possible, same day where practical |

Approval is **first-come-first-served** when two or more requests overlap and coverage is at risk.

### 5.2 Holiday Calendar

- Admin configures public holidays per calendar year
- **Admin deadline:** Holidays for the coming year must be verified and published **before end of November** each year
- **Country-specific holidays** supported — admin assigns country/region per employee or department
- **Department-level rules** supported — certain departments may have different holiday schedules (e.g. site teams vs. office)
- Calendar visible to all employees (read-only)
- Holidays auto-push to employee timesheets on calendar publish

> **Reference samples (current Google Sheets — design reference):**
> [Holiday Calendar view](https://docs.google.com/spreadsheets/d/16H409CqzMXIfiMUWabvN5V6otQ-RZ9u-27x87ytKKXY/edit?gid=1518215283#gid=1518215283) · [Holiday List view](https://docs.google.com/spreadsheets/d/16H409CqzMXIfiMUWabvN5V6otQ-RZ9u-27x87ytKKXY/edit?gid=1836492114#gid=1836492114)

### 5.3 Leave Request Flow (3-Tier)

```
[1] Employee submits leave request:
    - Leave type
    - Start / end date (and time for partial-day: half-day / 1–3 hours)
    - Notes
    - Supporting document upload (required for: Sick, Maternity, Paternity)
         │
         ▼
[2] System checks:
    - Balance available?
    - Date clashes with existing approved leave?
    - Team calendar conflicts? (flags only — does NOT auto-reject)
         │
         ▼
[3] Manager (or above): Approve / Reject / Request change + comment
         │
         ▼
[4] HR final approval (required for: Maternity, Paternity, Unpaid Leave)
    For all other types: manager approval is final
         │
         ▼
[5] On full approval:
    - Leave balance deducted
    - Timesheet auto-filled for approved dates
    - Employee calendar updated
    - Notification sent to employee

[5b] On rejection at any tier:
    - Employee notified with reason
    - Balance unchanged
    - No timesheet entry created
```

### 5.4 Leave Balance & Record

| Feature | Detail |
|---|---|
| Balance display | Employee dashboard — days remaining per type |
| Leave history | Full record visible to employee and manager |
| Manual adjustment | HR Admin only; requires reason field; full audit log |
| Year-end carry-over | Configurable per leave type by admin |
| Negative balance | Annual Leave and Personal Leave are cross-pooled. If one type runs dry, the system auto-deducts from the other with a warning flag. Block only if the combined Annual + Personal pool is exhausted. All other leave types block at zero balance. *(OD-9 resolved 2026-06-07)* |

### 5.5 Flex Holiday Rules

- Employee selects a public holiday to waive
- Employee selects a substitute working day (any **other weekday** — swaps are not limited to adjacent days) to take off instead
- Manager approves / rejects
- Flex days taken from a separate "Flex Holiday" balance (not annual leave)
- Cap on flex swaps per year: **Unlimited** *(OD-3 resolved 2026-06-07)*
- Flex holiday carry-over: **No carry-over across years, with one grace window** — a substitute day earned by waiving a December public holiday may be used in either December or the following January; a substitute day earned by waiving a January public holiday may be used in either January or the preceding December. All other months: substitute day must be taken within the same calendar year. *(OD-4 resolved 2026-06-07)*

> **As-built (Round 3):** the Flex tab has two sub-tabs — **Flex Swap** (`swap_type='move'`: waive a holiday → substitute weekday off; weekday-only validation on the substitute date) and **Work From Home** (`swap_type='wfh'`: standalone, `waived_holiday_id` is null — migration `20260612_flex_wfh_nullable_holiday.sql`).

---

## 6. Module M3 — Employee Database

### 6.1 Employee Record Structure

**Personal**
| Field | Notes |
|---|---|
| Full name | |
| Date of birth | |
| National ID / Passport number | Access-controlled |
| Contact email | Linked to auth layer; current format: `firstname.hubbleeng@gmail.com` |
| Personal phone number | For emergency / alternate contact |
| Personal email | Separate from work email |
| Emergency contact | Name, relationship, phone number |

**Employment**
| Field | Notes |
|---|---|
| Employee ID | System-generated — format: `DD-T-NNN-CC` (8 digits, MOD 97-10 check). See segment rules below. |
| Department | Records the **first hired department**. **Locked (immutable) for full-time employees.** Changeable for part-time and contract. |
| Job title / Position | |
| Direct manager | Reference → Employee |
| Employment type | Full-time / Part-time / Contract |
| Salary grade | Optional |
| Start date | |
| Contract end date | If applicable |
| Probation end date | Triggers evaluation if configured |

> **Employee ID segment rules (`DD-T-NNN-CC`)** *(rule change from base v6 spec, adopted 2026-06-06)*
>
> | Segment | Meaning | Permanent? |
> |---|---|---|
> | `DD` | First hired department (2-digit code: 01–06) | **Yes — locked for full-time (T=1).** Changeable only for part-time / contract. |
> | `T` | Employment type (1=Full-time, 2=Part-time, 3=Contract) | No — updates on type change; `CC` recomputes automatically. |
> | `NNN` | Global hire number (001–999, sequence, never reused) | **Yes — permanent for life, even after resignation.** |
> | `CC` | MOD 97-10 check digit (ISO/IEC 7064) | Derived — auto-recomputed whenever `DD` or `T` changes. |
>
> DB enforcement: a `BEFORE UPDATE` trigger (`enforce_fulltime_dept_lock`) raises an exception if `department_code` is changed for a full-time employee. UI enforcement: the Department field is disabled in the edit modal for full-time employees.

**Compensation** *(HR Admin + Finance access only)*
| Field | Notes |
|---|---|
| Salary / hourly rate | Used for project cost calculations |
| Pay frequency | Monthly / bi-weekly / etc. |
| Bank details | Encrypted |
| Bonus / equity | If applicable |

**Required Documents (uploaded at onboarding)**
| Document | Required | Notes |
|---|---|---|
| Employment contract | ✅ | Generated via Auto-Doc (M6) |
| NDA | If applicable | Upload or generated |
| Copy of national ID card | ✅ | Compliance |
| Copy of academic transcript | ✅ | |
| Passport copy | ✅ | Compliance |
| Visa | If applicable | With expiry date + alert |
| Work permit | If applicable | With expiry date + alert |
| Certificates | Optional | Skills-linked |
| Signed policies | ✅ | Upload confirmation |

**Skills Matrix**
| Category | Examples |
|---|---|
| Engineering skills | Structural, mechanical, civil, etc. |
| Software skills | CAD, FEA, ERP, etc. |
| Certifications | Professional body memberships, safety certs |

> Skills matrix is editable by employee (proposed) and HR Admin. Used for resource planning.
> See [OD-11](#13-open-decisions-pending-pm-sign-off) for the pending decision on employee self-edit.

### 6.2 Document Expiry Alerts

- Visa and Work Permit expiry dates trigger alerts:
  - 90 days before expiry → HR Admin notified
  - 30 days before expiry → HR Admin + Manager notified
  - On expiry → flagged on employee record

### 6.3 Audit Trail

- All field changes logged: changed by, previous value, new value, timestamp
- No hard deletes — records are archived on termination
- Archived records remain searchable by HR Admin

### 6.4 Demo Employee Roster

> **Pre-launch placeholder.** Real employee data will be loaded at go-live. The names below are from the sci-fi reference roster in `employee_id_system_v2.html` (16 characters, mixed gender & nationality, classic–2024 Sci-Fi). Source file: `supabase/seeds/employees_import.sql`. NNNs are continuous 001–016; next hire gets NNN = 017.
>
> ⚠️ **Roster mismatch:** The sci-fi roster spreads employees across all departments. The real Hubble Engineering team is predominantly Mechanical Engineering. Department codes will be corrected when the real roster is loaded at go-live.
>
> ✅ **Done (B-01):** David Bowman (NNN 003, 02-1-003-42) linked to a Google account; Leave & Flex Swap request flow tested end-to-end.
>
> Employee IDs auto-computed by `compute_employee_id` DB trigger (`DD-T-NNN-CC`, MOD 97-10). All verified: `normalize(id) % 97 == 1`.

| NNN | Full Name | Employee ID | Department | Type | Job Title |
|-----|-----------|-------------|------------|------|-----------|
| 001 | James Kirk | 05-1-001-64 | Admin / Back Office | Full-time | CEO / Founder |
| 002 | Samantha Carter | 01-1-002-72 | Electrical Engineering | Full-time | Lead Electrical Engineer |
| 003 | David Bowman | 02-1-003-42 | Mechanical Engineering | Full-time | Mechanical Engineer |
| 004 | Takeshi Kovacs | 03-3-004-26 | Programmer / Software | Contract | Programmer |
| 005 | Leeloo Dallas | 04-2-005-86 | Graphic / Creative Media | Part-time | Graphic Designer |
| 006 | Dana Scully | 05-2-006-56 | Admin / Back Office | Part-time | Admin / Accountant |
| 007 | Ellen Ripley | 06-1-007-19 | Technician / Workshop | Full-time | Workshop Specialist |
| 008 | Rick Deckard | 06-1-008-16 | Technician / Workshop | Full-time | Skilled Technician |
| 009 | Jean-Luc Picard | 05-1-009-40 | Admin / Back Office | Full-time | Operations Manager |
| 010 | Elizabeth Shaw | 01-1-010-48 | Electrical Engineering | Full-time | Electrical Engineer |
| 011 | Hikaru Sulu | 02-1-011-18 | Mechanical Engineering | Full-time | Mechanical Engineer |
| 012 | Motoko Kusanagi | 03-1-012-85 | Programmer / Software | Full-time | Senior Programmer |
| 013 | Paul Atreides | 05-1-013-28 | Admin / Back Office | Full-time | Operations Manager |
| 014 | Evelyn Wang | 03-1-014-79 | Programmer / Software | Full-time | Programmer |
| 015 | Titus Lazaro | 06-1-015-92 | Technician / Workshop | Full-time | Skilled Technician |
| 016 | Rain Carradine | 03-2-016-80 | Programmer / Software | Part-time | Programmer |

---

## 7. Module M4 — Expense & Travel

> **As-built model (2026-06-08, revised from the real HE forms).** M4 is **not** a generic reimbursement tool. It is a **single petty-cash float ledger** (one office pocket) plus a **hybrid travel** module. Money flows **in** (budget top-ups) and **out** (expenses), every line tagged to a **Project/Purpose**. Travel is a **mileage reimbursement** claim (auto-calc) with an optional **trip pre-approval** for larger trips. See [PENDING_TASKS.md](PENDING_TASKS.md) and the build plan for the field-level detail.

### 7.1 Petty-Cash Float & Item Categories

A single office float covers all spend (small team). Each ledger line is **`in`** (top-up) or **`out`** (expense), with an item category and a project. Running balance = Σ in − Σ out.

| Item category | Direction | Notes |
|---|---|---|
| Hubble Engineering Working Budget | in | Funding source — own budget into the pocket |
| Customer Working Budget | in | Funding source — customer-provided budget |
| Engineering Assistant Working Budget | in | Funding source |
| Engineering Assistant Wage | out | Weekly wage payout (PT/outsource) |
| International wire transfer service charge | out | |
| Municipal Water · Electricity · Office Cleaning · Drink & Beverages | out | Office running costs |
| Import Tax · Shipping & Handling | out | |
| Travel Expense Reimbursement | out | Auto-posted from approved mileage claims |
| Other | both | Admin-configurable |

> Categories and `applies_to` (in/out/both) are admin-managed. "Income" in the legacy form = a **budget top-up** here.

### 7.2 Ledger Flow (top-up & expense)

```
TOP-UP (money in)  — admin/finance only, auto-approved:
    date · amount · source category (e.g. Hubble Engineering Working Budget) · project · note → balance ↑

EXPENSE (money out) — any linked employee submits:
    date · category · project · amount · currency · receipt URL · note
         │  status = pending
         ▼
    Manager approves  → manager_approved
         ▼
    Admin/Finance final approve → approved (counts against the float; balance ↓)
    Rejected → returned with reason; resubmit
```

> **Access:** submitting expenses = all users · recording top-ups, raw All-Transactions view, reports, rate/category management = **admin only**.
> **Reference (current Google — design):** all-user input → [Monthly Transaction Form](https://docs.google.com/forms/d/1oFrS8lwqYV3v6qCAJJ6eqZKcwKi2s-jcKpktjTyX6UQ/edit) · admin-only sheets → [monthly table](https://docs.google.com/spreadsheets/d/1bczN03zkhIytlHbiB9rR6EWPiB9BxHMwHZAuOwKZPrM/edit#gid=886865343), [all collected data](https://docs.google.com/spreadsheets/d/1bczN03zkhIytlHbiB9rR6EWPiB9BxHMwHZAuOwKZPrM/edit#gid=347081740).

### 7.3 Travel (hybrid)

**Mileage claim** (routine — matches the real Travel form; auto-calculated):
```
date · project · route (Start → stops → End) · vehicle type · one-way/round-trip · distance (km)
   → effective_km = distance × (2 if round-trip)
   → reimbursement = effective_km × fuel_rate/km  (+ manual fare for public transport)
   → depreciation  = effective_km × depreciation/km
   → manager → admin/finance approve
   → on approval: auto-posts an 'out' line ("Travel Expense Reimbursement") to the float
```
**Trip request** (larger trips — pre-approval): destination · dates · purpose · project · est. cost · **"what it covers" checklist** (tickets · hotel · daily transport/meals · other) → manager → finance → **travel ref `TR-YYYYMM-NNNN`** issued. *(Timesheet "Business Trip" auto-fill is deferred to the M1 integration phase.)*

> **Per-km rates** are admin-managed (`vehicle_rates`): Thailand has **no statutory mileage rate**, so the company sets its own ฿/km (fuel + depreciation) per vehicle type. Public transport = actual fare + receipt.
> **Reference:** all-user input → [Travel Expense Claim Form](https://docs.google.com/forms/d/1JMihcm-Iy-wJmQjZ7it_rO6-y-CnB1854Fw32MmLwrY/edit) · admin-only → [travel data sheet](https://docs.google.com/spreadsheets/d/16acFtWXRrvMw31pZgNwIyiaW2J9ihibT_8iEF2_w5nU/edit#gid=1946580825).

### 7.4 Key Rules

| Rule | Detail |
|---|---|
| Project tagging | Every ledger line and travel claim references a Project/Purpose (links to M1 projects) |
| Per-km rates | Admin-managed table; snapshotted onto each claim so historical rows don't shift |
| Mileage auto-post | Approved mileage claim auto-creates a `Travel Expense Reimbursement` 'out' line |
| Receipt | URL field (optional); Supabase Storage upload is a future enhancement |
| Currency conversion | Single currency field; auto-rate lookup deferred |
| Per diem rates | Deferred — see [OD-12](#13-open-decisions-pending-pm-sign-off) |
| Categories / rates | Configurable by Admin in PETTY CASH → Setup |

### 7.5 Payroll & Reporting Schedule (dual cadence)

| Worker type | Pay date | Report / cutoff |
|---|---|---|
| **Full-time** | **16th** monthly | Monthly expense report + petty-cash **top-up request due the 14th** — if the 14th is a weekend/public holiday, complete **before the last workday that week**. Summary sent **~09:30** that morning. |
| **Part-time / Outsource** | **Weekly, every Monday** | **Weekly wage summary** sent **first thing Monday AM** — prior-week logged timesheet hours × rate (`Engineering Assistant Wage (Wk#XX/YYYY)`), disbursed from the float. |

> Reports are segmented by `employees.employment_type_code` (1=FT · 2=PT · 3=Contract). The weekly wage figure reads Timesheet (M1) hours; per-entry timesheet **approval** is an M1 enhancement. **Automated timed delivery** (09:30 / Monday AM) is a **scheduled job** — folds into the parked daily Google Sheets auto-export integration; the WMS UI provides the summary views + deadline banners.

**Monthly report format (sample):**
```
The total amount of monthly expenses for this period is [AMOUNT] THB.
This includes:
1. Expenses from [START DATE] to [END DATE], detailed in [Sheet link]: [AMOUNT] THB
   Expense breakdown by individual:
     [Employee name]: [AMOUNT] THB
2. [Other line items, e.g. Engineering Assistant Wage (Wk#XX/YYYY), total X hours]: [AMOUNT] THB
[Note: Additional expenses or project budget requirements, if applicable]
```

---

## 8. Module M5 — Employee Evaluation

### 8.1 Evaluation Cycle

| Setting | Value |
|---|---|
| Frequency | Configurable: annual / bi-annual / quarterly |
| Trigger | Admin-initiated or auto-triggered by calendar |
| Probation review | Auto-triggered on probation end date (if configured — see [OD-6](#13-open-decisions-pending-pm-sign-off)) |

### 8.2 Review Structure

| Stage | Actor | Action |
|---|---|---|
| 1. Self-assessment | Employee | Completes own review against KPIs |
| 2. Manager review | Manager | Scores, comments, recommends rating |
| 3. 360 feedback | Peers / cross-functional | Optional; configured per cycle |
| 4. Calibration | HR / Management | Offline alignment; notes captured in system |
| 5. Final rating | HR Admin | Published to employee record |

> **Reference (current self-assessment survey — design reference):**
> [Self-assessment survey form](https://docs.google.com/forms/d/1n2ndzRtq9jgGca_udOcYtyaCzY47d3kwE01FboXS_Rc/edit)

### 8.3 KPI Auto-Generation from Timesheet

> These metrics are calculated automatically from approved timesheet data. No manual KPI entry required.

| KPI | Source | Calculation |
|---|---|---|
| Attendance rate | Timesheet | Working days present / total working days × 100% |
| Overtime hours | Timesheet | Sum of hours above standard daily/weekly threshold |
| Billable hours | Timesheet | Hours logged against billable project codes |
| Project contribution | Timesheet | Hours per project / total hours |
| Utilization rate | Timesheet | Billable hours / total available hours × 100% |
| Timesheet compliance | Timesheet | Timesheets submitted on time / total periods |

> KPIs are read-only inputs to the evaluation form. Manager can supplement with qualitative assessment.

### 8.4 Evaluation → Auto-Doc Trigger

- On evaluation completion, system can auto-trigger document generation (M6):
  - Promotion → Promotion Letter
  - PIP initiated → PIP document
  - Salary adjustment → Salary Adjustment Letter
  - Termination decision → Termination Letter

---

## 9. Module M6 — Automated Documentation

> **As-built v1 note (Round 20):** Until Phase 1 auth/RLS reconciliation introduces HR Admin as a separate role, the current app gates M6 with the existing owner/admin/manager model: admin can manage templates and all generated documents; managers can generate/update documents for direct reports; employees can read their own generated documents.

> **Template-content note:** Current seeded document templates are workflow placeholders. Before full release, all document templates will be reviewed and updated with final Hubble Engineering wording, legal/HR language, formatting, and approval/signature text.

### 9.1 Document Library

| Document | Trigger | Primary Data Source | E-Signature Required |
|---|---|---|---|
| Job Offer Letter | Admin initiates (pre-hire) | Employee DB (draft record) | ✅ Candidate |
| Employment Contract | Offer accepted | Employee DB | ✅ Employee + HR |
| Probation Confirmation Letter | Probation end date | Employee DB | ✅ Employee |
| Promotion Letter | Evaluation outcome | Employee DB + Evaluation | ✅ Employee |
| Salary Adjustment Letter | Evaluation / manual | Employee DB + Evaluation | ✅ Employee + HR |
| Warning Letter | Manual (HR Admin) | Employee DB | ✅ Employee |
| PIP (Performance Improvement Plan) | Evaluation / manual | Employee DB + Evaluation | ✅ Employee + Manager |
| Termination Letter | Manual (HR Admin) | Employee DB | ✅ Employee + HR |
| Leave Balance Statement | On-demand | Leave M2 | ❌ |
| Monthly Timesheet Report | On-demand / period close | Timesheet M1 | ❌ |
| Overtime Summary | On-demand | Timesheet M1 | ❌ |
| Expense Summary | On-demand / period close | Expense M4 | ❌ |

### 9.2 Template Engine

- Admin-managed templates with merge fields
- Merge field syntax: `{{employee.full_name}}`, `{{contract.start_date}}`, `{{evaluation.final_rating}}`
- Required fields validated before generation — system blocks output if fields are empty
- Output formats: PDF (primary), DOCX (optional)
- All generated documents stored in `generated_documents` and linked to the employee record with: document type, generated by, timestamp, version

### 9.3 E-Signature Workflow

```
Document generated → PDF output
         │
         ▼
System sends signing request to required signatories (email link)
         │
         ▼
Each signatory: reviews → signs (or declines with reason)
         │
         ▼
All signatures collected → document finalised
         │
         ▼
Signed document stored in employee record
Notification sent to HR Admin
```

> E-signature provider: TBD (DocuSign, Adobe Sign, or built-in). See [OD-8](#13-open-decisions-pending-pm-sign-off).

### 9.4 Offer Letter → Onboarding Pipeline

```
Admin creates PRE-HIRE record (candidate, not yet employee)
         │
         ▼
M6 generates Job Offer Letter from template
         │
         ▼
Offer sent to candidate (email / portal link)
Candidate: Accept / Decline
         │
         ▼ (on acceptance)
Pre-hire record → ACTIVE employee record
System auto-triggers:
    - Account creation (Auth layer)
    - OTP generation + delivery
    - Onboarding checklist
    - Contract generation (next document in pipeline)
```

> No manual re-entry of candidate data at any stage.

---

## 10. Cross-Module Integration Map

| Event | Module | Auto-Action | Target Module |
|---|---|---|---|
| Leave approved | M2 | Auto-fill timesheet for leave dates | M1 |
| Public holiday published | M2 | Auto-fill all employee timesheets | M1 |
| Business trip approved | M4 | Auto-fill timesheet for travel dates | M1 |
| Timesheet approved | M1 | Feed attendance / hours data | M5 (KPIs) |
| Timesheet approved | M1 | Unlock timesheet report generation | M6 |
| Evaluation completed | M5 | Trigger document generation | M6 |
| Visa / permit near expiry | M3 | Alert HR Admin + Manager | — |
| Probation end date reached | M3 | Create evaluation record (if configured) | M5 |
| Offer accepted | M6 | Create active employee record + auth account | M3 + Auth |
| Account email unlinked | Auth | Freeze account immediately | Auth |
| Account frozen | Auth | Notify admin | Admin alert |

---

## 11. Roles & Permissions Matrix

| Action | Employee | Manager | HR Admin | Finance | System Admin |
|---|---|---|---|---|---|
| View own profile | ✅ | ✅ | ✅ | — | ✅ |
| Edit own contact info | ✅ | ✅ | ✅ | — | ✅ |
| View direct reports | — | ✅ | ✅ | — | ✅ |
| Edit employee record | — | — | ✅ | — | ✅ |
| View compensation data | Own only | — | ✅ | ✅ | ✅ |
| Submit timesheet | ✅ | ✅ | ✅ | — | — |
| Approve timesheet | — | ✅ | ✅ | — | ✅ |
| Unlock timesheet | — | — | ✅ | — | ✅ |
| Submit leave request | ✅ | ✅ | ✅ | — | — |
| Approve leave (tier 1) | — | ✅ | ✅ | — | ✅ |
| Approve leave (tier 2 / HR) | — | — | ✅ | — | ✅ |
| Adjust leave balance | — | — | ✅ | — | ✅ |
| Submit expense claim | ✅ | ✅ | ✅ | — | — |
| Approve expense (tier 1) | — | ✅ | ✅ | — | ✅ |
| Approve expense (tier 2) | — | — | — | ✅ | ✅ |
| Submit travel request | ✅ | ✅ | ✅ | — | — |
| Approve travel | — | ✅ | ✅ | ✅ | ✅ |
| View project cost data | — | ✅ (own team) | ✅ | ✅ | ✅ |
| Generate HR documents | — | — | ✅ | — | ✅ |
| Manage templates | — | — | ✅ | — | ✅ |
| Create user accounts | — | — | — | — | ✅ |
| Freeze / unfreeze accounts | — | — | — | — | ✅ |
| Regenerate credentials | — | — | — | — | ✅ |
| View audit log | — | — | ✅ | — | ✅ |

> **Role model note:** This WMS uses a **5-role matrix** (Employee / Manager / HR Admin / Finance / System Admin). The current TIMESHEET app uses a different **5-tier RBAC** (owner / admin / manager / member / client). These two models must be reconciled in WMS Phase 1 (Auth overhaul). See [`HE_Integrations_and_WMS_Roadmap.md`](HE_Integrations_and_WMS_Roadmap.md) for the phased migration plan.

---

## 12. Risk Register

| ID | Risk | Level | Mitigation |
|---|---|---|---|
| RSK-01 | Account freeze cuts employee off from all modules without warning | RSK-0 | Admin notified immediately on freeze; alternate contact path required before freeze executes; banner shown to frozen employee |
| RSK-02 | OTP expires before employee first login | RSK-1 | 72hr window; admin re-gen flow; expiry events logged |
| RSK-03 | Gmail OAuth token revoked by Google — silent freeze | RSK-1 | Detect token revocation server-side; notify employee + admin before freeze executes |
| RSK-04 | Leave balance miscalculated due to manual override | RSK-1 | All manual balance changes require reason field + full audit log |
| RSK-05 | Auto-Doc generates document with incomplete employee data | RSK-1 | Required field validation before generation; block output if fields missing |
| RSK-06 | Payroll / cost export includes unapproved timesheet data | RSK-0 | Export queries approved-and-locked timesheets only; hard filter, not optional |
| RSK-07 | Business trip auto-fill overlaps with already-submitted leave | RSK-1 | System checks for date conflicts on travel approval; flag and require resolution before auto-fill |
| RSK-08 | Visa / work permit expiry not caught — legal compliance breach | RSK-1 | Dual-alert system: 90 days + 30 days before expiry; expiry date is mandatory field |
| RSK-09 | KPI data from timesheet used in evaluation before timesheet approved | RSK-1 | Evaluation KPI feed pulls from approved timesheets only; draft timesheets excluded |
| RSK-10 | Scope creep expanding module boundaries without PM gate | RSK-2 | All scope additions require update to this document before implementation begins |

---

## 13. Open Decisions (Pending PM Sign-off)

These items are unresolved and will block detailed design or implementation if not decided.

| ID | Question | Impact | Owner |
|---|---|---|---|
| ~~OD-1~~ | ~~2FA policy: required for all, admin-only, or optional?~~ | ✅ **Resolved (2026-06-12):** Optional for all roles — TOTP offered at first login with a Skip button; user can enable/disable anytime in Preferences (see §3 implementation-decisions note) | PM / Admin |
| OD-2 | SMS OTP: include or exclude? | Auth layer, cost | PM |
| ~~OD-3~~ | ~~Flex holiday cap: max swaps per year?~~ | ✅ **Resolved:** Unlimited | HR Lead |
| ~~OD-4~~ | ~~Flex holiday carry-over: allowed or not?~~ | ✅ **Resolved:** No carry-over; Dec↔Jan grace window (see §5.5) | HR Lead |
| OD-5 | Concurrent sessions: allowed or restricted? | Auth / session management | PM / Dev Lead |
| OD-6 | Probation review: auto-trigger or manual? | Evaluation M5, Employee DB | HR Lead |
| OD-7 | Late timesheet flag threshold: how many days? | Timesheet M1, reporting | PM / HR Lead |
| OD-8 | E-signature provider: DocuSign, Adobe Sign, or built-in? | Auto-Doc M6, cost, legal | PM / Finance |
| ~~OD-9~~ | ~~Negative leave balance: block or allow with flag?~~ | ✅ **Resolved:** Annual + Personal cross-pool with flag; block only if combined pool exhausted (see §5.4) | HR Lead / Finance |
| OD-10 | Payroll integration target: internal, export CSV, or API to third-party? | Timesheet M1, Expense M4 | Finance |
| OD-11 | Skills matrix: employee self-edit allowed or HR-only? | Employee DB M3 | HR Lead |
| OD-12 | Per diem rates: who manages the rate table? | Expense M4 | Finance / HR Admin |

---

## 14. Appendix A — UI Navigation Map (SHOW MORE)

This appendix shows how the WMS modules map to the app navigation. The current TIMESHEET app has the first three sections built; the "SHOW MORE" section contains the WMS expansion pages as they are built.

> **Re-synced 2026-07-10 (R60 cont., plan task A6.3)** against `app.html`'s actual sidebar markup —
> the previous version of this tree predated **Client Portal, Admin Logs, and Part Numbers**
> entirely (all three shipped R39–R55). The stale "Applicants" placeholder line is removed below —
> it was never built and has no route in the app.

```
TIMESHEET App Navigation
│
├── Main Section (✅ built)
│   ├── Time Tracker
│   ├── Timesheet
│   ├── Calendar
│   └── My Portal               → CLIENT-01 ✅ built — client role ONLY (#client-portal)
│       ├── Own company + project summary hours (aggregated, not raw time entries)
│       ├── Expenses & travel table, employee identity masked
│       └── Text export of own data only
│
├── Analyze Section (✅ built)
│   ├── Dashboard
│   └── Reports
│
├── Manage Section (✅ built)
│   ├── Projects
│   ├── Teams
│   ├── Clients
│   └── Tags
│
└── SHOW MORE (WMS expansion — role-filtered)
    ├── Employees                  → Module M3 (Employee DB) ✅ built
    │   ├── Directory (admin) — employee DB: ID system (see employee_id_system_v2.html), manual create, required docs, contacts, link account
    │   └── Account Status (admin) — activation dashboard; provision / reset pw / clear 2FA / deactivate (R34–R35)
    ├── Leave & Holidays           → Module M2 (Leave & Holiday) ✅ built
    │   ├── HOLIDAYS — calendar + list
    │   ├── MY LEAVE — Leave · Flex (Flex Swap / WFH) · My Balance
    │   ├── TEAM LEAVE (admin/mgr) — Team Leave · Team Flex · Approvals · Team Balance
    │   └── POLICY — read-only entitlements doc
    │       (full day / half day; flex = swap with any weekday, or WFH)
    ├── Notifications              → requests.js ✅ built (sidebar label; route is #requests)
    │   └── own leave requests + 3-day cards; admin: deletion / name-change / job-title queues
    ├── Expense & Travel           → Module M4 (Expense & Travel) ✅ built
    │   ├── MY EXPENSES — submit petty-cash expense (out), project-tagged
    │   ├── MY TRAVEL — Mileage Claim (auto-calc) · Trip Request (pre-approval)
    │   ├── APPROVALS (admin/mgr) — expenses · mileage · trips
    │   ├── PETTY CASH (admin) — top-ups · running balance · all-transactions · rate/category setup
    │   └── REPORT (admin) — Monthly (FT, 14th) · Weekly (PT/outsource, Monday)
    ├── Employee Evaluation        → Module M5 (Evaluation) ✅ built
    │   ├── Self-assessment survey
    │   └── Evaluation by team manager
    ├── Automated Documentation    → Module M6 (Auto-Doc) ✅ built & live
    │   ├── MY DOCUMENTS — own issued document cards + Print / Save PDF
    │   ├── TEAM DOCUMENTS — admin/manager team drafts + generated document cards
    │   ├── REQUESTS — submit / cancel document requests (all roles); admin/mgr Fulfill or Reject (R21)
    │   ├── GENERATE — employee picker + template cards + preview + Save Draft
    │   └── TEMPLATES — admin template editor
    ├── Admin Logs                 → ✅ built (R45) — admin ONLY, hidden for everyone else
    │   └── Audit trail of approve/reject/provision/edit actions; entity/actor/date filters; paginates past 20 rows
    ├── Part Numbers                → ✅ built (R54, reworked R55) — member mints, admin/manager governs
    │   ├── Format `CCC-PPP-CAT-SEQ` (company code · project code · 3-letter governed category · sequence)
    │   ├── Category picker (11 governed codes + decision-ladder help); 5 attribute dropdowns (material/finish/vendor/fab_process/color)
    │   ├── Revision bump + history; ⓘ info modal → Compare diffs two revisions
    │   └── Categories / Lists / Customer-PN managers (admin/manager only); client role sees no data
    └── Help                        → ✅ built (R42, refreshed R60) — bilingual (EN/TH) User Guide + Admin Guide
```

> **Login** is a separate entry point (not in the sidebar nav). See §3 for the full admin-seeded login flow specification.

**19 nav-routable pages** in total (verified against `app.html`'s sidebar markup): `#tracker`
`#timesheet` `#calendar` `#client-portal` `#dashboard` `#reports` `#projects` `#team` `#clients`
`#tags` `#employees` `#holidays` `#expenses` `#evaluation` `#documents` `#requests` `#admin-logs`
`#part-numbers` `#help`.

---

## 15. Appendix B — Reference Links

Current Google Forms and Sheets used before the WMS is built. They serve as **design reference** for understanding the existing workflow. All will be replaced by the WMS system.

| Resource | Purpose | Link | Status |
|---|---|---|---|
| Employee data sheet | Current employee tracking | [View](https://docs.google.com/spreadsheets/d/1uuQgwaBpcjMGvQyyEMoDubBMkZEr5v7u0XMcV2oIuz0/edit?gid=735955836#gid=735955836) | ⚠️ Outdated — for structure reference only |
| Holiday Calendar sample | Public holiday calendar format | [View](https://docs.google.com/spreadsheets/d/16H409CqzMXIfiMUWabvN5V6otQ-RZ9u-27x87ytKKXY/edit?gid=1518215283#gid=1518215283) | Reference |
| Holiday List sample | Public holiday list format | [View](https://docs.google.com/spreadsheets/d/16H409CqzMXIfiMUWabvN5V6otQ-RZ9u-27x87ytKKXY/edit?gid=1836492114#gid=1836492114) | Reference |
| Monthly Transaction Form **(current)** | All-user input — petty-cash top-ups + expenses (in/out, project-tagged) | [Form](https://docs.google.com/forms/d/1oFrS8lwqYV3v6qCAJJ6eqZKcwKi2s-jcKpktjTyX6UQ/edit) | 🟢 All users |
| Monthly expense table **(current)** | Admin-only — monthly summary table | [View](https://docs.google.com/spreadsheets/d/1bczN03zkhIytlHbiB9rR6EWPiB9BxHMwHZAuOwKZPrM/edit#gid=886865343) | 🔴 Admin only |
| Monthly — all collected data **(current)** | Admin-only — raw transaction data | [View](https://docs.google.com/spreadsheets/d/1bczN03zkhIytlHbiB9rR6EWPiB9BxHMwHZAuOwKZPrM/edit#gid=347081740) | 🔴 Admin only |
| Travel Expense Claim Form **(current)** | All-user input — mileage reimbursement (route/vehicle → auto-calc) | [Form](https://docs.google.com/forms/d/1JMihcm-Iy-wJmQjZ7it_rO6-y-CnB1854Fw32MmLwrY/edit) | 🟢 All users |
| Travel expense data **(current)** | Admin-only — travel reimbursement tracking | [View](https://docs.google.com/spreadsheets/d/16acFtWXRrvMw31pZgNwIyiaW2J9ihibT_8iEF2_w5nU/edit#gid=1946580825) | 🔴 Admin only |
| Self-assessment survey | Current employee self-evaluation form | [Form](https://docs.google.com/forms/d/1n2ndzRtq9jgGca_udOcYtyaCzY47d3kwE01FboXS_Rc/edit) | Reference |

---

*HE_WMS_Specification.md v2.3 — supersedes `WMS-handoff-v1.0.md` and `Additional design system.md` · Remaining open decisions are listed in §13.*
