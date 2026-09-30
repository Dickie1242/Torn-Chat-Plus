/**
 * The arithmetic of a resize, and the one place a size is written to a chat
 * box. Better Chat 3.0 showed on the live page that width/height on the box
 * is enough: the box is Torn's flex column of header, messages and input, and
 * Torn's own flex hands the extra height to the message list.
 */

import { WIDGET_SIZE } from '../../core/storage.js';

export const SIZED_CLASS = 'chatplus-sized';
/**
 * Where Torn's own inline size waits while Chat+'s covers it:
 * `data-chatplus-native-width` / `-height` on the box.
 */
export const NATIVE_ATTR_PREFIX = 'data-chatplus-native-';

/**
 * @typedef {{ left: number, top: number, width: number, height: number }} Rect
 * @typedef {{ minWidth: number, maxWidth: number, minHeight: number, maxHeight: number }} Limits
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * How far one gesture may go. A docked chat is pinned to the bottom right of
 * the screen, so it may grow up to the viewport height and - from its left
 * edge - leftward to the screen's edge. A floating chat is pinned by its
 * top-left corner: it may grow down and right to the viewport edges, and from
 * its top or left edge up to the top or left of the screen.
 * @param {{ direction: string, start: Rect, floating: boolean, viewport: {width: number, height: number} }} args
 * @returns {Limits}
 */
export function limitsFor({ direction, start, floating, viewport }) {
  const { minWidth, minHeight } = WIDGET_SIZE;
  let maxHeight = viewport.height;
  let maxWidth = start.width;
  if (floating) {
    maxHeight = direction.includes('n') ? start.top + start.height : viewport.height - start.top;
    maxWidth = viewport.width - start.left;
  }
  // From its left edge a chat grows toward the screen's left edge, docked or not.
  if (direction.includes('w')) maxWidth = start.left + start.width;
  return {
    minWidth,
    maxWidth: Math.max(minWidth, maxWidth),
    minHeight,
    maxHeight: Math.max(minHeight, maxHeight),
  };
}

/**
 * The size a gesture asks for. `direction` names the edges being dragged:
 * 'n' (top edge, grows upward), 's' (bottom edge), 'e' (right edge), 'w' (left
 * edge, grows leftward); a corner is two letters, e.g. 'se' or 'nw'. `dx`/`dy`
 * are the pointer's travel since the press.
 * @param {{ direction: string, start: Rect, dx: number, dy: number, limits: Limits }} args
 * @returns {{ width: number, height: number }}
 */
export function nextSize({ direction, start, dx, dy, limits }) {
  let { width, height } = start;
  if (direction.includes('e')) width = clamp(start.width + dx, limits.minWidth, limits.maxWidth);
  if (direction.includes('w')) width = clamp(start.width - dx, limits.minWidth, limits.maxWidth);
  if (direction.includes('s')) height = clamp(start.height + dy, limits.minHeight, limits.maxHeight);
  if (direction.includes('n')) height = clamp(start.height - dy, limits.minHeight, limits.maxHeight);
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Since 2026-09-30 Torn puts its own size inline on the chat box (`width:
 * 300px; height: 400px`, not !important). Ours is always !important, so an
 * inline value without the priority is Torn's, and handing a dimension back
 * leaves it alone. Before ours first covers Torn's, Torn's is kept in a data
 * attribute, and handing the dimension back puts it back: React only
 * re-writes a style prop when its own value changes, so it would leave the
 * box with no size at all.
 */
function setPx(box, prop, value) {
  const current = box.style.getPropertyValue(prop);
  const ours = current !== '' && box.style.getPropertyPriority(prop) === 'important';
  const memo = NATIVE_ATTR_PREFIX + prop;
  if (value == null) {
    if (ours) {
      const native = box.getAttribute(memo);
      if (native) box.style.setProperty(prop, native);
      else box.style.removeProperty(prop);
    }
    // Also when Torn has since written a size over ours: that one stands.
    if (box.hasAttribute(memo)) box.removeAttribute(memo);
    return;
  }
  const next = `${value}px`;
  if (current === next && ours) return;
  if (current !== '' && !ours) box.setAttribute(memo, current);
  box.style.setProperty(prop, next, 'important');
}

/**
 * Size a chat box. `null` for a dimension hands it back to Torn. Inline and
 * !important so it beats Torn's stylesheet and Torn's own inline size. Writes
 * nothing that is already there, so an observer watching the box can never
 * loop on us.
 * @param {Element} box
 * @param {{ width: number|null, height: number|null }} size
 */
export function applySize(box, { width, height }) {
  setPx(box, 'width', width);
  setPx(box, 'height', height);
  const sized = width != null || height != null;
  if (sized !== box.classList.contains(SIZED_CLASS)) box.classList.toggle(SIZED_CLASS, sized);
}
