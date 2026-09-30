import { warnOnce, debug } from './log.js';

export const STORAGE_KEY = 'chatplus.state.v1';
export const STORAGE_VERSION = 1;

/**
 * @typedef {{
 *   x: number|null, y: number|null, locked: boolean,
 *   width: number|null, height: number|null,
 *   scale: number|null,
 * }} WidgetState
 *   `scale` is the percent this chat's messages are sized to; null means the
 *   `messageScale` default.
 */
export const DEFAULT_WIDGET_STATE = Object.freeze({
  x: null, y: null, locked: true, width: null, height: null, scale: null,
});

/**
 * The smallest a chat may be sized to, in px. The largest depends on the
 * viewport, so it is enforced while dragging, not here.
 */
export const WIDGET_SIZE = Object.freeze({ minWidth: 200, minHeight: 150 });

/**
 * Every setting Chat+ knows: its default, the range it is clamped into, and
 * how far one adjustment moves it - so a control never has to restate any of
 * it. A name that is not in here is not a setting: neither stored nor read.
 */
export const SETTINGS = Object.freeze({
  /** Percent a chat with no size of its own scales its messages and input to. */
  messageScale: Object.freeze({ default: 100, min: 80, max: 200, step: 10 }),
});

function emptyState() {
  return { version: STORAGE_VERSION, widgets: {}, settings: sanitizeSettings(null) };
}

/** A stored dimension: a whole number of px at or above `min`, else "Torn's size". */
function sanitizeDimension(value, min) {
  return Number.isFinite(value) ? Math.max(min, Math.round(value)) : null;
}

/** A chat's own message size: a whole percent inside the setting's range, or null for the default. */
function sanitizeScale(value) {
  if (!Number.isFinite(value)) return null;
  const { min, max } = SETTINGS.messageScale;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sanitizeWidget(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WIDGET_STATE };
  return {
    x: Number.isFinite(raw.x) ? raw.x : null,
    y: Number.isFinite(raw.y) ? raw.y : null,
    locked: typeof raw.locked === 'boolean' ? raw.locked : true,
    width: sanitizeDimension(raw.width, WIDGET_SIZE.minWidth),
    height: sanitizeDimension(raw.height, WIDGET_SIZE.minHeight),
    scale: sanitizeScale(raw.scale),
  };
}

function sanitizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const settings = {};
  for (const [name, spec] of Object.entries(SETTINGS)) {
    const value = source[name];
    settings[name] = Number.isFinite(value)
      ? Math.min(spec.max, Math.max(spec.min, value))
      : spec.default;
  }
  return settings;
}

function parseState(text) {
  if (text == null) return emptyState();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    warnOnce('storage.read', 'stored state is not valid JSON; resetting to defaults');
    return emptyState();
  }
  if (!data || typeof data !== 'object' || data.version !== STORAGE_VERSION) {
    warnOnce('storage.read', `stored state has version ${data && data.version}, expected ${STORAGE_VERSION}; resetting to defaults`);
    return emptyState();
  }
  const source = data.widgets && typeof data.widgets === 'object' ? data.widgets : {};
  const widgets = {};
  for (const id of Object.keys(source)) widgets[id] = sanitizeWidget(source[id]);
  return { version: STORAGE_VERSION, widgets, settings: sanitizeSettings(data.settings) };
}

export function createStorage({ area = globalThis.localStorage, target = globalThis.window } = {}) {
  let state = emptyState();
  const listeners = new Set();

  function read() {
    try {
      state = parseState(area ? area.getItem(STORAGE_KEY) : null);
    } catch (err) {
      warnOnce('storage.read', 'could not read stored state; using defaults:', err);
      state = emptyState();
    }
  }

  function write() {
    try {
      if (area) area.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // Quota errors repeat on every write; warn once and keep the in-memory state.
      warnOnce('storage.write', 'could not persist state:', err);
    }
  }

  function notify() {
    for (const listener of [...listeners]) {
      // A bad subscriber must never break the rest, and must not spam the console.
      try {
        listener();
      } catch (err) {
        warnOnce('storage.subscriber', 'a storage subscriber threw:', err);
      }
    }
  }

  function getWidget(id) {
    return { ...DEFAULT_WIDGET_STATE, ...(state.widgets[id] || {}) };
  }

  function setWidget(id, patch) {
    const next = sanitizeWidget({ ...getWidget(id), ...patch });
    debug('storage write', id, next);
    state.widgets[id] = next;
    write();
    notify();
    return next;
  }

  /** @returns {*} the stored value, or undefined for a name that is not a setting. */
  function getSetting(name) {
    return state.settings[name];
  }

  /** Clamps and stores `value`; unknown names are dropped. @returns the stored value. */
  function setSetting(name, value) {
    if (!Object.hasOwn(SETTINGS, name)) return undefined;
    const next = sanitizeSettings({ ...state.settings, [name]: value });
    // Nothing to persist, and no reason to make every subscriber re-apply a
    // value it is already showing.
    if (next[name] === state.settings[name]) return getSetting(name);
    state.settings = next;
    debug('storage setting', name, next[name]);
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
    if (target && typeof target.removeEventListener === 'function') {
      target.removeEventListener('storage', onStorage);
    }
    listeners.clear();
  }

  read();
  if (target && typeof target.addEventListener === 'function') {
    target.addEventListener('storage', onStorage);
  }

  return { getWidget, setWidget, getSetting, setSetting, subscribe, destroy };
}
