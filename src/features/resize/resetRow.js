/**
 * The "Widget size · Reset" row of the Chat+ menu: a label and the shared
 * Reset control. The menu is one popover shared by every chat, so the row
 * learns which chat it is about each time the menu opens: from the padlock
 * that opened it - exactly as the Message size row above it does.
 */

import { createResetControl } from './resetControl.js';

export const LABEL_TEXT = 'Widget size';
export { RESET_LABEL, RESET_ARIA_LABEL, BUTTON_CLASS } from './resetControl.js';

/**
 * @param {Object} config
 * @param {Element} config.row  the menu row to fill
 * @param {{ onOpen: Function, close: Function }} config.menu
 * @param {{ getWidget: Function, setWidget: Function }} config.storage
 * @param {{ boxOf: Function, chatIdOf: Function }} config.selectors
 * @returns {{ sync: () => void, destroy: () => void }}
 */
export function createResetRow({ row, menu, storage, selectors }) {
  const doc = row.ownerDocument;
  let chatId = null;

  const label = doc.createElement('span');
  label.className = 'chatplus-menu__label';
  label.textContent = LABEL_TEXT;

  const control = createResetControl({
    storage,
    getChatId: () => chatId,
    onReset: () => menu.close(),
    doc,
  });
  row.append(label, control.element);

  const unsubscribe = menu.onOpen((anchor) => {
    chatId = selectors.chatIdOf(selectors.boxOf(anchor));
    control.sync();
  });

  return { sync: control.sync, destroy: unsubscribe };
}
