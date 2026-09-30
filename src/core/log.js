export const PREFIX = '[Chat+]';

/** Set this localStorage key to '1' to turn the debug trace on. */
export const DEBUG_KEY = 'chatplus.debug';

const warned = new Set();

/**
 * Is the debug trace switched on? Read live from localStorage on every call, so
 * flipping the key in the console takes effect immediately, with no page reload
 * and nothing cached to go stale. One getItem costs far less than the console
 * write it guards.
 */
export function isDebug() {
  try {
    const area = globalThis.localStorage;
    return !!area && area.getItem(DEBUG_KEY) === '1';
  } catch {
    // Private mode / blocked storage: never let diagnostics break the page.
    return false;
  }
}

/**
 * Trace output. Silent, and costs one localStorage read, unless DEBUG_KEY is '1'.
 * Deliberately console.log and not console.debug: Chrome hides `debug` messages
 * behind the "Verbose" console level, which nobody finds.
 * @returns {boolean} true if this call actually logged.
 */
export function debug(...args) {
  if (!isDebug()) return false;
  console.log(PREFIX, ...args);
  return true;
}

/** Stable short names for DOM nodes, so a swap is visible in the trace. */
const tags = new WeakMap();
let nextTag = 0;

/**
 * A short identity tag for a node: the same node always reads back the same
 * tag, a replacement reads back a new one. Returns '-' while debug is off so
 * nothing is allocated on the normal path.
 * @returns {string}
 */
export function tagOf(node) {
  if (!node || !isDebug()) return '-';
  let tag = tags.get(node);
  if (tag === undefined) {
    nextTag += 1;
    tag = `#${nextTag}`;
    tags.set(node, tag);
  }
  return tag;
}

export function info(...args) {
  console.info(PREFIX, ...args);
}

/**
 * Warn about `key` at most once per page load.
 * @returns {boolean} true if this call actually logged.
 */
export function warnOnce(key, ...args) {
  if (warned.has(key)) return false;
  warned.add(key);
  console.warn(PREFIX, ...args);
  return true;
}

/** Test seam: forget every warnOnce key. */
export function resetWarnOnce() {
  warned.clear();
}

/**
 * Wrap a callback so it can never throw out of an observer or event handler.
 * Failures are reported once per label.
 */
export function safe(label, fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      warnOnce(label, `${label} failed:`, err);
      return undefined;
    }
  };
}
