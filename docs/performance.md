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

## Avatar asset budget (2026-11-25, branch `claude/project-thread-ilke51`)

Builds on the model split above; the split itself is unchanged. Run
`cd mobile && node scripts/avatar-assets.mjs` for the breakdown below.

### What the 46.2 MB model is made of

| What | In core.bin | In packs | Items |
| --- | ---: | ---: | ---: |
| Clothes meshes | 0 | 15,254,186 | 55 |
| Clothes textures | 0 | 10,379,579 | 55 |
| Morph targets (shape deltas) | 5,747,832 | 0 | 329 |
| Hair textures | 0 | 5,718,114 | 26 |
| Hair meshes | 0 | 4,645,763 | 26 |
| Skin textures | 0 | 2,033,608 | 6 |
| Glasses meshes + textures | 0 | 580,963 | 5 |
| Base body mesh | 535,602 | 0 | |
| Brows (mesh + texture) | 574,726 | 0 | 12 |
| Teeth, eyes, tongue, lashes | 458,217 | 0 | |
| Skeleton + skin weights | 158,992 | 0 | |
| JSON header | 123,608 | 0 | |

Morph targets are 76% of the core (each full-body target is about 153 KB).
Clothes are 66% of the packs. core.bin gzips from 7.60 MB to 4.79 MB; the
packs from 38.61 MB to 31.13 MB (mostly JPEG/WebP already).

When each platform loads it: **web** fetches core.bin and the worn packs
over HTTP only when the hidden renderer starts (a look missing from the
picture cache), after the first screen has settled. **Android** bundles
every file in the app; the renderer reads core.bin and the worn packs from
the app's assets only in the same situation. A launch whose pictures are
cached loads no model bytes at all.

### The three numbers, separately

| | Old (one file) | Now | Change in this branch |
| --- | --- | --- | --- |
| Initial transfer: model bytes for the first full render | 46.20 MB | built-in looks 8.70 to 9.52 MB; worst random mix 11.91 MB | none (retries add bytes only when a download failed) |
| Initial transfer: JS bundle | 3,405,147 B | 3,417,779 B | +12,632 B (the manifest of 93 sizes and hashes) |
| Initial transfer: viewer page | 500,192 B | 501,175 B | +983 B (download checks) |
| Total avatar asset size | 46.20 MB | 46.21 MB (core 7.60 + 92 packs 38.61) | none |
| Cache growth, Android pictures | 48 files / 8 MB cap | same cap; portrait slots live inside it, index file under 1 KB | none |
| Cache growth, web pictures | 10 localStorage entries | same; plus one small slot index | under 1 KB |
| Cache growth, renderer memory | 24 packs kept | same | none |

### What this branch adds

- `src/avatar/modelManifest.ts` (generated): byte size and SHA-256 of
  core.bin and every pack, with a version. The viewer checks each file it
  downloads; a cut-off or corrupted file is fetched again, skipping the
  HTTP cache (3 tries). If it still fails, the app re-resolves the named
  files (Android: copies them out of the app again, for a cleared cache
  folder) and retries the look twice more before giving up.
- Portrait slots: the Today avatar's newest picture is remembered per
  account. After an app update (new model, so every cached key misses), an
  edit on another phone, or a failed download, that picture shows at once
  while the new one draws. Never evicted while pointed at; cleared on
  sign-out.
- CI: `node scripts/avatar-assets.mjs --check` fails when a model file
  changes without the manifest, or the viewer, core, any pack or all packs
  grow past `assets/avatar3d/budget.json` (sizes on 2026-11-25 + about 2%).
  Jest (`assetBudget.test.ts`) checks first-render bytes of the default and
  built-in looks (9.8 MB), of 400 random looks (12.3 MB), and of avatars
  saved by older app versions.

### Checks run

- Old single-file renderer (viewer before 1a05f8b with the original
  `human.bin`) against the split renderer, headless Chromium: 100 looks
  (24 skin tones, 12 built-in looks, 30 outfits, 21 expressions, 2 moods,
  6 poses, 5 saved configs from v1 to v3). All 100 pixel-identical when
  drawn fresh. In one long batch, one look differed by 3 pixels (at most
  7/255); that came from the old renderer reusing state from earlier
  renders, and the new renderer matched a fresh old render exactly.
- Download handling, headless Chromium: a pack cut off at half, a
  connection dropped mid-file, both drawn correctly on the second fetch; a
  pack that stays corrupted is reported by name after 3 fetches.
- Not measured: anything on an Android device (no device here). Also, the
  web startup script `scripts/measure-web-startup.js` no longer gets past
  the sign-in screen on current main (same on main without this branch),
  so first-launch timings were not re-measured.
