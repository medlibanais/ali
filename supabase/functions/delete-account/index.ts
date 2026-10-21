// delete-account: permanently removes the calling user's account.
// Verifies the user's JWT, wipes their storage files, then deletes the
// auth user (every app row cascades via ON DELETE CASCADE).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'missing_authorization' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // Who is calling?
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ error: 'invalid_session' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Remove every storage object the user owns (profile photos folder).
    const { data: files } = await admin.storage
      .from('profile-photos')
      .list(user.id, { limit: 1000 });
    if (files && files.length > 0) {
      await admin.storage
        .from('profile-photos')
        .remove(files.map((f) => `${user.id}/${f.name}`));
    }

    // Delete the auth user; all app data cascades.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return json({ error: 'delete_failed', message: deleteError.message }, 500);
    }

    return json({ deleted: true }, 200);
  } catch (e) {
    return json(
      { error: 'internal', message: e instanceof Error ? e.message : 'error' },
      500,
    );
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
