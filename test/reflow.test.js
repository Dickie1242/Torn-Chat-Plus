import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardownDom, makeChatWidget } from '../testlib/dom.js';
import * as selectors from '../src/core/selectors.js';
import { computeCompensations, applyCompensations, COMP_EPSILON } from '../src/features/movable/reflow.js';

function asObject(map) {
  return Object.fromEntries([...map.entries()]);
}

test('right-anchored row with nothing floating needs no compensation', () => {
  const result = computeCompensations({
    prop: 'right',
    widgets: [
      { id: 'a', natural: 10, floating: false },
      { id: 'b', natural: 220, floating: false },
      { id: 'c', natural: 430, floating: false },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: 0 });
});

test('right-anchored row closes the gap left by one floating widget', () => {
  const result = computeCompensations({
    prop: 'right',
    widgets: [
      { id: 'a', natural: 10, floating: false },
      { id: 'b', natural: 220, floating: true },
      { id: 'c', natural: 430, floating: false },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: 210 });
});

test('right-anchored row closes the gap left by two floating widgets', () => {
  const result = computeCompensations({
    prop: 'right',
    widgets: [
      { id: 'a', natural: 10, floating: true },
      { id: 'b', natural: 220, floating: true },
      { id: 'c', natural: 430, floating: false },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: 420 });
});

test('left-anchored row shifts the survivors toward the left edge', () => {
  const result = computeCompensations({
    prop: 'left',
    widgets: [
      { id: 'a', natural: 10, floating: false },
      { id: 'b', natural: 220, floating: true },
      { id: 'c', natural: 430, floating: false },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: -210 });
});

test('translateX row anchored at 0 with negative offsets', () => {
  const result = computeCompensations({
    prop: 'transform',
    widgets: [
      { id: 'a', natural: 0, floating: false },
      { id: 'b', natural: -210, floating: true },
      { id: 'c', natural: -420, floating: false },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: 210 });
});

test('translateX row anchored at 0 with positive offsets', () => {
  const result = computeCompensations({
    prop: 'transform',
    widgets: [
      { id: 'a', natural: 0, floating: false },
      { id: 'b', natural: 210, floating: true },
      { id: 'c', natural: 420, floating: false },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: -210 });
});

test('input order does not matter, only the natural offsets do', () => {
  const result = computeCompensations({
    prop: 'right',
    widgets: [
      { id: 'c', natural: 430, floating: false },
      { id: 'a', natural: 10, floating: false },
      { id: 'b', natural: 220, floating: true },
    ],
  });
  assert.deepEqual(asObject(result), { a: 0, b: 0, c: 210 });
});

test('a single widget, all widgets floating, and an empty row are all no-ops', () => {
  assert.deepEqual(asObject(computeCompensations({
    prop: 'right', widgets: [{ id: 'a', natural: 10, floating: false }],
  })), { a: 0 });
  assert.deepEqual(asObject(computeCompensations({
    prop: 'right',
    widgets: [{ id: 'a', natural: 10, floating: true }, { id: 'b', natural: 220, floating: true }],
  })), { a: 0, b: 0 });
  assert.equal(computeCompensations({ prop: 'right', widgets: [] }).size, 0);
});

test('malformed layouts produce an empty map instead of throwing', () => {
  assert.equal(computeCompensations(null).size, 0);
  assert.equal(computeCompensations({ prop: 'bottom', widgets: [{ id: 'a', natural: 1 }] }).size, 0);
  assert.equal(computeCompensations({ prop: 'right', widgets: null }).size, 0);
  assert.equal(computeCompensations({
    prop: 'right', widgets: [{ id: 'a', natural: NaN }, { id: null, natural: 3 }],
  }).size, 0);
});

test('a wider widget nearer the anchor pushes the rest of the row away by the extra width', () => {
  const widgets = (widths) => [
    { id: 'a', natural: 0, width: widths[0] },
    { id: 'b', natural: -273, width: widths[1] },
    { id: 'c', natural: -546, width: widths[2] },
  ];
  const right = (widths, extra = {}) => asObject(
    computeCompensations({ prop: 'transform', widgets: widgets(widths), defaultWidth: 270, ...extra }),
  );
  assert.deepEqual(right([400, 270, 270]), { a: 0, b: -130, c: -130 });
  assert.deepEqual(right([270, 370, 270]), { a: 0, b: 0, c: -100 });
  assert.deepEqual(right([400, 370, 270]), { a: 0, b: -130, c: -230 });
});

test('a floating widget contributes nothing and the survivors still pack', () => {
  const result = asObject(computeCompensations({
    prop: 'transform',
    defaultWidth: 270,
    widgets: [
      { id: 'a', natural: 0, width: 400 },
      { id: 'b', natural: -273, width: 500, floating: true },
      { id: 'c', natural: -546, width: 270 },
    ],
  }));
  assert.deepEqual(result, { a: 0, b: 0, c: 273 - 130 });
});

test('the push follows the anchor side: right-anchored rows push left, left-anchored rows push right', () => {
  const two = (prop, naturals) => asObject(computeCompensations({
    prop,
    defaultWidth: 270,
    widgets: [{ id: 'a', natural: naturals[0], width: 400 }, { id: 'b', natural: naturals[1], width: 270 }],
  }));
  assert.deepEqual(two('right', [0, 273]), { a: 0, b: -130 });
  assert.deepEqual(two('left', [0, 273]), { a: 0, b: 130 });
  assert.deepEqual(two('transform', [0, 273]), { a: 0, b: 130 }, 'positive translateX means a left-anchored row');
});

test('a wrapper measured before layout is no measurement, and neither is a zero default', () => {
  const zeroWidth = asObject(computeCompensations({
    prop: 'transform',
    defaultWidth: 270,
    widgets: [{ id: 'a', natural: 0, width: 0 }, { id: 'b', natural: -273, width: 270 }],
  }));
  assert.deepEqual(zeroWidth, { a: 0, b: 0 }, 'a 0px wrapper must not make the whole row extra');
  const zeroDefault = asObject(computeCompensations({
    prop: 'transform',
    defaultWidth: 0,
    widgets: [{ id: 'a', natural: 0, width: 400 }, { id: 'b', natural: -273, width: 270 }],
  }));
  assert.deepEqual(zeroDefault, { a: 0, b: 0 }, 'without a real default nothing is extra');
});

test('without widths or a default width the row behaves as before', () => {
  const layout = { prop: 'transform', widgets: [{ id: 'a', natural: 0 }, { id: 'b', natural: -273, width: 400 }] };
  assert.deepEqual(asObject(computeCompensations(layout)), { a: 0, b: 0 });
  assert.deepEqual(asObject(computeCompensations({
    ...layout,
    defaultWidth: 270,
    widgets: [{ id: 'a', natural: 0, width: 400 }, { id: 'b', natural: -273 }],
  })), { a: 0, b: -130 });
});

test('COMP_EPSILON is the sub-pixel threshold below which no property is written', () => {
  assert.equal(COMP_EPSILON, 0.5);
});

function withDom(fn) {
  const dom = setupDom();
  try { return fn(dom); } finally { teardownDom(dom); }
}

test('applyCompensations writes translate with !important and removes it when zero', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const a = makeChatWidget(doc, { id: 'chat-a', style: 'right: 10px;' });
    const b = makeChatWidget(doc, { id: 'chat-b', style: 'right: 220px;' });
    const c = makeChatWidget(doc, { id: 'chat-c', style: 'right: 430px;' });
    const widgets = [
      { id: 'chat-a', wrapper: a.wrapper },
      { id: 'chat-b', wrapper: b.wrapper },
      { id: 'chat-c', wrapper: c.wrapper },
    ];

    // Pre-existing stale compensation that must be cleared.
    a.wrapper.style.setProperty('translate', '99px 0', 'important');

    const result = applyCompensations(widgets, selectors, (w) => w.id === 'chat-b');

    assert.deepEqual(Object.fromEntries(result.entries()), { 'chat-a': 0, 'chat-b': 0, 'chat-c': 210 });
    assert.ok(!a.wrapper.getAttribute('style').includes('translate'), 'zero compensation removes translate');
    assert.ok(!b.wrapper.getAttribute('style').includes('translate'), 'floating widgets are never compensated');
    assert.match(c.wrapper.getAttribute('style'), /translate: 210px 0 !important/);
    assert.match(a.wrapper.getAttribute('style'), /right: 10px/, 'Torn inline style is untouched');
  });
});

test('applyCompensations slides the row over for a wider widget', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const a = makeChatWidget(doc, { id: 'chat-a', style: 'transform: translateX(0px);', width: 400 });
    const b = makeChatWidget(doc, { id: 'chat-b', style: 'transform: translateX(-273px);', width: 270 });
    const widgets = [{ id: 'chat-a', wrapper: a.wrapper }, { id: 'chat-b', wrapper: b.wrapper }];

    const result = applyCompensations(widgets, selectors, () => false, 270);

    assert.deepEqual(Object.fromEntries(result.entries()), { 'chat-a': 0, 'chat-b': -130 });
    assert.match(b.wrapper.getAttribute('style'), /translate: -130px 0 !important/);
    assert.ok(!a.wrapper.getAttribute('style').includes('translate: '), 'the widened one stays where Torn put it');
  });
});

test('applyCompensations ignores disconnected wrappers and mixed positioning props', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const a = makeChatWidget(doc, { id: 'chat-a', style: 'right: 10px;' });
    const b = makeChatWidget(doc, { id: 'chat-b', style: 'right: 220px;' });
    const odd = makeChatWidget(doc, { id: 'chat-odd', style: 'left: 5px;' });
    const gone = makeChatWidget(doc, { id: 'chat-gone', style: 'right: 640px;' });
    gone.wrapper.remove();

    const result = applyCompensations(
      [
        { id: 'chat-a', wrapper: a.wrapper },
        { id: 'chat-b', wrapper: b.wrapper },
        { id: 'chat-odd', wrapper: odd.wrapper },
        { id: 'chat-gone', wrapper: gone.wrapper },
      ],
      selectors,
      (w) => w.id === 'chat-a',
    );

    assert.deepEqual(Object.fromEntries(result.entries()), { 'chat-a': 0, 'chat-b': 210 });
    assert.match(b.wrapper.getAttribute('style'), /translate: 210px 0 !important/);
    assert.ok(!odd.wrapper.getAttribute('style').includes('translate'));
  });
});

test('applyCompensations on an empty or offset-less row returns an empty map', () => {
  withDom((dom) => {
    const plain = makeChatWidget(dom.window.document, { id: 'chat-a', style: 'position: absolute;' });
    assert.equal(applyCompensations([], selectors).size, 0);
    assert.equal(applyCompensations([{ id: 'chat-a', wrapper: plain.wrapper }], selectors).size, 0);
  });
});
