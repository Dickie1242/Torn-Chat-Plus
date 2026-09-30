import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget } from '../testlib/dom.js';
import { LOCK_ATTR } from '../src/features/movable/lockToggle.js';
import {
  RESET_CLASS, RESET_LABEL, RESET_TITLE, createResetButton,
} from '../src/features/movable/resetButton.js';

function withDom(fn) {
  const dom = setupDom();
  try { return fn(dom); } finally { teardownDom(dom); }
}

/** A header Chat+ has already put its padlock in, as the feature mounts it. */
function build(dom, { padlock = true } = {}) {
  const w = makeChatWidget(dom.window.document, {
    id: 'chat-a',
    extraHeaderHtml: padlock
      ? `<svg ${LOCK_ATTR}="1" class="chatplus-lock" aria-label="Chat+ lock"></svg>`
      : '',
  });
  const widget = { id: 'chat-a', box: w.box, wrapper: w.wrapper, header: w.header };
  const resets = [];
  const button = createResetButton({ widget, onReset: () => resets.push('reset') });
  return { w, widget, button, resets };
}

const rendered = (box) => box.querySelectorAll(`.${RESET_CLASS}`);

test('sync(false) renders nothing: a widget in Torn\'s row has nothing to undo', () => {
  withDom((dom) => {
    const t = build(dom);
    assert.equal(t.button.sync(false), null);
    assert.equal(rendered(t.widget.box).length, 0);
  });
});

test('sync(true) inserts a 24x24 arrow immediately before the padlock', () => {
  withDom((dom) => {
    const t = build(dom);
    const element = t.button.sync(true);
    assert.ok(element);
    assert.equal(element.nextElementSibling.getAttribute(LOCK_ATTR), '1');
    assert.equal(element.getAttribute('aria-label'), RESET_LABEL);
    assert.equal(element.getAttribute('title'), RESET_TITLE);
    assert.equal(element.querySelector('title').textContent, RESET_TITLE);
    assert.equal(element.getAttribute('width'), '24');
    assert.equal(element.getAttribute('height'), '24');
    assert.ok(element.classList.contains(RESET_CLASS));
    assert.equal(RESET_LABEL, 'Chat+ return to row');
    assert.equal(RESET_TITLE, "Return this chat to Torn's row");
  });
});

test('without a padlock there is nothing to mount against, so nothing renders', () => {
  withDom((dom) => {
    // No padlock means the header had no Minimize button for the padlock to
    // mount against either, so the arrow has nowhere to go.
    const t = build(dom, { padlock: false });
    assert.equal(t.button.sync(true), null);
    assert.equal(rendered(t.widget.box).length, 0);
  });
});

test('syncing true twice never duplicates the arrow', () => {
  withDom((dom) => {
    const t = build(dom);
    const first = t.button.sync(true);
    assert.equal(t.button.sync(true), first);
    assert.equal(rendered(t.widget.box).length, 1);
  });
});

test('a stale arrow left behind by a Torn re-render is replaced, not joined', () => {
  withDom((dom) => {
    const t = build(dom);
    const first = t.button.sync(true);
    first.remove();
    const stale = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    stale.classList.add(RESET_CLASS);
    t.widget.header.appendChild(stale);

    t.button.sync(false);
    t.button.sync(true);
    assert.equal(rendered(t.widget.box).length, 1);
  });
});

test('clicking the arrow resets the position and does not reach Torn', () => {
  withDom((dom) => {
    const t = build(dom);
    const element = t.button.sync(true);
    let bubbled = 0;
    t.widget.header.addEventListener('click', () => { bubbled += 1; });

    const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);

    assert.deepEqual(t.resets, ['reset']);
    assert.equal(event.defaultPrevented, true);
    assert.equal(bubbled, 0, 'the click must not propagate to Torn');
  });
});

test('sync(false) takes the arrow back out, and unmount is idempotent', () => {
  withDom((dom) => {
    const t = build(dom);
    t.button.sync(true);
    t.button.sync(false);
    assert.equal(rendered(t.widget.box).length, 0);
    t.button.unmount();
    assert.equal(rendered(t.widget.box).length, 0);
  });
});
