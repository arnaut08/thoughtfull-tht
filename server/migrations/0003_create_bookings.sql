-- Booked sessions, stored as absolute instants. Run once in the Supabase SQL editor.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.users (id) on delete cascade,
  member_id uuid not null references public.users (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists bookings_professional_starts_at_idx
  on public.bookings (professional_id, starts_at);
