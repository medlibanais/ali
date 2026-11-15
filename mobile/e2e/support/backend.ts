// Node-side helpers for the journey test: read the confirmation email from
// the local mail catcher (Mailpit), confirm the account, and read what the
// app saved. Everything goes through the anon key and the test user's own
// session, so Row Level Security applies exactly as it does in the app.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabase } from '../scripts/local-supabase';

const { url, anonKey, mailpitUrl } = resolveSupabase();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MailpitSearch {
  messages: { ID: string }[];
}
interface MailpitMessage {
  Text: string;
  HTML: string;
}

/** Waits for the sign-up email and returns its confirmation link. */
export async function findConfirmationLink(email: string, timeoutMs = 30000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const query = encodeURIComponent(`to:"${email}"`);
  while (Date.now() < deadline) {
    const res = await fetch(`${mailpitUrl}/api/v1/search?query=${query}`);
    if (res.ok) {
      const found = (await res.json()) as MailpitSearch;
      const first = found.messages[0];
      if (first) {
        const msg = (await (await fetch(`${mailpitUrl}/api/v1/message/${first.ID}`)).json()) as MailpitMessage;
        const body = `${msg.Text}\n${msg.HTML}`.replace(/&amp;/g, '&');
        const link = body.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>)\]]+/);
        if (link) return link[0];
        throw new Error(`The email to ${email} has no confirmation link.`);
      }
    }
    await sleep(1000);
  }
  throw new Error(`No confirmation email for ${email} reached ${mailpitUrl} within ${timeoutMs} ms.`);
}

/**
 * Opens the confirmation link the way a mail client would. Supabase
 * confirms the address and redirects to the app; we only need the
 * confirmation, so the redirect is not followed.
 */
export async function confirmEmail(email: string): Promise<void> {
  const link = await findConfirmationLink(email);
  const res = await fetch(link, { redirect: 'manual' });
  const location = res.headers.get('location') ?? '';
  if (res.status < 300 || res.status >= 400 || location.includes('error=')) {
    throw new Error(`Confirming ${email} failed: HTTP ${res.status} ${location}`);
  }
}

/** Signs in as the test user from Node (no session saved to disk). */
export async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
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
