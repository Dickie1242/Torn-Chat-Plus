import test from 'node:test';
import assert from 'node:assert/strict';
import { captureConsole } from '../testlib/dom.js';
import { resetWarnOnce } from '../src/core/log.js';
import { createRegistry } from '../src/core/registry.js';

const CTX = { storage: { tag: 'storage' }, selectors: { tag: 'selectors' }, log: { tag: 'log' } };
const WIDGET = { id: 'chat-a', box: {}, wrapper: {}, header: {} };

test('init, onWidgetAdded and onWidgetRemoved all receive the shared ctx', () => {
  resetWarnOnce();
  const calls = [];
  const registry = createRegistry(CTX);
  registry.register({
    id: 'movable',
    init: (ctx) => calls.push(['init', ctx]),
    onWidgetAdded: (w, ctx) => calls.push(['added', w, ctx]),
    onWidgetRemoved: (w, ctx) => calls.push(['removed', w, ctx]),
  });
  registry.init();
  registry.widgetAdded(WIDGET);
  registry.widgetRemoved(WIDGET);

  assert.deepEqual(calls.map((c) => c[0]), ['init', 'added', 'removed']);
  assert.equal(calls[0][1], CTX);
  assert.equal(calls[1][1], WIDGET);
  assert.equal(calls[1][2], CTX);
  assert.equal(calls[2][1], WIDGET);
  assert.equal(calls[2][2], CTX);
});

test('register is chainable and list reports the registered ids', () => {
  const registry = createRegistry(CTX);
  registry.register({ id: 'a' }).register({ id: 'b' });
  assert.deepEqual(registry.list(), ['a', 'b']);
});

test('features without optional hooks are skipped without error', () => {
  const registry = createRegistry(CTX);
  registry.register({ id: 'bare' });
  registry.init();
  registry.widgetAdded(WIDGET);
  registry.widgetRemoved(WIDGET);
  assert.deepEqual(registry.list(), ['bare']);
});

test('a feature without an id is rejected', () => {
  const registry = createRegistry(CTX);
  registry.register(null);
  registry.register({});
  assert.deepEqual(registry.list(), []);
});

test('a throwing feature is isolated: later features still run and the error is warned once', () => {
  resetWarnOnce();
  const seen = [];
  const registry = createRegistry(CTX);
  registry.register({ id: 'broken', onWidgetAdded: () => { throw new Error('kaboom'); } });
  registry.register({ id: 'healthy', onWidgetAdded: (w) => seen.push(w.id) });

  const cWarn = captureConsole('warn');
  try {
    registry.widgetAdded(WIDGET);
    registry.widgetAdded(WIDGET);
  } finally { cWarn.restore(); }

  assert.deepEqual(seen, ['chat-a', 'chat-a']);
  assert.equal(cWarn.calls.length, 1);
  assert.equal(cWarn.calls[0][1], 'broken.onWidgetAdded failed:');
});
