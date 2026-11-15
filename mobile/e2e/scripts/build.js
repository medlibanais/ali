#!/usr/bin/env node
// Builds the Release app Detox tests: `node e2e/scripts/build.js android|ios`.
// Called by `detox build`. Works on Windows, macOS and Linux.
//
// 1. Points the bundled app at the test Supabase (local by default).
// 2. `expo prebuild --clean` with DETOX_E2E=1 so app.config.js adds the
//    Detox native harness. android/ and ios/ are generated and gitignored.
// 3. Native Release build (+ the androidTest APK on Android).
// 4. Checks the JS bundle really contains the test Supabase URL, so a stale
//    cache can never send the tests to the live project.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolveSupabase, urlForPlatform } = require('./local-supabase');

const platform = process.argv[2];
if (platform !== 'android' && platform !== 'ios') {
  console.error('Usage: node e2e/scripts/build.js android|ios');
  process.exit(1);
}
if (platform === 'ios' && process.platform !== 'darwin') {
  console.error('The iOS app can only be built on macOS (Xcode).');
  process.exit(1);
}

const MOBILE = path.resolve(__dirname, '..', '..');
const isWin = process.platform === 'win32';
const { url, anonKey } = resolveSupabase();
const appUrl = urlForPlatform(url, platform);

const env = {
  ...process.env,
  DETOX_E2E: '1',
  NODE_ENV: 'production',
  // Shell env wins over .env / .env.local, so the live project in .env is
  // never used for this build.
  EXPO_PUBLIC_SUPABASE_URL: appUrl,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey,
};

function run(cmd, args, cwd = MOBILE) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: isWin });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${res.status})`);
  }
}

console.log(`E2E app will use Supabase at ${appUrl}`);

// Metro caches transformed files, including inlined EXPO_PUBLIC_ values.
fs.rmSync(path.join(MOBILE, 'node_modules', '.cache'), { recursive: true, force: true });

// prebuild rewrites the "android"/"ios" scripts in package.json; put the
// file back afterwards so an E2E build leaves the working tree clean.
const pkgPath = path.join(MOBILE, 'package.json');
const pkg = fs.readFileSync(pkgPath, 'utf8');
try {
  run('npx', ['expo', 'prebuild', '--clean', '--platform', platform]);
} finally {
  fs.writeFileSync(pkgPath, pkg);
}

let bundle;
if (platform === 'android') {
  run(isWin ? 'gradlew.bat' : './gradlew', [
    'assembleRelease',
    'assembleAndroidTest',
    '-DtestBuildType=release',
    '--no-daemon',
  ], path.join(MOBILE, 'android'));
  bundle = path.join(
    MOBILE,
    'android/app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle',
  );
} else {
  run('xcodebuild', [
    '-workspace', 'ios/GROW.xcworkspace',
    '-scheme', 'GROW',
    '-configuration', 'Release',
    '-sdk', 'iphonesimulator',
    '-derivedDataPath', 'ios/build',
    '-quiet',
  ]);
  bundle = path.join(
    MOBILE,
    'ios/build/Build/Products/Release-iphonesimulator/GROW.app/main.jsbundle',
  );
}

if (!fs.existsSync(bundle)) {
  console.warn(`Could not find the JS bundle at ${bundle} to check its Supabase URL.`);
} else if (!fs.readFileSync(bundle, 'utf8').includes(appUrl)) {
  console.error(
    `The built app does not contain ${appUrl}. It may point at another ` +
      'Supabase project. Delete node_modules/.cache and rebuild.',
  );
  process.exit(1);
}
console.log('\nE2E build ready.');
