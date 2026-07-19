# Phase 4 — UI/UX & CSP Walkthrough Guide (last A4 phase)

> Companion to Phase 4 in `PRE_LAUNCH_AUDIT_PLAN.md`. Phases 1–3 and Phase 2 are
> done; this is the final A4 phase before A7 (team review) → A8 (roster swap).
> It needs a **live browser + DevTools** (dark-theme spot-checks, responsive
> resizing, the CSP console check), so it's a human click-through — same format
> as the Phase 2 guide.

**App:** https://surasaknie.github.io/hubble-wms/ · **Cache:** should read `v=128`
(hard-refresh once; confirm in DevTools → Network that `app-init.js?v=128` loads).
Open DevTools **Console** and keep it visible for the whole pass.

---

## 4A · Dark theme — no white input boxes

Spot-check with DevTools (inspect each field's computed `background`). The app
is dark-theme; a white/browser-default input is a bug.

- [ ] Expenses form (submit expense, mileage claim)
- [ ] Leave request form + **flex swap substitute-date** field (changed in v=128 — confirm it's still dark and now accepts a past date)
- [ ] Petty cash form (admin)
- [ ] Document merge screen
- [ ] Employee modal incl. the new **Gender** dropdown (v=126)
- [ ] Part Numbers mint modal incl. the **category placeholder** (v=126)
- [ ] Password inputs (login page + Security tab) — the historical failure mode
- [ ] Datalists / date pickers (calendar day/week label picker, empSelect)

## 4B · Responsive

- [ ] Usable at 1280px (laptop) and 1920px (desktop)
- [ ] Wide tables scroll horizontally inside `.table-wrapper`, page body doesn't scroll sideways
- [ ] Modals don't overflow at 1280px (check the big ones: employee modal, PN mint, projects assign)

## 4C · Error & empty states

- [ ] F-03 error boundary: temporarily break the Supabase URL in config → reload → "Something went wrong" + Retry panel (not a blank screen)
- [ ] Empty lists show a meaningful message, not a blank panel (e.g. a member with no leave, a project with no time)
- [ ] Toasts appear for success saves, errors, and permission denials

## 4D · Navigation & routing

- [ ] Hand-type `#employees` as a **member** → bounces to `#calendar` with a toast
- [ ] Hand-type `#employees` as a **manager** → bounces (it's admin-only)
- [ ] ⚠️ `#clients` is **admin OR manager** now — a manager should NOT bounce (the old checklist said "manager bounces from #clients"; that's stale). A **member** typing `#clients` should bounce.
- [ ] Client account: any non-portal hash (`#calendar`, `#part-numbers`, …) redirects to `#client-portal`
- [ ] Esc closes the topmost modal; backdrop click does NOT close (R58 rule)
- [ ] Browser Back after navigating doesn't break state

## 4E · Shared components

- [ ] `empSelect`: hyphen-tolerant search, ✕ clear works, no white background
- [ ] `weekNav`: prev/next, click label opens date picker, "This week"/"Show all" where applicable
- [ ] **Calendar arrows (v=126 fix):** Month → next/prev advance by month; Week → by week; **Day → by one day** and the label shows the single day (v=127 fix), not the week
- [ ] Destructive actions use the confirm modal, never native `confirm()`

## L-CSP · Content-Security-Policy console check (R50 follow-up)

- [ ] Hard-refresh **`app.html`** (the app) and **`index.html`** (login), Console open
- [ ] **Zero CSP violations** in the console on both
- [ ] The **Inter font** renders (would silently fail if `font-src` were wrong)
- [ ] Login and app boot both work (would break if `script-src` were wrong for the externalized `app-init.js` / `login-init.js`)

---

## Reporting back

Note pass/fail per box; for any fail include a screenshot or the exact console
text. Results fold into `PRE_LAUNCH_AUDIT_PLAN.md` Phase 4 + the pass-criteria
table, which closes out A4 → clears the way for A7 (team review) and A8 (roster swap).
