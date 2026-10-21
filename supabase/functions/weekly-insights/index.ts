// weekly-insights: pattern-detection over the past week's data.
// Runs via pg_cron Sunday 18:00 UTC (all users) or on-demand for self.
// Produces 2-3 insights {pattern, insight, suggestion} stored in
// ai_insights, plus a weekly_reports row for the completed week.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callGroq } from '../_shared/llm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const PILLARS = ['health', 'family', 'work', 'fun', 'spirituality'];

interface Insight {
  pattern: string;
  insight: string;
  suggestion: string;
}

function validInsights(raw: unknown): Insight[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Insight[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const o = item as Record<string, unknown>;
    if (
      typeof o.pattern !== 'string' ||
      typeof o.insight !== 'string' ||
      typeof o.suggestion !== 'string' ||
      o.pattern.length > 200 ||
      o.insight.length > 240 ||
      o.suggestion.length > 240
    ) {
      return null;
    }
    out.push({
      pattern: o.pattern.trim(),
      insight: o.insight.trim(),
      suggestion: o.suggestion.trim(),
    });
  }
  return out.length >= 1 && out.length <= 4 ? out.slice(0, 3) : null;
}

function extractJson(text: string): unknown | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? 'prayerlock-dev-cron-secret';
  const admin = createClient(supabaseUrl, serviceKey);

  let targetUserIds: string[] = [];
  const isCron = req.headers.get('x-cron-secret') === cronSecret;
  if (isCron) {
    const { data: users } = await admin
      .from('profiles')
      .select('id')
      .eq('onboarding_completed', true);
    targetUserIds = (users ?? []).map((u: { id: string }) => u.id);
  } else {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing_authorization' }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: 'invalid_session' }, 401);
    targetUserIds = [user.id];
  }

  const results: Record<string, string> = {};
  for (const userId of targetUserIds) {
    results[userId] = await insightsForUser(admin, userId);
  }
  return json({ ok: true, results }, 200);
});

async function insightsForUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  // Last completed week: Monday..Sunday before the current one.
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7; // Monday = 0
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - dow);
  const weekEnd = new Date(thisMonday.getTime() - 86400000);
  const weekStart = new Date(weekEnd.getTime() - 6 * 86400000);
  const from = weekStart.toISOString().slice(0, 10);
  const to = weekEnd.toISOString().slice(0, 10);

  // Idempotent per week.
  const { data: existing } = await admin
    .from('ai_insights')
    .select('id')
    .eq('user_id', userId)
    .eq('week_start', from)
    .maybeSingle();
  if (existing) return 'already_done';

  const [scoresRes, completionsRes] = await Promise.all([
    admin
      .from('daily_scores')
      .select('*')
      .eq('user_id', userId)
      .gte('score_date', from)
      .lte('score_date', to)
      .order('score_date'),
    admin
      .from('quest_completions')
      .select('completed_at, quests(pillar, title)')
      .eq('user_id', userId)
      .is('undone_at', null)
      .gte('completed_at', `${from}T00:00:00Z`)
      .lte('completed_at', `${to}T23:59:59Z`),
  ]);

  const scores = scoresRes.data ?? [];
  if (scores.length === 0) return 'no_data';

  const assigned = scores.reduce(
    (s: number, r: { assigned_count: number }) => s + r.assigned_count,
    0,
  );
  const completed = scores.reduce(
    (s: number, r: { completed_count: number }) => s + r.completed_count,
    0,
  );
  const completionRate =
    assigned > 0 ? Math.round((100 * completed) / assigned) : 0;
  const totalXp = scores.reduce(
    (s: number, r: { xp_earned: number }) => s + r.xp_earned,
    0,
  );

  const pillarTotals: Record<string, number> = {};
  for (const p of PILLARS) {
    pillarTotals[p] = Math.round(
      scores.reduce(
        (s: number, r: Record<string, number>) => s + (r[p] ?? 0),
        0,
      ) / scores.length,
    );
  }

  const completions = completionsRes.data ?? [];
  const byWeekday: Record<string, { assigned: number; completed: number }> = {};
  for (const row of scores) {
    const wd = new Date(`${row.score_date}T12:00:00Z`).toLocaleDateString(
      'en-US',
      { weekday: 'long' },
    );
    byWeekday[wd] = {
      assigned: (byWeekday[wd]?.assigned ?? 0) + row.assigned_count,
      completed: (byWeekday[wd]?.completed ?? 0) + row.completed_count,
    };
  }

  const prompt = `You analyze a user's habit data for one week and output 2-3 behavioral insights as a JSON array.

DATA (${from} to ${to}):
- Completion rate: ${completionRate}% (${completed}/${assigned} quests), ${totalXp} XP
- Average pillar scores: ${PILLARS.map((p) => `${p} ${pillarTotals[p]}%`).join(', ')}
- By weekday: ${Object.entries(byWeekday)
    .map(([d, v]) => `${d}: ${v.completed}/${v.assigned}`)
    .join('; ')}
- Completions by pillar: ${JSON.stringify(
      completions.reduce((acc: Record<string, number>, c: { quests: unknown }) => {
        const q = Array.isArray(c.quests) ? c.quests[0] : c.quests;
        const p = (q as { pillar?: string } | null)?.pillar;
        if (p) acc[p] = (acc[p] ?? 0) + 1;
        return acc;
      }, {}),
    )}

OUTPUT: JSON array of 2-3 items, each:
{"pattern": "<specific observation from the data, max 160 chars>", "insight": "<what it means for them, max 200 chars>", "suggestion": "<one concrete action, max 200 chars>"}

RULES: only claims supported by the data above. Name real weekdays/pillars/numbers. No generic motivation. Valid JSON only, no markdown.`;

  let insights: Insight[] | null = null;
  for (let attempt = 0; attempt < 2 && !insights; attempt += 1) {
    const llm = await callGroq(
      [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Write the insights as JSON only.' },
      ],
      { maxTokens: 600, temperature: 0.6 },
    );
    if (!llm.ok) continue;
    const parsed = extractJson(llm.text);
    insights = parsed ? validInsights(parsed) : null;
  }

  if (!insights) return 'llm_failed';

  await admin.from('ai_insights').upsert({
    user_id: userId,
    week_start: from,
    insights,
  });

  await admin.from('weekly_reports').upsert({
    user_id: userId,
    week_start: from,
    week_end: to,
    completion_rate: completionRate,
    total_xp: totalXp,
    report: {
      pillar_scores: pillarTotals,
      by_weekday: byWeekday,
      completions_count: completions.length,
    },
  });

  return `ok:${insights.length}`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
