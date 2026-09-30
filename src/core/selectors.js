/**
 * The ONLY module that knows Torn Chat 3.0's DOM shape.
 * If Torn changes its markup, this is the one file to edit.
 *
 * Hashed CSS-module class names (e.g. root___FmdS_) must never appear here:
 * they change between Torn builds.
 */

export const MINIMIZE_SELECTOR = 'svg[aria-label="Minimize"]';
/**
 * A chat box is the nearest id-bearing div around its Minimize icon. Its id
 * used to contain a `-`; since Torn's 2026-09-30 update it is bare
 * (`1234567`, `faction`). Nothing between the icon and the box carries an id.
 */
export const CHAT_BOX_SELECTOR = 'div[id]';
/** The container of every chat. Nearest to an icon, it means the icon is in no chat. */
export const CHAT_ROOT_ID = 'chatRoot';

/** @typedef {{ prop: 'right'|'left'|'transform', value: number }} NaturalOffset */

/**
 * The nearest id-bearing div around an element, unless that is #chatRoot:
 * the walk never goes past it, because what sits above #chatRoot is not chat.
 * @returns {Element|null}
 */
function nearestBox(element) {
  const box = element && typeof element.closest === 'function'
    ? element.closest(CHAT_BOX_SELECTOR)
    : null;
  return box && box.id && box.id !== CHAT_ROOT_ID ? box : null;
}

/**
 * Every chat box currently in the DOM, in document order, deduped.
 * @param {Document|Element} [root]
 * @returns {Element[]}
 */
export function findChatBoxes(root) {
  const scope = root && typeof root.querySelectorAll === 'function' ? root : globalThis.document;
  if (!scope) return [];
  const boxes = [];
  const seen = new Set();
  for (const icon of scope.querySelectorAll(MINIMIZE_SELECTOR)) {
    const box = nearestBox(icon);
    if (!box || seen.has(box)) continue;
    seen.add(box);
    boxes.push(box);
  }
  return boxes;
}

/** @returns {string|null} */
export function chatIdOf(box) {
  return box && box.id ? box.id : null;
}

/**
 * The chat box an element sits in (a padlock, a resize handle, anything of
 * ours mounted inside a chat), or null. The same rule findChatBoxes uses.
 * @returns {Element|null}
 */
export function boxOf(element) {
  return nearestBox(element);
}

/**
 * The element Torn positions in the bottom row: two levels above the chat box.
 * @returns {Element|null}
 */
export function wrapperOf(box) {
  const middle = box && box.parentElement;
  return (middle && middle.parentElement) || null;
}

/** @returns {Element|null} */
export function minimizeButtonOf(box) {
  return box ? box.querySelector(MINIMIZE_SELECTOR) : null;
}

/**
 * The header bar: Torn's header <button>, the one that holds the Minimize icon
 * and that Torn's own reorder drag starts from. Since 2026-09-30 it sits in a
 * div of its own rather than straight in the chat box. With no such button,
 * the direct child of the box that contains the Minimize icon.
 * @returns {Element|null}
 */
export function headerOf(box) {
  const icon = minimizeButtonOf(box);
  if (!icon) return null;
  const button = icon.closest('button');
  if (button && box.contains(button)) return button;
  let node = icon;
  while (node.parentElement && node.parentElement !== box) node = node.parentElement;
  return node.parentElement === box ? node : null;
}

/**
 * Which inline property Torn used to place this wrapper, and its value in px.
 * Reads the inline style only: our floating override lives in a stylesheet class,
 * so the native slot stays readable even while a widget floats.
 * @returns {NaturalOffset|null}
 */
export function naturalOffsetOf(wrapper) {
  if (!wrapper || !wrapper.style) return null;

  const right = parseFloat(wrapper.style.right);
  if (wrapper.style.right && Number.isFinite(right)) return { prop: 'right', value: right };

  const left = parseFloat(wrapper.style.left);
  if (wrapper.style.left && Number.isFinite(left)) return { prop: 'left', value: left };

  const match = /translateX\(\s*(-?[\d.]+)px\s*\)/.exec(wrapper.style.transform || '');
  if (match) {
    const value = parseFloat(match[1]);
    if (Number.isFinite(value)) return { prop: 'transform', value };
  }
  return null;
}
