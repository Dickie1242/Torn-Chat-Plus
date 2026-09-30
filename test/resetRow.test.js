import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, stubRect } from '../testlib/dom.js';
import * as selectors from '../src/core/selectors.js';
import { createStorage } from '../src/core/storage.js';
import { createMenu } from '../src/core/menu.js';
import { createResetRow, LABEL_TEXT, RESET_LABEL, BUTTON_CLASS } from '../src/features/resize/resetRow.js';

async function withDom(fn) {
  const dom = setupDom();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

function rig(dom) {
  const doc = dom.window.document;
  const storage = createStorage();
  const menu = createMenu({ doc });
  const row = menu.addRow();
  const control = createResetRow({ row, menu, storage, selectors });
  const chat = makeChatWidget(doc, { id: 'chat-1' });
  // The padlock lives in the header; any element inside the box will do here.
  const padlock = doc.createElement('button');
  chat.header.appendChild(padlock);
  stubRect(padlock, { left: 10, top: 10, width: 20, height: 20 });
  const button = row.querySelector(`.${BUTTON_CLASS}`);
  const click = () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return { doc, storage, menu, row, control, chat, padlock, button, click };
}

test('the row shows a label and a Reset button', () => withDom((dom) => {
  const r = rig(dom);
  assert.equal(r.row.querySelector('.chatplus-menu__label').textContent, LABEL_TEXT);
  assert.equal(r.button.textContent, RESET_LABEL);
  assert.equal(r.button.type, 'button');
}));

test('Reset is disabled for a chat at Torn\'s size and enabled once it has one', () => withDom((dom) => {
  const r = rig(dom);
  r.menu.open(r.padlock);
  assert.equal(r.button.disabled, true);
  r.menu.close();
  r.storage.setWidget('chat-1', { height: 500 });
  r.menu.open(r.padlock);
  assert.equal(r.button.disabled, false);
  r.storage.setWidget('chat-1', { height: null });
  r.control.sync();
  assert.equal(r.button.disabled, true, 'sync follows a change while open');
  r.menu.close();
}));

test('Reset clears that chat\'s size and closes the menu', () => withDom((dom) => {
  const r = rig(dom);
  r.storage.setWidget('chat-1', { width: 400, height: 500 });
  r.storage.setWidget('chat-2', { height: 333 });
  r.menu.open(r.padlock);
  r.click();
  assert.deepEqual(r.storage.getWidget('chat-1'), { x: null, y: null, locked: true, width: null, height: null, scale: null });
  assert.equal(r.storage.getWidget('chat-2').height, 333, 'other chats untouched');
  assert.equal(r.menu.isOpen(), false);
}));

test('a click before the menu was ever opened does nothing', () => withDom((dom) => {
  const r = rig(dom);
  r.storage.setWidget('chat-1', { height: 500 });
  r.click();
  assert.equal(r.storage.getWidget('chat-1').height, 500);
}));
