-- BookFlip Pro2Go cloud sync schema
-- Run this in the Supabase SQL Editor for your BookFlip project.
-- Each authenticated user can access only their own backup payload.

create table if not exists public.bookflip_user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.bookflip_user_data enable row level security;

revoke all on table public.bookflip_user_data from anon;
grant select, insert, update on table public.bookflip_user_data to authenticated;

drop policy if exists "Users can read their own BookFlip data" on public.bookflip_user_data;
create policy "Users can read their own BookFlip data"
  on public.bookflip_user_data
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own BookFlip data" on public.bookflip_user_data;
create policy "Users can create their own BookFlip data"
  on public.bookflip_user_data
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own BookFlip data" on public.bookflip_user_data;
create policy "Users can update their own BookFlip data"
  on public.bookflip_user_data
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.bookflip_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists bookflip_user_data_updated_at on public.bookflip_user_data;
create trigger bookflip_user_data_updated_at
  before update on public.bookflip_user_data
  for each row
  execute function public.bookflip_set_updated_at();
