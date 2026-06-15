// components/empSelect.js
// Project-standard employee datalist picker.
// Mirrors weekNav.js in convention (idPrefix, Html/wire exports).
// CSS: .emp-select-wrap / .emp-clear-btn — already in style.css.
//
// ── API ──────────────────────────────────────────────────────────
//
//   empOptionLabel(e)
//     Returns display string for one employee: "Full Name (EMP-ID)"
//
//   empSelectHtml(idPrefix, employees, opts?)
//     Returns HTML string. Embed in a template literal.
//     Filters active/probation employees internally.
//     idPrefix   — unique string that scopes element IDs (e.g. 'tk', 'ts', 'hl-tl')
//     employees  — employee array (any status; active/probation filtered inside)
//     opts       — { selectedId: null, placeholder: 'Type name or ID…' }
//
//   wireEmpSelect(idPrefix, employees, onSelect)
//     Wires the input + clear button produced by empSelectHtml().
//     Call once, after the HTML is in the DOM.
//     onSelect(emp | null)  — the matching employee object, or null on clear/no match

import { esc, attr } from '../format.js';

export function empOptionLabel(e) {
  return `${e.full_name} (${e.employee_id})`;
}

export function empSelectHtml(idPrefix, employees, { selectedId = null, placeholder = 'Type name or ID…' } = {}) {
  const active = employees.filter(e => e.status === 'active' || e.status === 'probation');
  const selEmp = selectedId ? active.find(e => e.id === selectedId) : null;
  return `<div class="emp-select-wrap">
    <input class="form-input" type="text" id="${idPrefix}-emp-search" list="${idPrefix}-emp-options"
      placeholder="${attr(placeholder)}" autocomplete="off"
      value="${selEmp ? attr(empOptionLabel(selEmp)) : ''}">
    <datalist id="${idPrefix}-emp-options">
      ${active.map(e => `<option value="${attr(empOptionLabel(e))}"></option>`).join('')}
    </datalist>
    <button type="button" class="emp-clear-btn" title="Clear">✕</button>
  </div>`;
}

export function wireEmpSelect(idPrefix, employees, onSelect) {
  const active = employees.filter(e => e.status === 'active' || e.status === 'probation');
  const input = document.getElementById(`${idPrefix}-emp-search`);
  if (!input) return;
  input.addEventListener('change', () => {
    const val = input.value.trim();
    if (!val) { onSelect(null); return; }
    let emp = active.find(e => empOptionLabel(e) === val);
    if (!emp) {
      // Format-tolerant fallback: compare on alphanumerics only, so a typed ID
      // with or without hyphens ("02300356" ⇆ "02-3-003-56") still resolves.
      const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const nv = norm(val);
      if (nv) emp = active.find(e =>
        norm(e.employee_id).includes(nv) || norm(e.full_name).includes(nv) || norm(empOptionLabel(e)).includes(nv));
    }
    if (emp) onSelect(emp);
  });
  const clearBtn = input.closest('.emp-select-wrap')?.querySelector('.emp-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      onSelect(null);
    });
  }
}
