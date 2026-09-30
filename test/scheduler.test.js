import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameScheduler } from '../src/core/scheduler.js';

/** Replace requestAnimationFrame with a queue we can flush by hand. */
function withFakeRaf(fn) {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map();
  const cancelled = [];
  let nextHandle = 1;
  globalThis.requestAnimationFrame = (cb) => {
    const handle = nextHandle;
    nextHandle += 1;
    frames.set(handle, cb);
    return handle;
  };
  globalThis.cancelAnimationFrame = (handle) => {
    cancelled.push(handle);
    frames.delete(handle);
  };
  const flush = () => {
    const due = [...frames.values()];
    frames.clear();
    for (const cb of due) cb();
  };
  try {
    return fn({ flush, cancelled, pending: () => frames.size });
  } finally {
    if (originalRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalRaf;
    if (originalCancel === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = originalCancel;
  }
}

/** Run without any requestAnimationFrame at all, so the timer fallback is used. */
function withoutRaf(fn) {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
  try {
    return fn();
  } finally {
    if (originalRaf !== undefined) globalThis.requestAnimationFrame = originalRaf;
    if (originalCancel !== undefined) globalThis.cancelAnimationFrame = originalCancel;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('many schedule calls coalesce into a single run on the next frame', () => {
  withFakeRaf((raf) => {
    let runs = 0;
    const scheduler = createFrameScheduler(() => { runs += 1; });
    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    assert.equal(runs, 0, 'nothing runs synchronously');
    assert.equal(raf.pending(), 1, 'only one frame is requested');
    raf.flush();
    assert.equal(runs, 1);
  });
});

test('scheduling again after a run requests a new frame', () => {
  withFakeRaf((raf) => {
    let runs = 0;
    const scheduler = createFrameScheduler(() => { runs += 1; });
    scheduler.schedule();
    raf.flush();
    scheduler.schedule();
    raf.flush();
    assert.equal(runs, 2);
  });
});

test('a run may schedule the next one from inside the callback', () => {
  withFakeRaf((raf) => {
    let runs = 0;
    const scheduler = createFrameScheduler(() => {
      runs += 1;
      if (runs === 1) scheduler.schedule();
    });
    scheduler.schedule();
    raf.flush();
    assert.equal(raf.pending(), 1, 'the re-schedule from inside the run must take effect');
    raf.flush();
    assert.equal(runs, 2);
  });
});

test('cancel drops a pending run using the matching canceller', () => {
  withFakeRaf((raf) => {
    let runs = 0;
    const scheduler = createFrameScheduler(() => { runs += 1; });
    scheduler.schedule();
    scheduler.cancel();
    assert.deepEqual(raf.cancelled, [1], 'cancelAnimationFrame gets the handle rAF returned');
    raf.flush();
    assert.equal(runs, 0);

    scheduler.schedule();
    raf.flush();
    assert.equal(runs, 1, 'the scheduler is reusable after a cancel');
  });
});

test('cancel with nothing pending is a no-op', () => {
  withFakeRaf((raf) => {
    const scheduler = createFrameScheduler(() => { throw new Error('must not run'); });
    assert.doesNotThrow(() => scheduler.cancel());
    assert.deepEqual(raf.cancelled, []);
  });
});

test('without requestAnimationFrame it falls back to a timer', async () => {
  await withoutRaf(async () => {
    let runs = 0;
    const scheduler = createFrameScheduler(() => { runs += 1; });
    scheduler.schedule();
    scheduler.schedule();
    assert.equal(runs, 0);
    await sleep(60);
    assert.equal(runs, 1, 'the timer fallback coalesces too');
  });
});

test('cancel clears the fallback timer', async () => {
  await withoutRaf(async () => {
    let runs = 0;
    const scheduler = createFrameScheduler(() => { runs += 1; });
    scheduler.schedule();
    scheduler.cancel();
    await sleep(60);
    assert.equal(runs, 0);
  });
});
