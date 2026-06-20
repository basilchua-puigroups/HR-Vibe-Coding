-- Migration: create workers table
-- Date: 2026-06-14

create table if not exists workers (
  id            bigserial primary key,
  worker_id     text        not null unique,
  name          text        not null,
  shift         text        not null default 'A',
  department    text        not null default '',
  email         text        not null default '',
  auth_user_id  uuid        references auth.users(id) on delete set null,
  status        text        not null default 'Active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Enable RLS
alter table workers enable row level security;

-- Authenticated staff can read all workers
create policy "workers_select_authenticated"
  on workers for select
  to authenticated
  using (true);

-- Authenticated staff can insert/update/delete workers
create policy "workers_insert_authenticated"
  on workers for insert
  to authenticated
  with check (true);

create policy "workers_update_authenticated"
  on workers for update
  to authenticated
  using (true)
  with check (true);

create policy "workers_delete_authenticated"
  on workers for delete
  to authenticated
  using (true);

-- Workers can read their own row via auth_user_id
create policy "workers_select_self"
  on workers for select
  to authenticated
  using (auth_user_id = auth.uid());
