import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, settle, captureConsole } from '../testlib/dom.js';
import { resetWarnOnce } from '../src/core/log.js';
import {
  FLOATING_CLASS, VAR_X, VAR_Y,
  applyFloating, clearFloating, isFloating, watchWrapper,
} from '../src/features/movable/floating.js';

async function withDom(fn) {
  const dom = setupDom();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

test('applyFloating adds the class, sets both custom properties, and drops stale translate', async () => {
  await withDom((dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a', style: 'right: 220px;' });
    w.wrapper.style.setProperty('translate', '210px 0', 'important');

    applyFloating(w.wrapper, 120, 40);

    assert.ok(w.wrapper.classList.contains(FLOATING_CLASS));
    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '120px');
    assert.equal(w.wrapper.style.getPropertyValue(VAR_Y), '40px');
    assert.ok(!w.wrapper.getAttribute('style').includes('translate:'), 'row compensation must be cleared');
    assert.match(w.wrapper.getAttribute('style'), /right: 220px/, 'Torn inline style stays readable');
    assert.equal(isFloating(w.wrapper), true);
  });
});

test('applyFloating rounds to whole pixels and is idempotent', async () => {
  await withDom((dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a' });
    applyFloating(w.wrapper, 120.4, 40.6);
    const first = w.wrapper.getAttribute('style');
    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '120px');
    assert.equal(w.wrapper.style.getPropertyValue(VAR_Y), '41px');
    applyFloating(w.wrapper, 120.4, 40.6);
    assert.equal(w.wrapper.getAttribute('style'), first);
  });
});

test('clearFloating removes the class and both custom properties', async () => {
  await withDom((dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a', style: 'right: 220px;' });
    applyFloating(w.wrapper, 120, 40);
    clearFloating(w.wrapper);
    assert.equal(isFloating(w.wrapper), false);
    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '');
    assert.equal(w.wrapper.style.getPropertyValue(VAR_Y), '');
    assert.match(w.wrapper.getAttribute('style'), /right: 220px/);
  });
});

test('applyFloating and clearFloating tolerate a missing wrapper', async () => {
  await withDom(() => {
    assert.doesNotThrow(() => applyFloating(null, 1, 2));
    assert.doesNotThrow(() => clearFloating(null));
    assert.equal(isFloating(null), false);
  });
});

test('watchWrapper re-asserts the position after Torn rewrites the inline style', async () => {
  await withDom(async (dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a', style: 'right: 220px;' });
    applyFloating(w.wrapper, 120, 40);
    const stop = watchWrapper(w.wrapper, () => ({ x: 120, y: 40 }));

    w.wrapper.setAttribute('style', 'right: 0px;'); // Torn re-render wipes our vars
    await settle();

    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '120px');
    assert.equal(w.wrapper.style.getPropertyValue(VAR_Y), '40px');
    stop();
  });
});

test('watchWrapper re-asserts the class after Torn rewrites className', async () => {
  await withDom(async (dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a' });
    applyFloating(w.wrapper, 120, 40);
    const stop = watchWrapper(w.wrapper, () => ({ x: 120, y: 40 }));

    w.wrapper.setAttribute('class', 'torn-rerendered');
    await settle();

    assert.ok(w.wrapper.classList.contains(FLOATING_CLASS));
    stop();
  });
});

test('re-assertion settles instead of looping', async () => {
  await withDom(async (dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a' });
    applyFloating(w.wrapper, 120, 40);
    let asks = 0;
    const stop = watchWrapper(w.wrapper, () => { asks += 1; return { x: 120, y: 40 }; });

    w.wrapper.setAttribute('style', 'right: 0px;');
    await settle();
    const afterFirstSettle = asks;
    await settle();
    assert.equal(asks, afterFirstSettle, 'a settled wrapper must stop producing mutations');
    stop();
  });
});

test('watchWrapper reports every mutation so the row can be reflowed', async () => {
  await withDom(async (dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a', style: 'right: 220px;' });
    let changes = 0;
    const stop = watchWrapper(w.wrapper, () => null, () => { changes += 1; });

    // Torn moves the widget in the row: no floating override, but the row changed.
    w.wrapper.setAttribute('style', 'right: 10px;');
    await settle();
    assert.ok(changes >= 1, 'a Torn style rewrite must notify the caller');
    stop();
  });
});

test('watchWrapper does nothing when the widget is no longer floating, and stops on demand', async () => {
  await withDom(async (dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a' });
    applyFloating(w.wrapper, 120, 40);
    const stop = watchWrapper(w.wrapper, () => null);

    w.wrapper.setAttribute('style', 'right: 0px;');
    await settle();
    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '', 'null desired position means leave it alone');

    stop();
    w.wrapper.setAttribute('style', 'right: 5px;');
    await settle();
    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '');
  });
});

test('a throwing getDesired or onChange never escapes the mutation callback', async () => {
  await withDom(async (dom) => {
    resetWarnOnce();
    const w = makeChatWidget(dom.window.document, { id: 'chat-a' });
    applyFloating(w.wrapper, 120, 40);

    const cWarn = captureConsole('warn');
    const cError = captureConsole('error');
    let stop = null;
    try {
      stop = watchWrapper(
        w.wrapper,
        () => { throw new Error('getDesired blew up'); },
        () => { throw new Error('onChange blew up'); },
      );
      w.wrapper.setAttribute('style', 'right: 0px;');
      await settle();
      w.wrapper.setAttribute('style', 'right: 5px;');
      await settle();
    } finally {
      cWarn.restore();
      cError.restore();
      if (stop) stop();
    }

    assert.equal(cError.calls.length, 0, 'the mutation callback must not throw');
    assert.equal(cWarn.calls.length, 1, 'warnOnce means one warning, not one per mutation');
  });
});
