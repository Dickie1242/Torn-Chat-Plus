/**
 * The Reset button that returns one chat to Torn's size. Used by the menu
 * row (which learns its chat from the padlock that opened the menu) and by
 * the header strip (bound to its own chat).
 */

export const RESET_LABEL = 'Reset';
export const RESET_ARIA_LABEL = "Chat+ reset this chat to Torn's size";
export const BUTTON_CLASS = 'chatplus-menu__button';

/**
 * @param {Object} config
 * @param {{ getWidget: Function, setWidget: Function }} config.storage
 * @param {() => string|null} config.getChatId  the chat the button is about right now
 * @param {() => void} [config.onReset]  after a reset was written
 * @param {Document} [config.doc]
 * @returns {{ element: HTMLButtonElement, sync: () => void }}
 */
export function createResetControl({ storage, getChatId, onReset, doc = globalThis.document }) {
  const element = doc.createElement('button');
  element.type = 'button';
  element.className = BUTTON_CLASS;
  element.textContent = RESET_LABEL;
  element.setAttribute('aria-label', RESET_ARIA_LABEL);
  element.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const chatId = getChatId();
    if (!chatId) return;
    storage.setWidget(chatId, { width: null, height: null });
    if (onReset) onReset();
  });

  /** Enabled only when the chat has a size to reset. */
  function sync() {
    const chatId = getChatId();
    const state = chatId ? storage.getWidget(chatId) : null;
    element.disabled = !state || (state.width === null && state.height === null);
  }

  return { element, sync };
}
