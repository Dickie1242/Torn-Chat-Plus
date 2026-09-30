# Chat+ — Header controls (feature 4) — Design

Date: 2026-09-20
Status: approved by user ("go ahead"), implemented 2026-09-20
Builds on: widget size (v1.5–1.6) and per-chat message size (v1.7). Ships as v1.8.0.

## 1. Goal

The padlock menu's two actions, message size and widget-size reset, should
appear right in a chat's header once the chat is wide enough to hold them, so
the player can change the text size and reset the box without a right-click,
watching the effect as they go. The menu stays for narrow chats.

## 2. User-facing behaviour

- When a chat's box is at least **400 px** wide, a compact strip appears in
  its header, just left of the return arrow and padlock: **minus**, the
  current percentage, **plus**, and **Reset**. Below 400 px the strip is
  hidden. Torn's default box is 270 px; the strip needs about 150 px.
- It reacts live: widen a chat from its corner and the strip pops in as the
  box crosses the threshold; shrink it and the strip goes.
- Minus and plus change that chat's message size (the same 80–200 range and
  10-point steps as the menu row); Reset returns that chat to Torn's width and
  height and is greyed out when there is nothing to reset. After a Reset the
  chat is back at 270 px, so the strip hides itself.
- The strip shows regardless of lock state, exactly as the menu is available
  regardless of lock state.
- The header drag is unchanged: a still click on a control is a click, a real
  drag from it moves the chat and the trailing click is swallowed, the same
  rule the padlock follows. A press on a control never reaches Torn's title
  button, so it never minimizes the chat or starts Torn's reorder drag.
- The right-click menu is unchanged.

## 3. Architecture

### 3.1 Shared controls (small refactors, no behaviour change)

- `src/features/resize/resetControl.js`:
  `createResetControl({ storage, getChatId, onReset })` → `{ element, sync }`.
  The Reset `<button>` exactly as today (class `chatplus-menu__button`, label
  `Reset`, aria-label), whose click writes `{ width: null, height: null }` for
  `getChatId()` and then calls `onReset()` if given; `sync()` disables it when
  that chat has no size. `LABEL_TEXT` stays in `resetRow.js`; `RESET_LABEL`,
  `RESET_ARIA_LABEL`, `BUTTON_CLASS` move here and are re-exported by
  `resetRow.js` so nothing else changes.
- `src/features/resize/resetRow.js`: `createResetRow` now composes a label and
  a `createResetControl` whose `getChatId` returns the chat learned from
  `menu.onOpen` and whose `onReset` closes the menu. Same exports, same tests.
- `src/features/textScale/control.js`: `createScaleControl` gains
  `compact = false`; when true, `render` omits the label span. Nothing else.
- `src/features/textScale/scale.js`: `scaleOf(storage, id)` = the chat's own
  `scale`, or `settings.messageScale` when null. `textScale/index.js` uses it
  instead of its private copy.

### 3.2 The feature: `src/features/headerControls/index.js`

`createHeaderControlsFeature()` → `{ id: 'headerControls', init,
onWidgetAdded, onWidgetRemoved }`, registered last in `src/main.js`.

- Constants: `HEADER_CONTROLS_MIN_WIDTH = 400`, `CONTROLS_CLASS =
  'chatplus-header-controls'`, `HIDDEN_CLASS =
  'chatplus-header-controls--hidden'`, `CONTROLS_ATTR = 'data-chatplus-controls'`.
- `onWidgetAdded(widget)`: drop any entry and any stale `[data-chatplus-controls]`
  in the header; build `<span class="chatplus-header-controls"
  data-chatplus-controls>` holding a compact scale control
  (`getScale: () => scaleOf(storage, id)`, `setScale: percent =>
  storage.setWidget(id, { scale: percent })`) and a reset control
  (`getChatId: () => id`); insert it **before the return arrow if the header
  already has one** (`.chatplus-reset`), else **before the padlock**
  (`header.querySelector('[data-chatplus-lock]')`), or append to the header
  when there is neither (tests without movable). Movable runs first, so a chat
  restored at a stored position arrives with its arrow already mounted, while a
  docked chat grows one later - before the padlock. Either way the order is
  strip, arrow, padlock. Then `sync(entry)`.
- `sync(entry)`: `wide = box.getBoundingClientRect().width >=
  HEADER_CONTROLS_MIN_WIDTH`; toggle `HIDDEN_CLASS` accordingly; `scale.sync(
  scaleOf(...))`; `reset.sync()`.
- A MutationObserver on the box's `style` attribute (the resize feature
  writes the live width there) calls `sync(entry)`, so the strip follows a
  drag. `storage.subscribe(syncAll)` covers stored changes and other tabs.
- `onWidgetRemoved`: only when `entry.widget === widget`: disconnect the
  observer, remove the strip, drop the entry.
- No `position`, `overflow` or size is written anywhere; the strip is a plain
  inline-flex child of Torn's header.

### 3.3 Styles

```css
.chatplus-header-controls { display: inline-flex; align-items: center; gap: 4px; margin: 0 6px 0 4px; flex: 0 0 auto; }
.chatplus-header-controls--hidden { display: none !important; }
```

The existing `chatplus-menu__step`, `chatplus-menu__value` and
`chatplus-menu__button` rules already style the controls.

## 4. Live verification

1. Unlock a chat and widen it past about 400 px: the strip appears left of
   the padlock; shrink it back: it goes.
2. Press plus: only that chat's text grows; the menu row shows the same value.
3. Press Reset: the chat returns to Torn's size and the strip disappears.
4. Drag the chat by its header, starting on the strip: it moves and nothing
   else happens. A still click on plus is a click.
5. Locked chat, widened earlier: the strip is there and works.
6. If the strip crowds the title on the real header, report the width where
   it starts to look right; `HEADER_CONTROLS_MIN_WIDTH` is the one number to
   change.

## 5. Tests

- `resetControl.test.js`: disabled/enabled from the chat's record; click
  clears the size and calls `onReset`.
- `resetRow.test.js`: unchanged and still green.
- `textScale.test.js`: `compact` renders no label; `scaleOf` cases unchanged.
- `headerControls.test.js` (movable + textScale + resize + headerControls,
  real menu): mounted before the padlock, and before the arrow once the chat
  floats; hidden at 270, shown at 450; follows a live inline-width change on
  the box; plus writes that chat's scale and the value updates; Reset clears
  the size; re-emit with a new header remounts one strip, no duplicates; a
  removed chat leaves no entry.
- `build.test.js`: `chatplus-header-controls` in the bundle; version 1.8.0.

## 6. Out of scope

- Measuring Torn's title to compute free space.
- A lock-only variant.
- Putting the menu's future rows in the header automatically.
