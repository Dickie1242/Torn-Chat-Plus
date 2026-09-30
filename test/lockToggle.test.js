import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget } from '../testlib/dom.js';
import * as selectors from '../src/core/selectors.js';
import {
  LOCK_CLASS, LOCK_ATTR, UNLOCKED_CLASS,
  SHACKLE_LOCKED, SHACKLE_UNLOCKED, TITLE_LOCKED, TITLE_UNLOCKED,
  createLockToggle,
} from '../src/features/movable/lockToggle.js';

function withDom(fn) {
  const dom = setupDom();
  try { return fn(dom); } finally { teardownDom(dom); }
}

function build(dom, options = {}) {
  const w = makeChatWidget(dom.window.document, { id: 'chat-a', ...options.widget });
  const widget = { id: 'chat-a', box: w.box, wrapper: w.wrapper, header: w.header };
  const events = [];
  let locked = options.locked === undefined ? true : options.locked;
  const toggle = createLockToggle({
    widget,
    selectors,
    isLocked: () => locked,
    onToggle: (next) => { locked = next; events.push(['toggle', next]); },
    onMenu: (element) => { events.push(['menu', element]); },
  });
  return { w, widget, toggle, events, setLocked: (v) => { locked = v; } };
}

test('mount inserts the padlock immediately before the Minimize button', () => {
  withDom((dom) => {
    const t = build(dom);
    const element = t.toggle.mount();
    const minimize = selectors.minimizeButtonOf(t.widget.box);
    assert.equal(minimize.previousElementSibling, element);
    assert.equal(element.getAttribute('aria-label'), 'Chat+ lock');
    assert.equal(element.getAttribute(LOCK_ATTR), '1');
    assert.equal(element.getAttribute('width'), '24');
    assert.equal(element.getAttribute('height'), '24');
    assert.ok(element.classList.contains(LOCK_CLASS));
  });
});

test('the locked state shows a closed shackle and the locked title', () => {
  withDom((dom) => {
    const t = build(dom, { locked: true });
    const element = t.toggle.mount();
    assert.equal(element.getAttribute('title'), TITLE_LOCKED);
    assert.equal(element.querySelector('title').textContent, TITLE_LOCKED);
    assert.equal(element.getAttribute('aria-pressed'), 'true');
    assert.equal(element.querySelector('path').getAttribute('d'), SHACKLE_LOCKED);
    assert.ok(!element.classList.contains(UNLOCKED_CLASS));
    assert.equal(TITLE_LOCKED, 'Locked — click to unlock and drag by the header. Right-click for Chat+ settings.');
  });
});

test('sync swaps to the open shackle and the unlocked title', () => {
  withDom((dom) => {
    const t = build(dom, { locked: true });
    const element = t.toggle.mount();
    t.setLocked(false);
    t.toggle.sync();
    assert.equal(element.getAttribute('title'), TITLE_UNLOCKED);
    assert.equal(element.querySelector('title').textContent, TITLE_UNLOCKED);
    assert.equal(element.getAttribute('aria-pressed'), 'false');
    assert.equal(element.querySelector('path').getAttribute('d'), SHACKLE_UNLOCKED);
    assert.ok(element.classList.contains(UNLOCKED_CLASS));
    assert.notEqual(SHACKLE_LOCKED, SHACKLE_UNLOCKED);
  });
});

test('click toggles the lock and does not reach Torn handlers', () => {
  withDom((dom) => {
    const t = build(dom, { locked: true });
    const element = t.toggle.mount();
    let bubbled = 0;
    t.widget.header.addEventListener('click', () => { bubbled += 1; });

    const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);

    assert.deepEqual(t.events, [['toggle', false]]);
    assert.equal(event.defaultPrevented, true);
    assert.equal(bubbled, 0, 'the click must not propagate to Torn');

    element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.deepEqual(t.events, [['toggle', false], ['toggle', true]]);
  });
});

test('right-click opens the Chat+ menu on the padlock, instead of the browser one', () => {
  withDom((dom) => {
    const t = build(dom, { locked: false });
    const element = t.toggle.mount();
    let bubbled = 0;
    t.widget.header.addEventListener('contextmenu', () => { bubbled += 1; });

    const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);

    assert.deepEqual(t.events, [['menu', element]], 'the padlock is the anchor');
    assert.equal(event.defaultPrevented, true);
    assert.equal(bubbled, 0, 'and Torn never sees it');
    assert.match(TITLE_UNLOCKED, /Right-click for Chat\+ settings\.$/);
  });
});

test('mounting twice never duplicates the padlock', () => {
  withDom((dom) => {
    const t = build(dom);
    const first = t.toggle.mount();
    const second = t.toggle.mount();
    assert.equal(first, second);
    assert.equal(t.widget.box.querySelectorAll(`[${LOCK_ATTR}]`).length, 1);
  });
});

test('mount replaces a stale padlock left behind by a Torn re-render', () => {
  withDom((dom) => {
    const t = build(dom);
    const first = t.toggle.mount();
    // Torn rebuilds the header subtree but our detached instance still points at the old node.
    first.remove();
    const stale = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    stale.setAttribute(LOCK_ATTR, '1');
    const minimize = selectors.minimizeButtonOf(t.widget.box);
    minimize.parentNode.insertBefore(stale, minimize);

    const remounted = t.toggle.mount();
    assert.equal(t.widget.box.querySelectorAll(`[${LOCK_ATTR}]`).length, 1);
    assert.equal(selectors.minimizeButtonOf(t.widget.box).previousElementSibling, remounted);
  });
});

test('unmount removes the padlock and mount returns null without a Minimize button', () => {
  withDom((dom) => {
    const t = build(dom);
    t.toggle.mount();
    t.toggle.unmount();
    assert.equal(t.widget.box.querySelectorAll(`[${LOCK_ATTR}]`).length, 0);

    selectors.minimizeButtonOf(t.widget.box).remove();
    assert.equal(t.toggle.mount(), null);
  });
});
