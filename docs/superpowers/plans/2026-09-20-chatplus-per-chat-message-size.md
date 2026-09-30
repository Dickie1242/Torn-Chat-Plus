# Chat+ Per-chat Message Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make message size a per-chat value, set from the padlock menu for the chat that opened it, with the old global value as the default.

**Architecture:** Storage gains `scale: null` per chat; `settings.messageScale` stays as the default. The textScale feature resolves each chat's effective scale (`own ?? default`), applies it per entry, and points the existing Message size control at the chat the menu was opened from via `menu.onOpen`. Spec: `docs/superpowers/specs/2026-09-20-chatplus-per-chat-message-size-design.md`.

**Tech Stack:** Plain ES modules, esbuild, `node --test` + jsdom via `testlib/dom.js`. Node 24.

**Conventions:** as the previous plans. Short why-comments, no bloat. `npm test` and read the summary line (`ℹ fail 0`) before each commit; never grep for it. Commit per task with these trailers:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012zbGkd5ke2t11PEe9xgfuZ
```

`git add` named files only. `dist/chatplus.user.js` is tracked and rebuilt by the build test: `git checkout -- dist/chatplus.user.js` before the Task 1 commit; commit it in Task 2. Integration tests call `observer.scan()` after building fake chats (see `test/textScale.test.js`).

---

### Task 1: Per-chat scale in storage and the textScale feature

**Files:**
- Modify: `src/core/storage.js`, `src/features/textScale/index.js`
- Test: `test/storage.test.js`, `test/textScale.test.js`

- [ ] **Step 1: Write the failing tests**

`test/storage.test.js` (uses `memoryArea`, `createStorage`, `SETTINGS`):

```js
test('a chat\'s message size is its own, clamped into the setting\'s range, or null for the default', () => {
  const storage = createStorage({ area: memoryArea(), target: null });
  assert.equal(storage.getWidget('chat-1').scale, null);
  assert.equal(storage.setWidget('chat-1', { scale: 149.6 }).scale, 150);
  assert.equal(storage.setWidget('chat-1', { scale: 500 }).scale, SETTINGS.messageScale.max);
  assert.equal(storage.setWidget('chat-1', { scale: 10 }).scale, SETTINGS.messageScale.min);
  assert.equal(storage.setWidget('chat-1', { scale: 'big' }).scale, null);
  assert.deepEqual(Object.keys(storage.getWidget('chat-1')).sort(), ['height', 'locked', 'scale', 'width', 'x', 'y']);
});
```

Extend any existing whole-record `deepEqual` expectations with `scale: null`.

`test/textScale.test.js`: read the file first. Its `boot` takes a `menu` option defaulting to `stubMenu`; change `stubMenu` to also provide `onOpen: () => () => {}`, or better, make `boot` default to the real `createMenu({ doc })` (the file already imports it) and drop `stubMenu`. Rework the existing global-setting cases so they express the new contract, and add these (helpers: `makeChat(doc, id)`, `scaleOf(chat)` reads the box's `--chatplus-scale`, `click(el)`; for the menu use `stubRect` on the padlock and `t.menu.open(padlock)`; the padlock is `chat.header.querySelector('[data-chatplus-lock]')` when the movable feature is booted too, otherwise append any element to the header and use it as the anchor):

```js
test('the default applies to every chat, a chat\'s own size only to it', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const a = makeChat(t.doc, 'chat-a');
    const b = makeChat(t.doc, 'chat-b');
    t.observer.scan();
    t.storage.setSetting(SETTING_NAME, 120);
    assert.equal(scaleOf(a), '1.2');
    assert.equal(scaleOf(b), '1.2');
    t.storage.setWidget('chat-a', { scale: 160 });
    assert.equal(scaleOf(a), '1.6');
    assert.equal(scaleOf(b), '1.2', 'the other chat keeps the default');
    t.storage.setWidget('chat-a', { scale: 100 });
    assert.equal(scaleOf(a), '', '100% leaves Torn alone');
    t.storage.setWidget('chat-a', { scale: null });
    assert.equal(scaleOf(a), '1.2', 'back on the default');
  });
});

test('the Message size row acts on the chat whose padlock opened the menu', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const a = makeChat(t.doc, 'chat-a');
    const b = makeChat(t.doc, 'chat-b');
    t.observer.scan();
    t.storage.setWidget('chat-b', { scale: 140 });
    const row = t.menuRow; // the row the feature rendered into; expose it from boot (see below)
    const value = row.querySelector(`.${VALUE_CLASS}`);
    const plus = row.querySelector(`[aria-label="${LARGER_LABEL}"]`);

    t.menu.open(anchorIn(a));
    assert.equal(value.textContent, '100%');
    click(plus);
    assert.equal(t.storage.getWidget('chat-a').scale, 110);
    assert.equal(t.storage.getSetting(SETTING_NAME), 100, 'the default is untouched');
    assert.equal(value.textContent, '110%');
    assert.equal(scaleOf(a), '1.1');
    assert.equal(scaleOf(b), '1.4');
    t.menu.close();

    t.menu.open(anchorIn(b));
    assert.equal(value.textContent, '140%');
    click(plus);
    assert.equal(t.storage.getWidget('chat-b').scale, 150);
    t.menu.close();
  });
});

test('a chat size written by another tab is applied', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const a = makeChat(t.doc, 'chat-a');
    t.observer.scan();
    const win = dom.window;
    win.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION, widgets: { 'chat-a': { scale: 180 } }, settings: {},
    }));
    win.dispatchEvent(new win.StorageEvent('storage', { key: STORAGE_KEY }));
    assert.equal(scaleOf(a), '1.8');
  });
});
```

Where `anchorIn(chat)` appends a `<button>` to `chat.header`, stubs its rect, and returns it; and `boot` exposes `menuRow` by wrapping the menu: `const row = menu.addRow.bind(menu); menu.addRow = () => (menuRow = row());` or simply by querying the menu element for `.chatplus-menu__row` containing the `LABEL_TEXT` after boot. Pick whichever reads cleanest in that file; do not change `src/core/menu.js`.

The old cases that asserted "every open chat follows" the global setting and that the +/− buttons write `setSetting` must be rewritten to the new contract (the default still applies to chats without their own scale; the buttons write the anchored chat). Keep the handle-skip case and the 100%-removes-property case.

- [ ] **Step 2: Run both suites and see the new cases fail.**

- [ ] **Step 3: Implement**

`src/core/storage.js`: `DEFAULT_WIDGET_STATE` gains `scale: null` (typedef too, with a comment: percent for this chat's messages, null = the `messageScale` default). In `sanitizeWidget`:

```js
    scale: sanitizeScale(raw.scale),
```

with

```js
/** A chat's own message size: a whole percent inside the setting's range, or null for the default. */
function sanitizeScale(value) {
  if (!Number.isFinite(value)) return null;
  const { min, max } = SETTINGS.messageScale;
  return Math.min(max, Math.max(min, Math.round(value)));
}
```

`src/features/textScale/index.js`:

```js
  let currentId = null; // the chat whose padlock opened the menu

  /** The chat's own size, or the default every unadjusted chat shares. */
  function scaleOf(id) {
    const own = ctx.storage.getWidget(id).scale;
    return own === null ? ctx.storage.getSetting(SETTING_NAME) : own;
  }

  function applyAll() {
    for (const entry of entries.values()) applyScale(entry.widget, scaleOf(entry.widget.id));
    if (control && currentId) control.sync(scaleOf(currentId));
  }

  function init(context) {
    ctx = context;
    ctx.storage.subscribe(applyAll);
    control = createScaleControl({
      range: SETTINGS[SETTING_NAME],
      getScale: () => (currentId ? scaleOf(currentId) : ctx.storage.getSetting(SETTING_NAME)),
      setScale: (percent) => { if (currentId) ctx.storage.setWidget(currentId, { scale: percent }); },
    });
    control.render(ctx.menu.addRow());
    // The menu is one popover for every chat: learn which chat it is about on each open.
    ctx.menu.onOpen((anchor) => {
      currentId = ctx.selectors.chatIdOf(ctx.selectors.boxOf(anchor));
      control.sync(scaleOf(currentId));
    });
  }
```

`onWidgetAdded` and the `watchBox` callback use `scaleOf(widget.id)`. Remove the old `scale` closure. Update the file's header comment: one size per chat, the old global value as the default. `control.js` needs no change.

- [ ] **Step 4: `npm test` → `ℹ fail 0`.** Restore `dist/chatplus.user.js`.

- [ ] **Step 5: Commit** — `git add src/core/storage.js src/features/textScale/index.js test/storage.test.js test/textScale.test.js`; message `feat(textScale): message size per chat, the old global as the default`.

---

### Task 2: Version, docs, build

**Files:**
- Modify: `src/header.txt`, `README.md`, `test/build.test.js`, `docs/superpowers/specs/2026-09-20-chatplus-per-chat-message-size-design.md`, `dist/chatplus.user.js`

- [ ] **Step 1:** `src/header.txt`: `@version 1.7.0`; `@description` becomes `Unlock, drag, lock and resize Torn Chat 3.0 widgets, each with its own size and message size. Remaining widgets slide over to close the gap.`
- [ ] **Step 2:** `README.md`: the Message size paragraph under "Using it" now says the row changes the chat whose padlock you right-clicked, and that a chat you never adjusted uses the value you had before v1.7 (100% if none). Under "Manual acceptance checklist", replace the message-size items with the three from spec section 6. Any mention of "every chat follows" or "shared by every chat" for message size goes.
- [ ] **Step 3:** The spec's line 4 `Status:` gains `, implemented 2026-09-20`.
- [ ] **Step 4:** `npm test` → `ℹ fail 0` (the version test picks up 1.7.0); `npm run build`; confirm `@version 1.7.0` in the bundle.
- [ ] **Step 5: Commit** — `git add src/header.txt README.md test/build.test.js docs/superpowers/specs/2026-09-20-chatplus-per-chat-message-size-design.md dist/chatplus.user.js` (leave `test/build.test.js` out if it needed no change); message `chore: v1.7.0 - per-chat message size docs and build`.

---

## Self-review against the spec

§2 row acts on the anchored chat → Task 1 `onOpen`/`setScale`; default from the old global → `scaleOf`; §3 storage → Task 1 `sanitizeScale`; §4 → Task 1; §5 tests → Task 1 and the version test; §6 → README checklist in Task 2. Names: `scale` (record key), `scaleOf`, `currentId`, `sanitizeScale`.
