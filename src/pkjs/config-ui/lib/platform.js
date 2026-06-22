// src/pkjs/config-ui/lib/platform.js — ES5. Pebble platform facts (the only platform->color SoT).
var BW_PLATFORMS = { aplite: true, diorite: true, flint: true };
function isColorPlatform(platform) { return !BW_PLATFORMS[platform]; }
function computeEnv(watchInfo) {
  var p = watchInfo && watchInfo.platform ? watchInfo.platform : '';
  return { color: isColorPlatform(p), round: p === 'chalk', platform: p };
}
module.exports = { isColorPlatform: isColorPlatform, computeEnv: computeEnv };
