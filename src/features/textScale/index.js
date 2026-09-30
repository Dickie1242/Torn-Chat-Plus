/**
 * Message size: one scale per chat for its messages and its input, adjusted
 * from the Chat+ menu for the chat whose padlock opened it. A chat with no
 * size of its own uses the `messageScale` setting, the value that used to be
 * shared by every chat. Every direct child of a chat box but the one holding
 * its header is scaled, so Torn's bottom row - and the padlock in it - stays
 * exactly as it is. Why the scaling is a `zoom`: see src/styles.css.
 */

import { safe } from '../../core/log.js';
import { SETTINGS } from '../../core/storage.js';
import { createScaleControl } from './control.js';
import { scaleOf } from './scale.js';
import { HANDLE_ATTR } from '../resize/handles.js';

export const SETTING_NAME = 'messageScale';
export const SCALED_CLASS = 'chatplus-scaled';
export const SCALE_VAR = '--chatplus-scale';

/**
 * Writes nothing a child already says, which is what keeps watchBox below
 * from re-triggering itself.
 * @param {{box: Element, header: Element}} widget
 */
function applyScale(widget, percent) {
  const { box, header } = widget;
  for (const child of box.children) {
    // The header, or since 2026-09-30 the div Torn wraps it in, keeps its size.
    // Our own resize handles sit in the box too; they must keep theirs.
    if (child.contains(header) || child.hasAttribute(HANDLE_ATTR)) continue;
    if (!child.classList.contains(SCALED_CLASS)) child.classList.add(SCALED_CLASS);
  }
  // At 100% the property goes and the stylesheet falls back to zoom: 1, so a
  // chat looks exactly as it would with Chat+ uninstalled.
  if (percent === 100) box.style.removeProperty(SCALE_VAR);
  else box.style.setProperty(SCALE_VAR, String(percent / 100));
}

/**
 * Re-apply the scale whenever a chat box gains a child (Torn's message and
 * input areas are React-rendered, and can arrive after Chat+ first sees the
 * box) or a scaled child has its className rewritten from under our class.
 * @param {Element} box
 * @param {() => void} reapply
 * @returns {() => void} stop watching.
 */
function watchBox(box, reapply) {
  const MO = globalThis.MutationObserver;
  if (!box || typeof MO !== 'function') return () => {};
  const observer = new MO(safe('textScale.watchBox', () => {
    reapply();
    watchChildren();
  }));
  /** Re-observing a node replaces its registration, so this cannot stack up. */
  function watchChildren() {
    for (const child of box.children) {
      observer.observe(child, { attributes: true, attributeFilter: ['class'] });
    }
  }
  observer.observe(box, { childList: true });
  watchChildren();
  return () => observer.disconnect();
}

export function createTextScaleFeature() {
  /** @type {Map<string, {widget: {box: Element, header: Element}, unwatch: () => void}>} */
  const entries = new Map();
  let ctx = null;
  let control = null;
  let currentId = null; // the chat whose padlock opened the menu

  function applyAll() {
    for (const entry of entries.values()) {
      applyScale(entry.widget, scaleOf(ctx.storage, entry.widget.id));
    }
    if (control && currentId) control.sync(scaleOf(ctx.storage, currentId));
  }

  function init(context) {
    ctx = context;
    // Fires for local writes AND for the cross-tab 'storage' event.
    ctx.storage.subscribe(applyAll);
    control = createScaleControl({
      range: SETTINGS[SETTING_NAME],
      getScale: () => scaleOf(ctx.storage, currentId),
      setScale: (percent) => {
        if (currentId) ctx.storage.setWidget(currentId, { scale: percent });
      },
    });
    control.render(ctx.menu.addRow());
    // The menu is one popover for every chat: learn which chat it is about on
    // each open, so the row reads and writes that one.
    ctx.menu.onOpen((anchor) => {
      currentId = ctx.selectors.chatIdOf(ctx.selectors.boxOf(anchor));
      control.sync(scaleOf(ctx.storage, currentId));
    });
  }

  function dropEntry(id) {
    const entry = entries.get(id);
    if (!entry) return;
    entry.unwatch();
    entries.delete(id);
  }

  function onWidgetAdded(widget, context) {
    ctx = context;
    // Torn re-rendered this chat: the watcher on file belongs to the old nodes.
    dropEntry(widget.id);
    entries.set(widget.id, {
      widget,
      unwatch: watchBox(widget.box, () => applyScale(widget, scaleOf(ctx.storage, widget.id))),
    });
    applyScale(widget, scaleOf(ctx.storage, widget.id));
  }

  function onWidgetRemoved(widget) {
    // Torn swaps nodes under a live id, and adds are reported before removes:
    // only drop the record if it is still the one this removal is about.
    const entry = entries.get(widget.id);
    if (entry && entry.widget === widget) dropEntry(widget.id);
  }

  return { id: 'textScale', init, onWidgetAdded, onWidgetRemoved };
}
