// Finds the Supabase the E2E tests should use. Shared by the build script
// (what URL/key get baked into the test app) and the tests (what the Node
// side checks against). Defaults to the local stack from `npm run db:start`.
const { execSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** @returns {{ url: string, anonKey: string, mailpitUrl: string }} */
function resolveSupabase() {
  let url = process.env.E2E_SUPABASE_URL;
  let anonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const mailpitUrl = process.env.E2E_MAILPIT_URL || 'http://127.0.0.1:54324';

  if (!url || !anonKey) {
    let status;
    try {
      const out = execSync('npx supabase status -o json', {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8',
      });
      // Some CLI versions print a notice line before the JSON.
      status = JSON.parse(out.slice(out.indexOf('{')));
    } catch {
      throw new Error(
        'Local Supabase is not running. Start it from the repo root with ' +
          '`npm run db:start` (needs Docker), or set E2E_SUPABASE_URL and ' +
          'E2E_SUPABASE_ANON_KEY.',
      );
    }
    url = url || status.API_URL;
    anonKey = anonKey || status.ANON_KEY || status.PUBLISHABLE_KEY;
  }

  if (/\.supabase\.co/i.test(url) && process.env.E2E_ALLOW_REMOTE !== '1') {
    throw new Error(
      `Refusing to run E2E against ${url}: every run registers a new real ` +
        'account. Use the local stack, or set E2E_ALLOW_REMOTE=1 for a ' +
        'throwaway project with email confirmation turned off.',
    );
  }
  return { url, anonKey, mailpitUrl };
}

/** The emulator reaches the host machine at 10.0.2.2, not localhost. */
function urlForPlatform(url, platform) {
  if (platform !== 'android') return url;
  return url.replace(/\/\/(127\.0\.0\.1|localhost)(?=[:/]|$)/, '//10.0.2.2');
}

module.exports = { REPO_ROOT, resolveSupabase, urlForPlatform };
