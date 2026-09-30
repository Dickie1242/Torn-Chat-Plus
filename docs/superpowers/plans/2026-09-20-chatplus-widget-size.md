# Chat+ Widget Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player resize each Torn Chat 3.0 chat box on its own with drag handles, remembered per chat, with a per-chat reset in the padlock menu.

**Architecture:** A new feature module `src/features/resize/` registered after `textScale`, with the same `{ id, init, onWidgetAdded, onWidgetRemoved }` shape as the other features. Size is written inline on the chat box (Better Chat 3.0 proved Torn's own flex then gives the height to the message list); handles are absolutely positioned children of the box, mounted only while the chat is unlocked; a document-level resize controller survives Torn's node swaps; storage gains `width`/`height` per chat. Spec: `docs/superpowers/specs/2026-09-20-chatplus-widget-size-design.md`.

**Tech Stack:** Plain ES modules, esbuild bundle (`npm run build`), `node --test` with jsdom via `testlib/dom.js`. Node 24. No new dependencies.

**Conventions you must keep:**
- Every file starts with a short comment saying what it is for and why, like the existing ones. Clear, simple code; no bloat. The bundle must stay readable (Greasy Fork forbids minified scripts).
- Run tests with `npm test` from `D:/dev/Torn City Scripts/ChatPlus`. The suite ends with a summary; a task is done only when the summary line reads `# fail 0`. Never judge by grepping the output.
- Commit after every task with the message given. End every commit message with these two trailer lines:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ
```

- jsdom has no layout: stub any measured element with `stubRect` from `testlib/dom.js`. jsdom has no `PointerEvent`: use `firePointer` from the same file, which dispatches a `MouseEvent` with a `pointerId`.
- `git add` the specific files you touched; never `git add -A`.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/core/storage.js` (modify) | `width`/`height` in the widget record, `WIDGET_SIZE` minimums |
| `src/core/selectors.js` (modify) | `boxOf(element)` |
| `src/core/menu.js` (modify) | `onOpen(listener)` so a row can learn which chat opened the menu |
| `src/features/resize/sizing.js` (create) | pure size math (`nextSize`, `limitsFor`) and `applySize` |
| `src/features/resize/handles.js` (create) | which handles a chat gets and mounting them |
| `src/features/resize/resizeController.js` (create) | one drag gesture: press on a handle, document-level move/up |
| `src/features/resize/resetRow.js` (create) | the "Widget size · Reset" menu row |
| `src/features/resize/index.js` (create) | the feature: entries, apply, commit |
| `src/features/textScale/index.js` (modify) | never zoom a handle |
| `src/styles.css` (modify) | sized box, handles, cursors, menu button |
| `src/main.js` (modify) | register the feature |
| `src/header.txt` (modify) | `@version 1.5.0` |
| `diagnostics/dump.js` (modify) | report computed box/wrapper sizes |
| `README.md` (modify) | usage, checklist, layout, credits |
| `test/storage.test.js`, `test/selectors.test.js`, `test/menu.test.js`, `test/textScale.test.js`, `test/build.test.js` (modify) | new cases |
| `test/sizing.test.js`, `test/handles.test.js`, `test/resizeController.test.js`, `test/resetRow.test.js`, `test/resize.test.js` (create) | new suites |

---

### Task 1: Storage keeps a width and height per chat

**Files:**
- Modify: `src/core/storage.js`
- Test: `test/storage.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/storage.test.js` (keep its existing imports; add `WIDGET_SIZE` and `STORAGE_KEY` to the import from `../src/core/storage.js` if they are not imported already):

```js
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
    { x: null, y: null, locked: true, width: 350, height: 420 },
  );
  assert.equal(storage.getWidget('chat-2').height, null, 'another chat is untouched');
  const small = storage.setWidget('chat-1', { width: 10, height: 'big' });
  assert.equal(small.width, WIDGET_SIZE.minWidth, 'too narrow is clamped up');
  assert.equal(small.height, null, 'junk is dropped');
  const cleared = storage.setWidget('chat-1', { width: null, height: null });
  assert.equal(cleared.width, null);
  assert.equal(cleared.height, null);
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
    x: 5, y: 6, locked: false, width: null, height: null,
  });
  assert.equal(storage.getSetting('messageScale'), 120);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/storage.test.js`
Expected: the three new tests fail (`WIDGET_SIZE` undefined / `width` missing from the record). Existing tests still pass.

- [ ] **Step 3: Implement**

In `src/core/storage.js` replace the typedef, `DEFAULT_WIDGET_STATE` and `sanitizeWidget` with:

```js
/**
 * @typedef {{
 *   x: number|null, y: number|null, locked: boolean,
 *   width: number|null, height: number|null,
 * }} WidgetState
 */
export const DEFAULT_WIDGET_STATE = Object.freeze({
  x: null, y: null, locked: true, width: null, height: null,
});

/**
 * The smallest a chat may be sized to, in px. The largest depends on the
 * viewport, so it is enforced while dragging, not here.
 */
export const WIDGET_SIZE = Object.freeze({ minWidth: 200, minHeight: 150 });

/** A stored dimension: a whole number of px at or above `min`, else "Torn's size". */
function sanitizeDimension(value, min) {
  return Number.isFinite(value) ? Math.max(min, Math.round(value)) : null;
}

function sanitizeWidget(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WIDGET_STATE };
  return {
    x: Number.isFinite(raw.x) ? raw.x : null,
    y: Number.isFinite(raw.y) ? raw.y : null,
    locked: typeof raw.locked === 'boolean' ? raw.locked : true,
    width: sanitizeDimension(raw.width, WIDGET_SIZE.minWidth),
    height: sanitizeDimension(raw.height, WIDGET_SIZE.minHeight),
  };
}
```

If any existing test in the suite does a `deepEqual` on a whole widget record, extend its expectation with `width: null, height: null`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: summary ends with `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/core/storage.js test/storage.test.js
git commit -m "feat(storage): keep a width and height per chat"
```

---

### Task 2: `selectors.boxOf` and `menu.onOpen`

**Files:**
- Modify: `src/core/selectors.js`, `src/core/menu.js`
- Test: `test/selectors.test.js`, `test/menu.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/selectors.test.js` (it already imports `makeChatWidget`, `setupDom`, `teardownDom` and the selectors module; add `boxOf` to whatever import form it uses):

```js
test('boxOf finds the chat box an element sits in', () => {
  const dom = setupDom();
  try {
    const doc = dom.window.document;
    const w = makeChatWidget(doc, { id: 'chat-9' });
    const inHeader = w.header.querySelector('.title');
    assert.equal(selectors.boxOf(inHeader), w.box);
    assert.equal(selectors.boxOf(w.box), w.box, 'the box itself counts');
    assert.equal(selectors.boxOf(doc.createElement('span')), null, 'detached: nothing');
    assert.equal(selectors.boxOf(null), null);
  } finally {
    teardownDom(dom);
  }
});
```

(If that file imports named functions rather than `* as selectors`, call `boxOf(...)` directly.)

Append to `test/menu.test.js` (it already imports `createMenu`, `setupDom`, `teardownDom`, `stubRect`):

```js
test('onOpen tells listeners which anchor opened the menu, until unsubscribed', () => {
  const dom = setupDom();
  try {
    const doc = dom.window.document;
    const menu = createMenu({ doc });
    const a = doc.createElement('button');
    const b = doc.createElement('button');
    doc.body.append(a, b);
    stubRect(a, { left: 10, top: 10, width: 20, height: 20 });
    stubRect(b, { left: 50, top: 10, width: 20, height: 20 });

    const seen = [];
    const off = menu.onOpen((anchor) => seen.push(anchor));
    menu.open(a);
    menu.open(b); // re-anchored while open: listeners hear the new anchor
    menu.close();
    assert.deepEqual(seen, [a, b], 'once per open, never on close');

    off();
    menu.toggle(a);
    assert.deepEqual(seen, [a, b], 'an unsubscribed listener is silent');
    menu.close();
  } finally {
    teardownDom(dom);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/selectors.test.js test/menu.test.js`
Expected: `boxOf is not a function`, `menu.onOpen is not a function`.

- [ ] **Step 3: Implement**

In `src/core/selectors.js`, after `chatIdOf`:

```js
/**
 * The chat box an element sits in (a padlock, a resize handle, anything of
 * ours mounted inside a chat), or null.
 * @returns {Element|null}
 */
export function boxOf(element) {
  return element && typeof element.closest === 'function'
    ? element.closest(CHAT_BOX_SELECTOR)
    : null;
}
```

In `src/core/menu.js`:
- add `const openListeners = new Set();` next to `let armed = false;`
- replace `open` with:

```js
  function open(nextAnchor) {
    anchor = nextAnchor;
    doc.body.appendChild(ensureElement());
    position();
    if (!armed) {
      doc.addEventListener('pointerdown', onPointerDown, true);
      doc.addEventListener('keydown', onKeyDown, true);
      armed = true;
    }
    // Rows that show something about the anchored chat refresh here - even
    // when the menu was already open and has just been re-anchored.
    for (const listener of [...openListeners]) listener(anchor);
  }
```

- add to the returned object, after `addRow`:

```js
    /**
     * Hear every open, with the element the menu is anchored to. A row that
     * is about "the chat this menu was opened from" learns which one here.
     * @param {(anchor: Element) => void} listener
     * @returns {() => void} unsubscribe
     */
    onOpen(listener) {
      openListeners.add(listener);
      return () => openListeners.delete(listener);
    },
```

Update the module's header comment: rows can also ask `onOpen` which element opened the menu.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/core/selectors.js src/core/menu.js test/selectors.test.js test/menu.test.js
git commit -m "feat(core): boxOf selector and menu.onOpen"
```

---

### Task 3: Size math and `applySize`

**Files:**
- Create: `src/features/resize/sizing.js`
- Test: `test/sizing.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/sizing.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom } from '../testlib/dom.js';
import { WIDGET_SIZE } from '../src/core/storage.js';
import { nextSize, limitsFor, applySize, SIZED_CLASS } from '../src/features/resize/sizing.js';

const start = { left: 100, top: 300, width: 270, height: 400 };
const viewport = { width: 1024, height: 768 };
const wide = { minWidth: 200, maxWidth: 900, minHeight: 150, maxHeight: 700 };

test('nextSize: each edge moves its own dimension, a corner moves two', () => {
  assert.deepEqual(nextSize({ direction: 's', start, dx: 5, dy: 50, limits: wide }), { width: 270, height: 450 });
  assert.deepEqual(nextSize({ direction: 'n', start, dx: 5, dy: -50, limits: wide }), { width: 270, height: 450 });
  assert.deepEqual(nextSize({ direction: 'e', start, dx: 30, dy: 50, limits: wide }), { width: 300, height: 400 });
  assert.deepEqual(nextSize({ direction: 'se', start, dx: 30, dy: 50, limits: wide }), { width: 300, height: 450 });
});

test('nextSize: clamps into the limits and rounds', () => {
  assert.deepEqual(nextSize({ direction: 'se', start, dx: -500, dy: -500, limits: wide }), { width: 200, height: 150 });
  assert.deepEqual(nextSize({ direction: 'se', start, dx: 5000, dy: 5000, limits: wide }), { width: 900, height: 700 });
  assert.deepEqual(nextSize({ direction: 's', start, dx: 0, dy: 10.4, limits: wide }), { width: 270, height: 410 });
});

test('limitsFor: a docked chat may grow up to the viewport height and keeps its width', () => {
  assert.deepEqual(limitsFor({ direction: 'n', start, floating: false, viewport }), {
    minWidth: WIDGET_SIZE.minWidth, maxWidth: 270,
    minHeight: WIDGET_SIZE.minHeight, maxHeight: 768,
  });
});

test('limitsFor: a floating chat stops at the viewport edges', () => {
  const s = limitsFor({ direction: 's', start, floating: true, viewport });
  assert.equal(s.maxHeight, 768 - 300, 'down to the bottom of the screen');
  assert.equal(s.maxWidth, 1024 - 100, 'right to the edge of the screen');
  const n = limitsFor({ direction: 'n', start, floating: true, viewport });
  assert.equal(n.maxHeight, 300 + 400, 'up to the top of the screen');
});

test('limitsFor: a maximum never drops below the minimum', () => {
  const tiny = limitsFor({ direction: 's', start: { ...start, top: 700 }, floating: true, viewport });
  assert.equal(tiny.maxHeight, WIDGET_SIZE.minHeight);
});

test('applySize writes the size inline with !important, and null hands it back to Torn', () => {
  const dom = setupDom();
  try {
    const box = dom.window.document.createElement('div');
    applySize(box, { width: 300, height: 450 });
    assert.equal(box.style.getPropertyValue('width'), '300px');
    assert.equal(box.style.getPropertyPriority('height'), 'important');
    assert.ok(box.classList.contains(SIZED_CLASS));

    applySize(box, { width: null, height: 450 });
    assert.equal(box.style.getPropertyValue('width'), '', 'width is Torn\'s again');
    assert.equal(box.style.getPropertyValue('height'), '450px');
    assert.ok(box.classList.contains(SIZED_CLASS), 'still sized in one dimension');

    applySize(box, { width: null, height: null });
    assert.equal(box.getAttribute('style') || '', '');
    assert.ok(!box.classList.contains(SIZED_CLASS));
  } finally {
    teardownDom(dom);
  }
});

test('applySize writes nothing that is already there', () => {
  const dom = setupDom();
  try {
    const box = dom.window.document.createElement('div');
    applySize(box, { width: 300, height: 450 });
    let writes = 0;
    const original = box.style.setProperty.bind(box.style);
    box.style.setProperty = (...args) => { writes += 1; return original(...args); };
    applySize(box, { width: 300, height: 450 });
    assert.equal(writes, 0);
  } finally {
    teardownDom(dom);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/sizing.test.js`
Expected: fails to import `../src/features/resize/sizing.js`.

- [ ] **Step 3: Implement**

Create `src/features/resize/sizing.js`:

```js
/**
 * The arithmetic of a resize, and the one place a size is written to a chat
 * box. Better Chat 3.0 showed on the live page that width/height on the box
 * is enough: the box is Torn's flex column of header, messages and input, and
 * Torn's own flex hands the extra height to the message list.
 */

import { WIDGET_SIZE } from '../../core/storage.js';

export const SIZED_CLASS = 'chatplus-sized';

/**
 * @typedef {{ left: number, top: number, width: number, height: number }} Rect
 * @typedef {{ minWidth: number, maxWidth: number, minHeight: number, maxHeight: number }} Limits
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * How far one gesture may go. A docked chat is pinned to the bottom of the
 * screen and keeps Torn's width, so it may only grow up to the viewport
 * height. A floating chat is pinned by its top-left corner: it may grow down
 * and right to the viewport edges, and from its top edge up to the top.
 * @param {{ direction: string, start: Rect, floating: boolean, viewport: {width: number, height: number} }} args
 * @returns {Limits}
 */
export function limitsFor({ direction, start, floating, viewport }) {
  const { minWidth, minHeight } = WIDGET_SIZE;
  let maxHeight = viewport.height;
  let maxWidth = start.width;
  if (floating) {
    maxHeight = direction.includes('n') ? start.top + start.height : viewport.height - start.top;
    maxWidth = viewport.width - start.left;
  }
  return {
    minWidth,
    maxWidth: Math.max(minWidth, maxWidth),
    minHeight,
    maxHeight: Math.max(minHeight, maxHeight),
  };
}

/**
 * The size a gesture asks for. `direction` names the edges being dragged:
 * 'n' (top edge, grows upward), 's' (bottom edge), 'e' (right edge); a corner
 * is two letters, e.g. 'se'. `dx`/`dy` are the pointer's travel since the press.
 * @param {{ direction: string, start: Rect, dx: number, dy: number, limits: Limits }} args
 * @returns {{ width: number, height: number }}
 */
export function nextSize({ direction, start, dx, dy, limits }) {
  let { width, height } = start;
  if (direction.includes('e')) width = clamp(start.width + dx, limits.minWidth, limits.maxWidth);
  if (direction.includes('s')) height = clamp(start.height + dy, limits.minHeight, limits.maxHeight);
  if (direction.includes('n')) height = clamp(start.height - dy, limits.minHeight, limits.maxHeight);
  return { width: Math.round(width), height: Math.round(height) };
}

function setPx(box, prop, value) {
  const current = box.style.getPropertyValue(prop);
  if (value == null) {
    if (current) box.style.removeProperty(prop);
    return;
  }
  const next = `${value}px`;
  if (current === next && box.style.getPropertyPriority(prop) === 'important') return;
  box.style.setProperty(prop, next, 'important');
}

/**
 * Size a chat box. `null` for a dimension hands it back to Torn. Inline and
 * !important so it beats Torn's stylesheet. Writes nothing that is already
 * there, so an observer watching the box can never loop on us.
 * @param {Element} box
 * @param {{ width: number|null, height: number|null }} size
 */
export function applySize(box, { width, height }) {
  setPx(box, 'width', width);
  setPx(box, 'height', height);
  const sized = width != null || height != null;
  if (sized !== box.classList.contains(SIZED_CLASS)) box.classList.toggle(SIZED_CLASS, sized);
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/features/resize/sizing.js test/sizing.test.js
git commit -m "feat(resize): size math and applySize"
```

---

### Task 4: Handles

**Files:**
- Create: `src/features/resize/handles.js`
- Test: `test/handles.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/handles.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, firePointer } from '../testlib/dom.js';
import {
  directionsFor, mountHandles, unmountHandles, mountedDirections,
  HANDLE_ATTR, HANDLE_CLASS, RESIZABLE_CLASS,
} from '../src/features/resize/handles.js';

async function withDom(fn) {
  const dom = setupDom();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

test('directionsFor: none while locked, top edge when docked, top/bottom/corner when floating', () => {
  assert.deepEqual(directionsFor({ locked: true, floating: false }), []);
  assert.deepEqual(directionsFor({ locked: true, floating: true }), []);
  assert.deepEqual(directionsFor({ locked: false, floating: false }), ['n']);
  assert.deepEqual(directionsFor({ locked: false, floating: true }), ['n', 's', 'se']);
});

test('mountHandles puts one marked, classed handle per direction on the box', () => withDom((dom) => {
  const doc = dom.window.document;
  const { box } = makeChatWidget(doc);
  mountHandles(box, ['n', 'se'], () => {});
  const handles = [...box.children].filter((el) => el.hasAttribute(HANDLE_ATTR));
  assert.deepEqual(handles.map((el) => el.getAttribute(HANDLE_ATTR)), ['n', 'se']);
  assert.ok(handles[1].classList.contains(HANDLE_CLASS));
  assert.ok(handles[1].classList.contains(`${HANDLE_CLASS}--se`));
  assert.ok(box.classList.contains(RESIZABLE_CLASS));
  assert.deepEqual(mountedDirections(box), ['n', 'se']);
}));

test('mountHandles is a no-op for the same set and rebuilds for a different one', () => withDom((dom) => {
  const doc = dom.window.document;
  const { box } = makeChatWidget(doc);
  mountHandles(box, ['n'], () => {});
  const first = box.querySelector(`[${HANDLE_ATTR}]`);
  mountHandles(box, ['n'], () => {});
  assert.equal(box.querySelector(`[${HANDLE_ATTR}]`), first, 'same element kept');
  mountHandles(box, ['n', 's', 'se'], () => {});
  assert.deepEqual(mountedDirections(box), ['n', 's', 'se']);
  assert.notEqual(box.querySelector(`[${HANDLE_ATTR}]`), first, 'rebuilt');
  mountHandles(box, [], () => {});
  assert.deepEqual(mountedDirections(box), []);
  assert.ok(!box.classList.contains(RESIZABLE_CLASS));
}));

test('a press on a handle reports its direction and the event', () => withDom((dom) => {
  const doc = dom.window.document;
  const { box } = makeChatWidget(doc);
  const presses = [];
  mountHandles(box, ['n', 's'], (direction, event) => presses.push([direction, event.type]));
  const south = box.querySelector(`[${HANDLE_ATTR}="s"]`);
  firePointer(south, 'pointerdown', { clientX: 5, clientY: 5 });
  assert.deepEqual(presses, [['s', 'pointerdown']]);
}));

test('unmountHandles removes every handle and the resizable class', () => withDom((dom) => {
  const doc = dom.window.document;
  const { box, header, body } = makeChatWidget(doc);
  mountHandles(box, ['n', 's', 'se'], () => {});
  unmountHandles(box);
  assert.deepEqual([...box.children], [header, body], 'Torn\'s children untouched');
  assert.ok(!box.classList.contains(RESIZABLE_CLASS));
}));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/handles.test.js`
Expected: fails to import `../src/features/resize/handles.js`.

- [ ] **Step 3: Implement**

Create `src/features/resize/handles.js`:

```js
/**
 * The resize handles: invisible strips on the edges of a chat box that can
 * move without moving the chat's anchor. Torn's docked row is pinned to the
 * bottom of the screen, so a docked chat grows from its top edge only; a
 * floating chat is pinned by its top-left corner, so it grows from its top
 * edge, its bottom edge and its bottom-right corner. No handle sits on the
 * right edge (the message list's scrollbar and Torn's close icon live there)
 * or the left edge (it would move a floating chat sideways).
 */

export const HANDLE_ATTR = 'data-chatplus-resize';
export const HANDLE_CLASS = 'chatplus-handle';
export const ACTIVE_CLASS = 'chatplus-handle--active';
/** On the box while handles are mounted: makes it the handles' containing block. */
export const RESIZABLE_CLASS = 'chatplus-resizable';

/**
 * Which edges a chat may be dragged from right now.
 * @param {{ locked: boolean, floating: boolean }} state
 * @returns {string[]} directions, see sizing.js for the letters
 */
export function directionsFor({ locked, floating }) {
  if (locked) return [];
  return floating ? ['n', 's', 'se'] : ['n'];
}

function handlesOf(box) {
  return [...box.children].filter((el) => el.hasAttribute(HANDLE_ATTR));
}

/** @returns {string[]} the directions currently mounted, in DOM order. */
export function mountedDirections(box) {
  return handlesOf(box).map((el) => el.getAttribute(HANDLE_ATTR));
}

/**
 * Put exactly `directions` handles on the box. A no-op when they are already
 * there, so a re-apply never rebuilds them - and never wakes the textScale
 * child observer for nothing.
 * @param {Element} box
 * @param {string[]} directions
 * @param {(direction: string, event: PointerEvent) => void} onPress
 */
export function mountHandles(box, directions, onPress) {
  const current = mountedDirections(box);
  if (current.length === directions.length && current.every((d, i) => d === directions[i])) return;
  unmountHandles(box);
  const doc = box.ownerDocument;
  for (const direction of directions) {
    const handle = doc.createElement('div');
    handle.className = `${HANDLE_CLASS} ${HANDLE_CLASS}--${direction}`;
    handle.setAttribute(HANDLE_ATTR, direction);
    handle.addEventListener('pointerdown', (event) => onPress(direction, event));
    box.appendChild(handle);
  }
  if (directions.length) box.classList.add(RESIZABLE_CLASS);
}

/** Take every handle off the box. Torn's own children are never touched. */
export function unmountHandles(box) {
  for (const handle of handlesOf(box)) handle.remove();
  box.classList.remove(RESIZABLE_CLASS);
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/features/resize/handles.js test/handles.test.js
git commit -m "feat(resize): handles per lock and floating state"
```

---

### Task 5: The resize controller

**Files:**
- Create: `src/features/resize/resizeController.js`
- Test: `test/resizeController.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/resizeController.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, stubRect, firePointer } from '../testlib/dom.js';
import { createResizeController, BODY_ATTR } from '../src/features/resize/resizeController.js';
import { mountHandles, HANDLE_ATTR, ACTIVE_CLASS } from '../src/features/resize/handles.js';

async function withDom(fn) {
  const dom = setupDom();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

/** A chat with handles wired to a controller that records what it is told. */
function rig(dom, { floating = false, directions = ['n', 's', 'se'] } = {}) {
  const doc = dom.window.document;
  const chat = makeChatWidget(doc, { id: 'chat-1' });
  stubRect(chat.box, { left: 100, top: 300, width: 270, height: 400 });
  const calls = { resize: [], commit: [] };
  const state = { box: chat.box };
  const controller = createResizeController({
    doc,
    getBox: () => state.box,
    getViewport: () => ({ width: 1024, height: 768 }),
    onResize: (size) => calls.resize.push(size),
    onCommit: (size) => calls.commit.push(size),
  });
  mountHandles(chat.box, directions, (direction, event) => controller.start(direction, event, { floating }));
  const handle = (dir) => chat.box.querySelector(`[${HANDLE_ATTR}="${dir}"]`);
  return { doc, chat, state, controller, calls, handle };
}

test('a press on a handle is kept from everyone else and starts a gesture', () => withDom((dom) => {
  const r = rig(dom);
  let reachedBody = false;
  r.doc.body.addEventListener('pointerdown', () => { reachedBody = true; });
  const event = firePointer(r.handle('n'), 'pointerdown', { clientX: 150, clientY: 300 });
  assert.equal(reachedBody, false, 'propagation stopped');
  assert.equal(event.defaultPrevented, true, 'no text selection, no Torn drag');
  assert.ok(r.controller.isActive());
  assert.equal(r.doc.body.getAttribute(BODY_ATTR), 'n');
  assert.ok(r.handle('n').classList.contains(ACTIVE_CLASS));
}));

test('moving resizes live and releasing commits once, then everything is cleaned up', () => withDom((dom) => {
  const r = rig(dom);
  firePointer(r.handle('n'), 'pointerdown', { clientX: 150, clientY: 300 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 280 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 240 });
  assert.deepEqual(r.calls.resize, [
    { width: 270, height: 420, shift: 0 },
    { width: 270, height: 460, shift: 0 },
  ]);
  assert.deepEqual(r.controller.liveSize(), { width: 270, height: 460, shift: 0 });
  firePointer(r.doc, 'pointerup', { clientX: 150, clientY: 240 });
  assert.deepEqual(r.calls.commit, [{ width: 270, height: 460, shift: 0 }]);
  assert.equal(r.controller.isActive(), false);
  assert.equal(r.controller.liveSize(), null);
  assert.equal(r.doc.body.hasAttribute(BODY_ATTR), false);
  assert.ok(!r.handle('n').classList.contains(ACTIVE_CLASS));
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 100 });
  assert.equal(r.calls.resize.length, 2, 'listeners are gone');
}));

test('a floating chat dragged up from its top edge reports how far the top moved', () => withDom((dom) => {
  const r = rig(dom, { floating: true });
  firePointer(r.handle('n'), 'pointerdown', { clientX: 150, clientY: 300 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 240 });
  assert.deepEqual(r.calls.resize.at(-1), { width: 270, height: 460, shift: 60 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: -500 });
  assert.deepEqual(r.calls.resize.at(-1), { width: 270, height: 700, shift: 300 }, 'stops at the top of the screen');
}));

test('the corner of a floating chat grows right and down, clamped to the viewport', () => withDom((dom) => {
  const r = rig(dom, { floating: true });
  firePointer(r.handle('se'), 'pointerdown', { clientX: 370, clientY: 700 });
  firePointer(r.doc, 'pointermove', { clientX: 400, clientY: 720 });
  assert.deepEqual(r.calls.resize.at(-1), { width: 300, height: 420, shift: 0 });
  firePointer(r.doc, 'pointermove', { clientX: 2000, clientY: 2000 });
  assert.deepEqual(r.calls.resize.at(-1), { width: 1024 - 100, height: 768 - 300, shift: 0 });
}));

test('no commit without a change, on cancel, or from another button', () => withDom((dom) => {
  const r = rig(dom);
  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700 });
  firePointer(r.doc, 'pointerup', { clientX: 150, clientY: 700 });
  assert.deepEqual(r.calls.commit, [], 'press and release: nothing');

  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 740 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 700 });
  firePointer(r.doc, 'pointerup', { clientX: 150, clientY: 700 });
  assert.deepEqual(r.calls.commit, [], 'back where it started: nothing');

  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 740 });
  firePointer(r.doc, 'pointercancel', { clientX: 150, clientY: 740 });
  assert.deepEqual(r.calls.commit, [], 'cancelled: nothing');
  assert.equal(r.controller.isActive(), false);

  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700, button: 2 });
  assert.equal(r.controller.isActive(), false, 'right button: ignored');
}));

test('the gesture carries on when Torn swaps the box under it', () => withDom((dom) => {
  const r = rig(dom);
  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700 });
  const replacement = makeChatWidget(r.doc, { id: 'chat-1' });
  r.chat.wrapper.remove();
  r.state.box = replacement.box;
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 740 });
  assert.deepEqual(r.calls.resize.at(-1), { width: 270, height: 440, shift: 0 });
  firePointer(r.doc, 'pointerup', { clientX: 150, clientY: 740 });
  assert.equal(r.calls.commit.length, 1);
}));

test('a gesture whose box leaves the DOM ends without committing', () => withDom((dom) => {
  const r = rig(dom);
  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700 });
  r.chat.wrapper.remove();
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 740 });
  assert.equal(r.controller.isActive(), false);
  firePointer(r.doc, 'pointerup', { clientX: 150, clientY: 740 });
  assert.deepEqual(r.calls.commit, []);
}));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/resizeController.test.js`
Expected: fails to import `../src/features/resize/resizeController.js`.

- [ ] **Step 3: Implement**

Create `src/features/resize/resizeController.js`:

```js
/**
 * One resize gesture at a time for one chat: a press on a handle, then
 * pointer moves until release.
 *
 * It listens on the document, not on the handle, and takes no pointer capture:
 * Torn swaps a chat's nodes mid-gesture when a message arrives, and a listener
 * on the removed handle would die with it. `getBox` is read on every move for
 * the same reason. Chrome keeps sending mouse events to the document while a
 * button is held, even outside the window, so release is never missed.
 */

import { debug } from '../../core/log.js';
import { limitsFor, nextSize } from './sizing.js';
import { ACTIVE_CLASS } from './handles.js';

/** On <body> while a gesture is live, valued with its direction, for the cursor rules in styles.css. */
export const BODY_ATTR = 'data-chatplus-resizing';

/**
 * @param {Object} config
 * @param {Document} [config.doc]
 * @param {() => Element|null} config.getBox  the chat box as of right now
 * @param {() => {width: number, height: number}} [config.getViewport]
 * @param {(size: {width: number, height: number, shift: number}) => void} config.onResize
 *   live, on every move. `shift` is how far the top edge has moved up, in px;
 *   it is only ever non-zero for a floating chat dragged from its top edge.
 * @param {(size: {width: number, height: number, shift: number}) => void} config.onCommit
 *   once, on release, and only if the size actually changed.
 */
export function createResizeController({
  doc = globalThis.document,
  getBox,
  getViewport = () => ({ width: doc.defaultView.innerWidth, height: doc.defaultView.innerHeight }),
  onResize,
  onCommit,
}) {
  let session = null;

  function sizeAt(event) {
    const { direction, start, limits, floating, originX, originY } = session;
    const size = nextSize({
      direction, start, limits,
      dx: event.clientX - originX,
      dy: event.clientY - originY,
    });
    const shift = floating && direction.includes('n') ? size.height - start.height : 0;
    return { ...size, shift };
  }

  function end(commit) {
    const { live, start, handle } = session;
    doc.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('pointerup', onPointerUp, true);
    doc.removeEventListener('pointercancel', onPointerCancel, true);
    doc.body.removeAttribute(BODY_ATTR);
    if (handle && handle.classList) handle.classList.remove(ACTIVE_CLASS);
    // Cleared before the commit: the commit writes storage, storage notifies
    // the feature, and the feature must then read the stored size, not this one.
    session = null;
    const changed = live
      && (live.width !== Math.round(start.width) || live.height !== Math.round(start.height));
    if (commit && changed) onCommit(live);
  }

  const onPointerMove = (event) => {
    if (!session || event.pointerId !== session.pointerId) return;
    const box = getBox();
    if (!box || !box.isConnected) {
      end(false);
      return;
    }
    if (event.cancelable) event.preventDefault();
    session.live = sizeAt(event);
    onResize(session.live);
  };

  const onPointerUp = (event) => {
    if (session && event.pointerId === session.pointerId) end(true);
  };

  const onPointerCancel = (event) => {
    if (session && event.pointerId === session.pointerId) end(false);
  };

  return {
    /**
     * Begin a gesture from a press on a handle. Left button only. The press is
     * kept from everyone else: the header drag, the header guard, Torn's
     * reorder drag, and text selection.
     * @param {string} direction  see sizing.js
     * @param {PointerEvent} event  the handle's pointerdown
     * @param {{ floating?: boolean }} [options]
     */
    start(direction, event, { floating = false } = {}) {
      if (event.button !== 0 || session) return;
      const box = getBox();
      if (!box) return;
      event.stopPropagation();
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      const start = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      session = {
        direction,
        floating,
        start,
        limits: limitsFor({ direction, start, floating, viewport: getViewport() }),
        originX: event.clientX,
        originY: event.clientY,
        pointerId: event.pointerId,
        handle: event.currentTarget,
        live: null,
      };
      doc.addEventListener('pointermove', onPointerMove, true);
      doc.addEventListener('pointerup', onPointerUp, true);
      doc.addEventListener('pointercancel', onPointerCancel, true);
      doc.body.setAttribute(BODY_ATTR, direction);
      if (session.handle && session.handle.classList) session.handle.classList.add(ACTIVE_CLASS);
      debug('resize start', direction, start);
    },
    /** The size last sent to onResize while a gesture is live, else null. */
    liveSize: () => (session ? session.live : null),
    isActive: () => session !== null,
    /** End a live gesture without committing. */
    cancel() {
      if (session) end(false);
    },
  };
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/features/resize/resizeController.js test/resizeController.test.js
git commit -m "feat(resize): document-level resize controller"
```

---

### Task 6: The "Widget size · Reset" menu row

**Files:**
- Create: `src/features/resize/resetRow.js`
- Test: `test/resetRow.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/resetRow.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, stubRect } from '../testlib/dom.js';
import * as selectors from '../src/core/selectors.js';
import { createStorage } from '../src/core/storage.js';
import { createMenu } from '../src/core/menu.js';
import { createResetRow, LABEL_TEXT, RESET_LABEL, BUTTON_CLASS } from '../src/features/resize/resetRow.js';

async function withDom(fn) {
  const dom = setupDom();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

function rig(dom) {
  const doc = dom.window.document;
  const storage = createStorage();
  const menu = createMenu({ doc });
  const row = menu.addRow();
  const control = createResetRow({ row, menu, storage, selectors });
  const chat = makeChatWidget(doc, { id: 'chat-1' });
  // The padlock lives in the header; any element inside the box will do here.
  const padlock = doc.createElement('button');
  chat.header.appendChild(padlock);
  stubRect(padlock, { left: 10, top: 10, width: 20, height: 20 });
  const button = row.querySelector(`.${BUTTON_CLASS}`);
  const click = () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return { doc, storage, menu, row, control, chat, padlock, button, click };
}

test('the row shows a label and a Reset button', () => withDom((dom) => {
  const r = rig(dom);
  assert.equal(r.row.querySelector('.chatplus-menu__label').textContent, LABEL_TEXT);
  assert.equal(r.button.textContent, RESET_LABEL);
  assert.equal(r.button.type, 'button');
}));

test('Reset is disabled for a chat at Torn\'s size and enabled once it has one', () => withDom((dom) => {
  const r = rig(dom);
  r.menu.open(r.padlock);
  assert.equal(r.button.disabled, true);
  r.menu.close();
  r.storage.setWidget('chat-1', { height: 500 });
  r.menu.open(r.padlock);
  assert.equal(r.button.disabled, false);
  r.storage.setWidget('chat-1', { height: null });
  r.control.sync();
  assert.equal(r.button.disabled, true, 'sync follows a change while open');
  r.menu.close();
}));

test('Reset clears that chat\'s size and closes the menu', () => withDom((dom) => {
  const r = rig(dom);
  r.storage.setWidget('chat-1', { width: 400, height: 500 });
  r.storage.setWidget('chat-2', { height: 333 });
  r.menu.open(r.padlock);
  r.click();
  assert.deepEqual(r.storage.getWidget('chat-1'), { x: null, y: null, locked: true, width: null, height: null });
  assert.equal(r.storage.getWidget('chat-2').height, 333, 'other chats untouched');
  assert.equal(r.menu.isOpen(), false);
}));

test('a click before the menu was ever opened does nothing', () => withDom((dom) => {
  const r = rig(dom);
  r.storage.setWidget('chat-1', { height: 500 });
  r.click();
  assert.equal(r.storage.getWidget('chat-1').height, 500);
}));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/resetRow.test.js`
Expected: fails to import `../src/features/resize/resetRow.js`.

- [ ] **Step 3: Implement**

Create `src/features/resize/resetRow.js`:

```js
/**
 * The "Widget size · Reset" row of the Chat+ menu. The menu is one popover
 * shared by every chat, so the row learns which chat it is about each time
 * the menu opens: from the padlock that opened it. Message size, the row
 * above it, is global; this one is per chat.
 */

export const LABEL_TEXT = 'Widget size';
export const RESET_LABEL = 'Reset';
export const RESET_ARIA_LABEL = "Chat+ reset this chat to Torn's size";
export const BUTTON_CLASS = 'chatplus-menu__button';

/**
 * @param {Object} config
 * @param {Element} config.row  the menu row to fill
 * @param {{ onOpen: Function, close: Function }} config.menu
 * @param {{ getWidget: Function, setWidget: Function }} config.storage
 * @param {{ boxOf: Function, chatIdOf: Function }} config.selectors
 * @returns {{ sync: () => void, destroy: () => void }}
 */
export function createResetRow({ row, menu, storage, selectors }) {
  const doc = row.ownerDocument;
  let chatId = null;

  const label = doc.createElement('span');
  label.className = 'chatplus-menu__label';
  label.textContent = LABEL_TEXT;

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.textContent = RESET_LABEL;
  button.setAttribute('aria-label', RESET_ARIA_LABEL);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!chatId) return;
    storage.setWidget(chatId, { width: null, height: null });
    menu.close();
  });
  row.append(label, button);

  /** Enabled only when the chat the menu is about has a size to reset. */
  function sync() {
    const state = chatId ? storage.getWidget(chatId) : null;
    button.disabled = !state || (state.width === null && state.height === null);
  }

  const unsubscribe = menu.onOpen((anchor) => {
    chatId = selectors.chatIdOf(selectors.boxOf(anchor));
    sync();
  });

  return { sync, destroy: unsubscribe };
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/features/resize/resetRow.js test/resetRow.test.js
git commit -m "feat(resize): per-chat reset row in the Chat+ menu"
```

---

### Task 7: The feature, wired in, with styles

**Files:**
- Create: `src/features/resize/index.js`
- Modify: `src/features/textScale/index.js`, `src/styles.css`, `src/main.js`
- Test: `test/resize.test.js`, `test/textScale.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/resize.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, stubRect, firePointer, settle } from '../testlib/dom.js';
import * as selectors from '../src/core/selectors.js';
import { createStorage, STORAGE_KEY } from '../src/core/storage.js';
import { createMenu } from '../src/core/menu.js';
import { createObserver } from '../src/core/observer.js';
import { createMovableFeature } from '../src/features/movable/index.js';
import { createTextScaleFeature, SCALED_CLASS } from '../src/features/textScale/index.js';
import { createResizeFeature } from '../src/features/resize/index.js';
import { HANDLE_ATTR, RESIZABLE_CLASS } from '../src/features/resize/handles.js';
import { SIZED_CLASS } from '../src/features/resize/sizing.js';
import { BODY_ATTR } from '../src/features/resize/resizeController.js';

async function withDom(fn) {
  const dom = setupDom();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

/** storage + menu + the three features + the observer, as main.js wires them. */
function boot(dom) {
  const doc = dom.window.document;
  const storage = createStorage();
  const menu = createMenu({ doc });
  const features = [createMovableFeature(), createTextScaleFeature(), createResizeFeature()];
  const ctx = { storage, selectors, menu };
  for (const feature of features) feature.init(ctx);
  const observer = createObserver({
    selectors,
    onWidgetAdded: (widget) => features.forEach((f) => f.onWidgetAdded(widget, ctx)),
    onWidgetRemoved: (widget) => features.forEach((f) => f.onWidgetRemoved(widget, ctx)),
  });
  observer.start();
  return { doc, storage, menu, observer };
}

/** A docked chat like Torn's, box rect stubbed at the bottom of a 1024x768 viewport. */
async function addChat(t, id = 'chat-1', rect = { left: 700, top: 368, width: 270, height: 400 }) {
  const chat = makeChatWidget(t.doc, { id });
  stubRect(chat.box, rect);
  await settle();
  return chat;
}

const handles = (box) => [...box.children].filter((el) => el.hasAttribute(HANDLE_ATTR)).map((el) => el.getAttribute(HANDLE_ATTR));
const handle = (box, dir) => box.querySelector(`[${HANDLE_ATTR}="${dir}"]`);

test('a locked chat gets nothing; unlocking mounts the top handle; floating adds bottom and corner', () => withDom(async (dom) => {
  const t = boot(dom);
  const chat = await addChat(t);
  assert.deepEqual(handles(chat.box), []);
  assert.ok(!chat.box.classList.contains(SIZED_CLASS));
  assert.equal(chat.box.getAttribute('style') || '', '', 'nothing of ours on an untouched chat');

  t.storage.setWidget('chat-1', { locked: false });
  assert.deepEqual(handles(chat.box), ['n']);
  assert.ok(chat.box.classList.contains(RESIZABLE_CLASS));

  t.storage.setWidget('chat-1', { x: 20, y: 300 });
  assert.deepEqual(handles(chat.box), ['n', 's', 'se']);

  t.storage.setWidget('chat-1', { locked: true });
  assert.deepEqual(handles(chat.box), [], 'locked while floating: no handles');
}));

test('a stored height applies always, a stored width only while floating', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { width: 400, height: 500 });
  const chat = await addChat(t);
  assert.equal(chat.box.style.getPropertyValue('height'), '500px');
  assert.equal(chat.box.style.getPropertyPriority('height'), 'important');
  assert.equal(chat.box.style.getPropertyValue('width'), '', 'docked: Torn\'s width');

  t.storage.setWidget('chat-1', { x: 20, y: 300 });
  assert.equal(chat.box.style.getPropertyValue('width'), '400px', 'floating: our width');

  t.storage.setWidget('chat-1', { x: null, y: null });
  assert.equal(chat.box.style.getPropertyValue('width'), '', 'back in the row: Torn\'s width again');
  assert.equal(chat.box.style.getPropertyValue('height'), '500px', 'height kept');
}));

test('dragging a docked chat\'s top edge up makes it taller and stores the height on release', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { locked: false });
  const chat = await addChat(t);
  firePointer(handle(chat.box, 'n'), 'pointerdown', { clientX: 800, clientY: 368 });
  assert.equal(t.doc.body.getAttribute(BODY_ATTR), 'n');
  firePointer(t.doc, 'pointermove', { clientX: 800, clientY: 308 });
  assert.equal(chat.box.style.getPropertyValue('height'), '460px', 'live');
  assert.equal(t.storage.getWidget('chat-1').height, null, 'nothing stored yet');
  firePointer(t.doc, 'pointerup', { clientX: 800, clientY: 308 });
  assert.equal(t.storage.getWidget('chat-1').height, 460);
  assert.equal(chat.box.style.getPropertyValue('height'), '460px');
  assert.equal(chat.box.style.getPropertyValue('width'), '', 'docked: width never written');
  assert.equal(t.doc.body.hasAttribute(BODY_ATTR), false);
}));

test('dragging a floating chat\'s top edge up keeps its bottom still and moves it up on release', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { locked: false, x: 50, y: 300 });
  const chat = await addChat(t, 'chat-1', { left: 50, top: 300, width: 270, height: 400 });
  firePointer(handle(chat.box, 'n'), 'pointerdown', { clientX: 100, clientY: 300 });
  firePointer(t.doc, 'pointermove', { clientX: 100, clientY: 240 });
  assert.equal(chat.box.style.getPropertyValue('height'), '460px');
  assert.equal(chat.box.style.getPropertyValue('translate'), '0 -60px', 'shifted up while dragging');
  assert.equal(chat.wrapper.style.getPropertyValue('--chatplus-y'), '300px', 'wrapper not moved yet');
  firePointer(t.doc, 'pointerup', { clientX: 100, clientY: 240 });
  const state = t.storage.getWidget('chat-1');
  assert.equal(state.height, 460);
  assert.equal(state.y, 240, 'top edge now where the pointer left it');
  assert.equal(state.width, 270, 'width stored too while floating');
  assert.equal(chat.box.style.getPropertyValue('translate'), '', 'shift gone');
  assert.equal(chat.wrapper.style.getPropertyValue('--chatplus-y'), '240px', 'movable re-placed the wrapper');
}));

test('the corner of a floating chat sizes both ways', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { locked: false, x: 50, y: 300 });
  const chat = await addChat(t, 'chat-1', { left: 50, top: 300, width: 270, height: 400 });
  firePointer(handle(chat.box, 'se'), 'pointerdown', { clientX: 320, clientY: 700 });
  firePointer(t.doc, 'pointermove', { clientX: 350, clientY: 720 });
  firePointer(t.doc, 'pointerup', { clientX: 350, clientY: 720 });
  const state = t.storage.getWidget('chat-1');
  assert.equal(state.width, 300);
  assert.equal(state.height, 420);
  assert.equal(chat.box.style.getPropertyValue('width'), '300px');
}));

test('a size written by another tab is applied', () => withDom(async (dom) => {
  const t = boot(dom);
  const chat = await addChat(t);
  const win = dom.window;
  win.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 1, widgets: { 'chat-1': { x: null, y: null, locked: true, width: null, height: 555 } }, settings: {},
  }));
  win.dispatchEvent(new win.StorageEvent('storage', { key: STORAGE_KEY }));
  assert.equal(chat.box.style.getPropertyValue('height'), '555px');
}));

test('a gesture survives Torn swapping the chat\'s nodes, and a removed chat is cleaned up', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { locked: false });
  const chat = await addChat(t);
  firePointer(handle(chat.box, 'n'), 'pointerdown', { clientX: 800, clientY: 368 });
  firePointer(t.doc, 'pointermove', { clientX: 800, clientY: 348 });

  // Torn re-renders: a new wrapper/box under the same id.
  chat.wrapper.remove();
  const again = await addChat(t);
  assert.equal(again.box.style.getPropertyValue('height'), '420px', 'the live size, not the stored one');
  assert.deepEqual(handles(again.box), ['n']);
  firePointer(t.doc, 'pointermove', { clientX: 800, clientY: 308 });
  assert.equal(again.box.style.getPropertyValue('height'), '460px');
  firePointer(t.doc, 'pointerup', { clientX: 800, clientY: 308 });
  assert.equal(t.storage.getWidget('chat-1').height, 460);

  // Minimized: the chat leaves. A later move must not touch storage.
  firePointer(handle(again.box, 'n'), 'pointerdown', { clientX: 800, clientY: 308 });
  again.wrapper.remove();
  await settle();
  firePointer(t.doc, 'pointermove', { clientX: 800, clientY: 200 });
  firePointer(t.doc, 'pointerup', { clientX: 800, clientY: 200 });
  assert.equal(t.storage.getWidget('chat-1').height, 460, 'unchanged');
}));

test('handles are never zoomed with the messages', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setSetting('messageScale', 150);
  t.storage.setWidget('chat-1', { locked: false });
  const chat = await addChat(t);
  await settle();
  assert.ok(chat.body.classList.contains(SCALED_CLASS), 'messages are');
  assert.ok(!handle(chat.box, 'n').classList.contains(SCALED_CLASS), 'the handle is not');
}));
```

Also append to `test/textScale.test.js` (it already has `withDom`, `boot`, `makeChat`, `settle`, `SCALED_CLASS`):

```js
test('a resize handle mounted on the box is left unscaled', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const chat = makeChat(t.doc, 'chat-1');
    t.observer.start();
    await settle();
    const handle = t.doc.createElement('div');
    handle.setAttribute('data-chatplus-resize', 'n');
    chat.box.appendChild(handle);
    await settle();
    assert.ok(chat.input.classList.contains(SCALED_CLASS), 'the input area is scaled');
    assert.ok(!handle.classList.contains(SCALED_CLASS), 'the handle is not');
  });
});
```

(Check how the existing tests in that file start the observer, `t.observer.start()` or `t.observer.scan()`, and do the same.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/resize.test.js test/textScale.test.js`
Expected: `resize.test.js` fails to import the feature; the new textScale case fails because the handle gets `chatplus-scaled`.

- [ ] **Step 3: Implement the feature**

Create `src/features/resize/index.js`:

```js
/**
 * Widget size: drag handles on every unlocked chat, the size kept per chat
 * beside its position. Height applies always; width only while the chat
 * floats, because Torn lays its row out for equal widths and a wider docked
 * chat would sit on its neighbour. Nothing here talks to the movable feature:
 * "floating" and "locked" are read from the storage record alone.
 */

import { debug } from '../../core/log.js';
import { applySize } from './sizing.js';
import { directionsFor, mountHandles, unmountHandles } from './handles.js';
import { createResizeController } from './resizeController.js';
import { createResetRow } from './resetRow.js';

const isFloating = (state) => state.x !== null && state.y !== null;

/**
 * While a floating chat grows from its top edge, the box is nudged up by the
 * growth so its bottom edge stays put until release. On the box, not the
 * wrapper: movable's watchWrapper re-asserts the wrapper's style and would
 * fight anything written there.
 */
function setShift(box, shift) {
  const next = shift ? `0 ${-shift}px` : '';
  if (box.style.getPropertyValue('translate') === next) return;
  if (next) box.style.setProperty('translate', next, 'important');
  else box.style.removeProperty('translate');
}

export function createResizeFeature() {
  /** @type {Map<string, {widget: {id: string, box: Element}, controller: ReturnType<typeof createResizeController>}>} */
  const entries = new Map();
  let ctx = null;
  let resetRow = null;

  const stateOf = (id) => ctx.storage.getWidget(id);

  /** A live gesture outranks storage, exactly as a live drag does in movable. */
  function apply(entry) {
    const { id, box } = entry.widget;
    const state = stateOf(id);
    const floating = isFloating(state);
    const live = entry.controller.liveSize();
    const size = live || { width: state.width, height: state.height };
    applySize(box, { width: floating ? size.width : null, height: size.height });
    setShift(box, live ? live.shift : 0);
    mountHandles(box, directionsFor({ locked: state.locked, floating }), (direction, event) => {
      entry.controller.start(direction, event, { floating: isFloating(stateOf(id)) });
    });
  }

  function applyAll() {
    for (const entry of entries.values()) apply(entry);
    if (resetRow) resetRow.sync();
  }

  function commit(entry, size) {
    const { id } = entry.widget;
    const state = stateOf(id);
    const patch = { height: size.height };
    if (isFloating(state)) {
      patch.width = size.width;
      if (size.shift) patch.y = state.y - size.shift;
    }
    debug('resize commit', id, patch);
    // setWidget notifies every subscriber: movable re-places the wrapper at
    // the new y, and applyAll above re-applies the size and drops the shift.
    ctx.storage.setWidget(id, patch);
  }

  function createEntry(widget) {
    const entry = { widget };
    entry.controller = createResizeController({
      getBox: () => entry.widget.box,
      onResize: (size) => {
        const floating = isFloating(stateOf(entry.widget.id));
        applySize(entry.widget.box, { width: floating ? size.width : null, height: size.height });
        setShift(entry.widget.box, size.shift);
      },
      onCommit: (size) => commit(entry, size),
    });
    return entry;
  }

  function init(context) {
    ctx = context;
    // Fires for local writes AND for the cross-tab 'storage' event.
    ctx.storage.subscribe(applyAll);
    resetRow = createResetRow({
      row: ctx.menu.addRow(), menu: ctx.menu, storage: ctx.storage, selectors: ctx.selectors,
    });
  }

  function onWidgetAdded(widget, context) {
    ctx = context;
    const entry = entries.get(widget.id);
    // Torn re-rendered this chat: the entry adopts the new box, and a gesture
    // in flight carries on with it (the controller reads getBox on every move).
    if (entry) entry.widget = widget;
    else entries.set(widget.id, createEntry(widget));
    apply(entries.get(widget.id));
  }

  function onWidgetRemoved(widget) {
    // Adds are reported before removes, so after a node swap the entry already
    // belongs to the replacement: only drop it if it is still about this one.
    const entry = entries.get(widget.id);
    if (!entry || entry.widget !== widget) return;
    entry.controller.cancel();
    unmountHandles(widget.box);
    entries.delete(widget.id);
  }

  return { id: 'resize', init, onWidgetAdded, onWidgetRemoved };
}
```

- [ ] **Step 4: Keep handles out of the message zoom**

In `src/features/textScale/index.js` add the import:

```js
import { HANDLE_ATTR } from '../resize/handles.js';
```

and change the loop in `applyScale` to:

```js
  for (const child of box.children) {
    // Our own resize handles sit in the box too; they must keep their size.
    if (child === header || child.hasAttribute(HANDLE_ATTR)) continue;
    if (!child.classList.contains(SCALED_CLASS)) child.classList.add(SCALED_CLASS);
  }
```

- [ ] **Step 5: Register the feature**

In `src/main.js` add `import { createResizeFeature } from './features/resize/index.js';` after the textScale import, and `registry.register(createResizeFeature());` right after `registry.register(createTextScaleFeature());`.

- [ ] **Step 6: Styles**

Append to `src/styles.css`, before the `/* The Chat+ settings menu ... */` block:

```css
/* Widget size. The size itself is inline on the chat box (features/resize/
   sizing.js); these rules let it beat Torn's caps and contain the children,
   the way Better Chat 3.0 does. */
.chatplus-sized {
  max-width: none !important;
  max-height: none !important;
  overflow: hidden !important;
}

/* On the box while handles are mounted: the handles position against it. */
.chatplus-resizable {
  position: relative !important;
}

.chatplus-handle {
  position: absolute;
  z-index: 10;
  background: transparent;
  /* Without this a touch drag is stolen by the page's own scrolling. */
  touch-action: none;
  user-select: none;
}

.chatplus-handle--n { top: 0; left: 0; right: 0; height: 8px; cursor: ns-resize; }
.chatplus-handle--s { bottom: 0; left: 0; right: 0; height: 8px; cursor: ns-resize; }
.chatplus-handle--se { right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; z-index: 11; }

.chatplus-handle:hover,
.chatplus-handle--active {
  background: rgba(124, 169, 0, 0.35);
}

body[data-chatplus-resizing="n"],
body[data-chatplus-resizing="n"] *,
body[data-chatplus-resizing="s"],
body[data-chatplus-resizing="s"] * {
  cursor: ns-resize !important;
}

body[data-chatplus-resizing="se"],
body[data-chatplus-resizing="se"] * {
  cursor: nwse-resize !important;
}
```

and after the `.chatplus-menu__step:hover` rule:

```css
.chatplus-menu__button {
  height: 20px;
  flex: 0 0 auto;
  padding: 0 8px;
  border: 1px solid #3a3a3a;
  border-radius: 3px;
  background: #2a2a2a;
  color: inherit;
  font: inherit;
  line-height: 1;
  cursor: pointer;
}

.chatplus-menu__button:hover:not(:disabled) {
  background: #3a3a3a;
}

.chatplus-menu__button:disabled {
  opacity: 0.4;
  cursor: default;
}
```

Update the comment at the top of `src/styles.css` from "movable chat widgets" to "Chat+ styles" if it still names only the first feature.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: `# fail 0`. If the floating-drag test's `--chatplus-y` assertions fail because movable formats the value differently, read `src/features/movable/floating.js` `applyFloating` and match its exact format in the test rather than changing movable.

- [ ] **Step 8: Commit**

```bash
git add src/features/resize/index.js src/features/textScale/index.js src/main.js src/styles.css test/resize.test.js test/textScale.test.js
git commit -m "feat: per-widget size with drag handles and a menu reset"
```

---

### Task 8: Version, build check, diagnostics, README

**Files:**
- Modify: `src/header.txt`, `test/build.test.js`, `diagnostics/dump.js`, `README.md`

- [ ] **Step 1: Extend the build test**

In `test/build.test.js`, inside the test named `'the bundle inlines the stylesheet, the selectors and the feature wiring'`, add:

```js
  assert.match(code, /chatplus-handle--se/, 'the resize handle rules must be inlined');
  assert.match(code, /data-chatplus-resizing/, 'the resize cursor rules must be inlined');
  assert.match(code, /Widget size/, 'the reset row label must be in the bundle');
```

Run: `npm test -- test/build.test.js`
Expected: passes already if Task 7 is in (the bundle is rebuilt by the test). If it fails, fix the cause before going on.

- [ ] **Step 2: Bump the version**

In `src/header.txt` change `// @version      1.4.0` to `// @version      1.5.0`. Keep the column alignment.

- [ ] **Step 3: Diagnostics**

In `diagnostics/dump.js`, next to the existing helper `rectOf(el)`, add:

```js
    function sizeOf(el) {
      if (!el) return '(none)';
      var cs = getComputedStyle(el);
      return cs.width + ' x ' + cs.height + ' pos=' + cs.position + ' overflow=' + cs.overflow
        + ' max=' + cs.maxWidth + '/' + cs.maxHeight
        + ' inline="' + clip(el.getAttribute('style') || '') + '"';
    }
```

and directly after the line that adds `'box ids: ' + ...` to the report, add:

```js
    boxes.forEach(function (b) {
      var wrapper = b.parentElement && b.parentElement.parentElement;
      add('size ' + b.id + ': box ' + sizeOf(b) + ' | wrapper ' + sizeOf(wrapper));
      add('  handles: ' + (b.querySelectorAll('[data-chatplus-resize]').length || 0)
        + ' sized=' + b.classList.contains('chatplus-sized')
        + ' resizable=' + b.classList.contains('chatplus-resizable'));
    });
```

Read the file around those points first: `clip` and `add` exist there already; match their argument conventions. Then paste the whole script into a Node REPL-free syntax check: `node --check diagnostics/dump.js`.

- [ ] **Step 4: README**

In `README.md`:

- Under `## Using it`, after the message-size paragraph, add:

```markdown
**Widget size.** Unlock a chat (click its padlock) and a handle appears along
its top edge: drag it up to make the chat taller. A chat you have moved out of
Torn's row also gets a handle on its bottom edge and one in its bottom-right
corner, so it can grow in any direction its anchor allows. Width is only
adjustable on a moved chat: Torn lays its row out for equal widths, so a
docked chat keeps Torn's width and just its height. Sizes are remembered per
chat. Right-click the padlock and press **Reset** on the *Widget size* row to
give that chat Torn's size back. Locking a chat hides the handles and keeps
the size.
```

- Under `## Manual acceptance checklist`, add a `### Widget size` list with the seven items from spec section 7 (copy them verbatim).
- Under `## Project layout`, add `src/features/resize/` with one line per file, in the same style as the movable entries.
- Under `## Credits`, add: `- **Better Chat 3.0** by Weav3r (Greasy Fork 553128) for showing that sizing the chat box itself is enough, with Torn's own flex handing the room to the message list.`
- Update any mention of the current version (e.g. "v1.4.0") to 1.5.0.

- [ ] **Step 5: Run the whole suite and build**

Run: `npm test`
Expected: `# fail 0`, and the version test now sees `1.5.0`.

Run: `npm run build`
Expected: `dist/chatplus.user.js` rebuilt; `Get-Item dist/chatplus.user.js | Select-Object Length` prints a size around 50–55 KB.

- [ ] **Step 6: Commit**

```bash
git add src/header.txt test/build.test.js diagnostics/dump.js README.md dist/chatplus.user.js
git commit -m "chore: v1.5.0 - widget size docs, diagnostics and build"
```

(If `dist/` is git-ignored, leave it out of the `git add`.)

---

## Self-review against the spec

- Spec §2 behaviour: handles per state (Task 4, 7), height everywhere / width while floating (Task 7 `apply`), bounds (Task 3), persistence (Task 1), reset row (Task 6), gesture survives re-render (Task 5, 7 test).
- Spec §3 mechanism: inline `!important` on the box (Task 3), `.chatplus-sized` and `.chatplus-resizable` rules (Task 7), upward growth via the box translate and a single `{ height, y }` write (Task 7).
- Spec §4 storage: Task 1.
- Spec §5.2 core changes: `boxOf`, `onOpen` (Task 2), textScale skip (Task 7), styles (Task 7), version, dump, README (Task 8).
- Spec §8 tests: every listed suite has a task.
- Names used consistently: `directionsFor`, `mountHandles`, `unmountHandles`, `mountedDirections`, `HANDLE_ATTR`, `ACTIVE_CLASS`, `RESIZABLE_CLASS` (handles.js); `nextSize`, `limitsFor`, `applySize`, `SIZED_CLASS` (sizing.js); `createResizeController` with `start/liveSize/isActive/cancel` and `BODY_ATTR = 'data-chatplus-resizing'` (resizeController.js); `createResetRow` with `sync/destroy` (resetRow.js); `createResizeFeature` (index.js); `WIDGET_SIZE` (storage.js); `boxOf` (selectors.js); `onOpen` (menu.js).
