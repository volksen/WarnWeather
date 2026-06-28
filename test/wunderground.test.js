const test = require('node:test');
const assert = require('node:assert/strict');

var store = { wundergroundApiKey: 'k' };   // pre-seed so withApiKey skips the scrape
global.localStorage = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function(k, v) { store[k] = String(v); },
  removeItem: function(k) { delete store[k]; }
};

const WeatherProvider = require('../src/pkjs/weather/provider.js');
var responder;
WeatherProvider.request = function(url, type, onSuccess, onError) { responder(url, onSuccess, onError); };
const WundergroundProvider = require('../src/pkjs/weather/wunderground.js');

function round4(n) { return Math.round(n * 10000) / 10000; }

function respondWith(forecasts, currentTemp) {
  return function(url, onSuccess) {
    if (url.indexOf('/wx/observations/current') !== -1) {
      onSuccess(JSON.stringify({ temperature: currentTemp }));
      return;
    }
    onSuccess(JSON.stringify({ forecasts: forecasts }));
  };
}

test('WU maps the hourly forecast with inches→mm and mph→km/h conversions', () => {
  responder = respondWith([
    { temp: 50, pop: 40, qpf: 0.1, wspd: 10, gust: 20, uv_index: 3, fcst_valid: 1700000000 },
    { temp: 60, pop: 0, qpf: 0, wspd: 0, gust: null, uv_index: 0, fcst_valid: 1700003600 }
  ], 71);
  const p = new WundergroundProvider();
  var ok = false;
  p.withProviderData(0, 0, false, function() { ok = true; }, function(f) { throw new Error('unexpected failure ' + JSON.stringify(f)); });

  assert.equal(ok, true, 'onSuccess fires');
  assert.deepEqual(p.tempTrend, [50, 60], 'temp passthrough (units=e, °F)');
  assert.deepEqual(p.precipTrend, [0.4, 0], 'pop /100');
  assert.equal(round4(p.rainTrend[0]), 2.54, 'qpf inches→mm (0.1 × 25.4)');
  assert.equal(p.rainTrend[1], 0);
  assert.equal(round4(p.windTrend[0]), 16.0934, 'wind mph→km/h');
  assert.equal(round4(p.gustTrend[0]), 32.1868, 'gust mph→km/h (max(20,10))');
  assert.equal(p.startTime, 1700000000, 'startTime = forecast[0].fcst_valid');
  assert.equal(p.currentTemp, 71, 'currentTemp from the current observation');
});

test('WU gust falls back to wind speed when gust is null', () => {
  responder = respondWith([
    { temp: 50, pop: 0, qpf: 0, wspd: 15, gust: null, uv_index: 0, fcst_valid: 1700000000 }
  ], 50);
  const p = new WundergroundProvider();
  p.withProviderData(0, 0, false, function() {}, function(f) { throw new Error('unexpected failure ' + JSON.stringify(f)); });
  assert.equal(round4(p.gustTrend[0]), 24.1401, 'null gust → wind speed (15 mph → km/h)');
});
