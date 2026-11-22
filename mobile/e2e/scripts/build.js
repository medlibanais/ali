#!/usr/bin/env node
// Builds the Release app Detox tests: `node e2e/scripts/build.js android`.
// Called by `detox build`. Works on Windows, macOS and Linux.
//
// 1. Points the bundled app at the test Supabase (local by default).
// 2. `expo prebuild --clean` with DETOX_E2E=1 so app.config.js adds the
//    Detox native harness. android/ is generated and gitignored.
// 3. Native Release build (+ the androidTest APK on Android).
// 4. Checks the JS bundle really contains the test Supabase URL, so a stale
//    cache can never send the tests to the live project.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolveSupabase, urlForPlatform } = require('./local-supabase');

const platform = process.argv[2];
if (platform !== 'android') {
  console.error('Usage: node e2e/scripts/build.js android');
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

function run(cmd, args, cwd = MOBILE, attempts = 1) {
  for (let attempt = 1; ; attempt += 1) {
    console.log(`\n> ${cmd} ${args.join(' ')}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
    const res = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: isWin });
    if (res.status === 0) return;
    if (attempt >= attempts) {
      throw new Error(`${cmd} ${args.join(' ')} failed (exit ${res.status})`);
    }
    // Maven Central answers 429 when many CI jobs share an IP; waiting
    // (30 s, 60 s, ...) lets the limit reset before the next try.
    const waitS = 30 * attempt;
    console.warn(`Failed with exit ${res.status}, trying again in ${waitS}s.`);
    spawnSync(process.execPath, ['-e', `setTimeout(()=>{}, ${waitS * 1000})`]);
  }
}

if (platform === 'android') {
  // Gradle 8.8 (Expo SDK 51) cannot run on Java 22+ ("Unsupported class
  // file major version"). Fail early with a clear message instead.
  const java = spawnSync('java', ['-version'], { encoding: 'utf8', shell: isWin });
  const major = Number(/version "(\d+)/.exec(`${java.stderr}${java.stdout}`)?.[1]);
  if (!major || major < 17 || major > 21) {
    console.error(
      `The Android build needs Java 17 to 21, found ${major || 'none'}. ` +
        'Install JDK 17 and set JAVA_HOME to it (Android Studio bundles one).',
    );
    process.exit(1);
  }
}

console.log(`E2E app will use Supabase at ${appUrl}`);

// Metro caches transformed files, including inlined EXPO_PUBLIC_ values.
fs.rmSync(path.join(MOBILE, 'node_modules', '.cache'), { recursive: true, force: true });

// prebuild rewrites the "android" script in package.json; put the
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
  // Explicit relative path: cmd.exe and PowerShell do not find a bare
  // "gradlew.bat" in the working directory.
  run(isWin ? '.\\gradlew.bat' : './gradlew', [
    'assembleRelease',
    'assembleAndroidTest',
    '-DtestBuildType=release',
    '--no-daemon',
    // Gradle first downloads plugins and libraries from Maven Central and
    // Google; one dropped download ("Could not find ...") should not sink a
    // 30 minute build. Gradle's cache keeps what it already fetched.
  ], path.join(MOBILE, 'android'), 4);
  bundle = path.join(
    MOBILE,
    'android/app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle',
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
