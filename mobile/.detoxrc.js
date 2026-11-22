// Detox E2E config. See e2e/README.md for setup and how to run.
// Tests run against a Release build (JS bundled in), so the expo-dev-client
// launcher never shows and Metro does not need to run.
const avdName = process.env.DETOX_AVD || 'Pixel_7_API_34';

/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: { $0: 'jest', config: 'e2e/jest.config.js' },
    jest: { setupTimeout: 240000 },
  },
  apps: {
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      testBinaryPath:
        'android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk',
      build: 'node e2e/scripts/build.js android',
    },
  },
  devices: {
    emulator: { type: 'android.emulator', device: { avdName } },
  },
  configurations: {
    'android.emu.release': { device: 'emulator', app: 'android.release' },
  },
  artifacts: {
    rootDir: 'e2e/artifacts',
    plugins: {
      screenshot: 'failing',
      log: 'failing',
    },
  },
};
