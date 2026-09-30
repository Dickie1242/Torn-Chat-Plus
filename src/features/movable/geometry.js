/** Pure viewport geometry. No DOM access. */

/**
 * Keep `value` in [0, limit - size]. A widget that cannot fit pins to 0.
 * @param {number} value  proposed top-left coordinate on this axis
 * @param {number} size   widget extent on this axis
 * @param {number} limit  viewport extent on this axis
 * @returns {number}
 */
export function clampAxis(value, size, limit) {
  if (!Number.isFinite(size) || !Number.isFinite(limit)) return 0;
  const max = limit - size;
  if (!(max > 0)) return 0;
  if (!Number.isFinite(value)) return value === Infinity ? max : 0;
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

/**
 * @param {{x:number,y:number,width:number,height:number,viewportWidth:number,viewportHeight:number}} input
 * @returns {{x:number,y:number}}
 */
export function clampPosition({ x, y, width, height, viewportWidth, viewportHeight }) {
  return {
    x: clampAxis(x, width, viewportWidth),
    y: clampAxis(y, height, viewportHeight),
  };
}
