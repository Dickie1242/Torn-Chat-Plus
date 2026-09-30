# Chat+

A userscript that lets you move, resize and rearrange the chats in [Torn City](https://www.torn.com)'s desktop **Chat 3.0**, and set each chat's message size.

- **Padlock on every chat.** Unlock a chat to drag it anywhere on screen by its header, the empty space on the far left for example, then lock it there.
- **Return arrow.** A chat you have moved gets an arrow next to its padlock that sends it back to Torn's bottom row.
- **Gap closing.** The chats left in Torn's row slide over to close the gap a moved chat leaves.
- **Resize any chat.** Unlock it and drag its top edge to make it taller, or its top-left corner for width and height together. A moved chat also gets a bottom edge and a bottom-right corner. A wider chat in the row grows to the left, and its neighbours slide over to make room.
- **Message size per chat.** Right-click a padlock for the Chat+ menu and set that chat's messages and typing box from 80% to 200%.
- **Controls in the title bar.** Once a chat is at least 400 px wide, minus, the current percentage, plus and **Reset** sit in its title bar, so you don't need the menu.
- **Reset per chat.** Gives a chat Torn's own size back.
- **Remembered per chat.** Every chat keeps its own position, size and message size, and your other Torn tabs follow along live.
- **Torn's reordering still works.** Locked chats in the row keep Torn's own drag-to-swap.

There's no external server and nothing leaves `torn.com`: your layout is stored in your browser.

---

## Install

1. Install a userscript manager, such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open the install link and click **Install**:
   https://raw.githubusercontent.com/Dickie1242/Torn-Chat-Plus/main/dist/chatplus.user.js
   Your userscript manager checks this link for updates, so new versions arrive automatically.
3. Reload `https://www.torn.com/`.

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

## Install your own build

**The simple way:**

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
- **Click the padlock** to unlock it. Now drag the widget from anywhere on its top
  bar — the name, the icons, the empty space, all of it.
- **Click again** to lock it in its new spot.
- **Click the return arrow** that appears left of the padlock once a chat has
  been moved to send it back to Torn's row. It does not change whether the chat
  is locked.
- **Right-click any padlock** for the Chat+ menu. Its **Message size** row scales
  the messages and the typing box of *that* chat — the one whose padlock you
  right-clicked — between 80% and 200%, ten points per press; at 100% Chat+
  leaves Torn's own sizing completely alone. A chat you have never adjusted uses
  the size you had before v1.7 (100% if you never set one).
- Locked chats still sitting in Torn's row keep Torn's own drag-to-swap, so you
  can reorder them the way you always have; once a chat is unlocked or has been
  moved out of the row, Chat+ takes the drag over instead.
- Positions and sizes are stored in `localStorage` under `chatplus.state.v1` and are shared
  live between your open Torn tabs.

**Widget size.** Unlock a chat (click its padlock) and it gets two grips: a
strip along its top edge, which drags up to make the chat taller, and a grip in
its **top-left corner**, which sizes width and height together. A chat you have
moved out of Torn's row also gets a strip along its bottom edge and a corner at
the bottom right. Width applies to every chat, docked or not: a wider docked
chat grows leftward, into the free space at the left of the screen, and the
other chats in Torn's row slide over to make room. Sizes are remembered per
chat. Right-click the padlock and press **Reset** on the *Widget size* row to
give that chat Torn's size back. Locking a chat hides the grips and keeps the
size.

**Header controls.** Once a chat is at least **400 px** wide — Torn's own box is
300 px — the menu's two actions move into its header, just left of the return
arrow and padlock: minus, the current percentage, plus, and **Reset**. Widen a
chat from its corner and the strip appears as the box crosses the threshold;
shrink it and the strip goes, so the menu stays the way to reach these on a
narrow chat. The strip shows whether the chat is locked or not, and its buttons
act on that chat alone.

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
- [ ] Click the return arrow next to the padlock (it only appears on a chat you
      have moved): the widget returns to Torn's bottom row, the arrow disappears,
      and the row has no gap where it used to be.
- [ ] Right-click a padlock: the Chat+ menu opens just below it - or just above
      it, when the chat is collapsed onto the bottom bar.
- [ ] Right-click chat A's padlock and press + twice: only chat A's messages and
      typing box grow, its header does not, and the percentage in the menu keeps
      up.
- [ ] Right-click chat B: the row shows B's own value; change it; A is untouched.
- [ ] Reload: both are kept, and the second tab followed along. A chat you never
      adjusted matches the size it had before the upgrade.
- [ ] Resize the browser window small: the floated widget stays fully on screen.

### Widget size

- [ ] Unlock a docked chat: an `nwse-resize` cursor appears at its top-left
      corner; drag up-left; it grows both ways, its right edge stays put, and
      the chats to its left slide over. Lock, reload: kept.
- [ ] Widen the rightmost of three docked chats: the other two slide left by the
      extra width; float the middle one out and back: the row still packs with
      the right gaps.
- [ ] Move a chat out of the row and drag its top-left corner: it grows up and
      left with its bottom-right corner fixed; release; drag the header: it
      moves from where it is.
- [ ] Torn's own reorder drag on locked chats still works with a widened chat in
      the row.
- [ ] Reset from the padlock menu returns width and height, and the row closes
      up.

### Header controls

- [ ] Unlock a chat and widen it past about 400 px: the strip appears left of
      the padlock; shrink it back: it goes.
- [ ] Press plus: only that chat's text grows; the menu row shows the same value.
- [ ] Press Reset: the chat returns to Torn's size and the strip disappears.
- [ ] Drag the chat by its header, starting on the strip: it moves and nothing
      else happens. A still click on plus is a click.
- [ ] Locked chat, widened earlier: the strip is there and works.
- [ ] If the strip crowds the title on the real header, report the width where
      it starts to look right; `HEADER_CONTROLS_MIN_WIDTH` is the one number to
      change.

---

## Debugging

If a widget will not move, moves and snaps back, or lands in the wrong place,
run the diagnostic. It is one copy-and-paste and it puts the finished report on
your clipboard. You do not have to turn anything on first, and there are no
console settings to change.

**Step 1.** Build (`npm run build`), open `dist/chatplus.user.js`, copy the whole
file, paste it over the Chat+ script in the Tampermonkey editor, save with
Ctrl+S, then reload `https://www.torn.com/` and make sure a chat is expanded.

**Step 2.** Press **F12** to open DevTools and click the **Console** tab. Open
`diagnostics/dump.js`, copy the **whole file**, click in the console, paste it,
and press **Enter**.

> If the console says pasting is not allowed, type `allow pasting` there, press
> Enter, and paste again. That is Chrome's protection against people being
> talked into pasting things they do not understand.

**Step 3.** An orange line appears: *Chat+ diagnostic running... You have 25
seconds.* In those 25 seconds, click a chat's padlock to unlock it, drag the
chat somewhere by its header, and let go. Then wait. When the 25 seconds are up
a green line says *Report copied to your clipboard* - paste it straight into the
chat with Claude. (If the line is red instead, select everything between
`===== CHAT+ REPORT START =====` and `===== CHAT+ REPORT END =====` and copy it
by hand.)

That is all. Also say in one sentence what you saw: did the widget follow the
pointer and jump back when you let go, jump back part-way through the drag, or
never move at all?

Notes:

- The diagnostic switches the Chat+ debug trace on by itself, records the page
  structure, every DOM change Torn makes during the drag, and the pointer and
  drag events, and prints one block at the end. Torn can drag chats natively;
  the report shows how the two interact.
- It never prints the text of any chat message - only tag names, ids, class
  names, styles and coordinates.
- The trace stays on afterwards. Turn it off with
  `localStorage.removeItem('chatplus.debug')` in the console, or leave it: it
  only prints `[Chat+]` lines you can ignore.
- If the report says it found no chat boxes although a chat is open, Torn has
  changed its markup: paste `diagnostics/probe.js` the same way instead. It
  relies on none of Chat+'s selectors and copies its own report.

---

## How to send your chat HTML

If a widget is not detected, or the padlock lands in the wrong place, Torn's
markup has changed and `src/core/selectors.js` needs updating. Send the real
markup:

1. Go to `https://www.torn.com/` and make sure the chat widget is **expanded**.
2. **Right-click the widget's header bar** (the strip with the title and the
   minimize button) and choose **Inspect**.
3. DevTools opens with an element highlighted. Look just above it in the Elements
   panel for the nearest **`<div id="...">`** (an id such as `1234567` or
   `faction`). That is the chat box.
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
src/styles.css                the whole Chat+ stylesheet, injected once at boot
src/core/log.js               prefixed console helpers + the debug trace
src/core/version.js           build-time version, stamped on the <style> tag
src/core/styles.js            stylesheet injection
src/core/storage.js           localStorage state and settings, cross-tab sync
src/core/selectors.js         EVERY Torn DOM lookup lives here
src/core/observer.js          widget discovery
src/core/registry.js          feature fan-out
src/core/menu.js              the shared settings popover
src/core/scheduler.js         animation-frame batching
src/features/movable/         header buttons, drag, floating, reflow
src/features/textScale/       message size: the menu row and the zoom it applies
src/features/resize/          widget size: handles, size math, the gesture, reset
src/features/headerControls/  message size and reset inline in a wide chat's header
diagnostics/dump.js           one-paste console diagnostic, copies its own report
diagnostics/probe.js          selector-free structure probe, for when dump.js finds no chats
testlib/dom.js                jsdom helpers for the tests
test/*.test.js                node --test suites
```

If Torn changes its chat markup, `src/core/selectors.js` is the only file that
should need editing.

## Credits

The gap-closing reflow, where chats still in Torn's row slide over to fill the
space a moved chat leaves, follows the technique from
[Torn Chat Hider](https://greasyfork.org/en/scripts/581339-torn-chat-hider) by
Deviyl [3722358]. Thanks.

**Better Chat 3.0** by Weav3r (Greasy Fork 553128) for showing that sizing the
chat box itself is enough, with Torn's own flex handing the room to the message
list. Thanks.

## License

MIT
