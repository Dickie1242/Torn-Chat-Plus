/**
 * Widget size: drag handles on every unlocked chat, the size kept per chat
 * beside its position. Width and height both apply wherever the chat is: a
 * wider docked chat grows leftward and the movable feature's row reflow slides
 * its neighbours over, so nothing overlaps. Nothing here talks to that feature:
 * "floating" and "locked" are read from the storage record alone.
 */

import { debug } from '../../core/log.js';
import { applySize } from './sizing.js';
import { directionsFor, mountHandles, unmountHandles } from './handles.js';
import { createResizeController } from './resizeController.js';
import { createResetRow } from './resetRow.js';

const isFloating = (state) => state.x !== null && state.y !== null;

/**
 * While a floating chat grows from its top or left edge, the box is nudged up
 * and left by the growth so its bottom-right corner stays put until release.
 * On the box, not the wrapper: movable's watchWrapper re-asserts the wrapper's
 * style and would fight anything written there.
 */
function setShift(box, shiftX, shiftY) {
  const next = shiftX || shiftY ? `${-shiftX}px ${-shiftY}px` : '';
  if (box.style.getPropertyValue('translate') === next) return;
  if (next) box.style.setProperty('translate', next, 'important');
  else box.style.removeProperty('translate');
}

export function createResizeFeature() {
  /** @type {Map<string, {widget: {id: string, box: Element}, controller: ReturnType<typeof createResizeController>}>} */
  const entries = new Map();
  let ctx = null;
  let resetRow = null;

  const stateOf = (id) => ctx.storage.getWidget(id);

  /** A live gesture outranks storage, exactly as a live drag does in movable. */
  function apply(entry) {
    const { id, box } = entry.widget;
    const state = stateOf(id);
    const floating = isFloating(state);
    const live = entry.controller.liveSize();
    const size = live || { width: state.width, height: state.height };
    applySize(box, { width: size.width, height: size.height });
    setShift(box, live ? live.shiftX : 0, live ? live.shiftY : 0);
    mountHandles(box, directionsFor({ locked: state.locked, floating }), (direction, event) => {
      entry.controller.start(direction, event, { floating: isFloating(stateOf(id)) });
    });
  }

  function applyAll() {
    for (const entry of entries.values()) apply(entry);
    if (resetRow) resetRow.sync();
  }

  function commit(entry, size, start) {
    const { id } = entry.widget;
    const state = stateOf(id);
    // Only the dimension the gesture actually moved: a drag of the top edge
    // must not pin the width Torn gave the chat. The controller only commits
    // when something changed, so the patch is never empty.
    const patch = {};
    if (size.width !== Math.round(start.width)) patch.width = size.width;
    if (size.height !== Math.round(start.height)) patch.height = size.height;
    if (isFloating(state)) {
      if (size.shiftX) patch.x = state.x - size.shiftX;
      if (size.shiftY) patch.y = state.y - size.shiftY;
    }
    debug('resize commit', id, patch);
    // setWidget notifies every subscriber: movable re-places the wrapper at
    // the new x/y, and applyAll above re-applies the size and drops the shift.
    ctx.storage.setWidget(id, patch);
  }

  function createEntry(widget) {
    const entry = { widget };
    entry.controller = createResizeController({
      getBox: () => entry.widget.box,
      onResize: (size) => {
        applySize(entry.widget.box, { width: size.width, height: size.height });
        setShift(entry.widget.box, size.shiftX, size.shiftY);
      },
      onCommit: (size, start) => commit(entry, size, start),
      // Nothing was stored, so the box still wears the live size: put it back.
      onCancel: () => apply(entry),
    });
    return entry;
  }

  function init(context) {
    ctx = context;
    // Fires for local writes AND for the cross-tab 'storage' event.
    ctx.storage.subscribe(applyAll);
    resetRow = createResetRow({
      row: ctx.menu.addRow(), menu: ctx.menu, storage: ctx.storage, selectors: ctx.selectors,
    });
  }

  function onWidgetAdded(widget, context) {
    ctx = context;
    const entry = entries.get(widget.id);
    // Torn re-rendered this chat: the entry adopts the new box, and a gesture
    // in flight carries on with it (the controller reads getBox on every move).
    if (entry) entry.widget = widget;
    else entries.set(widget.id, createEntry(widget));
    apply(entries.get(widget.id));
  }

  function onWidgetRemoved(widget) {
    // Adds are reported before removes, so after a node swap the entry already
    // belongs to the replacement: only drop it if it is still about this one.
    const entry = entries.get(widget.id);
    if (!entry || entry.widget !== widget) return;
    entry.controller.cancel();
    unmountHandles(widget.box);
    entries.delete(widget.id);
  }

  return { id: 'resize', init, onWidgetAdded, onWidgetRemoved };
}
