/**
 * The Chat+ settings menu: one small popover, shared by every feature.
 *
 * Features take a row with `addRow()` and fill it; the menu is opened from
 * whatever offers it (today: a right-click on a chat's padlock) and anchored
 * to that element. A row that is about the chat it was opened from asks
 * `onOpen()` which element that was.
 *
 * It lives on document.body, not inside a chat box, so no header guard, drag
 * or overflow can touch it - and a press inside it is stopped, so it never
 * reaches Torn either.
 */

export const MENU_CLASS = 'chatplus-menu';
export const MENU_ROW_CLASS = 'chatplus-menu__row';

/** Gap in px between the anchor and the menu. */
const ANCHOR_GAP = 4;

export function createMenu({ doc = globalThis.document } = {}) {
  let element = null;
  let anchor = null;
  // What the document listeners are keyed on, rather than the element being in
  // the document: if anything else detaches it, close() must still take them
  // back off - a leaked capture listener would go on eating presses forever.
  let armed = false;
  const openListeners = new Set();

  function ensureElement() {
    if (element) return element;
    element = doc.createElement('div');
    element.className = MENU_CLASS;
    element.setAttribute('role', 'menu');
    // Capture: a press on a menu control is the menu's business and nobody
    // else's - least of all Torn's chat handlers.
    element.addEventListener('pointerdown', (event) => event.stopPropagation(), true);
    return element;
  }

  const onPointerDown = (event) => {
    // A press on the anchor belongs to the anchor: it is what toggles the menu
    // shut, and closing here first would just let it re-open.
    if (element.contains(event.target)) return;
    if (anchor && anchor.contains(event.target)) return;
    close();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') close();
  };

  /** Just below the anchor, or just above it, kept inside the viewport. */
  function position() {
    const rect = anchor.getBoundingClientRect();
    const view = doc.defaultView;
    const { width, height } = element.getBoundingClientRect();
    const left = Math.max(ANCHOR_GAP, Math.min(rect.left, view.innerWidth - width - ANCHOR_GAP));
    // A chat collapsed onto Torn's bottom bar has its padlock at the very edge
    // of the screen, with no room underneath: flip to the other side of it
    // rather than hang the menu off the bottom of the viewport.
    const below = rect.bottom + ANCHOR_GAP;
    const top = below + height > view.innerHeight ? rect.top - ANCHOR_GAP - height : below;
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  }

  function open(nextAnchor) {
    anchor = nextAnchor;
    doc.body.appendChild(ensureElement());
    position();
    if (!armed) {
      doc.addEventListener('pointerdown', onPointerDown, true);
      doc.addEventListener('keydown', onKeyDown, true);
      armed = true;
    }
    // Rows that show something about the anchored chat refresh here - even
    // when the menu was already open and has just been re-anchored.
    for (const listener of [...openListeners]) listener(anchor);
  }

  function close() {
    if (!armed) return;
    armed = false;
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    element.remove();
    anchor = null;
  }

  function isOpen() {
    return armed;
  }

  return {
    /**
     * A row for the caller to fill. It is built once and lives on in the
     * reused menu element.
     * @returns {Element}
     */
    addRow() {
      const row = doc.createElement('div');
      row.className = MENU_ROW_CLASS;
      ensureElement().appendChild(row);
      return row;
    },
    /**
     * Hear every open, with the element the menu is anchored to. A row that
     * is about "the chat this menu was opened from" learns which one here.
     * @param {(anchor: Element) => void} listener
     * @returns {() => void} unsubscribe
     */
    onOpen(listener) {
      openListeners.add(listener);
      return () => openListeners.delete(listener);
    },
    open,
    close,
    isOpen,
    /** Open anchored to `nextAnchor`, or close if it is already showing. */
    toggle(nextAnchor) {
      if (isOpen()) close();
      else open(nextAnchor);
    },
  };
}
