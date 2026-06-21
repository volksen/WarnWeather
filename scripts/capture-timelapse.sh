#!/usr/bin/env bash

set -euo pipefail

# Capture the two-phase time-lapse on all five platforms. watch.now is
# compile-time, so every frame is its own build; a build produces one
# multi-platform .pbw, so we build each fixture once up front and stash its
# .pbw, then capture platform-by-platform. Within a platform the live emulator
# is reused across every frame (a plain reinstall, no kill); `pebble kill` is
# only run when switching platforms — and as a force-reap of QEMU/pypkjs
# stragglers, because plain `pebble kill` leaves them alive (esp. emery) and
# running all five emulators at once wedges the slow-booting flint.
# RUN ON THE MAC (needs the Pebble SDK + emulator).
#
# Stashed .pbws are reused on re-run (fixtures are deterministic), so a capture
# that dies partway only needs to re-capture, not rebuild. Delete
# build/timelapse-pbw to force a full rebuild.
#
# Usage:   scripts/capture-timelapse.sh <version>
# Example: scripts/capture-timelapse.sh v1.1.0

if [[ $# -lt 1 ]]; then
  printf 'Usage: %s <version>\n' "$0" >&2
  exit 1
fi

version="$1"
platforms=(emery basalt aplite diorite flint)
frames_root="screenshot/$version/timelapse/frames"
pbw_dir="build/timelapse-pbw"

# Run `pebble screenshot` with a 30s bound so a wedged emulator can't hang the
# capture forever. Uses timeout/gtimeout when present (GNU coreutils), else a
# portable bash watchdog so no external dependency is required on stock macOS.
screenshot_bounded() {
  local out="$1" plat="$2"
  if command -v timeout >/dev/null 2>&1; then
    timeout 30 pebble screenshot "$out" --emulator "$plat"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout 30 pebble screenshot "$out" --emulator "$plat"
  else
    pebble screenshot "$out" --emulator "$plat" &
    local pid=$!
    ( sleep 30; kill "$pid" 2>/dev/null ) &
    local watcher=$!
    local rc=0
    wait "$pid" 2>/dev/null || rc=$?
    kill "$watcher" 2>/dev/null || true
    wait "$watcher" 2>/dev/null || true
    return "$rc"
  fi
}

# `pebble kill` sometimes leaves the heavy QEMU/pypkjs processes alive (especially
# emery), which wedges the next install. Force-reap any stragglers too. Only run
# this when switching platforms or recovering from a wedge — never between frames
# of the same platform, where the live emulator is reused.
kill_emulators() {
  pebble kill >/dev/null 2>&1 || true
  pkill -f qemu   >/dev/null 2>&1 || true
  pkill -f pypkjs >/dev/null 2>&1 || true
}

trap kill_emulators EXIT

# install_with_retries <platform> <pbw> — reinstall onto the live emulator
# (boots it on the first call per platform). On failure, force-reap the wedged
# emulator and retry from a fresh boot. Sets REBOOTED=1 if it had to reap, so
# the caller waits for a full boot rather than a quick settle.
REBOOTED=0
install_with_retries() {
  local platform="$1" pbw="$2" attempt
  REBOOTED=0
  for attempt in 1 2 3; do
    if pebble install "$pbw" --emulator "$platform"; then
      return 0
    fi
    if [[ $attempt -eq 3 ]]; then
      printf 'ERROR: could not install on %s after 3 attempts; giving up\n' "$platform" >&2
      kill_emulators
      exit 1
    fi
    printf 'Install attempt %d on %s failed, retrying...\n' "$attempt" "$platform" >&2
    kill_emulators
    REBOOTED=1
    sleep 4
  done
}

# boot_wait <platform> — emery boots slower than the others.
boot_wait() {
  if [[ "$1" == "emery" ]]; then sleep 12; else sleep 5; fi
}

# need_boot is reset to 1 at the start of each platform; the first install (and
# any forced reboot) waits for a full boot, later reinstalls settle briefly.
need_boot=1

# capture_one <platform> <pbw> <out.png> <tap?>
capture_one() {
  local platform="$1" pbw="$2" out="$3" tap="$4"
  install_with_retries "$platform" "$pbw"
  if [[ $need_boot -eq 1 || $REBOOTED -eq 1 ]]; then
    boot_wait "$platform"
  else
    sleep 2
  fi
  need_boot=0
  if [[ "$tap" == "tap" ]]; then
    pebble emu-tap --emulator "$platform"   # calendar -> radar
    sleep 1
  fi
  screenshot_bounded "$out" "$platform"
  printf 'Saved %s\n' "$out"
}

node scripts/gen-timelapse-fixtures.js

shopt -s nullglob
a_fixtures=(fixtures/timelapse-a-*.json)
b_fixtures=(fixtures/timelapse-b-*.json)
if [[ ${#a_fixtures[@]} -eq 0 || ${#b_fixtures[@]} -eq 0 ]]; then
  printf 'No two-phase fixtures were generated\n' >&2
  exit 1
fi

for platform in "${platforms[@]}"; do
  mkdir -p "$frames_root/$platform"
done

# Build phase: one build per fixture, stash the .pbw. Skip fixtures already
# stashed so a re-run resumes at capture instead of rebuilding.
mkdir -p "$pbw_dir"
for fixture in "${a_fixtures[@]}" "${b_fixtures[@]}"; do
  base="$(basename "$fixture" .json)"
  if [[ -f "$pbw_dir/$base.pbw" ]]; then
    printf 'Reusing stashed build for %s\n' "$base"
    continue
  fi
  printf '\n==> build %s\n' "$base"
  FIXTURE="$base" mise run build -- dev
  cp build/warnweather-dev.pbw "$pbw_dir/$base.pbw"
done

# Capture phase: one platform at a time, reusing the live emulator across all of
# that platform's frames; reap only when moving to the next platform.
for platform in "${platforms[@]}"; do
  printf '\n######## platform %s ########\n' "$platform"
  kill_emulators
  sleep 2
  need_boot=1

  # Phase A: forecast/calendar view (no tap).
  for fixture in "${a_fixtures[@]}"; do
    base="$(basename "$fixture" .json)"   # timelapse-a-00
    nn="${base##*-}"                      # 00
    capture_one "$platform" "$pbw_dir/$base.pbw" "$frames_root/$platform/a_$nn.png" "no-tap"
  done

  # Phase B: radar view (tap once after each reinstall).
  for fixture in "${b_fixtures[@]}"; do
    base="$(basename "$fixture" .json)"   # timelapse-b-00
    nn="${base##*-}"                      # 00
    capture_one "$platform" "$pbw_dir/$base.pbw" "$frames_root/$platform/b_$nn.png" "tap"
  done

  kill_emulators
done

printf '\nDone. Next, per platform:\n'
for platform in "${platforms[@]}"; do
  printf '  scripts/assemble-gif.sh %s %s\n' "$version" "$platform"
done
