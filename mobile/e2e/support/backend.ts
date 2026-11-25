// Node-side helpers for the journey test: read the confirmation email from
// the local mail catcher (Mailpit) and read what the app saved. Everything goes through the anon key and the test user's own
// session, so Row Level Security applies exactly as it does in the app.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabase } from '../scripts/local-supabase';

const { url, anonKey, mailpitUrl } = resolveSupabase();

type RealtimeTransport = NonNullable<
  NonNullable<Parameters<typeof createClient>[2]>['realtime']
>['transport'];

class NoRealtime {
  constructor() {
    throw new Error('Realtime is not used by the e2e tests');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MailpitSearch {
  messages: { ID: string }[];
}
interface MailpitMessage {
  HTML: string;
}

/** Waits for the sign-up email and returns its verification code. */
export async function findConfirmationCode(email: string, timeoutMs = 30000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const query = encodeURIComponent(`to:"${email}"`);
  while (Date.now() < deadline) {
    const res = await fetch(`${mailpitUrl}/api/v1/search?query=${query}`);
    if (res.ok) {
      const found = (await res.json()) as MailpitSearch;
      const first = found.messages[0];
      if (first) {
        const msg = (await (await fetch(`${mailpitUrl}/api/v1/message/${first.ID}`)).json()) as MailpitMessage;
        const code = msg.HTML.match(/data-verification-code="true"[^>]*>\s*(\d{6})\s*</)?.[1];
        if (code) return code;
        throw new Error(`The email to ${email} has no verification code.`);
      }
    }
    await sleep(1000);
  }
  throw new Error(`No confirmation email for ${email} reached ${mailpitUrl} within ${timeoutMs} ms.`);
}

/** Signs in as the test user from Node (no session saved to disk). */
export async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Node 20 (CI) has no WebSocket, and supabase-js builds a realtime client
    // on creation. The tests never open a realtime channel, so a stub is enough.
    realtime: { transport: NoRealtime as unknown as RealtimeTransport },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Node sign-in failed: ${error.message}`);
  return client;
}

async function userId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('No signed-in user.');
  return data.user.id;
}

export interface SavedProfile {
  username: string | null;
  onboarding_completed: boolean;
  avatar_config: Record<string, unknown> | null;
}

export async function readProfile(client: SupabaseClient): Promise<SavedProfile> {
  const { data, error } = await client
    .from('profiles')
    .select('username, onboarding_completed, avatar_config')
    .eq('id', await userId(client))
    .single();
  if (error) throw new Error(`Reading the profile failed: ${error.message}`);
  return data as SavedProfile;
}

export async function readTotalXp(client: SupabaseClient): Promise<number> {
  const { data, error } = await client
    .from('gamification')
    .select('total_xp')
    .eq('user_id', await userId(client))
    .maybeSingle();
  if (error) throw new Error(`Reading XP failed: ${error.message}`);
  return (data as { total_xp: number } | null)?.total_xp ?? 0;
}
