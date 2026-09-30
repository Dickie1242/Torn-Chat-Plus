import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, firePointer } from '../testlib/dom.js';
import {
  directionsFor, mountHandles, unmountHandles, mountedDirections,
  HANDLE_ATTR, HANDLE_CLASS, RESIZABLE_CLASS,
} from '../src/features/resize/handles.js';

async function withDom(fn) {
  const dom = setupDom();
  try { return await fn(dom); } finally { teardownDom(dom); }
}

test('directionsFor: none while locked, top edge and corner when docked, plus bottom and corner when floating', () => {
  assert.deepEqual(directionsFor({ locked: true, floating: false }), []);
  assert.deepEqual(directionsFor({ locked: true, floating: true }), []);
  assert.deepEqual(directionsFor({ locked: false, floating: false }), ['n', 'nw']);
  assert.deepEqual(directionsFor({ locked: false, floating: true }), ['n', 'nw', 's', 'se']);
});

test('mountHandles puts one marked, classed handle per direction on the box', () => withDom((dom) => {
  const doc = dom.window.document;
  const { box } = makeChatWidget(doc);
  mountHandles(box, ['n', 'se'], () => {});
  const handles = [...box.children].filter((el) => el.hasAttribute(HANDLE_ATTR));
  assert.deepEqual(handles.map((el) => el.getAttribute(HANDLE_ATTR)), ['n', 'se']);
  assert.ok(handles[1].classList.contains(HANDLE_CLASS));
  assert.ok(handles[1].classList.contains(`${HANDLE_CLASS}--se`));
  assert.ok(box.classList.contains(RESIZABLE_CLASS));
  assert.deepEqual(mountedDirections(box), ['n', 'se']);
}));

test('mountHandles is a no-op for the same set and rebuilds for a different one', () => withDom((dom) => {
  const doc = dom.window.document;
  const { box } = makeChatWidget(doc);
  mountHandles(box, ['n'], () => {});
  const first = box.querySelector(`[${HANDLE_ATTR}]`);
  mountHandles(box, ['n'], () => {});
  assert.equal(box.querySelector(`[${HANDLE_ATTR}]`), first, 'same element kept');
  mountHandles(box, ['n', 's', 'se'], () => {});
  assert.deepEqual(mountedDirections(box), ['n', 's', 'se']);
  assert.notEqual(box.querySelector(`[${HANDLE_ATTR}]`), first, 'rebuilt');
  mountHandles(box, [], () => {});
  assert.deepEqual(mountedDirections(box), []);
  assert.ok(!box.classList.contains(RESIZABLE_CLASS));
}));

test('a press on a handle reports its direction and the event', () => withDom((dom) => {
  const doc = dom.window.document;
  const { box } = makeChatWidget(doc);
  const presses = [];
  mountHandles(box, ['n', 's'], (direction, event) => presses.push([direction, event.type]));
  const south = box.querySelector(`[${HANDLE_ATTR}="s"]`);
  firePointer(south, 'pointerdown', { clientX: 5, clientY: 5 });
  assert.deepEqual(presses, [['s', 'pointerdown']]);
}));

test('unmountHandles removes every handle and the resizable class', () => withDom((dom) => {
  const doc = dom.window.document;
  const { box, header, body } = makeChatWidget(doc);
  mountHandles(box, ['n', 's', 'se'], () => {});
  unmountHandles(box);
  assert.deepEqual([...box.children], [header, body], 'Torn\'s children untouched');
  assert.ok(!box.classList.contains(RESIZABLE_CLASS));
}));
