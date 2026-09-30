# Chat+ Header Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the padlock menu's message-size and reset controls inline in a chat's header once the chat is at least 400 px wide.

**Architecture:** Two small refactors make the existing controls reusable per chat (`createResetControl`, a `compact` scale control, a shared `scaleOf`), then a new `headerControls` feature mounts one strip per chat before the padlock, toggles it on the box's measured width, and keeps it in sync through storage and a box-style observer. Spec: `docs/superpowers/specs/2026-09-20-chatplus-header-controls-design.md`.

**Tech Stack:** Plain ES modules, esbuild, `node --test` + jsdom via `testlib/dom.js`. Node 24.

**Conventions:** as the previous plans. Short why-comments, no bloat. `npm test` and read the summary line (`ℹ fail 0`) before each commit; never grep for it. Commit per task with these trailers:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ
```

`git add` named files only. `dist/chatplus.user.js` is tracked and rebuilt by the build test: `git checkout -- dist/chatplus.user.js` before the Task 1 and Task 2 commits; commit it in Task 3. Integration tests call `observer.scan()` after building fake chats.

---

### Task 1: Reusable controls (refactor, no behaviour change)

**Files:**
- Create: `src/features/resize/resetControl.js`, `src/features/textScale/scale.js`
- Modify: `src/features/resize/resetRow.js`, `src/features/textScale/control.js`, `src/features/textScale/index.js`
- Test: `test/resetControl.test.js` (create), `test/textScale.test.js`

- [ ] **Step 1: Write the failing tests**

`test/resetControl.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom } from '../testlib/dom.js';
import { createStorage } from '../src/core/storage.js';
import { createResetControl, RESET_LABEL, BUTTON_CLASS } from '../src/features/resize/resetControl.js';

async function withDom(fn) {
  const dom = setupDom();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

test('the button follows the chat\'s record and resets it on click', () => withDom((dom) => {
  const storage = createStorage();
  const resets = [];
  const control = createResetControl({ storage, getChatId: () => 'chat-1', onReset: () => resets.push(1) });
  assert.equal(control.element.tagName, 'BUTTON');
  assert.equal(control.element.type, 'button');
  assert.equal(control.element.textContent, RESET_LABEL);
  assert.ok(control.element.classList.contains(BUTTON_CLASS));
  control.sync();
  assert.equal(control.element.disabled, true);
  storage.setWidget('chat-1', { width: 400 });
  control.sync();
  assert.equal(control.element.disabled, false);
  control.element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.deepEqual([storage.getWidget('chat-1').width, storage.getWidget('chat-1').height], [null, null]);
  assert.equal(resets.length, 1);
}));

test('no chat, no write', () => withDom((dom) => {
  const storage = createStorage();
  storage.setWidget('chat-1', { width: 400 });
  const control = createResetControl({ storage, getChatId: () => null });
  control.sync();
  assert.equal(control.element.disabled, true);
  control.element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(storage.getWidget('chat-1').width, 400);
}));
```

`test/textScale.test.js` — add:

```js
test('a compact control renders no label', async () => {
  await withDom((dom) => {
    const row = dom.window.document.createElement('div');
    createScaleControl({ range: SETTINGS[SETTING_NAME], getScale: () => 100, setScale() {}, compact: true }).render(row);
    assert.equal(row.querySelector('.chatplus-menu__label'), null);
    assert.equal(row.querySelectorAll(`.${STEP_CLASS}`).length, 2);
    assert.equal(row.querySelector(`.${VALUE_CLASS}`).textContent, '100%');
  });
});
```

and one `scaleOf` unit case importing it from `../src/features/textScale/scale.js`: own scale wins, null falls back to the setting, an unknown chat gets the setting.

- [ ] **Step 2: Run the two suites and see the new cases fail.**

- [ ] **Step 3: Implement**

`src/features/resize/resetControl.js`:

```js
/**
 * The Reset button that returns one chat to Torn's size. Used by the menu
 * row (which learns its chat from the padlock that opened the menu) and by
 * the header strip (bound to its own chat).
 */

export const RESET_LABEL = 'Reset';
export const RESET_ARIA_LABEL = "Chat+ reset this chat to Torn's size";
export const BUTTON_CLASS = 'chatplus-menu__button';

/**
 * @param {Object} config
 * @param {{ getWidget: Function, setWidget: Function }} config.storage
 * @param {() => string|null} config.getChatId  the chat the button is about right now
 * @param {() => void} [config.onReset]  after a reset was written
 * @param {Document} [config.doc]
 * @returns {{ element: HTMLButtonElement, sync: () => void }}
 */
export function createResetControl({ storage, getChatId, onReset, doc = globalThis.document }) {
  const element = doc.createElement('button');
  element.type = 'button';
  element.className = BUTTON_CLASS;
  element.textContent = RESET_LABEL;
  element.setAttribute('aria-label', RESET_ARIA_LABEL);
  element.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const chatId = getChatId();
    if (!chatId) return;
    storage.setWidget(chatId, { width: null, height: null });
    if (onReset) onReset();
  });

  /** Enabled only when the chat has a size to reset. */
  function sync() {
    const chatId = getChatId();
    const state = chatId ? storage.getWidget(chatId) : null;
    element.disabled = !state || (state.width === null && state.height === null);
  }

  return { element, sync };
}
```

`src/features/resize/resetRow.js`: keep `LABEL_TEXT`; `export { RESET_LABEL, RESET_ARIA_LABEL, BUTTON_CLASS } from './resetControl.js';`; `createResetRow` builds the label, then `const control = createResetControl({ storage, getChatId: () => chatId, onReset: () => menu.close(), doc })`, appends `label, control.element`, keeps the `menu.onOpen` subscription that sets `chatId` and calls `control.sync()`, and returns `{ sync: control.sync, destroy: unsubscribe }`. Update its header comment.

`src/features/textScale/scale.js`:

```js
/** A chat's message size: its own, or the default every unadjusted chat shares. */
export function scaleOf(storage, id) {
  const own = storage.getWidget(id).scale;
  return own === null ? storage.getSetting('messageScale') : own;
}
```

`src/features/textScale/index.js`: import `scaleOf` from `./scale.js`, delete the local one, and call `scaleOf(ctx.storage, id)` everywhere it was used (keep `SETTING_NAME` exported if tests import it).

`src/features/textScale/control.js`: `createScaleControl({ range, getScale, setScale, compact = false })`; in `render`, build the label only when `!compact` (append the rest as today). JSDoc: `compact` drops the label for the header strip.

- [ ] **Step 4: `npm test` → `ℹ fail 0`.** Restore `dist/chatplus.user.js`.

- [ ] **Step 5: Commit** — `git add` the two new files, the three modified sources and the two test files; message `refactor: reusable reset and scale controls, shared scaleOf`.

---

### Task 2: The header controls feature

**Files:**
- Create: `src/features/headerControls/index.js`, `test/headerControls.test.js`
- Modify: `src/styles.css`, `src/main.js`

- [ ] **Step 1: Write the failing tests**

`test/headerControls.test.js`, booting movable + textScale + resize + headerControls with the real menu (copy the `boot`/`addChat` shape from `test/resize.test.js`, registering `createHeaderControlsFeature()` last):

```js
const strip = (chat) => chat.header.querySelector('[data-chatplus-controls]');
const hidden = (chat) => strip(chat).classList.contains(HIDDEN_CLASS);

test('one strip per chat, left of the padlock, hidden until the chat is 400 px wide', () => withDom(async (dom) => {
  const t = boot(dom);
  const chat = await addChat(t, 'chat-1', { left: 700, top: 368, width: 270, height: 400 });
  assert.ok(strip(chat));
  assert.equal(strip(chat).nextElementSibling, chat.header.querySelector(`[${LOCK_ATTR}]`));
  assert.equal(hidden(chat), true);
  const wide = await addChat(t, 'chat-2', { left: 300, top: 368, width: 450, height: 400 });
  assert.equal(hidden(wide), false);
  assert.equal(chat.header.querySelectorAll('[data-chatplus-controls]').length, 1);
}));

test('the strip follows the box width live and the arrow slots in between', () => withDom(async (dom) => {
  const t = boot(dom);
  const chat = await addChat(t, 'chat-1', { left: 700, top: 368, width: 270, height: 400 });
  stubRect(chat.box, { left: 520, top: 368, width: 450, height: 400 });
  chat.box.style.setProperty('width', '450px', 'important'); // what the resize feature writes mid-drag
  await settle();
  assert.equal(hidden(chat), false);
  stubRect(chat.box, { left: 700, top: 368, width: 270, height: 400 });
  chat.box.style.removeProperty('width');
  await settle();
  assert.equal(hidden(chat), true);

  t.storage.setWidget('chat-1', { x: 20, y: 300 }); // floating: the return arrow appears
  const arrow = chat.header.querySelector('[data-chatplus-reset]') || chat.header.querySelector('.chatplus-reset');
  assert.ok(arrow, 'the arrow is mounted');
  assert.equal(strip(chat).nextElementSibling, arrow, 'strip, then arrow, then padlock');
}));

test('plus changes that chat only, and the value follows storage', () => withDom(async (dom) => {
  const t = boot(dom);
  const a = await addChat(t, 'chat-a', { left: 300, top: 368, width: 450, height: 400 });
  const b = await addChat(t, 'chat-b', { left: 760, top: 368, width: 450, height: 400 });
  click(strip(a).querySelector(`[aria-label="${LARGER_LABEL}"]`));
  assert.equal(t.storage.getWidget('chat-a').scale, 110);
  assert.equal(t.storage.getWidget('chat-b').scale, null);
  assert.equal(strip(a).querySelector(`.${VALUE_CLASS}`).textContent, '110%');
  assert.equal(strip(b).querySelector(`.${VALUE_CLASS}`).textContent, '100%');
  t.storage.setWidget('chat-b', { scale: 150 });
  assert.equal(strip(b).querySelector(`.${VALUE_CLASS}`).textContent, '150%');
}));

test('Reset clears that chat\'s size and greys out', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { width: 450, height: 500 });
  const chat = await addChat(t, 'chat-1', { left: 300, top: 368, width: 450, height: 400 });
  const reset = strip(chat).querySelector(`.${BUTTON_CLASS}`);
  assert.equal(reset.disabled, false);
  click(reset);
  assert.deepEqual([t.storage.getWidget('chat-1').width, t.storage.getWidget('chat-1').height], [null, null]);
  assert.equal(reset.disabled, true);
  assert.equal(t.menu.isOpen(), false, 'no menu involved');
}));

test('a re-rendered header gets exactly one strip, and a removed chat is dropped', () => withDom(async (dom) => {
  const t = boot(dom);
  const chat = await addChat(t, 'chat-1', { left: 300, top: 368, width: 450, height: 400 });
  const fresh = t.doc.createElement('div');
  fresh.innerHTML = chat.header.innerHTML.replace(/<span class="chatplus-header-controls[\s\S]*?<\/span>/, '');
  chat.box.replaceChild(fresh, chat.header);
  t.observer.scan();
  await settle();
  assert.equal(chat.box.querySelectorAll('[data-chatplus-controls]').length, 1);
  chat.wrapper.remove();
  await settle();
  t.storage.setWidget('chat-1', { scale: 120 }); // must not throw on a dropped entry
}));
```

Use whatever the arrow's real marker is (read `src/features/movable/resetButton.js`; if it has no attribute, use its class). If `fresh.innerHTML` gets tricky, build the replacement header the way `makeChatWidget` does (a `div` with a title span and the Minimize svg) and let movable re-mount the padlock.

- [ ] **Step 2: Run it and see it fail** (module not found).

- [ ] **Step 3: Implement**

`src/features/headerControls/index.js`:

```js
/**
 * Header controls: the padlock menu's two actions - message size and widget
 * size reset - inline in a chat's header once the chat is wide enough to
 * hold them, so the player adjusts a chat while looking at it. The menu
 * stays for narrow chats.
 */

import { SETTINGS } from '../../core/storage.js';
import { createScaleControl } from '../textScale/control.js';
import { scaleOf } from '../textScale/scale.js';
import { createResetControl } from '../resize/resetControl.js';
import { LOCK_ATTR } from '../movable/lockToggle.js';

/** Torn's box is 270 px; the strip needs about 150 px next to the title. */
export const HEADER_CONTROLS_MIN_WIDTH = 400;
export const CONTROLS_CLASS = 'chatplus-header-controls';
export const HIDDEN_CLASS = 'chatplus-header-controls--hidden';
export const CONTROLS_ATTR = 'data-chatplus-controls';

/** The resize feature writes a chat's live width on the box's inline style. */
function watchBoxStyle(box, onChange) {
  const MO = globalThis.MutationObserver;
  if (!box || typeof MO !== 'function') return () => {};
  const observer = new MO(onChange);
  observer.observe(box, { attributes: true, attributeFilter: ['style'] });
  return () => observer.disconnect();
}

export function createHeaderControlsFeature() {
  /** @type {Map<string, {widget, container: Element, scale, reset, unwatch: () => void}>} */
  const entries = new Map();
  let ctx = null;

  function mount(widget) {
    const { header, id } = widget;
    for (const stale of header.querySelectorAll(`[${CONTROLS_ATTR}]`)) stale.remove();
    const doc = header.ownerDocument;
    const container = doc.createElement('span');
    container.className = CONTROLS_CLASS;
    container.setAttribute(CONTROLS_ATTR, '1');
    const scale = createScaleControl({
      range: SETTINGS.messageScale,
      compact: true,
      getScale: () => scaleOf(ctx.storage, id),
      setScale: (percent) => ctx.storage.setWidget(id, { scale: percent }),
    });
    scale.render(container);
    const reset = createResetControl({ storage: ctx.storage, getChatId: () => id, doc });
    container.appendChild(reset.element);
    // Left of the padlock; the return arrow mounts itself before the padlock
    // later, so the order becomes strip, arrow, padlock.
    const padlock = header.querySelector(`[${LOCK_ATTR}]`);
    if (padlock) padlock.parentNode.insertBefore(container, padlock);
    else header.appendChild(container);
    return { container, scale, reset };
  }

  function sync(entry) {
    const { widget, container, scale, reset } = entry;
    const wide = widget.box.getBoundingClientRect().width >= HEADER_CONTROLS_MIN_WIDTH;
    container.classList.toggle(HIDDEN_CLASS, !wide);
    scale.sync(scaleOf(ctx.storage, widget.id));
    reset.sync();
  }

  function syncAll() {
    for (const entry of entries.values()) sync(entry);
  }

  function dropEntry(id) {
    const entry = entries.get(id);
    if (!entry) return;
    entry.unwatch();
    entry.container.remove();
    entries.delete(id);
  }

  function init(context) {
    ctx = context;
    // Fires for local writes AND for the cross-tab 'storage' event.
    ctx.storage.subscribe(syncAll);
  }

  function onWidgetAdded(widget, context) {
    ctx = context;
    dropEntry(widget.id);
    const entry = { widget, ...mount(widget), unwatch: () => {} };
    entry.unwatch = watchBoxStyle(widget.box, () => sync(entry));
    entries.set(widget.id, entry);
    sync(entry);
  }

  function onWidgetRemoved(widget) {
    const entry = entries.get(widget.id);
    if (entry && entry.widget === widget) dropEntry(widget.id);
  }

  return { id: 'headerControls', init, onWidgetAdded, onWidgetRemoved };
}
```

`src/main.js`: import `createHeaderControlsFeature` from `./features/headerControls/index.js` and register it after `createResizeFeature()`.

`src/styles.css`, before the menu block:

```css
/* Header controls: the menu's size and reset actions inline in a chat's
   header once the chat is wide enough (features/headerControls). */
.chatplus-header-controls {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 6px 0 4px;
  flex: 0 0 auto;
}

.chatplus-header-controls--hidden {
  display: none !important;
}
```

- [ ] **Step 4: `npm test` → `ℹ fail 0`.** Restore `dist/chatplus.user.js`.

- [ ] **Step 5: Commit** — `git add src/features/headerControls/index.js test/headerControls.test.js src/styles.css src/main.js`; message `feat: message size and reset controls inline in a wide chat's header`.

---

### Task 3: Version, docs, build

**Files:**
- Modify: `src/header.txt`, `README.md`, `test/build.test.js`, `docs/superpowers/specs/2026-09-20-chatplus-header-controls-design.md`, `dist/chatplus.user.js`

- [ ] **Step 1:** `test/build.test.js`: `assert.match(code, /chatplus-header-controls/, 'the header strip rules must be inlined');`.
- [ ] **Step 2:** `src/header.txt`: `@version 1.8.0`.
- [ ] **Step 3:** `README.md`: under "Using it" add a **Header controls** paragraph (what the spec's section 2 says, in two or three sentences, naming the 400 px threshold); under "Manual acceptance checklist" add a `### Header controls` list with the six items from spec section 4; under "Project layout" add `src/features/headerControls/`.
- [ ] **Step 4:** Spec line 4: replace `not yet implemented` with `implemented 2026-09-20`.
- [ ] **Step 5:** `npm test` → `ℹ fail 0`; `npm run build`; confirm `@version 1.8.0` and `chatplus-header-controls` in the bundle.
- [ ] **Step 6: Commit** — `git add src/header.txt README.md test/build.test.js docs/superpowers/specs/2026-09-20-chatplus-header-controls-design.md dist/chatplus.user.js`; message `chore: v1.8.0 - header controls docs and build`.

---

## Self-review against the spec

§2 strip contents, threshold, live follow, per-chat actions, Reset greyed, lock-independent → Task 2 (`mount`, `sync`, `watchBoxStyle`); §3.1 refactors → Task 1; §3.2 → Task 2; §3.3 → Task 2 CSS; §4 → README in Task 3; §5 tests → Tasks 1–3. Names: `createResetControl` (`element`, `sync`), `scaleOf(storage, id)`, `compact`, `createHeaderControlsFeature`, `HEADER_CONTROLS_MIN_WIDTH`, `CONTROLS_CLASS`, `HIDDEN_CLASS`, `CONTROLS_ATTR`.
