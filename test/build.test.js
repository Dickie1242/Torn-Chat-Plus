import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'dist', 'chatplus.user.js');

function runBuild() {
  execFileSync(process.execPath, [path.join(root, 'build.mjs')], { cwd: root, stdio: 'pipe' });
  return readFileSync(outFile, 'utf8');
}

test('build produces a userscript starting with the metadata block', () => {
  const code = runBuild();
  assert.ok(existsSync(outFile), 'dist/chatplus.user.js should exist');
  assert.ok(code.startsWith('// ==UserScript=='), 'bundle must start with // ==UserScript==');
  assert.match(code, /\/\/ @name\s+Chat\+/);
  assert.match(code, /\/\/ @match\s+https:\/\/www\.torn\.com\/\*/);
  assert.match(code, /\/\/ @run-at\s+document-idle/);
  assert.match(code, /\/\/ @grant\s+none/);
  assert.match(code, /\/\/ ==\/UserScript==/);
  assert.match(code, /^\(\(\) => \{/m, 'bundle body must be an IIFE');
});

test('the bundle inlines the stylesheet, the selectors and the feature wiring', () => {
  const code = runBuild();
  assert.match(code, /chatplus-floating/, 'styles.css must be inlined by the text loader');
  assert.match(code, /position: fixed !important/, 'the floating rule must survive bundling');
  assert.match(code, /.chatplus-floating {[^}]*transition: none !important/, "floating must disable Torn's transform transition so a drag starts without a slide");
  assert.match(code, /.chatplus-menu {[^}]*z-index: 2147483647/, "the menu must stack above Torn's chat container, whose z-index is above 9100");
  assert.match(code, /Chat\+ lock/, 'the padlock aria-label must be in the bundle');
  assert.match(code, /chatplus\.state\.v1/, 'the storage key must be in the bundle');
  assert.match(code, /svg\[aria-label="Minimize"\]/, 'the Torn selector must be in the bundle');
  assert.match(code, /chatplus-handle--se/, 'the resize handle rules must be inlined');
  assert.match(code, /chatplus-handle--nw/, 'the corner grip rule must be inlined');
  assert.match(code, /data-chatplus-resizing/, 'the resize cursor rules must be inlined');
  assert.match(code, /Widget size/, 'the reset row label must be in the bundle');
  assert.match(code, /chatplus-header-controls/, 'the header strip rules must be inlined');
  assert.ok(!/^\s*import\s/m.test(code), 'bundled output must contain no import statements');
  assert.ok(!/^\s*export\s/m.test(code), 'bundled output must contain no export statements');
});

test('the version from the metadata block is stamped onto the injected stylesheet', () => {
  const code = runBuild();
  const declared = /^\/\/ @version\s+(\S+)/m.exec(readFileSync(path.join(root, 'src', 'header.txt'), 'utf8'));
  assert.ok(declared, 'src/header.txt must declare a @version');
  assert.match(code, /data-chatplus-version/, 'the version is stamped onto the <style> tag');
  assert.ok(
    code.includes(`"${declared[1]}"`),
    `the bundle must carry the declared version ${declared[1]}`,
  );
});
