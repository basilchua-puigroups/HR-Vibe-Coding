-- Migration: create cages-tipped storage bucket and RLS policies
-- Run this in Supabase SQL editor (Dashboard → SQL Editor → New query)

-- 1. Create the bucket (public=false so files aren't world-readable)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cages-tipped', 'cages-tipped', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow authenticated users to upload (INSERT)
CREATE POLICY "authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cages-tipped');

-- 3. Allow authenticated users to read/download (SELECT)
CREATE POLICY "authenticated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cages-tipped');

-- 4. Allow authenticated users to delete their own files (DELETE)
CREATE POLICY "authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'cages-tipped');
