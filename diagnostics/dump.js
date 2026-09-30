/*
 * Chat+ one-paste diagnostic.
 *
 * 1. On https://www.torn.com/, press F12 and click the Console tab.
 * 2. Copy this WHOLE file, paste it into the console, press Enter.
 *    (If Chrome says pasting is blocked, type  allow pasting  and press Enter
 *    first, then paste again.)
 * 3. Within 25 seconds: unlock a chat with its padlock, drag it somewhere,
 *    release. Then wait for the green "copied" message and paste the report
 *    into the chat with Claude.
 *
 * It turns the Chat+ debug trace on by itself, records everything relevant,
 * prints one report block at the end and puts it on your clipboard.
 *
 * It never prints the text of any chat message: only tag names, ids, class
 * names, styles and coordinates.
 *
 * The selectors below are deliberately duplicated from src/core/selectors.js -
 * this file has to be pasteable on its own, with nothing imported.
 */
(function chatPlusDiagnostic() {
  'use strict';

  try {
    // ------------------------------------------------------------- settings
    var DEFAULT_MS = 25000;
    var WINDOW_MS = (typeof window !== 'undefined'
      && typeof window.CHATPLUS_DUMP_MS === 'number'
      && window.CHATPLUS_DUMP_MS > 0) ? window.CHATPLUS_DUMP_MS : DEFAULT_MS;
    var SECONDS = Math.round(WINDOW_MS / 1000);
    var SAMPLE_MS = 500;
    var MAX_MUTATIONS = 80;
    var MAX_TRACE = 600;
    var MOVE_EVERY = 10;
    var CLIP = 160;

    var MINIMIZE_SELECTOR = 'svg[aria-label="Minimize"]';
    var CHAT_BOX_SELECTOR = 'div[id]';
    var CHAT_ROOT_ID = 'chatRoot';
    var LOCK_SELECTOR = '.chatplus-lock';
    var FLOATING_CLASS = 'chatplus-floating';
    var STATE_KEY = 'chatplus.state.v1';
    var DEBUG_KEY = 'chatplus.debug';

    /** A transform/filter/contain on any ancestor makes position:fixed relative to IT. */
    var CSS_PROPS = ['position', 'transform', 'filter', 'contain', 'will-change',
      'overflow', 'transition', 'transition-property'];

    var CAPTURE_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel',
      'click', 'gotpointercapture', 'lostpointercapture',
      'dragstart', 'drag', 'dragend', 'dragover', 'drop'];
    var BUBBLE_EVENTS = ['pointerdown', 'pointerup', 'pointercancel', 'click'];
    /** Streaming events: print one in MOVE_EVERY, but count every single one. */
    var THROTTLED = ['pointermove', 'drag', 'dragover'];

    // ----------------------------------------------------------- collection
    var report = [];
    var started = Date.now();
    var mutations = 0;
    var traces = 0;
    /** How many of each event type actually fired, throttling aside. */
    var counts = {};

    var origLog = console.log;
    var origWarn = console.warn;
    var origInfo = console.info;

    /** Straight to the real console, never through our wrapper. */
    function out(line) { origLog.call(console, line); }

    /** Into the report only. */
    function add(line) { report.push(line); }

    /** Into the report AND the live console, so the user sees it working. */
    function note(line) { report.push(line); out(line); }

    function stamp() {
      return '+' + ((Date.now() - started) / 1000).toFixed(2) + 's';
    }

    function clip(value) {
      var text = String(value);
      return text.length > CLIP ? text.slice(0, CLIP) + '...[' + text.length + ' chars]' : text;
    }

    /** First three class names only - enough to recognise an element. */
    function classesOf(el) {
      var raw = el && el.getAttribute ? (el.getAttribute('class') || '') : '';
      var list = String(raw).split(/\s+/).filter(Boolean).slice(0, 3);
      return list.length ? '.' + list.join('.') : '';
    }

    /** Identity only - tag, id, first 3 classes. Never text content. */
    function describe(node) {
      if (!node) return '(none)';
      if (node.nodeType === 9) return '#document';
      if (node.nodeType !== 1) return '#node' + node.nodeType;
      return String(node.tagName || '?').toLowerCase()
        + (node.id ? '#' + node.id : '')
        + classesOf(node);
    }

    function describeAll(nodes) {
      return Array.prototype.map.call(nodes || [], describe).join(', ') || '-';
    }

    /**
     * Native HTML5 drag-and-drop is on for any element with draggable="true".
     * A draggable element with no drop target that accepts it gives exactly the
     * "ghost follows the mouse, then springs back" behaviour.
     */
    function draggableOf(el) {
      if (!el || el.nodeType !== 1) return 'draggable=?';
      return 'draggable attr=' + String(el.getAttribute ? el.getAttribute('draggable') : '?')
        + ' prop=' + String(el.draggable);
    }

    /** The nearest id-bearing div around `el`, unless it is #chatRoot, as selectors.js finds it. */
    function boxOf(el) {
      var b = el && el.closest ? el.closest(CHAT_BOX_SELECTOR) : null;
      return b && b.id && b.id !== CHAT_ROOT_ID ? b : null;
    }

    /**
     * The <button> in `b` that holds the Minimize button, else the direct child
     * of `b` that holds it, as selectors.js finds it.
     */
    function headerOf(b) {
      var icon = b ? b.querySelector(MINIMIZE_SELECTOR) : null;
      if (!icon) return null;
      var button = icon.closest ? icon.closest('button') : null;
      if (button && b.contains(button)) return button;
      var n = icon;
      while (n.parentElement && n.parentElement !== b) n = n.parentElement;
      return n.parentElement === b ? n : null;
    }

    function rectOf(el) {
      if (!el || typeof el.getBoundingClientRect !== 'function') return '(none)';
      var r = el.getBoundingClientRect();
      return Math.round(r.left) + ',' + Math.round(r.top)
        + ' ' + Math.round(r.width) + 'x' + Math.round(r.height);
    }

    /** What a size bug shows up in: the computed box, its caps, and our inline style. */
    function sizeOf(el) {
      if (!el) return '(none)';
      var cs = getComputedStyle(el);
      return cs.width + ' x ' + cs.height + ' pos=' + cs.position + ' overflow=' + cs.overflow
        + ' max=' + cs.maxWidth + '/' + cs.maxHeight + ' z=' + cs.zIndex
        + ' inline="' + clip(el.getAttribute('style') || '') + '"';
    }

    function readKey(key) {
      try { return localStorage.getItem(key); } catch (err) { return '(unreadable: ' + err + ')'; }
    }

    function fmt(arg) {
      if (arg === null || arg === undefined) return String(arg);
      var kind = typeof arg;
      if (kind === 'string' || kind === 'number' || kind === 'boolean') return String(arg);
      if (arg.nodeType) return describe(arg);
      try { return clip(JSON.stringify(arg)); } catch (err) { return String(arg); }
    }

    // ------------------------------------------- 1. turn the debug trace on
    var debugOn = false;
    try {
      localStorage.setItem(DEBUG_KEY, '1');
      debugOn = readKey(DEBUG_KEY) === '1';
    } catch (err) {
      debugOn = false;
    }

    // -------------------------------- 2. capture every [Chat+] console line
    function wrapConsole(name, original) {
      console[name] = function () {
        var args = Array.prototype.slice.call(arguments);
        try {
          if (typeof args[0] === 'string' && args[0].indexOf('[Chat+]') === 0) {
            traces += 1;
            // A long drag traces one line per frame; keep the report pasteable.
            if (traces === MAX_TRACE + 1) {
              report.push('... more than ' + MAX_TRACE
                + ' [Chat+] trace lines; the rest are counted but not recorded');
            }
            if (traces <= MAX_TRACE) report.push(stamp() + ' ' + args.map(fmt).join(' '));
          }
        } catch (err) { /* our recording must never break the page's logging */ }
        return original.apply(console, args);
      };
    }
    wrapConsole('log', origLog);
    wrapConsole('warn', origWarn);
    wrapConsole('info', origInfo);

    function restoreConsole() {
      console.log = origLog;
      console.warn = origWarn;
      console.info = origInfo;
    }

    // ------------------------------------------------- 3. the static facts
    add('Chat+ diagnostic ' + new Date().toISOString());
    add('window: ' + window.innerWidth + 'x' + window.innerHeight
      + ' dpr=' + window.devicePixelRatio);
    add('userAgent: ' + clip(navigator.userAgent));
    add('debug trace enabled by this script: ' + debugOn);

    var locks = document.querySelectorAll(LOCK_SELECTOR);
    add('Chat+ padlocks (' + LOCK_SELECTOR + ') on the page: ' + locks.length
      + (locks.length ? '' : '   <-- Chat+ is not running, or it found no widgets'));

    var icons = document.querySelectorAll(MINIMIZE_SELECTOR);
    var boxes = [];
    for (var i = 0; i < icons.length; i += 1) {
      var found = boxOf(icons[i]);
      if (found && boxes.indexOf(found) === -1) boxes.push(found);
    }
    add('minimize icons (' + MINIMIZE_SELECTOR + '): ' + icons.length);
    add('chat boxes (' + CHAT_BOX_SELECTOR + '): ' + boxes.length);
    add('box ids: ' + (boxes.map(function (b) { return b.id; }).join(' | ') || '(none)'));
    boxes.forEach(function (b) {
      var wrapper = b.parentElement && b.parentElement.parentElement;
      add('size ' + b.id + ': box ' + sizeOf(b) + ' | wrapper ' + sizeOf(wrapper));
      add('  handles: ' + (b.querySelectorAll('[data-chatplus-resize]').length || 0)
        + ' sized=' + b.classList.contains('chatplus-sized')
        + ' resizable=' + b.classList.contains('chatplus-resizable'));
    });
    // The stacking chain decides what can cover the Chat+ menu on document.body.
    var chain = boxes[0] ? boxes[0].parentElement : null;
    var chainLines = [];
    while (chain && chain !== document.body) {
      var ccs = getComputedStyle(chain);
      chainLines.push(chain.tagName.toLowerCase() + (chain.id ? '#' + chain.id : '') + classesOf(chain) + ' pos=' + ccs.position + ' z=' + ccs.zIndex);
      chain = chain.parentElement;
    }
    add('stacking chain above box: ' + (chainLines.join(' > ') || '(none)'));
    add('localStorage[' + STATE_KEY + ']: ' + readKey(STATE_KEY));

    var box = boxes[0] || null;
    var middle = box ? box.parentElement : null;
    var wrapper = middle ? middle.parentElement : null;

    function printReport(text) {
      console.log('===== CHAT+ REPORT START =====\n' + text + '\n===== CHAT+ REPORT END =====');
    }

    if (!box || !wrapper) {
      restoreConsole();
      add('No expanded chat box found. Expand a chat widget and paste this again.');
      printReport(report.join('\n'));
      console.log('%c>>> No chat widget was open, so there is nothing to watch. Expand one and paste this again. <<<',
        'font-size:16px;color:red');
      return;
    }

    var header = headerOf(box);
    add('box: ' + describe(box) + '  rect ' + rectOf(box) + '  ' + draggableOf(box));
    add('header: ' + describe(header) + '  rect ' + rectOf(header) + '  ' + draggableOf(header));
    add('wrapper (box.parentElement.parentElement): ' + describe(wrapper) + '  rect ' + rectOf(wrapper));
    add('wrapper inline style: ' + clip(wrapper.getAttribute('style')));
    add('wrapper ' + draggableOf(wrapper));
    add('ancestors, wrapper -> body (a transform/filter/contain on any of them '
      + 'makes position:fixed measure from THAT element; draggable=true means '
      + 'the browser runs its own drag-and-drop on it):');
    var node = wrapper;
    var depth = 0;
    while (node && node.nodeType === 1 && depth < 40) {
      var computed = window.getComputedStyle(node);
      var bits = [];
      for (var p = 0; p < CSS_PROPS.length; p += 1) {
        bits.push(CSS_PROPS[p] + '=' + clip(computed.getPropertyValue(CSS_PROPS[p])));
      }
      add('  [' + depth + '] ' + describe(node) + '  ' + draggableOf(node));
      add('        ' + bits.join('  '));
      if (node === document.body) break;
      node = node.parentElement;
      depth += 1;
    }

    // ------------------------------------------------------ 4. the watchers
    function countMutation() {
      mutations += 1;
      if (mutations === MAX_MUTATIONS + 1) {
        note('... more than ' + MAX_MUTATIONS + ' mutations; the rest are counted but not printed');
      }
      return mutations <= MAX_MUTATIONS;
    }

    // The whole wrapper subtree plus the wrapper's parent: Torn drags chats
    // natively, and it may transform an inner element rather than the wrapper
    // we position. Capped, because a subtree is chatty.
    var attrObserver = new MutationObserver(function (list) {
      for (var a = 0; a < list.length; a += 1) {
        var m = list[a];
        if (!countMutation()) continue;
        note(stamp() + ' attr ' + m.attributeName + ' on ' + describe(m.target)
          + '\n      was: ' + clip(m.oldValue)
          + '\n      now: ' + clip(m.target.getAttribute(m.attributeName)));
      }
    });
    var ATTRS = {
      attributes: true,
      attributeFilter: ['class', 'style'],
      attributeOldValue: true,
      subtree: true,
    };
    attrObserver.observe(wrapper, ATTRS);
    if (wrapper.parentElement) {
      attrObserver.observe(wrapper.parentElement, {
        attributes: true,
        attributeFilter: ['class', 'style'],
        attributeOldValue: true,
      });
    }

    // childList only, never subtree: catches Torn replacing the wrapper
    // without printing a line for every chat message that arrives.
    var childObserver = new MutationObserver(function (list) {
      for (var c = 0; c < list.length; c += 1) {
        var m = list[c];
        if (!countMutation()) continue;
        note(stamp() + ' childList on ' + describe(m.target)
          + ' added: [' + clip(describeAll(m.addedNodes)) + ']'
          + ' removed: [' + clip(describeAll(m.removedNodes)) + ']');
      }
    });
    if (wrapper.parentElement) childObserver.observe(wrapper.parentElement, { childList: true });

    function coordsOf(event) {
      return typeof event.clientX === 'number'
        ? ' at ' + Math.round(event.clientX) + ',' + Math.round(event.clientY)
        : '';
    }

    /**
     * Once the whole dispatch has finished, say whether anything cancelled the
     * event or stopped it before it reached the document in the bubble phase.
     * Torn's own drag handler is the likely culprit for both.
     */
    function checkPropagation(event, at) {
      setTimeout(function () {
        var bubbled = event.chatplusBubbled === true;
        note(at + ' ' + event.type + ' after dispatch: defaultPrevented=' + event.defaultPrevented
          + ' reachedDocumentBubble=' + bubbled
          + (bubbled ? '' : '   <-- something called stopPropagation'));
      }, 0);
    }

    function onCapture(event) {
      var type = event.type;
      counts[type] = (counts[type] || 0) + 1;
      var throttled = THROTTLED.indexOf(type) !== -1;
      if (throttled && counts[type] % MOVE_EVERY !== 1) return;

      var target = event.target;
      var extra = '';
      if (type === 'dragstart') {
        extra = ' dataTransfer=' + (event.dataTransfer ? 'present' : 'absent')
          + (event.dataTransfer ? ' effectAllowed=' + event.dataTransfer.effectAllowed : '');
      }
      note(stamp() + ' capture ' + type + ' on ' + describe(target)
        + ' connected=' + !!(target && target.isConnected)
        + coordsOf(event)
        + extra
        + (throttled ? ' (1 in ' + MOVE_EVERY + ', #' + counts[type] + ')' : ''));
      if (type === 'pointerdown' || type === 'pointerup') {
        checkPropagation(event, stamp());
      }
    }

    function onBubble(event) {
      try { event.chatplusBubbled = true; } catch (err) { /* frozen event */ }
      note(stamp() + ' bubble  ' + event.type + ' on ' + describe(event.target)
        + ' defaultPrevented=' + event.defaultPrevented);
    }

    for (var e = 0; e < CAPTURE_EVENTS.length; e += 1) {
      document.addEventListener(CAPTURE_EVENTS[e], onCapture, true);
    }
    for (var b = 0; b < BUBBLE_EVENTS.length; b += 1) {
      document.addEventListener(BUBBLE_EVENTS[b], onBubble, false);
    }

    var lastSample = '';
    var sampler = setInterval(function () {
      var r = wrapper.getBoundingClientRect();
      var sample = Math.round(r.left) + ',' + Math.round(r.top)
        + ' connected=' + wrapper.isConnected
        + ' floating=' + !!(wrapper.classList && wrapper.classList.contains(FLOATING_CLASS));
      if (sample === lastSample) return;
      lastSample = sample;
      note(stamp() + ' wrapper at ' + sample);
    }, SAMPLE_MS);

    // ----------------------------------------------------------------- 5. go
    console.log('%c>>> Chat+ diagnostic running. Unlock a chat, drag it somewhere, release. You have '
      + SECONDS + ' seconds. <<<', 'font-size:16px;color:orange');

    setTimeout(function finish() {
      try {
        clearInterval(sampler);
        attrObserver.disconnect();
        childObserver.disconnect();
        for (var x = 0; x < CAPTURE_EVENTS.length; x += 1) {
          document.removeEventListener(CAPTURE_EVENTS[x], onCapture, true);
        }
        for (var y = 0; y < BUBBLE_EVENTS.length; y += 1) {
          document.removeEventListener(BUBBLE_EVENTS[y], onBubble, false);
        }
        restoreConsole();

        add('--- after the ' + SECONDS + ' second window ---');
        add('wrapper now: ' + describe(wrapper) + '  rect ' + rectOf(wrapper));
        add('wrapper inline style now: ' + clip(wrapper.getAttribute('style')));
        add('wrapper still connected: ' + wrapper.isConnected
          + ' | box still connected: ' + box.isConnected);
        add('localStorage[' + STATE_KEY + '] now: ' + readKey(STATE_KEY));
        add('mutations seen: ' + mutations + ' | [Chat+] trace lines seen: ' + traces);
        // A drag that produced two pointermoves and then a pointercancel is a
        // native HTML5 drag, not a pointer drag. The tally makes that obvious.
        var tally = [];
        for (var t = 0; t < CAPTURE_EVENTS.length; t += 1) {
          tally.push(CAPTURE_EVENTS[t] + '=' + (counts[CAPTURE_EVENTS[t]] || 0));
        }
        add('event tally: ' + tally.join(' '));
        add('pointermove events seen: ' + (counts.pointermove || 0)
          + ' | pointercancel: ' + (counts.pointercancel || 0)
          + ' | dragstart: ' + (counts.dragstart || 0)
          + ' | dragend: ' + (counts.dragend || 0));

        var text = report.join('\n');
        printReport(text);

        var said = function (ok) {
          if (ok) {
            console.log('%c>>> Report copied to your clipboard. Paste it into the chat with Claude. <<<',
              'font-size:16px;color:green');
          } else {
            console.log('%c>>> Copy failed: select the text between REPORT START and REPORT END and copy it manually. <<<',
              'font-size:16px;color:red');
          }
        };

        var copied = false;
        try {
          // copy() is the DevTools console API; it does not exist elsewhere.
          copied = typeof copy === 'function' && (copy(text), true);
        } catch (err) {
          copied = false;
        }

        if (copied) {
          said(true);
        } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(text).then(function () { said(true); }, function () { said(false); });
        } else {
          said(false);
        }
      } catch (err) {
        restoreConsole();
        console.log('%c>>> Chat+ diagnostic failed while finishing: ' + err + ' <<<',
          'font-size:16px;color:red');
      }
    }, WINDOW_MS);
  } catch (err) {
    console.log('%c>>> Chat+ diagnostic failed to start: ' + err + ' <<<',
      'font-size:16px;color:red');
  }
}());
