import { safe } from '../../core/log.js';

/** Presses that can start Torn's own reorder drag on the very same header. */
const PRESS_EVENTS = ['pointerdown', 'mousedown', 'touchstart'];

/**
 * Keeps Torn's own handlers off a header that Chat+ has taken over.
 *
 * Torn runs a reorder drag of the bottom row from a press on the SAME header
 * button Chat+ drags by, and it neither captures the pointer nor stops the
 * event. Both drags on one gesture means Torn rewrites the wrapper's transform
 * and re-inserts it in the row under our pointer.
 *
 * So while the guard is enabled EVERY press inside the header is stopped in the
 * capture phase, before it reaches Torn's listeners on the ancestors, but never
 * default-prevented: focus, :active and the click still happen. A click is a
 * separate event, so Minimize, Close and the padlock keep working.
 *
 * The caller enables the guard exactly when Chat+ owns the header. A locked
 * widget still sitting in Torn's row is left alone entirely, so Torn's
 * drag-to-swap keeps working for it.
 *
 * @param {{header: Element}} config
 */
export function createHeaderGuard({ header }) {
  let enabled = false;
  /** Set when a real drag just finished, so its trailing click can be eaten. */
  let swallowClick = false;

  const onPress = safe('movable.press', (event) => {
    // A new pointer gesture disarms a swallow left over from a drag whose click
    // never arrived (pointercancel). Only pointerdown counts: on touch, the
    // compatibility mousedown fires between pointerup and click and must not
    // let the trailing click through to the control the drag started on.
    if (event.type === 'pointerdown') swallowClick = false;
    // touchstart carries no button; a right-click is nobody's drag.
    if (typeof event.button === 'number' && event.button !== 0) return;
    event.stopPropagation();
  });

  /**
   * A drag ends with a click on whatever now sits under the pointer, which
   * would fire that element's action - Torn's collapse, or the very padlock the
   * drag started from, since the box moved with the pointer. Eat exactly that
   * one click wherever it lands; a plain click, or any click after it, passes
   * straight through.
   */
  const onClick = safe('movable.click', (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  });

  return {
    /** A drag just ended on this header: eat the click it is about to fire. */
    armClickSuppression() {
      swallowClick = true;
    },

    enable() {
      if (enabled) return;
      enabled = true;
      // Capture, not bubble: an event stopped here never comes back up.
      for (const type of PRESS_EVENTS) header.addEventListener(type, onPress, true);
      header.addEventListener('click', onClick, true);
    },

    disable() {
      if (!enabled) return;
      enabled = false;
      for (const type of PRESS_EVENTS) header.removeEventListener(type, onPress, true);
      header.removeEventListener('click', onClick, true);
      swallowClick = false;
    },
  };
}
