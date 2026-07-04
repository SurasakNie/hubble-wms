# Repo Transfer Runbook — `hubble-wms` + `hubble-wms-backups` → new GitHub account

> **✅ COMPLETED 2026-07-03.** Both repos are now owned by **`SurasakNie`**. Prod is live at
> `https://surasaknie.github.io/hubble-wms/`; the nightly backup cron was verified working
> post-transfer. Two real outages hit during the cutover and were fixed same-session:
> Google login broke from a case-sensitivity bug (Findings #2), and — much more seriously —
> **every Edge Function blocked ALL requests from the new origin via CORS**, which meant
> Employee ID + password login was completely broken for every user, not an edge case
> (Findings #4, the most important one in this doc for next time). This doc is kept as a
> reference for any future transfer and as a record of what actually happened.
>
> **Scope:** transferring BOTH repos — `HE-cells/hubble-wms` (the app, served by GitHub Pages)
> and `HE-cells/hubble-wms-backups` (private; receives the nightly encrypted DB dumps) —
> to a new GitHub account (**`SurasakNie`**). **Supabase stays the same**
> (`sjkggguedgtynktymzes.supabase.co`), and the repo names stay the same; only the account
> changed. Steps are numbered in the order they were executed — kept top to bottom for reuse.
>
> **⚠️ Two things that will bite you if you skip them:**
> 1. **Case sensitivity** — everywhere a step below says to enter a `*.github.io` URL into
>    Supabase or Google Cloud, **type it in all lowercase**. Browsers always normalize
>    hostnames to lowercase, so a mixed-case entry in an allow-list will silently never
>    match and break login.
> 2. **Edge Function CORS allow-lists** — if any Edge Functions are deployed (check
>    Supabase Dashboard → Edge Functions), assume every single one needs its origin
>    allow-list updated (Step 4 below). This is not optional/situational — it broke
>    every non-Google login path the moment the old repo's Pages URL died.

## Key GitHub transfer facts (background)

- Git remote URLs **redirect** automatically after a transfer; issues/PRs/stars/watchers,
  webhooks, deploy keys, and **repo-level Actions secrets & variables transfer** with the repo.
- **GitHub Pages URLs do NOT redirect** — `https://he-cells.github.io/hubble-wms/` stops
  working the moment the transfer completes; the site re-serves at
  `https://surasaknie.github.io/hubble-wms/`.
- Scheduled Actions workflows can silently stall after a transfer; a commit to the default
  branch resyncs them.
- GitHub **App installations do not transfer** (e.g. the Claude Code GitHub integration) —
  reinstall on the new account.
- A **personal account** can always receive a repo transfer. An **organization** target
  needs the transferring user to have repo-creation rights in that org, and depending on
  org settings may require an owner to approve the incoming transfer before it completes.
- **Supabase Edge Functions have their own, separate CORS layer.** The app's own CSP
  (`connect-src` in `app.html`/`index.html`) controls what the *browser* is allowed to
  request — but each Edge Function independently decides, server-side, whether to *answer*
  a request from a given `Origin`. Transferring the GitHub repo does nothing to update
  that server-side config. If it's hardcoded to the old domain, every browser-side fetch
  to that function fails with a generic, unhelpful "Failed to fetch" / CORS error,
  regardless of how correct the CSP or the Supabase Auth Redirect URLs are.

---

## 0. Pre-transfer prep (do this before touching anything)

- [x] Confirm the new GitHub account exists and you can sign in to it.
- [x] Record current settings as a rollback reference (copy/paste the exact strings
      somewhere safe, or screenshot):
  - Supabase → Authentication → URL Configuration → current `Site URL` and full
    `Redirect URLs` list.
  - `hubble-wms` → Settings → Pages → current source (should be `main` / `/ (root)`).
  - `hubble-wms-backups` → Settings → Secrets and variables → Actions → confirm
    `SUPABASE_DB_URL` (secret) and `AGE_PUBLIC_KEY` (variable) are listed (names only —
    values are never visible again once set).
  - **Supabase → Edge Functions → list every deployed function name.** You'll need to
    revisit every one of these in Step 4 — knowing the full list up front saves time.
- [x] On your local machine: `cd` into the `hubble-wms` clone and run `git status` —
      confirm it's clean (no uncommitted work) before the remote URL changes under you.
      Do the same for any local `hubble-wms-backups` clone.
- [x] Pick a low-traffic window — Pages will be briefly unreachable at the old URL and
      not yet reachable at the new one during the transfer itself, and non-Google login
      will be broken until Step 4 is done.

## 1. Transfer `hubble-wms`

1. Go to `https://github.com/HE-cells/hubble-wms/settings` (must be signed in as an
   owner/admin of `HE-cells`).
2. Scroll to the bottom → **Danger Zone** → click **Transfer ownership**.
3. In the confirmation dialog, type the repository name (`hubble-wms`) exactly to confirm.
4. Enter the new owner — the new account's username (or org name).
5. Click **I understand, transfer this repository**.
6. If the new owner is a **personal account you also control**, the transfer completes
   immediately. If it's an **organization**, an invite/confirmation may be required from
   the org side before it finalizes — complete that step now if prompted.
7. Confirm: reload `https://github.com/SurasakNie/hubble-wms` — the repo should now
   show the new owner in the URL and breadcrumb.

## 2. Fix Supabase Auth URLs (do this immediately after step 1 — this is what breaks login if delayed)

1. Go to the [Supabase Dashboard](https://supabase.com/dashboard) → select the
   `sjkggguedgtynktymzes` project → **Authentication** (left sidebar) → **URL
   Configuration**.
2. **Site URL** field: on this project it was already `http://localhost:3030` (not the
   prod URL some older docs assumed) — **we chose to leave it as-is**, since prod login
   always matches an explicit Redirect URL entry and never needs the Site URL fallback in
   practice. (If you'd rather the fallback be a live URL instead of localhost, you can set
   it to `https://surasaknie.github.io/hubble-wms` — either is valid, just be deliberate.)
3. **Redirect URLs** list — the real list had 3 entries before the transfer:
   `http://localhost:3030/app.html`, `http://localhost:3030/**`, and
   `https://he-cells.github.io/hubble-wms/app.html`.
   - Remove `https://he-cells.github.io/hubble-wms/app.html`.
   - Add `https://surasaknie.github.io/hubble-wms/app.html` — **all lowercase**, even
     though the account is styled `SurasakNie`. This is the step that bit us: entering it
     with the account's display casing broke login until it was corrected (see Findings).
   - Leave both `localhost:3030` entries untouched.
4. Click **Save changes**. This takes effect immediately; there is nothing to redeploy on
   Supabase's side.
5. Why this matters: if a user's `redirectTo` doesn't exactly match an entry in this list
   (including case), Supabase silently falls back to the `Site URL` instead of erroring —
   which is exactly the failure mode from `PENDING_TASKS.md` Round 24 (R24-03), and the
   one we hit again mid-transfer from the case mismatch.

## 3. Verify GitHub Pages came back up on the new account

1. `https://github.com/SurasakNie/hubble-wms/settings/pages` — confirm **Source** is
   still `Deploy from a branch` → `main` → `/ (root)`. Repo transfers normally preserve
   Pages settings, but verify rather than assume.
2. If it shows "Your site is not published" or similar, push any commit to `main` to
   trigger a fresh Pages build.
3. Hard-refresh `https://surasaknie.github.io/hubble-wms/` (Ctrl/Cmd+Shift+R) in a
   private/incognito window (avoids any stale service-worker-less browser cache).
4. Open DevTools → **Console**: check for CSP violations and 404s. (This also closes the
   previously-pending "post-push CSP spot-check" from `PENDING_TASKS.md` Round 50 — this
   container never had network access to verify it live.)
5. Open DevTools → **Network**, reload, confirm `app.html`/`index.html` and all
   `js/*.js` requests return `200`, not `404`.

## 4. Fix Edge Function CORS allow-lists — REQUIRED, not optional (this is the big one)

**Do this before considering the transfer done, even if Google login already works.**
Google OAuth doesn't touch these functions at all, so testing only Google login will
give you false confidence — the Employee ID + password login path (and every admin
action backed by an Edge Function) will still be completely broken until this is done.

1. Supabase Dashboard → **Edge Functions** → open each deployed function one at a time
   (this project had at least: `login`, `admin-reset-password`, `provision-client`,
   `admin-clear-mfa`, `account-activation-status`, `admin-set-account-active`, and
   possibly more — check the live list, don't rely on this being exhaustive).
2. In each function's source, look near the top for a line like:
   ```ts
   const ALLOWED_ORIGINS = ['https://he-cells.github.io', 'http://localhost:3030'];
   ```
   This project's functions were already written to support multiple allowed origins
   (checking the request's `Origin` header against this array, falling back to
   `ALLOWED_ORIGINS[0]` on no match) — which is good design, but it still needs the new
   origin *added* to the array; it doesn't infer it automatically.
3. Add the new origin, **all lowercase**:
   ```ts
   const ALLOWED_ORIGINS = ['https://he-cells.github.io', 'http://localhost:3030', 'https://surasaknie.github.io'];
   ```
   Leaving the old `he-cells.github.io` entry in is harmless (that origin can no longer
   serve real traffic) and safer than deleting it under time pressure.
4. Save and redeploy each function from the dashboard's editor.
5. **Symptom if you skip this**, so you recognize it fast next time: DevTools Console
   shows `Access to fetch at '.../functions/v1/<name>' from origin '...' has been
   blocked by CORS policy: ... 'Access-Control-Allow-Origin' header has a value
   'https://he-cells.github.io' that is not equal to the supplied origin`, and the
   Network tab shows the request as `(failed) net::ERR_FAILED`. The client-side symptom
   is often just a generic "Failed to fetch" with no useful detail, because CORS
   failures don't expose the real reason to JavaScript — you have to check the Console.
6. Retest **every** affected flow after fixing, not just the first one you find:
   Employee ID + password login, admin password reset, provisioning a client, etc.

## 5. Verify Google Sign-In still works

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services**
   → **Credentials** (or the newer **Google Auth Platform → Clients** page) → open the
   OAuth 2.0 Client ID used by this Supabase project's Google provider.
2. Under **Authorized JavaScript origins**: if `https://he-cells.github.io` is listed,
   **add** `https://surasaknie.github.io` — **lowercase** (add, don't replace yet — keep
   the old one until you're confident the old account/repo won't be reused).
3. **Authorized redirect URIs** should already be Supabase's own callback
   (`https://sjkggguedgtynktymzes.supabase.co/auth/v1/callback`) — this does **not**
   change, since it never referenced GitHub Pages. Leave it as-is.
4. Save.
5. Live test: open `https://surasaknie.github.io/hubble-wms/`, click Google sign-in,
   complete the flow, confirm you land on `app.html` logged in (not bounced to an error,
   and not redirected to `localhost:3030` with a token in the URL — see Findings if you
   see that). Remember: this only proves Google login works, not ID+password login —
   Step 4 covers that separately.

## 6. Transfer `hubble-wms-backups`

1. Same procedure as step 1: `https://github.com/HE-cells/hubble-wms-backups/settings` →
   **Danger Zone** → **Transfer ownership** → confirm repo name → enter new owner →
   confirm.
2. Do this in the same session as step 1 where practical.

## 7. Verify the nightly backup cron survived the transfer

1. `https://github.com/SurasakNie/hubble-wms-backups/actions` → `nightly-db-backup`.
2. Confirm it's not shown as disabled due to inactivity.
3. If it has `workflow_dispatch`, you can **Run workflow** to force an immediate test —
   in practice the scheduled run fired on its own the same day as the transfer with no
   resync needed (run #23, green, 1m 2s).
4. `https://github.com/SurasakNie/hubble-wms-backups/settings/secrets/actions` — confirm
   `SUPABASE_DB_URL` (secret) and `AGE_PUBLIC_KEY` (variable) both still appear.
5. Note: the backup connects **directly to Supabase** via the pooler connection string —
   the GitHub account change has no bearing on that connection.

## 8. Re-arm failure notifications on the backups repo

1. On `https://github.com/SurasakNie/hubble-wms-backups`, click **Watch** → **Custom** →
   check **Actions** (or **All Activity**) → **Apply**. In practice this was already set
   to "All Activity" immediately post-transfer (repo owners default to watching), so
   double-check rather than assume you need to change it.

## 9. Local machine + CLI tooling

Run these for every **local** clone of either repo (this does not apply to a Claude Code
cloud session, whose git remote is a harness-managed proxy tied to the session's granted
repo scope — that's handled separately, not by you):

```bash
git remote set-url origin https://github.com/SurasakNie/hubble-wms.git
git remote -v   # confirm it now shows SurasakNie
git fetch       # confirm it authenticates and pulls cleanly
```

```bash
git remote set-url origin https://github.com/SurasakNie/hubble-wms-backups.git
git remote -v
```

If you use the `gh` CLI:

```bash
gh auth login          # re-auth as the new account if it's a different login
gh repo set-default SurasakNie/hubble-wms
```

If `git fetch` hangs or fails after the remote change, it's usually a cached credential
for the old account — clear it (Windows: Control Panel → Credential Manager → Windows
Credentials → remove the `git:https://github.com` entry; macOS: Keychain Access, same
idea) and the next git operation will prompt fresh.

**⚠️ Also check your local branch is actually up to date after this.** `git fetch` alone
does not update your working directory — if you're on a stale `main` (we found one local
clone still on a commit from ~2 months and 100+ commits earlier), you'll be missing files
entirely. Run `git pull origin main` (or `git checkout main && git pull`) to actually
fast-forward your working copy, and `git branch` / `git log --oneline -1` to sanity-check
which branch and commit you're actually on before assuming a file "doesn't exist."

## 10. Reinstall GitHub Apps

1. On the **old** account, visit `https://github.com/settings/installations` and note
   every app installed against `hubble-wms` / `hubble-wms-backups` (e.g. the Claude Code
   GitHub integration). App installations do **not** follow a repo transfer.
2. On the **new** account, install each of those apps and grant it access to the
   transferred repos. In practice, the main `Claude` app was already present on the new
   account before we even checked — only a secondary app (`Claude Design Import`) was
   missing, and that was optional/unused for this project.

## 11. Communicate the URL change

- Old Pages bookmarks (`https://he-cells.github.io/hubble-wms/`) 404 permanently — there
  is no automatic redirect for GitHub Pages. Tell users the new URL.

## 12. Explicitly NOT needed (already verified safe in code — don't waste time re-checking)

- `js/config.js` (Supabase URL / anon key) — unchanged.
- `js/auth.js` OAuth `redirectTo` — dynamic (`new URL('app.html', window.location.href)`),
  auto-adapts to the new origin, no edit needed.
- CSP meta tags (`index.html` / `app.html`) — only Supabase/jsdelivr/gstatic/Google-Fonts
  origins; `'self'` covers whatever the Pages origin is. (This is the *client-side* CSP
  only — it does not help with the *server-side* Edge Function CORS problem in Step 4;
  those are two completely independent security layers.)
- All asset/module paths in the app — relative; hash-route nav; no root-absolute or
  repo-name-prefixed paths.
- Probe scripts (`f01_prod_client_probe.sh`, `.ps1`, `supabase/probes/*.ps1`) —
  Supabase-only, no app/Pages URL referenced; run these from a machine with real internet
  access, not a sandboxed Claude Code session (which is typically network-blocked from
  reaching Supabase or GitHub Pages directly — confirmed via `CONNECT tunnel failed,
  response 403` when tested).
- CI workflow (`.github/workflows/ci.yml`) — localhost-only, no account references.
- No CNAME, no service worker, no PWA manifest, no `emailRedirectTo` / password-reset
  redirects anywhere in the app's own client code (the CORS issue in Step 4 is a Supabase
  Edge Function concern, not a client-code concern).

## 13. Troubleshooting / rollback

| Symptom | Likely cause | Fix |
|---|---|---|
| Google login succeeds at Google, then browser shows "This site can't be reached" at `http://localhost:3030/#access_token=...` | **Case mismatch** — the Redirect URLs entry was typed with the account's display casing (e.g. `SurasakNie`) instead of the lowercase hostname the browser actually sends (`surasaknie`). Exact-match failure → silent fallback to Site URL. **This happened during our own transfer.** | Re-check Supabase → Authentication → URL Configuration → Redirect URLs; re-enter the entry in all lowercase; Save; retry login |
| Employee ID + password login fails; DevTools Console shows `Access to fetch at '.../functions/v1/login' ... blocked by CORS policy ... has a value 'https://he-cells.github.io' that is not equal to the supplied origin` | **The Edge Function's `ALLOWED_ORIGINS` array (or equivalent CORS header) still only lists the old domain.** This is guaranteed to happen for every Edge Function if you skip Step 4 — it is not an edge case. **This happened during our own transfer and broke login for everyone using ID+password.** | Supabase Dashboard → Edge Functions → open the function → add the new lowercase origin to `ALLOWED_ORIGINS` → save/redeploy. Repeat for every other deployed function, not just the one you noticed first. |
| Any admin action (reset password, provision client, clear MFA, etc.) fails with a vague "Failed to fetch" or a client-side `TypeError: Cannot read properties of undefined` | Same root cause as above — a failed CORS preflight means the client never gets a real response, and some client code doesn't handle that gracefully (tries to read a field off `undefined`). The CORS fix resolves the underlying failure; the `TypeError` itself is a separate, minor robustness gap worth hardening later (wrap the fetch handling in a try/catch that shows a real error toast). | Fix the Edge Function CORS list (Step 4) first; only chase the client-side error-handling gap if it still misbehaves after that. |
| Google login succeeds at Google but lands back on a broken/blank page, or redirects to `localhost:3030` for another reason | Step 2 (Supabase Redirect URLs) wasn't saved, or was done before Pages was live at the new URL | Re-check Supabase → Authentication → URL Configuration |
| `nightly-db-backup` shows "disabled due to inactivity" | Transfers can reset GitHub's internal activity clock for schedule purposes | Push any commit to the repo's default branch; scheduled runs resume on the next window |
| Browser console shows a Google Fonts stylesheet blocked by CSP (`style-src`) | Pre-existing bug, unrelated to the transfer — `style-src` didn't originally include `https://fonts.googleapis.com` even though `font-src` correctly allowed `fonts.gstatic.com` for the font files | **Fixed** — `style-src` in `app.html`/`index.html` now includes `https://fonts.googleapis.com` |
| `f01_prod_client_probe.sh` starts failing after the transfer | Should be impossible — the probe only talks to Supabase, which didn't move | Re-run against `sjkggguedgtynktymzes.supabase.co` directly, **from a machine with real internet access**, to confirm it's not a probe-environment/network-block issue before assuming a real regression |
| Nightly backup workflow runs but produces no new commit / errors | Not transfer-related in the typical case — check `SUPABASE_DB_URL` secret still resolves | Re-run the workflow with debug logging |

## 14. Final verification checklist

- [x] `https://surasaknie.github.io/hubble-wms/` loads — confirmed indirectly (a
      successful login round-trip requires all core JS/CSS to have loaded).
- [x] Google sign-in round-trips to a logged-in `app.html` on the new URL — broke once
      mid-transfer (case-mismatch redirect URL), fixed same-session.
- [x] **Employee ID + password login works** — broke completely mid-transfer (Edge
      Function CORS allow-lists still pointed at the old domain), fixed same-session by
      updating `ALLOWED_ORIGINS` in every deployed Edge Function.
- [x] Admin actions backed by Edge Functions (password reset, etc.) retested after the
      CORS fix and confirmed working.
- [ ] `f01_prod_client_probe.sh` (or `.ps1`) — attempted from a Claude Code cloud session
      first, which is network-blocked from reaching Supabase directly
      (`CONNECT tunnel failed, response 403`) — must be run from a machine with real
      internet access instead. Auth failed on the first real attempt with
      `invalid_credentials` (wrong/unconfirmed test client credentials, unrelated to the
      transfer) — re-run with confirmed-correct credentials to get a real pass/fail.
      **⚠️ Re-run this only AFTER applying the two Round-54 migrations below — the probe
      now asserts 12 additional tables that those migrations lock down.**
- [x] `hubble-wms-backups` Actions tab shows `nightly-db-backup` enabled and green
      (run #23, today, 1m 2s), with a fresh `daily/` backup file committed.
- [x] Watch is re-armed on the backups repo from the new account (was already
      "All Activity").
- [ ] Add-Member modal (Team page, admin) → the displayed "App link" reads
      `https://surasaknie.github.io/hubble-wms/index.html` — not explicitly re-checked
      after the transfer, but the underlying fix (cache `v=115`) was verified working
      pre-transfer.
- [x] Local git remotes point at `SurasakNie` (verified via `git fetch` succeeding, after
      also discovering and fixing a local clone that was ~100 commits stale on `main`).
- [x] GitHub Apps — the main `Claude` integration was already installed on the new
      account; a secondary unused app (`Claude Design Import`) was not, and that's fine.
- [x] Users notified of the URL change.

---

## 15. Round 54 post-transfer audit — outputs that still need YOUR action (2026-07-03)

The full post-transfer security/code audit is **done** (see `AUDIT_2026-07-03_FULL_PROJECT.md`,
local-only; all Critical/High + most Medium/Low fixed on branch
`claude/next-session-plan-h9psa4` → PR #26). The canonical, ordered checklist lives in
**`NEXT_SESSION_PLAN.md` § 6** — this is a pointer + the items that intersect this transfer
doc specifically:

- [ ] **Apply `20260710_client_block_expanded.sql` in Supabase Studio** — closes the
      audit's Critical finding: 12 internal tables (incl. `employee_compensation` salary
      data) were readable by any `client`-role session, missed by the R49 hand-maintained
      block-list. Also moves `audit_log_select_admin` off `get_my_role()` onto `is_admin()`.
      **Until applied, that leak is live in prod.**
- [ ] **Apply `20260711_f05_rpc_search_path.sql` in Supabase Studio** — pins the 3 f05
      SECURITY DEFINER RPCs to `search_path = public, pg_temp` (defense-in-depth).
- [ ] After both applies: re-run the F-01 probe (§14 item), then log in as the test client
      through the **real login form** to confirm the portal still loads.
- [ ] One-pass live click-through of the remaining Edge-Function admin features
      (`provision-client`, `admin-clear-mfa`, `admin-set-account-active`,
      `account-activation-status`), a **manager**-role UI login, a TOTP challenge if any
      test account has 2FA, and the **PR #26 money-flow spot-check** (the new
      approval status-guards touch expense/leave/travel-claim approve/reject — test a
      normal approve+reject, the two-stage "Save & Approve", and one admin status override
      on a travel claim).
- [ ] Nothing to do unless triggered: Supabase `Site URL` is `http://localhost:3030` by
      design (§2), so any **native** Supabase auth email (magic link / signup confirm /
      native password reset) embeds a dead localhost link. Safe today (this app uses
      admin-provisioned passwords + its own admin-reset Edge Function, no self-serve email).
      Only becomes a bug if a "forgot password" or signup flow is ever wired to Supabase's
      native email — at which point set `Site URL` to the prod origin. Quick glance: confirm
      the login screen has no "forgot password" link pointing at Supabase native reset.

---

## Findings from this transfer (2026-07-03)

Four real issues surfaced during this transfer, none of them things that could have been
caught by reading the app's own code alone — worth keeping for the next transfer or the
next person. **Read #4 first** — it's the one that actually took the app down.

1. **The pre-transfer Supabase config didn't match the docs.** `PENDING_TASKS.md` claimed
   `Site URL = https://he-cells.github.io/hubble-wms`, but the actual value was
   `http://localhost:3030`, and there was an extra `http://localhost:3030/**` wildcard
   redirect entry nobody had documented. Harmless in practice (the prod Redirect URL
   entry still matched), but a reminder that "the docs say X" isn't the same as "the
   dashboard says X" — always verify live state before changing it.

2. **Case-sensitivity bug in Supabase's Redirect URLs allow-list.** Entering the new
   Redirect URL with the GitHub account's display casing (`SurasakNie`) instead of the
   browser-normalized lowercase hostname (`surasaknie`) caused an exact-match failure.
   Supabase's `redirectTo` matching is case-sensitive; browsers always lowercase
   hostnames. Result: every fresh Google login silently fell back to the `Site URL`
   (`http://localhost:3030`) and dumped the user on a "This site can't be reached" page
   with a dead access token in the URL fragment. **Fixed** by re-entering the Redirect
   URL entry in lowercase. No data was lost (the leaked token in the browser URL bar
   expired within the hour and was never usable), but this was a real, if brief,
   production login outage. **Takeaway: always type `*.github.io` URLs in lowercase
   in any auth allow-list, regardless of how the account name is styled elsewhere.**

3. **Google Fonts stylesheet was blocked by CSP `style-src`** — pre-existing, unrelated
   to the transfer, but only just caught because this was the first live console check
   since the CSP was added (Round 50). `font-src` correctly allowed `fonts.gstatic.com`
   for the actual font files, but `style-src` never included `fonts.googleapis.com` for
   the CSS that declares the `@font-face` rules in the first place — so the Inter font
   never actually loaded, silently, since before this transfer. **Fixed**: `style-src`
   now includes `https://fonts.googleapis.com` in both `app.html` and `index.html`.

4. **⚠️ The big one: every Supabase Edge Function's CORS allow-list was hardcoded to the
   old domain, and this broke Employee ID + password login completely — not a rare edge
   case, a total outage on that login path for every user.** The original version of
   this checklist only listed this as a soft "check whether any Edge Function has a CORS
   allowed-origins list; if so, add the new origin" item under "explicitly not needed to
   check in code" — that framing badly undersold the risk. In reality:
   - The client-side CSP (`connect-src` in `app.html`/`index.html`) was already correct
     and allowed connections to the Edge Functions domain — that gave false confidence
     that "the app's network config is fine."
   - But CORS is a **separate, server-side** decision each Edge Function makes about
     whether to *answer* a request from a given browser `Origin`. The functions in this
     project (`login`, `admin-reset-password`, and presumably all others) had:
     ```ts
     const ALLOWED_ORIGINS = ['https://he-cells.github.io', 'http://localhost:3030'];
     ```
     hardcoded near the top, with the request's `Origin` checked against this array and
     falling back to `ALLOWED_ORIGINS[0]` on no match. Well-designed *pattern* (it does
     support multiple origins) — but nobody updates the *data* in that array just because
     a GitHub repo transferred, and the transfer process gives zero indication this needs
     doing.
   - Symptom: DevTools Console showed
     `Access to fetch at '.../functions/v1/login' from origin 'https://surasaknie.github.io'
     has been blocked by CORS policy: ... 'Access-Control-Allow-Origin' header has a value
     'https://he-cells.github.io' that is not equal to the supplied origin.` The user-facing
     experience was just a login that silently failed with `net::ERR_FAILED` — no useful
     error surfaced in the UI itself.
   - We only caught it because an *admin* action (password reset) happened to be tested
     first and produced the same error — which is what made us think to test the ID+password
     login path too, discovering it was down for everyone, not just that one admin flow.
     **If Google OAuth is the only thing tested after a transfer, this will go completely
     unnoticed until real users start reporting they can't log in.**
   - **Fixed** by adding `https://surasaknie.github.io` (lowercase) to the `ALLOWED_ORIGINS`
     array in every deployed Edge Function and redeploying each one, then retesting both
     the ID+password login and the admin action that first surfaced the problem.
   - **Takeaway for next time: treat every Edge Function's CORS config as guaranteed
     broken after a domain change, not "worth checking." Fix and redeploy all of them as
     a mandatory step (now Step 4 above), before considering any transfer complete — and
     test the ID+password login path specifically, not just Google OAuth, since they
     exercise completely different code paths.**
