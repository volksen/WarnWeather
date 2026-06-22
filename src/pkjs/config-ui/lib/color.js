// src/pkjs/config-ui/lib/color.js — ES5. Single-place int<->hex.
function intToHex(n) { return '#' + ('000000' + (n & 0xFFFFFF).toString(16)).slice(-6).toUpperCase(); }
function hexToInt(h) { return parseInt(String(h).replace(/^#/, ''), 16); }
module.exports = { intToHex: intToHex, hexToInt: hexToInt };
