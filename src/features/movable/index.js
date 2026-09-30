import { safe, debug } from '../../core/log.js';
import { createFrameScheduler } from '../../core/scheduler.js';
import { createLockToggle } from './lockToggle.js';
import { createResetButton } from './resetButton.js';
import { createDragController } from './dragController.js';
import { createHeaderGuard } from './headerGuard.js';
import { applyFloating, clearFloating, isFloating, watchWrapper } from './floating.js';
import { applyCompensations } from './reflow.js';
import { clampPosition } from './geometry.js';

/**
 * The resize feature writes a chat's size on the box's inline style; any
 * change there may change the row, so it re-runs the reflow. (ResizeObserver
 * would be the natural fit, but jsdom cannot exercise it.)
 */
function watchBoxStyle(box, onChange) {
  const MO = globalThis.MutationObserver;
  if (!box || typeof MO !== 'function') return () => {};
  const observer = new MO(onChange);
  observer.observe(box, { attributes: true, attributeFilter: ['style'] });
  return () => observer.disconnect();
}

/**
 * The movable-widgets feature: header buttons, drag, floating placement, reflow.
 * @returns {{id: string, init: Function, onWidgetAdded: Function, onWidgetRemoved: Function}}
 */
export function createMovableFeature() {
  /** @type {Map<string, {widget, lock, arrow, drag, guard, unwatch: () => void, unwatchBox: () => void, naturalWidth: number|undefined}>} */
  const entries = new Map();
  let ctx = null;

  function stateOf(id) {
    return ctx.storage.getWidget(id);
  }

  /** @returns {{x: number, y: number}|null} null means "sit wherever Torn puts it". */
  function desiredPositionOf(id) {
    // A gesture in flight outranks storage. Nothing is committed until the
    // pointer comes up, so storage still describes where the widget used to
    // be - and every re-assertion path runs through here. Reading storage
    // during a drag is what yanks the widget back out from under the pointer
    // when Torn rewrites the wrapper's class or style, when another tab writes
    // state, or when Torn swaps the widget's nodes.
    const entry = entries.get(id);
    const live = entry ? entry.drag.livePosition() : null;
    if (live) return live;

    const state = stateOf(id);
    return state.x !== null && state.y !== null ? { x: state.x, y: state.y } : null;
  }

  /** Torn's own chat width, from the first widget that reported a real one. */
  function defaultWidthOf() {
    for (const entry of entries.values()) {
      if (Number.isFinite(entry.naturalWidth) && entry.naturalWidth > 0) return entry.naturalWidth;
    }
    return undefined;
  }

  /** Every reflow trigger in a frame collapses into one row recalculation. */
  const { schedule: scheduleReflow } = createFrameScheduler(safe('movable.reflow', () => {
    applyCompensations(
      [...entries.values()].map((entry) => entry.widget),
      ctx.selectors,
      (widget) => isFloating(widget.wrapper),
      defaultWidthOf(),
    );
  }));

  function applyState(entry) {
    const { id, wrapper } = entry.widget;
    const state = stateOf(id);
    const desired = desiredPositionOf(id);
    if (desired) applyFloating(wrapper, desired.x, desired.y, 'applyState');
    else clearFloating(wrapper, 'applyState:native');

    // A locked widget still sitting in Torn's row is left completely alone, so
    // Torn's own drag-to-swap keeps working there. Once a widget floats, Chat+
    // keeps its header even while locked: that is what holds Torn's reorder
    // drag off a widget that is no longer one of its row items.
    if (state.locked && !desired) {
      entry.drag.disable();
      entry.guard.disable();
    } else {
      entry.drag.enable();
      entry.guard.enable();
    }

    entry.lock.sync();
    // Offered for a position the user has actually parked the widget at, not
    // for the one under the pointer while a drag is still in flight.
    entry.arrow.sync(state.x !== null && state.y !== null);
  }

  function applyAll() {
    for (const entry of entries.values()) applyState(entry);
    scheduleReflow();
  }

  function dropEntry(id) {
    const entry = entries.get(id);
    if (!entry) return;
    entry.drag.disable();
    entry.guard.disable();
    entry.lock.unmount();
    entry.arrow.unmount();
    entry.unwatch();
    entry.unwatchBox();
    entries.delete(id);
  }

  /** Keep floating widgets inside the viewport when the window is resized. */
  const onResize = safe('movable.onResize', () => {
    const view = globalThis.window;
    // setWidget re-enters applyAll through the storage notify path, so the
    // clamped positions are collected first and written once the loop is over.
    const clamped = [];
    for (const entry of entries.values()) {
      const desired = desiredPositionOf(entry.widget.id);
      if (!desired) continue;
      // A wrapper Torn has already detached measures 0x0, which would persist
      // a bogus position; the next widgetAdded will place it instead.
      if (!entry.widget.wrapper.isConnected) continue;
      const rect = entry.widget.wrapper.getBoundingClientRect();
      const next = clampPosition({
        x: desired.x,
        y: desired.y,
        width: rect.width,
        height: rect.height,
        viewportWidth: view.innerWidth,
        viewportHeight: view.innerHeight,
      });
      if (next.x !== desired.x || next.y !== desired.y) clamped.push([entry.widget.id, next]);
      else applyFloating(entry.widget.wrapper, next.x, next.y, 'resize');
    }
    // Persists and re-applies via subscribe.
    for (const [id, next] of clamped) ctx.storage.setWidget(id, next);
    scheduleReflow();
  });

  function init(context) {
    ctx = context;
    // Fires for local writes AND for the cross-tab 'storage' event.
    ctx.storage.subscribe(applyAll);
    globalThis.window.addEventListener('resize', onResize);
  }

  function onWidgetAdded(widget, context) {
    ctx = context;
    // Torn re-rendered this widget's nodes. If the user is mid-drag, carry the
    // gesture over to the replacement instead of dropping it - otherwise the
    // widget jumps back to its stored spot and the drag dies under the pointer.
    const previous = entries.get(widget.id);
    const handover = previous ? previous.drag.exportSession() : null;
    // Torn's own width, measured before the resize feature writes ours. A box
    // that already carries our inline width (!important; since 2026-09-30 Torn
    // puts a plain inline width of its own on every box), and a wrapper Torn
    // has not laid out yet (0 px, which is no measurement), keep the value
    // recorded earlier.
    const ours = widget.box.style.getPropertyPriority('width') === 'important';
    const measured = ours ? 0 : widget.wrapper.getBoundingClientRect().width;
    const naturalWidth = measured > 0 ? measured : (previous ? previous.naturalWidth : undefined);
    dropEntry(widget.id);

    /** Back to Torn's row: the lock state is deliberately left as it is. */
    const reset = () => ctx.storage.setWidget(widget.id, { x: null, y: null });

    const lock = createLockToggle({
      widget,
      selectors: ctx.selectors,
      isLocked: () => stateOf(widget.id).locked,
      onToggle: (locked) => ctx.storage.setWidget(widget.id, { locked }),
      onMenu: (anchor) => ctx.menu.toggle(anchor),
    });

    const arrow = createResetButton({ widget, onReset: reset });

    const guard = createHeaderGuard({ header: widget.header });

    const drag = createDragController({
      widget,
      isLocked: () => stateOf(widget.id).locked,
      onMove: (x, y) => {
        applyFloating(widget.wrapper, x, y, 'drag');
        scheduleReflow(); // the row closes the gap live while dragging
      },
      onCommit: (x, y) => {
        debug('commit', widget.id, x, y);
        guard.armClickSuppression();
        ctx.storage.setWidget(widget.id, { x, y });
      },
    });

    // Torn rewrites inline styles on re-render: re-assert ours, and reflow
    // the row whenever Torn moves anything.
    const unwatch = watchWrapper(widget.wrapper, () => desiredPositionOf(widget.id), scheduleReflow);
    const unwatchBox = watchBoxStyle(widget.box, scheduleReflow);

    const entry = { widget, lock, arrow, drag, guard, unwatch, unwatchBox, naturalWidth };
    entries.set(widget.id, entry);
    // Before applyState, so the live drag position is what gets applied.
    if (handover) {
      debug('drag handover', widget.id, handover.x, handover.y);
      drag.adoptSession(handover);
    }
    lock.mount();
    applyState(entry);
    scheduleReflow();
  }

  function onWidgetRemoved(widget) {
    // A scan reports adds before removes, so when Torn swaps a chat box for a
    // NEW node carrying the SAME id, the entry under that id already belongs to
    // the replacement by the time this removal arrives. Dropping it by id alone
    // would tear down the live widget - padlock gone, drag dead, and never
    // rediscovered because the observer has already seen the new box.
    const entry = entries.get(widget.id);
    if (entry && entry.widget === widget) dropEntry(widget.id);
    scheduleReflow();
  }

  return { id: 'movable', init, onWidgetAdded, onWidgetRemoved };
}
