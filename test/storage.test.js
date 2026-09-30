import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, captureConsole } from '../testlib/dom.js';
import { resetWarnOnce } from '../src/core/log.js';
import {
  createStorage, STORAGE_KEY, STORAGE_VERSION, DEFAULT_WIDGET_STATE, SETTINGS, WIDGET_SIZE,
} from '../src/core/storage.js';

function withDom(fn) {
  const dom = setupDom();
  resetWarnOnce();
  try { return fn(dom); } finally { teardownDom(dom); }
}

test('unknown widgets get the documented default state', () => {
  withDom((dom) => {
    const storage = createStorage({ area: dom.window.localStorage, target: dom.window });
    assert.deepEqual(storage.getWidget('chat-1'), {
      x: null, y: null, locked: true, width: null, height: null, scale: null,
    });
    assert.deepEqual({ ...DEFAULT_WIDGET_STATE }, {
      x: null, y: null, locked: true, width: null, height: null, scale: null,
    });
  });
});

test('setWidget merges, persists, and survives a reload', () => {
  withDom((dom) => {
    const area = dom.window.localStorage;
    const storage = createStorage({ area, target: dom.window });
    storage.setWidget('chat-1', { x: 120, y: 45 });
    assert.deepEqual(storage.getWidget('chat-1'), {
      x: 120, y: 45, locked: true, width: null, height: null, scale: null,
    });
    storage.setWidget('chat-1', { locked: false });
    assert.deepEqual(storage.getWidget('chat-1'), {
      x: 120, y: 45, locked: false, width: null, height: null, scale: null,
    });

    const raw = JSON.parse(area.getItem(STORAGE_KEY));
    assert.equal(raw.version, STORAGE_VERSION);
    assert.deepEqual(raw.widgets['chat-1'], {
      x: 120, y: 45, locked: false, width: null, height: null, scale: null,
    });

    const reloaded = createStorage({ area, target: dom.window });
    assert.deepEqual(reloaded.getWidget('chat-1'), {
      x: 120, y: 45, locked: false, width: null, height: null, scale: null,
    });
  });
});

test('resetting a position back to native stores nulls and keeps the lock state', () => {
  withDom((dom) => {
    const storage = createStorage({ area: dom.window.localStorage, target: dom.window });
    storage.setWidget('chat-1', { x: 10, y: 20, locked: false });
    storage.setWidget('chat-1', { x: null, y: null });
    assert.deepEqual(storage.getWidget('chat-1'), {
      x: null, y: null, locked: false, width: null, height: null, scale: null,
    });
  });
});

test('corrupt JSON resets to defaults with a warning', () => {
  withDom((dom) => {
    dom.window.localStorage.setItem(STORAGE_KEY, '{not json');
    const cWarn = captureConsole('warn');
    let storage;
    try { storage = createStorage({ area: dom.window.localStorage, target: dom.window }); }
    finally { cWarn.restore(); }
    assert.deepEqual(storage.getWidget('chat-1'), {
      x: null, y: null, locked: true, width: null, height: null, scale: null,
    });
    assert.equal(cWarn.calls.length, 1);
    assert.match(String(cWarn.calls[0][1]), /not valid JSON/);
  });
});

test('a wrong schema version resets to defaults with a warning', () => {
  withDom((dom) => {
    dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 99,
      widgets: { a: { x: 1, y: 2, locked: false } },
    }));
    const cWarn = captureConsole('warn');
    let storage;
    try { storage = createStorage({ area: dom.window.localStorage, target: dom.window }); }
    finally { cWarn.restore(); }
    assert.deepEqual(
      storage.getWidget('a'),
      { x: null, y: null, locked: true, width: null, height: null, scale: null },
      'the stored widget is gone, not carried over',
    );
    assert.equal(cWarn.calls.length, 1);
    assert.match(String(cWarn.calls[0][1]), /version/);
  });
});

test('garbage field values are sanitised to the defaults', () => {
  withDom((dom) => {
    dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      widgets: { a: { x: 'left', y: null, locked: 'yes' } },
    }));
    const storage = createStorage({ area: dom.window.localStorage, target: dom.window });
    assert.deepEqual(storage.getWidget('a'), {
      x: null, y: null, locked: true, width: null, height: null, scale: null,
    });
  });
});

test('subscribers fire on local writes and unsubscribe cleanly', () => {
  withDom((dom) => {
    const storage = createStorage({ area: dom.window.localStorage, target: dom.window });
    let hits = 0;
    const off = storage.subscribe(() => { hits += 1; });
    storage.setWidget('a', { x: 1, y: 2 });
    assert.equal(hits, 1);
    off();
    storage.setWidget('a', { x: 3, y: 4 });
    assert.equal(hits, 1);
  });
});

test('a storage event for our key re-reads and notifies; other keys are ignored', () => {
  withDom((dom) => {
    const area = dom.window.localStorage;
    const storage = createStorage({ area, target: dom.window });
    let hits = 0;
    storage.subscribe(() => { hits += 1; });

    // Simulate another tab writing.
    area.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      widgets: { 'chat-9': { x: 7, y: 8, locked: false } },
    }));
    dom.window.dispatchEvent(new dom.window.StorageEvent('storage', { key: STORAGE_KEY }));
    assert.equal(hits, 1);
    assert.deepEqual(storage.getWidget('chat-9'), {
      x: 7, y: 8, locked: false, width: null, height: null, scale: null,
    });

    dom.window.dispatchEvent(new dom.window.StorageEvent('storage', { key: 'someone-elses-key' }));
    assert.equal(hits, 1);
  });
});

test('destroy detaches the storage listener', () => {
  withDom((dom) => {
    const storage = createStorage({ area: dom.window.localStorage, target: dom.window });
    let hits = 0;
    storage.subscribe(() => { hits += 1; });
    storage.destroy();
    dom.window.dispatchEvent(new dom.window.StorageEvent('storage', { key: STORAGE_KEY }));
    assert.equal(hits, 0);
  });
});

test('a throwing subscriber does not stop the others and warns once', () => {
  withDom((dom) => {
    const storage = createStorage({ area: dom.window.localStorage, target: dom.window });
    const seen = [];
    storage.subscribe(() => { seen.push('first'); throw new Error('bad subscriber'); });
    storage.subscribe(() => { seen.push('second'); });

    const cWarn = captureConsole('warn');
    try {
      storage.setWidget('a', { x: 1, y: 2 });
      storage.setWidget('a', { x: 3, y: 4 });
    } finally { cWarn.restore(); }

    assert.deepEqual(seen, ['first', 'second', 'first', 'second']);
    assert.equal(cWarn.calls.length, 1, 'warnOnce means one warning, not one per notify');
    assert.ok(cWarn.calls[0].some((arg) => arg instanceof Error));
  });
});

test('a failing persist still updates memory and notifies, warning once', () => {
  withDom((dom) => {
    let writes = 0;
    const area = {
      getItem: () => null,
      setItem: () => { writes += 1; throw new Error('QuotaExceededError'); },
    };
    const storage = createStorage({ area, target: dom.window });
    let hits = 0;
    storage.subscribe(() => { hits += 1; });

    const cWarn = captureConsole('warn');
    try {
      storage.setWidget('a', { x: 1, y: 2 });
      storage.setWidget('a', { x: 3, y: 4 });
    } finally { cWarn.restore(); }

    assert.equal(writes, 2);
    assert.deepEqual(storage.getWidget('a'), {
      x: 3, y: 4, locked: true, width: null, height: null, scale: null,
    });
    assert.equal(hits, 2, 'the in-memory state changed, so subscribers must hear about it');
    assert.equal(cWarn.calls.length, 1, 'warnOnce means one warning, not one per failed write');
  });
});

test('settings default to a 100% message scale', () => {
  withDom((dom) => {
    const storage = createStorage({ area: dom.window.localStorage, target: dom.window });
    assert.equal(storage.getSetting('messageScale'), 100);
    assert.equal(SETTINGS.messageScale.default, 100);
    assert.deepEqual(
      [SETTINGS.messageScale.min, SETTINGS.messageScale.max],
      [80, 200],
    );
  });
});

test('setSetting persists, notifies and survives a reload', () => {
  withDom((dom) => {
    const area = dom.window.localStorage;
    const storage = createStorage({ area, target: dom.window });
    let hits = 0;
    storage.subscribe(() => { hits += 1; });

    assert.equal(storage.setSetting('messageScale', 130), 130);
    assert.equal(storage.getSetting('messageScale'), 130);
    assert.equal(hits, 1);

    const raw = JSON.parse(area.getItem(STORAGE_KEY));
    assert.equal(raw.version, STORAGE_VERSION);
    assert.deepEqual(raw.settings, { messageScale: 130 });

    const reloaded = createStorage({ area, target: dom.window });
    assert.equal(reloaded.getSetting('messageScale'), 130);
  });
});

test('settings are stored beside the widgets, not instead of them', () => {
  withDom((dom) => {
    const storage = createStorage({ area: dom.window.localStorage, target: dom.window });
    storage.setWidget('chat-1', { x: 5, y: 6 });
    storage.setSetting('messageScale', 90);
    assert.deepEqual(storage.getWidget('chat-1'), {
      x: 5, y: 6, locked: true, width: null, height: null, scale: null,
    });
    assert.equal(storage.getSetting('messageScale'), 90);
  });
});

test('a stored message scale is clamped, and garbage falls back to the default', () => {
  withDom((dom) => {
    const area = dom.window.localStorage;
    const store = (settings) => area.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION, widgets: {}, settings,
    }));
    const read = () => createStorage({ area, target: dom.window }).getSetting('messageScale');

    store({ messageScale: 5000 });
    assert.equal(read(), 200, 'clamped to the maximum');
    store({ messageScale: 5 });
    assert.equal(read(), 80, 'clamped to the minimum');
    store({ messageScale: 'huge' });
    assert.equal(read(), 100, 'garbage falls back to the default');
    store('not an object');
    assert.equal(read(), 100, 'a settings block of the wrong shape falls back too');
  });
});

test('setSetting clamps what it is given and ignores unknown settings', () => {
  withDom((dom) => {
    const storage = createStorage({ area: dom.window.localStorage, target: dom.window });
    assert.equal(storage.setSetting('messageScale', 9000), 200);
    assert.equal(storage.setSetting('messageScale', 0), 80);
    assert.equal(storage.setSetting('messageScale', 'big'), 100);
    storage.setSetting('nonsense', 1);
    assert.equal(storage.getSetting('nonsense'), undefined);
  });
});

test('a storage event carries a setting written by another tab', () => {
  withDom((dom) => {
    const area = dom.window.localStorage;
    const storage = createStorage({ area, target: dom.window });
    let hits = 0;
    storage.subscribe(() => { hits += 1; });

    area.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION, widgets: {}, settings: { messageScale: 150 },
    }));
    dom.window.dispatchEvent(new dom.window.StorageEvent('storage', { key: STORAGE_KEY }));

    assert.equal(hits, 1);
    assert.equal(storage.getSetting('messageScale'), 150);
  });
});

test('setSetting writes nothing when the value would not change, or the name is unknown', () => {
  withDom((dom) => {
    let writes = 0;
    const area = { getItem: () => null, setItem: () => { writes += 1; } };
    const storage = createStorage({ area, target: dom.window });
    let hits = 0;
    storage.subscribe(() => { hits += 1; });

    assert.equal(storage.setSetting('messageScale', 200), 200);
    assert.equal(writes, 1);
    assert.equal(hits, 1);

    storage.setSetting('messageScale', 200);
    assert.equal(writes, 1, 'the same value again is not a write');
    assert.equal(hits, 1, 'and nobody is told anything changed');

    storage.setSetting('messageScale', 9000);
    assert.equal(writes, 1, 'nor is a value that clamps to the one already stored');
    assert.equal(hits, 1);

    assert.equal(storage.setSetting('nonsense', 1), undefined);
    assert.equal(writes, 1, 'an unknown name is not a setting');
    assert.equal(hits, 1);
  });
});

/** An in-memory localStorage stand-in, so these cases need no jsdom. */
function memoryArea(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    dump: () => Object.fromEntries(items),
  };
}

test('a chat that was never sized reads back with null width and height', () => {
  const storage = createStorage({ area: memoryArea(), target: null });
  const state = storage.getWidget('chat-1');
  assert.equal(state.width, null);
  assert.equal(state.height, null);
});

test('a size is stored per chat, rounded, and never below the minimum', () => {
  const storage = createStorage({ area: memoryArea(), target: null });
  assert.deepEqual(
    storage.setWidget('chat-1', { width: 350.4, height: 419.6 }),
    { x: null, y: null, locked: true, width: 350, height: 420, scale: null },
  );
  assert.equal(storage.getWidget('chat-2').height, null, 'another chat is untouched');
  const small = storage.setWidget('chat-1', { width: 10, height: 'big' });
  assert.equal(small.width, WIDGET_SIZE.minWidth, 'too narrow is clamped up');
  assert.equal(small.height, null, 'junk is dropped');
  const cleared = storage.setWidget('chat-1', { width: null, height: null });
  assert.equal(cleared.width, null);
  assert.equal(cleared.height, null);
});

test('a chat\'s message size is its own, clamped into the setting\'s range, or null for the default', () => {
  const storage = createStorage({ area: memoryArea(), target: null });
  assert.equal(storage.getWidget('chat-1').scale, null);
  assert.equal(storage.setWidget('chat-1', { scale: 149.6 }).scale, 150);
  assert.equal(storage.setWidget('chat-1', { scale: 500 }).scale, SETTINGS.messageScale.max);
  assert.equal(storage.setWidget('chat-1', { scale: 10 }).scale, SETTINGS.messageScale.min);
  assert.equal(storage.setWidget('chat-1', { scale: 'big' }).scale, null);
  assert.deepEqual(
    Object.keys(storage.getWidget('chat-1')).sort(),
    ['height', 'locked', 'scale', 'width', 'x', 'y'],
  );
});

test('a record saved by v1.4 reads back with its position and null sizes', () => {
  const area = memoryArea({
    [STORAGE_KEY]: JSON.stringify({
      version: 1,
      widgets: { 'chat-1': { x: 5, y: 6, locked: false } },
      settings: { messageScale: 120 },
    }),
  });
  const storage = createStorage({ area, target: null });
  assert.deepEqual(storage.getWidget('chat-1'), {
    x: 5, y: 6, locked: false, width: null, height: null, scale: null,
  });
  assert.equal(storage.getSetting('messageScale'), 120);
});
