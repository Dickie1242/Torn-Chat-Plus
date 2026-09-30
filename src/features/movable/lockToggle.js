/** The per-widget padlock button that lives in the chat header. */

const SVG_NS = 'http://www.w3.org/2000/svg';

export const LOCK_CLASS = 'chatplus-lock';
export const UNLOCKED_CLASS = 'chatplus-lock--unlocked';
export const LOCK_ATTR = 'data-chatplus-lock';

/** Closed shackle: both legs reach down into the body. */
export const SHACKLE_LOCKED = 'M8 10V7a4 4 0 0 1 8 0v3';
/** Open shackle: the right leg stays up. */
export const SHACKLE_UNLOCKED = 'M8 10V7a4 4 0 0 1 8 0';

export const TITLE_LOCKED = 'Locked — click to unlock and drag by the header. Right-click for Chat+ settings.';
export const TITLE_UNLOCKED = 'Unlocked — drag by the header. Click to lock. Right-click for Chat+ settings.';

/**
 * @param {Object} config
 * @param {{id: string, box: Element}} config.widget
 * @param {typeof import('../../core/selectors.js')} config.selectors
 * @param {() => boolean} config.isLocked
 * @param {(locked: boolean) => void} config.onToggle
 * @param {(anchor: Element) => void} config.onMenu  opens the Chat+ menu under the padlock
 */
export function createLockToggle({ widget, selectors, isLocked, onToggle, onMenu }) {
  const doc = widget.box.ownerDocument;
  let element = null;

  // The click writes state and stops there: the storage notify path runs
  // applyState for every widget, which syncs this padlock back to the DOM.
  function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (onToggle) onToggle(!isLocked());
  }

  // The browser's own menu on a 24px icon is worth nothing; the Chat+ settings
  // are. Returning a chat to the row lives on the arrow button next door.
  function handleContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    if (onMenu) onMenu(element);
  }

  function build() {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('aria-label', 'Chat+ lock');
    svg.setAttribute(LOCK_ATTR, '1');
    svg.classList.add(LOCK_CLASS);
    svg.innerHTML = [
      '<title></title>',
      '<rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"></rect>',
      `<path fill="none" stroke="currentColor" stroke-width="2" d="${SHACKLE_LOCKED}"></path>`,
    ].join('');
    svg.addEventListener('click', handleClick);
    svg.addEventListener('contextmenu', handleContextMenu);
    return svg;
  }

  /** Push the current lock state into the rendered padlock. */
  function sync() {
    if (!element) return;
    const locked = !!isLocked();
    const titleText = locked ? TITLE_LOCKED : TITLE_UNLOCKED;
    element.setAttribute('title', titleText);
    element.setAttribute('aria-pressed', String(locked));
    const titleNode = element.querySelector('title');
    if (titleNode) titleNode.textContent = titleText;
    const path = element.querySelector('path');
    if (path) path.setAttribute('d', locked ? SHACKLE_LOCKED : SHACKLE_UNLOCKED);
    if (locked) element.classList.remove(UNLOCKED_CLASS);
    else element.classList.add(UNLOCKED_CLASS);
  }

  /** @returns {Element|null} the padlock, or null if the header has no Minimize button. */
  function mount() {
    if (element && element.isConnected) {
      sync();
      return element;
    }
    const minimize = selectors.minimizeButtonOf(widget.box);
    if (!minimize || !minimize.parentNode) return null;
    for (const stale of widget.box.querySelectorAll(`[${LOCK_ATTR}]`)) stale.remove();
    element = build();
    minimize.parentNode.insertBefore(element, minimize);
    sync();
    return element;
  }

  function unmount() {
    if (!element) return;
    element.removeEventListener('click', handleClick);
    element.removeEventListener('contextmenu', handleContextMenu);
    element.remove();
    element = null;
  }

  return { mount, unmount, sync };
}
