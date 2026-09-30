import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupDom, teardownDom, makeChatWidget, makeLiveChat, stubRect, settle,
} from '../testlib/dom.js';
import * as selectors from '../src/core/selectors.js';
import { createStorage, SETTINGS, STORAGE_KEY, STORAGE_VERSION } from '../src/core/storage.js';
import { createMenu, MENU_CLASS } from '../src/core/menu.js';
import { createObserver } from '../src/core/observer.js';
import { createMovableFeature } from '../src/features/movable/index.js';
import { LOCK_ATTR } from '../src/features/movable/lockToggle.js';
import {
  createTextScaleFeature, SCALED_CLASS, SCALE_VAR, SETTING_NAME,
} from '../src/features/textScale/index.js';
import {
  createScaleControl, LABEL_TEXT, SMALLER_LABEL, LARGER_LABEL,
  VALUE_CLASS, STEP_CLASS,
} from '../src/features/textScale/control.js';
// Aliased: this file already calls the CSS variable reader below `scaleOf`.
import { scaleOf as scaleFor } from '../src/features/textScale/scale.js';

async function withDom(fn) {
  const dom = setupDom();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

/** A chat box shaped like Torn's: header, message area, input area. */
function makeChat(doc, id) {
  const w = makeChatWidget(doc, { id });
  const input = doc.createElement('div');
  input.innerHTML = '<textarea></textarea>';
  w.box.appendChild(input);
  return { ...w, input };
}

/** Something in the chat's header to anchor the menu to, as the padlock is. */
function anchorIn(chat) {
  const button = chat.box.ownerDocument.createElement('button');
  chat.header.appendChild(button);
  stubRect(button, { width: 16, height: 16 });
  return button;
}

/** storage + the text scale feature + the observer, as main.js wires them. */
function boot(dom, {
  menu = createMenu({ doc: dom.window.document }),
  features = [createTextScaleFeature()],
} = {}) {
  const storage = createStorage();
  // Rows are built once, at init; keep them so a test can press one.
  const rows = [];
  const addRow = menu.addRow.bind(menu);
  menu.addRow = () => { const row = addRow(); rows.push(row); return row; };
  const ctx = { storage, selectors, menu };
  for (const feature of features) feature.init(ctx);
  const observer = createObserver({
    selectors,
    onWidgetAdded: (widget) => features.forEach((f) => f.onWidgetAdded(widget, ctx)),
    onWidgetRemoved: (widget) => features.forEach((f) => f.onWidgetRemoved(widget, ctx)),
  });
  return {
    doc: dom.window.document,
    storage,
    ctx,
    observer,
    menu,
    menuRow: rows.find((row) => row.textContent.includes(LABEL_TEXT)),
  };
}

const scaleOf = (chat) => chat.box.style.getPropertyValue(SCALE_VAR);
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', {
  bubbles: true, cancelable: true,
}));

test('everything in a chat but its header is scaled, and 100% leaves Torn alone', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const chat = makeChat(t.doc, 'chat-1');
    t.observer.scan();

    assert.ok(!chat.header.classList.contains(SCALED_CLASS), 'the header keeps its size');
    assert.ok(chat.body.classList.contains(SCALED_CLASS), 'the message area scales');
    assert.ok(chat.input.classList.contains(SCALED_CLASS), 'and so does the input area');
    assert.equal(scaleOf(chat), '', 'at 100% Torn\'s own sizing is untouched');
  });
});

test('the div Torn wraps its header button in is part of the header, and keeps its size', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const chat = makeLiveChat(t.doc);
    t.observer.scan();
    t.storage.setWidget('1234567', { scale: 150 });
    assert.ok(!chat.headerWrap.classList.contains(SCALED_CLASS), 'the header is not zoomed');
    assert.ok(!chat.header.classList.contains(SCALED_CLASS));
    assert.ok(chat.body.classList.contains(SCALED_CLASS), 'the messages are');
  });
});

test('the default applies to every chat, a chat\'s own size only to it', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const a = makeChat(t.doc, 'chat-a');
    const b = makeChat(t.doc, 'chat-b');
    t.observer.scan();

    t.storage.setSetting(SETTING_NAME, 120);
    assert.equal(scaleOf(a), '1.2');
    assert.equal(scaleOf(b), '1.2', 'a chat with no size of its own follows the default');

    t.storage.setWidget('chat-a', { scale: 160 });
    assert.equal(scaleOf(a), '1.6');
    assert.equal(scaleOf(b), '1.2', 'the other chat keeps the default');

    t.storage.setWidget('chat-a', { scale: 100 });
    assert.equal(scaleOf(a), '', '100% leaves Torn alone');
    assert.ok(a.body.classList.contains(SCALED_CLASS), 'the class stays; the fallback is 1');

    t.storage.setWidget('chat-a', { scale: null });
    assert.equal(scaleOf(a), '1.2', 'back on the default');
  });
});

test('a chat that appears later comes up already scaled', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    t.storage.setSetting(SETTING_NAME, 150);
    t.storage.setWidget('chat-2', { scale: 90 });
    const a = makeChat(t.doc, 'chat-1');
    const b = makeChat(t.doc, 'chat-2');
    t.observer.scan();
    assert.equal(scaleOf(a), '1.5', 'the default');
    assert.equal(scaleOf(b), '0.9', 'its own');
  });
});

test('a default written by another tab re-applies here', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const chat = makeChat(t.doc, 'chat-1');
    t.observer.scan();

    dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION, widgets: {}, settings: { [SETTING_NAME]: 130 },
    }));
    dom.window.dispatchEvent(new dom.window.StorageEvent('storage', { key: STORAGE_KEY }));

    assert.equal(scaleOf(chat), '1.3');
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

test('the Message size row acts on the chat whose padlock opened the menu', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const a = makeChat(t.doc, 'chat-a');
    const b = makeChat(t.doc, 'chat-b');
    t.observer.scan();
    t.storage.setWidget('chat-b', { scale: 140 });

    const value = t.menuRow.querySelector(`.${VALUE_CLASS}`);
    const plus = t.menuRow.querySelector(`[aria-label="${LARGER_LABEL}"]`);

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

/** The menu row on its own: a fake scale it reads and writes. */
function buildControl(dom, start = 100) {
  const writes = [];
  let scale = start;
  const control = createScaleControl({
    range: SETTINGS.messageScale,
    getScale: () => scale,
    setScale: (value) => { writes.push(value); scale = value; control.sync(value); },
  });
  const row = dom.window.document.createElement('div');
  control.render(row);
  return {
    control, row, writes,
    minus: row.querySelector(`[aria-label="${SMALLER_LABEL}"]`),
    plus: row.querySelector(`[aria-label="${LARGER_LABEL}"]`),
    value: () => row.querySelector(`.${VALUE_CLASS}`).textContent,
  };
}

test('the row shows the label, the current percent and two labelled buttons', async () => {
  await withDom(async (dom) => {
    const t = buildControl(dom, 110);
    assert.match(t.row.textContent, new RegExp(LABEL_TEXT));
    assert.equal(t.value(), '110%');
    assert.ok(t.minus && t.plus, 'both steps carry an aria-label');
    assert.equal(t.minus.localName, 'button');
    assert.ok(t.minus.classList.contains(STEP_CLASS));
    assert.equal(SETTINGS.messageScale.step, 10, 'the row steps by what the setting says');
  });
});

test('the buttons step by ten, write through, and clamp at both ends', async () => {
  await withDom(async (dom) => {
    const t = buildControl(dom, 190);
    click(t.plus);
    assert.deepEqual(t.writes, [200]);
    assert.equal(t.value(), '200%', 'the row reports what was written');
    click(t.plus);
    assert.deepEqual(t.writes, [200], 'the maximum is the end of the road');

    const u = buildControl(dom, 90);
    click(u.minus);
    click(u.minus);
    assert.deepEqual(u.writes, [80], 'and the minimum is the other end');
  });
});

test('a press on a menu button starts nothing else on the page', async () => {
  await withDom(async (dom) => {
    const t = buildControl(dom);
    dom.window.document.body.appendChild(t.row);
    const seen = [];
    dom.window.document.addEventListener('click', (event) => seen.push(event.type));
    click(t.plus);
    assert.deepEqual(seen, [], 'the click is the menu\'s, not Torn\'s');
  });
});

test('right-click a padlock, press +, and that chat grows', async () => {
  await withDom(async (dom) => {
    const t = boot(dom, { features: [createMovableFeature(), createTextScaleFeature()] });
    const a = makeChat(t.doc, 'chat-1');
    const b = makeChat(t.doc, 'chat-2');
    t.observer.scan();
    await settle();

    const padlock = a.box.querySelector(`[${LOCK_ATTR}]`);
    padlock.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const element = t.doc.body.querySelector(`.${MENU_CLASS}`);
    assert.ok(element, 'the padlock opened the Chat+ menu');
    assert.equal(element.querySelector(`.${VALUE_CLASS}`).textContent, '100%');

    click(element.querySelector(`[aria-label="${LARGER_LABEL}"]`));
    await settle();

    assert.equal(t.storage.getWidget('chat-1').scale, 110, 'the press wrote the anchored chat');
    assert.equal(t.storage.getSetting(SETTING_NAME), 100, 'the default is untouched');
    assert.equal(scaleOf(a), '1.1');
    assert.equal(scaleOf(b), '', 'the chat the menu was not opened from is left alone');
    assert.equal(element.querySelector(`.${VALUE_CLASS}`).textContent, '110%');

    // The menu stays put while the user keeps pressing.
    assert.equal(t.menu.isOpen(), true);
  });
});

test('a child added to a chat after it was found is scaled too', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const chat = makeChat(t.doc, 'chat-1');
    t.observer.scan();
    t.storage.setWidget('chat-1', { scale: 120 });

    // React fills the box in after Chat+ first saw it.
    const late = t.doc.createElement('div');
    chat.box.appendChild(late);
    await settle();

    assert.ok(late.classList.contains(SCALED_CLASS), 'the late child scales with the rest');
    assert.equal(scaleOf(chat), '1.2');
  });
});

test('a scaled child whose class Torn rewrites gets the scale back', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const chat = makeChat(t.doc, 'chat-1');
    t.observer.scan();
    assert.ok(chat.body.classList.contains(SCALED_CLASS));

    // React re-renders the child with its own className, ours included.
    chat.body.className = 'messages';
    await settle();

    assert.ok(chat.body.classList.contains(SCALED_CLASS), 'the watcher puts it straight back');
  });
});

test('a chat that goes away stops being watched', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const chat = makeChat(t.doc, 'chat-1');
    t.observer.scan();

    chat.wrapper.remove();
    t.observer.scan();
    await settle();

    chat.body.className = 'messages';
    await settle();
    assert.ok(!chat.body.classList.contains(SCALED_CLASS), 'a chat Torn has thrown away is nobody\'s business');
  });
});

test('a resize handle mounted on the box is left unscaled', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const chat = makeChat(t.doc, 'chat-1');
    t.observer.scan();
    const handle = t.doc.createElement('div');
    handle.setAttribute('data-chatplus-resize', 'n');
    chat.box.appendChild(handle);
    await settle();
    assert.ok(chat.input.classList.contains(SCALED_CLASS), 'the input area is scaled');
    assert.ok(!handle.classList.contains(SCALED_CLASS), 'the handle is not');
  });
});

test('a compact control renders no label', async () => {
  await withDom((dom) => {
    const row = dom.window.document.createElement('div');
    createScaleControl({ range: SETTINGS[SETTING_NAME], getScale: () => 100, setScale() {}, compact: true }).render(row);
    assert.equal(row.querySelector('.chatplus-menu__label'), null);
    assert.equal(row.querySelectorAll(`.${STEP_CLASS}`).length, 2);
    assert.equal(row.querySelector(`.${VALUE_CLASS}`).textContent, '100%');
  });
});

test('scaleOf is a chat\'s own size, else the default', async () => {
  await withDom(() => {
    const storage = createStorage();
    storage.setSetting(SETTING_NAME, 130);
    storage.setWidget('chat-a', { scale: 90 });
    assert.equal(scaleFor(storage, 'chat-a'), 90, 'its own wins');
    storage.setWidget('chat-a', { scale: null });
    assert.equal(scaleFor(storage, 'chat-a'), 130, 'null falls back to the setting');
    assert.equal(scaleFor(storage, 'chat-never-seen'), 130, 'and so does a chat with no record');
  });
});
