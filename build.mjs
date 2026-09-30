import { build, context } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const header = (await readFile(path.join(root, 'src', 'header.txt'), 'utf8')).trimEnd();

// The metadata block is the single source of truth for the version; the bundle
// stamps it onto the injected <style> so diagnostics/dump.js can report which
// build is actually running on the page.
const versionMatch = /^\/\/ @version\s+(\S+)/m.exec(header);
const version = versionMatch ? versionMatch[1] : 'dev';

const options = {
  absWorkingDir: root,
  entryPoints: ['src/main.js'],
  outfile: 'dist/chatplus.user.js',
  bundle: true,
  format: 'iife',
  target: ['chrome100', 'firefox100'],
  loader: { '.css': 'text' },
  define: { __CHATPLUS_VERSION__: JSON.stringify(version) },
  banner: { js: header },
  legalComments: 'none',
  logLevel: 'warning',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[Chat+] watching src/ ...');
} else {
  await build(options);
  console.log('[Chat+] built dist/chatplus.user.js');
}
