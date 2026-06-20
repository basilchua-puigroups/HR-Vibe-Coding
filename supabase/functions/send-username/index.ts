// Supabase Edge Function: send-username
// ─────────────────────────────────────────────────────────────────────────────
// "Forgot username" support. A (possibly signed-out) user submits their email;
// this function looks up the matching user_settings username(s) and emails them
// over SMTP (e.g. Gmail). It always responds with a neutral { ok: true } so it
// can't be used to probe which emails have accounts.
//
// Body (POST JSON): { email: string }
//
// Required secrets (set under Edge Functions → Secrets):
//   SMTP_HOST   — e.g. smtp.gmail.com
//   SMTP_PORT   — e.g. 465  (SSL/implicit TLS) or 587 (STARTTLS)
//   SMTP_USER   — the sending account, e.g. youraddress@gmail.com
//   SMTP_PASS   — an app password for that account (NOT the normal login password)
//   SMTP_FROM   — optional display name + address; defaults to SMTP_USER.
//                 For Gmail this must be the SMTP_USER address.
//
// Deploy: supabase functions deploy send-username
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? '';
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465');
const SMTP_USER = Deno.env.get('SMTP_USER') ?? '';
const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? '';
const SMTP_FROM = Deno.env.get('SMTP_FROM') ?? SMTP_USER;

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

async function sendEmail(to: string, usernames: string[]): Promise<void> {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error('SMTP secrets are not set — cannot send username email.');
    return;
  }

  const list = usernames.length === 1
    ? `Your username is: <strong>${usernames[0]}</strong>`
    : `The usernames linked to this email are:<br><strong>${usernames.join('<br>')}</strong>`;
  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
      <h2 style="color:#1a3c2a;">Mill Parts System</h2>
      <p>You asked to be reminded of your username.</p>
      <p>${list}</p>
      <p style="color:#777;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
    </div>`;
  const text = usernames.length === 1
    ? `Your Mill Parts System username is: ${usernames[0]}`
    : `Your Mill Parts System usernames are: ${usernames.join(', ')}`;

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: SMTP_PORT === 465, // implicit TLS on 465; 587 upgrades via STARTTLS
      auth: { username: SMTP_USER, password: SMTP_PASS },
    },
  });

  try {
    await client.send({
      from: SMTP_FROM,
      to,
      subject: 'Your Mill Parts System username',
      content: text,
      html,
    });
  } catch (err) {
    console.error('SMTP send failed:', (err as Error).message ?? err);
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let email = '';
  try {
    const body = await req.json();
    email = String(body.email ?? '').trim();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!email) return json({ error: 'email is required' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows } = await admin
    .from('user_settings')
    .select('username')
    .ilike('email', email);

  const usernames = (rows ?? [])
    .map((r: { username?: string }) => String(r.username ?? '').trim())
    .filter(Boolean);

  // Only send if we actually found matching account(s). Either way respond neutrally.
  if (usernames.length > 0) {
    await sendEmail(email, usernames);
  }

  return json({ ok: true });
});
