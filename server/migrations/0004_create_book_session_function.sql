-- Books a session for a member. Run once in the Supabase SQL editor, after 0003.
-- The row lock on users serializes concurrent bookings for the same professional, so two
-- members can't both take the same session.
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
  perform 1 from public.users where id = p_professional_id for update;
  if not found then
    raise exception 'professional % not found', p_professional_id;
  end if;

  if exists (
    select 1 from public.bookings
    where professional_id = p_professional_id
      and starts_at < p_ends_at
      and ends_at > p_starts_at
  ) then
    raise exception 'slot_unavailable';
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
