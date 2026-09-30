# Chat+ — Per-chat message size (feature 2, part 2) — Design

Date: 2026-09-20
Status: approved by user ("Go ahead"), implemented 2026-09-20
Amends: 2026-09-20-chatplus-message-size-design.md (global message size, v1.3). Ships as v1.7.0.

## 1. Goal

Message size is one value for every chat. The user wants it per chat, so a
big chat can carry big text and a small chat small text. The padlock menu
already knows which chat opened it (`menu.onOpen`, added for the Reset row),
so the existing Message size row simply starts acting on that chat.

## 2. User-facing behaviour

- Right-click a chat's padlock: the **Message size** row shows *that* chat's
  size; minus and plus change only that chat, in the same 80–200 range with
  the same 10-point steps, applied straight away and in every open tab.
- A chat that has never been adjusted uses the **default**: the global value
  the player had before this version (100% for anyone new). Nothing changes on
  upgrade. There is no control for the default; it only carries over.
- Message size and box size stay independent. The header keeps Torn's size,
  as before.
- The Widget size Reset row is unchanged: it resets width and height only.

## 3. Storage

`DEFAULT_WIDGET_STATE` gains `scale: null` (null = use the default).
`sanitizeWidget` keeps `scale` only when it is a finite number, rounded and
clamped into `SETTINGS.messageScale`'s `min`–`max`; anything else becomes
`null`. `settings.messageScale` stays exactly as it is and serves as the
default. Storage version stays 1.

## 4. Architecture (`src/features/textScale/`)

- `scaleOf(id)`: the chat's own `scale`, or `settings.messageScale` when null.
- `applyAll`: every entry gets `applyScale(widget, scaleOf(id))`; the control
  is synced to `scaleOf(currentId)` when a chat is current.
- `init`: renders the control as today, but `getScale` returns
  `scaleOf(currentId)` (the default when no chat is current) and `setScale`
  writes `storage.setWidget(currentId, { scale })` and does nothing when no
  chat is current. It subscribes `menu.onOpen(anchor)`: `currentId =
  selectors.chatIdOf(selectors.boxOf(anchor))`, then syncs the control.
- `onWidgetAdded` and the `watchBox` re-apply use `scaleOf(widget.id)`.
- `control.js` is unchanged. `applyScale` is unchanged (100% removes the
  custom property).
- Header comments and the module's top comment say the size is per chat.

## 5. Tests

- `storage.test.js`: `scale` defaults to null; finite values round and clamp
  into 80–200; junk becomes null; the six-key record shape.
- `textScale.test.js` (boot with the real `createMenu`): the default applies
  to every chat; a chat with its own scale is zoomed by it while the others
  keep the default; opening the menu from chat-1's padlock shows chat-1's
  value and plus writes `chat-1.scale` (settings untouched); opening from
  chat-2 shows chat-2's value; a per-chat scale written by another tab is
  applied; 100% removes the property; the handle skip still holds.
- `build.test.js`: version 1.7.0.

## 6. Live verification

1. Right-click chat A's padlock, press plus twice: only chat A's text grows.
2. Right-click chat B: the row shows B's value; change it; A is untouched.
3. Reload: both kept. A chat never adjusted matches the pre-upgrade size.

## 7. Out of scope

- A control for the default value.
- Resetting message size from the Widget size Reset row.
