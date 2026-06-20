-- Migration: create worker_attendance table + storage policy for worker-attendance folder
-- Date: 2026-06-14

create table if not exists worker_attendance (
  id           bigserial primary key,
  worker_id    bigint      not null references workers(id) on delete cascade,
  date         date        not null,
  slot_hour    integer     not null check (slot_hour >= 0 and slot_hour <= 23),
  photo_name   text        not null default '',
  photo_data   text        not null default '',
  captured_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (worker_id, date, slot_hour)
);

-- Enable RLS
alter table worker_attendance enable row level security;

-- Authenticated staff can read all attendance
create policy "worker_attendance_select_authenticated"
  on worker_attendance for select
  to authenticated
  using (true);

-- Authenticated users (workers + staff) can insert/update their own rows
create policy "worker_attendance_insert_authenticated"
  on worker_attendance for insert
  to authenticated
  with check (true);

create policy "worker_attendance_update_authenticated"
  on worker_attendance for update
  to authenticated
  using (true)
  with check (true);

create policy "worker_attendance_delete_authenticated"
  on worker_attendance for delete
  to authenticated
  using (true);

-- Storage: allow authenticated users to manage files under worker-attendance/ in the attachments bucket
-- (attachments bucket must already exist; created by supabase_migration_2026-06-14_cages_tipped_storage.sql)

create policy "worker_attendance_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = 'worker-attendance'
  );

create policy "worker_attendance_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = 'worker-attendance'
  );

create policy "worker_attendance_storage_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = 'worker-attendance'
  );

create policy "worker_attendance_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = 'worker-attendance'
  );
