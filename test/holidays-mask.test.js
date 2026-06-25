// test/holidays-mask.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const holidayMask = require('../src/pkjs/holidays/holiday-mask.js');
const daysFromCivil = require('../src/pkjs/holidays/serial-day.js');

// 2026-06-25 is a Thursday (getDay() === 4).
const JUN_25_2026 = new Date(2026, 5, 25);

test('anchor is grid cell-0 for the four weekStart/firstWeek combos', () => {
  // Sun-start, current-week-first: iToday = 4 → cell-0 = Jun 21.
  assert.equal(holidayMask.build({ startMon: false, prevWeek: false, enabled: true }, JUN_25_2026).anchor,
    daysFromCivil(2026, 6, 21));
  // Sun-start, prev-week-first: iToday = 11 → cell-0 = Jun 14.
  assert.equal(holidayMask.build({ startMon: false, prevWeek: true, enabled: true }, JUN_25_2026).anchor,
    daysFromCivil(2026, 6, 14));
  // Mon-start, current-week-first: adj = 3 → cell-0 = Jun 22.
  assert.equal(holidayMask.build({ startMon: true, prevWeek: false, enabled: true }, JUN_25_2026).anchor,
    daysFromCivil(2026, 6, 22));
  // Mon-start, prev-week-first: adj = 3, iToday = 10 → cell-0 = Jun 15.
  assert.equal(holidayMask.build({ startMon: true, prevWeek: true, enabled: true }, JUN_25_2026).anchor,
    daysFromCivil(2026, 6, 15));
});

test('sets the bit for the observed Independence Day (Fri Jul 3 2026) in the window', () => {
  const result = holidayMask.build({ startMon: false, prevWeek: false, enabled: true }, JUN_25_2026);
  const bit = daysFromCivil(2026, 7, 3) - result.anchor; // within the 28-day window
  assert.ok(bit >= 0 && bit < 28);
  assert.equal((result.mask >>> bit) & 1, 1);
  // The actual Saturday Jul 4 is NOT set.
  const bitSat = daysFromCivil(2026, 7, 4) - result.anchor;
  assert.equal((result.mask >>> bitSat) & 1, 0);
});

test('disabled yields mask 0 but a valid anchor', () => {
  const result = holidayMask.build({ startMon: false, prevWeek: false, enabled: false }, JUN_25_2026);
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
