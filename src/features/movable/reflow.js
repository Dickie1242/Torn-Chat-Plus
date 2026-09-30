import { debug, isDebug } from '../../core/log.js';

/**
 * Row reflow: when widgets float out of Torn's bottom row, the survivors pack
 * toward Torn's anchor edge so no gap is left behind - and the row makes room
 * for widgets wider than Torn's own default, sliding everything further from
 * the anchor out of their way.
 *
 * computeCompensations is PURE - it never touches the DOM.
 */

/** Below this many pixels a compensation is not worth writing. */
export const COMP_EPSILON = 0.5;

/**
 * How one extra pixel of the positioning property moves the widget on screen.
 * `right: 220px` sits further LEFT than `right: 10px`, hence -1.
 */
const AXIS_SIGN = { right: -1, left: 1, transform: 1 };

/**
 * Distance from Torn's anchor edge. For right/left the value already is that
 * distance; for translateX the anchor slot is translateX(0).
 */
function anchorDistance(prop, natural) {
  return prop === 'transform' ? Math.abs(natural) : natural;
}

/**
 * The on-screen direction away from the row's anchor edge: -1 when the row
 * hangs off the right edge of the screen, +1 off the left. Torn's live row
 * places wrappers with negative translateX from a right-pinned position.
 */
function awayFromAnchor(prop, entries) {
  if (prop === 'right') return -1;
  if (prop === 'left') return 1;
  return entries.some((entry) => entry.natural < 0) ? -1 : 1;
}

/**
 * @typedef {{ id: string, natural: number, floating?: boolean, width?: number }} RowWidget
 * @typedef {{ prop: 'right'|'left'|'transform', widgets: RowWidget[], defaultWidth?: number }} RowLayout
 */

/**
 * @param {RowLayout} layout
 * @returns {Map<string, number>} widget id -> px to translate along X.
 *   Floating widgets are always mapped to 0 so callers clear their compensation.
 */
export function computeCompensations(layout) {
  const result = new Map();
  if (!layout || !Array.isArray(layout.widgets)) return result;

  const sign = AXIS_SIGN[layout.prop];
  if (!sign) return result;

  const entries = [];
  for (let index = 0; index < layout.widgets.length; index += 1) {
    const w = layout.widgets[index];
    if (!w || typeof w.id !== 'string' || !w.id || !Number.isFinite(w.natural)) continue;
    entries.push({ id: w.id, natural: w.natural, floating: !!w.floating, width: w.width, index });
  }
  if (entries.length === 0) return result;

  entries.sort((a, b) => {
    const delta = anchorDistance(layout.prop, a.natural) - anchorDistance(layout.prop, b.natural);
    return delta !== 0 ? delta : a.index - b.index;
  });

  const away = awayFromAnchor(layout.prop, entries);
  const defaultWidth = Number.isFinite(layout.defaultWidth) && layout.defaultWidth > 0
    ? layout.defaultWidth
    : null;
  const slots = entries.map((entry) => entry.natural);
  let nextSlot = 0;
  // Width beyond Torn's default among the widgets already placed nearer the
  // anchor: everything further out slides by this much so nothing overlaps.
  // A wrapper Torn has not laid out yet measures 0, which is no measurement.
  let extra = 0;
  for (const entry of entries) {
    if (entry.floating) {
      result.set(entry.id, 0);
      continue;
    }
    const target = slots[nextSlot];
    nextSlot += 1;
    const compensation = sign * (target - entry.natural) + away * extra;
    // `sign * 0` is -0 for the right-anchored case; normalise so callers and
    // equality checks only ever see a plain 0.
    result.set(entry.id, compensation === 0 ? 0 : compensation);
    const width = entry.width;
    if (defaultWidth !== null && Number.isFinite(width) && width > 0) extra += width - defaultWidth;
  }
  return result;
}

/**
 * Thin DOM applier: reads each wrapper's natural offset through the selectors
 * module, computes the row, and writes the compensations.
 *
 * @param {{ id: string, wrapper: Element }[]} widgets
 * @param {typeof import('../../core/selectors.js')} selectors
 * @param {(widget: any) => boolean} [isFloating]
 * @param {number} [defaultWidth]  Torn's own width, as measured before we sized anything.
 * @returns {Map<string, number>} the compensations that were applied.
 */
export function applyCompensations(widgets, selectors, isFloating = () => false, defaultWidth) {
  const measured = [];
  for (const widget of widgets || []) {
    if (!widget || !widget.wrapper || !widget.wrapper.isConnected) continue;
    const offset = selectors.naturalOffsetOf(widget.wrapper);
    if (!offset) continue;
    measured.push({ widget, offset });
  }
  if (measured.length === 0) return new Map();

  // Torn uses one positioning property for the whole row; ignore any outlier.
  const prop = measured[0].offset.prop;
  const row = measured.filter((entry) => entry.offset.prop === prop);

  const compensations = computeCompensations({
    prop,
    defaultWidth,
    widgets: row.map((entry) => ({
      id: entry.widget.id,
      natural: entry.offset.value,
      floating: !!isFloating(entry.widget),
      width: entry.widget.wrapper.getBoundingClientRect().width,
    })),
  });

  if (isDebug()) {
    debug('reflow', prop, [...compensations].map(([id, px]) => `${id}=${px}`).join(' '));
  }

  for (const entry of row) {
    const value = compensations.get(entry.widget.id) || 0;
    const style = entry.widget.wrapper.style;
    if (Math.abs(value) < COMP_EPSILON) style.removeProperty('translate');
    else style.setProperty('translate', `${value}px 0`, 'important');
  }

  return compensations;
}
