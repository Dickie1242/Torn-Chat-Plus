/**
 * The userscript version, lifted from src/header.txt at build time by
 * build.mjs so the two can never drift apart.
 *
 * It is stamped onto the injected <style> tag, which is the only thing Chat+
 * leaves in the document that a pasted console diagnostic can find - the
 * ==UserScript== metadata block is not readable from the page.
 */
/* global __CHATPLUS_VERSION__ */
export const VERSION = typeof __CHATPLUS_VERSION__ === 'string' ? __CHATPLUS_VERSION__ : 'dev';

/** Attribute the version is published under, for diagnostics/dump.js. */
export const VERSION_ATTR = 'data-chatplus-version';
