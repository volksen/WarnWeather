const test = require('node:test');
const assert = require('node:assert/strict');
const { buildForecastSeries, applyForecastSeries } = require('../src/pkjs/forecast-series');

const RAW = { precips: [0, 50, 100], rains: [0, 5, 20] }; // precip % and rain wire tenths

test('precip line on + fill on + rain bars', () => {
  const out = buildForecastSeries(RAW, { secondaryLine: 'precip_prob', secondaryLineFill: true, barSource: 'rain' });
  assert.deepEqual(out.SECONDARY_LINE_TREND_UINT8, [0, 125, 250]); // % * 10 → permille → byte
  assert.equal(out.SECONDARY_LINE_FILL, true);
  assert.equal(typeof out.SECONDARY_LINE_COLOR, 'number');
  assert.deepEqual(out.BAR_TREND_UINT8, [0, 85, 140]);            // rainPermille(0,5,20) → byte
});

test('every wire byte is within 0..250', () => {
  const out = buildForecastSeries(RAW, { secondaryLine: 'precip_prob', secondaryLineFill: true, barSource: 'rain' });
  out.SECONDARY_LINE_TREND_UINT8.concat(out.BAR_TREND_UINT8).forEach(function(b) {
    assert.ok(b >= 0 && b <= 250, 'byte out of range: ' + b);
  });
});

test('line off → empty line trend + fill false', () => {
  const out = buildForecastSeries(RAW, { secondaryLine: 'off', secondaryLineFill: true, barSource: 'rain' });
  assert.deepEqual(out.SECONDARY_LINE_TREND_UINT8, []);
  assert.equal(out.SECONDARY_LINE_FILL, false);
});

test('bars disabled → empty bar trend', () => {
  const out = buildForecastSeries(RAW, { secondaryLine: 'precip_prob', secondaryLineFill: false, barSource: 'off' });
  assert.deepEqual(out.BAR_TREND_UINT8, []);
});

test('fill color follows the line metric: precip → CobaltBlue, off → black', () => {
  const on = buildForecastSeries(RAW, { secondaryLine: 'precip_prob', secondaryLineFill: true, barSource: 'rain' });
  assert.equal(on.SECONDARY_LINE_FILL_COLOR, 0x0055AA); // GColorCobaltBlue
  const off = buildForecastSeries(RAW, { secondaryLine: 'off', secondaryLineFill: true, barSource: 'rain' });
  assert.equal(off.SECONDARY_LINE_FILL_COLOR, 0x000000); // GColorBlack
});

test('applyForecastSeries swaps raw precip/rain keys for the render-ready series in place', () => {
  const payload = {
    TEMP_TREND_UINT8: [1, 2, 3],
    PRECIP_TREND_UINT8: [0, 50, 100],
    RAIN_TREND_UINT8: [0, 5, 20],
    NUM_ENTRIES: 3
  };
  const settings = { secondaryLine: 'precip_prob', secondaryLineFill: true, barSource: 'rain' };

  const out = applyForecastSeries(payload, settings);

  // Mutates and returns the same object the watch will ship.
  assert.equal(out, payload);
  // Dead keys the watch no longer reads are removed.
  assert.ok(!('PRECIP_TREND_UINT8' in out));
  assert.ok(!('RAIN_TREND_UINT8' in out));
  // The five render-ready series keys replace them.
  assert.deepEqual(out.SECONDARY_LINE_TREND_UINT8, [0, 125, 250]);
  assert.equal(typeof out.SECONDARY_LINE_COLOR, 'number');
  assert.equal(out.SECONDARY_LINE_FILL, true);
  assert.equal(out.SECONDARY_LINE_FILL_COLOR, 0x0055AA);
  assert.deepEqual(out.BAR_TREND_UINT8, [0, 85, 140]);
  // Unrelated keys are left untouched.
  assert.deepEqual(out.TEMP_TREND_UINT8, [1, 2, 3]);
  assert.equal(out.NUM_ENTRIES, 3);
});

test('wind line: mid scale (50 km/h) maps km/h to permille, clamped, never filled', () => {
  const raw = { precips: [], rains: [], winds: [0, 25, 50, 100] };
  const out = buildForecastSeries(raw, { secondaryLine: 'wind', windScale: 'mid', secondaryLineFill: true, barSource: 'off' });
  assert.deepEqual(out.SECONDARY_LINE_TREND_UINT8, [0, 125, 250, 250]); // 100 clamps to 250
  assert.equal(out.SECONDARY_LINE_FILL, false);            // wind ignores the fill toggle
  assert.equal(out.SECONDARY_LINE_COLOR, 0xFFFF00);        // GColorYellow
  assert.equal(out.SECONDARY_LINE_FILL_COLOR, 0xFFFF00);   // unused (fill off), set to the line color
});

test('wind line: low scale = 30 km/h ceiling', () => {
  const out = buildForecastSeries({ precips: [], rains: [], winds: [15, 30] }, { secondaryLine: 'wind', windScale: 'low', barSource: 'off' });
  assert.deepEqual(out.SECONDARY_LINE_TREND_UINT8, [125, 250]);
});

test('wind line: high scale = 70 km/h ceiling', () => {
  const out = buildForecastSeries({ precips: [], rains: [], winds: [35, 70] }, { secondaryLine: 'wind', windScale: 'high', barSource: 'off' });
  assert.deepEqual(out.SECONDARY_LINE_TREND_UINT8, [125, 250]);
});

test('wind line: missing/unknown windScale falls back to mid (no divide-by-zero)', () => {
  const out = buildForecastSeries({ precips: [], rains: [], winds: [50] }, { secondaryLine: 'wind', barSource: 'off' });
  assert.deepEqual(out.SECONDARY_LINE_TREND_UINT8, [250]); // 50/50*1000 → 1000 → 250
});

test('applyForecastSeries deletes the transient WIND_TREND_UINT8 and renders the wind series', () => {
  const payload = {
    TEMP_TREND_UINT8: [1, 2, 3],
    PRECIP_TREND_UINT8: [0, 50, 100],
    RAIN_TREND_UINT8: [0, 5, 20],
    WIND_TREND_UINT8: [0, 25, 50],
    NUM_ENTRIES: 3
  };
  const out = applyForecastSeries(payload, { secondaryLine: 'wind', windScale: 'mid', barSource: 'off' });
  assert.ok(!('WIND_TREND_UINT8' in out));   // never reaches the wire
  assert.ok(!('PRECIP_TREND_UINT8' in out));
  assert.ok(!('RAIN_TREND_UINT8' in out));
  assert.deepEqual(out.SECONDARY_LINE_TREND_UINT8, [0, 125, 250]);
  assert.equal(out.SECONDARY_LINE_FILL, false);
});

test('wind selected: gust third line shares the wind scale', () => {
  const out = buildForecastSeries(
    { precips: [0], rains: [0], winds: [0, 25, 50], gusts: [0, 50, 100] },
    { secondaryLine: 'wind', windScale: 'mid', barSource: 'off' } // mid = 50 km/h
  );
  // wind: 0/25/50 km/h @50 ceiling → 0/500/1000 → 0/125/250
  assert.deepEqual(out.SECONDARY_LINE_TREND_UINT8, [0, 125, 250]);
  // gusts: 0/50/100 km/h @ SAME 50 ceiling → 0/1000/1000 → 0/250/250 (clamped)
  assert.deepEqual(out.THIRD_LINE_TREND_UINT8, [0, 250, 250]);
  // No color is emitted — the watch draws the gust line in a fixed white.
  assert.equal('THIRD_LINE_COLOR' in out, false);
});

test('wind high scale: gusts track the 70 km/h ceiling', () => {
  const out = buildForecastSeries(
    { precips: [0], rains: [0], winds: [0], gusts: [35, 70] },
    { secondaryLine: 'wind', windScale: 'high', barSource: 'off' } // high = 70 km/h
  );
  assert.deepEqual(out.THIRD_LINE_TREND_UINT8, [125, 250]);
});

test('wind selected but gusts all zero/absent: gust line is off (no flat bottom line)', () => {
  // All-zero gust series ⇒ empty (off), while the wind line is still drawn.
  const allZero = buildForecastSeries(
    { precips: [0], rains: [0], winds: [0, 25, 50], gusts: [0, 0, 0] },
    { secondaryLine: 'wind', windScale: 'mid', barSource: 'off' }
  );
  assert.deepEqual(allZero.THIRD_LINE_TREND_UINT8, []);
  assert.deepEqual(allZero.SECONDARY_LINE_TREND_UINT8, [0, 125, 250]);
  // Absent gust array (provider supplied none) ⇒ also off, no throw.
  const absent = buildForecastSeries(
    { precips: [0], rains: [0], winds: [10, 20] },
    { secondaryLine: 'wind', windScale: 'mid', barSource: 'off' }
  );
  assert.deepEqual(absent.THIRD_LINE_TREND_UINT8, []);
});

test('wind selected, gusts just above wind: both present and distinct', () => {
  const out = buildForecastSeries(
    { precips: [0], rains: [0], winds: [20, 30], gusts: [22, 33] },
    { secondaryLine: 'wind', windScale: 'mid', barSource: 'off' } // 50 km/h
  );
  assert.deepEqual(out.SECONDARY_LINE_TREND_UINT8, [100, 150]);
  assert.deepEqual(out.THIRD_LINE_TREND_UINT8, [110, 165]);
});

test('ragged input: shorter gust array than wind does not throw', () => {
  const out = buildForecastSeries(
    { precips: [0], rains: [0], winds: [10, 20, 30], gusts: [40] },
    { secondaryLine: 'wind', windScale: 'mid', barSource: 'off' }
  );
  // Gust series is the length of the (shorter) gust input.
  assert.deepEqual(out.THIRD_LINE_TREND_UINT8, [200]);
});

test('non-wind secondary line clears the gust third line', () => {
  const precip = buildForecastSeries(
    { precips: [0, 50], rains: [0, 0], winds: [10], gusts: [20] },
    { secondaryLine: 'precip_prob', secondaryLineFill: false, barSource: 'off' }
  );
  assert.deepEqual(precip.THIRD_LINE_TREND_UINT8, []); // empty array clears it
  const off = buildForecastSeries(
    { precips: [0], rains: [0], winds: [10], gusts: [20] },
    { secondaryLine: 'off', barSource: 'off' }
  );
  assert.deepEqual(off.THIRD_LINE_TREND_UINT8, []);
});

test('applyForecastSeries deletes transient GUST_TREND_UINT8 and emits the gust line', () => {
  const payload = {
    PRECIP_TREND_UINT8: [0], RAIN_TREND_UINT8: [0],
    WIND_TREND_UINT8: [25], GUST_TREND_UINT8: [50]
  };
  const out = applyForecastSeries(payload, { secondaryLine: 'wind', windScale: 'mid', barSource: 'off' });
  assert.equal('GUST_TREND_UINT8' in out, false);
  assert.deepEqual(out.THIRD_LINE_TREND_UINT8, [250]); // 50 @ 50 ceiling → 1000 → 250
});

test('wind + gustLine off: gust third line suppressed, wind line intact', () => {
  const out = buildForecastSeries(
    { precips: [0], rains: [0], winds: [0, 25, 50], gusts: [0, 50, 100] },
    { secondaryLine: 'wind', windScale: 'mid', gustLine: false, barSource: 'off' }
  );
  assert.deepEqual(out.THIRD_LINE_TREND_UINT8, []);
  assert.deepEqual(out.SECONDARY_LINE_TREND_UINT8, [0, 125, 250]);
});

test('wind + gustLine undefined: defaults to on (gust line drawn)', () => {
  const out = buildForecastSeries(
    { precips: [0], rains: [0], winds: [0, 25, 50], gusts: [0, 50, 100] },
    { secondaryLine: 'wind', windScale: 'mid', barSource: 'off' }
  );
  assert.deepEqual(out.THIRD_LINE_TREND_UINT8, [0, 250, 250]);
});

const { permilleToByte, tempTrendToBytes } = require('../src/pkjs/forecast-series');

test('permilleToByte: 0/500/1000 permille → 0/125/250, clamped', () => {
  assert.equal(permilleToByte(0), 0);
  assert.equal(permilleToByte(500), 125);
  assert.equal(permilleToByte(1000), 250);
  assert.equal(permilleToByte(1200), 250); // clamp high
  assert.equal(permilleToByte(-50), 0);    // clamp low
});

test('tempTrendToBytes: scales across min..max to 0..250 + reports real min/max', () => {
  const r = tempTrendToBytes([10, 20, 30, 50]); // span 40
  assert.deepEqual(r.bytes, [0, 63, 125, 250]); // (t-10)*250/40 rounded
  assert.equal(r.min, 10);
  assert.equal(r.max, 50);
});

test('tempTrendToBytes: flat series → all 125, min===max', () => {
  const r = tempTrendToBytes([21, 21, 21]);
  assert.deepEqual(r.bytes, [125, 125, 125]);
  assert.equal(r.min, 21);
  assert.equal(r.max, 21);
});

test('tempTrendToBytes: negative °F handled (no negative bytes)', () => {
  const r = tempTrendToBytes([-10, 0, 10]); // span 20
  assert.deepEqual(r.bytes, [0, 125, 250]);
  assert.equal(r.min, -10);
});

test('tempTrendToBytes: empty input → empty bytes, zero min/max', () => {
  assert.deepEqual(tempTrendToBytes([]), { bytes: [], min: 0, max: 0 });
});
