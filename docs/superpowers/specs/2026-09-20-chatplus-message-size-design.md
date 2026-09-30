# Chat+ — Message Size (feature 2) — Design

Date: 2026-09-20
Status: approved by user, implemented 2026-09-20

## 1. Goal

Torn Chat 3.0's messages are small and their size cannot be changed. Chat+'s
second feature gives the player one adjustable message size, shared by every
chat widget, reachable from a menu that later settings can also use.

## 2. User-facing behaviour

- **Right-clicking any padlock** opens the Chat+ menu, anchored just below that
  padlock. It closes on a press outside it, on Escape, or on another right-click
  of the same padlock. The padlock's tooltips now end "Right-click for Chat+
  settings."; returning a chat to Torn's row stays on the arrow button next to
  the padlock (see the movable spec, 5.1).
- The menu's one row today is **Message size**: a label, a minus button, the
  current percentage (`120%`), a plus button. Each press moves 10 points inside
  80–200 and writes the setting straight away; every open chat follows, in this
  tab and in any other.
- Everything in a chat box except its **header** is scaled: the message list and
  the input area. The header keeps Torn's size, so the bottom row, the window
  icons and the padlock stay exactly where they were.
- At exactly 100% Chat+ writes nothing onto the chat: it looks as it would with
  Chat+ uninstalled.

## 3. Scaling mechanism

Torn's message font sizes come from hashed CSS-module classes, so a `font-size`
on the chat box inherits into nothing. CSS `zoom` does not care who set what -
it scales the whole subtree - and both Chrome and current Firefox support it.

- Every direct child of the box that is not the header gets `chatplus-scaled`.
- The box carries `--chatplus-scale: 1.2` for 120%.
- `.chatplus-scaled { zoom: var(--chatplus-scale, 1) !important; }`.
- 100% removes the custom property; the class stays and the fallback `1` makes
  it a no-op.

Scaling is re-applied whenever the observer (re)discovers a widget and whenever
the setting changes, including from another tab through the `storage` event.

## 4. Storage

Schema version 1 is unchanged; the state object gains a sibling to `widgets`:

```
{ version: 1, widgets: {...}, settings: { messageScale: 100 } }
```

`storage.js` owns the settings table — each setting's default and the range it
is clamped into — and sanitises the way `widgets` does: a missing or non-numeric
value falls back to the default, a number out of range is clamped. The API is
`getSetting(name)` / `setSetting(name, value)`, and `setSetting` persists and
notifies through the same path as `setWidget`, so `subscribe` fires for local
writes and for the cross-tab event alike. Unknown names are not stored.

## 5. Architecture

```
src/
  styles.css                  ONE stylesheet for the userscript (was
                              features/movable/styles.css), injected once at
                              boot by core/styles.js
  core/
    styles.js                 the injection, with the version stamp on the tag
    menu.js                   the shared popover: addItem(render), open/close/
                              toggle(anchor). One element, created once, kept on
                              document.body; a pointerdown inside it is stopped
                              so no drag starts and Torn never sees it
  features/textScale/
    index.js                  the feature: applies the scale on widgetAdded and
                              on every storage change, registers the menu row
    control.js                the row: label, minus, percent, plus
```

`ctx` gains `menu` beside `storage` and `selectors`; the registry passes it
through untouched. `lockToggle.js` calls `onMenu(padlock)` from its contextmenu
handler instead of the old reset.

## 6. Tests

jsdom, `node --test`, in the existing style:

- storage: the setting defaults, round-trips, clamps, sanitises garbage, ignores
  unknown names, notifies subscribers and crosses tabs.
- menu: opens anchored below the anchor and on `document.body`, closes on an
  outside press, on Escape and on re-invocation, leaves presses on the anchor to
  the anchor, stops pointerdown inside, and arms its listeners exactly once.
- textScale: the class lands on the non-header children only, the property is
  set and removed at 100%, a late widget comes up scaled, a `storage` event
  re-applies; the control clamps at both ends, writes through, and shows what
  was written.
- lockToggle: right-click opens the menu anchored to the padlock, prevents the
  browser menu, and no longer resets the position.
- Integration: two chat boxes, right-click a padlock, press +, both boxes
  scaled and the row updated.

## 7. Out of scope

Per-widget scale, font-size-only scaling, a scale for the header, a settings
panel beyond this popover, keyboard shortcuts.
