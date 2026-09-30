import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupDom, teardownDom, makeChatWidget, makeLiveChat, makeChatRoot, captureConsole, settle,
} from '../testlib/dom.js';
import { resetWarnOnce } from '../src/core/log.js';
import * as selectors from '../src/core/selectors.js';
import { createObserver } from '../src/core/observer.js';

async function withDom(fn) {
  const dom = setupDom();
  resetWarnOnce();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

test('scan discovers a widget and builds the Widget record', async () => {
  await withDom((dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a' });
    const added = [];
    const observer = createObserver({ selectors, onWidgetAdded: (x) => added.push(x) });
    observer.scan();
    assert.equal(added.length, 1);
    assert.equal(added[0].id, 'chat-a');
    assert.equal(added[0].box, w.box);
    assert.equal(added[0].wrapper, w.wrapper);
    assert.equal(added[0].header, w.header);
  });
});

test('scan discovers the chats Torn renders since 2026-09-30, header button and all', async () => {
  await withDom((dom) => {
    const doc = dom.window.document;
    const root = makeChatRoot(doc);
    const a = makeLiveChat(doc, { id: '1234567', parent: root });
    const f = makeLiveChat(doc, { id: 'faction', parent: root });
    const added = [];
    const observer = createObserver({ selectors, onWidgetAdded: (x) => added.push(x) });
    observer.scan();
    assert.deepEqual(added.map((w) => w.id), ['1234567', 'faction']);
    for (const [widget, chat] of [[added[0], a], [added[1], f]]) {
      assert.equal(widget.box, chat.box);
      assert.equal(widget.wrapper, chat.wrapper);
      assert.equal(widget.header, chat.header, 'the header is Torn\'s button, not the div around it');
    }
  });
});

test('scan dedupes: a second scan does not re-add the same box', async () => {
  await withDom((dom) => {
    makeChatWidget(dom.window.document, { id: 'chat-a' });
    let added = 0;
    const observer = createObserver({ selectors, onWidgetAdded: () => { added += 1; } });
    observer.scan();
    observer.scan();
    observer.scan();
    assert.equal(added, 1);
  });
});

test('removing a widget from the DOM emits widgetRemoved exactly once', async () => {
  await withDom((dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a' });
    const removed = [];
    const observer = createObserver({ selectors, onWidgetRemoved: (x) => removed.push(x) });
    observer.scan();
    w.wrapper.remove();
    observer.scan();
    observer.scan();
    assert.equal(removed.length, 1);
    assert.equal(removed[0].id, 'chat-a');
  });
});

test('re-adding a minimized widget is treated as a brand new widget', async () => {
  await withDom((dom) => {
    const doc = dom.window.document;
    const w = makeChatWidget(doc, { id: 'chat-a' });
    const events = [];
    const observer = createObserver({
      selectors,
      onWidgetAdded: (x) => events.push(`add:${x.id}`),
      onWidgetRemoved: (x) => events.push(`remove:${x.id}`),
    });
    observer.scan();
    w.wrapper.remove();
    observer.scan();
    doc.body.appendChild(w.wrapper);
    observer.scan();
    assert.deepEqual(events, ['add:chat-a', 'remove:chat-a', 'add:chat-a']);
  });
});

test('a throwing callback never escapes scan', async () => {
  await withDom((dom) => {
    makeChatWidget(dom.window.document, { id: 'chat-a' });
    makeChatWidget(dom.window.document, { id: 'chat-b' });
    const seen = [];
    const observer = createObserver({
      selectors,
      onWidgetAdded: (w) => { seen.push(w.id); throw new Error('feature blew up'); },
    });
    const cWarn = captureConsole('warn');
    try { observer.scan(); } finally { cWarn.restore(); }
    assert.deepEqual(seen, ['chat-a', 'chat-b']);
    assert.equal(cWarn.calls.length, 1, 'warnOnce means one warning, not one per widget');
  });
});

test('start scans immediately and again after a DOM mutation', async () => {
  await withDom(async (dom) => {
    const doc = dom.window.document;
    makeChatWidget(doc, { id: 'chat-a' });
    const added = [];
    const observer = createObserver({ selectors, onWidgetAdded: (w) => added.push(w.id) });
    observer.start();
    assert.deepEqual(added, ['chat-a']);

    makeChatWidget(doc, { id: 'chat-b' });
    // Longer than the default: MutationObserver plus the frame scheduler can
    // take more than 25ms when the suite runs its files in parallel.
    await settle(60);
    assert.deepEqual(added, ['chat-a', 'chat-b']);

    observer.stop();
    makeChatWidget(doc, { id: 'chat-c' });
    await settle();
    assert.deepEqual(added, ['chat-a', 'chat-b']);
  });
});

test('stop cancels a scan that was already scheduled', async () => {
  await withDom(async (dom) => {
    const doc = dom.window.document;
    makeChatWidget(doc, { id: 'chat-a' });
    const added = [];
    const observer = createObserver({ selectors, onWidgetAdded: (w) => added.push(w.id) });
    observer.start();
    assert.deepEqual(added, ['chat-a']);

    makeChatWidget(doc, { id: 'chat-b' });
    await Promise.resolve(); // let the MutationObserver callback schedule its scan
    observer.stop();
    await settle();

    assert.deepEqual(added, ['chat-a'], 'a scan scheduled before stop must not run');
  });
});

test('a live box re-parented into a fresh wrapper is re-reported', async () => {
  await withDom((dom) => {
    const doc = dom.window.document;
    const w = makeChatWidget(doc, { id: 'chat-a' });
    const events = [];
    const observer = createObserver({
      selectors,
      onWidgetAdded: (x) => events.push({ kind: 'add', widget: x }),
      onWidgetRemoved: (x) => events.push({ kind: 'remove', widget: x }),
    });
    observer.scan();
    assert.equal(events.length, 1);

    // Torn re-renders the row: the SAME box node is moved into a brand new
    // wrapper. The box never left the document, so nothing is added or removed,
    // but the wrapper we have on file is now a detached node we must stop
    // styling.
    const newWrapper = doc.createElement('div');
    const newMiddle = doc.createElement('div');
    newWrapper.appendChild(newMiddle);
    doc.body.appendChild(newWrapper);
    newMiddle.appendChild(w.box);
    w.wrapper.remove();

    observer.scan();
    const added = events.filter((e) => e.kind === 'add');
    assert.equal(added.length, 2, 'the re-parented box is reported again');
    assert.equal(added[1].widget.wrapper, newWrapper, 'with the wrapper Torn now positions');
    assert.equal(added[1].widget.box, w.box, 'and the same box node');

    observer.scan();
    assert.equal(events.filter((e) => e.kind === 'add').length, 2, 'a settled wrapper is not re-reported');
  });
});
