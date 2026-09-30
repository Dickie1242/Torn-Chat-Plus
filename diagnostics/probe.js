/*
 * Chat+ structure probe: what does Torn's chat look like right now?
 *
 * Use this when a Torn update breaks Chat+ and dump.js finds no chats. It does
 * not rely on any selector from src/core/selectors.js, so it still works after
 * Torn changes its markup.
 *
 * 1. On https://www.torn.com/ open at least one chat, press F12, Console tab.
 * 2. Paste this WHOLE file, press Enter. (If Chrome blocks pasting, type
 *    allow pasting  and press Enter first.)
 * 3. The report is on your clipboard: paste it into the chat with Claude.
 *
 * It never prints message text: only tags, ids, classes, aria labels and
 * inline styles.
 */
(function chatPlusProbe() {
  'use strict';

  var MAX_DEPTH = 14;
  var MAX_CHILDREN = 6;
  var MAX_LINES = 400;
  var CLIP = 120;
  var out = [];

  function add(line) { out.push(line); }
  function clip(s) { s = String(s); return s.length > CLIP ? s.slice(0, CLIP) + '...' : s; }

  function describe(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    var cls = typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '');
    if (cls.trim()) s += '.' + cls.trim().split(/\s+/).join('.');
    ['aria-label', 'role', 'title', 'type', 'draggable'].forEach(function (a) {
      if (el.hasAttribute(a)) s += ' [' + a + '="' + clip(el.getAttribute(a)) + '"]';
    });
    for (var i = 0; i < el.attributes.length; i++) {
      var name = el.attributes[i].name;
      if (name.indexOf('data-') === 0) s += ' [' + name + '="' + clip(el.attributes[i].value) + '"]';
    }
    var style = el.getAttribute('style');
    if (style) s += ' {' + clip(style) + '}';
    return s;
  }

  function tree(el, depth) {
    if (out.length >= MAX_LINES) return;
    var pad = new Array(depth + 1).join('  ');
    var kids = el.children;
    add(pad + describe(el) + (kids.length ? '  (' + kids.length + ' children)' : ''));
    if (depth >= MAX_DEPTH || el.tagName === 'svg') return;
    var shown = Math.min(kids.length, MAX_CHILDREN);
    for (var i = 0; i < shown; i++) tree(kids[i], depth + 1);
    if (kids.length > shown) add(pad + '  ... ' + (kids.length - shown) + ' more');
  }

  function chain(el, stop) {
    var parts = [];
    for (var n = el; n && n !== stop && n !== document.body; n = n.parentElement) parts.push(describe(n));
    return parts;
  }

  try {
    add('Chat+ probe  ' + new Date().toISOString() + '  ' + location.pathname);
    add('viewport ' + innerWidth + 'x' + innerHeight + '  ' + navigator.userAgent);

    var style = document.getElementById('chatplus-styles');
    add('Chat+ stylesheet: ' + (style
      ? 'present, version ' + style.getAttribute('data-chatplus-version')
      : 'MISSING (the script did not boot)'));
    add('Chat+ padlocks: ' + document.querySelectorAll('.chatplus-lock').length);
    add('old anchor svg[aria-label="Minimize"]: '
      + document.querySelectorAll('svg[aria-label="Minimize"]').length);

    var root = document.getElementById('chatRoot');
    add('#chatRoot: ' + (root ? 'found' : 'MISSING'));
    if (!root) {
      var guesses = document.querySelectorAll('[id*="chat" i], [class*="chat" i]');
      add('elements with "chat" in id/class: ' + guesses.length);
      for (var g = 0; g < Math.min(guesses.length, 15); g++) add('  ' + describe(guesses[g]));
      root = document.body;
    }

    add('');
    add('--- every aria-label under the chat root (label: count, tags)');
    var labels = {};
    root.querySelectorAll('[aria-label]').forEach(function (el) {
      var key = el.getAttribute('aria-label');
      var entry = labels[key] || (labels[key] = { n: 0, tags: {} });
      entry.n++;
      entry.tags[el.tagName.toLowerCase()] = true;
    });
    Object.keys(labels).forEach(function (k) {
      add('  "' + clip(k) + '": ' + labels[k].n + ', ' + Object.keys(labels[k].tags).join('/'));
    });

    add('');
    add('--- ancestor chains of window-control icons (innermost first)');
    var controls = root.querySelectorAll('[aria-label]');
    var shownChains = 0;
    for (var c = 0; c < controls.length && shownChains < 4; c++) {
      if (!/minim|close|collapse|hide|expand/i.test(controls[c].getAttribute('aria-label'))) continue;
      shownChains++;
      add('chain ' + shownChains + ':');
      chain(controls[c], root).forEach(function (line, i) { add('  ' + i + ' ' + line); });
    }
    if (!shownChains) add('  none found');

    add('');
    add('--- elements with an id containing "-" (old chat box match)');
    var ids = root.querySelectorAll('[id*="-"]');
    for (var d = 0; d < Math.min(ids.length, 12); d++) add('  ' + describe(ids[d]));
    if (!ids.length) add('  none');

    add('');
    add('--- chat root tree (' + MAX_CHILDREN + ' children per node, depth ' + MAX_DEPTH + ')');
    tree(root, 0);
    if (out.length >= MAX_LINES) add('... truncated at ' + MAX_LINES + ' lines');
  } catch (err) {
    add('PROBE ERROR: ' + (err && err.stack || err));
  }

  var text = out.join('\n');
  console.log(text);
  try {
    copy(text);
    console.log('%c[Chat+ probe] report copied to your clipboard', 'color: #2e7d32; font-weight: bold');
  } catch (e) {
    console.log('[Chat+ probe] could not copy: select the text above and copy it by hand');
  }
})();
