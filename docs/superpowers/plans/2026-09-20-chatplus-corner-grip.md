# Chat+ Corner Grip and Docked Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-left corner grip to every unlocked chat that sizes width and height together, and make width apply to docked chats with the row sliding the other chats over.

**Architecture:** Three focused changes on top of v1.5.1. (1) The resize feature learns the `w` edge: `nextSize`/`limitsFor`, a horizontal shift beside the vertical one, and the `nw` handle. (2) The movable feature's reflow becomes width-aware: each docked chat further from the row's anchor slides by the extra width of the chats nearer the anchor; the feature records Torn's default width at add time and re-runs the row when a box's inline style changes. (3) Docs, version 1.6.0, build test. Spec: `docs/superpowers/specs/2026-09-20-chatplus-corner-grip-design.md`.

**Tech Stack:** Plain ES modules, esbuild, `node --test` + jsdom via `testlib/dom.js`. Node 24.

**Conventions (same as the previous plan):** short why-comments, no bloat, readable bundle. Run `npm test` from the repo root and read the summary line (`ℹ fail 0`) before every commit; never grep for it. Commit per task with the given message and these trailers:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ
```

`git add` named files only. `dist/chatplus.user.js` is tracked and is rebuilt by `test/build.test.js`; commit it only in Task 3, and `git checkout -- dist/chatplus.user.js` before the Task 1 and Task 2 commits. Integration tests must call `t.observer.scan()` after building a fake chat rather than rely on `settle()` alone (see `test/resize.test.js` `addChat`).

---

### Task 1: The `nw` corner in the resize feature

**Files:**
- Modify: `src/features/resize/sizing.js`, `src/features/resize/handles.js`, `src/features/resize/resizeController.js`, `src/features/resize/index.js`, `src/styles.css`
- Test: `test/sizing.test.js`, `test/handles.test.js`, `test/resizeController.test.js`, `test/resize.test.js`

- [ ] **Step 1: Write the failing tests**

`test/sizing.test.js` — add:

```js
test('nextSize: the left edge grows leftward, and the top-left corner moves both', () => {
  assert.deepEqual(nextSize({ direction: 'w', start, dx: -30, dy: 50, limits: wide }), { width: 300, height: 400 });
  assert.deepEqual(nextSize({ direction: 'nw', start, dx: -30, dy: -50, limits: wide }), { width: 300, height: 450 });
});

test('limitsFor: from the left edge a chat may grow to the screen\'s left edge, docked or floating', () => {
  assert.equal(limitsFor({ direction: 'nw', start, floating: false, viewport }).maxWidth, 100 + 270);
  assert.equal(limitsFor({ direction: 'nw', start, floating: true, viewport }).maxWidth, 100 + 270);
  assert.equal(limitsFor({ direction: 'nw', start, floating: true, viewport }).maxHeight, 300 + 400, 'n rule still applies');
});
```

`test/handles.test.js` — change the `directionsFor` expectations to `['n', 'nw']` (docked) and `['n', 'nw', 's', 'se']` (floating); update the test name.

`test/resizeController.test.js` — every expected size object gains `shiftX` and the old `shift` becomes `shiftY` (e.g. `{ width: 270, height: 460, shiftX: 0, shiftY: 0 }`; the floating top-edge case becomes `shiftY: 60`, then `shiftY: 300`). Add:

```js
test('the top-left corner of a floating chat reports both shifts; on a docked chat neither', () => withDom((dom) => {
  const f = rig(dom, { floating: true, directions: ['nw'] });
  firePointer(f.handle('nw'), 'pointerdown', { clientX: 100, clientY: 300 });
  firePointer(f.doc, 'pointermove', { clientX: 70, clientY: 240 });
  assert.deepEqual(f.calls.resize.at(-1), { width: 300, height: 460, shiftX: 30, shiftY: 60 });
  firePointer(f.doc, 'pointermove', { clientX: -500, clientY: 240 });
  assert.equal(f.calls.resize.at(-1).width, 100 + 270, 'stops at the left edge of the screen');
  assert.equal(f.calls.resize.at(-1).shiftX, 100);

  const d = rig(dom, { floating: false, directions: ['nw'] });
  firePointer(d.handle('nw'), 'pointerdown', { clientX: 100, clientY: 300 });
  firePointer(d.doc, 'pointermove', { clientX: 70, clientY: 240 });
  assert.deepEqual(d.calls.resize.at(-1), { width: 300, height: 460, shiftX: 0, shiftY: 0 });
}));
```

(`rig` builds a chat with id `chat-1`; a second `rig` in the same DOM is fine because each has its own controller and box. If the helper's fixed id causes a `querySelector` clash, give `rig` an `id` option.)

`test/resize.test.js` — the first test's handle expectations become `['n', 'nw']` and `['n', 'nw', 's', 'se']`; the second test is renamed "a stored width and height apply to a docked chat" and asserts `width` is `'400px'` while docked and stays after floating; the floating top-edge test's translate expectation becomes `'0px -60px'`. Add:

```js
test('the top-left corner of a docked chat sizes both ways without moving it', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { locked: false });
  const chat = await addChat(t);
  firePointer(handle(chat.box, 'nw'), 'pointerdown', { clientX: 700, clientY: 368 });
  firePointer(t.doc, 'pointermove', { clientX: 670, clientY: 308 });
  assert.equal(chat.box.style.getPropertyValue('width'), '300px');
  assert.equal(chat.box.style.getPropertyValue('height'), '460px');
  assert.equal(chat.box.style.getPropertyValue('translate'), '', 'a docked chat is never shifted');
  firePointer(t.doc, 'pointerup', { clientX: 670, clientY: 308 });
  const state = t.storage.getWidget('chat-1');
  assert.deepEqual([state.width, state.height, state.x, state.y], [300, 460, null, null]);
}));

test('the top-left corner of a floating chat grows up and left in place', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { locked: false, x: 100, y: 300 });
  const chat = await addChat(t, 'chat-1', { left: 100, top: 300, width: 270, height: 400 });
  firePointer(handle(chat.box, 'nw'), 'pointerdown', { clientX: 100, clientY: 300 });
  firePointer(t.doc, 'pointermove', { clientX: 70, clientY: 240 });
  assert.equal(chat.box.style.getPropertyValue('translate'), '-30px -60px');
  firePointer(t.doc, 'pointerup', { clientX: 70, clientY: 240 });
  const state = t.storage.getWidget('chat-1');
  assert.deepEqual([state.width, state.height, state.x, state.y], [300, 460, 70, 240]);
  assert.equal(chat.box.style.getPropertyValue('translate'), '');
  assert.equal(chat.wrapper.style.getPropertyValue('--chatplus-x'), '70px');
}));
```

- [ ] **Step 2: Run the four suites and see them fail** (`npm test -- test/sizing.test.js test/handles.test.js test/resizeController.test.js test/resize.test.js`).

- [ ] **Step 3: Implement**

`sizing.js`: in `limitsFor`, after the floating block, add

```js
  // From its left edge a chat grows toward the screen's left edge, docked or not.
  if (direction.includes('w')) maxWidth = start.left + start.width;
```

In `nextSize` add `if (direction.includes('w')) width = clamp(start.width - dx, limits.minWidth, limits.maxWidth);` and extend the JSDoc: `'w'` is the left edge, grows leftward.

`handles.js`: `directionsFor` returns `floating ? ['n', 'nw', 's', 'se'] : ['n', 'nw']`; update the header comment (the top-left corner sizes both ways; no left-edge strip, the user chose one grip).

`resizeController.js`: in `sizeAt`

```js
    const shiftX = floating && direction.includes('w') ? size.width - Math.round(start.width) : 0;
    const shiftY = floating && direction.includes('n') ? size.height - Math.round(start.height) : 0;
    return { ...size, shiftX, shiftY };
```

and the JSDoc: `shiftX` is how far the left edge moved left, `shiftY` how far the top edge moved up; each only non-zero for a floating chat dragged from that edge.

`index.js`:

```js
function setShift(box, shiftX, shiftY) {
  const next = shiftX || shiftY ? `${-shiftX}px ${-shiftY}px` : '';
  if (box.style.getPropertyValue('translate') === next) return;
  if (next) box.style.setProperty('translate', next, 'important');
  else box.style.removeProperty('translate');
}
```

`apply`: `applySize(box, { width: size.width, height: size.height }); setShift(box, live ? live.shiftX : 0, live ? live.shiftY : 0);` — the floating gate on width goes. `onResize`: `applySize(entry.widget.box, { width: size.width, height: size.height }); setShift(entry.widget.box, size.shiftX, size.shiftY);` and drop its `floating` lookup. `commit`:

```js
    const patch = { width: size.width, height: size.height };
    if (isFloating(state)) {
      if (size.shiftX) patch.x = state.x - size.shiftX;
      if (size.shiftY) patch.y = state.y - size.shiftY;
    }
```

Rewrite the file's header comment: width now applies everywhere; the row reflow (movable) makes room for a wider docked chat. Update `setShift`'s comment: the box is nudged up and left by the growth so its bottom-right corner stays put until release.

`styles.css`: after the `--se` rule add `.chatplus-handle--nw { left: 0; top: 0; width: 14px; height: 14px; cursor: nwse-resize; z-index: 11; }` and add `body[data-chatplus-resizing="nw"], body[data-chatplus-resizing="nw"] *` to the `nwse-resize` cursor rule.

- [ ] **Step 4: `npm test` → `ℹ fail 0`.** Restore `dist/chatplus.user.js`.

- [ ] **Step 5: Commit** — `git add` the five source files and four test files; message `feat(resize): top-left corner grip, width on every chat`.

---

### Task 2: Width-aware reflow

**Files:**
- Modify: `src/features/movable/reflow.js`, `src/features/movable/index.js`
- Test: `test/reflow.test.js`, `test/movable.test.js`

- [ ] **Step 1: Write the failing tests**

`test/reflow.test.js` — read the file's existing helpers, then add (adapt call style to match):

```js
test('a wider widget nearer the anchor pushes the rest of the row away by the extra width', () => {
  const widgets = (widths) => [
    { id: 'a', natural: 0, width: widths[0] },
    { id: 'b', natural: -273, width: widths[1] },
    { id: 'c', natural: -546, width: widths[2] },
  ];
  const right = (widths, extra = {}) => Object.fromEntries(
    computeCompensations({ prop: 'transform', widgets: widgets(widths), defaultWidth: 270, ...extra }),
  );
  assert.deepEqual(right([400, 270, 270]), { a: 0, b: -130, c: -130 });
  assert.deepEqual(right([270, 370, 270]), { a: 0, b: 0, c: -100 });
  assert.deepEqual(right([400, 370, 270]), { a: 0, b: -130, c: -230 });
});

test('a floating widget contributes nothing and the survivors still pack', () => {
  const result = Object.fromEntries(computeCompensations({
    prop: 'transform',
    defaultWidth: 270,
    widgets: [
      { id: 'a', natural: 0, width: 400 },
      { id: 'b', natural: -273, width: 500, floating: true },
      { id: 'c', natural: -546, width: 270 },
    ],
  }));
  assert.deepEqual(result, { a: 0, b: 0, c: 273 - 130 });
});

test('the push follows the anchor side: right-anchored rows push left, left-anchored rows push right', () => {
  const two = (prop, naturals) => Object.fromEntries(computeCompensations({
    prop, defaultWidth: 270,
    widgets: [{ id: 'a', natural: naturals[0], width: 400 }, { id: 'b', natural: naturals[1], width: 270 }],
  }));
  assert.deepEqual(two('right', [0, 273]), { a: 0, b: -130 });
  assert.deepEqual(two('left', [0, 273]), { a: 0, b: 130 });
  assert.deepEqual(two('transform', [0, 273]), { a: 0, b: 130 }, 'positive translateX means a left-anchored row');
});

test('without widths or a default width the row behaves as before', () => {
  const layout = { prop: 'transform', widgets: [{ id: 'a', natural: 0 }, { id: 'b', natural: -273, width: 400 }] };
  assert.deepEqual(Object.fromEntries(computeCompensations(layout)), { a: 0, b: 0 });
  assert.deepEqual(Object.fromEntries(computeCompensations({ ...layout, defaultWidth: 270, widgets: [{ id: 'a', natural: 0, width: 400 }, { id: 'b', natural: -273 }] })), { a: 0, b: -130 });
});
```

Also add an `applyCompensations` case: two wrappers with `transform: translateX(0px)` / `translateX(-273px)`, `stubRect` widths 400 and 270, called with `defaultWidth` 270 → the second wrapper's `translate` is `-130px 0`.

`test/movable.test.js` — read its `boot`/helpers, then add a case: boot with movable; build two docked chats `a` (`transform: translateX(0px)`) and `b` (`translateX(-273px)`), wrapper rects 270 wide, `observer.scan()`, `await settle()`, assert `b.wrapper.style.getPropertyValue('translate')` is `''`. Then `stubRect(a.wrapper, { width: 400, height: 120 }); a.box.style.setProperty('width', '400px', 'important'); await settle();` and assert `b`'s translate is `-130px 0`. Then a re-emit check: replace `a`'s header element with a new one (so the observer re-emits the widget with the same box carrying the inline width), `scan()`, `settle()`, and assert `b`'s translate is still `-130px 0` (Torn's default width was not re-measured from the sized box).

- [ ] **Step 2: Run both suites and see them fail.**

- [ ] **Step 3: Implement**

`reflow.js`:

```js
/** @typedef {{ id: string, natural: number, floating?: boolean, width?: number }} RowWidget */
/** @typedef {{ prop: 'right'|'left'|'transform', widgets: RowWidget[], defaultWidth?: number }} RowLayout */

/**
 * The on-screen direction away from the row's anchor edge: -1 when the row
 * hangs off the right edge of the screen, +1 off the left. Torn's live row
 * places wrappers with negative translateX from a right-pinned position.
 */
function awayFromAnchor(prop, entries) {
  if (prop === 'right') return -1;
  if (prop === 'left') return 1;
  return entries.some((entry) => entry.natural < 0) ? -1 : 1;
}
```

In `computeCompensations`, carry `width: w.width` into each entry, then after sorting:

```js
  const away = awayFromAnchor(layout.prop, entries);
  const defaultWidth = Number.isFinite(layout.defaultWidth) ? layout.defaultWidth : null;
  const slots = entries.map((entry) => entry.natural);
  let nextSlot = 0;
  // Width beyond Torn's default among the widgets already placed nearer the
  // anchor: everything further out slides by this much so nothing overlaps.
  let extra = 0;
  for (const entry of entries) {
    if (entry.floating) {
      result.set(entry.id, 0);
      continue;
    }
    const target = slots[nextSlot];
    nextSlot += 1;
    const compensation = sign * (target - entry.natural) + away * extra;
    result.set(entry.id, compensation === 0 ? 0 : compensation);
    if (defaultWidth !== null && Number.isFinite(entry.width)) extra += entry.width - defaultWidth;
  }
```

`applyCompensations(widgets, selectors, isFloating = () => false, defaultWidth)`: each row widget gets `width: entry.widget.wrapper.getBoundingClientRect().width`, and the layout gets `defaultWidth`. Update the module header: the row also makes room for widgets wider than Torn's default.

`src/features/movable/index.js`:

- A local helper:

```js
/**
 * The resize feature writes a chat's size on the box's inline style; any
 * change there may change the row, so it re-runs the reflow. (ResizeObserver
 * would be the natural fit, but jsdom cannot exercise it.)
 */
function watchBoxStyle(box, onChange) {
  const MO = globalThis.MutationObserver;
  if (!box || typeof MO !== 'function') return () => {};
  const observer = new MO(onChange);
  observer.observe(box, { attributes: true, attributeFilter: ['style'] });
  return () => observer.disconnect();
}
```

- `defaultWidthOf()`: the first finite `entry.naturalWidth` among `entries.values()`, else `undefined`; pass it as the fourth argument of `applyCompensations` inside `scheduleReflow`.
- In `onWidgetAdded`, before `dropEntry`: `const previous = entries.get(widget.id);` already exists; add

```js
    // Torn's own width, measured before the resize feature writes ours. A
    // re-emitted box that already carries an inline width keeps the earlier value.
    const naturalWidth = widget.box.style.width
      ? (previous ? previous.naturalWidth : undefined)
      : widget.wrapper.getBoundingClientRect().width;
```

  and `const unwatchBox = watchBoxStyle(widget.box, scheduleReflow);`; the entry becomes `{ widget, lock, arrow, drag, guard, unwatch, unwatchBox, naturalWidth }`.
- `dropEntry`: call `entry.unwatchBox()`.

- [ ] **Step 4: `npm test` → `ℹ fail 0`.** Restore `dist/chatplus.user.js`.

- [ ] **Step 5: Commit** — `git add src/features/movable/reflow.js src/features/movable/index.js test/reflow.test.js test/movable.test.js`; message `feat(movable): the row makes room for wider docked chats`.

---

### Task 3: Version, docs, build test

**Files:**
- Modify: `src/header.txt`, `test/build.test.js`, `README.md`, `docs/superpowers/specs/2026-09-20-chatplus-corner-grip-design.md`, `dist/chatplus.user.js`

- [ ] **Step 1:** `test/build.test.js`: add `assert.match(code, /chatplus-handle--nw/, 'the corner grip rule must be inlined');` next to the `--se` assertion. Run it; it passes already once Task 1 is in.
- [ ] **Step 2:** `src/header.txt`: `@version 1.6.0`.
- [ ] **Step 3:** `README.md`: rewrite the **Widget size** paragraph under "Using it": unlock a chat for a strip along its top edge (height) and a grip in its top-left corner (width and height together); a moved chat also gets a bottom strip and a bottom-right corner; width applies to every chat, and a wider docked chat grows leftward while the other chats slide over; sizes persist per chat; Reset in the padlock menu. Replace the "Widget size" checklist items with the five from spec section 5 of the corner-grip design. Leave Credits as they are.
- [ ] **Step 4:** In the corner-grip spec, change line 4 `Status:` to add `, implemented 2026-09-20`.
- [ ] **Step 5:** `npm test` → `ℹ fail 0`; `npm run build`; confirm `grep -c 'chatplus-handle--nw' dist/chatplus.user.js` prints at least 1 and `@version 1.6.0` is in the bundle.
- [ ] **Step 6: Commit** — `git add src/header.txt test/build.test.js README.md docs/superpowers/specs/2026-09-20-chatplus-corner-grip-design.md dist/chatplus.user.js`; message `chore: v1.6.0 - corner grip docs and build`.

---

## Self-review against the spec

- §2 handles per state → Task 1 `directionsFor`; corner behaviour → Task 1 sizing/controller; width everywhere → Task 1 `apply`/`commit`; docked growth with the row sliding → Task 2; floating growth in place with `x`/`y` on release → Task 1; bounds → Task 1 `limitsFor`.
- §3 → Task 1. §4 → Task 2 (`awayFromAnchor`, `extra`, `naturalWidth`, `watchBoxStyle`). §5 → README checklist in Task 3. §6 tests → Tasks 1–3.
- Names: `shiftX`/`shiftY` (controller, index, tests); `defaultWidth` (reflow layout, `applyCompensations` 4th argument); `naturalWidth`, `unwatchBox`, `watchBoxStyle`, `defaultWidthOf` (movable index).
