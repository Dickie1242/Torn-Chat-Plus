// ==UserScript==
// @name         Chat+
// @namespace    chatplus.torn
// @version      1.8.1
// @description  Unlock, drag, lock and resize Torn Chat 3.0 widgets, each with its own size and message size. Remaining widgets slide over to close the gap.
// @license      MIT
// @match        https://www.torn.com/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/Dickie1242/Torn-Chat-Plus
// @supportURL   https://github.com/Dickie1242/Torn-Chat-Plus/issues
// @downloadURL  https://raw.githubusercontent.com/Dickie1242/Torn-Chat-Plus/main/dist/chatplus.user.js
// @updateURL    https://raw.githubusercontent.com/Dickie1242/Torn-Chat-Plus/main/dist/chatplus.user.js
// ==/UserScript==
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/core/selectors.js
  var selectors_exports = {};
  __export(selectors_exports, {
    CHAT_BOX_SELECTOR: () => CHAT_BOX_SELECTOR,
    CHAT_ROOT_ID: () => CHAT_ROOT_ID,
    MINIMIZE_SELECTOR: () => MINIMIZE_SELECTOR,
    boxOf: () => boxOf,
    chatIdOf: () => chatIdOf,
    findChatBoxes: () => findChatBoxes,
    headerOf: () => headerOf,
    minimizeButtonOf: () => minimizeButtonOf,
    naturalOffsetOf: () => naturalOffsetOf,
    wrapperOf: () => wrapperOf
  });
  var MINIMIZE_SELECTOR = 'svg[aria-label="Minimize"]';
  var CHAT_BOX_SELECTOR = "div[id]";
  var CHAT_ROOT_ID = "chatRoot";
  function nearestBox(element) {
    const box = element && typeof element.closest === "function" ? element.closest(CHAT_BOX_SELECTOR) : null;
    return box && box.id && box.id !== CHAT_ROOT_ID ? box : null;
  }
  function findChatBoxes(root) {
    const scope = root && typeof root.querySelectorAll === "function" ? root : globalThis.document;
    if (!scope) return [];
    const boxes = [];
    const seen = /* @__PURE__ */ new Set();
    for (const icon of scope.querySelectorAll(MINIMIZE_SELECTOR)) {
      const box = nearestBox(icon);
      if (!box || seen.has(box)) continue;
      seen.add(box);
      boxes.push(box);
    }
    return boxes;
  }
  function chatIdOf(box) {
    return box && box.id ? box.id : null;
  }
  function boxOf(element) {
    return nearestBox(element);
  }
  function wrapperOf(box) {
    const middle = box && box.parentElement;
    return middle && middle.parentElement || null;
  }
  function minimizeButtonOf(box) {
    return box ? box.querySelector(MINIMIZE_SELECTOR) : null;
  }
  function headerOf(box) {
    const icon = minimizeButtonOf(box);
    if (!icon) return null;
    const button = icon.closest("button");
    if (button && box.contains(button)) return button;
    let node = icon;
    while (node.parentElement && node.parentElement !== box) node = node.parentElement;
    return node.parentElement === box ? node : null;
  }
  function naturalOffsetOf(wrapper) {
    if (!wrapper || !wrapper.style) return null;
    const right = parseFloat(wrapper.style.right);
    if (wrapper.style.right && Number.isFinite(right)) return { prop: "right", value: right };
    const left = parseFloat(wrapper.style.left);
    if (wrapper.style.left && Number.isFinite(left)) return { prop: "left", value: left };
    const match = /translateX\(\s*(-?[\d.]+)px\s*\)/.exec(wrapper.style.transform || "");
    if (match) {
      const value = parseFloat(match[1]);
      if (Number.isFinite(value)) return { prop: "transform", value };
    }
    return null;
  }

  // src/core/log.js
  var PREFIX = "[Chat+]";
  var DEBUG_KEY = "chatplus.debug";
  var warned = /* @__PURE__ */ new Set();
  function isDebug() {
    try {
      const area = globalThis.localStorage;
      return !!area && area.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function debug(...args) {
    if (!isDebug()) return false;
    console.log(PREFIX, ...args);
    return true;
  }
  var tags = /* @__PURE__ */ new WeakMap();
  var nextTag = 0;
  function tagOf(node) {
    if (!node || !isDebug()) return "-";
    let tag = tags.get(node);
    if (tag === void 0) {
      nextTag += 1;
      tag = `#${nextTag}`;
      tags.set(node, tag);
    }
    return tag;
  }
  function info(...args) {
    console.info(PREFIX, ...args);
  }
  function warnOnce(key, ...args) {
    if (warned.has(key)) return false;
    warned.add(key);
    console.warn(PREFIX, ...args);
    return true;
  }
  function safe(label, fn) {
    return (...args) => {
      try {
        return fn(...args);
      } catch (err) {
        warnOnce(label, `${label} failed:`, err);
        return void 0;
      }
    };
  }

  // src/styles.css
  var styles_default = `/* Chat+ styles.
   Every rule is !important because it has to beat Torn's inline styles. */

.chatplus-floating {
  position: fixed !important;
  left: var(--chatplus-x, 0px) !important;
  top: var(--chatplus-y, 0px) !important;
  right: auto !important;
  bottom: auto !important;
  transform: none !important;
  translate: none !important;
  margin: 0 !important;
  z-index: 9000 !important;
  transition: none !important;
}

.chatplus-floating.chatplus-dragging {
  z-index: 9001 !important;
}

.chatplus-dragging {
  user-select: none !important;
}

.chatplus-lock,
.chatplus-reset {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s ease;
}

.chatplus-lock:hover,
.chatplus-reset:hover,
.chatplus-lock--unlocked {
  opacity: 1;
}

.chatplus-draggable {
  cursor: grab;
  /* Without this a touch drag is stolen by the page's own scrolling. */
  touch-action: none;
}

body.chatplus-grabbing,
body.chatplus-grabbing * {
  cursor: grabbing !important;
}

/* Message size. Torn's own font sizes come from hashed CSS-module classes, so
   nothing inherits from the chat box - zoom scales the subtree regardless.
   Without the custom property (100%) this falls back to zoom: 1, a no-op. */
.chatplus-scaled {
  zoom: var(--chatplus-scale, 1) !important;
}

/* Widget size. The size itself is inline on the chat box (features/resize/
   sizing.js); these rules let it beat Torn's caps and contain the children,
   the way Better Chat 3.0 does. */
.chatplus-sized {
  max-width: none !important;
  max-height: none !important;
  overflow: hidden !important;
}

/* On the box while handles are mounted: the handles position against it. */
.chatplus-resizable {
  position: relative !important;
}

.chatplus-handle {
  position: absolute;
  z-index: 10;
  background: transparent;
  /* Without this a touch drag is stolen by the page's own scrolling. */
  touch-action: none;
  user-select: none;
}

.chatplus-handle--n { top: 0; left: 0; right: 0; height: 8px; cursor: ns-resize; }
.chatplus-handle--s { bottom: 0; left: 0; right: 0; height: 8px; cursor: ns-resize; }
.chatplus-handle--se { right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; z-index: 11; }
.chatplus-handle--nw { left: 0; top: 0; width: 14px; height: 14px; cursor: nwse-resize; z-index: 11; }

.chatplus-handle:hover,
.chatplus-handle--active {
  background: rgba(124, 169, 0, 0.35);
}

body[data-chatplus-resizing="n"],
body[data-chatplus-resizing="n"] *,
body[data-chatplus-resizing="s"],
body[data-chatplus-resizing="s"] * {
  cursor: ns-resize !important;
}

body[data-chatplus-resizing="se"],
body[data-chatplus-resizing="se"] *,
body[data-chatplus-resizing="nw"],
body[data-chatplus-resizing="nw"] * {
  cursor: nwse-resize !important;
}

/* Header controls: the menu's size and reset actions inline in a chat's
   header once the chat is wide enough (features/headerControls). */
.chatplus-header-controls {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 6px 0 4px;
  flex: 0 0 auto;
  /* The steps, the value and the Reset button inherit colour and font: pinned
     here so the strip reads the same on Torn's header as it does in the menu. */
  color: #ddd;
  font-size: 12px;
  line-height: 1;
}

.chatplus-header-controls--hidden {
  display: none !important;
}

/* The Chat+ settings menu. It sits on document.body. Torn's fixed chat
   container stacks above 9100, so the menu takes the largest z-index there is;
   on a tie it still wins, because open() appends it after everything else. */
.chatplus-menu {
  position: fixed;
  z-index: 2147483647;
  min-width: 160px;
  padding: 6px;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  background: #1c1c1c;
  color: #ddd;
  font-size: 12px;
  line-height: 1.4;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
}

.chatplus-menu__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chatplus-menu__label {
  flex: 1 1 auto;
}

.chatplus-menu__value {
  min-width: 36px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.chatplus-menu__step {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #3a3a3a;
  border-radius: 3px;
  background: #2a2a2a;
  color: inherit;
  font: inherit;
  line-height: 1;
  cursor: pointer;
}

.chatplus-menu__step:hover {
  background: #3a3a3a;
}

.chatplus-menu__button {
  height: 20px;
  flex: 0 0 auto;
  padding: 0 8px;
  border: 1px solid #3a3a3a;
  border-radius: 3px;
  background: #2a2a2a;
  color: inherit;
  font: inherit;
  line-height: 1;
  cursor: pointer;
}

.chatplus-menu__button:hover:not(:disabled) {
  background: #3a3a3a;
}

.chatplus-menu__button:disabled {
  opacity: 0.4;
  cursor: default;
}
`;

  // src/core/version.js
  var VERSION = true ? "1.8.1" : "dev";
  var VERSION_ATTR = "data-chatplus-version";

  // src/core/styles.js
  var STYLE_ELEMENT_ID = "chatplus-styles";
  function injectStyles(doc) {
    if (!doc || doc.getElementById(STYLE_ELEMENT_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    style.setAttribute(VERSION_ATTR, VERSION);
    style.textContent = styles_default;
    (doc.head || doc.documentElement).appendChild(style);
  }

  // src/core/storage.js
  var STORAGE_KEY = "chatplus.state.v1";
  var STORAGE_VERSION = 1;
  var DEFAULT_WIDGET_STATE = Object.freeze({
    x: null,
    y: null,
    locked: true,
    width: null,
    height: null,
    scale: null
  });
  var WIDGET_SIZE = Object.freeze({ minWidth: 200, minHeight: 150 });
  var SETTINGS = Object.freeze({
    /** Percent a chat with no size of its own scales its messages and input to. */
    messageScale: Object.freeze({ default: 100, min: 80, max: 200, step: 10 })
  });
  function emptyState() {
    return { version: STORAGE_VERSION, widgets: {}, settings: sanitizeSettings(null) };
  }
  function sanitizeDimension(value, min) {
    return Number.isFinite(value) ? Math.max(min, Math.round(value)) : null;
  }
  function sanitizeScale(value) {
    if (!Number.isFinite(value)) return null;
    const { min, max } = SETTINGS.messageScale;
    return Math.min(max, Math.max(min, Math.round(value)));
  }
  function sanitizeWidget(raw) {
    if (!raw || typeof raw !== "object") return { ...DEFAULT_WIDGET_STATE };
    return {
      x: Number.isFinite(raw.x) ? raw.x : null,
      y: Number.isFinite(raw.y) ? raw.y : null,
      locked: typeof raw.locked === "boolean" ? raw.locked : true,
      width: sanitizeDimension(raw.width, WIDGET_SIZE.minWidth),
      height: sanitizeDimension(raw.height, WIDGET_SIZE.minHeight),
      scale: sanitizeScale(raw.scale)
    };
  }
  function sanitizeSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const settings = {};
    for (const [name, spec] of Object.entries(SETTINGS)) {
      const value = source[name];
      settings[name] = Number.isFinite(value) ? Math.min(spec.max, Math.max(spec.min, value)) : spec.default;
    }
    return settings;
  }
  function parseState(text) {
    if (text == null) return emptyState();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      warnOnce("storage.read", "stored state is not valid JSON; resetting to defaults");
      return emptyState();
    }
    if (!data || typeof data !== "object" || data.version !== STORAGE_VERSION) {
      warnOnce("storage.read", `stored state has version ${data && data.version}, expected ${STORAGE_VERSION}; resetting to defaults`);
      return emptyState();
    }
    const source = data.widgets && typeof data.widgets === "object" ? data.widgets : {};
    const widgets = {};
    for (const id of Object.keys(source)) widgets[id] = sanitizeWidget(source[id]);
    return { version: STORAGE_VERSION, widgets, settings: sanitizeSettings(data.settings) };
  }
  function createStorage({ area = globalThis.localStorage, target = globalThis.window } = {}) {
    let state = emptyState();
    const listeners = /* @__PURE__ */ new Set();
    function read() {
      try {
        state = parseState(area ? area.getItem(STORAGE_KEY) : null);
      } catch (err) {
        warnOnce("storage.read", "could not read stored state; using defaults:", err);
        state = emptyState();
      }
    }
    function write() {
      try {
        if (area) area.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        warnOnce("storage.write", "could not persist state:", err);
      }
    }
    function notify() {
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (err) {
          warnOnce("storage.subscriber", "a storage subscriber threw:", err);
        }
      }
    }
    function getWidget(id) {
      return { ...DEFAULT_WIDGET_STATE, ...state.widgets[id] || {} };
    }
    function setWidget(id, patch) {
      const next = sanitizeWidget({ ...getWidget(id), ...patch });
      debug("storage write", id, next);
      state.widgets[id] = next;
      write();
      notify();
      return next;
    }
    function getSetting(name) {
      return state.settings[name];
    }
    function setSetting(name, value) {
      if (!Object.hasOwn(SETTINGS, name)) return void 0;
      const next = sanitizeSettings({ ...state.settings, [name]: value });
      if (next[name] === state.settings[name]) return getSetting(name);
      state.settings = next;
      debug("storage setting", name, next[name]);
      write();
      notify();
      return getSetting(name);
    }
    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
    const onStorage = (event) => {
      const key = event && event.key;
      if (key != null && key !== STORAGE_KEY) return;
      read();
      notify();
    };
    function destroy() {
      if (target && typeof target.removeEventListener === "function") {
        target.removeEventListener("storage", onStorage);
      }
      listeners.clear();
    }
    read();
    if (target && typeof target.addEventListener === "function") {
      target.addEventListener("storage", onStorage);
    }
    return { getWidget, setWidget, getSetting, setSetting, subscribe, destroy };
  }

  // src/core/menu.js
  var MENU_CLASS = "chatplus-menu";
  var MENU_ROW_CLASS = "chatplus-menu__row";
  var ANCHOR_GAP = 4;
  function createMenu({ doc = globalThis.document } = {}) {
    let element = null;
    let anchor = null;
    let armed = false;
    const openListeners = /* @__PURE__ */ new Set();
    function ensureElement() {
      if (element) return element;
      element = doc.createElement("div");
      element.className = MENU_CLASS;
      element.setAttribute("role", "menu");
      element.addEventListener("pointerdown", (event) => event.stopPropagation(), true);
      return element;
    }
    const onPointerDown = (event) => {
      if (element.contains(event.target)) return;
      if (anchor && anchor.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    function position() {
      const rect = anchor.getBoundingClientRect();
      const view = doc.defaultView;
      const { width, height } = element.getBoundingClientRect();
      const left = Math.max(ANCHOR_GAP, Math.min(rect.left, view.innerWidth - width - ANCHOR_GAP));
      const below = rect.bottom + ANCHOR_GAP;
      const top = below + height > view.innerHeight ? rect.top - ANCHOR_GAP - height : below;
      element.style.left = `${Math.round(left)}px`;
      element.style.top = `${Math.round(top)}px`;
    }
    function open(nextAnchor) {
      anchor = nextAnchor;
      doc.body.appendChild(ensureElement());
      position();
      if (!armed) {
        doc.addEventListener("pointerdown", onPointerDown, true);
        doc.addEventListener("keydown", onKeyDown, true);
        armed = true;
      }
      for (const listener of [...openListeners]) listener(anchor);
    }
    function close() {
      if (!armed) return;
      armed = false;
      doc.removeEventListener("pointerdown", onPointerDown, true);
      doc.removeEventListener("keydown", onKeyDown, true);
      element.remove();
      anchor = null;
    }
    function isOpen() {
      return armed;
    }
    return {
      /**
       * A row for the caller to fill. It is built once and lives on in the
       * reused menu element.
       * @returns {Element}
       */
      addRow() {
        const row = doc.createElement("div");
        row.className = MENU_ROW_CLASS;
        ensureElement().appendChild(row);
        return row;
      },
      /**
       * Hear every open, with the element the menu is anchored to. A row that
       * is about "the chat this menu was opened from" learns which one here.
       * @param {(anchor: Element) => void} listener
       * @returns {() => void} unsubscribe
       */
      onOpen(listener) {
        openListeners.add(listener);
        return () => openListeners.delete(listener);
      },
      open,
      close,
      isOpen,
      /** Open anchored to `nextAnchor`, or close if it is already showing. */
      toggle(nextAnchor) {
        if (isOpen()) close();
        else open(nextAnchor);
      }
    };
  }

  // src/core/registry.js
  function createRegistry(ctx) {
    const features = [];
    function fanOut(hookName, args) {
      for (const feature of features) {
        const hook = feature[hookName];
        if (typeof hook !== "function") continue;
        safe(`${feature.id}.${hookName}`, hook)(...args);
      }
    }
    const api = {
      /** @param {Feature} feature */
      register(feature) {
        if (feature && typeof feature.id === "string" && feature.id) features.push(feature);
        return api;
      },
      init() {
        fanOut("init", [ctx]);
      },
      widgetAdded(widget) {
        fanOut("onWidgetAdded", [widget, ctx]);
      },
      widgetRemoved(widget) {
        fanOut("onWidgetRemoved", [widget, ctx]);
      },
      list() {
        return features.map((feature) => feature.id);
      }
    };
    return api;
  }

  // src/core/scheduler.js
  var FALLBACK_DELAY_MS = 16;
  function createFrameScheduler(fn) {
    let cancelPending = null;
    function run() {
      cancelPending = null;
      fn();
    }
    function schedule() {
      if (cancelPending) return;
      if (typeof globalThis.requestAnimationFrame === "function" && typeof globalThis.cancelAnimationFrame === "function") {
        const handle = globalThis.requestAnimationFrame(run);
        cancelPending = () => globalThis.cancelAnimationFrame(handle);
      } else {
        const handle = setTimeout(run, FALLBACK_DELAY_MS);
        cancelPending = () => clearTimeout(handle);
      }
    }
    function cancel() {
      if (!cancelPending) return;
      const cancelRun = cancelPending;
      cancelPending = null;
      cancelRun();
    }
    return { schedule, cancel };
  }

  // src/core/observer.js
  function createObserver({ selectors, onWidgetAdded, onWidgetRemoved }) {
    const widgets = /* @__PURE__ */ new Map();
    let mutationObserver = null;
    const emitAdded = safe("observer.onWidgetAdded", (widget) => {
      debug(
        "widget added",
        widget.id,
        "box",
        tagOf(widget.box),
        "wrapper",
        tagOf(widget.wrapper),
        "header",
        tagOf(widget.header)
      );
      if (onWidgetAdded) onWidgetAdded(widget);
    });
    const emitRemoved = safe("observer.onWidgetRemoved", (widget) => {
      debug(
        "widget removed",
        widget.id,
        "box",
        tagOf(widget.box),
        "wrapper",
        tagOf(widget.wrapper),
        "header",
        tagOf(widget.header)
      );
      if (onWidgetRemoved) onWidgetRemoved(widget);
    });
    function buildWidget(box) {
      const id = selectors.chatIdOf(box);
      const wrapper = selectors.wrapperOf(box);
      const header = selectors.headerOf(box);
      if (!id || !wrapper || !header) return null;
      return { id, box, wrapper, header };
    }
    function scan() {
      const doc = globalThis.document;
      if (!doc || !doc.body) return;
      const stale = [];
      for (const box of selectors.findChatBoxes(doc)) {
        const known = widgets.get(box);
        const widget = buildWidget(box);
        if (!widget) {
          warnOnce(`observer.shape:${box.id}`, "could not read the structure of chat widget", box.id);
          continue;
        }
        if (known && known.wrapper === widget.wrapper && known.header === widget.header) continue;
        widgets.set(box, widget);
        emitAdded(widget);
        if (known) stale.push(known);
      }
      for (const [box, widget] of [...widgets]) {
        if (doc.body.contains(box)) continue;
        widgets.delete(box);
        stale.push(widget);
      }
      for (const widget of stale) emitRemoved(widget);
    }
    const scheduler = createFrameScheduler(safe("observer.scan", scan));
    function start() {
      if (mutationObserver) return;
      const doc = globalThis.document;
      if (!doc || !doc.body) return;
      mutationObserver = new globalThis.MutationObserver(scheduler.schedule);
      mutationObserver.observe(doc.body, { childList: true, subtree: true });
      scan();
    }
    function stop() {
      scheduler.cancel();
      if (!mutationObserver) return;
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    return { start, stop, scan };
  }

  // src/features/movable/lockToggle.js
  var SVG_NS = "http://www.w3.org/2000/svg";
  var LOCK_CLASS = "chatplus-lock";
  var UNLOCKED_CLASS = "chatplus-lock--unlocked";
  var LOCK_ATTR = "data-chatplus-lock";
  var SHACKLE_LOCKED = "M8 10V7a4 4 0 0 1 8 0v3";
  var SHACKLE_UNLOCKED = "M8 10V7a4 4 0 0 1 8 0";
  var TITLE_LOCKED = "Locked \u2014 click to unlock and drag by the header. Right-click for Chat+ settings.";
  var TITLE_UNLOCKED = "Unlocked \u2014 drag by the header. Click to lock. Right-click for Chat+ settings.";
  function createLockToggle({ widget, selectors, isLocked, onToggle, onMenu }) {
    const doc = widget.box.ownerDocument;
    let element = null;
    function handleClick(event) {
      event.preventDefault();
      event.stopPropagation();
      if (onToggle) onToggle(!isLocked());
    }
    function handleContextMenu(event) {
      event.preventDefault();
      event.stopPropagation();
      if (onMenu) onMenu(element);
    }
    function build() {
      const svg = doc.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
      svg.setAttribute("aria-label", "Chat+ lock");
      svg.setAttribute(LOCK_ATTR, "1");
      svg.classList.add(LOCK_CLASS);
      svg.innerHTML = [
        "<title></title>",
        '<rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"></rect>',
        `<path fill="none" stroke="currentColor" stroke-width="2" d="${SHACKLE_LOCKED}"></path>`
      ].join("");
      svg.addEventListener("click", handleClick);
      svg.addEventListener("contextmenu", handleContextMenu);
      return svg;
    }
    function sync() {
      if (!element) return;
      const locked = !!isLocked();
      const titleText = locked ? TITLE_LOCKED : TITLE_UNLOCKED;
      element.setAttribute("title", titleText);
      element.setAttribute("aria-pressed", String(locked));
      const titleNode = element.querySelector("title");
      if (titleNode) titleNode.textContent = titleText;
      const path = element.querySelector("path");
      if (path) path.setAttribute("d", locked ? SHACKLE_LOCKED : SHACKLE_UNLOCKED);
      if (locked) element.classList.remove(UNLOCKED_CLASS);
      else element.classList.add(UNLOCKED_CLASS);
    }
    function mount() {
      if (element && element.isConnected) {
        sync();
        return element;
      }
      const minimize = selectors.minimizeButtonOf(widget.box);
      if (!minimize || !minimize.parentNode) return null;
      for (const stale of widget.box.querySelectorAll(`[${LOCK_ATTR}]`)) stale.remove();
      element = build();
      minimize.parentNode.insertBefore(element, minimize);
      sync();
      return element;
    }
    function unmount() {
      if (!element) return;
      element.removeEventListener("click", handleClick);
      element.removeEventListener("contextmenu", handleContextMenu);
      element.remove();
      element = null;
    }
    return { mount, unmount, sync };
  }

  // src/features/movable/resetButton.js
  var SVG_NS2 = "http://www.w3.org/2000/svg";
  var RESET_CLASS = "chatplus-reset";
  var RESET_LABEL = "Chat+ return to row";
  var RESET_TITLE = "Return this chat to Torn's row";
  var RESET_PATH = "M9 8 5 12l4 4M5 12h9a4 4 0 0 0 4-4V6";
  function createResetButton({ widget, onReset }) {
    const doc = widget.box.ownerDocument;
    let element = null;
    function handleClick(event) {
      event.preventDefault();
      event.stopPropagation();
      if (onReset) onReset();
    }
    function mount() {
      const anchor = widget.box.querySelector(`[${LOCK_ATTR}]`);
      if (!anchor || !anchor.parentNode) return null;
      for (const stale of widget.box.querySelectorAll(`.${RESET_CLASS}`)) stale.remove();
      element = doc.createElementNS(SVG_NS2, "svg");
      element.setAttribute("viewBox", "0 0 24 24");
      element.setAttribute("width", "24");
      element.setAttribute("height", "24");
      element.setAttribute("aria-label", RESET_LABEL);
      element.setAttribute("title", RESET_TITLE);
      element.classList.add(RESET_CLASS);
      element.innerHTML = `<title>${RESET_TITLE}</title><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${RESET_PATH}"></path>`;
      element.addEventListener("click", handleClick);
      anchor.parentNode.insertBefore(element, anchor);
      return element;
    }
    function unmount() {
      if (!element) return;
      element.removeEventListener("click", handleClick);
      element.remove();
      element = null;
    }
    return {
      /**
       * Show the button exactly while the widget has a position of its own.
       * @param {boolean} show
       * @returns {Element|null} the button, or null while it is not shown.
       */
      sync(show) {
        if (!show) {
          unmount();
          return null;
        }
        if (element && element.isConnected) return element;
        unmount();
        return mount();
      },
      unmount
    };
  }

  // src/features/movable/geometry.js
  function clampAxis(value, size, limit) {
    if (!Number.isFinite(size) || !Number.isFinite(limit)) return 0;
    const max = limit - size;
    if (!(max > 0)) return 0;
    if (!Number.isFinite(value)) return value === Infinity ? max : 0;
    if (value < 0) return 0;
    if (value > max) return max;
    return value;
  }
  function clampPosition({ x, y, width, height, viewportWidth, viewportHeight }) {
    return {
      x: clampAxis(x, width, viewportWidth),
      y: clampAxis(y, height, viewportHeight)
    };
  }

  // src/features/movable/dragController.js
  var DRAG_THRESHOLD_PX = 4;
  var DRAGGABLE_CLASS = "chatplus-draggable";
  var DRAGGING_CLASS = "chatplus-dragging";
  var GRABBING_CLASS = "chatplus-grabbing";
  function createDragController({
    widget,
    onMove,
    onCommit,
    isLocked = () => false,
    getViewport
  }) {
    const { header, wrapper } = widget;
    const doc = header.ownerDocument;
    const readViewport = getViewport || (() => ({
      width: doc.defaultView.innerWidth,
      height: doc.defaultView.innerHeight
    }));
    let enabled = false;
    let session = null;
    function attachSessionListeners() {
      doc.addEventListener("pointermove", onPointerMove, true);
      doc.addEventListener("pointerup", onPointerEnd, true);
      doc.addEventListener("pointercancel", onPointerEnd, true);
    }
    function detachSessionListeners() {
      doc.removeEventListener("pointermove", onPointerMove, true);
      doc.removeEventListener("pointerup", onPointerEnd, true);
      doc.removeEventListener("pointercancel", onPointerEnd, true);
    }
    function beginDrag() {
      session.dragging = true;
      if (typeof header.setPointerCapture === "function") {
        try {
          header.setPointerCapture(session.pointerId);
          session.captured = true;
        } catch {
        }
      }
      wrapper.classList.add(DRAGGING_CLASS);
      doc.body?.classList.add(GRABBING_CLASS);
    }
    function endSession() {
      if (!session) return;
      const { captured, pointerId } = session;
      session = null;
      detachSessionListeners();
      if (captured && typeof header.releasePointerCapture === "function") {
        try {
          header.releasePointerCapture(pointerId);
        } catch {
        }
      }
      wrapper.classList.remove(DRAGGING_CLASS);
      doc.body?.classList.remove(GRABBING_CLASS);
    }
    function isOurPointer(event) {
      return event.pointerId === session.pointerId;
    }
    function onPointerDown(event) {
      if (!enabled || session || isLocked()) return;
      if (typeof event.button === "number" && event.button !== 0) return;
      const rect = wrapper.getBoundingClientRect();
      session = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: rect.left,
        originY: rect.top,
        width: rect.width,
        height: rect.height,
        dragging: false,
        captured: false,
        x: rect.left,
        y: rect.top
      };
      debug(
        "drag start",
        widget.id,
        "header",
        tagOf(header),
        "wrapper",
        tagOf(wrapper),
        "origin",
        rect.left,
        rect.top,
        "size",
        rect.width,
        rect.height
      );
      attachSessionListeners();
    }
    function onPointerMove(event) {
      if (!session || !isOurPointer(event)) return;
      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      if (!session.dragging) {
        if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
        beginDrag();
        debug("drag threshold crossed", widget.id, "dx", dx, "dy", dy, "captured", session.captured);
      }
      const viewport = readViewport();
      const next = clampPosition({
        x: session.originX + dx,
        y: session.originY + dy,
        width: session.width,
        height: session.height,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height
      });
      session.x = next.x;
      session.y = next.y;
      if (event.cancelable) event.preventDefault();
      if (onMove) onMove(next.x, next.y);
    }
    function onPointerEnd(event) {
      if (!session || !isOurPointer(event)) return;
      const { dragging, x, y } = session;
      endSession();
      if (dragging && onCommit) onCommit(x, y);
    }
    return {
      /**
       * Attach the header listener. Safe to call again when the lock state
       * changes: only the grab cursor, which belongs to a header that can
       * actually be dragged, is re-synced.
       */
      enable() {
        if (!enabled) {
          enabled = true;
          header.addEventListener("pointerdown", onPointerDown, true);
        }
        if (isLocked()) header.classList.remove(DRAGGABLE_CLASS);
        else header.classList.add(DRAGGABLE_CLASS);
      },
      disable() {
        if (!enabled) return;
        enabled = false;
        header.classList.remove(DRAGGABLE_CLASS);
        header.removeEventListener("pointerdown", onPointerDown, true);
        endSession();
      },
      /**
       * Where the pointer is holding this widget right now, or null when no real
       * drag is running. While a gesture is in flight this - not storage - is the
       * truth: nothing has been committed yet, so storage still describes where
       * the widget used to be.
       * @returns {{x: number, y: number}|null}
       */
      livePosition() {
        return session && session.dragging ? { x: session.x, y: session.y } : null;
      },
      /**
       * Torn can rebuild a widget's nodes in the middle of a gesture. Export the
       * live drag from the controller bound to the dead nodes...
       * @returns {object|null} null when there is no real drag to hand over.
       */
      exportSession() {
        return session && session.dragging ? { ...session } : null;
      },
      /**
       * ...and adopt it on the controller bound to the replacements, so the
       * user's drag never notices the swap. The pointer listeners live on the
       * document, so only the capture and the visual state have to be re-made.
       * @returns {boolean} true if the session was taken on.
       */
      adoptSession(state) {
        if (!state || session) return false;
        session = { ...state, dragging: false, captured: false };
        attachSessionListeners();
        beginDrag();
        debug(
          "drag adopted",
          widget.id,
          "header",
          tagOf(header),
          "wrapper",
          tagOf(wrapper),
          "at",
          session.x,
          session.y
        );
        return true;
      }
    };
  }

  // src/features/movable/headerGuard.js
  var PRESS_EVENTS = ["pointerdown", "mousedown", "touchstart"];
  function createHeaderGuard({ header }) {
    let enabled = false;
    let swallowClick = false;
    const onPress = safe("movable.press", (event) => {
      if (event.type === "pointerdown") swallowClick = false;
      if (typeof event.button === "number" && event.button !== 0) return;
      event.stopPropagation();
    });
    const onClick = safe("movable.click", (event) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
      event.preventDefault();
    });
    return {
      /** A drag just ended on this header: eat the click it is about to fire. */
      armClickSuppression() {
        swallowClick = true;
      },
      enable() {
        if (enabled) return;
        enabled = true;
        for (const type of PRESS_EVENTS) header.addEventListener(type, onPress, true);
        header.addEventListener("click", onClick, true);
      },
      disable() {
        if (!enabled) return;
        enabled = false;
        for (const type of PRESS_EVENTS) header.removeEventListener(type, onPress, true);
        header.removeEventListener("click", onClick, true);
        swallowClick = false;
      }
    };
  }

  // src/features/movable/floating.js
  var FLOATING_CLASS = "chatplus-floating";
  var VAR_X = "--chatplus-x";
  var VAR_Y = "--chatplus-y";
  function applyFloating(wrapper, x, y, reason) {
    if (!wrapper || !wrapper.style || !wrapper.classList) return;
    const wantX = `${Math.round(Number(x) || 0)}px`;
    const wantY = `${Math.round(Number(y) || 0)}px`;
    debug("applyFloating", tagOf(wrapper), wantX, wantY, reason || "?");
    if (wrapper.style.getPropertyValue(VAR_X) !== wantX) wrapper.style.setProperty(VAR_X, wantX);
    if (wrapper.style.getPropertyValue(VAR_Y) !== wantY) wrapper.style.setProperty(VAR_Y, wantY);
    wrapper.style.removeProperty("translate");
    if (!wrapper.classList.contains(FLOATING_CLASS)) wrapper.classList.add(FLOATING_CLASS);
  }
  function clearFloating(wrapper, reason) {
    if (!wrapper || !wrapper.style || !wrapper.classList) return;
    debug("clearFloating", tagOf(wrapper), reason || "?");
    wrapper.classList.remove(FLOATING_CLASS);
    wrapper.style.removeProperty(VAR_X);
    wrapper.style.removeProperty(VAR_Y);
  }
  function isFloating(wrapper) {
    return !!(wrapper && wrapper.classList && wrapper.classList.contains(FLOATING_CLASS));
  }
  function watchWrapper(wrapper, getDesired, onChange) {
    const MO = globalThis.MutationObserver;
    if (!wrapper || typeof MO !== "function") return () => {
    };
    const observer = new MO(safe("floating.watchWrapper", (records) => {
      if (isDebug()) {
        for (const record of records) {
          debug(
            "watch",
            tagOf(wrapper),
            record.attributeName,
            "was:",
            record.oldValue,
            "now:",
            wrapper.getAttribute(record.attributeName)
          );
        }
      }
      const desired = getDesired();
      if (desired) applyFloating(wrapper, desired.x, desired.y, "watch");
      if (onChange) onChange();
    }));
    observer.observe(wrapper, {
      attributes: true,
      attributeFilter: ["style", "class"],
      // Only read by the debug trace; recording it changes no behaviour.
      attributeOldValue: true
    });
    return () => observer.disconnect();
  }

  // src/features/movable/reflow.js
  var COMP_EPSILON = 0.5;
  var AXIS_SIGN = { right: -1, left: 1, transform: 1 };
  function anchorDistance(prop, natural) {
    return prop === "transform" ? Math.abs(natural) : natural;
  }
  function awayFromAnchor(prop, entries) {
    if (prop === "right") return -1;
    if (prop === "left") return 1;
    return entries.some((entry) => entry.natural < 0) ? -1 : 1;
  }
  function computeCompensations(layout) {
    const result = /* @__PURE__ */ new Map();
    if (!layout || !Array.isArray(layout.widgets)) return result;
    const sign = AXIS_SIGN[layout.prop];
    if (!sign) return result;
    const entries = [];
    for (let index = 0; index < layout.widgets.length; index += 1) {
      const w = layout.widgets[index];
      if (!w || typeof w.id !== "string" || !w.id || !Number.isFinite(w.natural)) continue;
      entries.push({ id: w.id, natural: w.natural, floating: !!w.floating, width: w.width, index });
    }
    if (entries.length === 0) return result;
    entries.sort((a, b) => {
      const delta = anchorDistance(layout.prop, a.natural) - anchorDistance(layout.prop, b.natural);
      return delta !== 0 ? delta : a.index - b.index;
    });
    const away = awayFromAnchor(layout.prop, entries);
    const defaultWidth = Number.isFinite(layout.defaultWidth) && layout.defaultWidth > 0 ? layout.defaultWidth : null;
    const slots = entries.map((entry) => entry.natural);
    let nextSlot = 0;
    let extra = 0;
    for (const entry of entries) {
      if (entry.floating) {
        result.set(entry.id, 0);
        continue;
      }
      const target = slots[nextSlot];
      nextSlot += 1;
      const compensation = sign * (target - entry.natural) + away * extra;
      result.set(entry.id, compensation === 0 ? 0 : compensation);
      const width = entry.width;
      if (defaultWidth !== null && Number.isFinite(width) && width > 0) extra += width - defaultWidth;
    }
    return result;
  }
  function applyCompensations(widgets, selectors, isFloating3 = () => false, defaultWidth) {
    const measured = [];
    for (const widget of widgets || []) {
      if (!widget || !widget.wrapper || !widget.wrapper.isConnected) continue;
      const offset = selectors.naturalOffsetOf(widget.wrapper);
      if (!offset) continue;
      measured.push({ widget, offset });
    }
    if (measured.length === 0) return /* @__PURE__ */ new Map();
    const prop = measured[0].offset.prop;
    const row = measured.filter((entry) => entry.offset.prop === prop);
    const compensations = computeCompensations({
      prop,
      defaultWidth,
      widgets: row.map((entry) => ({
        id: entry.widget.id,
        natural: entry.offset.value,
        floating: !!isFloating3(entry.widget),
        width: entry.widget.wrapper.getBoundingClientRect().width
      }))
    });
    if (isDebug()) {
      debug("reflow", prop, [...compensations].map(([id, px]) => `${id}=${px}`).join(" "));
    }
    for (const entry of row) {
      const value = compensations.get(entry.widget.id) || 0;
      const style = entry.widget.wrapper.style;
      if (Math.abs(value) < COMP_EPSILON) style.removeProperty("translate");
      else style.setProperty("translate", `${value}px 0`, "important");
    }
    return compensations;
  }

  // src/features/movable/index.js
  function watchBoxStyle(box, onChange) {
    const MO = globalThis.MutationObserver;
    if (!box || typeof MO !== "function") return () => {
    };
    const observer = new MO(onChange);
    observer.observe(box, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }
  function createMovableFeature() {
    const entries = /* @__PURE__ */ new Map();
    let ctx = null;
    function stateOf(id) {
      return ctx.storage.getWidget(id);
    }
    function desiredPositionOf(id) {
      const entry = entries.get(id);
      const live = entry ? entry.drag.livePosition() : null;
      if (live) return live;
      const state = stateOf(id);
      return state.x !== null && state.y !== null ? { x: state.x, y: state.y } : null;
    }
    function defaultWidthOf() {
      for (const entry of entries.values()) {
        if (Number.isFinite(entry.naturalWidth) && entry.naturalWidth > 0) return entry.naturalWidth;
      }
      return void 0;
    }
    const { schedule: scheduleReflow } = createFrameScheduler(safe("movable.reflow", () => {
      applyCompensations(
        [...entries.values()].map((entry) => entry.widget),
        ctx.selectors,
        (widget) => isFloating(widget.wrapper),
        defaultWidthOf()
      );
    }));
    function applyState(entry) {
      const { id, wrapper } = entry.widget;
      const state = stateOf(id);
      const desired = desiredPositionOf(id);
      if (desired) applyFloating(wrapper, desired.x, desired.y, "applyState");
      else clearFloating(wrapper, "applyState:native");
      if (state.locked && !desired) {
        entry.drag.disable();
        entry.guard.disable();
      } else {
        entry.drag.enable();
        entry.guard.enable();
      }
      entry.lock.sync();
      entry.arrow.sync(state.x !== null && state.y !== null);
    }
    function applyAll() {
      for (const entry of entries.values()) applyState(entry);
      scheduleReflow();
    }
    function dropEntry(id) {
      const entry = entries.get(id);
      if (!entry) return;
      entry.drag.disable();
      entry.guard.disable();
      entry.lock.unmount();
      entry.arrow.unmount();
      entry.unwatch();
      entry.unwatchBox();
      entries.delete(id);
    }
    const onResize = safe("movable.onResize", () => {
      const view = globalThis.window;
      const clamped = [];
      for (const entry of entries.values()) {
        const desired = desiredPositionOf(entry.widget.id);
        if (!desired) continue;
        if (!entry.widget.wrapper.isConnected) continue;
        const rect = entry.widget.wrapper.getBoundingClientRect();
        const next = clampPosition({
          x: desired.x,
          y: desired.y,
          width: rect.width,
          height: rect.height,
          viewportWidth: view.innerWidth,
          viewportHeight: view.innerHeight
        });
        if (next.x !== desired.x || next.y !== desired.y) clamped.push([entry.widget.id, next]);
        else applyFloating(entry.widget.wrapper, next.x, next.y, "resize");
      }
      for (const [id, next] of clamped) ctx.storage.setWidget(id, next);
      scheduleReflow();
    });
    function init(context) {
      ctx = context;
      ctx.storage.subscribe(applyAll);
      globalThis.window.addEventListener("resize", onResize);
    }
    function onWidgetAdded(widget, context) {
      ctx = context;
      const previous = entries.get(widget.id);
      const handover = previous ? previous.drag.exportSession() : null;
      const ours = widget.box.style.getPropertyPriority("width") === "important";
      const measured = ours ? 0 : widget.wrapper.getBoundingClientRect().width;
      const naturalWidth = measured > 0 ? measured : previous ? previous.naturalWidth : void 0;
      dropEntry(widget.id);
      const reset = () => ctx.storage.setWidget(widget.id, { x: null, y: null });
      const lock = createLockToggle({
        widget,
        selectors: ctx.selectors,
        isLocked: () => stateOf(widget.id).locked,
        onToggle: (locked) => ctx.storage.setWidget(widget.id, { locked }),
        onMenu: (anchor) => ctx.menu.toggle(anchor)
      });
      const arrow = createResetButton({ widget, onReset: reset });
      const guard = createHeaderGuard({ header: widget.header });
      const drag = createDragController({
        widget,
        isLocked: () => stateOf(widget.id).locked,
        onMove: (x, y) => {
          applyFloating(widget.wrapper, x, y, "drag");
          scheduleReflow();
        },
        onCommit: (x, y) => {
          debug("commit", widget.id, x, y);
          guard.armClickSuppression();
          ctx.storage.setWidget(widget.id, { x, y });
        }
      });
      const unwatch = watchWrapper(widget.wrapper, () => desiredPositionOf(widget.id), scheduleReflow);
      const unwatchBox = watchBoxStyle(widget.box, scheduleReflow);
      const entry = { widget, lock, arrow, drag, guard, unwatch, unwatchBox, naturalWidth };
      entries.set(widget.id, entry);
      if (handover) {
        debug("drag handover", widget.id, handover.x, handover.y);
        drag.adoptSession(handover);
      }
      lock.mount();
      applyState(entry);
      scheduleReflow();
    }
    function onWidgetRemoved(widget) {
      const entry = entries.get(widget.id);
      if (entry && entry.widget === widget) dropEntry(widget.id);
      scheduleReflow();
    }
    return { id: "movable", init, onWidgetAdded, onWidgetRemoved };
  }

  // src/features/textScale/control.js
  var LABEL_TEXT = "Message size";
  var SMALLER_LABEL = "Chat+ smaller messages";
  var LARGER_LABEL = "Chat+ larger messages";
  var LABEL_CLASS = "chatplus-menu__label";
  var VALUE_CLASS = "chatplus-menu__value";
  var STEP_CLASS = "chatplus-menu__step";
  function createScaleControl({ range, getScale, setScale, compact = false }) {
    let value = null;
    function step(delta) {
      const current = getScale();
      const next = Math.min(range.max, Math.max(range.min, current + delta));
      if (next !== current) setScale(next);
    }
    function makeStep(doc, label, glyph, delta) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = STEP_CLASS;
      button.setAttribute("aria-label", label);
      button.textContent = glyph;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        step(delta);
      });
      return button;
    }
    function sync(percent) {
      if (value) value.textContent = `${percent}%`;
    }
    return {
      /** @param {Element} row the menu row to fill. */
      render(row) {
        const doc = row.ownerDocument;
        value = doc.createElement("span");
        value.className = VALUE_CLASS;
        if (!compact) {
          const label = doc.createElement("span");
          label.className = LABEL_CLASS;
          label.textContent = LABEL_TEXT;
          row.append(label);
        }
        row.append(
          makeStep(doc, SMALLER_LABEL, "\u2212", -range.step),
          value,
          makeStep(doc, LARGER_LABEL, "+", range.step)
        );
        sync(getScale());
      },
      sync
    };
  }

  // src/features/textScale/scale.js
  function scaleOf(storage, id) {
    const own = storage.getWidget(id).scale;
    return own === null ? storage.getSetting("messageScale") : own;
  }

  // src/features/resize/handles.js
  var HANDLE_ATTR = "data-chatplus-resize";
  var HANDLE_CLASS = "chatplus-handle";
  var ACTIVE_CLASS = "chatplus-handle--active";
  var RESIZABLE_CLASS = "chatplus-resizable";
  function directionsFor({ locked, floating }) {
    if (locked) return [];
    return floating ? ["n", "nw", "s", "se"] : ["n", "nw"];
  }
  function handlesOf(box) {
    return [...box.children].filter((el) => el.hasAttribute(HANDLE_ATTR));
  }
  function mountedDirections(box) {
    return handlesOf(box).map((el) => el.getAttribute(HANDLE_ATTR));
  }
  function mountHandles(box, directions, onPress) {
    const current = mountedDirections(box);
    if (current.length === directions.length && current.every((d, i) => d === directions[i])) return;
    unmountHandles(box);
    const doc = box.ownerDocument;
    for (const direction of directions) {
      const handle = doc.createElement("div");
      handle.className = `${HANDLE_CLASS} ${HANDLE_CLASS}--${direction}`;
      handle.setAttribute(HANDLE_ATTR, direction);
      handle.addEventListener("pointerdown", (event) => onPress(direction, event));
      box.appendChild(handle);
    }
    if (directions.length) box.classList.add(RESIZABLE_CLASS);
  }
  function unmountHandles(box) {
    for (const handle of handlesOf(box)) handle.remove();
    box.classList.remove(RESIZABLE_CLASS);
  }

  // src/features/textScale/index.js
  var SETTING_NAME = "messageScale";
  var SCALED_CLASS = "chatplus-scaled";
  var SCALE_VAR = "--chatplus-scale";
  function applyScale(widget, percent) {
    const { box, header } = widget;
    for (const child of box.children) {
      if (child.contains(header) || child.hasAttribute(HANDLE_ATTR)) continue;
      if (!child.classList.contains(SCALED_CLASS)) child.classList.add(SCALED_CLASS);
    }
    if (percent === 100) box.style.removeProperty(SCALE_VAR);
    else box.style.setProperty(SCALE_VAR, String(percent / 100));
  }
  function watchBox(box, reapply) {
    const MO = globalThis.MutationObserver;
    if (!box || typeof MO !== "function") return () => {
    };
    const observer = new MO(safe("textScale.watchBox", () => {
      reapply();
      watchChildren();
    }));
    function watchChildren() {
      for (const child of box.children) {
        observer.observe(child, { attributes: true, attributeFilter: ["class"] });
      }
    }
    observer.observe(box, { childList: true });
    watchChildren();
    return () => observer.disconnect();
  }
  function createTextScaleFeature() {
    const entries = /* @__PURE__ */ new Map();
    let ctx = null;
    let control = null;
    let currentId = null;
    function applyAll() {
      for (const entry of entries.values()) {
        applyScale(entry.widget, scaleOf(ctx.storage, entry.widget.id));
      }
      if (control && currentId) control.sync(scaleOf(ctx.storage, currentId));
    }
    function init(context) {
      ctx = context;
      ctx.storage.subscribe(applyAll);
      control = createScaleControl({
        range: SETTINGS[SETTING_NAME],
        getScale: () => scaleOf(ctx.storage, currentId),
        setScale: (percent) => {
          if (currentId) ctx.storage.setWidget(currentId, { scale: percent });
        }
      });
      control.render(ctx.menu.addRow());
      ctx.menu.onOpen((anchor) => {
        currentId = ctx.selectors.chatIdOf(ctx.selectors.boxOf(anchor));
        control.sync(scaleOf(ctx.storage, currentId));
      });
    }
    function dropEntry(id) {
      const entry = entries.get(id);
      if (!entry) return;
      entry.unwatch();
      entries.delete(id);
    }
    function onWidgetAdded(widget, context) {
      ctx = context;
      dropEntry(widget.id);
      entries.set(widget.id, {
        widget,
        unwatch: watchBox(widget.box, () => applyScale(widget, scaleOf(ctx.storage, widget.id)))
      });
      applyScale(widget, scaleOf(ctx.storage, widget.id));
    }
    function onWidgetRemoved(widget) {
      const entry = entries.get(widget.id);
      if (entry && entry.widget === widget) dropEntry(widget.id);
    }
    return { id: "textScale", init, onWidgetAdded, onWidgetRemoved };
  }

  // src/features/resize/sizing.js
  var SIZED_CLASS = "chatplus-sized";
  var NATIVE_ATTR_PREFIX = "data-chatplus-native-";
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function limitsFor({ direction, start, floating, viewport }) {
    const { minWidth, minHeight } = WIDGET_SIZE;
    let maxHeight = viewport.height;
    let maxWidth = start.width;
    if (floating) {
      maxHeight = direction.includes("n") ? start.top + start.height : viewport.height - start.top;
      maxWidth = viewport.width - start.left;
    }
    if (direction.includes("w")) maxWidth = start.left + start.width;
    return {
      minWidth,
      maxWidth: Math.max(minWidth, maxWidth),
      minHeight,
      maxHeight: Math.max(minHeight, maxHeight)
    };
  }
  function nextSize({ direction, start, dx, dy, limits }) {
    let { width, height } = start;
    if (direction.includes("e")) width = clamp(start.width + dx, limits.minWidth, limits.maxWidth);
    if (direction.includes("w")) width = clamp(start.width - dx, limits.minWidth, limits.maxWidth);
    if (direction.includes("s")) height = clamp(start.height + dy, limits.minHeight, limits.maxHeight);
    if (direction.includes("n")) height = clamp(start.height - dy, limits.minHeight, limits.maxHeight);
    return { width: Math.round(width), height: Math.round(height) };
  }
  function setPx(box, prop, value) {
    const current = box.style.getPropertyValue(prop);
    const ours = current !== "" && box.style.getPropertyPriority(prop) === "important";
    const memo = NATIVE_ATTR_PREFIX + prop;
    if (value == null) {
      if (ours) {
        const native = box.getAttribute(memo);
        if (native) box.style.setProperty(prop, native);
        else box.style.removeProperty(prop);
      }
      if (box.hasAttribute(memo)) box.removeAttribute(memo);
      return;
    }
    const next = `${value}px`;
    if (current === next && ours) return;
    if (current !== "" && !ours) box.setAttribute(memo, current);
    box.style.setProperty(prop, next, "important");
  }
  function applySize(box, { width, height }) {
    setPx(box, "width", width);
    setPx(box, "height", height);
    const sized = width != null || height != null;
    if (sized !== box.classList.contains(SIZED_CLASS)) box.classList.toggle(SIZED_CLASS, sized);
  }

  // src/features/resize/resizeController.js
  var BODY_ATTR = "data-chatplus-resizing";
  function createResizeController({
    doc = globalThis.document,
    getBox,
    getViewport = () => ({ width: doc.defaultView.innerWidth, height: doc.defaultView.innerHeight }),
    onResize,
    onCommit,
    onCancel
  }) {
    let session = null;
    function sizeAt(event) {
      const { direction, start, limits, floating, originX, originY } = session;
      const size = nextSize({
        direction,
        start,
        limits,
        dx: event.clientX - originX,
        dy: event.clientY - originY
      });
      const shiftX = floating && direction.includes("w") ? size.width - Math.round(start.width) : 0;
      const shiftY = floating && direction.includes("n") ? size.height - Math.round(start.height) : 0;
      return { ...size, shiftX, shiftY };
    }
    function end(commit) {
      const { live, start, handle } = session;
      doc.removeEventListener("pointermove", onPointerMove, true);
      doc.removeEventListener("pointerup", onPointerUp, true);
      doc.removeEventListener("pointercancel", onPointerCancel, true);
      doc.body.removeAttribute(BODY_ATTR);
      if (handle && handle.classList) handle.classList.remove(ACTIVE_CLASS);
      session = null;
      if (!commit) {
        if (onCancel) onCancel();
        return;
      }
      const changed = live && (live.width !== Math.round(start.width) || live.height !== Math.round(start.height));
      if (changed) onCommit(live, start);
    }
    const onPointerMove = (event) => {
      if (!session || event.pointerId !== session.pointerId) return;
      const box = getBox();
      if (!box || !box.isConnected) {
        end(false);
        return;
      }
      if (event.cancelable) event.preventDefault();
      session.live = sizeAt(event);
      onResize(session.live);
    };
    const onPointerUp = (event) => {
      if (session && event.pointerId === session.pointerId) end(true);
    };
    const onPointerCancel = (event) => {
      if (session && event.pointerId === session.pointerId) end(false);
    };
    return {
      /**
       * Begin a gesture from a press on a handle. Left button only. The press is
       * kept from everyone else: the header drag, the header guard, Torn's
       * reorder drag, and text selection.
       * @param {string} direction  see sizing.js
       * @param {PointerEvent} event  the handle's pointerdown
       * @param {{ floating?: boolean }} [options]
       */
      start(direction, event, { floating = false } = {}) {
        if (event.button !== 0 || session) return;
        const box = getBox();
        if (!box) return;
        event.stopPropagation();
        event.preventDefault();
        const rect = box.getBoundingClientRect();
        const start = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        session = {
          direction,
          floating,
          start,
          limits: limitsFor({ direction, start, floating, viewport: getViewport() }),
          originX: event.clientX,
          originY: event.clientY,
          pointerId: event.pointerId,
          handle: event.currentTarget,
          live: null
        };
        doc.addEventListener("pointermove", onPointerMove, true);
        doc.addEventListener("pointerup", onPointerUp, true);
        doc.addEventListener("pointercancel", onPointerCancel, true);
        doc.body.setAttribute(BODY_ATTR, direction);
        if (session.handle && session.handle.classList) session.handle.classList.add(ACTIVE_CLASS);
        debug("resize start", direction, start);
      },
      /** The size last sent to onResize while a gesture is live, else null. */
      liveSize: () => session ? session.live : null,
      isActive: () => session !== null,
      /** End a live gesture without committing. */
      cancel() {
        if (session) end(false);
      }
    };
  }

  // src/features/resize/resetControl.js
  var RESET_LABEL2 = "Reset";
  var RESET_ARIA_LABEL = "Chat+ reset this chat to Torn's size";
  var BUTTON_CLASS = "chatplus-menu__button";
  function createResetControl({ storage, getChatId, onReset, doc = globalThis.document }) {
    const element = doc.createElement("button");
    element.type = "button";
    element.className = BUTTON_CLASS;
    element.textContent = RESET_LABEL2;
    element.setAttribute("aria-label", RESET_ARIA_LABEL);
    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const chatId = getChatId();
      if (!chatId) return;
      storage.setWidget(chatId, { width: null, height: null });
      if (onReset) onReset();
    });
    function sync() {
      const chatId = getChatId();
      const state = chatId ? storage.getWidget(chatId) : null;
      element.disabled = !state || state.width === null && state.height === null;
    }
    return { element, sync };
  }

  // src/features/resize/resetRow.js
  var LABEL_TEXT2 = "Widget size";
  function createResetRow({ row, menu, storage, selectors }) {
    const doc = row.ownerDocument;
    let chatId = null;
    const label = doc.createElement("span");
    label.className = "chatplus-menu__label";
    label.textContent = LABEL_TEXT2;
    const control = createResetControl({
      storage,
      getChatId: () => chatId,
      onReset: () => menu.close(),
      doc
    });
    row.append(label, control.element);
    const unsubscribe = menu.onOpen((anchor) => {
      chatId = selectors.chatIdOf(selectors.boxOf(anchor));
      control.sync();
    });
    return { sync: control.sync, destroy: unsubscribe };
  }

  // src/features/resize/index.js
  var isFloating2 = (state) => state.x !== null && state.y !== null;
  function setShift(box, shiftX, shiftY) {
    const next = shiftX || shiftY ? `${-shiftX}px ${-shiftY}px` : "";
    if (box.style.getPropertyValue("translate") === next) return;
    if (next) box.style.setProperty("translate", next, "important");
    else box.style.removeProperty("translate");
  }
  function createResizeFeature() {
    const entries = /* @__PURE__ */ new Map();
    let ctx = null;
    let resetRow = null;
    const stateOf = (id) => ctx.storage.getWidget(id);
    function apply(entry) {
      const { id, box } = entry.widget;
      const state = stateOf(id);
      const floating = isFloating2(state);
      const live = entry.controller.liveSize();
      const size = live || { width: state.width, height: state.height };
      applySize(box, { width: size.width, height: size.height });
      setShift(box, live ? live.shiftX : 0, live ? live.shiftY : 0);
      mountHandles(box, directionsFor({ locked: state.locked, floating }), (direction, event) => {
        entry.controller.start(direction, event, { floating: isFloating2(stateOf(id)) });
      });
    }
    function applyAll() {
      for (const entry of entries.values()) apply(entry);
      if (resetRow) resetRow.sync();
    }
    function commit(entry, size, start) {
      const { id } = entry.widget;
      const state = stateOf(id);
      const patch = {};
      if (size.width !== Math.round(start.width)) patch.width = size.width;
      if (size.height !== Math.round(start.height)) patch.height = size.height;
      if (isFloating2(state)) {
        if (size.shiftX) patch.x = state.x - size.shiftX;
        if (size.shiftY) patch.y = state.y - size.shiftY;
      }
      debug("resize commit", id, patch);
      ctx.storage.setWidget(id, patch);
    }
    function createEntry(widget) {
      const entry = { widget };
      entry.controller = createResizeController({
        getBox: () => entry.widget.box,
        onResize: (size) => {
          applySize(entry.widget.box, { width: size.width, height: size.height });
          setShift(entry.widget.box, size.shiftX, size.shiftY);
        },
        onCommit: (size, start) => commit(entry, size, start),
        // Nothing was stored, so the box still wears the live size: put it back.
        onCancel: () => apply(entry)
      });
      return entry;
    }
    function init(context) {
      ctx = context;
      ctx.storage.subscribe(applyAll);
      resetRow = createResetRow({
        row: ctx.menu.addRow(),
        menu: ctx.menu,
        storage: ctx.storage,
        selectors: ctx.selectors
      });
    }
    function onWidgetAdded(widget, context) {
      ctx = context;
      const entry = entries.get(widget.id);
      if (entry) entry.widget = widget;
      else entries.set(widget.id, createEntry(widget));
      apply(entries.get(widget.id));
    }
    function onWidgetRemoved(widget) {
      const entry = entries.get(widget.id);
      if (!entry || entry.widget !== widget) return;
      entry.controller.cancel();
      unmountHandles(widget.box);
      entries.delete(widget.id);
    }
    return { id: "resize", init, onWidgetAdded, onWidgetRemoved };
  }

  // src/features/headerControls/index.js
  var HEADER_CONTROLS_MIN_WIDTH = 400;
  var CONTROLS_CLASS = "chatplus-header-controls";
  var HIDDEN_CLASS = "chatplus-header-controls--hidden";
  var CONTROLS_ATTR = "data-chatplus-controls";
  function watchBoxStyle2(box, onChange) {
    const MO = globalThis.MutationObserver;
    if (!box || typeof MO !== "function") return () => {
    };
    const observer = new MO(onChange);
    observer.observe(box, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }
  function createHeaderControlsFeature() {
    const entries = /* @__PURE__ */ new Map();
    let ctx = null;
    function mount(widget) {
      const { header, id } = widget;
      for (const stale of header.querySelectorAll(`[${CONTROLS_ATTR}]`)) stale.remove();
      const doc = header.ownerDocument;
      const container = doc.createElement("span");
      container.className = CONTROLS_CLASS;
      container.setAttribute(CONTROLS_ATTR, "1");
      const scale = createScaleControl({
        range: SETTINGS.messageScale,
        compact: true,
        getScale: () => scaleOf(ctx.storage, id),
        setScale: (percent) => ctx.storage.setWidget(id, { scale: percent })
      });
      scale.render(container);
      const reset = createResetControl({ storage: ctx.storage, getChatId: () => id, doc });
      container.appendChild(reset.element);
      const anchor = header.querySelector(`.${RESET_CLASS}`) || header.querySelector(`[${LOCK_ATTR}]`);
      if (anchor) anchor.parentNode.insertBefore(container, anchor);
      else header.appendChild(container);
      return { container, scale, reset };
    }
    function sync(entry) {
      const { widget, container, scale, reset } = entry;
      const wide = widget.box.getBoundingClientRect().width >= HEADER_CONTROLS_MIN_WIDTH;
      container.classList.toggle(HIDDEN_CLASS, !wide);
      scale.sync(scaleOf(ctx.storage, widget.id));
      reset.sync();
    }
    function syncAll() {
      for (const entry of entries.values()) sync(entry);
    }
    function dropEntry(id) {
      const entry = entries.get(id);
      if (!entry) return;
      entry.unwatch();
      entry.container.remove();
      entries.delete(id);
    }
    function init(context) {
      ctx = context;
      ctx.storage.subscribe(syncAll);
      globalThis.window.addEventListener("resize", safe("headerControls.resize", syncAll));
    }
    function onWidgetAdded(widget, context) {
      ctx = context;
      dropEntry(widget.id);
      const entry = { widget, ...mount(widget), unwatch: () => {
      } };
      entry.unwatch = watchBoxStyle2(widget.box, safe("headerControls.box", () => sync(entry)));
      entries.set(widget.id, entry);
      sync(entry);
    }
    function onWidgetRemoved(widget) {
      const entry = entries.get(widget.id);
      if (entry && entry.widget === widget) dropEntry(widget.id);
    }
    return { id: "headerControls", init, onWidgetAdded, onWidgetRemoved };
  }

  // src/main.js
  function boot() {
    injectStyles(document);
    const registry = createRegistry({
      storage: createStorage(),
      selectors: selectors_exports,
      menu: createMenu()
    });
    registry.register(createMovableFeature());
    registry.register(createTextScaleFeature());
    registry.register(createResizeFeature());
    registry.register(createHeaderControlsFeature());
    registry.init();
    const observer = createObserver({
      selectors: selectors_exports,
      onWidgetAdded: (widget) => registry.widgetAdded(widget),
      onWidgetRemoved: (widget) => registry.widgetRemoved(widget)
    });
    observer.start();
    info("ready:", registry.list().join(", "));
  }
  var safeBoot = safe("main.boot", boot);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeBoot, { once: true });
  } else {
    safeBoot();
  }
})();
