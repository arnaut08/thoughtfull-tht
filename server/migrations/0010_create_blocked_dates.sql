-- Calendar dates a professional has blocked off. A blocked date has no open slots.
-- blocked_date is a plain date in the professional's local timezone. Run once in the Supabase SQL editor.
create table if not exists public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.users (id) on delete cascade,
  blocked_date date not null,
  unique (professional_id, blocked_date)
);
