# Chat+ — Widget Size (feature 3) — Design

Date: 2026-09-20
Status: approved by user ("recommended go ahead"), implemented 2026-09-20

## 1. Goal

Torn Chat 3.0 gives every chat window the same size and offers no way to
change it. Chat+'s third feature lets the player resize each chat on its own
with drag handles, remembers the size per chat, and offers a per-chat reset in
the padlock menu. A taller chat also cures the clipping the message-size zoom
causes at high percentages, because the box finally has room of its own.

## 2. User-facing behaviour

- **Handles appear only while a chat is unlocked.** The padlock keeps its
  meaning: locked is Torn's behaviour untouched, unlocked is "Chat+ may move
  and size this chat". Locking a chat hides the handles; its size stays.
- **Handles sit on the edges that can move without moving the chat's
  anchor.** Torn's docked row is anchored at the bottom of the screen and a
  floating chat is anchored by its top-left corner, so:
  - a **docked** chat has one handle: a strip along its **top** edge. Dragging
    it up makes the chat taller; the chat grows upward out of Torn's row;
  - a **floating** chat has three: a strip along its **top** edge (grows
    upward and moves the chat up with it), a strip along its **bottom** edge
    (grows downward), and a square in its **bottom-right** corner (width and
    height together, growing right and down).
  No handle is placed on the right edge, which belongs to the message list's
  scrollbar and Torn's close icon, nor on the left, which would move a floating
  chat sideways.
- **Height applies everywhere; width applies only while floating.** A docked
  chat keeps Torn's width because Torn lays the row out for equal widths and a
  wider chat would overlap its neighbour. A chat returned to the row keeps its
  height and takes Torn's width again; float it and its stored width returns.
- The handle strips are 8 px wide and invisible; the corner is 14 px square.
  The cursor changes over them and they tint faintly on hover and while
  dragging. A press on a handle never starts a header drag, never starts Torn's
  reorder drag, and never selects text.
- **Bounds.** A chat is never made narrower than 200 px or shorter than
  150 px. It is never made bigger than the viewport: a floating chat cannot grow
  past the top, right or bottom edge of the screen, a docked chat cannot be
  taller than the screen.
- **Persistence.** The size is saved per chat id on release, next to its
  position and lock state, in the same `chatplus.state.v1` record, and follows
  the chat across reloads and tabs. A chat that was never resized stays exactly
  as Torn renders it, with nothing of ours on it.
- **Reset.** The padlock menu (right-click a padlock) gains a **Widget size**
  row with a **Reset** button that returns *that* chat to Torn's size. The
  button is disabled when the chat is already at Torn's size. Message size
  stays global; this row is per chat, which the anchoring padlock makes plain.
- A gesture that is still live when Torn re-renders the chat box (a new
  message arrives) carries on; releasing the mouse outside the window still
  ends it.

## 3. Sizing mechanism

Better Chat 3.0 (Greasy Fork 553128, Weav3r) proved on the live page that
setting `width`/`height` on the chat box element is enough: the box is Torn's
flex column of header, message list and input area, and Torn's own flex gives
the extra height to the message list. Chat+ does the same, per chat instead of
globally:

- `applySize(box, { width, height })` writes `height: <n>px !important` and
  `width: <n>px !important` on the box's **inline style** and adds the class
  `chatplus-sized`; a `null` dimension removes that inline property; when both
  are null the class goes too. It writes nothing that is already there, in the
  same way `applyFloating` does, so observers never loop.
- `.chatplus-sized { max-width: none; max-height: none; overflow: hidden }`
  (all `!important`) beats Torn's caps and contains the children, exactly as
  Better Chat does.
- `.chatplus-resizable { position: relative !important }` is added to the box
  while handles are mounted so the handles position against the box.
- Width is passed as `null` unless the chat is floating (`x` and `y` both
  non-null in its record, the same rule the return arrow uses).
- **Growing a floating chat upward.** Its position is its top-left corner, so
  taking the top edge up means a smaller `y` and a larger `height`. During the
  gesture the box gets `translate: 0 <-shift>px` inline (the box, not the
  wrapper, so movable's `watchWrapper` never sees it) and its new height; on
  release the feature writes `{ height, y: y0 - shift }` to storage in one
  call, which makes movable re-place the wrapper, then clears the translate.
  The same release for a docked chat writes just `{ height }`.

## 4. Storage

`DEFAULT_WIDGET_STATE` grows two keys: `width: null, height: null`. Storage
owns the lower bounds, following the `SETTINGS` precedent:

```js
export const WIDGET_SIZE = Object.freeze({ minWidth: 200, minHeight: 150 });
```

`sanitizeWidget` keeps a dimension only when it is a finite number, rounds it
and clamps it up to the minimum; anything else becomes `null`. Old records
without the keys read back as `null` through the defaults merge, so the storage
version stays 1 and nobody loses a saved position. The upper bound depends on
the viewport and is applied only while dragging.

## 5. Architecture

A new feature module `src/features/resize/` registered in `src/main.js` after
`textScale`, with the same `{ id, init, onWidgetAdded, onWidgetRemoved }` shape
and no dependency on the movable module. It learns "floating" and "locked" from
the storage record alone.

### 5.1 Files

- `sizing.js` (pure + one DOM helper)
  - `nextSize({ direction, start, dx, dy, limits })` → `{ width, height }`:
    `e` adds `dx` to width, `s` adds `dy` to height, `n` subtracts `dy` from
    height, each clamped into `[min, max]` from `limits`. `direction` is a
    string of those letters (`'n'`, `'s'`, `'se'`), so a corner is just two
    edges.
  - `limitsFor({ direction, start, floating, viewport })` → `{ minWidth,
    maxWidth, minHeight, maxHeight }`: minimums from `WIDGET_SIZE`; for `s`
    the height may reach the viewport bottom (`viewport.height - start.top`),
    for `n` on a floating chat the viewport top (`start.height + start.top`),
    for a docked chat the viewport height; width may reach the viewport right
    edge (`viewport.width - start.left`).
  - `applySize(box, { width, height })` as in section 3.
- `handles.js`
  - `directionsFor({ locked, floating })` → `[]` when locked, `['n']` when
    docked, `['n', 's', 'se']` when floating.
  - `mountHandles(box, directions, onPress)` removes any stale
    `[data-chatplus-resize]` children and appends one
    `<div class="chatplus-handle chatplus-handle--<dir>" data-chatplus-resize="<dir>">`
    per direction, each with a `pointerdown` listener calling
    `onPress(direction, event)`; adds `chatplus-resizable` to the box while any
    handle is mounted. It is a no-op when the mounted set already matches, so
    re-applies never rebuild handles.
  - `unmountHandles(box)`.
- `resizeController.js`
  - `createResizeController({ doc, getBox, getViewport, onResize, onCommit })`
    → `{ start(direction, event, { floating }), liveSize(), isActive(),
    cancel() }`.
  - `start` accepts only the left button, calls `stopPropagation()` and
    `preventDefault()` on the press (so neither the header drag, the header
    guard, Torn's reorder drag nor text selection see it), snapshots
    `getBox().getBoundingClientRect()` as `start`, computes limits once, and
    attaches capture-phase `pointermove`, `pointerup` and `pointercancel`
    listeners on `doc`. It sets `body[data-chatplus-resizing="<dir>"]` for the
    cursor and `chatplus-handle--active` on the pressed handle. No pointer
    capture is taken: document listeners keep receiving the pointer after Torn
    swaps the box under it, and Chrome keeps delivering mouse events to the
    document while a button is held outside the window.
  - `pointermove` computes `nextSize` from the pointer delta and calls
    `onResize({ width, height, shift })` where `shift` is
    `height - start.height` for an upward (`n`) gesture on a floating chat and
    `0` otherwise. `pointerup` calls `onCommit(sameShape)` only if the size
    changed, then tears down; `pointercancel` tears down without committing.
  - `liveSize()` returns the last size sent to `onResize` while a gesture is
    live, else `null`, so a re-add mid-gesture can keep the live size.
- `resetRow.js`
  - `createResetRow({ row, menu, storage, selectors })` renders
    `<span class="chatplus-menu__label">Widget size</span><button class="chatplus-menu__button">Reset</button>`
    into the row. It subscribes to `menu.onOpen(anchor)`, resolves the anchor's
    chat id via `selectors.boxOf(anchor)` and `chatIdOf`, and disables the
    button when that chat's `width` and `height` are both `null`. Click writes
    `{ width: null, height: null }` for that chat and closes the menu.
- `index.js`
  - `init(ctx)`: keeps `ctx`, renders the reset row into `ctx.menu.addRow()`,
    subscribes to storage with `applyAll`.
  - `onWidgetAdded(widget)`: creates or updates the entry for `widget.id`. When
    the entry already exists with a different box (Torn re-rendered), the
    entry adopts the new box; the controller keeps running because it reads
    `getBox()` on every move. Then `apply(entry)`.
  - `apply(entry)`: reads the record, derives `floating` and `locked`, takes
    `controller.liveSize()` if a gesture is live else the stored size, calls
    `applySize` (width nulled unless floating) and `mountHandles` with
    `directionsFor`.
  - `onResize` handler: `applySize` with the live size and the translate
    shift; `onCommit` handler: one `setWidget` call with `{ height }`, plus
    `width` when floating, plus `y: record.y - shift` when floating and
    `shift !== 0`; then clears the translate.
  - `onWidgetRemoved(widget)`: only when the entry's box is this box (the
    stale node after a swap is ignored): cancel any gesture, unmount handles,
    drop the entry. Applied size is left on the departing node; it is leaving
    the DOM.

### 5.2 Core changes

- `src/core/storage.js`: section 4.
- `src/core/menu.js`: `onOpen(listener)` → unsubscribe; `open()` calls every
  listener with the anchor after positioning. Rows still cannot see the anchor
  otherwise, which keeps the menu generic.
- `src/core/selectors.js`: `boxOf(element)` = `element.closest(CHAT_BOX_SELECTOR)`,
  so Torn-DOM knowledge stays in one file.
- `src/features/textScale/index.js`: `applyScale` skips children carrying
  `data-chatplus-resize`, so handles are never zoomed with the message list.
  `watchBox` already re-runs on child insertion and needs no change.
- `src/styles.css`: the rules in section 3, the handle rules below, and body
  cursor overrides while resizing:

```css
.chatplus-handle { position: absolute; z-index: 10; background: transparent; touch-action: none; user-select: none; }
.chatplus-handle--n  { top: 0; left: 0; right: 0; height: 8px; cursor: ns-resize; }
.chatplus-handle--s  { bottom: 0; left: 0; right: 0; height: 8px; cursor: ns-resize; }
.chatplus-handle--se { right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; z-index: 11; }
.chatplus-handle:hover, .chatplus-handle--active { background: rgba(124, 169, 0, 0.35); }
body[data-chatplus-resizing="n"] *, body[data-chatplus-resizing="s"] * { cursor: ns-resize !important; }
body[data-chatplus-resizing="se"] * { cursor: nwse-resize !important; }
```

- `src/header.txt`: `@version 1.5.0`. README: feature section, storage shape,
  a Credits line for Better Chat 3.0's "size the box and let Torn's flex do the
  rest" finding, and the live checklist in section 7.
- `diagnostics/dump.js`: report each chat box's computed `width`, `height`,
  `position`, `overflow` and inline style, plus the wrapper's, so a size that
  does not take can be diagnosed from one paste.

### 5.3 Interactions with the other features

- **Movable.** The header drag snapshots the wrapper rect at press, so a
  resized chat drags and clamps correctly. Movable's viewport-resize handler
  re-clamps positions with the current rect, so a resized floating chat is
  kept on screen. Nothing in reflow changes: docked chats keep Torn's width.
- **Message size.** Zoom stays on the children; the box's explicit height is
  unaffected by it, and the resize snapshot measures the box, which is not
  zoomed.
- **Torn's minimize.** Minimizing removes the box; reopening re-adds it and
  `apply` restores its size and handles.

## 6. Error handling and robustness

- Every hook already runs inside the registry's `safe()` wrapper.
- A record with junk sizes reads back as `null` (section 4).
- If `getBox()` is disconnected on a move, the controller ends the gesture
  without committing.
- `pointercancel` and a press with another button do nothing lasting.
- Nothing is written to storage during a gesture; only on release.

## 7. Live verification (user, on torn.com)

1. Unlock a docked chat: an `ns-resize` cursor appears along its top edge;
   drag up; the box grows upward and the message list fills the space. Lock
   it: the handle goes, the height stays. Reload: the height is back.
2. Move a chat out of the row: top, bottom and bottom-right handles; each
   grows the expected way; the top handle keeps the bottom edge still. Return
   it with the arrow: height kept, Torn's width back; move it again: width
   back.
3. Right-click the padlock: the Widget size row's Reset button is enabled
   only on a resized chat; pressing it restores Torn's size.
4. Message size at 200% on a taller chat: no clipping.
5. Locked chats still reorder with Torn's own drag; a press on the top strip
   of an unlocked chat never moves it.
6. Resize while messages arrive: the gesture continues.
7. Paste `diagnostics/dump.js` if any of the above fails and send the output.

## 8. Tests

All under `node --test` with the `testlib/dom.js` fixture; jsdom has no
layout, so box rects are stubbed with `stubRect`.

- `storage.test.js`: width/height default to null; finite values are rounded
  and clamped up to the minimum; junk becomes null; a record saved by v1.4
  reads back with null sizes.
- `sizing.test.js`: `nextSize` per direction and corner, both clamps;
  `limitsFor` per case; `applySize` writes, no-ops when unchanged, and clears.
- `handles.test.js`: `directionsFor`; `mountHandles` builds the right set, is
  idempotent, rebuilds on a different set, `unmountHandles` clears the class.
- `resizeController.test.js`: press stops propagation and prevents default;
  move calls `onResize` with clamped sizes and the upward shift; release
  commits only after a change; cancel never commits; a box swap mid-gesture
  continues on the new box; a right-button press is ignored.
- `resetRow.test.js`: button state follows the opened chat's record; click
  resets and closes.
- `menu.test.js`: `onOpen` receives the anchor; unsubscribe works.
- `resize.test.js` (integration through registry + observer + storage):
  locked → no handles; unlocked docked → `n`; floating → `n`, `s`, `se`;
  docked width is never applied; a drag ends in storage and inline style; a
  storage change from another tab re-applies; a removed widget is cleaned up.
- `textScale.test.js`: a handle child is not scaled.
- `build.test.js`: bundle contains `chatplus-handle` and the 1.5.0 stamp.

## 9. Out of scope

- Width on docked chats (needs a width-aware reflow of Torn's row).
- Left-edge and right-edge handles, keyboard or stepper size controls.
- Shrinking a chat automatically when the browser window gets smaller.
- A global default size.
