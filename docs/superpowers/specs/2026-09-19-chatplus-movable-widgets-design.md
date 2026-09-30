# Chat+ — Movable Chat Widgets (feature 1) — Design

Date: 2026-09-19
Status: approved by user (verbal "go"), implementation delegated to Opus subagents

## 1. Goal

Chat+ is a Tampermonkey userscript for Torn City (torn.com) desktop Chat 3.0. Its first
feature lets the player unlock any chat widget, drag it by its header to anywhere on the
screen (for example the unused space on the far left), and lock it there. Widgets that stay
in Torn's bottom row slide over to close the gap a moved widget leaves.

Later features (NOT in this spec, but the architecture must accommodate them as separate
modules): chat font size, per-widget size customization.

## 2. Existence check (done 2026-09-19)

Searched Greasy Fork's full torn.com "chat" listing (~100 scripts) plus targeted searches
(torn + drag / move / font / position / resize) and read the source of every candidate.
No script relocates chat widgets in-page. Closest:

- Better Chat 3.0 (greasyfork 553128): resizes windows by dragging edges; one global size
  for all windows; no moving.
- Doobie's Chat Popout (518038), Torn Chat Popout (516930): pop chat into a separate
  browser window.
- Torn Chat Hider (581339): hides widgets per tab and reflows the rest with a compensating
  `translate`. Its reflow approach is the model for ours.
- TORN: Better Chat (478093): has global font size; written for Chat 2.0.

## 3. Environment and constraints

- Runtime: Tampermonkey on desktop Chrome/Firefox, `@match https://www.torn.com/*`,
  `@run-at document-idle` is acceptable (widgets appear after React renders anyway).
- Torn Chat 3.0 is a React app with hashed CSS-module class names (e.g. `root___FmdS_`).
  Hashed classes MUST NOT be used as selectors; they change between Torn builds.
- No Torn API key. State lives in `localStorage` only.
- The development machine cannot log into Torn. Selectors start from facts gathered from
  other scripts (section 4) and are verified by the user pasting a widget's HTML.
- TornPDA / mobile is out of scope. Pointer events are used so touch may work incidentally,
  but it is not tested.

## 4. Known Chat 3.0 DOM facts (from other scripts; verify with user-pasted HTML)

- A chat box is a `div` with an `id` (contains `-`), and its header contains
  `svg[aria-label="Minimize"]`. Chat Hider finds boxes via
  `document.querySelectorAll('svg[aria-label="Minimize"]')` then `btn.closest('div[id*="-"]')`.
  Chat+ finds the header the same way: walk up from that icon to the direct
  child of the box. Confirmed against the live DOM (Chrome 153, 2026-09-20):
  `headerOf(box)` returns a 270x38 `div`.
- The header bar is itself a `<button>` spanning essentially the full 270px,
  with the avatar and title inside it and the Minimize/Close icons and Chat+'s
  padlock as separate hit targets. Whether those icons are siblings of that
  button or nested inside it does not matter: the whole header drags (5.3).
- The positioned wrapper Torn moves around is `chatBox.parentElement.parentElement`. Torn
  sets its position with an inline style of ONE of: `right: Npx`, `left: Npx`, or
  `transform: translateX(Npx)`. Detect which once and reuse.
- Torn re-writes those inline styles on re-render, so overrides must be re-asserted
  (attribute MutationObserver on the wrapper, `attributeFilter: ['style']`).
- Bottom bar channel buttons: `button[id*="channel_panel_button:"]`; the id suffix after
  the colon is the chat id.
- Minimizing removes the box from the DOM; expanding re-adds it. Treat re-add as a new
  widget and re-apply saved state.

All of these lookups live in ONE module (`src/core/selectors.js`) so a Torn change means
editing one file.

## 5. User-facing behavior

### 5.1 Header buttons
- Each chat widget header gets a 24x24 SVG padlock button inserted immediately before the
  Minimize button. `aria-label="Chat+ lock"`, `title` = "Locked — click to unlock and drag by
  the header. Right-click for Chat+ settings." (text swaps for the unlocked state).
- Closed padlock = locked. Open padlock = unlocked. Click toggles.
- Right-click (contextmenu, default prevented) on the padlock opens the Chat+ settings menu
  anchored to it (amended 2026-09-20, feature 2; it used to reset the position, which the
  return arrow below already does, discoverably).
- A second 24x24 SVG button, a return arrow, sits immediately before the padlock, but only
  while the widget has a position of its own (5.2). `aria-label="Chat+ return to row"`,
  `title` = "Return this chat to Torn's row". Clicking it resets the widget to Torn's default
  slot, leaving the lock state alone, and then removes itself.
- Both buttons act on click only. A press on either starts a candidate drag like a press
  anywhere else in the header (5.3); their clicks never reach Torn.

### 5.2 Per-widget state
```
{ x: number|null, y: number|null, locked: boolean }
```
- `x`/`y` are viewport pixels of the wrapper's top-left. `null` means "native": the widget
  sits wherever Torn puts it in the row.
- Default for an unknown widget: `{ x: null, y: null, locked: true }`.
- The return arrow (5.1) is shown exactly while `x`/`y` are both set. The position a drag
  is holding but has not committed yet does not count, so the arrow appears on release.

### 5.3 Dragging
- Only unlocked widgets drag. The whole header is the drag handle. Cursor `grab` on hover,
  `grabbing` while dragging.
- `pointerdown` anywhere inside the header starts a candidate drag: bare header, Torn's
  header button, the name and avatar, the Minimize and Close icons, the Chat+ padlock and
  return arrow. Movement must exceed 4px before it becomes a real drag, so a press released
  in place stays an ordinary click and still reaches whatever was pressed.
- Nothing has to recognise a control, so `selectors.js` has no handle test and
  `dragController.js` needs no Torn structure at all.
- During drag the wrapper becomes floating (`position: fixed; left/top` via a class plus
  CSS custom properties with `!important`, neutralizing Torn's `right`/`left`/`transform`).
  `setPointerCapture` keeps the drag alive outside the element.
  The floating class also sets `transition: none`: Torn animates the wrapper's transform over
  150 ms, which otherwise makes a starting drag slide sideways into place.
- Position is clamped so the whole widget stays inside the viewport. If the widget is
  larger than the viewport, its top-left is clamped to 0.
- `pointerup`/`pointercancel` persists `{x, y}`.
- Floating widgets use a z-index above page content; the widget being dragged is above
  other floating widgets.

### 5.4 Locking, minimizing, resizing
- Locking a floating widget keeps it floating at its saved spot with dragging disabled.
- Minimize then expand: the widget reappears at its saved spot (or in the row if native).
- On window resize, floating widgets are re-clamped into the viewport and the clamped values
  persisted.

### 5.5 Row reflow (gap closing)
- Floating widgets are excluded from row layout. The remaining native widgets get a
  compensating `translate: Xpx 0` (set with `!important`) so they pack toward Torn's anchor
  edge with no gaps, ordered by their natural offset. Native widgets that need no shift get
  the property removed.
- Reflow runs (rAF-coalesced) whenever a widget is added, removed, floated, reset, or when
  Torn rewrites a wrapper's inline style.
- Implementation mirrors Torn Chat Hider's `repositionChatsImpl` logic, generalized so
  "hidden" becomes "floating".

### 5.6 Cross-tab
- State is saved to `localStorage["chatplus.state.v1"]`. The `storage` event triggers a
  re-apply of all widget states in other tabs.

### 5.7 Coexisting with Torn's native reorder drag

Evidence from a live diagnostic trace (Chrome 153, Torn Chat 3.0, 2026-09-20):

- Torn runs its own drag from a press on the very same header button. On
  `pointerdown` it writes `transition-property: none` and `z-index: 1` on the wrapper;
  during the move it writes an X-only `transform: translate(-273px, 0px)` onto an inner
  element; on `pointerup` it clears that, removes and re-inserts the wrapper in its parent
  (a real DOM move) and rewrites every wrapper's `translateX` so the box lands in a new slot
  — a reorder among same-type chats.
- Torn's handlers do not call `stopPropagation` or `preventDefault`, do not use pointer
  capture, and no HTML5 drag-and-drop is involved. The press reaches `document` in the
  bubble phase.
- Torn's wrapper is `position: absolute` inside a `relative` parent inside a `fixed`
  grandparent inside `#chatRoot`, and no ancestor has a transform — so `position: fixed`
  measures from the viewport, as 5.3 assumes.

Both drags on one gesture means Torn re-inserts the wrapper under our pointer. Rule:

- The header guard (`headerGuard.js`) registers capture-phase `pointerdown`, `mousedown`
  and `touchstart` listeners on the header and calls `stopPropagation()` on EVERY press
  inside it — never `preventDefault()`, so focus, `:active` and the click still work. A
  click is a separate event, so Torn's Minimize and Close keep acting on one.
- A real drag ends with a click on whatever the pointer now sits over, which the box moving
  under the pointer can make the very control the drag started from. The guard therefore
  swallows the one click that follows a drag — capture phase, `stopPropagation()` and
  `preventDefault()`, whatever its target — and disarms; any `pointerdown` disarms too, so a
  drag that ended in `pointercancel` never eats a later click.
- The feature enables that guard only when the widget is unlocked or already floating.
  A locked widget still sitting in Torn's row is not touched at all: no listeners, so Torn's
  drag-to-swap keeps working for it. A floating widget is no longer a row item, so Torn must
  not reorder it even while locked.
- Because a stopped event never comes back up, the drag controller's own `pointerdown`
  listener is registered in the capture phase too.
- `disable()` removes these listeners along with the rest.

## 6. Architecture

```
ChatPlus/
  package.json            scripts: build, test, watch; devDeps: esbuild, jsdom
  build.mjs               esbuild bundle src/main.js -> dist/chatplus.user.js (IIFE),
                          prepends src/header.txt userscript metadata
  src/
    header.txt            ==UserScript== block (name "Chat+", version, @match, @grant none)
    main.js               bootstrap: storage -> registry -> observer
    core/
      storage.js          load/save state, schema version, subscribe(fn) fed by 'storage' event
      selectors.js        every Torn DOM lookup: findChatBoxes(root), chatIdOf(box),
                          wrapperOf(box), headerOf(box), minimizeButtonOf(box),
                          naturalOffsetOf(wrapper) -> {prop, value}
      observer.js         MutationObserver on document.body; emits widgetAdded/widgetRemoved
                          with a Widget record {id, box, wrapper, header}; dedupes by box
      registry.js         registerFeature({id, init(ctx), onWidgetAdded(w, ctx),
                          onWidgetRemoved(w, ctx)}); ctx = {storage, selectors}
      log.js              prefixed console helpers; warnOnce(key, msg)
    features/movable/
      index.js            feature module wiring the parts below
      lockToggle.js       builds padlock SVG, click/contextmenu handling, state sync
      resetButton.js      the return-to-row arrow, shown only while the widget floats
      dragController.js   pointer-event drag with threshold, capture, clamp, persist
      headerGuard.js      capture-phase press/click guards that keep Torn's own reorder
                          drag and header action off a header Chat+ has taken over
      reflow.js           PURE: computeCompensations(rows) -> Map(id -> px); plus a thin
                          DOM applier applyCompensations(widgets, selectors)
      floating.js         applyFloating(wrapper, x, y) / clearFloating(wrapper); style
                          re-assertion observer
      styles.css          moved to src/styles.css in feature 2: one stylesheet for the
                          whole userscript, injected by core/styles.js at boot
  test/                   node --test; jsdom for DOM-level tests
  docs/superpowers/specs/ this file
  README.md               install (paste dist into Tampermonkey), optional file:// loader,
                          manual acceptance checklist, "how to send me your chat HTML"
```

Rules:
- ES modules in `src/`, bundled by esbuild to one IIFE. No runtime dependencies.
- Only `selectors.js` touches Torn-specific structure. Everything else works on the Widget
  record.
- `reflow.computeCompensations` and the clamp helper are pure functions with unit tests.
- Never throw out of observer or event callbacks; catch, `warnOnce`, continue.
- Corrupt or wrong-version storage resets to defaults with a console warning.

## 7. Data flow

1. `main.js` loads state, creates the registry, registers the movable feature, starts the
   observer.
2. Observer finds a chat box -> builds Widget -> registry fans out `onWidgetAdded`.
3. Movable feature: injects padlock (state from storage), attaches drag controller if
   unlocked, applies floating position if `x/y` set, schedules reflow.
4. User drags -> controller updates floating position each frame -> on release persists.
5. Storage change (this tab or `storage` event) -> feature re-applies every known widget.
6. Widget removed (minimized) -> feature drops its handlers, schedules reflow.

## 8. Testing

- Unit (pure): `computeCompensations` for right-anchored, left-anchored and translateX
  layouts, with zero, one, and several floating widgets; `clamp` edge cases including
  oversized widgets.
- Unit (jsdom): storage roundtrip, corrupt JSON, version mismatch, `storage` event
  subscription; lockToggle click/contextmenu; dragController threshold, drag from Torn's header
  button and from every header control, Torn's native press suppressed only when Chat+ owns
  the drag, pointer capture, persisted result; observer discovers a fake header and dedupes.
- Integration (jsdom): for the padlock, the return arrow and Torn's Minimize icon, a press
  plus a >4px move drags the widget and the control does not fire, while a press released in
  place fires it.
- Manual acceptance checklist (README): unlock, drag left, lock, reload -> still there;
  minimize/expand -> still there; second tab follows; reset returns to row and row closes gap;
  resize window -> widget stays visible.

## 9. Out of scope (v1)

Font size, per-widget size, a settings panel UI, TornPDA, touch testing, Greasy Fork
publishing automation.
