var rainTier = require('./weather/rain-tier');
var COLORS = require('./pebble-colors');

/**
 * Quantize a permille value (0..1000) to a 0..250 byte for the wire.
 * @param {number} pm Permille value.
 * @returns {number} Byte 0..250.
 */
function permilleToByte(pm) {
    var b = Math.round(pm / 4);
    if (b < 0) { b = 0; }
    if (b > 250) { b = 250; }
    return b;
}

/**
 * Scale a temperature series to 0..250 bytes across its own min..max, and
 * report the real min/max (for the watch's hi/lo labels).
 * @param {number[]} temps Whole-degree temperatures.
 * @returns {{bytes: number[], min: number, max: number}} Scaled bytes + real range.
 */
function tempTrendToBytes(temps) {
    var min = Infinity, max = -Infinity, i;
    for (i = 0; i < temps.length; i += 1) {
        if (temps[i] < min) { min = temps[i]; }
        if (temps[i] > max) { max = temps[i]; }
    }
    if (!isFinite(min)) { return { bytes: [], min: 0, max: 0 }; }
    var span = max - min;
    var bytes = [];
    for (i = 0; i < temps.length; i += 1) {
        if (span === 0) { bytes.push(125); continue; }
        var b = Math.round((temps[i] - min) * 250 / span);
        if (b < 0) { b = 0; }
        if (b > 250) { b = 250; }
        bytes.push(b);
    }
    return { bytes: bytes, min: min, max: max };
}

// Metric → line color (0xRRGGBB). Hardcoded per metric (not user-selectable).
var LINE_COLORS = { precip_prob: COLORS.GColorPictonBlue, wind: COLORS.GColorYellow };
// Metric → area-fill color (0xRRGGBB), parallel to LINE_COLORS. Precip is the
// pre-refactor CobaltBlue; the watch handles the B&W (dithered gray) fallback.
// (Wind is never filled, so it has no FILL_COLORS entry.)
var FILL_COLORS = { precip_prob: COLORS.GColorCobaltBlue };

// windScale → km/h ceiling at the top of the graph. Single source of truth; the
// watch only ever sees the resulting permille series, never the raw km/h.
var WIND_SCALE_KMH = { low: 30, mid: 50, high: 70 };

/**
 * Scale a km/h series to permille (0..1000) against a km/h ceiling, clamped to
 * the graph top. Shared by the wind line and the gust third line so both use one
 * vertical scale.
 * @param {number[]} arr Per-hour values in km/h.
 * @param {number} max km/h ceiling mapped to permille 1000.
 * @returns {number[]} Permille values, each clamped to 0..1000.
 */
function scaleToPermille(arr, max) {
    return (arr || []).map(function(kmh) {
        var permille = Math.round((Number(kmh) || 0) / max * 1000);
        if (permille < 0) { permille = 0; }
        if (permille > 1000) { permille = 1000; }   // clamp to the top of the graph
        return permille;
    });
}

/**
 * Map raw provider series + settings to the render-ready forecast wire fields.
 * The watch draws whatever series + colors it is handed; PKJS owns which metric
 * feeds the line vs the bars. Trends are returned as uint8 byte arrays (0..250)
 * ready for sendAppMessage; an off/disabled element is an empty array.
 * @param {{precips: number[], rains: number[], winds: number[], gusts: number[]}} raw Raw precip %, rain tenths, wind km/h, gust km/h.
 * @param {{secondaryLine: string, secondaryLineFill: boolean, barSource: string, windScale: string, gustLine: boolean}} settings Settings.
 * @returns {Object} Wire fields: SECONDARY_LINE_TREND_UINT8, SECONDARY_LINE_COLOR,
 *   SECONDARY_LINE_FILL_COLOR, SECONDARY_LINE_FILL, THIRD_LINE_TREND_UINT8, BAR_TREND_UINT8.
 */
function buildForecastSeries(raw, settings) {
    var out = {};
    if (settings.secondaryLine === 'precip_prob') {
        out.SECONDARY_LINE_TREND_UINT8 = raw.precips.map(function(p) { return permilleToByte(p * 10); }); // %→permille→byte
        out.SECONDARY_LINE_COLOR = LINE_COLORS.precip_prob;
        out.SECONDARY_LINE_FILL_COLOR = FILL_COLORS.precip_prob;
        out.SECONDARY_LINE_FILL = Boolean(settings.secondaryLineFill);
        out.THIRD_LINE_TREND_UINT8 = [];   // gust line off unless secondaryLine === 'wind'
    } else if (settings.secondaryLine === 'wind') {
        var max = WIND_SCALE_KMH[settings.windScale] || WIND_SCALE_KMH.mid; // km/h ceiling
        out.SECONDARY_LINE_TREND_UINT8 = scaleToPermille(raw.winds, max).map(permilleToByte);
        out.SECONDARY_LINE_COLOR = LINE_COLORS.wind;
        out.SECONDARY_LINE_FILL_COLOR = LINE_COLORS.wind;  // unused (fill off); set to the line color
        out.SECONDARY_LINE_FILL = false;                   // wind is always line-only
        // Gust line is opt-out: when gustLine is off, send an empty third line.
        out.THIRD_LINE_TREND_UINT8 = [];
        if (settings.gustLine !== false) {
            var gustPermille = scaleToPermille(raw.gusts, max);
            var hasGust = false;
            for (var gi = 0; gi < gustPermille.length; gi += 1) {
                if (gustPermille[gi] > 0) { hasGust = true; break; }
            }
            out.THIRD_LINE_TREND_UINT8 = hasGust ? gustPermille.map(permilleToByte) : [];
        }
    } else {
        out.SECONDARY_LINE_TREND_UINT8 = [];
        out.SECONDARY_LINE_COLOR = COLORS.GColorBlack;
        out.SECONDARY_LINE_FILL_COLOR = COLORS.GColorBlack;
        out.SECONDARY_LINE_FILL = false;
        out.THIRD_LINE_TREND_UINT8 = [];   // gust line off unless secondaryLine === 'wind'
    }
    if (settings.barSource === 'rain') {
        out.BAR_TREND_UINT8 = raw.rains.map(rainTier.rainPermille).map(permilleToByte);
    } else {
        out.BAR_TREND_UINT8 = [];
    }
    return out;
}

/**
 * Replace a weather payload's raw precip/rain/wind/gust trend keys with the
 * render-ready secondary-line + third-line + bar wire series the watch actually
 * reads. Mutates and returns the payload. Both the live-fetch and fixture send
 * paths call this so the two can't drift — the watch dropped
 * PRECIP_TREND_UINT8/RAIN_TREND_UINT8, so a path that skips this ships a payload
 * that renders temperature-only.
 * @param {Object} payload Weather payload carrying PRECIP_TREND_UINT8 + RAIN_TREND_UINT8 + WIND_TREND_UINT8 + GUST_TREND_UINT8.
 * @param {{secondaryLine: string, secondaryLineFill: boolean, barSource: string, windScale: string, gustLine: boolean}} settings Clay settings.
 * @returns {Object} The same payload, with the raw keys removed and the six series keys set
 *   (SECONDARY_LINE_TREND_UINT8, SECONDARY_LINE_COLOR, SECONDARY_LINE_FILL,
 *   SECONDARY_LINE_FILL_COLOR, THIRD_LINE_TREND_UINT8, BAR_TREND_UINT8).
 */
function applyForecastSeries(payload, settings) {
    var series = buildForecastSeries(
        { precips: payload.PRECIP_TREND_UINT8, rains: payload.RAIN_TREND_UINT8,
          winds: payload.WIND_TREND_UINT8, gusts: payload.GUST_TREND_UINT8 },
        settings
    );
    delete payload.PRECIP_TREND_UINT8;
    delete payload.RAIN_TREND_UINT8;
    delete payload.WIND_TREND_UINT8;  // transient PKJS-only key; never goes over the wire
    delete payload.GUST_TREND_UINT8;  // transient PKJS-only key; never goes over the wire
    payload.SECONDARY_LINE_TREND_UINT8 = series.SECONDARY_LINE_TREND_UINT8;
    payload.SECONDARY_LINE_COLOR = series.SECONDARY_LINE_COLOR;
    payload.SECONDARY_LINE_FILL = series.SECONDARY_LINE_FILL;
    payload.SECONDARY_LINE_FILL_COLOR = series.SECONDARY_LINE_FILL_COLOR;
    payload.THIRD_LINE_TREND_UINT8 = series.THIRD_LINE_TREND_UINT8;
    payload.BAR_TREND_UINT8 = series.BAR_TREND_UINT8;
    return payload;
}

module.exports = {
    buildForecastSeries: buildForecastSeries,
    applyForecastSeries: applyForecastSeries,
    permilleToByte: permilleToByte,
    tempTrendToBytes: tempTrendToBytes
};
