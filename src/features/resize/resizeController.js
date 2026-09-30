/**
 * One resize gesture at a time for one chat: a press on a handle, then
 * pointer moves until release.
 *
 * It listens on the document, not on the handle, and takes no pointer capture:
 * Torn swaps a chat's nodes mid-gesture when a message arrives, and a listener
 * on the removed handle would die with it. `getBox` is read on every move for
 * the same reason. Chrome keeps sending mouse events to the document while a
 * button is held, even outside the window, so release is never missed.
 */

import { debug } from '../../core/log.js';
import { limitsFor, nextSize } from './sizing.js';
import { ACTIVE_CLASS } from './handles.js';

/** On <body> while a gesture is live, valued with its direction, for the cursor rules in styles.css. */
export const BODY_ATTR = 'data-chatplus-resizing';

/**
 * @param {Object} config
 * @param {Document} [config.doc]
 * @param {() => Element|null} config.getBox  the chat box as of right now
 * @param {() => {width: number, height: number}} [config.getViewport]
 * @param {(size: {width: number, height: number, shiftX: number, shiftY: number}) => void} config.onResize
 *   live, on every move. `shiftX` is how far the left edge has moved left and
 *   `shiftY` how far the top edge has moved up, in px; each is only ever
 *   non-zero for a floating chat dragged from that edge.
 * @param {(size: {width: number, height: number, shiftX: number, shiftY: number}, start: Rect) => void} config.onCommit
 *   once, on release, and only if the size actually changed. `start` is the
 *   box's rect at the press, so the feature can see which dimension moved.
 * @param {() => void} [config.onCancel]
 *   once, when a gesture ends without a commit.
 */
export function createResizeController({
  doc = globalThis.document,
  getBox,
  getViewport = () => ({ width: doc.defaultView.innerWidth, height: doc.defaultView.innerHeight }),
  onResize,
  onCommit,
  onCancel,
}) {
  let session = null;

  function sizeAt(event) {
    const { direction, start, limits, floating, originX, originY } = session;
    const size = nextSize({
      direction, start, limits,
      dx: event.clientX - originX,
      dy: event.clientY - originY,
    });
    // Against the ROUNDED start size: nextSize rounds, so measuring the
    // growth from a fractional rect would carry half a pixel into the commit.
    const shiftX = floating && direction.includes('w') ? size.width - Math.round(start.width) : 0;
    const shiftY = floating && direction.includes('n') ? size.height - Math.round(start.height) : 0;
    return { ...size, shiftX, shiftY };
  }

  function end(commit) {
    const { live, start, handle } = session;
    doc.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('pointerup', onPointerUp, true);
    doc.removeEventListener('pointercancel', onPointerCancel, true);
    doc.body.removeAttribute(BODY_ATTR);
    if (handle && handle.classList) handle.classList.remove(ACTIVE_CLASS);
    // Cleared before the commit: the commit writes storage, storage notifies
    // the feature, and the feature must then read the stored size, not this one.
    session = null;
    if (!commit) {
      // The feature still shows the live size: tell it to go back to the stored one.
      if (onCancel) onCancel();
      return;
    }
    const changed = live
      && (live.width !== Math.round(start.width) || live.height !== Math.round(start.height));
    if (changed) onCommit(live, start);
  }

  const onPointerMove = (event) => {
    if (!session || event.pointerId !== session.pointerId) return;
    const box = getBox();
    if (!box || !box.isConnected) {
      end(false);
      return;
    }
    if (event.cancelable) event.preventDefault();
    session.live = sizeAt(event);
    onResize(session.live);
  };

  const onPointerUp = (event) => {
    if (session && event.pointerId === session.pointerId) end(true);
  };

  const onPointerCancel = (event) => {
    if (session && event.pointerId === session.pointerId) end(false);
  };

  return {
    /**
     * Begin a gesture from a press on a handle. Left button only. The press is
     * kept from everyone else: the header drag, the header guard, Torn's
     * reorder drag, and text selection.
     * @param {string} direction  see sizing.js
     * @param {PointerEvent} event  the handle's pointerdown
     * @param {{ floating?: boolean }} [options]
     */
    start(direction, event, { floating = false } = {}) {
      if (event.button !== 0 || session) return;
      const box = getBox();
      if (!box) return;
      event.stopPropagation();
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      const start = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      session = {
        direction,
        floating,
        start,
        limits: limitsFor({ direction, start, floating, viewport: getViewport() }),
        originX: event.clientX,
        originY: event.clientY,
        pointerId: event.pointerId,
        handle: event.currentTarget,
        live: null,
      };
      doc.addEventListener('pointermove', onPointerMove, true);
      doc.addEventListener('pointerup', onPointerUp, true);
      doc.addEventListener('pointercancel', onPointerCancel, true);
      doc.body.setAttribute(BODY_ATTR, direction);
      if (session.handle && session.handle.classList) session.handle.classList.add(ACTIVE_CLASS);
      debug('resize start', direction, start);
    },
    /** The size last sent to onResize while a gesture is live, else null. */
    liveSize: () => (session ? session.live : null),
    isActive: () => session !== null,
    /** End a live gesture without committing. */
    cancel() {
      if (session) end(false);
    },
  };
}
