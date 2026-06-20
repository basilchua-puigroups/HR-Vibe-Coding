-- ── Broaden RLS policies from anon to public (anon + authenticated) ──────────
-- After migrating login to Supabase Auth, the app's requests come in as the
-- `authenticated` role instead of `anon`. The existing `public_all` policies were
-- scoped `TO anon` only, so logged-in users matched no policy → reads returned
-- nothing and writes failed ("new row violates row-level security policy").
--
-- This re-points every `public_all` policy to the `public` pseudo-role, which
-- covers both anon and authenticated, restoring the same wide-open access for
-- signed-in users. (Same posture as before — no per-row lockdown yet.)
-- Idempotent — safe to re-run.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_policies
    WHERE policyname = 'public_all'
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO public', 'public_all', r.schemaname, r.tablename);
  END LOOP;
END $$;
