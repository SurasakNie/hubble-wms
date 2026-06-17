// js/components/confirmModal.js
// Centered, promise-returning confirmation dialog — a drop-in replacement for the
// native confirm(), which Chrome/Edge anchor to the TOP of the window and cannot be
// repositioned. Follows the house Modal Pattern (.modal-backdrop centers via flex).
// Resolves true on confirm; false on cancel / backdrop click / ✕ / Escape.
//
//   if (!await confirmModal({ message: 'Delete this?', confirmText: 'Delete', danger: true })) return;
//
import { esc } from '../format.js';

let _busy = false;

export function confirmModal({
  title       = 'Please confirm',
  message     = '',
  confirmText = 'Confirm',
  cancelText  = 'Cancel',
  danger      = false,
} = {}) {
  return new Promise(resolve => {
    if (_busy) { resolve(false); return; }   // never stack confirm dialogs

    _busy = true;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div class="modal-header">
          <div class="modal-title" id="confirm-modal-title">${esc(title)}</div>
          <button class="modal-close" type="button" aria-label="Cancel">&times;</button>
        </div>
        <div class="modal-body"><p style="margin:0;line-height:1.5;">${esc(message)}</p></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" type="button" data-confirm="no">${esc(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm="yes">${esc(confirmText)}</button>
        </div>
      </div>`;

    const close = (result) => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      _busy = false;
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape')     { e.preventDefault(); close(false); }
      else if (e.key === 'Enter') { e.preventDefault(); close(true);  }
    };

    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(false); });
    backdrop.querySelector('.modal-close').addEventListener('click',        () => close(false));
    backdrop.querySelector('[data-confirm="no"]').addEventListener('click',  () => close(false));
    backdrop.querySelector('[data-confirm="yes"]').addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-confirm="yes"]').focus();
  });
}

// Centered, promise-returning text-input dialog — a drop-in replacement for the
// native prompt(). Follows the house Modal Pattern. Resolves the entered string
// on confirm; null on cancel / backdrop click / ✕ / Escape.
//
//   const note = await promptModal({ title: 'Rejection reason', placeholder: 'Optional' });
//   if (note === null) return;   // cancelled
//
export function promptModal({
  title       = 'Enter a value',
  message     = '',
  placeholder = '',
  initial     = '',
  confirmText = 'OK',
  cancelText  = 'Cancel',
  required    = false,
} = {}) {
  return new Promise(resolve => {
    if (_busy) { resolve(null); return; }   // never stack dialogs

    _busy = true;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="prompt-modal-title">
        <div class="modal-header">
          <div class="modal-title" id="prompt-modal-title">${esc(title)}</div>
          <button class="modal-close" type="button" aria-label="Cancel">&times;</button>
        </div>
        <div class="modal-body">
          ${message ? `<p style="margin:0 0 8px;line-height:1.5;">${esc(message)}</p>` : ''}
          <textarea class="form-input" rows="3" style="width:100%;resize:vertical;"
            placeholder="${esc(placeholder)}">${esc(initial)}</textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" type="button" data-prompt="cancel">${esc(cancelText)}</button>
          <button class="btn btn-primary" type="button" data-prompt="ok">${esc(confirmText)}</button>
        </div>
      </div>`;

    const ta = backdrop.querySelector('textarea');
    const close = (result) => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      _busy = false;
      resolve(result);
    };
    const submit = () => {
      const val = ta.value;
      if (required && !val.trim()) { ta.focus(); return; }
      close(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      // Enter submits; Shift+Enter inserts a newline (textarea default).
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    };

    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(null); });
    backdrop.querySelector('.modal-close').addEventListener('click',       () => close(null));
    backdrop.querySelector('[data-prompt="cancel"]').addEventListener('click', () => close(null));
    backdrop.querySelector('[data-prompt="ok"]').addEventListener('click',     submit);
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(backdrop);
    ta.focus();
  });
}
