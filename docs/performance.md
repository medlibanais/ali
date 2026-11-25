# Performance and size: how to measure, and the 2026-11-25 numbers

## Web (measured)

Build mode: production web export (`npx expo export -p web`), Expo SDK 51,
measured in headless Chromium 1x (390 × 844, software WebGL via SwiftShader)
with a mocked Supabase (signed-in demo account, ten quests). Absolute times
are a CI machine's, not a phone's; compare runs on the same machine only.

```sh
cd mobile
CI=1 EXPO_PUBLIC_SUPABASE_URL=https://demo.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=demo \
  npx expo export -p web --output-dir /tmp/grow-dist
OUT_DIR=/tmp node scripts/measure-web-startup.js /tmp/grow-dist run1        # timings + bytes
OUT_DIR=/tmp node scripts/measure-web-startup.js /tmp/grow-dist slow block  # avatar model refused
# sizes: find /tmp/grow-dist -name '*.js' -printf '%s\n'; gzip -9c <file> | wc -c
```

"Before" is `main` (f3b1324) plus open PRs #61 to #64. "After" is branch
`claude/project-thread-xd725y`.

| What | Before | After | Affects |
| --- | --- | --- | --- |
| JavaScript bundle (1 file) | 3,364,646 B (849,281 gzip) | 3,405,147 B (856,584 gzip) | initial traffic |
| Fonts (10 TTF) | 2,139,304 B | same | initial traffic |
| Avatar viewer page | 498,320 B | 500,192 B | first avatar |
| Avatar model bytes for the first full render | 46,198,384 B (one file) | 8,883,572 B (core 7,599,464 + 5 packs 1,284,108) | first avatar traffic, WebView memory |
| Same, across all built-in looks | 46.2 MB | 8.70 to 9.52 MB (-79 to -81%) | |
| Total web upload (all files) | 52.20 MB | 52.26 MB (every pack still ships, fetched only when worn) | hosting only |
| Today usable (3 runs) | 673, 566, 501 ms | 516, 675, 577 ms | no measurable change |
| First avatar picture (3 runs) | 7.99, 7.08, 6.97 s | 6.50, 6.48, 5.89 s | first launch |
| Avatar model refused (slow or failed download) | not measured | Today usable in 531 ms, quests work, avatar disc stays empty | |

The viewer's own pictures (the PNGs it hands to the app) are pixel-identical
before and after the model split, and every one of the 1,657 data views in the
split files is byte-identical to the original `human.bin`.

Largest shipped items, after: the avatar packs (38.6 MB in total, on demand),
`core.bin` (7.6 MB, 4.8 MB gzip), the JS bundle (3.4 MB), the five Inter
weights (316 KB each, 1.57 MB together), the viewer page (0.5 MB).

## Android (not measured here)

No Android device or emulator was available in this environment, so these are
**unmeasured**: compressed download size, installed size, cold start to a
usable Today, first avatar render, and avatar cache growth.

Expected effects of this branch, to verify on a device:

- APK/AAB size: about the same. All packs are still bundled as assets; they
  are read only when worn, so the WebView holds about 9 MB of model instead of
  46 MB (memory and parse time, not download size).
- Avatar picture cache: at most 48 files and 8 MB (`MAX_NATIVE_BYTES`).

How to measure on a device (release build, same phone each time):

```sh
cd mobile
npx eas-cli build -p android --profile preview          # or a local release build
# download size: size of the .aab/.apk from the build page
adb install -r app.apk && adb shell pm path com.prayerlock.app
adb shell dumpsys package com.prayerlock.app | grep -i size     # installed size
adb shell am force-stop com.prayerlock.app
adb logcat -c && adb shell am start -W -n com.prayerlock.app/.MainActivity   # TotalTime = cold start
adb logcat | grep "\[startup\]"        # dev builds: "first screen after N ms"
adb shell du -sh /data/data/com.prayerlock.app/cache/avatar3d    # render cache (run-as on debug builds)
```
