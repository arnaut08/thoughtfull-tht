-- Replaces book_session from 0004. Run once in the Supabase SQL editor, after 0004.
-- A member can't hold overlapping sessions with any professional, not just the same one.
-- Locks are taken in a fixed order (professional, then member) so concurrent bookings can't deadlock.
create or replace function public.book_session(
  p_professional_id uuid,
  p_member_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns public.bookings
language plpgsql
as $$
declare
  result public.bookings;
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

  if exists (
    select 1 from public.bookings
    where professional_id = p_professional_id
      and starts_at < p_ends_at
      and ends_at > p_starts_at
  ) then
    raise exception 'slot_unavailable';
  end if;

  if exists (
    select 1 from public.bookings
    where member_id = p_member_id
      and starts_at < p_ends_at
      and ends_at > p_starts_at
  ) then
    raise exception 'member_conflict';
  end if;

  insert into public.bookings (professional_id, member_id, starts_at, ends_at)
  values (p_professional_id, p_member_id, p_starts_at, p_ends_at)
  returning * into result;

  return result;
end;
$$;

-- Only the server (service role key) may book sessions; not anon or signed-in clients.
revoke all on function public.book_session(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.book_session(uuid, uuid, timestamptz, timestamptz) to service_role;
