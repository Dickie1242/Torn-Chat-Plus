import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, stubRect, firePointer } from '../testlib/dom.js';
import { createMenu, MENU_CLASS, MENU_ROW_CLASS } from '../src/core/menu.js';

function withDom(fn) {
  const dom = setupDom();
  try { return fn(dom); } finally { teardownDom(dom); }
}

/** A menu with one row, plus an anchor laid out like a header padlock. */
function build(dom, rect = { left: 40, top: 10, width: 24, height: 24 }) {
  const doc = dom.window.document;
  const anchor = doc.createElement('span');
  doc.body.appendChild(anchor);
  stubRect(anchor, rect);
  const menu = createMenu({ doc });
  const row = menu.addRow();
  row.appendChild(doc.createElement('button'));
  return { doc, anchor, menu, row };
}

const rendered = (doc) => doc.body.querySelector(`.${MENU_CLASS}`);

test('the menu is not in the document until it is opened', () => {
  withDom((dom) => {
    const t = build(dom);
    assert.equal(rendered(t.doc), null);
    assert.equal(t.menu.isOpen(), false);
    t.menu.open(t.anchor);
    assert.ok(rendered(t.doc), 'opening puts it in the document');
    assert.equal(t.menu.isOpen(), true);
  });
});

test('every row is handed out once, into the reused element', () => {
  withDom((dom) => {
    const t = build(dom);
    t.menu.addRow().textContent = 'second';

    t.menu.open(t.anchor);
    const first = rendered(t.doc);
    assert.equal(first.querySelectorAll(`.${MENU_ROW_CLASS}`).length, 2);

    t.menu.close();
    t.menu.open(t.anchor);
    assert.equal(rendered(t.doc), first, 'the same element is reused');
    assert.equal(first.querySelectorAll(`.${MENU_ROW_CLASS}`).length, 2, 'and rows are not rebuilt');
    assert.ok(t.row.isConnected, 'the row the caller filled lives on in it');
  });
});

test('the menu opens just below its anchor, and outside the chat box', () => {
  withDom((dom) => {
    const t = build(dom, { left: 40, top: 10, width: 24, height: 24 });
    t.menu.open(t.anchor);
    const element = rendered(t.doc);
    assert.equal(element.parentNode, t.doc.body, 'body, so no chat box can clip or drag it');
    assert.equal(element.style.left, '40px');
    assert.equal(element.style.top, '38px', 'the anchor bottom (34) plus the gap');
  });
});

test('an outside pointerdown closes the menu; one inside it does not', () => {
  withDom((dom) => {
    const t = build(dom);
    t.menu.open(t.anchor);
    const element = rendered(t.doc);

    firePointer(element.querySelector('button'), 'pointerdown');
    assert.equal(t.menu.isOpen(), true, 'using the menu must not close it');

    firePointer(t.doc.body, 'pointerdown');
    assert.equal(t.menu.isOpen(), false);
    assert.equal(rendered(t.doc), null);
  });
});

test('a press on the anchor is left to the anchor, which toggles the menu shut', () => {
  withDom((dom) => {
    const t = build(dom);
    t.menu.toggle(t.anchor);
    assert.equal(t.menu.isOpen(), true);

    // A right-click on the padlock: the press must not close the menu behind
    // the contextmenu event, or the toggle would re-open it forever.
    firePointer(t.anchor, 'pointerdown', { button: 2 });
    assert.equal(t.menu.isOpen(), true);
    t.menu.toggle(t.anchor);
    assert.equal(t.menu.isOpen(), false, 're-invoking closes it');
  });
});

test('a press inside the menu never reaches the page', () => {
  withDom((dom) => {
    const t = build(dom);
    t.menu.open(t.anchor);
    const seen = [];
    t.doc.addEventListener('pointerdown', (event) => seen.push(event.type));

    firePointer(rendered(t.doc).querySelector('button'), 'pointerdown');
    assert.deepEqual(seen, [], 'Torn must not see it, and no drag may start from it');
  });
});

test('Escape closes the menu, and other keys leave it alone', () => {
  withDom((dom) => {
    const t = build(dom);
    t.menu.open(t.anchor);
    const key = (k) => t.doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true }));

    key('a');
    assert.equal(t.menu.isOpen(), true);
    key('Escape');
    assert.equal(t.menu.isOpen(), false);
  });
});

test('a closed menu listens to nothing, and an open one listens once', () => {
  withDom((dom) => {
    const t = build(dom);
    const added = [];
    const removed = [];
    const realAdd = t.doc.addEventListener.bind(t.doc);
    const realRemove = t.doc.removeEventListener.bind(t.doc);
    t.doc.addEventListener = (type, fn, options) => { added.push(type); realAdd(type, fn, options); };
    t.doc.removeEventListener = (type, fn, options) => { removed.push(type); realRemove(type, fn, options); };

    t.menu.open(t.anchor);
    t.menu.open(t.anchor);
    assert.deepEqual(added.slice().sort(), ['keydown', 'pointerdown'], 'opening twice arms one set');
    t.menu.close();
    t.menu.close();
    assert.deepEqual(removed.slice().sort(), added.slice().sort(), 'and closing gives them all back');
  });
});

/** jsdom measures nothing: open once to reach the element, then give it a size. */
function measure(t, size) {
  t.menu.open(t.anchor);
  stubRect(rendered(t.doc), size);
  t.menu.close();
}

test('with room under the anchor the menu still opens below it', () => {
  withDom((dom) => {
    const t = build(dom, { left: 40, top: 100, width: 24, height: 24 });
    measure(t, { width: 160, height: 80 });

    t.menu.open(t.anchor);
    assert.equal(rendered(t.doc).style.top, '128px', 'the anchor bottom (124) plus the gap');
  });
});

test('a padlock with no room under it opens the menu above, not off the screen', () => {
  withDom((dom) => {
    // A chat collapsed onto Torn's bottom bar: its padlock is at the very edge.
    const t = build(dom, { left: 990, top: 700, width: 24, height: 24 });
    dom.window.innerWidth = 1000;
    dom.window.innerHeight = 768;
    measure(t, { width: 160, height: 80 });

    t.menu.open(t.anchor);
    const element = rendered(t.doc);
    assert.equal(element.style.top, '616px', 'the anchor top (700) less the gap and the menu height');
    assert.equal(element.style.left, '836px', 'and X is still clamped into the viewport');
  });
});

test('a menu detached by someone else still gives its listeners back', () => {
  withDom((dom) => {
    const t = build(dom);
    const live = new Set();
    const realAdd = t.doc.addEventListener.bind(t.doc);
    const realRemove = t.doc.removeEventListener.bind(t.doc);
    t.doc.addEventListener = (type, fn, options) => { live.add(type); realAdd(type, fn, options); };
    t.doc.removeEventListener = (type, fn, options) => { live.delete(type); realRemove(type, fn, options); };

    t.menu.open(t.anchor);
    const element = rendered(t.doc);
    // Torn re-renders the page and the menu element goes with it.
    element.remove();
    t.menu.close();
    assert.deepEqual([...live], [], 'nothing of ours is left listening on the document');

    // And no stale handler is still treating presses as the menu's business.
    t.doc.body.appendChild(element);
    firePointer(t.doc.body, 'pointerdown');
    assert.ok(element.isConnected, 'a closed menu does not react to a press outside it');
  });
});

test('onOpen tells listeners which anchor opened the menu, until unsubscribed', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const menu = createMenu({ doc });
    const a = doc.createElement('button');
    const b = doc.createElement('button');
    doc.body.append(a, b);
    stubRect(a, { left: 10, top: 10, width: 20, height: 20 });
    stubRect(b, { left: 50, top: 10, width: 20, height: 20 });

    const seen = [];
    const off = menu.onOpen((anchor) => seen.push(anchor));
    menu.open(a);
    menu.open(b); // re-anchored while open: listeners hear the new anchor
    menu.close();
    assert.deepEqual(seen, [a, b], 'once per open, never on close');

    off();
    menu.toggle(a);
    assert.deepEqual(seen, [a, b], 'an unsubscribed listener is silent');
    menu.close();
  });
});
