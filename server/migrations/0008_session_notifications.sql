-- In-app notifications for cancelled and rescheduled sessions. Run once in the Supabase SQL editor, after 0007.
-- Each notification is written in the same transaction as the change it describes, so it exists exactly when the
-- session was cancelled or moved. Reminder types (24 hours and 1 hour before a session) can be added later by
-- extending the type check and the constraint on new_starts_at.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users (id) on delete cascade,
  actor_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('session_cancelled', 'session_rescheduled')),
  -- The session's start before the change. For a reschedule, this is the old time.
  session_starts_at timestamptz not null,
  -- The session's new start. Only set for reschedules.
  new_starts_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check ((type = 'session_rescheduled') = (new_starts_at is not null))
);

create index if not exists notifications_recipient_created_at_idx
  on public.notifications (recipient_id, created_at desc);

-- Cancels one session and notifies the other party. Members can cancel only if the session starts after
-- p_notice_cutoff; professionals have no notice limit. Locks follow the same order as reschedule_session.
create or replace function public.cancel_session(
  p_booking_id uuid,
  p_professional_id uuid,
  p_member_id uuid,
  p_by_professional boolean,
  p_notice_cutoff timestamptz
)
returns void
language plpgsql
as $$
declare
  current_starts_at timestamptz;
begin
  perform 1 from public.users where id = p_professional_id for update;
  perform 1 from public.users where id = p_member_id for update;

  select starts_at into current_starts_at
  from public.bookings
  where id = p_booking_id
    and professional_id = p_professional_id
    and member_id = p_member_id
  for update;
  if not found then
    raise exception 'booking_not_found';
  end if;

  if not p_by_professional and current_starts_at <= p_notice_cutoff then
    raise exception 'cancellation_closed';
  end if;

  delete from public.bookings where id = p_booking_id;

  insert into public.notifications (recipient_id, actor_id, type, session_starts_at)
  values (
    case when p_by_professional then p_member_id else p_professional_id end,
    case when p_by_professional then p_professional_id else p_member_id end,
    'session_cancelled',
    current_starts_at
  );
end;
$$;

revoke all on function public.cancel_session(uuid, uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.cancel_session(uuid, uuid, uuid, boolean, timestamptz) to service_role;

-- Same body as 0007, plus a notification for the other party. Replaces the 6-argument function in place.
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

  insert into public.notifications (recipient_id, actor_id, type, session_starts_at, new_starts_at)
  values (
    case when p_by_professional then p_member_id else p_professional_id end,
    case when p_by_professional then p_professional_id else p_member_id end,
    'session_rescheduled',
    current_starts_at,
    p_starts_at
  );

  return result;
end;
$$;
