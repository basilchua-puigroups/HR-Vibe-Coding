// One-time backfill: create Supabase Auth accounts for existing user_settings rows.
// ─────────────────────────────────────────────────────────────────────────────
// For every user_settings row that isn't yet linked to an auth.users account, this
// script creates an auth user using the row's existing plaintext password (so the
// migration is invisible to users), assigns a synthetic email where none exists,
// and writes back `email` + `auth_user_id`. Idempotent — rows that already have an
// auth_user_id are skipped.
//
// Prerequisites: run the SQL migration first (adds email + auth_user_id columns).
//
// Usage (PowerShell):
//   $env:SUPABASE_URL = "https://<project>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key>"   # secret — never commit
//   node scripts/backfill-auth-users.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNTHETIC_DOMAIN = '@millparts.local';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function syntheticEmail(username) {
  return `${String(username).trim().toLowerCase()}${SYNTHETIC_DOMAIN}`;
}

const { data: users, error } = await db
  .from('user_settings')
  .select('id, username, password, email, auth_user_id')
  .order('id');

if (error) {
  console.error('Failed to read user_settings:', error.message);
  process.exit(1);
}

let created = 0, skipped = 0, failed = 0;

for (const u of users ?? []) {
  if (u.auth_user_id) { skipped++; continue; }

  const email = (u.email && u.email.trim()) ? u.email.trim() : syntheticEmail(u.username);
  const password = u.password && u.password.length >= 6 ? u.password : 'changeme123';

  // Create (or reuse) the auth account.
  const { data: createData, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  let uid = createData?.user?.id;

  if (createErr) {
    // Likely already exists — try to find it by listing.
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((x) => (x.email ?? '').toLowerCase() === email.toLowerCase());
    if (existing) {
      uid = existing.id;
    } else {
      console.error(`  ✗ ${u.username} (${email}): ${createErr.message}`);
      failed++;
      continue;
    }
  }

  const { error: updErr } = await db
    .from('user_settings')
    .update({ email, auth_user_id: uid })
    .eq('id', u.id);

  if (updErr) {
    console.error(`  ✗ ${u.username}: linked auth user but failed to update row: ${updErr.message}`);
    failed++;
    continue;
  }

  console.log(`  ✓ ${u.username} → ${email}`);
  created++;
}

console.log(`\nDone. linked=${created}, skipped(existing)=${skipped}, failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
