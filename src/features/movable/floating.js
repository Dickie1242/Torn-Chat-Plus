/**
 * Floating widgets: a wrapper pulled out of Torn's bottom row and pinned to
 * viewport coordinates.
 *
 * The position lives in two CSS custom properties; the actual
 * `position: fixed; left; top` (and the neutralisation of Torn's
 * right/left/transform) lives in src/styles.css under FLOATING_CLASS, using
 * !important so it beats Torn's non-important inline styles.
 */

import { safe, debug, isDebug, tagOf } from '../../core/log.js';

export const FLOATING_CLASS = 'chatplus-floating';
export const VAR_X = '--chatplus-x';
export const VAR_Y = '--chatplus-y';

/**
 * Pin a wrapper at viewport coordinates (x, y).
 * Writes nothing when the wrapper is already in the desired state, which is
 * what keeps watchWrapper from looping.
 * @param {string} [reason] debug-trace label for who asked.
 */
export function applyFloating(wrapper, x, y, reason) {
  if (!wrapper || !wrapper.style || !wrapper.classList) return;
  const wantX = `${Math.round(Number(x) || 0)}px`;
  const wantY = `${Math.round(Number(y) || 0)}px`;
  debug('applyFloating', tagOf(wrapper), wantX, wantY, reason || '?');
  if (wrapper.style.getPropertyValue(VAR_X) !== wantX) wrapper.style.setProperty(VAR_X, wantX);
  if (wrapper.style.getPropertyValue(VAR_Y) !== wantY) wrapper.style.setProperty(VAR_Y, wantY);
  // A floating widget is out of the row, so any row compensation must go.
  wrapper.style.removeProperty('translate');
  if (!wrapper.classList.contains(FLOATING_CLASS)) wrapper.classList.add(FLOATING_CLASS);
}

/**
 * Put a wrapper back under Torn's own row layout.
 * @param {string} [reason] debug-trace label for who asked.
 */
export function clearFloating(wrapper, reason) {
  if (!wrapper || !wrapper.style || !wrapper.classList) return;
  debug('clearFloating', tagOf(wrapper), reason || '?');
  wrapper.classList.remove(FLOATING_CLASS);
  wrapper.style.removeProperty(VAR_X);
  wrapper.style.removeProperty(VAR_Y);
}

/** @returns {boolean} */
export function isFloating(wrapper) {
  return !!(wrapper && wrapper.classList && wrapper.classList.contains(FLOATING_CLASS));
}

/**
 * Re-assert the floating override whenever Torn rewrites the wrapper's
 * style or class attributes.
 *
 * @param {Element} wrapper
 * @param {() => ({x: number, y: number}|null)} getDesired
 *   The position the widget should hold, or null if it should not float.
 * @param {() => void} [onChange]
 *   Called after each mutation batch, floating or not, so the caller can
 *   reflow the row when Torn repositions anything.
 * @returns {() => void} stop watching.
 */
export function watchWrapper(wrapper, getDesired, onChange) {
  const MO = globalThis.MutationObserver;
  if (!wrapper || typeof MO !== 'function') return () => {};
  const observer = new MO(safe('floating.watchWrapper', (records) => {
    if (isDebug()) {
      for (const record of records) {
        debug('watch', tagOf(wrapper), record.attributeName,
          'was:', record.oldValue,
          'now:', wrapper.getAttribute(record.attributeName));
      }
    }
    const desired = getDesired();
    if (desired) applyFloating(wrapper, desired.x, desired.y, 'watch');
    if (onChange) onChange();
  }));
  observer.observe(wrapper, {
    attributes: true,
    attributeFilter: ['style', 'class'],
    // Only read by the debug trace; recording it changes no behaviour.
    attributeOldValue: true,
  });
  return () => observer.disconnect();
}
