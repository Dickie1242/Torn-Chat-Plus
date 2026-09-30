/**
 * The per-widget "return to row" arrow, shown in the chat header only while the
 * widget is parked at a position of its own. Clicking it drops that position,
 * so Torn's row takes the widget back. The lock is left alone.
 *
 * Right-clicking the padlock does the same thing, but nothing in the header
 * says so; this button is the discoverable way to undo a move.
 */

import { LOCK_ATTR } from './lockToggle.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const RESET_CLASS = 'chatplus-reset';
export const RESET_LABEL = 'Chat+ return to row';
export const RESET_TITLE = "Return this chat to Torn's row";

/** A left arrow into a shaft that turns up: the return-key glyph. */
export const RESET_PATH = 'M9 8 5 12l4 4M5 12h9a4 4 0 0 0 4-4V6';

/**
 * @param {Object} config
 * @param {{id: string, box: Element}} config.widget
 * @param {() => void} config.onReset
 */
export function createResetButton({ widget, onReset }) {
  const doc = widget.box.ownerDocument;
  let element = null;

  function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (onReset) onReset();
  }

  function mount() {
    // The padlock is mounted first, so this lands immediately before it. No
    // padlock means the header had no Minimize button to mount against either,
    // so there is nowhere to put this one.
    const anchor = widget.box.querySelector(`[${LOCK_ATTR}]`);
    if (!anchor || !anchor.parentNode) return null;
    for (const stale of widget.box.querySelectorAll(`.${RESET_CLASS}`)) stale.remove();

    element = doc.createElementNS(SVG_NS, 'svg');
    element.setAttribute('viewBox', '0 0 24 24');
    element.setAttribute('width', '24');
    element.setAttribute('height', '24');
    element.setAttribute('aria-label', RESET_LABEL);
    element.setAttribute('title', RESET_TITLE);
    element.classList.add(RESET_CLASS);
    element.innerHTML = `<title>${RESET_TITLE}</title>`
      + `<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"`
      + ` stroke-linejoin="round" d="${RESET_PATH}"></path>`;
    element.addEventListener('click', handleClick);
    anchor.parentNode.insertBefore(element, anchor);
    return element;
  }

  function unmount() {
    if (!element) return;
    element.removeEventListener('click', handleClick);
    element.remove();
    element = null;
  }

  return {
    /**
     * Show the button exactly while the widget has a position of its own.
     * @param {boolean} show
     * @returns {Element|null} the button, or null while it is not shown.
     */
    sync(show) {
      if (!show) {
        unmount();
        return null;
      }
      if (element && element.isConnected) return element;
      unmount();
      return mount();
    },
    unmount,
  };
}
