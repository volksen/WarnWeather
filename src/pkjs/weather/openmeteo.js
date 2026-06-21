var FORECAST_HOURS = 24;
var HOUR_SECONDS = 60 * 60;

/**
 * Find the index of the hourly bucket at or after the current wall-clock hour.
 *
 * @param {number[]} times Hourly timestamps in epoch seconds (ascending).
 * @param {number} nowEpoch Current time in epoch seconds.
 * @returns {number} Index of the first bucket >= the floored current hour, or -1.
 */
function anchorIndex(times, nowEpoch) {
    var hourFloor = Math.floor(nowEpoch / HOUR_SECONDS) * HOUR_SECONDS;
    var i;
    for (i = 0; i < times.length; i += 1) {
        if (times[i] >= hourFloor) {
            return i;
        }
    }
    return -1;
}

/**
 * Map an Open-Meteo forecast response into provider trend fields.
 *
 * Anchors the 24-hour window at the current wall-clock hour and slices each
 * hourly array forward from there (the window naturally spans into the next
 * day). Units pass through unconverted: the request asks Open-Meteo for °F,
 * km/h and mm directly, matching the provider unit convention.
 *
 * @param {Object} json Parsed Open-Meteo /v1/forecast response.
 * @param {number} nowEpoch Current time in epoch seconds.
 * @returns {{tempTrend: number[], precipTrend: number[], rainTrend: number[], windTrend: number[], gustTrend: number[], startTime: number, currentTemp: number}|null}
 *   Mapped fields, or null when the response is malformed or has fewer than
 *   FORECAST_HOURS buckets at/after the current hour.
 */
function mapResponse(json, nowEpoch) {
    var hourly = json && json.hourly;
    var current = json && json.current;
    var times = hourly && hourly.time;
    var anchor;

    if (!hourly || !current || !Array.isArray(times)
        || !Array.isArray(hourly.temperature_2m)
        || !Array.isArray(hourly.precipitation_probability)
        || !Array.isArray(hourly.precipitation)
        || !Array.isArray(hourly.windspeed_10m)
        || !Array.isArray(hourly.windgusts_10m)
        || typeof current.temperature_2m !== 'number') {
        return null;
    }

    anchor = anchorIndex(times, nowEpoch);
    if (anchor < 0 || times.length - anchor < FORECAST_HOURS) {
        return null;
    }

    var end = anchor + FORECAST_HOURS;
    return {
        tempTrend: hourly.temperature_2m.slice(anchor, end),
        precipTrend: hourly.precipitation_probability.slice(anchor, end).map(function(p) {
            return p / 100;
        }),
        rainTrend: hourly.precipitation.slice(anchor, end),
        windTrend: hourly.windspeed_10m.slice(anchor, end),
        gustTrend: hourly.windgusts_10m.slice(anchor, end),
        startTime: times[anchor],
        currentTemp: current.temperature_2m
    };
}

module.exports = {
    mapResponse: mapResponse
};
