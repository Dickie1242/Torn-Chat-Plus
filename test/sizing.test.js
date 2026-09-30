import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom } from '../testlib/dom.js';
import { WIDGET_SIZE } from '../src/core/storage.js';
import {
  nextSize, limitsFor, applySize, SIZED_CLASS, NATIVE_ATTR_PREFIX,
} from '../src/features/resize/sizing.js';

const start = { left: 100, top: 300, width: 270, height: 400 };
const viewport = { width: 1024, height: 768 };
const wide = { minWidth: 200, maxWidth: 900, minHeight: 150, maxHeight: 700 };

test('nextSize: each edge moves its own dimension, a corner moves two', () => {
  assert.deepEqual(nextSize({ direction: 's', start, dx: 5, dy: 50, limits: wide }), { width: 270, height: 450 });
  assert.deepEqual(nextSize({ direction: 'n', start, dx: 5, dy: -50, limits: wide }), { width: 270, height: 450 });
  assert.deepEqual(nextSize({ direction: 'e', start, dx: 30, dy: 50, limits: wide }), { width: 300, height: 400 });
  assert.deepEqual(nextSize({ direction: 'se', start, dx: 30, dy: 50, limits: wide }), { width: 300, height: 450 });
});

test('nextSize: the left edge grows leftward, and the top-left corner moves both', () => {
  assert.deepEqual(nextSize({ direction: 'w', start, dx: -30, dy: 50, limits: wide }), { width: 300, height: 400 });
  assert.deepEqual(nextSize({ direction: 'nw', start, dx: -30, dy: -50, limits: wide }), { width: 300, height: 450 });
});

test('nextSize: clamps into the limits and rounds', () => {
  assert.deepEqual(nextSize({ direction: 'se', start, dx: -500, dy: -500, limits: wide }), { width: 200, height: 150 });
  assert.deepEqual(nextSize({ direction: 'se', start, dx: 5000, dy: 5000, limits: wide }), { width: 900, height: 700 });
  assert.deepEqual(nextSize({ direction: 's', start, dx: 0, dy: 10.4, limits: wide }), { width: 270, height: 410 });
});

test('limitsFor: a docked chat may grow up to the viewport height and keeps its width', () => {
  assert.deepEqual(limitsFor({ direction: 'n', start, floating: false, viewport }), {
    minWidth: WIDGET_SIZE.minWidth, maxWidth: 270,
    minHeight: WIDGET_SIZE.minHeight, maxHeight: 768,
  });
});

test('limitsFor: a floating chat stops at the viewport edges', () => {
  const s = limitsFor({ direction: 's', start, floating: true, viewport });
  assert.equal(s.maxHeight, 768 - 300, 'down to the bottom of the screen');
  assert.equal(s.maxWidth, 1024 - 100, 'right to the edge of the screen');
  const n = limitsFor({ direction: 'n', start, floating: true, viewport });
  assert.equal(n.maxHeight, 300 + 400, 'up to the top of the screen');
});

test("limitsFor: from the left edge a chat may grow to the screen's left edge, docked or floating", () => {
  assert.equal(limitsFor({ direction: 'nw', start, floating: false, viewport }).maxWidth, 100 + 270);
  assert.equal(limitsFor({ direction: 'nw', start, floating: true, viewport }).maxWidth, 100 + 270);
  assert.equal(limitsFor({ direction: 'nw', start, floating: true, viewport }).maxHeight, 300 + 400, 'n rule still applies');
});

test('limitsFor: a maximum never drops below the minimum', () => {
  const tiny = limitsFor({ direction: 's', start: { ...start, top: 700 }, floating: true, viewport });
  assert.equal(tiny.maxHeight, WIDGET_SIZE.minHeight);
});

test('applySize writes the size inline with !important, and null hands it back to Torn', () => {
  const dom = setupDom();
  try {
    const box = dom.window.document.createElement('div');
    applySize(box, { width: 300, height: 450 });
    assert.equal(box.style.getPropertyValue('width'), '300px');
    assert.equal(box.style.getPropertyPriority('height'), 'important');
    assert.ok(box.classList.contains(SIZED_CLASS));

    applySize(box, { width: null, height: 450 });
    assert.equal(box.style.getPropertyValue('width'), '', 'width is Torn\'s again');
    assert.equal(box.style.getPropertyValue('height'), '450px');
    assert.ok(box.classList.contains(SIZED_CLASS), 'still sized in one dimension');

    applySize(box, { width: null, height: null });
    assert.equal(box.getAttribute('style') || '', '');
    assert.ok(!box.classList.contains(SIZED_CLASS));
  } finally {
    teardownDom(dom);
  }
});

/** A chat box as Torn renders it since 2026-09-30: its own size inline, not !important. */
function tornBox(dom) {
  const box = dom.window.document.createElement('div');
  box.setAttribute('style', 'width: 300px; height: 400px;');
  return box;
}

/** Counts every write to the box's inline style. */
function countWrites(box) {
  const counter = { writes: 0 };
  for (const name of ['setProperty', 'removeProperty']) {
    const original = box.style[name].bind(box.style);
    box.style[name] = (...args) => { counter.writes += 1; return original(...args); };
  }
  return counter;
}

const memoAttrs = (box) => box.getAttributeNames().filter((name) => name.startsWith(NATIVE_ATTR_PREFIX));

test('with no size of its own Chat+ leaves the size Torn put on the box alone', () => {
  const dom = setupDom();
  try {
    const box = tornBox(dom);
    const counter = countWrites(box);
    applySize(box, { width: null, height: null });
    assert.equal(counter.writes, 0);
    assert.equal(box.getAttribute('style'), 'width: 300px; height: 400px;');
    assert.ok(!box.classList.contains(SIZED_CLASS));

    applySize(box, { width: null, height: 450 });
    assert.equal(box.style.getPropertyValue('width'), '300px', 'the dimension Chat+ does not size stays Torn\'s');
    assert.equal(box.style.getPropertyPriority('width'), '');
  } finally {
    teardownDom(dom);
  }
});

test('sizing a chat and then handing it back restores the size Torn had put on it', () => {
  const dom = setupDom();
  try {
    const box = tornBox(dom);
    applySize(box, { width: 450, height: null });
    assert.equal(box.style.getPropertyValue('width'), '450px');
    assert.equal(box.style.getPropertyPriority('width'), 'important');
    applySize(box, { width: 460, height: 500 });

    applySize(box, { width: null, height: null });
    assert.equal(box.style.getPropertyValue('width'), '300px', 'Torn\'s own width, not none at all');
    assert.equal(box.style.getPropertyPriority('width'), '', 'and Torn\'s again: not !important');
    assert.equal(box.style.getPropertyValue('height'), '400px');
    assert.equal(box.style.getPropertyPriority('height'), '');
    assert.deepEqual(memoAttrs(box), [], 'nothing of ours is left on the box');
    assert.ok(!box.classList.contains(SIZED_CLASS));
  } finally {
    teardownDom(dom);
  }
});

test('an unchanged size over Torn\'s is not rewritten, and Torn\'s value is still kept', () => {
  const dom = setupDom();
  try {
    const box = tornBox(dom);
    applySize(box, { width: 450, height: 500 });
    const counter = countWrites(box);
    applySize(box, { width: 450, height: 500 });
    assert.equal(counter.writes, 0);
    applySize(box, { width: null, height: null });
    assert.equal(box.getAttribute('style'), 'width: 300px; height: 400px;');
  } finally {
    teardownDom(dom);
  }
});

test('a size Torn writes over ours is Torn\'s, and is the one a reset keeps', () => {
  const dom = setupDom();
  try {
    const box = tornBox(dom);
    applySize(box, { width: 450, height: null });
    // React re-renders the box with a new width of its own. In a browser its
    // `style.width = ...` drops the priority; jsdom keeps it, so say it outright.
    box.style.setProperty('width', '320px', '');
    applySize(box, { width: null, height: null });
    assert.equal(box.style.getPropertyValue('width'), '320px');
    assert.deepEqual(memoAttrs(box), [], 'the width remembered from before is dropped');

    applySize(box, { width: 450, height: null });
    box.style.setProperty('width', '330px', '');
    applySize(box, { width: 450, height: null });
    applySize(box, { width: null, height: null });
    assert.equal(box.style.getPropertyValue('width'), '330px', 'the latest of Torn\'s widths comes back');
  } finally {
    teardownDom(dom);
  }
});

test('applySize writes nothing that is already there', () => {
  const dom = setupDom();
  try {
    const box = dom.window.document.createElement('div');
    applySize(box, { width: 300, height: 450 });
    let writes = 0;
    const original = box.style.setProperty.bind(box.style);
    box.style.setProperty = (...args) => { writes += 1; return original(...args); };
    applySize(box, { width: 300, height: 450 });
    assert.equal(writes, 0);
  } finally {
    teardownDom(dom);
  }
});
