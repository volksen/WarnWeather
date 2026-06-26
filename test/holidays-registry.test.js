// test/holidays-registry.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../src/pkjs/holidays/registry.js');

test('getProvider returns null for none and empty values', () => {
  assert.equal(registry.getProvider('none'), null);
  assert.equal(registry.getProvider(''), null);
  assert.equal(registry.getProvider(undefined), null);
});

test('getProvider returns an API-backed provider for any real country', () => {
  ['US', 'DE', 'GB', 'CH'].forEach((cc) => {
    const p = registry.getProvider(cc);
    assert.ok(p, cc + ' should have a provider');
    assert.equal(typeof p.isHoliday, 'function');
    assert.equal(typeof p.ensure, 'function');
  });
});
