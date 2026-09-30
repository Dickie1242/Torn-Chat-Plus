# Chat+ — Top-left corner grip and docked width (feature 3, part 2) — Design

Date: 2026-09-20
Status: approved by user ("do the top left corner idea, makes sense to have it all in one"), implemented 2026-09-20
Amends: 2026-09-20-chatplus-widget-size-design.md (v1.5.x). Ships as v1.6.0.

## 1. Goal

After trying v1.5.1 the user found the width control hard to discover (a
corner hidden at the bottom-right) and unavailable on docked chats. This part
adds one grip at the **top-left corner** of every unlocked chat that changes
width and height together, and makes width apply to docked chats too, with
Torn's row sliding the other chats over so nothing overlaps.

## 2. User-facing behaviour

- Handles per state:
  - locked: none;
  - docked: the top strip (`n`) and a 14 px **top-left corner** (`nw`);
  - floating: `n`, `nw`, the bottom strip (`s`) and the bottom-right corner (`se`).
  No left-edge strip: the user chose the single corner grip. The right edge
  stays free for the scrollbar and Torn's close icon.
- Dragging the top-left corner up and left makes the chat taller and wider. A
  purely horizontal drag changes only the width.
- **Width now applies to every chat**, docked or floating, and persists per
  chat as before. A chat returned to the row keeps its width.
- A **docked** chat grows leftward, into the free space at the left of the
  screen. Torn's row is anchored to the right edge (the live trace shows
  wrappers placed with negative `translateX` from a right-pinned position), so
  the widened chat's right edge stays put and every docked chat further from
  the right edge slides left by the extra width of the chats between it and
  the edge. This is the existing gap-closing reflow, extended with widths.
- A **floating** chat dragged from its top-left corner grows up and left in
  place: its right and bottom edges stay where they are, and its stored `x`
  and `y` move on release, as the top edge already does for `y`.
- Bounds: width from the corner is limited by the chat's own distance to the
  screen's left edge (`start.left + start.width`), docked or floating. Height
  limits are unchanged. If a widened docked chat pushes the leftmost chat off
  screen, the user shrinks it back; the row is not clamped as a whole.
- The cursor over the corner is `nwse-resize`, the same as the bottom-right
  corner, and the body cursor follows during the drag.

## 3. Sizing mechanism changes (`src/features/resize/`)

- `nextSize`: a direction containing `w` sets
  `width = clamp(start.width - dx)`. (`e` unchanged.)
- `limitsFor`: `maxWidth` is `start.left + start.width` when the direction
  contains `w`; otherwise as today (`viewport.width - start.left` while
  floating, `start.width` docked).
- Controller: the live size becomes `{ width, height, shiftX, shiftY }`.
  `shiftX = size.width - round(start.width)` when floating and the direction
  contains `w`, else 0; `shiftY` is today's `shift` (floating and `n`).
- Feature: `setShift(box, shiftX, shiftY)` writes
  `translate: <-shiftX>px <-shiftY>px !important` on the box, or removes it
  when both are 0. `apply` passes the stored width always (no floating gate).
  `commit` writes one `setWidget` with `{ width, height }` plus, while
  floating, `x: state.x - shiftX` when `shiftX` is non-zero and
  `y: state.y - shiftY` when `shiftY` is non-zero.
- `directionsFor`: `[]`, `['n', 'nw']`, `['n', 'nw', 's', 'se']`.
- CSS: `.chatplus-handle--nw { left: 0; top: 0; width: 14px; height: 14px;
  cursor: nwse-resize; z-index: 11; }` and `body[data-chatplus-resizing="nw"]`
  joins the `se` cursor rule.

## 4. Width-aware reflow (`src/features/movable/`)

`computeCompensations` stays pure and gains widths:

```
layout = { prop, widgets: [{ id, natural, floating, width }], defaultWidth }
```

After the existing slot assignment (sorted by anchor distance), the
compensation of the k-th non-floating widget is

```
sign * (slot_k - natural_k)  +  away * Σ_{j < k, non-floating} (width_j - defaultWidth)
```

where `away` is the on-screen direction away from the row's anchor edge: `-1`
when the row is anchored on the right (`prop === 'right'`, or `transform` with
any negative natural), `+1` when anchored on the left (`prop === 'left'`, or
`transform` with no negative natural). A widget with no finite `width`, or a
layout with no finite `defaultWidth`, contributes 0 extra, so today's
behaviour is the fallback. The widened widget itself needs no self-shift: its
wrapper is pinned at the anchor side and shrink-wraps the box (Better Chat 3.0
never had to size Torn's wrapper), so the box grows away from the anchor on
its own.

`applyCompensations(widgets, selectors, isFloating, defaultWidth)` measures
`width` as `wrapper.getBoundingClientRect().width` for each row widget and
passes `defaultWidth` through.

The movable feature supplies `defaultWidth`: on `onWidgetAdded`, when the box
carries no inline `width` (Torn's own size, before the resize feature applies
ours), it records `entry.naturalWidth = wrapper rect width`. The reflow uses
the first finite `naturalWidth` among the entries. A re-emitted widget whose
box already has an inline width keeps the value recorded earlier.

Reflow trigger: movable adds a MutationObserver on each widget's **box**
(`attributes`, `attributeFilter: ['style']`) that schedules a reflow. The box's
inline style is where the resize feature writes the size, so every live drag
step and every applied size re-runs the row; the observer is disconnected in
`dropEntry`. (ResizeObserver would be the semantic choice but jsdom cannot
exercise it.)

## 5. Live verification (user, on torn.com)

1. Unlock a docked chat: a `nwse-resize` cursor at its top-left corner; drag
   up-left; it grows both ways, its right edge stays put, and the chats to its
   left slide over. Lock, reload: kept.
2. Widen the rightmost of three docked chats: the other two slide left by the
   extra width; float the middle one out and back: the row still packs with
   the right gaps.
3. Move a chat out of the row and drag its top-left corner: it grows up and
   left with its bottom-right corner fixed; release; drag the header: it moves
   from where it is.
4. Torn's own reorder drag on locked chats still works with a widened chat in
   the row.
5. Reset from the padlock menu returns width and height, and the row closes up.

## 6. Tests

- `sizing.test.js`: `w` math and the `nw` corner; `maxWidth` for `w`.
- `handles.test.js`: new direction sets.
- `resizeController.test.js`: `nw` on a floating chat reports `shiftX` and
  `shiftY`; `nw` on a docked chat reports both 0; `n` still reports `shiftX: 0`.
- `resize.test.js`: docked `nw` drag applies width and height, no translate,
  commits `{ width, height }` and leaves `x`/`y` null; floating `nw` drag shows
  `translate: -30px -60px` live and commits `x`, `y`, `width`, `height`; a
  stored width now applies to a docked chat.
- `reflow.test.js`: right-anchored (`transform`, naturals `[0, -273, -546]`,
  widths `[400, 270, 270]`, default 270) → `{0, -130, -130}`; middle widened
  instead → `{0, 0, -100}`; a floating middle widget → `0` and excluded from
  the sum; `right` prop same signs; `left` prop flips to `+`; missing widths
  or default → unchanged from today.
- `movable.test.js`: `naturalWidth` recorded from a fresh box and not
  overwritten by a re-emit whose box has an inline width; changing a box's
  inline width triggers a reflow that moves the neighbour's translate.
- `build.test.js`: `chatplus-handle--nw` in the bundle; version 1.6.0.

## 7. Out of scope

- A left-edge strip (the user chose the corner alone).
- Clamping the whole row so the leftmost chat can never leave the screen.
- Right-edge handles.
