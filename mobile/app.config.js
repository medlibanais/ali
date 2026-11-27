// Dynamic Expo config. app.json stays the source of truth; this only adds
// the Detox native test harness when building the E2E test app
// (DETOX_E2E=1, set by e2e/scripts/build.js). Normal dev, EAS and web builds
// get app.json unchanged.
module.exports = ({ config }) => {
  if (process.env.DETOX_E2E !== '1') return config;
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      // @config-plugins/detox pins Kotlin 1.8.22; Expo SDK 51 modules need
      // the SDK default (1.9.23). Mods run in reverse order, so listing this
      // BEFORE the Detox plugin makes it the last writer and it wins.
      ['expo-build-properties', { android: { kotlinVersion: '1.9.23' } }],
      // Adds the androidTest runner (DetoxTest.java), the Detox maven repo,
      // and a network security config that allows plain http to the local
      // Supabase on the host (10.0.2.2 from the emulator).
      ['@config-plugins/detox', { subdomains: ['10.0.2.2', 'localhost', '127.0.0.1'] }],
    ],
  };
};
