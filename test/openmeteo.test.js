// test/openmeteo.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const openmeteo = require('../src/pkjs/weather/openmeteo.js');
const mapResponse = openmeteo.mapResponse;

// BASE is hour-aligned: 1718841600 / 3600 === 477456 exactly.
const BASE = 1718841600;

/**
 * Build a synthetic 48-bucket Open-Meteo forecast response.
 * @returns {Object} A response shaped like api.open-meteo.com/v1/forecast.
 */
function sampleResponse() {
  const time = [];
  const temperature_2m = [];
  const precipitation_probability = [];
  const precipitation = [];
  const windspeed_10m = [];
  const windgusts_10m = [];
  for (let i = 0; i < 48; i += 1) {
    time.push(BASE + i * 3600);
    temperature_2m.push(50 + i);
    precipitation_probability.push(i);
    precipitation.push(i);
    windspeed_10m.push(i);
    windgusts_10m.push(i + 5);
  }
  return {
    current: { temperature_2m: 71.5 },
    hourly: {
      time: time,
      temperature_2m: temperature_2m,
      precipitation_probability: precipitation_probability,
      precipitation: precipitation,
      windspeed_10m: windspeed_10m,
      windgusts_10m: windgusts_10m
    }
  };
}

test('mapResponse anchors at the current hour and returns 24-length trends', () => {
  // nowEpoch is 18:10 into the window -> floors to bucket index 18.
  const nowEpoch = BASE + 18 * 3600 + 600;
  const out = mapResponse(sampleResponse(), nowEpoch);

  assert.equal(out.tempTrend.length, 24);
  assert.equal(out.precipTrend.length, 24);
  assert.equal(out.rainTrend.length, 24);
  assert.equal(out.windTrend.length, 24);
  assert.equal(out.gustTrend.length, 24);

  // Bucket 18 is the first slot; bucket 41 is the last (spans into tomorrow).
  assert.equal(out.startTime, BASE + 18 * 3600);
  assert.equal(out.tempTrend[0], 68);   // 50 + 18
  assert.equal(out.tempTrend[23], 91);  // 50 + 41
  assert.equal(out.precipTrend[0], 18 / 100); // probability 18% -> 0.18 fraction
  assert.equal(out.rainTrend[0], 18);   // mm passthrough
  assert.equal(out.windTrend[0], 18);   // km/h passthrough
  assert.equal(out.gustTrend[0], 23);   // (18 + 5) km/h passthrough
  assert.equal(out.currentTemp, 71.5);
  // Element [1] proves the per-element transform applies across the whole slice.
  assert.equal(out.tempTrend[1], 69);          // 50 + 19
  assert.equal(out.precipTrend[1], 19 / 100);  // probability 19% at bucket 19
});

test('mapResponse returns null when fewer than 24 buckets remain after the anchor', () => {
  // Anchor at bucket 30 -> only 18 buckets left in a 48-bucket response.
  const nowEpoch = BASE + 30 * 3600;
  assert.equal(mapResponse(sampleResponse(), nowEpoch), null);
});

test('mapResponse returns null on malformed input', () => {
  assert.equal(mapResponse({}, BASE), null);
  assert.equal(mapResponse({ hourly: {} }, BASE), null);
  assert.equal(mapResponse(null, BASE), null);
});

const WeatherProvider = require('../src/pkjs/weather/provider.js');
const OpenMeteoProvider = openmeteo.OpenMeteoProvider;

test('OpenMeteoProvider has the expected identity and inherits the base class', () => {
  const p = new OpenMeteoProvider();
  assert.equal(p.id, 'openmeteo');
  assert.equal(p.name, 'Open-Meteo');
  assert.ok(p instanceof WeatherProvider);
  assert.equal(typeof p.withProviderData, 'function');
  // Sun events are inherited (no override), like dwd.js.
  assert.equal(p.withSunEvents, WeatherProvider.prototype.withSunEvents);
});
