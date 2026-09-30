import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupDom, teardownDom, makeChatWidget, makeLiveChat, makeChatRoot, stubRect, firePointer,
  captureConsole, settle, nextFrame,
} from '../testlib/dom.js';
import * as log from '../src/core/log.js';
import * as selectors from '../src/core/selectors.js';
import { createStorage } from '../src/core/storage.js';
import { createObserver } from '../src/core/observer.js';
import { FLOATING_CLASS, VAR_X, VAR_Y } from '../src/features/movable/floating.js';
import { LOCK_ATTR } from '../src/features/movable/lockToggle.js';
import { RESET_CLASS } from '../src/features/movable/resetButton.js';
import { createMovableFeature } from '../src/features/movable/index.js';

async function withDom(fn) {
  const dom = setupDom();
  log.resetWarnOnce();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

/** The real wiring from main.js: storage + menu + feature + observer. */
function boot(dom) {
  const doc = dom.window.document;
  const storage = createStorage();
  // main.js always supplies a menu; the padlock's right-click opens it.
  const menu = { addRow: () => doc.createElement('div'), toggle() {} };
  const ctx = { storage, selectors, menu };
  const feature = createMovableFeature();
  feature.init(ctx);
  const observer = createObserver({
    selectors,
    onWidgetAdded: (widget) => feature.onWidgetAdded(widget, ctx),
    onWidgetRemoved: (widget) => feature.onWidgetRemoved(widget, ctx),
  });
  return { doc, storage, ctx, feature, observer };
}

const padlocks = (box) => box.querySelectorAll(`[${LOCK_ATTR}]`);

function fireClick(dom, el) {
  const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

/**
 * A whole browser gesture on one header element: press, move, release, and the
 * click the browser fires afterwards. `to` equal to `from` is a plain click.
 */
function gesture(t, dom, target, from, to) {
  firePointer(target, 'pointerdown', { clientX: from.x, clientY: from.y });
  firePointer(t.doc, 'pointermove', { clientX: to.x, clientY: to.y });
  firePointer(t.doc, 'pointerup', { clientX: to.x, clientY: to.y });
  return fireClick(dom, target);
}

/** An unlocked widget whose wrapper sits at 400,600 and measures 200x120. */
async function bootUnlocked(dom) {
  const t = boot(dom);
  const w = makeChatWidget(t.doc, { id: 'chat-1' });
  stubRect(w.wrapper, { left: 400, top: 600, width: 200, height: 120 });
  t.observer.scan();
  t.storage.setWidget('chat-1', { locked: false });
  await settle();
  return { ...t, w };
}

test('a same-id replacement keeps the NEW node wired up', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const first = makeChatWidget(t.doc, { id: 'chat-1' });
    t.observer.scan();
    assert.equal(padlocks(first.box).length, 1, 'the original widget gets a padlock');

    // Torn re-renders the chat: a brand new node carrying the SAME id replaces
    // the old one, and both changes land in a single scan - which reports the
    // add before the remove.
    const second = makeChatWidget(t.doc, { id: 'chat-1' });
    stubRect(second.wrapper, { left: 400, top: 600, width: 200, height: 120 });
    first.wrapper.remove();
    t.observer.scan();
    await settle();

    assert.equal(padlocks(second.box).length, 1, 'exactly one padlock in the new header');
    assert.equal(padlocks(first.box).length, 0, 'the detached node keeps nothing');

    // Unlocking must reach the replacement, and dragging it must still work.
    t.storage.setWidget('chat-1', { locked: false });
    await settle();
    firePointer(second.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(t.doc, 'pointermove', { clientX: 460, clientY: 630 });
    firePointer(t.doc, 'pointerup', { clientX: 460, clientY: 630 });

    assert.ok(second.wrapper.classList.contains(FLOATING_CLASS), 'the drag floated it');
    assert.equal(second.wrapper.style.getPropertyValue(VAR_X), '410px');
    const state = t.storage.getWidget('chat-1');
    assert.deepEqual([state.x, state.y], [410, 610], 'the drag persisted');

    // A later state change still reaches it, so the entry really survived.
    t.storage.setWidget('chat-1', { x: 77, y: 88 });
    assert.equal(second.wrapper.style.getPropertyValue(VAR_X), '77px');
  });
});

test('a widget that throws while measuring cannot break the resize handler', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const w = makeChatWidget(t.doc, { id: 'chat-1' });
    t.observer.scan();
    t.storage.setWidget('chat-1', { x: 10, y: 10 });
    await settle();

    // Torn tore the layout out from under us mid-resize.
    w.wrapper.getBoundingClientRect = () => { throw new Error('layout is gone'); };
    const pageErrors = [];
    dom.window.addEventListener('error', (event) => pageErrors.push(event));

    const cWarn = captureConsole('warn');
    try {
      dom.window.dispatchEvent(new dom.window.Event('resize'));
      dom.window.dispatchEvent(new dom.window.Event('resize'));
    } finally {
      cWarn.restore();
    }

    assert.deepEqual(pageErrors, [], 'nothing escaped into the page');
    assert.equal(cWarn.calls.length, 1, 'warnOnce: one warning, not one per resize');
    assert.match(String(cWarn.calls[0][1]), /movable\.onResize failed/);
  });
});

test('a resize clamps every floating widget, not just the first', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const a = makeChatWidget(t.doc, { id: 'chat-1' });
    const b = makeChatWidget(t.doc, { id: 'chat-2', style: 'right: 210px;' });
    for (const w of [a, b]) stubRect(w.wrapper, { width: 200, height: 120 });
    t.observer.scan();

    // Both parked well outside a 1024x768 jsdom viewport. Persisting the first
    // one re-enters applyAll, so the second must still be measured and clamped.
    t.storage.setWidget('chat-1', { x: 900, y: 700 });
    t.storage.setWidget('chat-2', { x: 950, y: 760 });
    await settle();

    dom.window.dispatchEvent(new dom.window.Event('resize'));
    await settle();

    const max = { x: dom.window.innerWidth - 200, y: dom.window.innerHeight - 120 };
    for (const id of ['chat-1', 'chat-2']) {
      const state = t.storage.getWidget(id);
      assert.deepEqual([state.x, state.y], [max.x, max.y], `${id} is clamped and persisted`);
    }
    assert.equal(a.wrapper.style.getPropertyValue(VAR_X), `${max.x}px`);
    assert.equal(b.wrapper.style.getPropertyValue(VAR_Y), `${max.y}px`);
  });
});

/** Torn re-renders a chat around its live box: a brand new header element. */
function reHeader(doc, chat) {
  const header = doc.createElement('div');
  header.innerHTML = `<span class="title">${chat.id}</span><svg aria-label="Minimize" viewBox="0 0 24 24"></svg>`;
  chat.box.replaceChild(header, chat.header);
  chat.header = header;
}

/** Unlock `id`, then press the header and move past the drag threshold. */
function startDrag(t, widget, from, to) {
  t.storage.setWidget(widget.id, { locked: false });
  firePointer(widget.header, 'pointerdown', { clientX: from.x, clientY: from.y });
  firePointer(t.doc, 'pointermove', { clientX: to.x, clientY: to.y });
}

test('a widened docked chat slides the rest of the row over, and the default width survives a re-render', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    // Nearest the anchor, and not laid out yet: its wrapper measures 0 wide.
    // A 0 is no measurement - it must never become the row's default width.
    makeChatWidget(t.doc, { id: 'chat-z', style: 'transform: translateX(0px);', width: 0 });
    const a = makeChatWidget(t.doc, { id: 'chat-a', style: 'transform: translateX(-273px);', width: 270 });
    const b = makeChatWidget(t.doc, { id: 'chat-b', style: 'transform: translateX(-546px);', width: 270 });
    t.observer.scan();
    await settle();
    assert.equal(b.wrapper.style.getPropertyValue('translate'), '', 'an untouched row needs nothing');

    // The resize feature widens chat-a: the box grows, its wrapper with it.
    stubRect(a.wrapper, { width: 400, height: 120 });
    a.box.style.setProperty('width', '400px', 'important');
    await settle();
    assert.equal(b.wrapper.style.getPropertyValue('translate'), '-130px 0', 'chat-b slid over by the extra width');

    // Torn re-renders the row around the same (already sized) boxes: the width
    // we wrote must not be mistaken for Torn's own by any of the entries.
    for (const chat of [a, b]) reHeader(t.doc, chat);
    t.observer.scan();
    await settle();
    assert.equal(b.wrapper.style.getPropertyValue('translate'), '-130px 0', 'still slid over after the re-render');
  });
});

test('Torn\'s own inline width on a chat box still counts as the row\'s default width', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const root = makeChatRoot(t.doc);
    // Since 2026-09-30 Torn puts `width: 300px` inline on every chat box.
    const a = makeLiveChat(t.doc, { id: '1234567', parent: root, style: 'transform: translateX(-303px);' });
    const b = makeLiveChat(t.doc, { id: 'faction', parent: root, style: 'transform: translateX(-606px);' });
    t.observer.scan();
    await nextFrame();
    assert.equal(b.wrapper.style.getPropertyValue('translate'), '', 'an untouched row needs nothing');

    // The resize feature widens the first chat: ours is !important.
    stubRect(a.wrapper, { width: 420, height: 400 });
    a.box.style.setProperty('width', '420px', 'important');
    await nextFrame();
    assert.equal(b.wrapper.style.getPropertyValue('translate'), '-120px 0',
      'the next chat slid over by the width beyond Torn\'s 300 px');
  });
});

test('a padlock lands in Torn\'s wrapped header button, and the button drags the chat', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const root = makeChatRoot(t.doc);
    const w = makeLiveChat(t.doc, { parent: root });
    stubRect(w.wrapper, { left: 400, top: 368, width: 300, height: 400 });
    t.observer.scan();
    const lock = padlocks(w.box)[0];
    assert.ok(lock, 'the chat was found');
    assert.equal(lock.parentElement, w.header, 'inside Torn\'s header button');
    assert.equal(lock.nextElementSibling, selectors.minimizeButtonOf(w.box), 'right before Minimize');

    // Torn's reorder drag listens above the header button.
    const seen = [];
    w.headerWrap.addEventListener('pointerdown', () => seen.push('torn'));
    t.storage.setWidget('1234567', { locked: false });
    const title = w.header.querySelector('.title');
    firePointer(title, 'pointerdown', { clientX: 450, clientY: 380 });
    firePointer(t.doc, 'pointermove', { clientX: 470, clientY: 300 });
    firePointer(t.doc, 'pointerup', { clientX: 470, clientY: 300 });
    assert.deepEqual(seen, [], 'Torn never heard the press');
    const state = t.storage.getWidget('1234567');
    assert.deepEqual([state.x, state.y], [420, 288], 'Chat+ moved the chat');
  });
});

test('a drag survives Torn rewriting the wrapper class mid-gesture', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const w = makeChatWidget(t.doc, { id: 'chat-1' });
    stubRect(w.wrapper, { left: 400, top: 600, width: 200, height: 120 });
    t.observer.scan();

    startDrag(t, { id: 'chat-1', header: w.header }, { x: 450, y: 620 }, { x: 500, y: 650 });
    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '450px', 'the drag moved it');

    // React re-renders and assigns a fresh className, wiping ours.
    w.wrapper.className = 'tornWrapper___NEW';
    await settle();

    assert.ok(w.wrapper.classList.contains(FLOATING_CLASS), 'the float must be re-asserted mid-drag');
    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '450px', 'and at the LIVE drag position');
  });
});

test('a drag survives Torn rewriting the wrapper style mid-gesture', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const w = makeChatWidget(t.doc, { id: 'chat-1', style: 'right: 0px;' });
    stubRect(w.wrapper, { left: 400, top: 600, width: 200, height: 120 });
    t.observer.scan();

    startDrag(t, { id: 'chat-1', header: w.header }, { x: 450, y: 620 }, { x: 500, y: 650 });

    // React rewrites the whole style attribute, taking --chatplus-x/y with it.
    w.wrapper.setAttribute('style', 'right: 0px;');
    await settle();

    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '450px', 'x re-asserted mid-drag');
    assert.equal(w.wrapper.style.getPropertyValue(VAR_Y), '630px', 'y re-asserted mid-drag');
  });
});

test('a widget that already has a saved position can be dragged again', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const w = makeChatWidget(t.doc, { id: 'chat-1' });
    stubRect(w.wrapper, { left: 100, top: 100, width: 200, height: 120 });
    t.storage.setWidget('chat-1', { x: 100, y: 100, locked: false });
    t.observer.scan();
    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '100px', 'starts at its saved spot');

    firePointer(w.header, 'pointerdown', { clientX: 150, clientY: 110 });
    firePointer(t.doc, 'pointermove', { clientX: 450, clientY: 310 });
    // The style re-assertion watcher must not drag it back to the STORED spot.
    await settle();

    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '400px', 'the second drag must move it');
    assert.equal(w.wrapper.style.getPropertyValue(VAR_Y), '300px');

    firePointer(t.doc, 'pointerup', { clientX: 450, clientY: 310 });
    assert.deepEqual(
      [t.storage.getWidget('chat-1').x, t.storage.getWidget('chat-1').y],
      [400, 300],
      'and persist the new spot',
    );
  });
});

test('a storage write for another widget mid-drag does not snap the dragged one back', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const a = makeChatWidget(t.doc, { id: 'chat-1' });
    const b = makeChatWidget(t.doc, { id: 'chat-2', style: 'right: 210px;' });
    stubRect(a.wrapper, { left: 400, top: 600, width: 200, height: 120 });
    stubRect(b.wrapper, { left: 190, top: 600, width: 200, height: 120 });
    t.observer.scan();

    startDrag(t, { id: 'chat-1', header: a.header }, { x: 450, y: 620 }, { x: 500, y: 650 });

    // Another tab (or another widget) writes state: applyAll runs for everyone.
    t.storage.setWidget('chat-2', { x: 5, y: 5 });

    assert.ok(a.wrapper.classList.contains(FLOATING_CLASS), 'the dragged widget stays floating');
    assert.equal(a.wrapper.style.getPropertyValue(VAR_X), '450px', 'at its live drag position');
  });
});

test('a drag survives Torn replacing the chat box mid-gesture', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const w = makeChatWidget(t.doc, { id: 'chat-1' });
    stubRect(w.wrapper, { left: 400, top: 600, width: 200, height: 120 });
    t.observer.scan();

    startDrag(t, { id: 'chat-1', header: w.header }, { x: 450, y: 620 }, { x: 500, y: 650 });

    // React rebuilds the box: a brand new node with the same id, same wrapper.
    const fresh = makeChatWidget(t.doc, { id: 'chat-1' });
    w.wrapper.firstElementChild.replaceChild(fresh.box, w.box);
    fresh.wrapper.remove();
    t.observer.scan();
    await settle();

    assert.ok(w.wrapper.classList.contains(FLOATING_CLASS), 'still floating after the swap');
    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '450px', 'and at the live position');

    firePointer(t.doc, 'pointermove', { clientX: 520, clientY: 660 });
    assert.equal(w.wrapper.style.getPropertyValue(VAR_X), '470px', 'the drag is still live');
    firePointer(t.doc, 'pointerup', { clientX: 520, clientY: 660 });
    assert.equal(t.storage.getWidget('chat-1').x, 470, 'and still commits');
  });
});

test('a drag survives Torn replacing the whole wrapper mid-gesture', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const w = makeChatWidget(t.doc, { id: 'chat-1' });
    stubRect(w.wrapper, { left: 400, top: 600, width: 200, height: 120 });
    t.observer.scan();

    startDrag(t, { id: 'chat-1', header: w.header }, { x: 450, y: 620 }, { x: 500, y: 650 });

    const fresh = makeChatWidget(t.doc, { id: 'chat-1' });
    stubRect(fresh.wrapper, { left: 400, top: 600, width: 200, height: 120 });
    w.wrapper.remove();
    t.observer.scan();
    await settle();

    assert.ok(fresh.wrapper.classList.contains(FLOATING_CLASS), 'the new wrapper floats');
    assert.equal(fresh.wrapper.style.getPropertyValue(VAR_X), '450px', 'at the live position');

    firePointer(t.doc, 'pointermove', { clientX: 520, clientY: 660 });
    assert.equal(fresh.wrapper.style.getPropertyValue(VAR_X), '470px', 'the drag is still live');
    firePointer(t.doc, 'pointerup', { clientX: 520, clientY: 660 });
    assert.equal(t.storage.getWidget('chat-1').x, 470, 'and still commits');
  });
});

test('Torn keeps its drag-to-swap on locked row widgets, Chat+ takes the rest', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    // Torn's header bar is one button; the padlock and Minimize sit beside it.
    const w = makeChatWidget(t.doc, { id: 'chat-1', extraHeaderHtml: '<button id="handle">Trade</button>' });
    stubRect(w.wrapper, { left: 400, top: 600, width: 200, height: 120 });
    t.observer.scan();
    const handle = w.header.querySelector('#handle');

    const seen = [];
    t.doc.addEventListener('pointerdown', (event) => seen.push(event.target.id || 'header'));

    // Locked and in the row: Torn owns the press.
    firePointer(handle, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(t.doc, 'pointermove', { clientX: 500, clientY: 660 });
    firePointer(t.doc, 'pointerup', { clientX: 500, clientY: 660 });
    assert.deepEqual(seen, ['handle'], 'Torn\'s reorder drag still sees the press');
    assert.ok(!w.wrapper.classList.contains(FLOATING_CLASS), 'and Chat+ moved nothing');

    // Unlocked: Chat+ owns it, and Torn never hears the press.
    t.storage.setWidget('chat-1', { locked: false });
    await settle();
    firePointer(handle, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(t.doc, 'pointermove', { clientX: 500, clientY: 660 });
    firePointer(t.doc, 'pointerup', { clientX: 500, clientY: 660 });
    assert.deepEqual(seen, ['handle'], 'no second press reached the page');
    assert.equal(t.storage.getWidget('chat-1').x, 450, 'the button really dragged the widget');

    // Locked again, but out of the row: Torn must not reorder it.
    t.storage.setWidget('chat-1', { locked: true });
    await settle();
    firePointer(handle, 'pointerdown', { clientX: 300, clientY: 300 });
    firePointer(t.doc, 'pointermove', { clientX: 400, clientY: 400 });
    firePointer(t.doc, 'pointerup', { clientX: 400, clientY: 400 });
    assert.deepEqual(seen, ['handle'], 'a floating widget is nobody\'s row item');
    assert.equal(t.storage.getWidget('chat-1').x, 450, 'and a locked widget does not move');
  });
});

test('the return arrow appears once a chat is parked, and puts it back in the row', async () => {
  await withDom(async (dom) => {
    const t = boot(dom);
    const w = makeChatWidget(t.doc, { id: 'chat-1' });
    stubRect(w.wrapper, { left: 400, top: 600, width: 200, height: 120 });
    t.observer.scan();
    const arrows = () => w.box.querySelectorAll(`.${RESET_CLASS}`);
    assert.equal(arrows().length, 0, 'a widget in Torn\'s row has nothing to undo');

    // Unlock and drag: committing the drag parks it at a position of its own.
    startDrag(t, { id: 'chat-1', header: w.header }, { x: 450, y: 620 }, { x: 500, y: 650 });
    assert.equal(arrows().length, 0, 'not while the gesture is still in flight');
    firePointer(t.doc, 'pointerup', { clientX: 500, clientY: 650 });
    await settle();

    const arrow = arrows()[0];
    assert.ok(arrow, 'the committed drag put a return arrow in the header');
    assert.equal(arrow.nextElementSibling.getAttribute(LOCK_ATTR), '1', 'right before the padlock');
    assert.equal(arrow.getAttribute('aria-label'), 'Chat+ return to row');

    // The arrow is part of the drag handle like the rest of the header.
    gesture(t, dom, arrow, { x: 450, y: 620 }, { x: 700, y: 300 });
    await settle();
    assert.equal(t.storage.getWidget('chat-1').x, 650, 'a drag from the arrow moves the widget');

    // Released in place it is an ordinary click, and that is the reset.
    gesture(t, dom, arrow, { x: 450, y: 620 }, { x: 450, y: 620 });
    const state = t.storage.getWidget('chat-1');
    assert.deepEqual([state.x, state.y], [null, null], 'the widget is native again');
    assert.equal(state.locked, false, 'and its lock state is untouched');
    assert.ok(!w.wrapper.classList.contains(FLOATING_CLASS), 'so Torn lays it out again');

    assert.equal(arrows().length, 0, 'the arrow removes itself');
    await settle();
    assert.equal(arrows().length, 0, 'and does not come back');
  });
});

test('the padlock drags the widget when moved, and toggles when clicked in place', async () => {
  await withDom(async (dom) => {
    const t = await bootUnlocked(dom);
    const lock = padlocks(t.w.box)[0];

    gesture(t, dom, lock, { x: 450, y: 620 }, { x: 460, y: 630 });
    await settle();
    const dragged = t.storage.getWidget('chat-1');
    assert.deepEqual([dragged.x, dragged.y], [410, 610], 'the press on the padlock dragged it');
    assert.equal(dragged.locked, false, 'and the drag\'s own click did not toggle the lock');

    gesture(t, dom, lock, { x: 450, y: 620 }, { x: 450, y: 620 });
    assert.equal(t.storage.getWidget('chat-1').locked, true, 'a press in place still toggles');
  });
});

test('Torn\'s minimize icon drags the widget when moved, and acts when clicked in place', async () => {
  await withDom(async (dom) => {
    const t = await bootUnlocked(dom);
    const icon = selectors.minimizeButtonOf(t.w.box);
    // Torn's own minimize handler, listening on the icon.
    const minimized = [];
    icon.addEventListener('click', () => minimized.push('minimize'));

    gesture(t, dom, icon, { x: 450, y: 620 }, { x: 460, y: 630 });
    await settle();
    assert.equal(t.storage.getWidget('chat-1').x, 410, 'the press on Minimize dragged the widget');
    assert.deepEqual(minimized, [], 'and did not minimize it');

    gesture(t, dom, icon, { x: 450, y: 620 }, { x: 450, y: 620 });
    assert.deepEqual(minimized, ['minimize'], 'a press in place reaches Torn');
  });
});
