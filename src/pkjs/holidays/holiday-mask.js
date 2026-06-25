//
// Builds the anchored 28-bit holiday bitmask the watch reads. The mask covers
// 4 weeks starting at the displayed grid's top-left cell (cell-0); the extra
// week beyond the visible 21 cells is forward headroom so a week rollover with
// no resend never runs off the end of the data. ES5 only (reaches the watch).

var daysFromCivil = require('./serial-day.js');
var registry = require('./registry.js');

var WINDOW_DAYS = 28; // 4 weeks; 21 visible cells + 1 week headroom.

/**
 * Index of today's calendar cell — mirrors config_n_today() on the watch.
 *
 * @param {Date} now Current local date/time.
 * @param {boolean} startMon Week starts on Monday when true.
 * @param {boolean} prevWeek Grid leads with the previous week when true.
 * @returns {number} Cell index (0-20) holding today.
 */
function todayCellIndex(now, startMon, prevWeek) {
    var wday = now.getDay(); // 0=Sun .. 6=Sat
    var adj = startMon ? (wday + 6) % 7 : wday;
    return prevWeek ? adj + 7 : adj;
}

/**
 * Build the anchored holiday bitmask for the visible calendar window.
 *
 * @param {{startMon: boolean, prevWeek: boolean, country: string, region: string, enabled: boolean}} opts
 *   Calendar layout, selected holiday country/region, and enable flag.
 * @param {Date} now Current local date/time.
 * @returns {{anchor: number, mask: number}} Serial-day anchor and 28-bit mask (0 when disabled or no provider).
 */
function build(opts, now) {
    var iToday = todayCellIndex(now, opts.startMon, opts.prevWeek);
    var cell0 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - iToday);
    var anchor = daysFromCivil(cell0.getFullYear(), cell0.getMonth() + 1, cell0.getDate());

    var mask = 0;
    var provider = registry.getProvider(opts.country);
    // No provider resolves for 'none' or any not-yet-wired country, so those
    // (and the disabled case) leave the mask empty with a still-valid anchor.
    if (opts.enabled && provider) {
        var i;
        var day;
        for (i = 0; i < WINDOW_DAYS; i++) {
            day = new Date(cell0.getFullYear(), cell0.getMonth(), cell0.getDate() + i);
            if (provider.isHoliday(day, opts.region)) {
                mask |= (1 << i);
            }
        }
    }

    return { anchor: anchor, mask: mask >>> 0 };
}

/**
 * Pack anchor + mask into 8 little-endian bytes for the HOLIDAYS AppMessage key.
 *
 * @param {number} anchor int32 serial-day anchor.
 * @param {number} mask uint32 holiday bitmask.
 * @returns {number[]} 8 byte values (0-255), LE: [anchor x4, mask x4].
 */
function pack(anchor, mask) {
    return [
        anchor & 0xFF, (anchor >>> 8) & 0xFF, (anchor >>> 16) & 0xFF, (anchor >>> 24) & 0xFF,
        mask & 0xFF, (mask >>> 8) & 0xFF, (mask >>> 16) & 0xFF, (mask >>> 24) & 0xFF
    ];
}

module.exports = { build: build, pack: pack };
