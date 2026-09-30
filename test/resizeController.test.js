import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, stubRect, firePointer } from '../testlib/dom.js';
import { createResizeController, BODY_ATTR } from '../src/features/resize/resizeController.js';
import { mountHandles, HANDLE_ATTR, ACTIVE_CLASS } from '../src/features/resize/handles.js';

async function withDom(fn) {
  const dom = setupDom();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

/** A chat with handles wired to a controller that records what it is told. */
function rig(dom, {
  floating = false,
  directions = ['n', 's', 'se'],
  rect = { left: 100, top: 300, width: 270, height: 400 },
} = {}) {
  const doc = dom.window.document;
  const chat = makeChatWidget(doc, { id: 'chat-1' });
  stubRect(chat.box, rect);
  const calls = { resize: [], commit: [], commitStart: [], cancel: [] };
  const state = { box: chat.box };
  const controller = createResizeController({
    doc,
    getBox: () => state.box,
    getViewport: () => ({ width: 1024, height: 768 }),
    onResize: (size) => calls.resize.push(size),
    onCommit: (size, start) => { calls.commit.push(size); calls.commitStart.push(start); },
    onCancel: () => calls.cancel.push(true),
  });
  mountHandles(chat.box, directions, (direction, event) => controller.start(direction, event, { floating }));
  const handle = (dir) => chat.box.querySelector(`[${HANDLE_ATTR}="${dir}"]`);
  return { doc, chat, state, controller, calls, handle };
}

test('a press on a handle is kept from everyone else and starts a gesture', () => withDom((dom) => {
  const r = rig(dom);
  let reachedBody = false;
  r.doc.body.addEventListener('pointerdown', () => { reachedBody = true; });
  const event = firePointer(r.handle('n'), 'pointerdown', { clientX: 150, clientY: 300 });
  assert.equal(reachedBody, false, 'propagation stopped');
  assert.equal(event.defaultPrevented, true, 'no text selection, no Torn drag');
  assert.ok(r.controller.isActive());
  assert.equal(r.doc.body.getAttribute(BODY_ATTR), 'n');
  assert.ok(r.handle('n').classList.contains(ACTIVE_CLASS));
}));

test('moving resizes live and releasing commits once, then everything is cleaned up', () => withDom((dom) => {
  const r = rig(dom);
  firePointer(r.handle('n'), 'pointerdown', { clientX: 150, clientY: 300 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 280 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 240 });
  assert.deepEqual(r.calls.resize, [
    { width: 270, height: 420, shiftX: 0, shiftY: 0 },
    { width: 270, height: 460, shiftX: 0, shiftY: 0 },
  ]);
  assert.deepEqual(r.controller.liveSize(), { width: 270, height: 460, shiftX: 0, shiftY: 0 });
  firePointer(r.doc, 'pointerup', { clientX: 150, clientY: 240 });
  assert.deepEqual(r.calls.commit, [{ width: 270, height: 460, shiftX: 0, shiftY: 0 }]);
  assert.deepEqual(r.calls.commitStart, [{ left: 100, top: 300, width: 270, height: 400 }],
    'the box rect at the press comes with it, so the feature can see what changed');
  assert.equal(r.controller.isActive(), false);
  assert.equal(r.controller.liveSize(), null);
  assert.equal(r.doc.body.hasAttribute(BODY_ATTR), false);
  assert.ok(!r.handle('n').classList.contains(ACTIVE_CLASS));
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 100 });
  assert.equal(r.calls.resize.length, 2, 'listeners are gone');
}));

test('a floating chat dragged up from its top edge reports how far the top moved', () => withDom((dom) => {
  const r = rig(dom, { floating: true });
  firePointer(r.handle('n'), 'pointerdown', { clientX: 150, clientY: 300 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 240 });
  assert.deepEqual(r.calls.resize.at(-1), { width: 270, height: 460, shiftX: 0, shiftY: 60 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: -500 });
  assert.deepEqual(r.calls.resize.at(-1), { width: 270, height: 700, shiftX: 0, shiftY: 300 }, 'stops at the top of the screen');
}));

test('the corner of a floating chat grows right and down, clamped to the viewport', () => withDom((dom) => {
  const r = rig(dom, { floating: true });
  firePointer(r.handle('se'), 'pointerdown', { clientX: 370, clientY: 700 });
  firePointer(r.doc, 'pointermove', { clientX: 400, clientY: 720 });
  assert.deepEqual(r.calls.resize.at(-1), { width: 300, height: 420, shiftX: 0, shiftY: 0 });
  firePointer(r.doc, 'pointermove', { clientX: 2000, clientY: 2000 });
  assert.deepEqual(r.calls.resize.at(-1), { width: 1024 - 100, height: 768 - 300, shiftX: 0, shiftY: 0 });
}));

test('the top-left corner of a floating chat reports both shifts; on a docked chat neither', () => withDom((dom) => {
  const f = rig(dom, { floating: true, directions: ['nw'] });
  firePointer(f.handle('nw'), 'pointerdown', { clientX: 100, clientY: 300 });
  firePointer(f.doc, 'pointermove', { clientX: 70, clientY: 240 });
  assert.deepEqual(f.calls.resize.at(-1), { width: 300, height: 460, shiftX: 30, shiftY: 60 });
  firePointer(f.doc, 'pointermove', { clientX: -500, clientY: 240 });
  assert.equal(f.calls.resize.at(-1).width, 100 + 270, 'stops at the left edge of the screen');
  assert.equal(f.calls.resize.at(-1).shiftX, 100);

  const d = rig(dom, { floating: false, directions: ['nw'] });
  firePointer(d.handle('nw'), 'pointerdown', { clientX: 100, clientY: 300 });
  firePointer(d.doc, 'pointermove', { clientX: 70, clientY: 240 });
  assert.deepEqual(d.calls.resize.at(-1), { width: 300, height: 460, shiftX: 0, shiftY: 0 });
}));

test('no commit without a change, on cancel, or from another button', () => withDom((dom) => {
  const r = rig(dom);
  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700 });
  firePointer(r.doc, 'pointerup', { clientX: 150, clientY: 700 });
  assert.deepEqual(r.calls.commit, [], 'press and release: nothing');

  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 740 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 700 });
  firePointer(r.doc, 'pointerup', { clientX: 150, clientY: 700 });
  assert.deepEqual(r.calls.commit, [], 'back where it started: nothing');

  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 740 });
  firePointer(r.doc, 'pointercancel', { clientX: 150, clientY: 740 });
  assert.deepEqual(r.calls.commit, [], 'cancelled: nothing');
  assert.equal(r.controller.isActive(), false);

  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700, button: 2 });
  assert.equal(r.controller.isActive(), false, 'right button: ignored');
}));

test('a cancelled gesture tells the feature once, and never commits', () => withDom((dom) => {
  const r = rig(dom);
  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 740 });
  firePointer(r.doc, 'pointercancel', { clientX: 150, clientY: 740 });
  assert.deepEqual(r.calls.cancel, [true]);
  assert.deepEqual(r.calls.commit, []);
  firePointer(r.doc, 'pointercancel', { clientX: 150, clientY: 740 });
  assert.equal(r.calls.cancel.length, 1, 'only for the gesture that was live');
}));

test('the gesture carries on when Torn swaps the box under it', () => withDom((dom) => {
  const r = rig(dom);
  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700 });
  const replacement = makeChatWidget(r.doc, { id: 'chat-1' });
  r.chat.wrapper.remove();
  r.state.box = replacement.box;
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 740 });
  assert.deepEqual(r.calls.resize.at(-1), { width: 270, height: 440, shiftX: 0, shiftY: 0 });
  firePointer(r.doc, 'pointerup', { clientX: 150, clientY: 740 });
  assert.equal(r.calls.commit.length, 1);
}));

test('a gesture whose box leaves the DOM ends without committing', () => withDom((dom) => {
  const r = rig(dom);
  firePointer(r.handle('s'), 'pointerdown', { clientX: 150, clientY: 700 });
  r.chat.wrapper.remove();
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 740 });
  assert.equal(r.controller.isActive(), false);
  firePointer(r.doc, 'pointerup', { clientX: 150, clientY: 740 });
  assert.deepEqual(r.calls.commit, []);
}));

test('a box measured in fractions of a pixel still shifts by a whole one', () => withDom((dom) => {
  const r = rig(dom, { floating: true, rect: { left: 100, top: 300, width: 270, height: 400.4 } });
  firePointer(r.handle('n'), 'pointerdown', { clientX: 150, clientY: 300 });
  firePointer(r.doc, 'pointermove', { clientX: 150, clientY: 240 });
  // The height is rounded, so the shift must be measured against the rounded
  // height too - else the chat is committed half a pixel off.
  assert.deepEqual(r.calls.resize.at(-1), { width: 270, height: 460, shiftX: 0, shiftY: 60 });
}));
