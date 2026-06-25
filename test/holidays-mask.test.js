// test/holidays-mask.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const holidayMask = require('../src/pkjs/holidays/holiday-mask.js');
const daysFromCivil = require('../src/pkjs/holidays/serial-day.js');

// 2026-06-25 is a Thursday (getDay() === 4).
const JUN_25_2026 = new Date(2026, 5, 25);

test('anchor is grid cell-0 for the four weekStart/firstWeek combos', () => {
  const base = { country: 'US', region: 'all', enabled: true };
  assert.equal(holidayMask.build(Object.assign({}, base, { startMon: false, prevWeek: false }), JUN_25_2026).anchor,
    daysFromCivil(2026, 6, 21));
  assert.equal(holidayMask.build(Object.assign({}, base, { startMon: false, prevWeek: true }), JUN_25_2026).anchor,
    daysFromCivil(2026, 6, 14));
  assert.equal(holidayMask.build(Object.assign({}, base, { startMon: true, prevWeek: false }), JUN_25_2026).anchor,
    daysFromCivil(2026, 6, 22));
  assert.equal(holidayMask.build(Object.assign({}, base, { startMon: true, prevWeek: true }), JUN_25_2026).anchor,
    daysFromCivil(2026, 6, 15));
});

test('US sets the bit for the observed Independence Day (Fri Jul 3 2026)', () => {
  const result = holidayMask.build({ startMon: false, prevWeek: false, country: 'US', region: 'all', enabled: true }, JUN_25_2026);
  const bit = daysFromCivil(2026, 7, 3) - result.anchor;
  assert.ok(bit >= 0 && bit < 28);
  assert.equal((result.mask >>> bit) & 1, 1);
  const bitSat = daysFromCivil(2026, 7, 4) - result.anchor;
  assert.equal((result.mask >>> bitSat) & 1, 0);
});

test('US region is accepted and does not change the (nationwide) federal result', () => {
  const all = holidayMask.build({ startMon: false, prevWeek: false, country: 'US', region: 'all', enabled: true }, JUN_25_2026);
  const ca = holidayMask.build({ startMon: false, prevWeek: false, country: 'US', region: 'US-CA', enabled: true }, JUN_25_2026);
  assert.equal(ca.mask, all.mask);
  assert.equal(ca.anchor, all.anchor);
});

test('country none yields mask 0 with a valid anchor', () => {
  const result = holidayMask.build({ startMon: false, prevWeek: false, country: 'none', region: 'all', enabled: true }, JUN_25_2026);
  assert.equal(result.mask, 0);
  assert.equal(result.anchor, daysFromCivil(2026, 6, 21));
});

test('a country with no provider (DE) yields mask 0 with a valid anchor', () => {
  const result = holidayMask.build({ startMon: false, prevWeek: false, country: 'DE', region: 'all', enabled: true }, JUN_25_2026);
  assert.equal(result.mask, 0);
  assert.equal(result.anchor, daysFromCivil(2026, 6, 21));
});

test('disabled yields mask 0 but a valid anchor', () => {
  const result = holidayMask.build({ startMon: false, prevWeek: false, country: 'US', region: 'all', enabled: false }, JUN_25_2026);
  assert.equal(result.mask, 0);
  assert.equal(result.anchor, daysFromCivil(2026, 6, 21));
});

test('pack is little-endian and round-trips', () => {
  const bytes = holidayMask.pack(0x01020304, 0xAABBCCDD);
  assert.deepEqual(bytes, [0x04, 0x03, 0x02, 0x01, 0xDD, 0xCC, 0xBB, 0xAA]);
  const anchor = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
  const mask = (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0;
  assert.equal(anchor, 0x01020304);
  assert.equal(mask, 0xAABBCCDD);
});
