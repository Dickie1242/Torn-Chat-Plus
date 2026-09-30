import { JSDOM } from 'jsdom';

export function captureConsole(method) {
  const original = console[method];
  const calls = [];
  console[method] = (...args) => { calls.push(args); };
  return {
    calls,
    restore() { console[method] = original; },
  };
}

const GLOBAL_KEYS = [
  'window', 'document', 'MutationObserver', 'Node', 'Element', 'SVGElement',
  'Event', 'MouseEvent', 'CustomEvent', 'StorageEvent', 'localStorage',
  'requestAnimationFrame', 'cancelAnimationFrame',
];

export function setupDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    pretendToBeVisual: true,
    url: 'https://www.torn.com/',
  });
  const w = dom.window;
  globalThis.window = w;
  globalThis.document = w.document;
  globalThis.MutationObserver = w.MutationObserver;
  globalThis.Node = w.Node;
  globalThis.Element = w.Element;
  globalThis.SVGElement = w.SVGElement;
  globalThis.Event = w.Event;
  globalThis.MouseEvent = w.MouseEvent;
  globalThis.CustomEvent = w.CustomEvent;
  globalThis.StorageEvent = w.StorageEvent;
  globalThis.localStorage = w.localStorage;
  globalThis.requestAnimationFrame = w.requestAnimationFrame.bind(w);
  globalThis.cancelAnimationFrame = w.cancelAnimationFrame.bind(w);
  return dom;
}

export function teardownDom(dom) {
  if (dom) dom.window.close();
  for (const key of GLOBAL_KEYS) delete globalThis[key];
}

/** Wait for MutationObserver / requestAnimationFrame callbacks to settle. */
export function settle(ms = 25) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until work that a DOM change scheduled onto the next animation frame
 * has run, with no wall-clock guess: MutationObserver callbacks are delivered
 * in a microtask queued at the change, and jsdom runs a frame's callbacks in
 * the order they were requested, so a frame requested after them runs last.
 */
export async function nextFrame() {
  await Promise.resolve();
  await new Promise((resolve) => globalThis.requestAnimationFrame(() => resolve()));
}

/**
 * Build a fake Torn chat widget:
 *   wrapper (inline positioning style)
 *     > middle
 *       > box (div with an id)
 *         > header (contains svg[aria-label="Minimize"])
 *         > body
 *
 * `headerWrapped` builds the header the way Torn has since 2026-09-30: a
 * <button> holding the title and the Minimize icon, inside a div that is the
 * box's direct child (`headerWrap`; without the option it is the header
 * itself). `boxStyle` is an inline style Torn put on the box, and `parent`
 * is where the wrapper goes.
 */
export function makeChatWidget(doc, options = {}) {
  const {
    id = 'chat-1',
    style = 'right: 0px;',
    width = 200,
    height = 120,
    extraHeaderHtml = '',
    headerWrapped = false,
    boxStyle = '',
    parent = doc.body,
  } = options;

  const wrapper = doc.createElement('div');
  wrapper.setAttribute('style', style);
  const middle = doc.createElement('div');
  const box = doc.createElement('div');
  box.id = id;
  if (boxStyle) box.setAttribute('style', boxStyle);
  const minimize = '<svg aria-label="Minimize" viewBox="0 0 24 24"></svg>';
  let header;
  let headerWrap;
  if (headerWrapped) {
    header = doc.createElement('button');
    header.type = 'button';
    header.innerHTML = `<div role="button"><span class="title">${id}</span></div>${extraHeaderHtml}${minimize}`;
    headerWrap = doc.createElement('div');
    headerWrap.appendChild(header);
  } else {
    header = doc.createElement('div');
    header.innerHTML = `<span class="title">${id}</span>${extraHeaderHtml}${minimize}`;
    headerWrap = header;
  }
  const body = doc.createElement('div');
  body.className = 'messages';

  box.appendChild(headerWrap);
  box.appendChild(body);
  middle.appendChild(box);
  wrapper.appendChild(middle);
  parent.appendChild(wrapper);
  stubRect(wrapper, { width, height });

  return { wrapper, middle, box, header, headerWrap, body, id };
}

/**
 * A chat as Torn renders it since its 2026-09-30 update: a bare id
 * (`1234567`, `faction`), Torn's own inline size on the box, the header button
 * wrapped in a div, and a message sender link whose id holds a `-`.
 */
export function makeLiveChat(doc, options = {}) {
  const chat = makeChatWidget(doc, {
    id: '1234567',
    style: 'transform: translateX(0px);',
    width: 300,
    height: 400,
    boxStyle: 'width: 300px; height: 400px;',
    headerWrapped: true,
    ...options,
  });
  chat.body.innerHTML = `<a id="5f0c9a4e-2b7d-4c1a-9e3f-8d6b1a7c2e40:${chat.id}" href="#">sender</a>`;
  return chat;
}

/**
 * Torn's #chatRoot with the id-bearing nodes that live beside the chats
 * since 2026-09-30 and are not chats: dnd-kit's live regions and the private
 * channel list.
 */
export function makeChatRoot(doc) {
  const root = doc.createElement('div');
  root.id = 'chatRoot';
  root.innerHTML = '<div id="DndDescribedBy-0">To pick up a draggable item, press space.</div>'
    + '<div id="DndLiveRegion-0" role="status"></div>'
    + '<div id="private-channel-list"><button id="chat_panel_button:1234567">Chat</button></div>';
  doc.body.appendChild(root);
  return root;
}

/** jsdom has no layout engine, so getBoundingClientRect must be stubbed. */
export function stubRect(el, { left = 0, top = 0, width = 200, height = 120 } = {}) {
  el.getBoundingClientRect = () => ({
    left, top, width, height,
    right: left + width, bottom: top + height,
    x: left, y: top,
    toJSON() { return { left, top, width, height }; },
  });
}

/**
 * jsdom has no PointerEvent, but a MouseEvent dispatched with a pointer type
 * name reaches pointerdown/pointermove/pointerup listeners just fine.
 * The document itself has no `ownerDocument`, so it stands in for its own.
 */
export function firePointer(target, type, options = {}) {
  const doc = target.ownerDocument || target;
  const win = doc.defaultView;
  const { clientX = 0, clientY = 0, button = 0, pointerId = 1 } = options;
  const event = new win.MouseEvent(type, {
    bubbles: true, cancelable: true, clientX, clientY, button,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  target.dispatchEvent(event);
  return event;
}
