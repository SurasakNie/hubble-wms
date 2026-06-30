# Mode: `page` — scaffold a new WMS page

Goal: add a new page `#X` (module `js/pages/X.js`) and wire it through every place
`app.html` needs. The inline checklist lives at `app.html:119-130`; this mode is the
fuller version (it also covers `routeAllowed` and the cache bump, which that comment
omits). Worked reference: the newest real page, **`#admin-logs` / `js/pages/adminLogs.js`**.

Ask the user (if not already clear): the route hash, the page title, and whether it's
role-gated (admin-only? manager+?). Then do all 7 touchpoints.

## The 7 touchpoints

1. **Nav link** — inside `<nav class="nav-section" id="nav-wms">` (`app.html` ~131-216).
   All WMS pages go here, NOT in `#nav-manage`:
   ```html
   <a class="nav-item nav-X" data-route="#X" href="#X">
     <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"><!-- Lucide icon paths --></svg>
     Page Title
   </a>
   ```
   Optional notification badge: `<span class="nav-badge hidden" id="badge-X"></span>`.

2. **`wmsRoutes` Set** (`app.html:464`) — add `'#X'` so direct navigation auto-expands the
   SHOW MORE menu:
   ```js
   const wmsRoutes = new Set(['#employees', '#holidays', '#requests', '#expenses',
     '#evaluation', '#documents', '#help', '#admin-logs', '#X']);
   ```

3. **`pages` import map** (`app.html:738-757`) — add the lazy import:
   ```js
   '#X': () => import('./js/pages/X.js' + V),
   ```

4. **`routeAllowed`** (`app.html:763-768`) — ONLY if the page is role-gated. Omit entirely
   for pages everyone may see. Existing gates use `canViewReports()`, `isAdmin()`,
   `isManager()`:
   ```js
   '#X': () => isAdmin(),   // owner/admin only — mirror '#admin-logs'
   ```

5. **Create `js/pages/X.js`** with the standard contract (the router calls `mod.render(profile)`):
   ```js
   // js/pages/X.js — <one-line purpose> (#X)
   import { supabase } from '../config.js';
   import { esc, attr } from '../format.js';
   // shared pickers (only if needed): import { empSelectHtml, wireEmpSelect } from '../components/empSelect.js';
   //                                  import { weekNavHtml, wireWeekNav, updateWeekNavLabel } from '../components/weekNav.js';

   // module-level state
   let _state = null;

   export async function render(profile) {
     document.getElementById('topbar-left').innerHTML =
       `<span class="topbar-title">Page Title</span>`;

     document.getElementById('content').innerHTML = `
       <!-- page HTML; dark inputs are automatic, use shared components -->
     `;

     _wireControls();
     await _load();
   }
   ```
   Notes: imports of `js/api/*` and `js/components/*` carry **no `?v=`**. Use unique
   `idPrefix` for any `empSelect`/`weekNav`. Follow the modal + table-action patterns.

6. **Cache bump** — increment `const V` in `app.html:737` (and the relevant CSS `?v=` on
   the `<link>` at `app.html:11-14` if you touched `style.css`/etc.). Current baseline is
   `?v=109` — bump to the next number.

7. **`UI_NAMING_REFERENCE.html`** — add the page (and its tabs/sections) to the `TABS`
   data array so the naming map stays current. Same rule applies when adding a new
   section/tab to an *existing* page. (This file is gitignored — local only.)

## Done check
- Hash navigates, page mounts, nav item highlights, role gate behaves.
- `V` bumped; no `?v=` pin accidentally added to an api/component import.
