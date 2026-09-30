/**
 * The resize handles: invisible strips and corners on a chat box. Every
 * unlocked chat gets the top strip (height) and a top-left corner that sizes
 * width and height together - one grip for both, the user's choice over a
 * left-edge strip. A floating chat, pinned by its top-left corner rather than
 * by Torn's row, also grows from its bottom edge and bottom-right corner. No
 * handle sits on the right edge: the message list's scrollbar and Torn's close
 * icon live there.
 */

export const HANDLE_ATTR = 'data-chatplus-resize';
export const HANDLE_CLASS = 'chatplus-handle';
export const ACTIVE_CLASS = 'chatplus-handle--active';
/** On the box while handles are mounted: makes it the handles' containing block. */
export const RESIZABLE_CLASS = 'chatplus-resizable';

/**
 * Which edges a chat may be dragged from right now.
 * @param {{ locked: boolean, floating: boolean }} state
 * @returns {string[]} directions, see sizing.js for the letters
 */
export function directionsFor({ locked, floating }) {
  if (locked) return [];
  return floating ? ['n', 'nw', 's', 'se'] : ['n', 'nw'];
}

function handlesOf(box) {
  return [...box.children].filter((el) => el.hasAttribute(HANDLE_ATTR));
}

/** @returns {string[]} the directions currently mounted, in DOM order. */
export function mountedDirections(box) {
  return handlesOf(box).map((el) => el.getAttribute(HANDLE_ATTR));
}

/**
 * Put exactly `directions` handles on the box. A no-op when they are already
 * there, so a re-apply never rebuilds them - and never wakes the textScale
 * child observer for nothing.
 * @param {Element} box
 * @param {string[]} directions
 * @param {(direction: string, event: PointerEvent) => void} onPress
 */
export function mountHandles(box, directions, onPress) {
  const current = mountedDirections(box);
  if (current.length === directions.length && current.every((d, i) => d === directions[i])) return;
  unmountHandles(box);
  const doc = box.ownerDocument;
  for (const direction of directions) {
    const handle = doc.createElement('div');
    handle.className = `${HANDLE_CLASS} ${HANDLE_CLASS}--${direction}`;
    handle.setAttribute(HANDLE_ATTR, direction);
    handle.addEventListener('pointerdown', (event) => onPress(direction, event));
    box.appendChild(handle);
  }
  if (directions.length) box.classList.add(RESIZABLE_CLASS);
}

/** Take every handle off the box. Torn's own children are never touched. */
export function unmountHandles(box) {
  for (const handle of handlesOf(box)) handle.remove();
  box.classList.remove(RESIZABLE_CLASS);
}
