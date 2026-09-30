import test from 'node:test';
import assert from 'node:assert/strict';
import { captureConsole, setupDom, teardownDom } from '../testlib/dom.js';
import {
  PREFIX, DEBUG_KEY, info, warnOnce, resetWarnOnce, safe, debug, isDebug, tagOf,
} from '../src/core/log.js';

test('info prefixes every message', () => {
  const cInfo = captureConsole('info');
  try { info('hello', 1); } finally { cInfo.restore(); }
  assert.deepEqual(cInfo.calls, [[PREFIX, 'hello', 1]]);
});

test('warnOnce logs the first time only, per key', () => {
  resetWarnOnce();
  const cWarn = captureConsole('warn');
  let first, second, other;
  try {
    first = warnOnce('k1', 'first');
    second = warnOnce('k1', 'second');
    other = warnOnce('k2', 'other');
  } finally { cWarn.restore(); }
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(other, true);
  assert.deepEqual(cWarn.calls, [[PREFIX, 'first'], [PREFIX, 'other']]);
});

test('safe returns the wrapped result when nothing throws', () => {
  resetWarnOnce();
  const wrapped = safe('adder', (a, b) => a + b);
  assert.equal(wrapped(2, 3), 5);
});

test('safe swallows throws, warns once, and keeps returning undefined', () => {
  resetWarnOnce();
  const cWarn = captureConsole('warn');
  const wrapped = safe('exploder', () => { throw new Error('nope'); });
  let r1, r2;
  try { r1 = wrapped(); r2 = wrapped(); } finally { cWarn.restore(); }
  assert.equal(r1, undefined);
  assert.equal(r2, undefined);
  assert.equal(cWarn.calls.length, 1);
  assert.equal(cWarn.calls[0][0], PREFIX);
  assert.equal(cWarn.calls[0][1], 'exploder failed:');
  assert.ok(cWarn.calls[0][2] instanceof Error);
});

test('debug prints with console.log, not console.debug, so no Verbose filter is needed', () => {
  const dom = setupDom();
  const cLog = captureConsole('log');
  const cDebug = captureConsole('debug');
  try {
    dom.window.localStorage.setItem(DEBUG_KEY, '1');
    assert.equal(debug('drag start', 'chat-1'), true);
    assert.deepEqual(cLog.calls, [[PREFIX, 'drag start', 'chat-1']]);
    assert.deepEqual(cDebug.calls, [], 'console.debug is hidden behind Chrome Verbose; never use it');
  } finally {
    cDebug.restore();
    cLog.restore();
    teardownDom(dom);
  }
});

test('debug is silent unless chatplus.debug is set to 1', () => {
  const dom = setupDom();
  const captured = captureConsole('log');
  try {
    assert.equal(debug('nothing to see'), false, 'silent with the key unset');

    dom.window.localStorage.setItem(DEBUG_KEY, '0');
    assert.equal(debug('still nothing'), false, 'silent for any value but 1');
    assert.deepEqual(captured.calls, []);

    dom.window.localStorage.setItem(DEBUG_KEY, '1');
    assert.equal(debug('drag start', 'chat-1'), true, 'prints once the key is 1');
    assert.deepEqual(captured.calls, [[PREFIX, 'drag start', 'chat-1']]);
  } finally {
    captured.restore();
    teardownDom(dom);
  }
});

test('the debug flag is re-read on every call, so the console can flip it without a reload', () => {
  const dom = setupDom();
  const captured = captureConsole('log');
  try {
    assert.equal(isDebug(), false);

    dom.window.localStorage.setItem(DEBUG_KEY, '1');
    assert.equal(isDebug(), true, 'switched on with no reload and no cache to expire');
    assert.equal(debug('on'), true);

    dom.window.localStorage.removeItem(DEBUG_KEY);
    assert.equal(isDebug(), false, 'and straight back off again');
    assert.equal(debug('off'), false);
  } finally {
    captured.restore();
    teardownDom(dom);
  }
});

test('isDebug stays false when localStorage throws', () => {
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('blocked'); },
  });
  try {
    assert.equal(isDebug(), false);
    assert.equal(debug('nope'), false);
  } finally {
    delete globalThis.localStorage;
    if (original !== undefined) globalThis.localStorage = original;
  }
});

test('tagOf names a node stably and a replacement differently, and is inert when off', () => {
  const dom = setupDom();
  try {
    const a = dom.window.document.createElement('div');
    assert.equal(tagOf(a), '-', 'no identity is handed out while debug is off');

    dom.window.localStorage.setItem(DEBUG_KEY, '1');
    const first = tagOf(a);
    assert.match(first, /^#\d+$/);
    assert.equal(tagOf(a), first, 'the same node reads back the same tag');

    const b = dom.window.document.createElement('div');
    assert.notEqual(tagOf(b), first, 'a replacement node reads back a new tag');
    assert.equal(tagOf(null), '-');
  } finally {
    teardownDom(dom);
  }
});
