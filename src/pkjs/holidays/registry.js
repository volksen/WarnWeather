// src/pkjs/holidays/registry.js
//
// Maps a holiday country code to a provider. Every real country (ISO-3166-1
// alpha-2) is backed by the Nager.Date source; the 'none' sentinel and empty
// values resolve to null, which the mask builder treats as "no holidays".
// ES5 only (reaches the watch runtime).

var nagerSource = require('./nager-source.js');

/**
 * Look up the holiday provider for a country code.
 *
 * @param {string} country ISO-3166-1 alpha-2 code, or 'none'.
 * @returns {{isHoliday: Function, ensure: Function}|null} Provider, or null for none/empty.
 */
function getProvider(country) {
    if (!country || country === 'none') { return null; }
    return {
        isHoliday: function (date, region) {
            return nagerSource.isHoliday(country, region, date);
        },
        ensure: function (years, onUpdated, opts) {
            return nagerSource.ensure(country, years, onUpdated, opts);
        }
    };
}

module.exports = { getProvider: getProvider };
