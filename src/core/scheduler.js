/**
 * Frame scheduling shared by everything that has to batch DOM work:
 * many calls to `schedule()` collapse into one run of `fn` on the next
 * animation frame, and `cancel()` drops a run that has not happened yet.
 *
 * `requestAnimationFrame` is always called on `globalThis` — browsers throw
 * "Illegal invocation" when it is detached from `window`.
 */

/** How long the timer fallback waits when there is no animation frame. */
export const FALLBACK_DELAY_MS = 16;

/**
 * @param {() => void} fn  the batched work
 * @returns {{schedule: () => void, cancel: () => void}}
 */
export function createFrameScheduler(fn) {
  /** @type {(() => void)|null} cancels the pending run, if any. */
  let cancelPending = null;

  function run() {
    cancelPending = null;
    fn();
  }

  function schedule() {
    if (cancelPending) return;
    if (typeof globalThis.requestAnimationFrame === 'function'
      && typeof globalThis.cancelAnimationFrame === 'function') {
      const handle = globalThis.requestAnimationFrame(run);
      cancelPending = () => globalThis.cancelAnimationFrame(handle);
    } else {
      const handle = setTimeout(run, FALLBACK_DELAY_MS);
      cancelPending = () => clearTimeout(handle);
    }
  }

  function cancel() {
    if (!cancelPending) return;
    const cancelRun = cancelPending;
    cancelPending = null;
    cancelRun();
  }

  return { schedule, cancel };
}
