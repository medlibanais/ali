// Measures a web export of GROW in headless Chromium: time to a usable
// Today, time to the first 3D avatar picture, and bytes per asset kind.
// Supabase is mocked (signed-in demo account, ten quests), so no network
// or project is needed. See docs/performance.md.
//
// Usage (from mobile/):
//   CI=1 EXPO_PUBLIC_SUPABASE_URL=https://demo.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=demo \
//     npx expo export -p web --output-dir /tmp/grow-dist
//   node scripts/measure-web-startup.js /tmp/grow-dist run1 [block]
// `block` refuses every avatar model request (slow/failed download check).
// Writes <outDir>/<label>.png and <label>-render<N>.png (the viewer's own
// pictures, for pixel comparisons). OUT_DIR defaults to the OS temp dir.
const { chromium } = require('playwright');
const os = require('os');
const OUT = process.env.OUT_DIR || os.tmpdir();
const fs = require('fs');
const path = require('path');
const dist = process.argv[2];
const label = process.argv[3];
const blockModel = process.argv[4] === 'block';
const UID = '11111111-1111-4111-8111-111111111111';
const today = new Date().toISOString().slice(0, 10);
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@grow.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const session = { access_token: 'x.eyJzdWIiOiIxIn0.x', refresh_token: 'r', token_type: 'bearer', expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000, user };
const quests = ['health', 'family', 'work', 'fun', 'spirituality'].flatMap((p, i) => [0, 1].map((k) => ({
  id: `00000000-0000-4000-8000-0000000000${i}${k}`, user_id: UID, predefined_id: null, pillar: p, title: `${p} quest ${k + 1}`,
  description: 'Demo', difficulty: 'easy', xp_reward: 10, is_ai_generated: k === 1, why_this_matters: null, time_estimate_minutes: 10,
  assigned_date: today, skipped: false, priority: k + 1, quest_completions: [],
})));
const tables = {
  profiles: { id: UID, username: 'demo', first_name: 'Demo', onboarding_completed: true, timezone: 'UTC', avatar_mode: 'avatar', avatar_config: null, language: 'en', theme_preference: null, stats_visibility: 'friends' },
  user_goals: { user_id: UID, health_goal: 'Walk', dream_personality: [] },
  gamification: { user_id: UID, level: 3, total_xp: 1600, xp_today: 20, xp_today_date: today, current_streak: 4, best_streak: 9 },
  quests,
  daily_scores: { overall: 62, health: 70, family: 50, work: 80, fun: 40, spirituality: 60 },
};
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([s]) => { localStorage.setItem('sb-demo-auth-token', s); }, [JSON.stringify(session)]);
  const bytes = {};
  const add = (k, n) => { bytes[k] = (bytes[k] || 0) + n; };
  await ctx.route('http://app.local/**', async (route) => {
    const u = new URL(route.request().url());
    let f = path.join(dist, decodeURIComponent(u.pathname));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
    if (blockModel && /avatar3d\/(models|parts)\//.test(u.pathname)) return route.abort();
    const body = fs.readFileSync(f);
    const kind = /\.bin$/.test(f) ? (/models\//.test(f) ? 'model:core' : 'model:parts') : /\.js$/.test(f) ? 'js' : /\.ttf$/.test(f) ? 'fonts' : /viewer/.test(f) ? 'viewer' : 'other';
    add(kind, body.length); add(`${kind}#files`, 1);
    const types = { '.js': 'application/javascript', '.html': 'text/html', '.ttf': 'font/ttf', '.bin': 'application/octet-stream', '.png': 'image/png', '.json': 'application/json' };
    await route.fulfill({ status: 200, body, headers: { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'access-control-allow-origin': '*' } });
  });
  await ctx.route('https://demo.supabase.co/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors, body: '' });
    let body = null;
    if (u.pathname === '/auth/v1/user') body = user;
    else if (u.pathname.startsWith('/rest/v1/rpc/')) body = null;
    else if (u.pathname.startsWith('/rest/v1/')) {
      const t = u.pathname.slice(9);
      const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      const v = tables[t];
      body = single ? (Array.isArray(v) ? v[0] ?? null : v ?? null) : (Array.isArray(v) ? v : v ? [v] : []);
    } else if (u.pathname.startsWith('/functions/v1/')) body = { results: {} };
    else if (u.pathname.startsWith('/realtime')) return route.abort();
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto('http://app.local/', { waitUntil: 'domcontentloaded' });
  let todayMs = null;
  try {
    await page.locator('text=/health quest 1|Tap a pillar/i').first().waitFor({ timeout: 30000 });
    todayMs = Date.now() - t0;
  } catch { }
  let avatarMs = null;
  const start = Date.now();
  while (Date.now() - start < 90000) {
    const has = await page.evaluate(() => [...document.querySelectorAll('img')].some((i) => i.src.startsWith('data:image/png') && i.naturalWidth > 100) || [...document.querySelectorAll('div')].some((d) => (getComputedStyle(d).backgroundImage || '').startsWith('url("data:image/png')));
    if (has) { avatarMs = Date.now() - t0; break; }
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1000);
  const shots = await page.evaluate(() => [...new Set([...document.querySelectorAll('img')].map((i) => i.src).filter((s) => s.startsWith('data:image/png')).concat([...document.querySelectorAll('div')].map((d) => getComputedStyle(d).backgroundImage).filter((b) => b.startsWith('url("data:image/png')).map((b) => b.slice(5, -2))))]);
  shots.forEach((s, i) => fs.writeFileSync(path.join(OUT, `${label}-render${i}.png`), Buffer.from(s.split(',')[1], 'base64')));
  await page.screenshot({ path: path.join(OUT, `${label}.png`) });
  const usable = await page.locator('text=/health quest 1|Tap a pillar/i').first().isVisible().catch(() => false);
  console.log(JSON.stringify({ label, todayMs, avatarMs, usableAtEnd: usable, bytes, errors: errors.slice(0, 3) }));
  await browser.close();
})();
