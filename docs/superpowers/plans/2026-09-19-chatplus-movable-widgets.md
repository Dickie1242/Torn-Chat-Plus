# Chat+ — Movable Chat Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Tampermonkey userscript (`dist/chatplus.user.js`) that lets a Torn City player unlock any Chat 3.0 widget, drag it by its header anywhere on screen, lock it there, and have the remaining widgets in Torn's bottom row slide over to close the gap.

**Architecture:** ES modules under `src/`, bundled by esbuild into a single IIFE with the userscript metadata block prepended. A `core/` layer knows nothing about the movable feature (`log`, `storage`, `selectors`, `observer`, `registry`); **every** Torn-specific DOM lookup lives in `src/core/selectors.js` so a Torn redesign means editing one file. A `features/movable/` layer holds the padlock toggle, the pointer drag controller, the floating-position applier and a **pure** reflow calculator. Widgets are discovered by a `MutationObserver` and fanned out to features through the registry.

**Tech Stack:** Node 20+ (developed on v24.11.1), esbuild 0.28 (bundler, `.css` text loader), jsdom 29 (DOM tests), `node --test` (test runner). No runtime dependencies. State in `localStorage` only.

**Source of truth:** `docs/superpowers/specs/2026-09-19-chatplus-movable-widgets-design.md`.

---

## Ground rules for every task

1. **Never use hashed Torn class names** (`root___FmdS_` and friends) as selectors. Only stable attributes and structural relationships: `svg[aria-label="Minimize"]`, `div[id*="-"]`, `parentElement`.
2. **All Torn DOM lookups live in `src/core/selectors.js`.** No other module may query Torn-specific structure.
3. **Never throw out of an observer or event callback.** Catch, `warnOnce`, continue.
4. **Test files must never import `src/main.js` or `src/features/movable/index.js`.** Those two modules `import` `./styles.css`, which only esbuild's text loader can resolve — plain Node would fail to load them. They are covered by the build smoke test instead.
5. Shared test helpers live in `testlib/` (NOT in `test/`), because `node --test` treats every `.js` file under a directory named `test` as a test file.
6. `dist/` is committed on purpose — it is the artifact the user pastes into Tampermonkey.
7. Verified facts about the test environment (already probed, do not re-litigate): jsdom 29 supports CSS custom properties via `style.setProperty('--x', ...)`, supports `style.setProperty('translate', '210px 0', 'important')`, supports `StorageEvent`, supports `closest()` on SVG elements, and **does not** implement `setPointerCapture` — so every call to it must be feature-guarded.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `package.json` | scripts (`build`, `watch`, `test`), devDeps `esbuild` + `jsdom`, `"type": "module"` |
| `build.mjs` | esbuild bundle `src/main.js` to `dist/chatplus.user.js` (IIFE), prepends `src/header.txt` |
| `src/header.txt` | `==UserScript==` metadata block |
| `src/main.js` | bootstrap: storage, registry, observer |
| `src/core/log.js` | prefixed console helpers, `warnOnce`, `safe()` callback wrapper |
| `src/core/storage.js` | versioned `localStorage` state, `subscribe()` fed by the `storage` event |
| `src/core/selectors.js` | **every** Torn DOM lookup |
| `src/core/observer.js` | `MutationObserver` producing `widgetAdded` / `widgetRemoved`, deduped by box |
| `src/core/registry.js` | feature registration and fan-out with error isolation |
| `src/features/movable/geometry.js` | pure `clampAxis` / `clampPosition` |
| `src/features/movable/reflow.js` | pure `computeCompensations` plus thin DOM `applyCompensations` |
| `src/features/movable/floating.js` | `applyFloating` / `clearFloating` / `isFloating` / `watchWrapper` |
| `src/features/movable/lockToggle.js` | padlock SVG, click and contextmenu handling |
| `src/features/movable/dragController.js` | pointer drag with 4px threshold, capture, clamp, persist |
| `src/features/movable/styles.css` | injected as a `<style>` element (esbuild text loader) |
| `src/features/movable/index.js` | feature module wiring all of the above |
| `testlib/dom.js` | jsdom bootstrap, fake chat widget builder, pointer-event helper |
| `test/*.test.js` | `node --test` suites |
| `README.md` | install, dev loader, manual acceptance checklist, "how to send your chat HTML" |

---

## Task 1: Project scaffold and build smoke test

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\package.json`
- Create: `D:\dev\Torn City Scripts\ChatPlus\build.mjs`
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\header.txt`
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\main.js`
- Modify: `D:\dev\Torn City Scripts\ChatPlus\.gitignore`
- Test: `D:\dev\Torn City Scripts\ChatPlus\test\build.test.js`

- [ ] **Step 1: Verify the toolchain**

Run from the repo root:

```bash
node --version
npm --version
```

Expected: `node --version` prints `v20.0.0` or higher (this machine prints `v24.11.1`). `npm --version` prints `9.0.0` or higher (this machine prints `11.6.2`). If Node is older than v20, stop — this plan's `node --test` usage requires v20+.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "chatplus",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Chat+ - movable Torn City Chat 3.0 widgets (Tampermonkey userscript)",
  "license": "MIT",
  "scripts": {
    "build": "node build.mjs",
    "watch": "node build.mjs --watch",
    "test": "node --test"
  },
  "devDependencies": {
    "esbuild": "^0.28.2",
    "jsdom": "^29.1.1"
  }
}
```

- [ ] **Step 3: Install devDependencies**

Run: `npm install`

Expected: `node_modules/` and `package-lock.json` appear and npm prints a line like `added 30 packages`. Verify the two tools are importable:

```bash
node -e "console.log(require('esbuild/package.json').version, require('jsdom/package.json').version)"
```

Expected: `0.28.2 29.1.1` (patch versions may differ).

- [ ] **Step 4: Replace `.gitignore`**

```
node_modules/

# dist/ is committed on purpose: it is the file you paste into Tampermonkey.
```

- [ ] **Step 5: Create `src/header.txt`**

```
// ==UserScript==
// @name         Chat+
// @namespace    chatplus.torn
// @version      1.0.0
// @description  Unlock, drag and lock Torn Chat 3.0 widgets anywhere on screen. Remaining widgets slide over to close the gap.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==
```

- [ ] **Step 6: Create the `src/main.js` placeholder**

Task 12 replaces this with the real bootstrap. For now the build just needs something to compile.

```js
// Bootstrap placeholder - replaced in Task 12.
console.info('[Chat+] loaded');
```

- [ ] **Step 7: Create `build.mjs`**

```js
import { build, context } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const header = (await readFile(path.join(root, 'src', 'header.txt'), 'utf8')).trimEnd();

const options = {
  absWorkingDir: root,
  entryPoints: ['src/main.js'],
  outfile: 'dist/chatplus.user.js',
  bundle: true,
  format: 'iife',
  target: ['chrome100', 'firefox100'],
  loader: { '.css': 'text' },
  banner: { js: header },
  legalComments: 'none',
  logLevel: 'warning',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[Chat+] watching src/ ...');
} else {
  await build(options);
  console.log('[Chat+] built dist/chatplus.user.js');
}
```

- [ ] **Step 8: Write the build smoke test**

Create `test/build.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'dist', 'chatplus.user.js');

function runBuild() {
  execFileSync(process.execPath, [path.join(root, 'build.mjs')], { cwd: root, stdio: 'pipe' });
  return readFileSync(outFile, 'utf8');
}

test('build produces a userscript starting with the metadata block', () => {
  const code = runBuild();
  assert.ok(existsSync(outFile), 'dist/chatplus.user.js should exist');
  assert.ok(code.startsWith('// ==UserScript=='), 'bundle must start with // ==UserScript==');
  assert.match(code, /\/\/ @name\s+Chat\+/);
  assert.match(code, /\/\/ @match\s+https:\/\/www\.torn\.com\/\*/);
  assert.match(code, /\/\/ @run-at\s+document-idle/);
  assert.match(code, /\/\/ @grant\s+none/);
  assert.match(code, /\/\/ ==\/UserScript==/);
  assert.match(code, /^\(\(\) => \{/m, 'bundle body must be an IIFE');
});
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test`

Expected: `ℹ pass 1`, `ℹ fail 0`, exit code 0. (This is scaffold verification rather than a red-green cycle: everything it asserts was created in steps 5-8.)

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json build.mjs .gitignore src/header.txt src/main.js test/build.test.js dist/chatplus.user.js
git commit -m "chore: scaffold esbuild userscript build and smoke test" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---

## Task 2: `core/log.js` — prefixed logging, `warnOnce`, `safe`

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\core\log.js`
- Create: `D:\dev\Torn City Scripts\ChatPlus\testlib\dom.js`
- Test: `D:\dev\Torn City Scripts\ChatPlus\test\log.test.js`

- [ ] **Step 1: Create the console-capture helper**

Create `testlib/dom.js` containing only this for now (later tasks append the jsdom helpers to the same file):

```js
export function captureConsole(method) {
  const original = console[method];
  const calls = [];
  console[method] = (...args) => { calls.push(args); };
  return {
    calls,
    restore() { console[method] = original; },
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `test/log.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureConsole } from '../testlib/dom.js';
import { PREFIX, info, warn, error, warnOnce, resetWarnOnce, safe } from '../src/core/log.js';

test('info/warn/error prefix every message', () => {
  const cInfo = captureConsole('info');
  try { info('hello', 1); } finally { cInfo.restore(); }
  assert.deepEqual(cInfo.calls, [[PREFIX, 'hello', 1]]);

  const cWarn = captureConsole('warn');
  try { warn('careful'); } finally { cWarn.restore(); }
  assert.deepEqual(cWarn.calls, [[PREFIX, 'careful']]);

  const cError = captureConsole('error');
  try { error('boom'); } finally { cError.restore(); }
  assert.deepEqual(cError.calls, [[PREFIX, 'boom']]);
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/log.test.js`

Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\core\log.js'`.

- [ ] **Step 4: Write the implementation**

Create `src/core/log.js`:

```js
export const PREFIX = '[Chat+]';

const warned = new Set();

export function info(...args) {
  console.info(PREFIX, ...args);
}

export function warn(...args) {
  console.warn(PREFIX, ...args);
}

export function error(...args) {
  console.error(PREFIX, ...args);
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/log.test.js`

Expected: `ℹ pass 4`, `ℹ fail 0`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/core/log.js testlib/dom.js test/log.test.js
git commit -m "feat: add prefixed logger with warnOnce and safe callback wrapper" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---

## Task 3: `core/storage.js` — versioned state with cross-tab sync

Implements spec section 5.2 (`{ x, y, locked }`, default `{ x: null, y: null, locked: true }`), section 5.6 (`localStorage["chatplus.state.v1"]` plus the `storage` event) and the section 6 rule that corrupt or wrong-version storage resets to defaults with a console warning.

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\core\storage.js`
- Modify: `D:\dev\Torn City Scripts\ChatPlus\testlib\dom.js` (append the jsdom bootstrap)
- Test: `D:\dev\Torn City Scripts\ChatPlus\test\storage.test.js`

- [ ] **Step 1: Append the jsdom bootstrap to `testlib/dom.js`**

Keep `captureConsole` from Task 2 and add this at the top (the `import`) and bottom (the rest):

```js
import { JSDOM } from 'jsdom';

const GLOBAL_KEYS = [
  'window', 'document', 'MutationObserver', 'Node', 'Element', 'SVGElement',
  'Event', 'MouseEvent', 'CustomEvent', 'StorageEvent', 'localStorage',
  'requestAnimationFrame', 'cancelAnimationFrame',
];

export function setupDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    pretendToBeVisual: true,
    url: 'https://www.torn.com/',
  });
  const w = dom.window;
  globalThis.window = w;
  globalThis.document = w.document;
  globalThis.MutationObserver = w.MutationObserver;
  globalThis.Node = w.Node;
  globalThis.Element = w.Element;
  globalThis.SVGElement = w.SVGElement;
  globalThis.Event = w.Event;
  globalThis.MouseEvent = w.MouseEvent;
  globalThis.CustomEvent = w.CustomEvent;
  globalThis.StorageEvent = w.StorageEvent;
  globalThis.localStorage = w.localStorage;
  globalThis.requestAnimationFrame = w.requestAnimationFrame.bind(w);
  globalThis.cancelAnimationFrame = w.cancelAnimationFrame.bind(w);
  return dom;
}

export function teardownDom(dom) {
  if (dom) dom.window.close();
  for (const key of GLOBAL_KEYS) delete globalThis[key];
}

/** Wait for MutationObserver / requestAnimationFrame callbacks to settle. */
export function settle(ms = 25) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 2: Write the failing test**

Create `test/storage.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, captureConsole } from '../testlib/dom.js';
import { resetWarnOnce } from '../src/core/log.js';
import { createStorage, STORAGE_KEY, STORAGE_VERSION, DEFAULT_WIDGET_STATE } from '../src/core/storage.js';

function withDom(fn) {
  const dom = setupDom();
  resetWarnOnce();
  try { return fn(dom); } finally { teardownDom(dom); }
}

test('unknown widgets get the documented default state', () => {
  withDom((dom) => {
    const storage = createStorage({ area: dom.window.localStorage, target: dom.window });
    assert.deepEqual(storage.getWidget('chat-1'), { x: null, y: null, locked: true });
    assert.deepEqual({ ...DEFAULT_WIDGET_STATE }, { x: null, y: null, locked: true });
  });
});

test('setWidget merges, persists, and survives a reload', () => {
  withDom((dom) => {
    const area = dom.window.localStorage;
    const storage = createStorage({ area, target: dom.window });
    storage.setWidget('chat-1', { x: 120, y: 45 });
    assert.deepEqual(storage.getWidget('chat-1'), { x: 120, y: 45, locked: true });
    storage.setWidget('chat-1', { locked: false });
    assert.deepEqual(storage.getWidget('chat-1'), { x: 120, y: 45, locked: false });

    const raw = JSON.parse(area.getItem(STORAGE_KEY));
    assert.equal(raw.version, STORAGE_VERSION);
    assert.deepEqual(raw.widgets['chat-1'], { x: 120, y: 45, locked: false });

    const reloaded = createStorage({ area, target: dom.window });
    assert.deepEqual(reloaded.getWidget('chat-1'), { x: 120, y: 45, locked: false });
  });
});

test('resetting a position back to native stores nulls and keeps the lock state', () => {
  withDom((dom) => {
    const storage = createStorage({ area: dom.window.localStorage, target: dom.window });
    storage.setWidget('chat-1', { x: 10, y: 20, locked: false });
    storage.setWidget('chat-1', { x: null, y: null });
    assert.deepEqual(storage.getWidget('chat-1'), { x: null, y: null, locked: false });
  });
});

test('corrupt JSON resets to defaults with a warning', () => {
  withDom((dom) => {
    dom.window.localStorage.setItem(STORAGE_KEY, '{not json');
    const cWarn = captureConsole('warn');
    let storage;
    try { storage = createStorage({ area: dom.window.localStorage, target: dom.window }); }
    finally { cWarn.restore(); }
    assert.deepEqual(storage.all(), {});
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
    assert.deepEqual(storage.all(), {});
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
    assert.deepEqual(storage.getWidget('a'), { x: null, y: null, locked: true });
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
    assert.deepEqual(storage.getWidget('chat-9'), { x: 7, y: 8, locked: false });

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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/storage.test.js`

Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\core\storage.js'`.

- [ ] **Step 4: Write the implementation**

Create `src/core/storage.js`:

```js
import { warn } from './log.js';

export const STORAGE_KEY = 'chatplus.state.v1';
export const STORAGE_VERSION = 1;

/** @typedef {{ x: number|null, y: number|null, locked: boolean }} WidgetState */
export const DEFAULT_WIDGET_STATE = Object.freeze({ x: null, y: null, locked: true });

function emptyState() {
  return { version: STORAGE_VERSION, widgets: {} };
}

function sanitizeWidget(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WIDGET_STATE };
  return {
    x: Number.isFinite(raw.x) ? raw.x : null,
    y: Number.isFinite(raw.y) ? raw.y : null,
    locked: typeof raw.locked === 'boolean' ? raw.locked : true,
  };
}

function parseState(text) {
  if (text == null) return emptyState();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    warn('stored state is not valid JSON; resetting to defaults');
    return emptyState();
  }
  if (!data || typeof data !== 'object' || data.version !== STORAGE_VERSION) {
    warn(`stored state has version ${data && data.version}, expected ${STORAGE_VERSION}; resetting to defaults`);
    return emptyState();
  }
  const source = data.widgets && typeof data.widgets === 'object' ? data.widgets : {};
  const widgets = {};
  for (const id of Object.keys(source)) widgets[id] = sanitizeWidget(source[id]);
  return { version: STORAGE_VERSION, widgets };
}

export function createStorage({ area = globalThis.localStorage, target = globalThis.window } = {}) {
  let state = emptyState();
  const listeners = new Set();

  function read() {
    try {
      state = parseState(area ? area.getItem(STORAGE_KEY) : null);
    } catch {
      warn('could not read stored state; using defaults');
      state = emptyState();
    }
  }

  function write() {
    try {
      if (area) area.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      warn('could not persist state');
    }
  }

  function notify() {
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* a bad subscriber must not break the rest */ }
    }
  }

  function getWidget(id) {
    return { ...DEFAULT_WIDGET_STATE, ...(state.widgets[id] || {}) };
  }

  function setWidget(id, patch) {
    const next = sanitizeWidget({ ...getWidget(id), ...patch });
    state.widgets[id] = next;
    write();
    notify();
    return next;
  }

  function all() {
    const out = {};
    for (const id of Object.keys(state.widgets)) out[id] = { ...state.widgets[id] };
    return out;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  const onStorage = (event) => {
    const key = event && event.key;
    if (key != null && key !== STORAGE_KEY) return;
    read();
    notify();
  };

  function destroy() {
    if (target && typeof target.removeEventListener === 'function') {
      target.removeEventListener('storage', onStorage);
    }
    listeners.clear();
  }

  read();
  if (target && typeof target.addEventListener === 'function') {
    target.addEventListener('storage', onStorage);
  }

  return { getWidget, setWidget, all, subscribe, destroy };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/storage.test.js`

Expected: `ℹ pass 9`, `ℹ fail 0`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/core/storage.js testlib/dom.js test/storage.test.js
git commit -m "feat: add versioned localStorage state with cross-tab sync" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---
## Task 4: `core/selectors.js` — the single place that knows Torn's DOM

Implements spec section 4. This is the **only** module allowed to know Torn-specific structure. Facts it encodes:

- A chat box is a `div` whose `id` contains `-`, and whose subtree contains `svg[aria-label="Minimize"]`.
- The positioned wrapper is `box.parentElement.parentElement`.
- Torn positions that wrapper with an inline `right: Npx`, `left: Npx`, or `transform: translateX(Npx)`.
- The header is the direct child of the box that contains the Minimize button.

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\core\selectors.js`
- Modify: `D:\dev\Torn City Scripts\ChatPlus\testlib\dom.js` (append the fake widget builder)
- Test: `D:\dev\Torn City Scripts\ChatPlus\test\selectors.test.js`

- [ ] **Step 1: Append the fake widget builder to `testlib/dom.js`**

```js
/**
 * Build a fake Torn chat widget:
 *   wrapper (inline positioning style)
 *     > middle
 *       > box (div with an id containing "-")
 *         > header (contains svg[aria-label="Minimize"])
 *         > body
 */
export function makeChatWidget(doc, options = {}) {
  const {
    id = 'chat-1',
    style = 'right: 0px;',
    width = 200,
    height = 120,
    extraHeaderHtml = '',
  } = options;

  const wrapper = doc.createElement('div');
  wrapper.setAttribute('style', style);
  const middle = doc.createElement('div');
  const box = doc.createElement('div');
  box.id = id;
  const header = doc.createElement('div');
  header.innerHTML = `<span class="title">${id}</span>${extraHeaderHtml}<svg aria-label="Minimize" viewBox="0 0 24 24"></svg>`;
  const body = doc.createElement('div');
  body.className = 'messages';

  box.appendChild(header);
  box.appendChild(body);
  middle.appendChild(box);
  wrapper.appendChild(middle);
  doc.body.appendChild(wrapper);
  stubRect(wrapper, { width, height });

  return { wrapper, middle, box, header, body, id };
}

/** jsdom has no layout engine, so getBoundingClientRect must be stubbed. */
export function stubRect(el, { left = 0, top = 0, width = 200, height = 120 } = {}) {
  el.getBoundingClientRect = () => ({
    left, top, width, height,
    right: left + width, bottom: top + height,
    x: left, y: top,
    toJSON() { return { left, top, width, height }; },
  });
}
```

- [ ] **Step 2: Write the failing test**

Create `test/selectors.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget } from '../testlib/dom.js';
import {
  MINIMIZE_SELECTOR, CHAT_BOX_SELECTOR,
  findChatBoxes, chatIdOf, wrapperOf, headerOf, minimizeButtonOf, naturalOffsetOf,
} from '../src/core/selectors.js';

function withDom(fn) {
  const dom = setupDom();
  try { return fn(dom); } finally { teardownDom(dom); }
}

test('the selectors are attribute-based, never hashed class names', () => {
  assert.equal(MINIMIZE_SELECTOR, 'svg[aria-label="Minimize"]');
  assert.equal(CHAT_BOX_SELECTOR, 'div[id*="-"]');
});

test('findChatBoxes returns every chat box in document order', () => {
  withDom((dom) => {
    const a = makeChatWidget(dom.window.document, { id: 'chat-a', style: 'right: 0px;' });
    const b = makeChatWidget(dom.window.document, { id: 'chat-b', style: 'right: 210px;' });
    const boxes = findChatBoxes(dom.window.document);
    assert.deepEqual(boxes.map((box) => box.id), ['chat-a', 'chat-b']);
    assert.equal(boxes[0], a.box);
    assert.equal(boxes[1], b.box);
  });
});

test('findChatBoxes dedupes a box that contains two Minimize icons', () => {
  withDom((dom) => {
    makeChatWidget(dom.window.document, {
      id: 'chat-a',
      extraHeaderHtml: '<svg aria-label="Minimize" viewBox="0 0 24 24"></svg>',
    });
    assert.equal(findChatBoxes(dom.window.document).length, 1);
  });
});

test('findChatBoxes ignores a Minimize icon with no id-bearing ancestor', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const stray = doc.createElement('div');
    stray.innerHTML = '<svg aria-label="Minimize"></svg>';
    doc.body.appendChild(stray);
    assert.deepEqual(findChatBoxes(doc), []);
  });
});

test('chatIdOf, wrapperOf, minimizeButtonOf and headerOf walk the documented structure', () => {
  withDom((dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a' });
    assert.equal(chatIdOf(w.box), 'chat-a');
    assert.equal(wrapperOf(w.box), w.wrapper);
    assert.equal(minimizeButtonOf(w.box).getAttribute('aria-label'), 'Minimize');
    assert.equal(headerOf(w.box), w.header);
    assert.equal(headerOf(w.box).parentElement, w.box);
  });
});

test('headerOf returns null when there is no Minimize button', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const box = doc.createElement('div');
    box.id = 'chat-x';
    doc.body.appendChild(box);
    assert.equal(headerOf(box), null);
    assert.equal(minimizeButtonOf(box), null);
  });
});

test('naturalOffsetOf reads right, left and translateX layouts', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const r = makeChatWidget(doc, { id: 'chat-r', style: 'right: 220px; position: absolute;' });
    const l = makeChatWidget(doc, { id: 'chat-l', style: 'left: 15.5px; position: absolute;' });
    const t = makeChatWidget(doc, { id: 'chat-t', style: 'transform: translateX(-210px);' });
    const n = makeChatWidget(doc, { id: 'chat-n', style: 'position: absolute;' });

    assert.deepEqual(naturalOffsetOf(r.wrapper), { prop: 'right', value: 220 });
    assert.deepEqual(naturalOffsetOf(l.wrapper), { prop: 'left', value: 15.5 });
    assert.deepEqual(naturalOffsetOf(t.wrapper), { prop: 'transform', value: -210 });
    assert.equal(naturalOffsetOf(n.wrapper), null);
    assert.equal(naturalOffsetOf(null), null);
  });
});

test('naturalOffsetOf still reads Torn inline style while a widget is floating', () => {
  withDom((dom) => {
    // The floating CSS class overrides via !important but never rewrites the inline style,
    // so the widget keeps contributing its native slot to the reflow calculation.
    const w = makeChatWidget(dom.window.document, { id: 'chat-r', style: 'right: 220px;' });
    w.wrapper.classList.add('chatplus-floating');
    w.wrapper.style.setProperty('--chatplus-x', '40px');
    assert.deepEqual(naturalOffsetOf(w.wrapper), { prop: 'right', value: 220 });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/selectors.test.js`

Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\core\selectors.js'`.

- [ ] **Step 4: Write the implementation**

Create `src/core/selectors.js`:

```js
/**
 * The ONLY module that knows Torn Chat 3.0's DOM shape.
 * If Torn changes its markup, this is the one file to edit.
 *
 * Hashed CSS-module class names (e.g. root___FmdS_) must never appear here:
 * they change between Torn builds.
 */

export const MINIMIZE_SELECTOR = 'svg[aria-label="Minimize"]';
export const CHAT_BOX_SELECTOR = 'div[id*="-"]';

/** @typedef {{ prop: 'right'|'left'|'transform', value: number }} NaturalOffset */

/**
 * Every chat box currently in the DOM, in document order, deduped.
 * @param {Document|Element} [root]
 * @returns {Element[]}
 */
export function findChatBoxes(root) {
  const scope = root && typeof root.querySelectorAll === 'function' ? root : globalThis.document;
  if (!scope) return [];
  const boxes = [];
  const seen = new Set();
  for (const icon of scope.querySelectorAll(MINIMIZE_SELECTOR)) {
    const box = typeof icon.closest === 'function' ? icon.closest(CHAT_BOX_SELECTOR) : null;
    if (!box || !box.id || seen.has(box)) continue;
    seen.add(box);
    boxes.push(box);
  }
  return boxes;
}

/** @returns {string|null} */
export function chatIdOf(box) {
  return box && box.id ? box.id : null;
}

/**
 * The element Torn positions in the bottom row: two levels above the chat box.
 * @returns {Element|null}
 */
export function wrapperOf(box) {
  const middle = box && box.parentElement;
  return (middle && middle.parentElement) || null;
}

/** @returns {Element|null} */
export function minimizeButtonOf(box) {
  return box ? box.querySelector(MINIMIZE_SELECTOR) : null;
}

/**
 * The header bar: the direct child of the chat box that contains the Minimize button.
 * @returns {Element|null}
 */
export function headerOf(box) {
  const icon = minimizeButtonOf(box);
  if (!icon) return null;
  let node = icon;
  while (node.parentElement && node.parentElement !== box) node = node.parentElement;
  return node.parentElement === box ? node : null;
}

/**
 * Which inline property Torn used to place this wrapper, and its value in px.
 * Reads the inline style only: our floating override lives in a stylesheet class,
 * so the native slot stays readable even while a widget floats.
 * @returns {NaturalOffset|null}
 */
export function naturalOffsetOf(wrapper) {
  if (!wrapper || !wrapper.style) return null;

  const right = parseFloat(wrapper.style.right);
  if (wrapper.style.right && Number.isFinite(right)) return { prop: 'right', value: right };

  const left = parseFloat(wrapper.style.left);
  if (wrapper.style.left && Number.isFinite(left)) return { prop: 'left', value: left };

  const match = /translateX\(\s*(-?[\d.]+)px\s*\)/.exec(wrapper.style.transform || '');
  if (match) {
    const value = parseFloat(match[1]);
    if (Number.isFinite(value)) return { prop: 'transform', value };
  }
  return null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/selectors.test.js`

Expected: `ℹ pass 8`, `ℹ fail 0`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/core/selectors.js testlib/dom.js test/selectors.test.js
git commit -m "feat: add selectors module isolating all Torn DOM lookups" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---

## Task 5: `core/observer.js` — widget discovery

Implements spec section 6/7: a `MutationObserver` on `document.body` that emits `widgetAdded` / `widgetRemoved` with a Widget record `{ id, box, wrapper, header }`, deduped by box. Scanning is exposed synchronously as `scan()` so it is directly testable; the observer callback just schedules a rAF-coalesced `scan()`.

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\core\observer.js`
- Test: `D:\dev\Torn City Scripts\ChatPlus\test\observer.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/observer.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, captureConsole, settle } from '../testlib/dom.js';
import { resetWarnOnce } from '../src/core/log.js';
import * as selectors from '../src/core/selectors.js';
import { createObserver } from '../src/core/observer.js';

async function withDom(fn) {
  const dom = setupDom();
  resetWarnOnce();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

test('scan discovers a widget and builds the Widget record', async () => {
  await withDom((dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a' });
    const added = [];
    const observer = createObserver({ selectors, onWidgetAdded: (x) => added.push(x) });
    observer.scan();
    assert.equal(added.length, 1);
    assert.equal(added[0].id, 'chat-a');
    assert.equal(added[0].box, w.box);
    assert.equal(added[0].wrapper, w.wrapper);
    assert.equal(added[0].header, w.header);
  });
});

test('scan dedupes: a second scan does not re-add the same box', async () => {
  await withDom((dom) => {
    makeChatWidget(dom.window.document, { id: 'chat-a' });
    let added = 0;
    const observer = createObserver({ selectors, onWidgetAdded: () => { added += 1; } });
    observer.scan();
    observer.scan();
    observer.scan();
    assert.equal(added, 1);
    assert.deepEqual(observer.list().map((w) => w.id), ['chat-a']);
  });
});

test('removing a widget from the DOM emits widgetRemoved exactly once', async () => {
  await withDom((dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a' });
    const removed = [];
    const observer = createObserver({ selectors, onWidgetRemoved: (x) => removed.push(x) });
    observer.scan();
    w.wrapper.remove();
    observer.scan();
    observer.scan();
    assert.equal(removed.length, 1);
    assert.equal(removed[0].id, 'chat-a');
    assert.deepEqual(observer.list(), []);
  });
});

test('re-adding a minimized widget is treated as a brand new widget', async () => {
  await withDom((dom) => {
    const doc = dom.window.document;
    const w = makeChatWidget(doc, { id: 'chat-a' });
    const events = [];
    const observer = createObserver({
      selectors,
      onWidgetAdded: (x) => events.push(`add:${x.id}`),
      onWidgetRemoved: (x) => events.push(`remove:${x.id}`),
    });
    observer.scan();
    w.wrapper.remove();
    observer.scan();
    doc.body.appendChild(w.wrapper);
    observer.scan();
    assert.deepEqual(events, ['add:chat-a', 'remove:chat-a', 'add:chat-a']);
  });
});

test('a throwing callback never escapes scan', async () => {
  await withDom((dom) => {
    makeChatWidget(dom.window.document, { id: 'chat-a' });
    makeChatWidget(dom.window.document, { id: 'chat-b' });
    const seen = [];
    const observer = createObserver({
      selectors,
      onWidgetAdded: (w) => { seen.push(w.id); throw new Error('feature blew up'); },
    });
    const cWarn = captureConsole('warn');
    try { observer.scan(); } finally { cWarn.restore(); }
    assert.deepEqual(seen, ['chat-a', 'chat-b']);
    assert.equal(cWarn.calls.length, 1, 'warnOnce means one warning, not one per widget');
  });
});

test('start scans immediately and again after a DOM mutation', async () => {
  await withDom(async (dom) => {
    const doc = dom.window.document;
    makeChatWidget(doc, { id: 'chat-a' });
    const added = [];
    const observer = createObserver({ selectors, onWidgetAdded: (w) => added.push(w.id) });
    observer.start();
    assert.deepEqual(added, ['chat-a']);

    makeChatWidget(doc, { id: 'chat-b' });
    await settle();
    assert.deepEqual(added, ['chat-a', 'chat-b']);

    observer.stop();
    makeChatWidget(doc, { id: 'chat-c' });
    await settle();
    assert.deepEqual(added, ['chat-a', 'chat-b']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/observer.test.js`

Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\core\observer.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/core/observer.js`:

```js
import { safe, warnOnce } from './log.js';

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
  let scheduled = false;

  const emitAdded = safe('observer.onWidgetAdded', (widget) => {
    if (onWidgetAdded) onWidgetAdded(widget);
  });
  const emitRemoved = safe('observer.onWidgetRemoved', (widget) => {
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

    for (const box of selectors.findChatBoxes(doc)) {
      if (widgets.has(box)) continue;
      const widget = buildWidget(box);
      if (!widget) {
        warnOnce(`observer.shape:${box.id}`, 'could not read the structure of chat widget', box.id);
        continue;
      }
      widgets.set(box, widget);
      emitAdded(widget);
    }

    for (const [box, widget] of [...widgets]) {
      if (doc.body.contains(box)) continue;
      widgets.delete(box);
      emitRemoved(widget);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const raf = typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame
      : (fn) => setTimeout(fn, 16);
    raf(() => {
      scheduled = false;
      scan();
    });
  }

  function start() {
    if (mutationObserver) return;
    const doc = globalThis.document;
    if (!doc || !doc.body) return;
    mutationObserver = new globalThis.MutationObserver(schedule);
    mutationObserver.observe(doc.body, { childList: true, subtree: true });
    scan();
  }

  function stop() {
    if (!mutationObserver) return;
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  function list() {
    return [...widgets.values()];
  }

  return { start, stop, scan, list };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/observer.test.js`

Expected: `ℹ pass 6`, `ℹ fail 0`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/observer.js test/observer.test.js
git commit -m "feat: add mutation observer that discovers chat widgets" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---

## Task 6: `core/registry.js` — feature fan-out

Implements spec section 6: `registerFeature({ id, init(ctx), onWidgetAdded(w, ctx), onWidgetRemoved(w, ctx) })` where `ctx = { storage, selectors, log }`. One broken feature must not break the others.

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\core\registry.js`
- Test: `D:\dev\Torn City Scripts\ChatPlus\test\registry.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/registry.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/registry.test.js`

Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\core\registry.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/core/registry.js`:

```js
import { safe } from './log.js';

/**
 * @typedef {Object} Feature
 * @property {string} id
 * @property {(ctx: any) => void} [init]
 * @property {(widget: any, ctx: any) => void} [onWidgetAdded]
 * @property {(widget: any, ctx: any) => void} [onWidgetRemoved]
 */

/**
 * Holds the registered features and fans widget lifecycle events out to them.
 * A feature that throws is reported once and never blocks the others.
 */
export function createRegistry(ctx) {
  /** @type {Feature[]} */
  const features = [];

  function fanOut(hookName, args) {
    for (const feature of features) {
      const hook = feature[hookName];
      if (typeof hook !== 'function') continue;
      safe(`${feature.id}.${hookName}`, hook)(...args);
    }
  }

  const api = {
    /** @param {Feature} feature */
    register(feature) {
      if (feature && typeof feature.id === 'string' && feature.id) features.push(feature);
      return api;
    },
    init() {
      fanOut('init', [ctx]);
    },
    widgetAdded(widget) {
      fanOut('onWidgetAdded', [widget, ctx]);
    },
    widgetRemoved(widget) {
      fanOut('onWidgetRemoved', [widget, ctx]);
    },
    list() {
      return features.map((feature) => feature.id);
    },
  };

  return api;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/registry.test.js`

Expected: `ℹ pass 5`, `ℹ fail 0`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/registry.js test/registry.test.js
git commit -m "feat: add feature registry with error isolation" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---

## Task 7: `features/movable/reflow.js` — gap-closing row layout

Implements spec section 5.5. This is the heart of the feature and the main pure-function unit under test.

**The algorithm (ours, not a copy):** Torn lays widgets out in a row at a set of *slots* — the inline `right` / `left` / `translateX` values it wrote. When some widgets float away, the remaining native widgets should occupy the slots nearest the anchor edge, in their existing order, so no gap is left.

1. Collect `{ id, natural, floating }` for every widget that reports an offset for the shared property.
2. Sort by distance from Torn's anchor edge, ascending. For `right` and `left` that is `natural` itself (Torn's value *is* the distance from its anchor). For `transform` the anchor slot is `translateX(0)` — the untranslated base position — so the key is `Math.abs(natural)`. Ties break on input order so the result is deterministic.
3. The sorted `natural` values are the available slots.
4. Walk the sorted list; each **native** widget consumes the next slot from the front, floating widgets consume none.
5. `compensation = axisSign * (targetSlot - natural)`, where `axisSign` is `-1` for `right` (a larger `right` means further **left** on screen) and `+1` for `left` and `transform`.

> Note: Torn Chat Hider's version of this uses `dir = -1` for both `right` and `left`, which is only correct for `right`. Our `axisSign` table fixes the `left` case — hence the dedicated left-anchored tests.

The compensation is written as `translate: Xpx 0` with `!important` (an independent transform property, so it never clobbers Torn's own `transform`). Values below 0.5px remove the property entirely.

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\features\movable\reflow.js`
- Test: `D:\dev\Torn City Scripts\ChatPlus\test\reflow.test.js`

- [ ] **Step 1: Write the failing pure-function test**

Create `test/reflow.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget } from '../testlib/dom.js';
import * as selectors from '../src/core/selectors.js';
import { computeCompensations, applyCompensations, COMP_EPSILON } from '../src/features/movable/reflow.js';

function asObject(map) {
  return Object.fromEntries([...map.entries()]);
}

test('right-anchored row with nothing floating needs no compensation', () => {
  const result = computeCompensations({
    prop: 'right',
    widgets: [
      { id: 'a', natural: 10, floating: false },
      { id: 'b', natural: 220, floating: false },
      { id: 'c', natural: 430, floating: false },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: 0 });
});

test('right-anchored row closes the gap left by one floating widget', () => {
  const result = computeCompensations({
    prop: 'right',
    widgets: [
      { id: 'a', natural: 10, floating: false },
      { id: 'b', natural: 220, floating: true },
      { id: 'c', natural: 430, floating: false },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: 210 });
});

test('right-anchored row closes the gap left by two floating widgets', () => {
  const result = computeCompensations({
    prop: 'right',
    widgets: [
      { id: 'a', natural: 10, floating: true },
      { id: 'b', natural: 220, floating: true },
      { id: 'c', natural: 430, floating: false },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: 420 });
});

test('left-anchored row shifts the survivors toward the left edge', () => {
  const result = computeCompensations({
    prop: 'left',
    widgets: [
      { id: 'a', natural: 10, floating: false },
      { id: 'b', natural: 220, floating: true },
      { id: 'c', natural: 430, floating: false },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: -210 });
});

test('translateX row anchored at 0 with negative offsets', () => {
  const result = computeCompensations({
    prop: 'transform',
    widgets: [
      { id: 'a', natural: 0, floating: false },
      { id: 'b', natural: -210, floating: true },
      { id: 'c', natural: -420, floating: false },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: 210 });
});

test('translateX row anchored at 0 with positive offsets', () => {
  const result = computeCompensations({
    prop: 'transform',
    widgets: [
      { id: 'a', natural: 0, floating: false },
      { id: 'b', natural: 210, floating: true },
      { id: 'c', natural: 420, floating: false },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: -210 });
});

test('input order does not matter, only the natural offsets do', () => {
  const result = computeCompensations({
    prop: 'right',
    widgets: [
      { id: 'c', natural: 430, floating: false },
      { id: 'a', natural: 10, floating: false },
      { id: 'b', natural: 220, floating: true },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: 210 });
});

test('a single widget, all widgets floating, and an empty row are all no-ops', () => {
  assert.deepEqual(asObject(computeCompensations({
    prop: 'right', widgets: [{ id: 'a', natural: 10, floating: false }],
  })), { a: 0 });
  assert.deepEqual(asObject(computeCompensations({
    prop: 'right',
    widgets: [{ id: 'a', natural: 10, floating: true }, { id: 'b', natural: 220, floating: true }],
  })), { a: 0, b: 0 });
  assert.equal(computeCompensations({ prop: 'right', widgets: [] }).size, 0);
});

test('malformed layouts produce an empty map instead of throwing', () => {
  assert.equal(computeCompensations(null).size, 0);
  assert.equal(computeCompensations({ prop: 'bottom', widgets: [{ id: 'a', natural: 1 }] }).size, 0);
  assert.equal(computeCompensations({ prop: 'right', widgets: null }).size, 0);
  assert.equal(computeCompensations({
    prop: 'right', widgets: [{ id: 'a', natural: NaN }, { id: null, natural: 3 }],
  }).size, 0);
});

test('COMP_EPSILON is the sub-pixel threshold below which no property is written', () => {
  assert.equal(COMP_EPSILON, 0.5);
});
```

- [ ] **Step 2: Add the DOM applier test to the same file**

Append to `test/reflow.test.js`:

```js
function withDom(fn) {
  const dom = setupDom();
  try { return fn(dom); } finally { teardownDom(dom); }
}

test('applyCompensations writes translate with !important and removes it when zero', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const a = makeChatWidget(doc, { id: 'chat-a', style: 'right: 10px;' });
    const b = makeChatWidget(doc, { id: 'chat-b', style: 'right: 220px;' });
    const c = makeChatWidget(doc, { id: 'chat-c', style: 'right: 430px;' });
    const widgets = [
      { id: 'chat-a', wrapper: a.wrapper },
      { id: 'chat-b', wrapper: b.wrapper },
      { id: 'chat-c', wrapper: c.wrapper },
    ];

    // Pre-existing stale compensation that must be cleared.
    a.wrapper.style.setProperty('translate', '99px 0', 'important');

    const result = applyCompensations(widgets, selectors, (w) => w.id === 'chat-b');

    assert.deepEqual(Object.fromEntries(result.entries()), { 'chat-a': 0, 'chat-b': 0, 'chat-c': 210 });
    assert.ok(!a.wrapper.getAttribute('style').includes('translate'), 'zero compensation removes translate');
    assert.ok(!b.wrapper.getAttribute('style').includes('translate'), 'floating widgets are never compensated');
    assert.match(c.wrapper.getAttribute('style'), /translate: 210px 0 !important/);
    assert.match(a.wrapper.getAttribute('style'), /right: 10px/, 'Torn inline style is untouched');
  });
});

test('applyCompensations ignores disconnected wrappers and mixed positioning props', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const a = makeChatWidget(doc, { id: 'chat-a', style: 'right: 10px;' });
    const b = makeChatWidget(doc, { id: 'chat-b', style: 'right: 220px;' });
    const odd = makeChatWidget(doc, { id: 'chat-odd', style: 'left: 5px;' });
    const gone = makeChatWidget(doc, { id: 'chat-gone', style: 'right: 640px;' });
    gone.wrapper.remove();

    const result = applyCompensations(
      [
        { id: 'chat-a', wrapper: a.wrapper },
        { id: 'chat-b', wrapper: b.wrapper },
        { id: 'chat-odd', wrapper: odd.wrapper },
        { id: 'chat-gone', wrapper: gone.wrapper },
      ],
      selectors,
      (w) => w.id === 'chat-a',
    );

    assert.deepEqual(Object.fromEntries(result.entries()), { 'chat-a': 0, 'chat-b': 210 });
    assert.match(b.wrapper.getAttribute('style'), /translate: 210px 0 !important/);
    assert.ok(!odd.wrapper.getAttribute('style').includes('translate'));
  });
});

test('applyCompensations on an empty or offset-less row returns an empty map', () => {
  withDom((dom) => {
    const plain = makeChatWidget(dom.window.document, { id: 'chat-a', style: 'position: absolute;' });
    assert.equal(applyCompensations([], selectors).size, 0);
    assert.equal(applyCompensations([{ id: 'chat-a', wrapper: plain.wrapper }], selectors).size, 0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/reflow.test.js`

Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\features\movable\reflow.js'`.

- [ ] **Step 4: Write the implementation**

Create `src/features/movable/reflow.js`:

```js
/**
 * Row reflow: when widgets float out of Torn's bottom row, the survivors pack
 * toward Torn's anchor edge so no gap is left behind.
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
 * @typedef {{ id: string, natural: number, floating?: boolean }} RowWidget
 * @typedef {{ prop: 'right'|'left'|'transform', widgets: RowWidget[] }} RowLayout
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
    entries.push({ id: w.id, natural: w.natural, floating: !!w.floating, index });
  }
  if (entries.length === 0) return result;

  entries.sort((a, b) => {
    const delta = anchorDistance(layout.prop, a.natural) - anchorDistance(layout.prop, b.natural);
    return delta !== 0 ? delta : a.index - b.index;
  });

  const slots = entries.map((entry) => entry.natural);
  let nextSlot = 0;
  for (const entry of entries) {
    if (entry.floating) {
      result.set(entry.id, 0);
      continue;
    }
    const target = slots[nextSlot];
    nextSlot += 1;
    result.set(entry.id, sign * (target - entry.natural));
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
 * @returns {Map<string, number>} the compensations that were applied.
 */
export function applyCompensations(widgets, selectors, isFloating = () => false) {
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
    widgets: row.map((entry) => ({
      id: entry.widget.id,
      natural: entry.offset.value,
      floating: !!isFloating(entry.widget),
    })),
  });

  for (const entry of row) {
    const value = compensations.get(entry.widget.id) || 0;
    const style = entry.widget.wrapper.style;
    if (Math.abs(value) < COMP_EPSILON) style.removeProperty('translate');
    else style.setProperty('translate', `${value}px 0`, 'important');
  }

  return compensations;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/reflow.test.js`

Expected: `ℹ pass 13`, `ℹ fail 0`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/movable/reflow.js test/reflow.test.js
git commit -m "feat: add pure gap-closing reflow calculator and DOM applier" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---
## Task 8: `features/movable/floating.js` — floating position and style re-assertion

Implements spec section 5.3 ("the wrapper becomes floating via a class plus CSS custom properties with `!important`, neutralizing Torn's `right`/`left`/`transform`") and the section 4 fact that Torn rewrites inline styles on re-render, so overrides must be re-asserted from a `MutationObserver` with `attributeFilter`.

We observe `style` **and** `class`: React re-renders rewrite `className` as readily as `style`, and losing the class loses the whole floating override. Re-assertion is written so a settled widget produces no further mutations, which is what stops the observer from looping.

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\features\movable\floating.js`
- Test: `D:\dev\Torn City Scripts\ChatPlus\test\floating.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/floating.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, settle } from '../testlib/dom.js';
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/floating.test.js`

Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\features\movable\floating.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/features/movable/floating.js`:

```js
/**
 * Floating widgets: a wrapper pulled out of Torn's bottom row and pinned to
 * viewport coordinates.
 *
 * The position lives in two CSS custom properties; the actual
 * `position: fixed; left; top` (and the neutralisation of Torn's
 * right/left/transform) lives in styles.css under FLOATING_CLASS, using
 * !important so it beats Torn's non-important inline styles.
 */

export const FLOATING_CLASS = 'chatplus-floating';
export const VAR_X = '--chatplus-x';
export const VAR_Y = '--chatplus-y';

/**
 * Pin a wrapper at viewport coordinates (x, y).
 * Writes nothing when the wrapper is already in the desired state, which is
 * what keeps watchWrapper from looping.
 */
export function applyFloating(wrapper, x, y) {
  if (!wrapper || !wrapper.style || !wrapper.classList) return;
  const wantX = `${Math.round(Number(x) || 0)}px`;
  const wantY = `${Math.round(Number(y) || 0)}px`;
  if (wrapper.style.getPropertyValue(VAR_X) !== wantX) wrapper.style.setProperty(VAR_X, wantX);
  if (wrapper.style.getPropertyValue(VAR_Y) !== wantY) wrapper.style.setProperty(VAR_Y, wantY);
  // A floating widget is out of the row, so any row compensation must go.
  wrapper.style.removeProperty('translate');
  if (!wrapper.classList.contains(FLOATING_CLASS)) wrapper.classList.add(FLOATING_CLASS);
}

/** Put a wrapper back under Torn's own row layout. */
export function clearFloating(wrapper) {
  if (!wrapper || !wrapper.style || !wrapper.classList) return;
  wrapper.classList.remove(FLOATING_CLASS);
  wrapper.style.removeProperty(VAR_X);
  wrapper.style.removeProperty(VAR_Y);
}

/** @returns {boolean} */
export function isFloating(wrapper) {
  return !!(wrapper && wrapper.classList && wrapper.classList.contains(FLOATING_CLASS));
}

/**
 * Re-assert the floating override whenever Torn rewrites the wrapper's
 * style or class attributes.
 *
 * @param {Element} wrapper
 * @param {() => ({x: number, y: number}|null)} getDesired
 *   The position the widget should hold, or null if it should not float.
 * @param {() => void} [onChange]
 *   Called after each mutation batch, floating or not, so the caller can
 *   reflow the row when Torn repositions anything.
 * @returns {() => void} stop watching.
 */
export function watchWrapper(wrapper, getDesired, onChange) {
  const MO = globalThis.MutationObserver;
  if (!wrapper || typeof MO !== 'function') return () => {};
  const observer = new MO(() => {
    const desired = getDesired();
    if (desired) applyFloating(wrapper, desired.x, desired.y);
    if (onChange) onChange();
  });
  observer.observe(wrapper, { attributes: true, attributeFilter: ['style', 'class'] });
  return () => observer.disconnect();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/floating.test.js`

Expected: `ℹ pass 9`, `ℹ fail 0`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/movable/floating.js test/floating.test.js
git commit -m "feat: add floating position applier with style re-assertion" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---

## Task 9: `features/movable/geometry.js` — the pure clamp helper

Implements spec section 5.3: "Position is clamped so the whole widget stays inside the viewport. If the widget is larger than the viewport, its top-left is clamped to 0."

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\features\movable\geometry.js`
- Test: `D:\dev\Torn City Scripts\ChatPlus\test\geometry.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/geometry.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampAxis, clampPosition } from '../src/features/movable/geometry.js';

test('clampAxis leaves a value that already fits', () => {
  assert.equal(clampAxis(100, 200, 1000), 100);
  assert.equal(clampAxis(0, 200, 1000), 0);
  assert.equal(clampAxis(800, 200, 1000), 800);
});

test('clampAxis pins negatives to 0 and overshoot to the far edge', () => {
  assert.equal(clampAxis(-50, 200, 1000), 0);
  assert.equal(clampAxis(950, 200, 1000), 800);
});

test('clampAxis returns 0 when the widget is larger than or exactly fills the viewport', () => {
  assert.equal(clampAxis(50, 1200, 1000), 0, 'oversized widget pins to 0');
  assert.equal(clampAxis(-50, 1200, 1000), 0);
  assert.equal(clampAxis(50, 1000, 1000), 0, 'exact fit leaves no room to move');
});

test('clampAxis treats non-finite input as 0', () => {
  assert.equal(clampAxis(NaN, 200, 1000), 0);
  assert.equal(clampAxis(Infinity, 200, 1000), 800);
  assert.equal(clampAxis(100, NaN, 1000), 0);
  assert.equal(clampAxis(100, 200, NaN), 0);
});

test('clampPosition clamps both axes independently', () => {
  assert.deepEqual(
    clampPosition({ x: -20, y: 900, width: 200, height: 120, viewportWidth: 1000, viewportHeight: 800 }),
    { x: 0, y: 680 },
  );
  assert.deepEqual(
    clampPosition({ x: 300, y: 200, width: 200, height: 120, viewportWidth: 1000, viewportHeight: 800 }),
    { x: 300, y: 200 },
  );
  assert.deepEqual(
    clampPosition({ x: 300, y: 200, width: 1400, height: 900, viewportWidth: 1000, viewportHeight: 800 }),
    { x: 0, y: 0 },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/geometry.test.js`

Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\features\movable\geometry.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/features/movable/geometry.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/geometry.test.js`

Expected: `ℹ pass 5`, `ℹ fail 0`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/movable/geometry.js test/geometry.test.js
git commit -m "feat: add pure viewport clamp helper" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---

## Task 10: `features/movable/lockToggle.js` — the padlock button

Implements spec section 5.1 exactly:
- a 24x24 SVG padlock inserted **immediately before** the Minimize button,
- `aria-label="Chat+ lock"`, title text that swaps with the state,
- closed padlock = locked, open padlock = unlocked, click toggles,
- right-click (contextmenu, default prevented) resets the position, leaving the lock state alone.

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\features\movable\lockToggle.js`
- Test: `D:\dev\Torn City Scripts\ChatPlus\test\lockToggle.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/lockToggle.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget } from '../testlib/dom.js';
import * as selectors from '../src/core/selectors.js';
import {
  LOCK_CLASS, LOCK_ATTR, UNLOCKED_CLASS,
  SHACKLE_LOCKED, SHACKLE_UNLOCKED, TITLE_LOCKED, TITLE_UNLOCKED,
  createLockToggle,
} from '../src/features/movable/lockToggle.js';

function withDom(fn) {
  const dom = setupDom();
  try { return fn(dom); } finally { teardownDom(dom); }
}

function build(dom, options = {}) {
  const w = makeChatWidget(dom.window.document, { id: 'chat-a', ...options.widget });
  const widget = { id: 'chat-a', box: w.box, wrapper: w.wrapper, header: w.header };
  const events = [];
  let locked = options.locked === undefined ? true : options.locked;
  const toggle = createLockToggle({
    widget,
    selectors,
    isLocked: () => locked,
    onToggle: (next) => { locked = next; events.push(['toggle', next]); },
    onReset: () => { events.push(['reset']); },
  });
  return { w, widget, toggle, events, setLocked: (v) => { locked = v; } };
}

test('mount inserts the padlock immediately before the Minimize button', () => {
  withDom((dom) => {
    const t = build(dom);
    const element = t.toggle.mount();
    const minimize = selectors.minimizeButtonOf(t.widget.box);
    assert.equal(minimize.previousElementSibling, element);
    assert.equal(element.getAttribute('aria-label'), 'Chat+ lock');
    assert.equal(element.getAttribute(LOCK_ATTR), '1');
    assert.equal(element.getAttribute('width'), '24');
    assert.equal(element.getAttribute('height'), '24');
    assert.ok(element.classList.contains(LOCK_CLASS));
  });
});

test('the locked state shows a closed shackle and the locked title', () => {
  withDom((dom) => {
    const t = build(dom, { locked: true });
    const element = t.toggle.mount();
    assert.equal(element.getAttribute('title'), TITLE_LOCKED);
    assert.equal(element.querySelector('title').textContent, TITLE_LOCKED);
    assert.equal(element.getAttribute('aria-pressed'), 'true');
    assert.equal(element.querySelector('path').getAttribute('d'), SHACKLE_LOCKED);
    assert.ok(!element.classList.contains(UNLOCKED_CLASS));
    assert.equal(TITLE_LOCKED, 'Locked — click to unlock and drag by the header. Right-click to reset position.');
  });
});

test('sync swaps to the open shackle and the unlocked title', () => {
  withDom((dom) => {
    const t = build(dom, { locked: true });
    const element = t.toggle.mount();
    t.setLocked(false);
    t.toggle.sync();
    assert.equal(element.getAttribute('title'), TITLE_UNLOCKED);
    assert.equal(element.querySelector('title').textContent, TITLE_UNLOCKED);
    assert.equal(element.getAttribute('aria-pressed'), 'false');
    assert.equal(element.querySelector('path').getAttribute('d'), SHACKLE_UNLOCKED);
    assert.ok(element.classList.contains(UNLOCKED_CLASS));
    assert.notEqual(SHACKLE_LOCKED, SHACKLE_UNLOCKED);
  });
});

test('click toggles the lock and does not reach Torn handlers', () => {
  withDom((dom) => {
    const t = build(dom, { locked: true });
    const element = t.toggle.mount();
    let bubbled = 0;
    t.widget.header.addEventListener('click', () => { bubbled += 1; });

    const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);

    assert.deepEqual(t.events, [['toggle', false]]);
    assert.equal(event.defaultPrevented, true);
    assert.equal(bubbled, 0, 'the click must not propagate to Torn');

    element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.deepEqual(t.events, [['toggle', false], ['toggle', true]]);
  });
});

test('right-click resets the position, prevents the menu, and leaves the lock alone', () => {
  withDom((dom) => {
    const t = build(dom, { locked: false });
    const element = t.toggle.mount();
    const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    assert.deepEqual(t.events, [['reset']]);
    assert.equal(event.defaultPrevented, true);
  });
});

test('mounting twice never duplicates the padlock', () => {
  withDom((dom) => {
    const t = build(dom);
    const first = t.toggle.mount();
    const second = t.toggle.mount();
    assert.equal(first, second);
    assert.equal(t.widget.box.querySelectorAll(`[${LOCK_ATTR}]`).length, 1);
  });
});

test('mount replaces a stale padlock left behind by a Torn re-render', () => {
  withDom((dom) => {
    const t = build(dom);
    const first = t.toggle.mount();
    // Torn rebuilds the header subtree but our detached instance still points at the old node.
    first.remove();
    const stale = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    stale.setAttribute(LOCK_ATTR, '1');
    const minimize = selectors.minimizeButtonOf(t.widget.box);
    minimize.parentNode.insertBefore(stale, minimize);

    const remounted = t.toggle.mount();
    assert.equal(t.widget.box.querySelectorAll(`[${LOCK_ATTR}]`).length, 1);
    assert.equal(selectors.minimizeButtonOf(t.widget.box).previousElementSibling, remounted);
  });
});

test('unmount removes the padlock and mount returns null without a Minimize button', () => {
  withDom((dom) => {
    const t = build(dom);
    t.toggle.mount();
    t.toggle.unmount();
    assert.equal(t.widget.box.querySelectorAll(`[${LOCK_ATTR}]`).length, 0);

    selectors.minimizeButtonOf(t.widget.box).remove();
    assert.equal(t.toggle.mount(), null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/lockToggle.test.js`

Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\features\movable\lockToggle.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/features/movable/lockToggle.js`:

```js
/** The per-widget padlock button that lives in the chat header. */

const SVG_NS = 'http://www.w3.org/2000/svg';

export const LOCK_CLASS = 'chatplus-lock';
export const UNLOCKED_CLASS = 'chatplus-lock--unlocked';
export const LOCK_ATTR = 'data-chatplus-lock';

/** Closed shackle: both legs reach down into the body. */
export const SHACKLE_LOCKED = 'M8 10V7a4 4 0 0 1 8 0v3';
/** Open shackle: the right leg stays up. */
export const SHACKLE_UNLOCKED = 'M8 10V7a4 4 0 0 1 8 0';

export const TITLE_LOCKED = 'Locked — click to unlock and drag by the header. Right-click to reset position.';
export const TITLE_UNLOCKED = 'Unlocked — drag by the header. Click to lock. Right-click to reset position.';

/**
 * @param {Object} config
 * @param {{id: string, box: Element}} config.widget
 * @param {typeof import('../../core/selectors.js')} config.selectors
 * @param {() => boolean} config.isLocked
 * @param {(locked: boolean) => void} config.onToggle
 * @param {() => void} config.onReset
 */
export function createLockToggle({ widget, selectors, isLocked, onToggle, onReset }) {
  const doc = widget.box.ownerDocument;
  let element = null;

  function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (onToggle) onToggle(!isLocked());
    sync();
  }

  function handleContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    if (onReset) onReset();
    sync();
  }

  function build() {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('role', 'button');
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('aria-label', 'Chat+ lock');
    svg.setAttribute(LOCK_ATTR, '1');
    svg.classList.add(LOCK_CLASS);
    svg.innerHTML = [
      '<title></title>',
      '<rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"></rect>',
      `<path fill="none" stroke="currentColor" stroke-width="2" d="${SHACKLE_LOCKED}"></path>`,
    ].join('');
    svg.addEventListener('click', handleClick);
    svg.addEventListener('contextmenu', handleContextMenu);
    return svg;
  }

  /** Push the current lock state into the rendered padlock. */
  function sync() {
    if (!element) return;
    const locked = !!isLocked();
    const titleText = locked ? TITLE_LOCKED : TITLE_UNLOCKED;
    element.setAttribute('title', titleText);
    element.setAttribute('aria-pressed', String(locked));
    const titleNode = element.querySelector('title');
    if (titleNode) titleNode.textContent = titleText;
    const path = element.querySelector('path');
    if (path) path.setAttribute('d', locked ? SHACKLE_LOCKED : SHACKLE_UNLOCKED);
    if (locked) element.classList.remove(UNLOCKED_CLASS);
    else element.classList.add(UNLOCKED_CLASS);
  }

  /** @returns {Element|null} the padlock, or null if the header has no Minimize button. */
  function mount() {
    if (element && element.isConnected) {
      sync();
      return element;
    }
    const minimize = selectors.minimizeButtonOf(widget.box);
    if (!minimize || !minimize.parentNode) return null;
    for (const stale of widget.box.querySelectorAll(`[${LOCK_ATTR}]`)) stale.remove();
    element = build();
    minimize.parentNode.insertBefore(element, minimize);
    sync();
    return element;
  }

  function unmount() {
    if (!element) return;
    element.removeEventListener('click', handleClick);
    element.removeEventListener('contextmenu', handleContextMenu);
    element.remove();
    element = null;
  }

  return {
    mount,
    unmount,
    sync,
    get element() { return element; },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/lockToggle.test.js`

Expected: `ℹ pass 8`, `ℹ fail 0`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/movable/lockToggle.js test/lockToggle.test.js
git commit -m "feat: add per-widget padlock toggle with reset on right-click" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---

## Task 11: `features/movable/dragController.js` — header dragging

Implements spec section 5.3:
- only unlocked widgets drag; the handle is the header,
- `pointerdown` that is NOT on a button, link, input or the padlock starts a *candidate* drag,
- movement must exceed 4px before it becomes a real drag, so header clicks still work,
- `setPointerCapture` keeps the drag alive outside the element (guarded — jsdom has no such method),
- the position is clamped into the viewport every frame,
- `pointerup` / `pointercancel` persists `{x, y}`.

Move/up/cancel listeners go on the **document** rather than the header: that works identically with and without pointer capture (captured pointer events still bubble to the document), and keeps the controller testable under jsdom.

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\features\movable\dragController.js`
- Modify: `D:\dev\Torn City Scripts\ChatPlus\testlib\dom.js` (append the pointer-event helper)
- Test: `D:\dev\Torn City Scripts\ChatPlus\test\dragController.test.js`

- [ ] **Step 1: Append the pointer-event helper to `testlib/dom.js`**

```js
/**
 * jsdom has no PointerEvent, but a MouseEvent dispatched with a pointer type
 * name reaches pointerdown/pointermove/pointerup listeners just fine.
 */
export function firePointer(target, type, options = {}) {
  const win = target.ownerDocument.defaultView;
  const { clientX = 0, clientY = 0, button = 0, pointerId = 1 } = options;
  const event = new win.MouseEvent(type, {
    bubbles: true, cancelable: true, clientX, clientY, button,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  target.dispatchEvent(event);
  return event;
}
```

- [ ] **Step 2: Write the failing test**

Create `test/dragController.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, stubRect, firePointer } from '../testlib/dom.js';
import {
  DRAG_THRESHOLD_PX, DRAGGABLE_CLASS, DRAGGING_CLASS, GRABBING_CLASS,
  createDragController,
} from '../src/features/movable/dragController.js';

const VIEWPORT = { width: 1000, height: 800 };

function withDom(fn) {
  const dom = setupDom();
  try { return fn(dom); } finally { teardownDom(dom); }
}

function build(dom, options = {}) {
  const w = makeChatWidget(dom.window.document, {
    id: 'chat-a',
    extraHeaderHtml: options.extraHeaderHtml || '',
  });
  stubRect(w.wrapper, { left: 400, top: 600, width: 200, height: 120 });
  const widget = { id: 'chat-a', box: w.box, wrapper: w.wrapper, header: w.header };
  const moves = [];
  const commits = [];
  const controller = createDragController({
    widget,
    getViewport: () => VIEWPORT,
    onMove: (x, y) => moves.push([x, y]),
    onCommit: (x, y) => commits.push([x, y]),
  });
  return { dom, w, widget, controller, moves, commits };
}

test('the threshold is 4px and nothing is draggable until enable() is called', () => {
  withDom((dom) => {
    assert.equal(DRAG_THRESHOLD_PX, 4);
    const t = build(dom);
    assert.ok(!t.widget.header.classList.contains(DRAGGABLE_CLASS));
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 500, clientY: 650 });
    firePointer(dom.window.document, 'pointerup', { clientX: 500, clientY: 650 });
    assert.deepEqual(t.moves, []);
    assert.deepEqual(t.commits, []);
  });
});

test('enable marks the header draggable; disable removes the marker', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    assert.ok(t.widget.header.classList.contains(DRAGGABLE_CLASS));
    t.controller.disable();
    assert.ok(!t.widget.header.classList.contains(DRAGGABLE_CLASS));
  });
});

test('movement of 4px or less is a click, not a drag', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 452, clientY: 622 });
    assert.deepEqual(t.moves, []);
    assert.equal(t.controller.isDragging(), false);
    firePointer(dom.window.document, 'pointerup', { clientX: 452, clientY: 622 });
    assert.deepEqual(t.commits, [], 'a click must not persist a position');
  });
});

test('movement beyond the threshold drags from the wrapper top-left', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 452, clientY: 622 }); // below threshold
    firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630 }); // +10, +10
    assert.deepEqual(t.moves, [[410, 610]]);
    assert.equal(t.controller.isDragging(), true);
    assert.ok(t.widget.wrapper.classList.contains(DRAGGING_CLASS));
    assert.ok(dom.window.document.body.classList.contains(GRABBING_CLASS));

    firePointer(dom.window.document, 'pointermove', { clientX: 470, clientY: 640 });
    assert.deepEqual(t.moves, [[410, 610], [420, 620]]);
  });
});

test('pointerup persists the final clamped position and ends the drag', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630 });
    firePointer(dom.window.document, 'pointerup', { clientX: 460, clientY: 630 });
    assert.deepEqual(t.commits, [[410, 610]]);
    assert.equal(t.controller.isDragging(), false);
    assert.ok(!t.widget.wrapper.classList.contains(DRAGGING_CLASS));
    assert.ok(!dom.window.document.body.classList.contains(GRABBING_CLASS));
  });
});

test('pointercancel also persists the position', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630 });
    firePointer(dom.window.document, 'pointercancel', { clientX: 460, clientY: 630 });
    assert.deepEqual(t.commits, [[410, 610]]);
  });
});

test('positions are clamped into the viewport during the drag', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 2450, clientY: 2620 });
    assert.deepEqual(t.moves, [[800, 680]], 'clamped to viewport minus widget size');
    firePointer(dom.window.document, 'pointermove', { clientX: -2450, clientY: -2620 });
    assert.deepEqual(t.moves[1], [0, 0]);
  });
});

test('pointerdown on a button, link, input or the padlock never starts a drag', () => {
  withDom((dom) => {
    const t = build(dom, {
      extraHeaderHtml: '<button id="b">x</button><a id="a" href="#">y</a><input id="i"><svg data-chatplus-lock="1"><rect id="lockchild"></rect></svg>',
    });
    t.controller.enable();
    for (const id of ['b', 'a', 'i', 'lockchild']) {
      const target = t.widget.header.querySelector(`#${id}`);
      firePointer(target, 'pointerdown', { clientX: 450, clientY: 620 });
      firePointer(dom.window.document, 'pointermove', { clientX: 500, clientY: 660 });
      firePointer(dom.window.document, 'pointerup', { clientX: 500, clientY: 660 });
    }
    assert.deepEqual(t.moves, []);
    assert.deepEqual(t.commits, []);
  });
});

test('non-primary buttons never start a drag', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620, button: 2 });
    firePointer(dom.window.document, 'pointermove', { clientX: 500, clientY: 660 });
    assert.deepEqual(t.moves, []);
  });
});

test('setPointerCapture is used when the browser provides it', () => {
  withDom((dom) => {
    const t = build(dom);
    const captured = [];
    const released = [];
    t.widget.header.setPointerCapture = (id) => captured.push(id);
    t.widget.header.releasePointerCapture = (id) => released.push(id);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620, pointerId: 7 });
    firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630, pointerId: 7 });
    assert.deepEqual(captured, [7]);
    firePointer(dom.window.document, 'pointerup', { clientX: 460, clientY: 630, pointerId: 7 });
    assert.deepEqual(released, [7]);
  });
});

test('disable during a drag cancels it without persisting, and detaches listeners', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630 });
    t.controller.disable();
    assert.deepEqual(t.commits, []);
    assert.ok(!t.widget.wrapper.classList.contains(DRAGGING_CLASS));
    assert.ok(!dom.window.document.body.classList.contains(GRABBING_CLASS));

    firePointer(dom.window.document, 'pointermove', { clientX: 500, clientY: 660 });
    assert.deepEqual(t.moves, [[410, 610]], 'no further moves after disable');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/dragController.test.js`

Expected: FAIL — `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\features\movable\dragController.js'`.

- [ ] **Step 4: Write the implementation**

Create `src/features/movable/dragController.js`:

```js
import { clampPosition } from './geometry.js';

/** Movement must EXCEED this many pixels before a click becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;

export const DRAGGABLE_CLASS = 'chatplus-draggable';
export const DRAGGING_CLASS = 'chatplus-dragging';
export const GRABBING_CLASS = 'chatplus-grabbing';

/** Header elements that must keep their own click behaviour. */
const IGNORE_SELECTOR = 'button, a, input, textarea, select, [contenteditable="true"], [data-chatplus-lock]';

/**
 * Drags a widget's wrapper by its header.
 *
 * @param {Object} config
 * @param {{id: string, wrapper: Element, header: Element}} config.widget
 * @param {(x: number, y: number) => void} [config.onMove]   called every frame of the drag
 * @param {(x: number, y: number) => void} [config.onCommit] called on pointerup/pointercancel
 * @param {() => {width: number, height: number}} [config.getViewport]
 * @param {(el: Element) => DOMRect} [config.getRect]
 * @param {number} [config.threshold]
 */
export function createDragController({
  widget,
  onMove,
  onCommit,
  getViewport,
  getRect,
  threshold = DRAG_THRESHOLD_PX,
}) {
  const { header, wrapper } = widget;
  const doc = header.ownerDocument;
  const readViewport = getViewport || (() => ({
    width: doc.defaultView.innerWidth,
    height: doc.defaultView.innerHeight,
  }));
  const readRect = getRect || ((el) => el.getBoundingClientRect());

  let enabled = false;
  let session = null;

  function detachSessionListeners() {
    doc.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('pointerup', onPointerEnd, true);
    doc.removeEventListener('pointercancel', onPointerEnd, true);
  }

  function endSession() {
    if (!session) return;
    session = null;
    detachSessionListeners();
    wrapper.classList.remove(DRAGGING_CLASS);
    if (doc.body) doc.body.classList.remove(GRABBING_CLASS);
  }

  function onPointerDown(event) {
    if (!enabled || session) return;
    if (typeof event.button === 'number' && event.button !== 0) return;

    const target = event.target;
    if (target && typeof target.closest === 'function') {
      const blocker = target.closest(IGNORE_SELECTOR);
      if (blocker && header.contains(blocker)) return;
    }

    const rect = readRect(wrapper);
    session = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      width: rect.width,
      height: rect.height,
      dragging: false,
      x: rect.left,
      y: rect.top,
    };
    doc.addEventListener('pointermove', onPointerMove, true);
    doc.addEventListener('pointerup', onPointerEnd, true);
    doc.addEventListener('pointercancel', onPointerEnd, true);
  }

  function onPointerMove(event) {
    if (!session) return;
    if (session.pointerId !== undefined && event.pointerId !== undefined
      && event.pointerId !== session.pointerId) return;

    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;

    if (!session.dragging) {
      if (Math.hypot(dx, dy) <= threshold) return;
      session.dragging = true;
      if (typeof header.setPointerCapture === 'function' && session.pointerId !== undefined) {
        try { header.setPointerCapture(session.pointerId); } catch { /* not fatal */ }
      }
      wrapper.classList.add(DRAGGING_CLASS);
      if (doc.body) doc.body.classList.add(GRABBING_CLASS);
    }

    const viewport = readViewport();
    const next = clampPosition({
      x: session.originX + dx,
      y: session.originY + dy,
      width: session.width,
      height: session.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    session.x = next.x;
    session.y = next.y;
    if (event.cancelable) event.preventDefault();
    if (onMove) onMove(next.x, next.y);
  }

  function onPointerEnd(event) {
    if (!session) return;
    if (session.pointerId !== undefined && event.pointerId !== undefined
      && event.pointerId !== session.pointerId) return;

    const { dragging, x, y, pointerId } = session;
    endSession();
    if (!dragging) return;
    if (typeof header.releasePointerCapture === 'function' && pointerId !== undefined) {
      try { header.releasePointerCapture(pointerId); } catch { /* not fatal */ }
    }
    if (onCommit) onCommit(x, y);
  }

  function enable() {
    if (enabled) return;
    enabled = true;
    header.classList.add(DRAGGABLE_CLASS);
    header.addEventListener('pointerdown', onPointerDown);
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    header.classList.remove(DRAGGABLE_CLASS);
    header.removeEventListener('pointerdown', onPointerDown);
    endSession();
  }

  return {
    enable,
    disable,
    destroy: disable,
    isDragging: () => !!(session && session.dragging),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/dragController.test.js`

Expected: `ℹ pass 11`, `ℹ fail 0`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/movable/dragController.js testlib/dom.js test/dragController.test.js
git commit -m "feat: add pointer drag controller with threshold and clamping" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---
## Task 12: `styles.css`, `features/movable/index.js` and `main.js` — wiring it together

Implements spec section 7 (data flow) plus the parts of 5.3/5.4 that only exist at the wiring level: floating z-index, locking a floating widget keeps it floating, minimize/expand restores the saved spot, and window resize re-clamps and persists.

**Reminder:** `index.js` and `main.js` import `./styles.css`, so they are the two modules no test file may import. They are verified through the build smoke test.

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\features\movable\styles.css`
- Create: `D:\dev\Torn City Scripts\ChatPlus\src\features\movable\index.js`
- Modify: `D:\dev\Torn City Scripts\ChatPlus\src\main.js` (replace the Task 1 placeholder)
- Modify: `D:\dev\Torn City Scripts\ChatPlus\test\build.test.js` (add bundle-content assertions)

- [ ] **Step 1: Write the failing bundle-content test**

Append to `test/build.test.js`:

```js
test('the bundle inlines the stylesheet, the selectors and the feature wiring', () => {
  const code = runBuild();
  assert.match(code, /chatplus-floating/, 'styles.css must be inlined by the text loader');
  assert.match(code, /position: fixed !important/, 'the floating rule must survive bundling');
  assert.match(code, /Chat\+ lock/, 'the padlock aria-label must be in the bundle');
  assert.match(code, /chatplus\.state\.v1/, 'the storage key must be in the bundle');
  assert.match(code, /svg\[aria-label="Minimize"\]/, 'the Torn selector must be in the bundle');
  assert.ok(!/^\s*import\s/m.test(code), 'bundled output must contain no import statements');
  assert.ok(!/^\s*export\s/m.test(code), 'bundled output must contain no export statements');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/build.test.js`

Expected: FAIL — the first assertion trips with `The input did not match the regular expression /chatplus-floating/`, because `src/main.js` is still the Task 1 placeholder.

- [ ] **Step 3: Create `src/features/movable/styles.css`**

```css
/* Chat+ - movable chat widgets.
   Every rule is !important because it has to beat Torn's inline styles. */

.chatplus-floating {
  position: fixed !important;
  left: var(--chatplus-x, 0px) !important;
  top: var(--chatplus-y, 0px) !important;
  right: auto !important;
  bottom: auto !important;
  transform: none !important;
  translate: none !important;
  margin: 0 !important;
  z-index: 9000 !important;
}

.chatplus-floating.chatplus-dragging {
  z-index: 9001 !important;
}

.chatplus-dragging {
  user-select: none !important;
}

.chatplus-lock {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s ease;
}

.chatplus-lock:hover,
.chatplus-lock--unlocked {
  opacity: 1;
}

.chatplus-draggable {
  cursor: grab;
}

body.chatplus-grabbing,
body.chatplus-grabbing * {
  cursor: grabbing !important;
}
```

- [ ] **Step 4: Create `src/features/movable/index.js`**

```js
import cssText from './styles.css';
import { createLockToggle } from './lockToggle.js';
import { createDragController } from './dragController.js';
import { applyFloating, clearFloating, isFloating, watchWrapper } from './floating.js';
import { applyCompensations } from './reflow.js';
import { clampPosition } from './geometry.js';

export const FEATURE_ID = 'movable';
export const STYLE_ELEMENT_ID = 'chatplus-styles';

/** Inject styles.css (inlined as text by esbuild) once. */
export function injectStyles(doc) {
  if (!doc || doc.getElementById(STYLE_ELEMENT_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = cssText;
  (doc.head || doc.documentElement).appendChild(style);
}

/**
 * The movable-widgets feature: padlock, drag, floating placement, row reflow.
 * @returns {{id: string, init: Function, onWidgetAdded: Function, onWidgetRemoved: Function}}
 */
export function createMovableFeature() {
  /** @type {Map<string, {widget: any, lock: any, drag: any, unwatch: () => void}>} */
  const entries = new Map();
  let ctx = null;
  let reflowScheduled = false;

  function stateOf(id) {
    return ctx.storage.getWidget(id);
  }

  /** @returns {{x: number, y: number}|null} null means "sit wherever Torn puts it". */
  function desiredPositionOf(id) {
    const state = stateOf(id);
    return state.x !== null && state.y !== null ? { x: state.x, y: state.y } : null;
  }

  function scheduleReflow() {
    if (reflowScheduled) return;
    reflowScheduled = true;
    const raf = typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame
      : (fn) => setTimeout(fn, 16);
    raf(() => {
      reflowScheduled = false;
      applyCompensations(
        [...entries.values()].map((entry) => entry.widget),
        ctx.selectors,
        (widget) => isFloating(widget.wrapper),
      );
    });
  }

  function applyState(entry) {
    const desired = desiredPositionOf(entry.widget.id);
    if (desired) applyFloating(entry.widget.wrapper, desired.x, desired.y);
    else clearFloating(entry.widget.wrapper);

    if (stateOf(entry.widget.id).locked) entry.drag.disable();
    else entry.drag.enable();

    entry.lock.sync();
  }

  function applyAll() {
    for (const entry of entries.values()) applyState(entry);
    scheduleReflow();
  }

  function dropEntry(id) {
    const entry = entries.get(id);
    if (!entry) return;
    entry.drag.destroy();
    entry.lock.unmount();
    entry.unwatch();
    entries.delete(id);
  }

  /** Keep floating widgets inside the viewport when the window is resized. */
  function onResize() {
    const view = globalThis.window;
    for (const entry of entries.values()) {
      const desired = desiredPositionOf(entry.widget.id);
      if (!desired) continue;
      const rect = entry.widget.wrapper.getBoundingClientRect();
      const next = clampPosition({
        x: desired.x,
        y: desired.y,
        width: rect.width,
        height: rect.height,
        viewportWidth: view.innerWidth,
        viewportHeight: view.innerHeight,
      });
      if (next.x !== desired.x || next.y !== desired.y) {
        ctx.storage.setWidget(entry.widget.id, next); // persists and re-applies via subscribe
      } else {
        applyFloating(entry.widget.wrapper, next.x, next.y);
      }
    }
    scheduleReflow();
  }

  function init(context) {
    ctx = context;
    injectStyles(globalThis.document);
    // Fires for local writes AND for the cross-tab 'storage' event.
    ctx.storage.subscribe(applyAll);
    globalThis.window.addEventListener('resize', onResize);
  }

  function onWidgetAdded(widget, context) {
    ctx = context;
    dropEntry(widget.id);

    const lock = createLockToggle({
      widget,
      selectors: ctx.selectors,
      isLocked: () => stateOf(widget.id).locked,
      onToggle: (locked) => ctx.storage.setWidget(widget.id, { locked }),
      onReset: () => ctx.storage.setWidget(widget.id, { x: null, y: null }),
    });

    const drag = createDragController({
      widget,
      onMove: (x, y) => {
        applyFloating(widget.wrapper, x, y);
        scheduleReflow(); // the row closes the gap live while dragging
      },
      onCommit: (x, y) => ctx.storage.setWidget(widget.id, { x, y }),
    });

    // Torn rewrites inline styles on re-render: re-assert ours, and reflow
    // the row whenever Torn moves anything.
    const unwatch = watchWrapper(widget.wrapper, () => desiredPositionOf(widget.id), scheduleReflow);

    const entry = { widget, lock, drag, unwatch };
    entries.set(widget.id, entry);
    lock.mount();
    applyState(entry);
    scheduleReflow();
  }

  function onWidgetRemoved(widget) {
    dropEntry(widget.id);
    scheduleReflow();
  }

  return { id: FEATURE_ID, init, onWidgetAdded, onWidgetRemoved };
}
```

- [ ] **Step 5: Replace `src/main.js`**

```js
import * as log from './core/log.js';
import * as selectors from './core/selectors.js';
import { createStorage } from './core/storage.js';
import { createRegistry } from './core/registry.js';
import { createObserver } from './core/observer.js';
import { createMovableFeature } from './features/movable/index.js';

function boot() {
  const storage = createStorage();
  const ctx = { storage, selectors, log };

  const registry = createRegistry(ctx);
  registry.register(createMovableFeature());
  registry.init();

  const observer = createObserver({
    selectors,
    onWidgetAdded: (widget) => registry.widgetAdded(widget),
    onWidgetRemoved: (widget) => registry.widgetRemoved(widget),
  });
  observer.start();

  log.info('ready:', registry.list().join(', '));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
```

- [ ] **Step 6: Run the whole suite to verify it passes**

Run: `npm test`

Expected: `ℹ fail 0`, exit code 0. The build smoke test file now reports 2 passing tests; total across all files is `ℹ pass 80`.

- [ ] **Step 7: Commit**

```bash
git add src/features/movable/styles.css src/features/movable/index.js src/main.js test/build.test.js dist/chatplus.user.js
git commit -m "feat: wire the movable widgets feature into the userscript bootstrap" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---

## Task 13: `README.md` — install, dev loader, acceptance checklist, HTML request

**Files:**
- Create: `D:\dev\Torn City Scripts\ChatPlus\README.md`

- [ ] **Step 1: Create `README.md` with exactly this content**

````markdown
# Chat+

A Tampermonkey userscript for Torn City desktop **Chat 3.0**.

Unlock any chat widget with the padlock in its header, drag it by the header to
anywhere on screen (the empty space on the far left, for example), and lock it
there. Widgets that stay in Torn's bottom row slide over to close the gap.

---

## Build

Requires Node 20 or newer.

```bash
npm install
npm run build      # writes dist/chatplus.user.js
npm test           # runs the unit tests
npm run watch      # rebuilds on every change under src/
```

`dist/chatplus.user.js` is the finished userscript: the bundled code with the
`==UserScript==` metadata block from `src/header.txt` on top.

---

## Install

**The simple way (recommended):**

1. Open the Tampermonkey dashboard (the extension icon, then *Dashboard*).
2. Click the **+** tab to create a new script.
3. Select everything in the editor and delete it.
4. Open `dist/chatplus.user.js`, copy the whole file, paste it in.
5. **File > Save** (or Ctrl+S).
6. Reload `https://www.torn.com/`.

Repeat steps 1-6 after every `npm run build`.

**The developer way (optional, auto-picks-up every rebuild):**

Create a *separate* tiny script in Tampermonkey that pulls in the build output
from disk, so you never have to paste again:

```javascript
// ==UserScript==
// @name         Chat+ (dev loader)
// @namespace    chatplus.torn
// @version      1.0.0
// @description  Loads Chat+ from the local build output.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @grant        none
// @require      file:///C:/path/to/ChatPlus/dist/chatplus.user.js
// ==/UserScript==
```

Notes:

- The path is a `file://` URL, so spaces must be percent-encoded (`%20`) and the
  separators must be forward slashes.
- **Chrome/Edge:** go to `chrome://extensions`, open Tampermonkey's *Details*,
  and turn on **Allow access to file URLs**. Without it the `@require` silently
  loads nothing.
- Disable the pasted copy while the dev loader is enabled, or the script runs twice.
- Tampermonkey caches `@require` contents; if a rebuild does not show up, toggle
  the loader script off and on again, or bump its `@version`.

---

## Using it

- Every expanded chat widget gets a **padlock** in its header, just left of the
  minimize button.
- **Closed padlock = locked.** The widget stays where Torn puts it.
- **Click the padlock** to unlock it. Now drag the widget by its header.
- **Click again** to lock it in its new spot.
- **Right-click the padlock** to send the widget back to Torn's row. This does
  not change whether it is locked.
- Positions are stored in `localStorage` under `chatplus.state.v1` and are shared
  live between your open Torn tabs.

---

## Manual acceptance checklist

Run through this on `https://www.torn.com/` after installing a new build.

- [ ] Each expanded chat widget shows a padlock immediately left of its minimize
      button, and hovering it shows the "Locked — click to unlock..." tooltip.
- [ ] Unlock a widget, drag it to the empty space on the far left, lock it.
      Reload the page: it is still in the same place.
- [ ] Minimize that widget, then expand it again: it comes back in the same place.
- [ ] Open Torn in a second tab: the widget is in the same place there too, and
      moving it in one tab moves it in the other.
- [ ] Right-click the padlock: the widget returns to Torn's bottom row, and the
      row has no gap where it used to be.
- [ ] Resize the browser window small: the floated widget stays fully on screen.

---

## How to send your chat HTML

If a widget is not detected, or the padlock lands in the wrong place, Torn's
markup has changed and `src/core/selectors.js` needs updating. Send the real
markup:

1. Go to `https://www.torn.com/` and make sure the chat widget is **expanded**.
2. **Right-click the widget's header bar** (the strip with the title and the
   minimize button) and choose **Inspect**.
3. DevTools opens with an element highlighted. Look just above it in the Elements
   panel for the **`<div id="...">`** whose id contains a `-`. That is the chat box.
4. From that chat box, click its **parent**, then **that** element's parent — two
   levels up. This wrapper is the one with an inline `style` containing
   `right:`, `left:` or `transform: translateX(...)`.
5. Right-click that wrapper element and choose **Copy > Copy outerHTML**.
6. Paste it into the chat with Claude.

Do not bother trimming it. The hashed class names in it (`root___FmdS_` and
friends) are exactly what Chat+ refuses to depend on, but seeing the structure
around them is what matters.

---

## Project layout

```
build.mjs                     esbuild bundle + userscript header
src/header.txt                ==UserScript== metadata block
src/main.js                   bootstrap
src/core/log.js               prefixed console helpers
src/core/storage.js           localStorage state, cross-tab sync
src/core/selectors.js         EVERY Torn DOM lookup lives here
src/core/observer.js          widget discovery
src/core/registry.js          feature fan-out
src/features/movable/         padlock, drag, floating, reflow, styles
testlib/dom.js                jsdom helpers for the tests
test/*.test.js                node --test suites
```

If Torn changes its chat markup, `src/core/selectors.js` is the only file that
should need editing.

## License

MIT
````

- [ ] **Step 2: Verify the README renders the checklist and the file:// path correctly**

Run:

```bash
grep -n "Allow access to file URLs" README.md
grep -n "file:///C:/path/to/ChatPlus/dist/chatplus.user.js" README.md
grep -c "^- \[ \]" README.md
```

Expected: the first two greps each print one matching line; the third prints `6` (the six acceptance checklist items).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add install, dev loader and acceptance checklist README" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

---

## Task 14: Full build, full test run, final commit

**Files:**
- Modify: `D:\dev\Torn City Scripts\ChatPlus\dist\chatplus.user.js` (rebuilt)

- [ ] **Step 1: Confirm no Torn hashed class names leaked into the source**

Run:

```bash
grep -rnE "[A-Za-z]+___[A-Za-z0-9_-]+" src/ || echo "NO HASHED CLASSES"
```

Expected: `NO HASHED CLASSES`.

- [ ] **Step 2: Confirm Torn DOM lookups live only in `selectors.js`**

Run:

```bash
grep -rn "Minimize" src/ | grep -v "src/core/selectors.js" || echo "SELECTORS ISOLATED"
```

Expected: `SELECTORS ISOLATED`.

- [ ] **Step 3: Run a clean build**

Run:

```bash
rm -rf dist
npm run build
head -12 dist/chatplus.user.js
```

Expected: `[Chat+] built dist/chatplus.user.js`, then the first 12 lines are the
`// ==UserScript==` metadata block ending with `// ==/UserScript==`.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`

Expected: `ℹ tests 80`, `ℹ pass 80`, `ℹ fail 0`, exit code 0.

Breakdown: build 2, log 4, storage 9, selectors 8, observer 6, registry 5,
reflow 13, floating 9, geometry 5, lockToggle 8, dragController 11 = 80 — adjust
the expected total if you legitimately added or merged a test while implementing.

- [ ] **Step 5: Confirm the working tree is clean apart from the rebuilt bundle**

Run: `git status --short`

Expected: only `M dist/chatplus.user.js` (or nothing at all, if the rebuild was
byte-identical).

- [ ] **Step 6: Commit**

```bash
git add dist/chatplus.user.js
git commit -m "chore: rebuild dist bundle after full test run" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ"
```

- [ ] **Step 7: Hand the acceptance checklist to the user**

Tell the user the build is ready at `dist/chatplus.user.js`, point them at the
**Install** and **Manual acceptance checklist** sections of `README.md`, and ask
them to send their chat HTML (README section "How to send your chat HTML") if any
widget is not detected — that is the expected next step, because the selectors
were derived from other scripts rather than from a live page.

---

## Spec coverage map

| Spec section | Requirement | Task |
| --- | --- | --- |
| 3 | `@match https://www.torn.com/*`, `@run-at document-idle`, `@grant none` | 1 |
| 3 | No hashed class names as selectors | 4, 14 (verified) |
| 3 | State in `localStorage` only, no API key | 3 |
| 4 | Chat box = `div[id*="-"]` containing `svg[aria-label="Minimize"]` | 4 |
| 4 | Wrapper = `box.parentElement.parentElement` | 4 |
| 4 | Detect `right` / `left` / `translateX` positioning | 4 |
| 4 | Re-assert overrides via attribute `MutationObserver` | 8 |
| 4 | Re-added (expanded) widget treated as new | 5 |
| 4 | All Torn lookups in one module | 4, 14 (verified) |
| 5.1 | 24x24 SVG padlock before Minimize, `aria-label="Chat+ lock"`, titles | 10 |
| 5.1 | Closed = locked, open = unlocked, click toggles | 10 |
| 5.1 | Right-click resets position, lock state unchanged | 10 |
| 5.2 | `{x, y, locked}`, `null` = native, default `{null, null, true}` | 3 |
| 5.3 | Only unlocked widgets drag; header is the handle | 11, 12 |
| 5.3 | Ignore pointerdown on button/link/input/padlock | 11 |
| 5.3 | 4px movement threshold | 11 |
| 5.3 | Floating via class + custom properties with `!important` | 8, 12 |
| 5.3 | `setPointerCapture` | 11 |
| 5.3 | Clamp into viewport, oversized widget pins to 0 | 9, 11 |
| 5.3 | `pointerup` / `pointercancel` persists `{x, y}` | 11 |
| 5.3 | Floating z-index above page, dragged above other floating | 12 |
| 5.3 | `grab` / `grabbing` cursors | 11 (classes), 12 (CSS) |
| 5.4 | Locking a floating widget keeps it floating, dragging off | 12 |
| 5.4 | Minimize then expand restores the saved spot | 5, 12 |
| 5.4 | Window resize re-clamps and persists | 12 |
| 5.5 | Floating widgets excluded, survivors pack with `translate !important` | 7 |
| 5.5 | No-shift widgets get the property removed | 7 |
| 5.5 | rAF-coalesced reflow on add/remove/float/reset/style rewrite | 12 |
| 5.6 | `localStorage["chatplus.state.v1"]` + `storage` event re-apply | 3, 12 |
| 6 | Module layout, ES modules, single IIFE, no runtime deps | 1, 12 |
| 6 | Pure `computeCompensations` and clamp with unit tests | 7, 9 |
| 6 | Never throw out of observer/event callbacks | 2, 5, 6 |
| 6 | Corrupt / wrong-version storage resets with a warning | 3 |
| 8 | Pure unit tests (reflow x3 layouts, clamp edges) | 7, 9 |
| 8 | jsdom unit tests (storage, lockToggle, drag, observer) | 3, 5, 10, 11 |
| 8 | Manual acceptance checklist in README | 13 |
| 9 | Out of scope: font size, per-widget size, settings UI, TornPDA | not planned (correct) |

---

## Self-review notes

**Spec coverage:** every numbered requirement in sections 3 through 8 maps to a
task in the table above. Section 9 (out of scope) is deliberately unimplemented.
One spec detail was deliberately widened: section 4 says to observe
`attributeFilter: ['style']`, but Task 8 observes `['style', 'class']` because a
React re-render that rewrites `className` would silently drop the floating class
and strand the widget. This is noted in Task 8.

One spec fact is recorded but intentionally unused: `button[id*="channel_panel_button:"]`
(section 4). Chat+ does not need to hook the channel buttons — the observer
already treats an expanded widget as a new widget — so per YAGNI no task uses it.

**Type consistency:** the Widget record is `{ id, box, wrapper, header }`
everywhere (Tasks 5, 10, 11, 12). `ctx` is `{ storage, selectors, log }`
everywhere (Tasks 6, 12). Function names are stable across tasks:
`computeCompensations` / `applyCompensations` (7, 12), `clampAxis` /
`clampPosition` (9, 11, 12), `applyFloating` / `clearFloating` / `isFloating` /
`watchWrapper` (8, 12), `createLockToggle` with `mount` / `unmount` / `sync`
(10, 12), `createDragController` with `enable` / `disable` / `destroy` /
`isDragging` (11, 12), `createStorage` with `getWidget` / `setWidget` / `all` /
`subscribe` / `destroy` (3, 12).

**Known build-time coupling:** `src/main.js` and `src/features/movable/index.js`
import `./styles.css`, which only esbuild resolves. Those two are the only
modules with no direct unit test; the build smoke test in Tasks 1 and 12 asserts
their output ends up in the bundle.
