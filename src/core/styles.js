import cssText from '../styles.css';
import { VERSION, VERSION_ATTR } from './version.js';

/**
 * Chat+ has one stylesheet for the whole userscript (src/styles.css, inlined as
 * text by esbuild), injected once at boot. Features and the menu all draw from
 * it, so nothing has to care who got there first.
 */
const STYLE_ELEMENT_ID = 'chatplus-styles';

export function injectStyles(doc) {
  if (!doc || doc.getElementById(STYLE_ELEMENT_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.setAttribute(VERSION_ATTR, VERSION);
  style.textContent = cssText;
  (doc.head || doc.documentElement).appendChild(style);
}
