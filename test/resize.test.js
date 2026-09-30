import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupDom, teardownDom, makeChatWidget, makeLiveChat, makeChatRoot, stubRect, firePointer, settle,
} from '../testlib/dom.js';
import * as selectors from '../src/core/selectors.js';
import { createStorage, STORAGE_KEY } from '../src/core/storage.js';
import { createMenu } from '../src/core/menu.js';
import { createObserver } from '../src/core/observer.js';
import { createMovableFeature } from '../src/features/movable/index.js';
import { createTextScaleFeature, SCALED_CLASS } from '../src/features/textScale/index.js';
import { createResizeFeature } from '../src/features/resize/index.js';
import { HANDLE_ATTR, RESIZABLE_CLASS } from '../src/features/resize/handles.js';
import { SIZED_CLASS } from '../src/features/resize/sizing.js';
import { BODY_ATTR } from '../src/features/resize/resizeController.js';

async function withDom(fn) {
  const dom = setupDom();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

/** storage + menu + the three features + the observer, as main.js wires them. */
function boot(dom) {
  const doc = dom.window.document;
  const storage = createStorage();
  const menu = createMenu({ doc });
  const features = [createMovableFeature(), createTextScaleFeature(), createResizeFeature()];
  const ctx = { storage, selectors, menu };
  for (const feature of features) feature.init(ctx);
  const observer = createObserver({
    selectors,
    onWidgetAdded: (widget) => features.forEach((f) => f.onWidgetAdded(widget, ctx)),
    onWidgetRemoved: (widget) => features.forEach((f) => f.onWidgetRemoved(widget, ctx)),
  });
  observer.start();
  return { doc, storage, menu, observer };
}

/** A docked chat like Torn's, box rect stubbed at the bottom of a 1024x768 viewport. */
async function addChat(t, id = 'chat-1', rect = { left: 700, top: 368, width: 270, height: 400 }) {
  const chat = makeChatWidget(t.doc, { id });
  stubRect(chat.box, rect);
  // Scan now rather than wait for the MutationObserver: under parallel test
  // load its frame can land after settle() returns.
  t.observer.scan();
  await settle();
  return chat;
}

const handles = (box) => [...box.children].filter((el) => el.hasAttribute(HANDLE_ATTR)).map((el) => el.getAttribute(HANDLE_ATTR));
const handle = (box, dir) => box.querySelector(`[${HANDLE_ATTR}="${dir}"]`);

test('a locked chat gets nothing; unlocking mounts the top edge and the corner; floating adds two more', () => withDom(async (dom) => {
  const t = boot(dom);
  const chat = await addChat(t);
  assert.deepEqual(handles(chat.box), []);
  assert.ok(!chat.box.classList.contains(SIZED_CLASS));
  assert.equal(chat.box.getAttribute('style') || '', '', 'nothing of ours on an untouched chat');

  t.storage.setWidget('chat-1', { locked: false });
  assert.deepEqual(handles(chat.box), ['n', 'nw']);
  assert.ok(chat.box.classList.contains(RESIZABLE_CLASS));

  t.storage.setWidget('chat-1', { x: 20, y: 300 });
  assert.deepEqual(handles(chat.box), ['n', 'nw', 's', 'se']);

  t.storage.setWidget('chat-1', { locked: true });
  assert.deepEqual(handles(chat.box), [], 'locked while floating: no handles');
}));

test('a stored width and height apply to a docked chat', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { width: 400, height: 500 });
  const chat = await addChat(t);
  assert.equal(chat.box.style.getPropertyValue('height'), '500px');
  assert.equal(chat.box.style.getPropertyPriority('height'), 'important');
  assert.equal(chat.box.style.getPropertyValue('width'), '400px', 'docked: our width too');

  t.storage.setWidget('chat-1', { x: 20, y: 300 });
  assert.equal(chat.box.style.getPropertyValue('width'), '400px', 'floating: kept');

  t.storage.setWidget('chat-1', { x: null, y: null });
  assert.equal(chat.box.style.getPropertyValue('width'), '400px', 'back in the row: kept');
  assert.equal(chat.box.style.getPropertyValue('height'), '500px', 'height kept');
}));

test('dragging a docked chat\'s top edge up makes it taller and stores the height on release', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { locked: false });
  const chat = await addChat(t);
  firePointer(handle(chat.box, 'n'), 'pointerdown', { clientX: 800, clientY: 368 });
  assert.equal(t.doc.body.getAttribute(BODY_ATTR), 'n');
  firePointer(t.doc, 'pointermove', { clientX: 800, clientY: 308 });
  assert.equal(chat.box.style.getPropertyValue('height'), '460px', 'live');
  assert.equal(t.storage.getWidget('chat-1').height, null, 'nothing stored yet');
  firePointer(t.doc, 'pointerup', { clientX: 800, clientY: 308 });
  assert.equal(t.storage.getWidget('chat-1').height, 460);
  assert.equal(chat.box.style.getPropertyValue('height'), '460px');
  assert.equal(t.storage.getWidget('chat-1').width, null, 'a height-only drag pins no width');
  assert.equal(chat.box.style.getPropertyValue('width'), '', 'so the box keeps the width Torn gave it');
  assert.equal(t.doc.body.hasAttribute(BODY_ATTR), false);
}));

test('dragging a floating chat\'s top edge up keeps its bottom still and moves it up on release', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { locked: false, x: 50, y: 300 });
  const chat = await addChat(t, 'chat-1', { left: 50, top: 300, width: 270, height: 400 });
  firePointer(handle(chat.box, 'n'), 'pointerdown', { clientX: 100, clientY: 300 });
  firePointer(t.doc, 'pointermove', { clientX: 100, clientY: 240 });
  assert.equal(chat.box.style.getPropertyValue('height'), '460px');
  assert.equal(chat.box.style.getPropertyValue('translate'), '0px -60px', 'shifted up while dragging');
  assert.equal(chat.wrapper.style.getPropertyValue('--chatplus-y'), '300px', 'wrapper not moved yet');
  firePointer(t.doc, 'pointerup', { clientX: 100, clientY: 240 });
  const state = t.storage.getWidget('chat-1');
  assert.equal(state.height, 460);
  assert.equal(state.y, 240, 'top edge now where the pointer left it');
  assert.equal(state.width, null, 'a height-only drag stores no width, floating or not');
  assert.equal(chat.box.style.getPropertyValue('translate'), '', 'shift gone');
  assert.equal(chat.wrapper.style.getPropertyValue('--chatplus-y'), '240px', 'movable re-placed the wrapper');
}));

test('a height-only drag leaves a stored width alone', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { locked: false, width: 400 });
  const chat = await addChat(t);
  firePointer(handle(chat.box, 'n'), 'pointerdown', { clientX: 800, clientY: 368 });
  firePointer(t.doc, 'pointermove', { clientX: 800, clientY: 308 });
  firePointer(t.doc, 'pointerup', { clientX: 800, clientY: 308 });
  const state = t.storage.getWidget('chat-1');
  assert.deepEqual([state.width, state.height], [400, 460]);
  assert.equal(chat.box.style.getPropertyValue('width'), '400px', 'the stored width is still applied');
}));

test('a cancelled gesture puts the chat back to its stored size', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { locked: false, x: 50, y: 300 });
  const chat = await addChat(t, 'chat-1', { left: 50, top: 300, width: 270, height: 400 });
  firePointer(handle(chat.box, 'n'), 'pointerdown', { clientX: 100, clientY: 300 });
  firePointer(t.doc, 'pointermove', { clientX: 100, clientY: 240 });
  assert.equal(chat.box.style.getPropertyValue('height'), '460px');
  assert.equal(chat.box.style.getPropertyValue('translate'), '0px -60px');

  firePointer(t.doc, 'pointercancel', { clientX: 100, clientY: 240 });
  assert.equal(t.storage.getWidget('chat-1').height, null, 'nothing stored');
  assert.equal(chat.box.style.getPropertyValue('height'), '', 'back to Torn\'s height');
  assert.equal(chat.box.style.getPropertyValue('translate'), '', 'shift gone');
}));

test('the corner of a floating chat sizes both ways', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { locked: false, x: 50, y: 300 });
  const chat = await addChat(t, 'chat-1', { left: 50, top: 300, width: 270, height: 400 });
  firePointer(handle(chat.box, 'se'), 'pointerdown', { clientX: 320, clientY: 700 });
  firePointer(t.doc, 'pointermove', { clientX: 350, clientY: 720 });
  firePointer(t.doc, 'pointerup', { clientX: 350, clientY: 720 });
  const state = t.storage.getWidget('chat-1');
  assert.equal(state.width, 300);
  assert.equal(state.height, 420);
  assert.equal(chat.box.style.getPropertyValue('width'), '300px');
}));


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

test('a size written by another tab is applied', () => withDom(async (dom) => {
  const t = boot(dom);
  const chat = await addChat(t);
  const win = dom.window;
  win.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 1, widgets: { 'chat-1': { x: null, y: null, locked: true, width: null, height: 555 } }, settings: {},
  }));
  win.dispatchEvent(new win.StorageEvent('storage', { key: STORAGE_KEY }));
  assert.equal(chat.box.style.getPropertyValue('height'), '555px');
}));

test('a gesture survives Torn swapping the chat\'s nodes, and a removed chat is cleaned up', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setWidget('chat-1', { locked: false });
  const chat = await addChat(t);
  firePointer(handle(chat.box, 'n'), 'pointerdown', { clientX: 800, clientY: 368 });
  firePointer(t.doc, 'pointermove', { clientX: 800, clientY: 348 });

  // Torn re-renders: a new wrapper/box under the same id.
  chat.wrapper.remove();
  const again = await addChat(t);
  assert.equal(again.box.style.getPropertyValue('height'), '420px', 'the live size, not the stored one');
  assert.deepEqual(handles(again.box), ['n', 'nw']);
  firePointer(t.doc, 'pointermove', { clientX: 800, clientY: 308 });
  assert.equal(again.box.style.getPropertyValue('height'), '460px');
  firePointer(t.doc, 'pointerup', { clientX: 800, clientY: 308 });
  assert.equal(t.storage.getWidget('chat-1').height, 460);

  // Minimized: the chat leaves. A later move must not touch storage.
  firePointer(handle(again.box, 'n'), 'pointerdown', { clientX: 800, clientY: 308 });
  again.wrapper.remove();
  await settle();
  firePointer(t.doc, 'pointermove', { clientX: 800, clientY: 200 });
  firePointer(t.doc, 'pointerup', { clientX: 800, clientY: 200 });
  assert.equal(t.storage.getWidget('chat-1').height, 460, 'unchanged');
}));

test('a chat Torn sizes inline keeps Torn\'s size until Chat+ sizes it, and gets it back on Reset', () => withDom(async (dom) => {
  const t = boot(dom);
  const chat = makeLiveChat(t.doc, { parent: makeChatRoot(t.doc) });
  stubRect(chat.box, { left: 700, top: 368, width: 300, height: 400 });
  t.observer.scan();
  assert.ok(chat.header.querySelector('[data-chatplus-lock]'), 'the chat was found');
  assert.equal(chat.box.getAttribute('style'), 'width: 300px; height: 400px;', 'an untouched chat keeps Torn\'s size');

  t.storage.setWidget('1234567', { width: 450, height: 500 });
  assert.equal(chat.box.style.getPropertyValue('width'), '450px');
  assert.equal(chat.box.style.getPropertyPriority('width'), 'important');

  t.storage.setWidget('1234567', { width: null, height: null });
  assert.equal(chat.box.style.getPropertyValue('width'), '300px', 'Reset: Torn\'s width is back');
  assert.equal(chat.box.style.getPropertyValue('height'), '400px', 'and its height');
  assert.equal(chat.box.style.getPropertyPriority('height'), '');

  t.storage.setWidget('1234567', { locked: false });
  firePointer(handle(chat.box, 'n'), 'pointerdown', { clientX: 800, clientY: 368 });
  firePointer(t.doc, 'pointermove', { clientX: 800, clientY: 308 });
  assert.equal(chat.box.style.getPropertyValue('height'), '460px', 'live');
  firePointer(t.doc, 'pointercancel', { clientX: 800, clientY: 308 });
  assert.equal(chat.box.style.getPropertyValue('height'), '400px', 'a cancelled gesture puts Torn\'s height back');
}));

test('handles are never zoomed with the messages', () => withDom(async (dom) => {
  const t = boot(dom);
  t.storage.setSetting('messageScale', 150);
  t.storage.setWidget('chat-1', { locked: false });
  const chat = await addChat(t);
  await settle();
  assert.ok(chat.body.classList.contains(SCALED_CLASS), 'messages are');
  assert.ok(!handle(chat.box, 'n').classList.contains(SCALED_CLASS), 'the handle is not');
}));
