// Supabase Edge Function: admin-users
// ─────────────────────────────────────────────────────────────────────────────
// Privileged user-account management for the Mill Parts System. The browser only
// holds the anon key and cannot manage auth.users, so the Administrator page calls
// this function (authenticated as the admin) and it performs the work with the
// service-role key that Supabase injects into the edge runtime.
//
// Actions (POST JSON body):
//   { action: "create",      email, password }      -> { uid }
//   { action: "setPassword", uid, password }        -> { ok: true }
//   { action: "updateEmail", uid, email }           -> { ok: true }
//   { action: "delete",      uid }                  -> { ok: true }
//
// Authorization: the caller's JWT must belong to a user_settings row with
// is_admin = true.
//
// Deploy: supabase functions deploy admin-users
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Service-role client: full privileges, used for all auth.admin operations.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Authorize: caller must be a signed-in admin ──────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  // Validate the caller's JWT against Auth using the anon client.
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await caller.auth.getUser(token);
  if (userErr || !userData?.user?.email) return json({ error: 'Invalid session' }, 401);

  // Confirm the caller's email maps to an admin user_settings row.
  const { data: settingRow, error: settingErr } = await admin
    .from('user_settings')
    .select('is_admin')
    .ilike('email', userData.user.email)
    .maybeSingle();
  if (settingErr) return json({ error: settingErr.message }, 500);
  if (!settingRow?.is_admin) return json({ error: 'Admin privileges required' }, 403);

  // ── Dispatch ─────────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const action = String(body.action ?? '');

  try {
    switch (action) {
      case 'create': {
        const email = String(body.email ?? '').trim();
        const password = String(body.password ?? '');
        if (!email || !password) return json({ error: 'email and password are required' }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true, // no confirmation step — usable immediately
        });
        if (!error) return json({ uid: data.user?.id });

        // Email already has an Auth account (e.g. an orphan left by a half-finished
        // create). Reconcile instead of failing: find it, reset its password to the
        // one just entered, and return its uid so the app can link the row to it.
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = list?.users?.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
        if (existing && !listErr) {
          await admin.auth.admin.updateUserById(existing.id, { password });
          return json({ uid: existing.id, reused: true });
        }
        return json({ error: error.message }, 400);
      }

      case 'setPassword': {
        const uid = String(body.uid ?? '');
        const password = String(body.password ?? '');
        if (!uid || !password) return json({ error: 'uid and password are required' }, 400);
        const { error } = await admin.auth.admin.updateUserById(uid, { password });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case 'updateEmail': {
        const uid = String(body.uid ?? '');
        const email = String(body.email ?? '').trim();
        if (!uid || !email) return json({ error: 'uid and email are required' }, 400);
        const { error } = await admin.auth.admin.updateUserById(uid, { email, email_confirm: true });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case 'delete': {
        const uid = String(body.uid ?? '');
        if (!uid) return json({ error: 'uid is required' }, 400);
        const { error } = await admin.auth.admin.deleteUser(uid);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: (err as Error).message ?? String(err) }, 500);
  }
});
