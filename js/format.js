// format.js — date / time / duration / currency formatters
// All formatters respect the current user's profile preferences.
// Call setFormatPrefs(profile) after loading the session.

const DEFAULTS = {
  date_format:     'dd/mm/yyyy',
  time_format:     '24h',
  duration_format: 'h:mm',
  currency:        'USD',   // app default; overridden by profile.currency when set
};

let _prefs = { ...DEFAULTS };

/** Returns the current default currency (from user profile, or app default). */
export function getDefaultCurrency() {
  return _prefs.currency;
}

/** Update formatter preferences from a profile object. */
export function setFormatPrefs(profile = {}) {
  _prefs = {
    date_format:     profile.date_format     || DEFAULTS.date_format,
    time_format:     profile.time_format     || DEFAULTS.time_format,
    duration_format: profile.duration_format || DEFAULTS.duration_format,
    currency:        profile.currency        || DEFAULTS.currency,
  };
}

// ──────────────────────────────────────────────────────────────
// DATE
// ──────────────────────────────────────────────────────────────

/**
 * Format an ISO date string (YYYY-MM-DD) or Date object
 * using the user's preferred date format.
 */
export function formatDate(input) {
  if (!input) return '';
  // Avoid timezone shift by treating ISO strings as local
  const d = typeof input === 'string'
    ? new Date(input.includes('T') ? input : `${input}T00:00:00`)
    : input;
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());

  switch (_prefs.date_format) {
    case 'mm/dd/yyyy': return `${mm}/${dd}/${yyyy}`;
    case 'yyyy-mm-dd': return `${yyyy}-${mm}-${dd}`;
    default:           return `${dd}/${mm}/${yyyy}`;
  }
}

/** Today as YYYY-MM-DD string (local timezone). */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** Yesterday as YYYY-MM-DD string. */
export function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * Returns "Today", "Yesterday", or the formatted date string.
 */
export function formatDayLabel(isoDate) {
  if (isoDate === todayISO())     return 'Today';
  if (isoDate === yesterdayISO()) return 'Yesterday';
  return formatDate(isoDate);
}

// ──────────────────────────────────────────────────────────────
// TIME
// ──────────────────────────────────────────────────────────────

/**
 * Format a "HH:MM" or "HH:MM:SS" time string using the user's format.
 */
export function formatTime(timeStr) {
  if (!timeStr) return '';
  const [hStr, mStr = '00'] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr.padStart(2, '0');

  if (_prefs.time_format === '12h') {
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${period}`;
  }
  return `${String(h).padStart(2, '0')}:${m}`;
}

/**
 * Format a time range as "10:00 – 12:30".
 */
export function formatTimeRange(start, end) {
  if (!start) return '';
  if (!end)   return formatTime(start);
  return `${formatTime(start)} – ${formatTime(end)}`;
}

// ──────────────────────────────────────────────────────────────
// DURATION
// ──────────────────────────────────────────────────────────────

/**
 * Format decimal hours as duration using the user's format.
 * @param {number} hours - e.g. 2.5
 * @returns {string} e.g. "2:30"
 */
export function formatDuration(hours) {
  if (hours === null || hours === undefined || isNaN(hours)) return '0:00';
  const totalMins = Math.round(Number(hours) * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;

  switch (_prefs.duration_format) {
    case 'decimal': return `${Number(hours).toFixed(2)}`;
    case 'hh:mm':   return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    default:        return `${h}:${String(m).padStart(2,'0')}`;  // "h:mm"
  }
}

/**
 * Compute decimal hours from two "HH:MM" strings.
 * Returns 0 if inputs are invalid.
 */
export function timesToHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? Math.round(diff) / 60 : 0;
}

// ──────────────────────────────────────────────────────────────
// CURRENCY
// ──────────────────────────────────────────────────────────────

/**
 * Format an amount as currency.
 * @param {number} amount
 * @param {string} [currency] - override user preference
 * @returns {string} e.g. "THB 1,234.00"
 */
export function formatAmount(amount, currency) {
  const cur = currency || _prefs.currency || 'THB';
  if (amount === null || amount === undefined) return `${cur} 0.00`;
  return `${cur} ${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ──────────────────────────────────────────────────────────────
// WEEK HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * Get the Monday (start of ISO week) for a given date.
 * @param {Date|string} [date] - defaults to today
 * @returns {Date}
 */
export function getMondayOf(date) {
  const d = date ? new Date(typeof date === 'string' ? `${date}T00:00:00` : date) : new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon …
  const diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get an array of 7 ISO date strings for Mon–Sun of the week
 * containing the given date.
 * @param {Date} monday
 * @returns {string[]}
 */
export function getWeekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Format a week range like "19 May – 25 May 2026".
 * @param {Date} monday
 */
export function formatWeekRange(monday) {
  const sun = new Date(monday);
  sun.setDate(sun.getDate() + 6);
  const mStart = MONTHS[monday.getMonth()];
  const mEnd   = MONTHS[sun.getMonth()];
  if (mStart === mEnd) {
    return `${monday.getDate()}–${sun.getDate()} ${mEnd} ${sun.getFullYear()}`;
  }
  return `${monday.getDate()} ${mStart} – ${sun.getDate()} ${mEnd} ${sun.getFullYear()}`;
}

/**
 * Short day labels for the week grid header.
 */
export const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * Returns the ISO 8601 week number (1–53) for a given date.
 * @param {Date} date
 * @returns {number}
 */
export function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/**
 * Convert a Date to a local ISO date string (YYYY-MM-DD).
 */
export function toISODate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ──────────────────────────────────────────────────────────────
// HTML ESCAPING
// ──────────────────────────────────────────────────────────────

/** Escape a value for safe insertion into HTML text nodes or attribute values.
 *  Escapes & < > " AND ' so the result is safe inside BOTH double- and
 *  single-quoted attributes (matches the strictest former per-page _esc copies). */
export const esc  = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export const attr = esc;

/**
 * Sanitize an UNTRUSTED HTML string before inserting it via innerHTML.
 * Defence-in-depth for stored admin-authored document templates: neutralises
 * script execution and active content while preserving the formatting tags and
 * inline styles that document templates rely on (headings, tables, <style>, etc.).
 *
 * Strips: <script>/<iframe>/<object>/<embed>/<link>/<meta>/<base>/<form> and
 * form controls; all on* event-handler attributes; javascript: in href/src;
 * and CSS expression()/javascript: in inline style attributes.
 *
 * NOTE: this is NOT a substitute for `esc()` on user-supplied text values —
 * merge values must still be escaped before substitution. This only hardens the
 * surrounding template markup itself. Browser-only (uses the DOM parser).
 */
export function sanitizeHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html ?? '');
  const FORBIDDEN = new Set([
    'SCRIPT','IFRAME','OBJECT','EMBED','LINK','META','BASE','FORM',
    'INPUT','BUTTON','TEXTAREA','SELECT','NOSCRIPT','FRAME','FRAMESET',
  ]);
  tpl.content.querySelectorAll('*').forEach(el => {
    if (FORBIDDEN.has(el.tagName)) { el.remove(); return; }
    [...el.attributes].forEach(a => {
      const name = a.name.toLowerCase();
      const val  = a.value || '';
      if (name.startsWith('on')) {
        el.removeAttribute(a.name);
      } else if ((name === 'href' || name === 'src' || name === 'xlink:href')
                 && /^\s*javascript:/i.test(val)) {
        el.removeAttribute(a.name);
      } else if (name === 'style'
                 && /expression\s*\(|javascript:/i.test(val)) {
        el.removeAttribute(a.name);
      }
    });
  });
  return tpl.innerHTML;
}

/**
 * Validate a CSS color value before using it in inline styles.
 * Accepts hex (#rgb, #rrggbb, #rrggbbaa) and plain CSS named colors.
 * Returns fallback for anything that looks like it could be an injection attempt.
 */
export const safeColor = (v, fallback = '#888888') =>
  /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$/.test(String(v ?? '')) ? v : fallback;
