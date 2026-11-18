-- Lets a professional move one of their sessions without the 24-hour notice rule that applies to members.
-- Replaces the 5-argument reschedule_session from 0006. Run once in the Supabase SQL editor, after 0006.
drop function if exists public.reschedule_session(uuid, uuid, uuid, timestamptz, timestamptz);

-- The move is still one statement under the same locks, so the member's session is never removed without a new time.
create or replace function public.reschedule_session(
  p_booking_id uuid,
  p_professional_id uuid,
  p_member_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_by_professional boolean default false
)
returns public.bookings
language plpgsql
as $$
declare
  result public.bookings;
  current_starts_at timestamptz;
begin
  if p_starts_at <= now() then
    raise exception 'slot_in_past';
  end if;

  perform 1 from public.users where id = p_professional_id for update;
  if not found then
    raise exception 'professional % not found', p_professional_id;
  end if;

  perform 1 from public.users where id = p_member_id for update;
  if not found then
    raise exception 'member % not found', p_member_id;
  end if;

  select starts_at into current_starts_at
  from public.bookings
  where id = p_booking_id
    and professional_id = p_professional_id
    and member_id = p_member_id
  for update;
  if not found then
    raise exception 'booking_not_found';
  end if;

  if not p_by_professional and current_starts_at <= now() + interval '24 hours' then
    raise exception 'cancellation_closed';
  end if;

  if exists (
    select 1 from public.bookings
    where professional_id = p_professional_id
      and id <> p_booking_id
      and starts_at < p_ends_at
      and ends_at > p_starts_at
  ) then
    raise exception 'slot_unavailable';
  end if;

  if exists (
    select 1 from public.bookings
    where member_id = p_member_id
      and id <> p_booking_id
      and starts_at < p_ends_at
      and ends_at > p_starts_at
  ) then
    raise exception 'member_conflict';
  end if;

  update public.bookings
  set starts_at = p_starts_at, ends_at = p_ends_at
  where id = p_booking_id
  returning * into result;

  return result;
end;
$$;

-- Only the server (service role key) may reschedule sessions; not anon or signed-in clients.
revoke all on function public.reschedule_session(uuid, uuid, uuid, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.reschedule_session(uuid, uuid, uuid, timestamptz, timestamptz, boolean) to service_role;
