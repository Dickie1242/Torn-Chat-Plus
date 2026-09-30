import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom } from '../testlib/dom.js';
import { createStorage } from '../src/core/storage.js';
import { createResetControl, RESET_LABEL, BUTTON_CLASS } from '../src/features/resize/resetControl.js';

async function withDom(fn) {
  const dom = setupDom();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

test('the button follows the chat\'s record and resets it on click', () => withDom((dom) => {
  const storage = createStorage();
  const resets = [];
  const control = createResetControl({ storage, getChatId: () => 'chat-1', onReset: () => resets.push(1) });
  assert.equal(control.element.tagName, 'BUTTON');
  assert.equal(control.element.type, 'button');
  assert.equal(control.element.textContent, RESET_LABEL);
  assert.ok(control.element.classList.contains(BUTTON_CLASS));
  control.sync();
  assert.equal(control.element.disabled, true);
  storage.setWidget('chat-1', { width: 400 });
  control.sync();
  assert.equal(control.element.disabled, false);
  control.element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.deepEqual([storage.getWidget('chat-1').width, storage.getWidget('chat-1').height], [null, null]);
  assert.equal(resets.length, 1);
}));

test('no chat, no write', () => withDom((dom) => {
  const storage = createStorage();
  storage.setWidget('chat-1', { width: 400 });
  const control = createResetControl({ storage, getChatId: () => null });
  control.sync();
  assert.equal(control.element.disabled, true);
  control.element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(storage.getWidget('chat-1').width, 400);
}));
