// src/pkjs/config-ui/test/engine.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/engine.js');

const FIXTURE = { appName: 'X', versionLabel: 'v0', tabs: [ { id: 't', label: 'T', sections: [ { title: 'S', items: [
  { type: 'select', messageKey: 'mode', defaultValue: 'a', options: [['A','a'],['B','b']] },
  { type: 'toggle', messageKey: 'flag', defaultValue: false, showWhen: { key: 'mode', eq: 'b' } },
  { type: 'color',  messageKey: 'tint', defaultValue: 0xFF0055 },
  { type: 'staticText' }
] } ] } ] };

test('hydrate: injected wins, defaults fill, color int default -> hex', () => {
  const S = E.hydrate(FIXTURE, { mode: 'b', tint: '#0055AA' });
  assert.equal(S.mode, 'b');
  assert.equal(S.tint, '#0055AA');
  const D = E.hydrate(FIXTURE, {});
  assert.equal(D.tint, '#FF0055');   // default int -> hex
  assert.equal(D.flag, false);
});

test('serialize: every messageKey incl. showWhen-hidden; staticText skipped; colors stay hex', () => {
  const out = E.serialize(FIXTURE, E.hydrate(FIXTURE, {}));
  ['mode','flag','tint'].forEach((k) => assert.ok(Object.prototype.hasOwnProperty.call(out, k), 'dropped ' + k));
  assert.equal(out.tint, '#FF0055');
});

test('blocks registry: register/get; unknown id -> undefined', () => {
  E.blocks.register('demo', (state) => '<b>' + state.mode + '</b>');
  assert.equal(typeof E.blocks.get('demo'), 'function');
  assert.equal(E.blocks.get('nope'), undefined);
});

test('hooks registry: onLoad/onSubmit run with ctx', () => {
  let loaded = false, submitted = false;
  E.hooks.onLoad(() => { loaded = true; });
  E.hooks.onSubmit(() => { submitted = true; });
  E.hooks.runLoad({}); E.hooks.runSubmit({});
  assert.ok(loaded && submitted);
});
