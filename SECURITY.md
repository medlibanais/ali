# Security Notes — PrayerLock

Last audit: **2026-09-23** (`npm audit`, `mobile/`)

## Headline

| | Count | Breakdown |
|---|---|---|
| Before remediation | 35 | 1 low, 28 moderate, 5 high, 1 critical |
| After remediation | 26 | 20 moderate, 5 high, 1 critical |

**All 26 remaining vulnerabilities are build-time toolchain only** (Expo CLI,
Metro, React Native CLI, cacache/tar, xcode/uuid, @xmldom, fast-xml-parser,
image-size). None of this code ships inside the app bundle. Exploiting any of
them requires a malicious package in the developer's supply chain or malicious
project files — it cannot be triggered by an end user of the app.

## The one runtime vulnerability (fixed)

`decode-uri-component@0.2.2` shipped inside the app via
`@react-navigation/core → query-string`. Because the app registers the
`prayerlock://` deep-link scheme (`App.tsx`), a crafted malicious link could
have caused exponential-decoding CPU exhaustion (app hang/crash — no data
exposure). Fixed by overriding to `decode-uri-component@0.5.0`.

## What was patched (mobile/package.json `overrides`)

| Package | From | To | Runtime? | Advisory |
|---|---|---|---|---|
| `decode-uri-component` | 0.2.2 | 0.5.0 | **yes** | GHSA-vcc3-ghjq-m6fr (DoS) |
| `postcss` | 8.4.49 | 8.5.28 | no (Metro CSS) | GHSA-qx2v-qp2m-jg93 + 3 more |
| `send` | 0.18.0 | 0.19.2 | no (dev server) | GHSA-m6fv-jmcg-4jfg (XSS) |

Verified after patching: `tsc --noEmit` clean, `expo export --platform web`
succeeds, backend test suite unaffected (66/66 green).

### Attempted and reverted

`image-size@2.0.4` — Metro 0.80 calls the v1 API (`getImageSize is not a
function` at bundle time). Override reverted; `image-size@1.2.1` remains with
two high-severity DoS advisories. Accepted: it only parses our own bundled
assets at build time on the developer machine.

## What remains, and why it is accepted for the MVP

| Package(s) | Severity | Why accepted |
|---|---|---|
| `tar` (via cacache/@expo/cli) | critical | Dev-machine archive extraction only (npm cache). Fixed properly by Expo SDK upgrade. |
| `@xmldom/xmldom` | high | Plist/config parsing at prebuild time on our own project files. |
| `fast-xml-parser` | moderate | RN CLI native-project parsing at build time. |
| `uuid` | moderate | Expo telemetry + xcode tooling; v3/v5/v6 buffer edge case. |
| `image-size` | high | See "Attempted and reverted" above. |
| `expo`, `@expo/*`, `@react-native-community/*`, `expo-*` | moderate/high | Advisory rollups over the toolchain entries above. |

## Policy

- **Never run `npm audit fix --force`.** It installs expo@57 (from 51),
  react-native@0.87 (from 0.74), and React Navigation 7 (from 6) — a blind
  multi-major migration that will break the app.
- The structural fix for the remaining toolchain CVEs is a **planned Expo SDK
  upgrade** (51 → current) using `npx expo install --fix` with full regression
  testing (tsc, web export, 66-test backend suite, device smoke test).
  Scheduled before public launch, not during MVP.
- Re-run `npm audit` after every dependency change and record results here.

## Backend

Python dependencies are pinned in `backend/requirements.txt`;
`pip check` passes (no broken requirements) as of 2026-09-23.
A `pip-audit` pass is recommended before launch and should be recorded here.

## Application-level security (implemented, per SRS §4.3)

- JWT (24 h) + refresh-token rotation, bcrypt cost 12
- Rate limiting: 100 req/min/IP at the API edge; 20 AI-coach messages/day/user;
  3 skips/day; 500 XP/day cap
- CORS allow-list, request validation on all endpoints, no PII in logs
- Full data-export and account-deletion cascade endpoints (`/v1/users/export`,
  `/v1/users/account`)
