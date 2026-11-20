-- Users table for registration and login. Run once in the Supabase SQL editor.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('member', 'professional')),
  timezone text not null,
  created_at timestamptz not null default now()
);
