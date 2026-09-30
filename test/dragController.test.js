import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget, stubRect, firePointer } from '../testlib/dom.js';
import { minimizeButtonOf } from '../src/core/selectors.js';
import {
  DRAG_THRESHOLD_PX, DRAGGABLE_CLASS, DRAGGING_CLASS, GRABBING_CLASS,
  createDragController,
} from '../src/features/movable/dragController.js';

const VIEWPORT = { width: 1000, height: 800 };

function withDom(fn) {
  const dom = setupDom();
  try { return fn(dom); } finally { teardownDom(dom); }
}

function build(dom, options = {}) {
  const w = makeChatWidget(dom.window.document, {
    id: 'chat-a',
    extraHeaderHtml: options.extraHeaderHtml || '',
  });
  stubRect(w.wrapper, { left: 400, top: 600, width: 200, height: 120 });
  const widget = { id: 'chat-a', box: w.box, wrapper: w.wrapper, header: w.header };
  const moves = [];
  const commits = [];
  const controller = createDragController({
    isLocked: options.isLocked,
    widget,
    getViewport: () => VIEWPORT,
    onMove: (x, y) => moves.push([x, y]),
    onCommit: (x, y) => commits.push([x, y]),
  });
  return { dom, w, widget, controller, moves, commits };
}

test('the threshold is 4px and nothing is draggable until enable() is called', () => {
  withDom((dom) => {
    assert.equal(DRAG_THRESHOLD_PX, 4);
    const t = build(dom);
    assert.ok(!t.widget.header.classList.contains(DRAGGABLE_CLASS));
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 500, clientY: 650 });
    firePointer(dom.window.document, 'pointerup', { clientX: 500, clientY: 650 });
    assert.deepEqual(t.moves, []);
    assert.deepEqual(t.commits, []);
  });
});

test('enable marks the header draggable; disable removes the marker', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    assert.ok(t.widget.header.classList.contains(DRAGGABLE_CLASS));
    t.controller.disable();
    assert.ok(!t.widget.header.classList.contains(DRAGGABLE_CLASS));
  });
});

test('movement of 4px or less is a click, not a drag', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 452, clientY: 622 });
    assert.deepEqual(t.moves, []);
    assert.equal(t.controller.livePosition(), null);
    firePointer(dom.window.document, 'pointerup', { clientX: 452, clientY: 622 });
    assert.deepEqual(t.commits, [], 'a click must not persist a position');
  });
});

test('movement beyond the threshold drags from the wrapper top-left', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 452, clientY: 622 }); // below threshold
    firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630 }); // +10, +10
    assert.deepEqual(t.moves, [[410, 610]]);
    assert.deepEqual(t.controller.livePosition(), { x: 410, y: 610 });
    assert.ok(t.widget.wrapper.classList.contains(DRAGGING_CLASS));
    assert.ok(dom.window.document.body.classList.contains(GRABBING_CLASS));

    firePointer(dom.window.document, 'pointermove', { clientX: 470, clientY: 640 });
    assert.deepEqual(t.moves, [[410, 610], [420, 620]]);
  });
});

test('pointerup persists the final clamped position and ends the drag', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630 });
    firePointer(dom.window.document, 'pointerup', { clientX: 460, clientY: 630 });
    assert.deepEqual(t.commits, [[410, 610]]);
    assert.equal(t.controller.livePosition(), null);
    assert.ok(!t.widget.wrapper.classList.contains(DRAGGING_CLASS));
    assert.ok(!dom.window.document.body.classList.contains(GRABBING_CLASS));
  });
});

test('pointercancel also persists the position', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630 });
    firePointer(dom.window.document, 'pointercancel', { clientX: 460, clientY: 630 });
    assert.deepEqual(t.commits, [[410, 610]]);
  });
});

test('positions are clamped into the viewport during the drag', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 2450, clientY: 2620 });
    assert.deepEqual(t.moves, [[800, 680]], 'clamped to viewport minus widget size');
    firePointer(dom.window.document, 'pointermove', { clientX: -2450, clientY: -2620 });
    assert.deepEqual(t.moves[1], [0, 0]);
  });
});

test('a press on a link, an input or the padlock drags the widget too', () => {
  withDom((dom) => {
    const t = build(dom, {
      extraHeaderHtml: '<a id="a" href="#">y</a><input id="i">'
        + '<svg class="chatplus-lock" data-chatplus-lock="1"><rect id="lockchild"></rect></svg>',
    });
    t.controller.enable();
    for (const id of ['a', 'i', 'lockchild']) {
      const target = t.widget.header.querySelector(`#${id}`);
      firePointer(target, 'pointerdown', { clientX: 450, clientY: 620 });
      firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630 });
      firePointer(dom.window.document, 'pointerup', { clientX: 460, clientY: 630 });
    }
    assert.deepEqual(t.commits, [[410, 610], [410, 610], [410, 610]],
      'the whole header is the handle');
  });
});

test('non-primary buttons never start a drag', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620, button: 2 });
    firePointer(dom.window.document, 'pointermove', { clientX: 500, clientY: 660 });
    assert.deepEqual(t.moves, []);
  });
});

test('setPointerCapture is used when the browser provides it', () => {
  withDom((dom) => {
    const t = build(dom);
    const captured = [];
    const released = [];
    t.widget.header.setPointerCapture = (id) => captured.push(id);
    t.widget.header.releasePointerCapture = (id) => released.push(id);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620, pointerId: 7 });
    firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630, pointerId: 7 });
    assert.deepEqual(captured, [7]);
    firePointer(dom.window.document, 'pointerup', { clientX: 460, clientY: 630, pointerId: 7 });
    assert.deepEqual(released, [7]);
  });
});

test('disable during a drag cancels it without persisting, and detaches listeners', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630 });
    t.controller.disable();
    assert.deepEqual(t.commits, []);
    assert.ok(!t.widget.wrapper.classList.contains(DRAGGING_CLASS));
    assert.ok(!dom.window.document.body.classList.contains(GRABBING_CLASS));

    firePointer(dom.window.document, 'pointermove', { clientX: 500, clientY: 660 });
    assert.deepEqual(t.moves, [[410, 610]], 'no further moves after disable');
  });
});

test('a press on Torn\'s minimize icon drags the widget too', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    const minimize = minimizeButtonOf(t.widget.box);
    assert.ok(minimize, 'the fake widget must have a minimize icon');
    firePointer(minimize, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630 });
    firePointer(dom.window.document, 'pointerup', { clientX: 460, clientY: 630 });
    assert.deepEqual(t.commits, [[410, 610]]);
  });
});

test('the threshold must be exceeded: 4px is still a click, 5px is a drag', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 454, clientY: 620 });
    assert.deepEqual(t.moves, [], 'exactly 4px must not start a drag');
    assert.equal(t.controller.livePosition(), null);
    firePointer(dom.window.document, 'pointermove', { clientX: 455, clientY: 620 });
    assert.deepEqual(t.moves, [[405, 600]], '5px must start a drag');
    assert.deepEqual(t.controller.livePosition(), { x: 405, y: 600 });
  });
});

test('a pointerdown/pointerup with no movement persists nothing', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointerup', { clientX: 450, clientY: 620 });
    assert.deepEqual(t.moves, []);
    assert.deepEqual(t.commits, [], 'a plain click must not persist a position');
    assert.equal(t.controller.livePosition(), null);
  });
});

test('disable during a drag releases the pointer capture', () => {
  withDom((dom) => {
    const t = build(dom);
    const released = [];
    // jsdom implements neither method, so stand them in.
    t.widget.header.setPointerCapture = () => {};
    t.widget.header.releasePointerCapture = (id) => released.push(id);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620, pointerId: 9 });
    firePointer(dom.window.document, 'pointermove', { clientX: 460, clientY: 630, pointerId: 9 });
    assert.ok(t.widget.wrapper.classList.contains(DRAGGING_CLASS), 'a real drag is running');
    t.controller.disable();
    assert.deepEqual(released, [9]);
  });
});

test('livePosition reports the in-flight drag only once the threshold is passed', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    assert.equal(t.controller.livePosition(), null, 'idle');

    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    assert.equal(t.controller.livePosition(), null, 'a candidate drag is not a drag');

    firePointer(dom.window.document, 'pointermove', { clientX: 500, clientY: 650 });
    assert.deepEqual(t.controller.livePosition(), { x: 450, y: 630 });

    firePointer(dom.window.document, 'pointerup', { clientX: 500, clientY: 650 });
    assert.equal(t.controller.livePosition(), null, 'a finished drag is not live');
  });
});

test('a live drag can be handed over to a controller on the replacement nodes', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const from = build(dom);
    from.controller.enable();
    firePointer(from.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(doc, 'pointermove', { clientX: 500, clientY: 650 });
    assert.deepEqual(from.moves, [[450, 630]]);

    // Torn replaced the nodes: build a controller on the new ones and move the
    // gesture across without the user noticing.
    const to = build(dom);
    const session = from.controller.exportSession();
    assert.ok(session, 'a live drag can be exported');
    from.controller.disable();
    to.controller.adoptSession(session);

    assert.ok(to.widget.wrapper.classList.contains(DRAGGING_CLASS), 'the new wrapper is marked');
    firePointer(doc, 'pointermove', { clientX: 520, clientY: 660 });
    assert.deepEqual(to.moves, [[470, 640]], 'moves now drive the replacement');
    assert.deepEqual(from.moves, [[450, 630]], 'and no longer the old one');

    firePointer(doc, 'pointerup', { clientX: 520, clientY: 660 });
    assert.deepEqual(to.commits, [[470, 640]], 'the replacement commits the gesture');
    assert.deepEqual(from.commits, [], 'the discarded controller commits nothing');
    assert.ok(!doc.body.classList.contains(GRABBING_CLASS), 'and the cursor is restored');
  });
});

test('exportSession ignores a candidate drag that never passed the threshold', () => {
  withDom((dom) => {
    const t = build(dom);
    t.controller.enable();
    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    assert.equal(t.controller.exportSession(), null);
  });
});

test('a locked widget never starts a drag, and its header loses the grab cursor', () => {
  withDom((dom) => {
    const t = build(dom, { isLocked: () => true });
    t.controller.enable();
    assert.ok(!t.widget.header.classList.contains(DRAGGABLE_CLASS));

    firePointer(t.widget.header, 'pointerdown', { clientX: 450, clientY: 620 });
    firePointer(dom.window.document, 'pointermove', { clientX: 500, clientY: 660 });
    firePointer(dom.window.document, 'pointerup', { clientX: 500, clientY: 660 });
    assert.deepEqual(t.moves, []);
    assert.deepEqual(t.commits, []);
  });
});
