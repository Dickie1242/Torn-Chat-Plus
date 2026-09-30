/**
 * Header controls: the padlock menu's two actions - message size and widget
 * size reset - inline in a chat's header once the chat is wide enough to
 * hold them, so the player adjusts a chat while looking at it. The menu
 * stays for narrow chats.
 */

import { safe } from '../../core/log.js';
import { SETTINGS } from '../../core/storage.js';
import { createScaleControl } from '../textScale/control.js';
import { scaleOf } from '../textScale/scale.js';
import { createResetControl } from '../resize/resetControl.js';
import { LOCK_ATTR } from '../movable/lockToggle.js';
import { RESET_CLASS } from '../movable/resetButton.js';

/** Torn's box is 300 px (270 px before 2026-09-30); the strip needs about 150 px next to the title. */
export const HEADER_CONTROLS_MIN_WIDTH = 400;
export const CONTROLS_CLASS = 'chatplus-header-controls';
export const HIDDEN_CLASS = 'chatplus-header-controls--hidden';
export const CONTROLS_ATTR = 'data-chatplus-controls';

/** The resize feature writes a chat's live width on the box's inline style. */
function watchBoxStyle(box, onChange) {
  const MO = globalThis.MutationObserver;
  if (!box || typeof MO !== 'function') return () => {};
  const observer = new MO(onChange);
  observer.observe(box, { attributes: true, attributeFilter: ['style'] });
  return () => observer.disconnect();
}

export function createHeaderControlsFeature() {
  /** @type {Map<string, {widget, container: Element, scale, reset, unwatch: () => void}>} */
  const entries = new Map();
  let ctx = null;

  function mount(widget) {
    const { header, id } = widget;
    for (const stale of header.querySelectorAll(`[${CONTROLS_ATTR}]`)) stale.remove();
    const doc = header.ownerDocument;
    const container = doc.createElement('span');
    container.className = CONTROLS_CLASS;
    container.setAttribute(CONTROLS_ATTR, '1');
    const scale = createScaleControl({
      range: SETTINGS.messageScale,
      compact: true,
      getScale: () => scaleOf(ctx.storage, id),
      setScale: (percent) => ctx.storage.setWidget(id, { scale: percent }),
    });
    scale.render(container);
    const reset = createResetControl({ storage: ctx.storage, getChatId: () => id, doc });
    container.appendChild(reset.element);
    // Left of both header buttons. Movable runs first, so a chat restored at a
    // stored position already carries its return arrow; a chat that starts
    // docked grows one later, before the padlock. Anchoring on the arrow when
    // there is one keeps the order strip, arrow, padlock either way.
    const anchor = header.querySelector(`.${RESET_CLASS}`) || header.querySelector(`[${LOCK_ATTR}]`);
    if (anchor) anchor.parentNode.insertBefore(container, anchor);
    else header.appendChild(container);
    return { container, scale, reset };
  }

  function sync(entry) {
    const { widget, container, scale, reset } = entry;
    const wide = widget.box.getBoundingClientRect().width >= HEADER_CONTROLS_MIN_WIDTH;
    container.classList.toggle(HIDDEN_CLASS, !wide);
    scale.sync(scaleOf(ctx.storage, widget.id));
    reset.sync();
  }

  function syncAll() {
    for (const entry of entries.values()) sync(entry);
  }

  function dropEntry(id) {
    const entry = entries.get(id);
    if (!entry) return;
    entry.unwatch();
    entry.container.remove();
    entries.delete(id);
  }

  function init(context) {
    ctx = context;
    // Fires for local writes AND for the cross-tab 'storage' event.
    ctx.storage.subscribe(syncAll);
    // A viewport resize or a Torn re-layout changes the width the box measures
    // without writing its inline style, so the box observer never hears of it.
    globalThis.window.addEventListener('resize', safe('headerControls.resize', syncAll));
  }

  function onWidgetAdded(widget, context) {
    ctx = context;
    // Torn re-rendered this chat: the strip on file belongs to the old header.
    dropEntry(widget.id);
    const entry = { widget, ...mount(widget), unwatch: () => {} };
    entry.unwatch = watchBoxStyle(widget.box, safe('headerControls.box', () => sync(entry)));
    entries.set(widget.id, entry);
    sync(entry);
  }

  function onWidgetRemoved(widget) {
    // Adds are reported before removes: only drop the record if it is still
    // the one this removal is about.
    const entry = entries.get(widget.id);
    if (entry && entry.widget === widget) dropEntry(widget.id);
  }

  return { id: 'headerControls', init, onWidgetAdded, onWidgetRemoved };
}
