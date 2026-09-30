import { debug, tagOf } from '../../core/log.js';
import { clampPosition } from './geometry.js';

/** Movement must EXCEED this many pixels before a click becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;

export const DRAGGABLE_CLASS = 'chatplus-draggable';
export const DRAGGING_CLASS = 'chatplus-dragging';
export const GRABBING_CLASS = 'chatplus-grabbing';

/**
 * One pointer drag of a widget's wrapper, by its header. The WHOLE header is
 * the handle: a press anywhere in it - Torn's header button, the Minimize and
 * Close icons, the Chat+ padlock and return arrow - opens a candidate drag, and
 * only movement past the threshold turns that into a real one, so every header
 * control still acts on a press released in place. Holding Torn's own reorder
 * drag off the header is headerGuard.js's job, not this module's.
 *
 * @param {Object} config
 * @param {{id: string, wrapper: Element, header: Element}} config.widget
 * @param {(x: number, y: number) => void} [config.onMove]   called every frame of the drag
 * @param {(x: number, y: number) => void} [config.onCommit] called on pointerup/pointercancel
 * @param {() => boolean} [config.isLocked]   locked widgets do not drag
 * @param {() => {width: number, height: number}} [config.getViewport]
 */
export function createDragController({
  widget,
  onMove,
  onCommit,
  isLocked = () => false,
  getViewport,
}) {
  const { header, wrapper } = widget;
  const doc = header.ownerDocument;
  const readViewport = getViewport || (() => ({
    width: doc.defaultView.innerWidth,
    height: doc.defaultView.innerHeight,
  }));

  let enabled = false;
  let session = null;

  function attachSessionListeners() {
    doc.addEventListener('pointermove', onPointerMove, true);
    doc.addEventListener('pointerup', onPointerEnd, true);
    doc.addEventListener('pointercancel', onPointerEnd, true);
  }

  function detachSessionListeners() {
    doc.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('pointerup', onPointerEnd, true);
    doc.removeEventListener('pointercancel', onPointerEnd, true);
  }

  /** Promote the candidate gesture to a real drag: capture the pointer, show it. */
  function beginDrag() {
    session.dragging = true;
    if (typeof header.setPointerCapture === 'function') {
      try {
        header.setPointerCapture(session.pointerId);
        session.captured = true;
      } catch { /* the document listeners carry the drag either way */ }
    }
    wrapper.classList.add(DRAGGING_CLASS);
    doc.body?.classList.add(GRABBING_CLASS);
  }

  /**
   * Tear a session down from anywhere - pointerup, pointercancel or disable()
   * mid-drag - so the header never keeps a stale pointer capture.
   */
  function endSession() {
    if (!session) return;
    const { captured, pointerId } = session;
    session = null;
    detachSessionListeners();
    if (captured && typeof header.releasePointerCapture === 'function') {
      try { header.releasePointerCapture(pointerId); } catch { /* not fatal */ }
    }
    wrapper.classList.remove(DRAGGING_CLASS);
    doc.body?.classList.remove(GRABBING_CLASS);
  }

  /** Is this event part of the session's gesture? */
  function isOurPointer(event) {
    return event.pointerId === session.pointerId;
  }

  function onPointerDown(event) {
    if (!enabled || session || isLocked()) return;
    if (typeof event.button === 'number' && event.button !== 0) return;

    const rect = wrapper.getBoundingClientRect();
    session = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      width: rect.width,
      height: rect.height,
      dragging: false,
      captured: false,
      x: rect.left,
      y: rect.top,
    };
    debug('drag start', widget.id, 'header', tagOf(header), 'wrapper', tagOf(wrapper),
      'origin', rect.left, rect.top, 'size', rect.width, rect.height);
    attachSessionListeners();
  }

  function onPointerMove(event) {
    if (!session || !isOurPointer(event)) return;

    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;

    if (!session.dragging) {
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
      beginDrag();
      debug('drag threshold crossed', widget.id, 'dx', dx, 'dy', dy, 'captured', session.captured);
    }

    const viewport = readViewport();
    const next = clampPosition({
      x: session.originX + dx,
      y: session.originY + dy,
      width: session.width,
      height: session.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    session.x = next.x;
    session.y = next.y;
    if (event.cancelable) event.preventDefault();
    if (onMove) onMove(next.x, next.y);
  }

  function onPointerEnd(event) {
    if (!session || !isOurPointer(event)) return;
    const { dragging, x, y } = session;
    endSession();
    if (dragging && onCommit) onCommit(x, y);
  }

  return {
    /**
     * Attach the header listener. Safe to call again when the lock state
     * changes: only the grab cursor, which belongs to a header that can
     * actually be dragged, is re-synced.
     */
    enable() {
      if (!enabled) {
        enabled = true;
        // Capture, not bubble: the header guard stops presses at the header,
        // and a stopped event never comes back up to a bubble listener.
        header.addEventListener('pointerdown', onPointerDown, true);
      }
      if (isLocked()) header.classList.remove(DRAGGABLE_CLASS);
      else header.classList.add(DRAGGABLE_CLASS);
    },

    disable() {
      if (!enabled) return;
      enabled = false;
      header.classList.remove(DRAGGABLE_CLASS);
      header.removeEventListener('pointerdown', onPointerDown, true);
      endSession();
    },

    /**
     * Where the pointer is holding this widget right now, or null when no real
     * drag is running. While a gesture is in flight this - not storage - is the
     * truth: nothing has been committed yet, so storage still describes where
     * the widget used to be.
     * @returns {{x: number, y: number}|null}
     */
    livePosition() {
      return session && session.dragging ? { x: session.x, y: session.y } : null;
    },

    /**
     * Torn can rebuild a widget's nodes in the middle of a gesture. Export the
     * live drag from the controller bound to the dead nodes...
     * @returns {object|null} null when there is no real drag to hand over.
     */
    exportSession() {
      return session && session.dragging ? { ...session } : null;
    },

    /**
     * ...and adopt it on the controller bound to the replacements, so the
     * user's drag never notices the swap. The pointer listeners live on the
     * document, so only the capture and the visual state have to be re-made.
     * @returns {boolean} true if the session was taken on.
     */
    adoptSession(state) {
      if (!state || session) return false;
      session = { ...state, dragging: false, captured: false };
      attachSessionListeners();
      beginDrag();
      debug('drag adopted', widget.id, 'header', tagOf(header), 'wrapper', tagOf(wrapper),
        'at', session.x, session.y);
      return true;
    },
  };
}
