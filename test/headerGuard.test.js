import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, firePointer } from '../testlib/dom.js';
import { createHeaderGuard } from '../src/features/movable/headerGuard.js';

function withDom(fn) {
  const dom = setupDom();
  try { return fn(dom); } finally { teardownDom(dom); }
}

/**
 * Torn's real header (live trace, 2026-09-20): the whole 270px bar is one
 * <button>, with the window icons and Chat+'s padlock beside it. Torn runs its
 * own reorder drag from a press anywhere on that bar.
 */
function build(dom) {
  const doc = dom.window.document;
  const header = doc.createElement('div');
  header.innerHTML = '<button id="handle"><span class="title">Trade</span></button>'
    + '<svg id="lock" class="chatplus-lock" data-chatplus-lock="1" aria-label="Chat+ lock"></svg>'
    + '<svg id="min" aria-label="Minimize"></svg>';
  doc.body.appendChild(header);
  return { header, handle: header.querySelector('#handle'), guard: createHeaderGuard({ header }) };
}

/** Listen where Torn's own drag listens: on an ancestor, after the header. */
function spyPresses(dom, types = ['pointerdown', 'mousedown', 'touchstart']) {
  const seen = [];
  for (const type of types) {
    dom.window.document.addEventListener(type, (event) => seen.push(event.type));
  }
  return seen;
}

/** touchstart is not a MouseEvent; a plain bubbling Event reaches the listener. */
function fireEvent(target, type) {
  const doc = target.ownerDocument || target;
  const event = new doc.defaultView.Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function fireClick(target) {
  const doc = target.ownerDocument || target;
  const event = new doc.defaultView.MouseEvent('click', { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** Stand in for Torn's own header action, listening where Torn would. */
function spyClicks(dom, header) {
  const seen = [];
  header.addEventListener('click', (e) => seen.push(`header:${e.type}`));
  dom.window.document.addEventListener('click', (e) => seen.push(`doc:${e.type}`));
  return seen;
}

test('an enabled guard keeps presses on the handle away from Torn', () => {
  withDom((dom) => {
    const t = build(dom);
    t.guard.enable();
    const seen = spyPresses(dom);

    const down = firePointer(t.handle, 'pointerdown', { clientX: 450, clientY: 620 });
    fireEvent(t.handle, 'mousedown');
    fireEvent(t.handle, 'touchstart');

    assert.deepEqual(seen, [], 'Torn\'s reorder drag never sees the press');
    assert.equal(down.defaultPrevented, false, 'focus, :active and the click must still work');
  });
});

test('a guard that was never enabled leaves every press to Torn', () => {
  withDom((dom) => {
    const t = build(dom);
    const seen = spyPresses(dom);
    firePointer(t.handle, 'pointerdown', { clientX: 450, clientY: 620 });
    fireEvent(t.handle, 'mousedown');
    fireEvent(t.handle, 'touchstart');
    assert.deepEqual(seen, ['pointerdown', 'mousedown', 'touchstart']);
  });
});

test('a press on Minimize or the padlock is kept from Torn as well', () => {
  withDom((dom) => {
    const t = build(dom);
    t.guard.enable();
    const seen = spyPresses(dom, ['pointerdown']);
    for (const sel of ['#min', '[data-chatplus-lock]']) {
      firePointer(t.header.querySelector(sel), 'pointerdown', { clientX: 450, clientY: 620 });
    }
    assert.deepEqual(seen, [], 'every press in the header can start a Chat+ drag');
  });
});

test('a right-click on the handle is left to Torn and the browser', () => {
  withDom((dom) => {
    const t = build(dom);
    t.guard.enable();
    const seen = spyPresses(dom, ['pointerdown']);
    firePointer(t.handle, 'pointerdown', { clientX: 450, clientY: 620, button: 2 });
    assert.deepEqual(seen, ['pointerdown']);
  });
});

test('disable removes the press suppressors', () => {
  withDom((dom) => {
    const t = build(dom);
    t.guard.enable();
    t.guard.disable();
    const seen = spyPresses(dom);
    firePointer(t.handle, 'pointerdown', { clientX: 450, clientY: 620 });
    fireEvent(t.handle, 'mousedown');
    fireEvent(t.handle, 'touchstart');
    assert.deepEqual(seen, ['pointerdown', 'mousedown', 'touchstart']);
  });
});

test('the click that follows a drag never reaches Torn\'s header action', () => {
  withDom((dom) => {
    const t = build(dom);
    t.guard.enable();
    t.guard.armClickSuppression();

    const seen = spyClicks(dom, t.header);
    const click = fireClick(t.header.querySelector('.title'));
    assert.deepEqual(seen, [], 'the trailing click is swallowed');
    assert.equal(click.defaultPrevented, true);
  });
});

test('only the first click after a drag is swallowed', () => {
  withDom((dom) => {
    const t = build(dom);
    t.guard.enable();
    t.guard.armClickSuppression();
    const title = t.header.querySelector('.title');
    fireClick(title); // eaten

    const seen = spyClicks(dom, t.header);
    const second = fireClick(title);
    assert.deepEqual(seen, ['header:click', 'doc:click']);
    assert.equal(second.defaultPrevented, false);
  });
});

test('a click with nothing armed still reaches Torn\'s header action', () => {
  withDom((dom) => {
    const t = build(dom);
    t.guard.enable();
    const seen = spyClicks(dom, t.header);
    for (const sel of ['.title', '#min', '[data-chatplus-lock]']) {
      const click = fireClick(t.header.querySelector(sel));
      assert.equal(click.defaultPrevented, false, `${sel} still acts on a plain click`);
    }
    assert.equal(seen.length, 6);
  });
});

test('a fresh press disarms a swallow whose click never arrived', () => {
  withDom((dom) => {
    const t = build(dom);
    t.guard.enable();
    // A drag that ends in pointercancel fires no trailing click at all.
    t.guard.armClickSuppression();

    const seen = spyClicks(dom, t.header);
    firePointer(t.handle, 'pointerdown', { clientX: 450, clientY: 620 });
    fireClick(t.header.querySelector('.title'));
    assert.deepEqual(seen, ['header:click', 'doc:click'], 'the unrelated click must pass');
  });
});

test('the touch compatibility mousedown between release and click does not disarm the swallow', () => {
  withDom((dom) => {
    const t = build(dom);
    t.guard.enable();
    t.guard.armClickSuppression();

    // On touch the browser fires mousedown after pointerup and before click.
    fireEvent(t.handle, 'mousedown');
    const click = fireClick(t.header.querySelector('#min'));
    assert.equal(click.defaultPrevented, true, 'only a new pointerdown may disarm');
  });
});

test('the swallow eats the trailing click wherever the drag ended', () => {
  withDom((dom) => {
    const t = build(dom);
    t.guard.enable();

    // A drag started on the padlock ends with the box - and the padlock - under
    // the pointer, so that is where the trailing click lands.
    const seen = spyClicks(dom, t.header);
    for (const sel of ['[data-chatplus-lock]', '#min']) {
      t.guard.armClickSuppression();
      const click = fireClick(t.header.querySelector(sel));
      assert.equal(click.defaultPrevented, true, `${sel}: the drag's own click is not an action`);
    }
    assert.deepEqual(seen, []);
  });
});

test('disable removes the click listener as well as the press ones', () => {
  withDom((dom) => {
    const t = build(dom);
    t.guard.enable();
    t.guard.armClickSuppression();
    t.guard.disable();

    const seen = spyClicks(dom, t.header);
    const click = fireClick(t.header.querySelector('.title'));
    assert.deepEqual(seen, ['header:click', 'doc:click'], 'a released header swallows nothing');
    assert.equal(click.defaultPrevented, false);
  });
});
