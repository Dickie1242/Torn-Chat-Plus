import { safe, warnOnce, debug, tagOf } from './log.js';
import { createFrameScheduler } from './scheduler.js';

/** @typedef {{ id: string, box: Element, wrapper: Element, header: Element }} Widget */

/**
 * Watches document.body for chat widgets appearing and disappearing.
 * Minimizing removes a widget from the DOM and expanding re-adds it, so a
 * re-add is reported as a brand new widget.
 */
export function createObserver({ selectors, onWidgetAdded, onWidgetRemoved }) {
  /** @type {Map<Element, Widget>} */
  const widgets = new Map();
  let mutationObserver = null;

  const emitAdded = safe('observer.onWidgetAdded', (widget) => {
    debug('widget added', widget.id,
      'box', tagOf(widget.box), 'wrapper', tagOf(widget.wrapper), 'header', tagOf(widget.header));
    if (onWidgetAdded) onWidgetAdded(widget);
  });
  const emitRemoved = safe('observer.onWidgetRemoved', (widget) => {
    debug('widget removed', widget.id,
      'box', tagOf(widget.box), 'wrapper', tagOf(widget.wrapper), 'header', tagOf(widget.header));
    if (onWidgetRemoved) onWidgetRemoved(widget);
  });

  function buildWidget(box) {
    const id = selectors.chatIdOf(box);
    const wrapper = selectors.wrapperOf(box);
    const header = selectors.headerOf(box);
    if (!id || !wrapper || !header) return null;
    return { id, box, wrapper, header };
  }

  function scan() {
    const doc = globalThis.document;
    if (!doc || !doc.body) return;

    /** Records whose nodes are no longer the live ones. Reported last. */
    const stale = [];

    for (const box of selectors.findChatBoxes(doc)) {
      const known = widgets.get(box);
      const widget = buildWidget(box);
      if (!widget) {
        warnOnce(`observer.shape:${box.id}`, 'could not read the structure of chat widget', box.id);
        continue;
      }
      // Torn can re-render AROUND a live box: the box itself never leaves the
      // document, but it ends up inside a brand new wrapper or header. The
      // record on file would then point at detached nodes that no feature can
      // usefully style, so a re-parented box counts as a new widget.
      if (known && known.wrapper === widget.wrapper && known.header === widget.header) continue;
      widgets.set(box, widget);
      emitAdded(widget);
      if (known) stale.push(known);
    }

    for (const [box, widget] of [...widgets]) {
      if (doc.body.contains(box)) continue;
      widgets.delete(box);
      stale.push(widget);
    }

    // Adds are reported before removes so that when Torn swaps nodes the
    // replacement is wired up before the record it replaced is torn down.
    for (const widget of stale) emitRemoved(widget);
  }

  /**
   * Mutation batches are noisy, so scans are coalesced into one per frame.
   * A scheduled scan runs off a frame callback with nobody to catch it, so it
   * is isolated the same way the feature hooks above are.
   */
  const scheduler = createFrameScheduler(safe('observer.scan', scan));

  function start() {
    if (mutationObserver) return;
    const doc = globalThis.document;
    if (!doc || !doc.body) return;
    mutationObserver = new globalThis.MutationObserver(scheduler.schedule);
    mutationObserver.observe(doc.body, { childList: true, subtree: true });
    scan();
  }

  function stop() {
    scheduler.cancel();
    if (!mutationObserver) return;
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  return { start, stop, scan };
}
