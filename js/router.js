// router.js — lightweight hash-based SPA router

const _routes   = {};
let   _current  = null;
let   _default  = '#tracker';

/**
 * Register a route handler.
 * @param {string}   hash    e.g. '#tracker'
 * @param {Function} handler called with no arguments when route activates
 */
export function route(hash, handler) {
  _routes[hash] = handler;
}

/**
 * Set the default route (used when hash is empty or '/').
 */
export function setDefault(hash) {
  _default = hash;
}

/**
 * Programmatically navigate to a hash route.
 */
export function navigate(hash) {
  window.location.hash = hash;
}

/**
 * Start the router — call once after all routes are registered.
 * Dispatches the current hash immediately.
 */
export function startRouter() {
  window.addEventListener('hashchange', _dispatch);
  _dispatch();
}

/** Get the currently active route hash. */
export function getCurrentRoute() {
  return _current;
}

// ──────────────────────────────────────────────────────────────

function _dispatch() {
  const raw  = window.location.hash || '';
  const hash = raw && raw !== '#' ? raw.split('?')[0] : _default;

  // Redirect to default if no match
  if (!_routes[hash]) {
    navigate(_default);
    return;
  }

  _current = hash;

  // Update nav active state
  document.querySelectorAll('[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === hash);
  });

  // Render the page into #content
  const content = document.getElementById('content');
  if (content) content.innerHTML = '';

  // Route handlers are async (they `await loader()` a dynamic import). Wrap the
  // result so a failed import / thrown render error shows a recoverable panel
  // instead of leaving #content blank with only an unhandled promise rejection.
  Promise.resolve()
    .then(() => _routes[hash]())
    .catch(err => _renderRouteError(hash, err));
}

function _renderRouteError(hash, err) {
  console.error(`Route "${hash}" failed:`, err);
  window.showToast?.('Something went wrong loading this page.', 'error');
  const content = document.getElementById('content');
  if (!content) return;
  const msg = (err && err.message) ? err.message : 'Unknown error';
  const safe = String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  content.innerHTML = `
    <div class="empty-state" style="margin-top:60px">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div class="empty-state-title">Couldn't load this page</div>
      <div class="empty-state-sub">${safe}</div>
      <button class="btn btn-secondary" id="route-retry" style="margin-top:16px">Retry</button>
    </div>`;
  document.getElementById('route-retry')?.addEventListener('click', () => _dispatch());
}
