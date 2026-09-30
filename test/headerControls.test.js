import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, stubRect, settle } from '../testlib/dom.js';
import * as selectors from '../src/core/selectors.js';
import { createStorage } from '../src/core/storage.js';
import { createMenu } from '../src/core/menu.js';
import { createObserver } from '../src/core/observer.js';
import { createMovableFeature } from '../src/features/movable/index.js';
import { LOCK_ATTR } from '../src/features/movable/lockToggle.js';
import { RESET_CLASS } from '../src/features/movable/resetButton.js';
import { createTextScaleFeature } from '../src/features/textScale/index.js';
import { LARGER_LABEL, VALUE_CLASS } from '../src/features/textScale/control.js';
import { createResizeFeature } from '../src/features/resize/index.js';
import { BUTTON_CLASS } from '../src/features/resize/resetControl.js';
import {
  createHeaderControlsFeature, CONTROLS_ATTR, HIDDEN_CLASS, HEADER_CONTROLS_MIN_WIDTH,
} from '../src/features/headerControls/index.js';

/**
 * The observer the running test booted. A scan scheduled off a frame reads
 * globalThis.document, so one left running would land in the NEXT test's DOM
 * and let a dead feature instance re-mount its strip over the live one.
 */
let booted = null;

async function withDom(fn) {
  const dom = setupDom();
  try {
    return await fn(dom);
  } finally {
    if (booted) booted.stop();
    booted = null;
    teardownDom(dom);
  }
}

/** storage + menu + the four features + the observer, as main.js wires them. */
function boot(dom) {
  const doc = dom.window.document;
  const storage = createStorage();
  const menu = createMenu({ doc });
  const features = [
    createMovableFeature(), createTextScaleFeature(), createResizeFeature(),
    createHeaderControlsFeature(),
  ];
  const ctx = { storage, selectors, menu };
  for (const feature of features) feature.init(ctx);
  const observer = createObserver({
    selectors,
    onWidgetAdded: (widget) => features.forEach((f) => f.onWidgetAdded(widget, ctx)),
    onWidgetRemoved: (widget) => features.forEach((f) => f.onWidgetRemoved(widget, ctx)),
  });
  observer.start();
  booted = observer;
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

const strip = (chat) => chat.header.querySelector(`[${CONTROLS_ATTR}]`);
const hidden = (chat) => strip(chat).classList.contains(HIDDEN_CLASS);
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', {
  bubbles: true, cancelable: true,
}));

test('one strip per chat, left of the padlock, hidden until the chat is 400 px wide', () => withDom(async (dom) => {
  const t = boot(dom);
  const chat = await addChat(t, 'chat-1', { left: 700, top: 368, width: 270, height: 400 });
  assert.ok(strip(chat));
  assert.equal(strip(chat).nextElementSibling, chat.header.querySelector(`[${LOCK_ATTR}]`));
  assert.equal(hidden(chat), true);
  const wide = await addChat(t, 'chat-2', { left: 300, top: 368, width: 450, height: 400 });
  assert.equal(hidden(wide), false);
  assert.equal(chat.header.querySelectorAll(`[${CONTROLS_ATTR}]`).length, 1);
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
  const arrow = chat.header.querySelector(`.${RESET_CLASS}`);
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
  // Torn re-renders the header: a new node with only Torn's own contents.
  const fresh = t.doc.createElement('div');
  fresh.innerHTML = '<span class="title">chat-1</span><svg aria-label="Minimize" viewBox="0 0 24 24"></svg>';
  chat.box.replaceChild(fresh, chat.header);
  t.observer.scan();
  await settle();
  assert.equal(chat.box.querySelectorAll(`[${CONTROLS_ATTR}]`).length, 1);
  chat.wrapper.remove();
  await settle();
  t.storage.setWidget('chat-1', { scale: 120 }); // must not throw on a dropped entry
}));

test('a chat restored at a stored position gets the strip left of the arrow too', () => withDom(async (dom) => {
  const t = boot(dom);
  // Movable runs first, so the arrow is already in the header when the strip mounts.
  t.storage.setWidget('chat-1', { x: 20, y: 300 });
  const chat = await addChat(t, 'chat-1', { left: 20, top: 300, width: 450, height: 400 });
  const arrow = chat.header.querySelector(`.${RESET_CLASS}`);
  assert.ok(arrow, 'the arrow is mounted');
  assert.equal(strip(chat).nextElementSibling, arrow, 'strip, then arrow');
  assert.equal(arrow.nextElementSibling, chat.header.querySelector(`[${LOCK_ATTR}]`), 'then the padlock');
}));

test('the threshold itself is wide enough, one pixel under it is not', () => withDom(async (dom) => {
  const t = boot(dom);
  const exact = { left: 300, top: 368, width: HEADER_CONTROLS_MIN_WIDTH, height: 400 };
  const chat = await addChat(t, 'chat-1', exact);
  assert.equal(hidden(chat), false, 'exactly at the threshold the strip shows');
  const under = await addChat(t, 'chat-2', { ...exact, width: HEADER_CONTROLS_MIN_WIDTH - 1 });
  assert.equal(hidden(under), true, 'one pixel under it does not');
}));

test('a window resize re-measures the box', () => withDom(async (dom) => {
  const t = boot(dom);
  const chat = await addChat(t, 'chat-1', { left: 700, top: 368, width: 270, height: 400 });
  assert.equal(hidden(chat), true);
  // Torn re-lays the row out on a viewport change: the box is wider with no
  // inline style write for the box observer to see.
  stubRect(chat.box, { left: 520, top: 368, width: 450, height: 400 });
  dom.window.dispatchEvent(new dom.window.Event('resize'));
  await settle();
  assert.equal(hidden(chat), false);
  stubRect(chat.box, { left: 700, top: 368, width: 270, height: 400 });
  dom.window.dispatchEvent(new dom.window.Event('resize'));
  await settle();
  assert.equal(hidden(chat), true);
}));
