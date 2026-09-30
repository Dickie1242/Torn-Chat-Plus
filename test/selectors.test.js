import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupDom, teardownDom, makeChatWidget, makeLiveChat, makeChatRoot,
} from '../testlib/dom.js';
import {
  MINIMIZE_SELECTOR, CHAT_BOX_SELECTOR,
  findChatBoxes, chatIdOf, boxOf, wrapperOf, headerOf, minimizeButtonOf, naturalOffsetOf,
} from '../src/core/selectors.js';

function withDom(fn) {
  const dom = setupDom();
  try { return fn(dom); } finally { teardownDom(dom); }
}

test('the selectors are attribute-based, never hashed class names', () => {
  assert.equal(MINIMIZE_SELECTOR, 'svg[aria-label="Minimize"]');
  assert.equal(CHAT_BOX_SELECTOR, 'div[id]');
  for (const selector of [MINIMIZE_SELECTOR, CHAT_BOX_SELECTOR]) assert.doesNotMatch(selector, /___/);
});

test('findChatBoxes finds the chats Torn renders since 2026-09-30, and nothing else', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const root = makeChatRoot(doc);
    const a = makeLiveChat(doc, { id: '1234567', parent: root });
    const f = makeLiveChat(doc, { id: 'faction', parent: root });
    const boxes = findChatBoxes(doc);
    assert.deepEqual(boxes.map((box) => box.id), ['1234567', 'faction'],
      'bare ids; the dnd-kit regions, the channel list and the sender links are not chats');
    assert.equal(boxes[0], a.box);
    assert.equal(boxes[1], f.box);
  });
});

test('a Minimize icon whose nearest id-bearing div is #chatRoot is not a chat', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    // An id'd div above #chatRoot: the walk must stop at #chatRoot, not go on to it.
    const page = doc.createElement('div');
    page.id = 'page-container';
    doc.body.appendChild(page);
    const root = doc.createElement('div');
    root.id = 'chatRoot';
    page.appendChild(root);
    const stray = doc.createElement('div');
    stray.innerHTML = '<svg aria-label="Minimize"></svg>';
    root.appendChild(stray);
    assert.deepEqual(findChatBoxes(doc), []);
    assert.equal(boxOf(stray.firstElementChild), null);
  });
});

test('headerOf is the button that holds Minimize, even with a div around it', () => {
  withDom((dom) => {
    const w = makeLiveChat(dom.window.document);
    assert.equal(headerOf(w.box), w.header);
    assert.equal(w.header.localName, 'button');
    assert.equal(w.header.parentElement, w.headerWrap, 'no longer a direct child of the box');
    assert.equal(w.headerWrap.parentElement, w.box);
  });
});

test('headerOf keeps the direct child when Minimize sits beside a button, not in it', () => {
  withDom((dom) => {
    const w = makeChatWidget(dom.window.document, {
      id: 'chat-a', extraHeaderHtml: '<button type="button">Trade</button>',
    });
    assert.equal(headerOf(w.box), w.header);
    assert.equal(headerOf(w.box).parentElement, w.box);
  });
});

test('boxOf resolves a padlock in a wrapped header, and a sender link, to their chat', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const root = makeChatRoot(doc);
    const w = makeLiveChat(doc, { parent: root });
    // Where the padlock goes: right before Minimize, inside Torn's header button.
    const padlock = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    w.header.insertBefore(padlock, minimizeButtonOf(w.box));
    assert.equal(boxOf(padlock), w.box);
    assert.equal(chatIdOf(boxOf(padlock)), '1234567');
    assert.equal(boxOf(w.body.querySelector('a')), w.box, 'a link\'s own id does not make it a chat');
    const loose = doc.createElement('span');
    root.appendChild(loose);
    assert.equal(boxOf(loose), null, '#chatRoot itself is not a chat');
  });
});

test('findChatBoxes returns every chat box in document order', () => {
  withDom((dom) => {
    const a = makeChatWidget(dom.window.document, { id: 'chat-a', style: 'right: 0px;' });
    const b = makeChatWidget(dom.window.document, { id: 'chat-b', style: 'right: 210px;' });
    const boxes = findChatBoxes(dom.window.document);
    assert.deepEqual(boxes.map((box) => box.id), ['chat-a', 'chat-b']);
    assert.equal(boxes[0], a.box);
    assert.equal(boxes[1], b.box);
  });
});

test('findChatBoxes dedupes a box that contains two Minimize icons', () => {
  withDom((dom) => {
    makeChatWidget(dom.window.document, {
      id: 'chat-a',
      extraHeaderHtml: '<svg aria-label="Minimize" viewBox="0 0 24 24"></svg>',
    });
    assert.equal(findChatBoxes(dom.window.document).length, 1);
  });
});

test('findChatBoxes ignores a Minimize icon with no id-bearing ancestor', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const stray = doc.createElement('div');
    stray.innerHTML = '<svg aria-label="Minimize"></svg>';
    doc.body.appendChild(stray);
    assert.deepEqual(findChatBoxes(doc), []);
  });
});

test('chatIdOf, wrapperOf, minimizeButtonOf and headerOf walk the documented structure', () => {
  withDom((dom) => {
    const w = makeChatWidget(dom.window.document, { id: 'chat-a' });
    assert.equal(chatIdOf(w.box), 'chat-a');
    assert.equal(wrapperOf(w.box), w.wrapper);
    assert.equal(minimizeButtonOf(w.box).getAttribute('aria-label'), 'Minimize');
    assert.equal(headerOf(w.box), w.header);
    assert.equal(headerOf(w.box).parentElement, w.box);
  });
});

test('headerOf returns null when there is no Minimize button', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const box = doc.createElement('div');
    box.id = 'chat-x';
    doc.body.appendChild(box);
    assert.equal(headerOf(box), null);
    assert.equal(minimizeButtonOf(box), null);
  });
});

test('naturalOffsetOf reads right, left and translateX layouts', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const r = makeChatWidget(doc, { id: 'chat-r', style: 'right: 220px; position: absolute;' });
    const l = makeChatWidget(doc, { id: 'chat-l', style: 'left: 15.5px; position: absolute;' });
    const t = makeChatWidget(doc, { id: 'chat-t', style: 'transform: translateX(-210px);' });
    const n = makeChatWidget(doc, { id: 'chat-n', style: 'position: absolute;' });

    assert.deepEqual(naturalOffsetOf(r.wrapper), { prop: 'right', value: 220 });
    assert.deepEqual(naturalOffsetOf(l.wrapper), { prop: 'left', value: 15.5 });
    assert.deepEqual(naturalOffsetOf(t.wrapper), { prop: 'transform', value: -210 });
    assert.equal(naturalOffsetOf(n.wrapper), null);
    assert.equal(naturalOffsetOf(null), null);
  });
});

test('naturalOffsetOf still reads Torn inline style while a widget is floating', () => {
  withDom((dom) => {
    // The floating CSS class overrides via !important but never rewrites the inline style,
    // so the widget keeps contributing its native slot to the reflow calculation.
    const w = makeChatWidget(dom.window.document, { id: 'chat-r', style: 'right: 220px;' });
    w.wrapper.classList.add('chatplus-floating');
    w.wrapper.style.setProperty('--chatplus-x', '40px');
    assert.deepEqual(naturalOffsetOf(w.wrapper), { prop: 'right', value: 220 });
  });
});

test('boxOf finds the chat box an element sits in', () => {
  withDom((dom) => {
    const doc = dom.window.document;
    const w = makeChatWidget(doc, { id: 'chat-9' });
    const inHeader = w.header.querySelector('.title');
    assert.equal(boxOf(inHeader), w.box);
    assert.equal(boxOf(w.box), w.box, 'the box itself counts');
    assert.equal(boxOf(doc.createElement('span')), null, 'detached: nothing');
    assert.equal(boxOf(null), null);
  });
});
