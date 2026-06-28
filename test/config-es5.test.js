'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKJS = path.join(ROOT, 'src', 'pkjs');

// Every hand-authored watch-runtime PKJS file must be ES5: the aplite
// JavaScriptCore runtime is pre-ES6, the SDK does no babel transpilation, and
// failures are invisible on other platforms (the v1.1.0 Object.assign crash).
// Walk src/pkjs/** so new files are covered automatically — the previous
// hardcoded 12-file list silently left forecast-series/outbox/weather/* etc.
// unguarded. Exclusions:
//  - *.test.js            : run on Node, not shipped
//  - *.generated.js       : machine-generated; page.generated.js is an HTML/JS
//                           STRING (webview code, never parsed by the watch) so
//                           it false-positives; active-fixture.generated.js is
//                           data only. Fixes for either live in the generator.
//  - dev-config.js        : gitignored, dev-only, may be absent
//  - test/ , tests/ dirs  : co-located library test suites (config-ui/test)
function walk(dir) {
  let out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'test' || ent.name === 'tests') return;
      out = out.concat(walk(full));
      return;
    }
    if (!ent.name.endsWith('.js')) return;
    if (ent.name.endsWith('.test.js')) return;
    if (ent.name.endsWith('.generated.js')) return;
    if (ent.name === 'dev-config.js') return;
    out.push(full);
  });
  return out;
}

// Strip block then line comments so backticks/keywords inside JSDoc (and `//`
// inside URLs) don't false-positive. Over-stripping a `//` inside a string risks
// only a false negative, which we accept over flooding the guard with doc hits.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const FILES = walk(PKJS);

const FORBIDDEN = [
  ['arrow', /=>/],
  ['const', /\bconst\s/],
  ['let', /\blet\s/],
  ['template literal', /`/],
  ['class', /\bclass\s/],
  ['for…of', /\bfor\s*\([^;)]*\bof\b/],
  ['padStart', /\.padStart\s*\(/],
  ['padEnd', /\.padEnd\s*\(/],
  ['Object.values', /\bObject\.values\s*\(/],
  ['Object.entries', /\bObject\.entries\s*\(/],
  ['Array.from', /\bArray\.from\s*\(/],
  // Unpolyfilled ES6 built-ins (undefined at runtime on aplite → throws when the
  // line executes). NOTE: `.includes(` is intentionally NOT here — Array.includes
  // is polyfilled and legitimately used, and a regex can't tell a string receiver
  // from an array one, so String.includes stays a known gap (would need an AST).
  ['new Map', /\bnew\s+Map\s*\(/],
  ['new Set', /\bnew\s+Set\s*\(/],
  ['Promise', /\bPromise\s*[.(]/],
  ['.startsWith', /\.startsWith\s*\(/],
  ['.endsWith', /\.endsWith\s*\(/],
  ['.repeat', /\.repeat\s*\(/],
];

test('every shipped pkjs file is scanned (guard covers the whole runtime)', () => {
  assert.ok(FILES.length >= 40, 'expected the walk to find the full runtime set, got ' + FILES.length);
});

test('shipped pkjs files contain no ES6 syntax or unpolyfilled built-ins', () => {
  FILES.forEach((file) => {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    FORBIDDEN.forEach((rule) => assert.equal(src.search(rule[1]), -1,
      path.relative(ROOT, file) + ' contains forbidden ' + rule[0]));
  });
});
