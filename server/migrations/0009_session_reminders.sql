-- Reminders 24 hours and 1 hour before a session, for both the member and the professional.
-- Run once in the Supabase SQL editor, after 0008.
-- Replaces book_session (0005) and reschedule_session (0008). cancel_session needs no change: deleting the booking
-- cascades to its reminders, so cancelled sessions stop reminding.

create table if not exists public.session_reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  recipient_id uuid not null references public.users (id) on delete cascade,
  actor_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('24h', '1h')),
  -- The session start this reminder was scheduled for. A reschedule creates reminders for the new start, so the
  -- key includes it and a reminder delivered for the old time doesn't block the new one.
  session_starts_at timestamptz not null,
  remind_at timestamptz not null,
  -- Set in the same transaction that inserts the notification, so a reminder is delivered exactly once.
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, recipient_id, kind, session_starts_at)
);

create index if not exists session_reminders_due_idx
  on public.session_reminders (remind_at)
  where delivered_at is null;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('session_cancelled', 'session_rescheduled', 'session_reminder'));

-- Replaces the booking's undelivered reminders with ones for its current start. Reminders whose time has already
-- passed are not created. Delivered reminders are kept, so a reminder is never sent twice for the same start.
create or replace function public.sync_session_reminders(p_booking_id uuid)
returns void
language plpgsql
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    return;
  end if;

  delete from public.session_reminders
  where booking_id = b.id and delivered_at is null;

  insert into public.session_reminders (booking_id, recipient_id, actor_id, kind, session_starts_at, remind_at)
  select b.id, party.recipient_id, party.actor_id, lead.kind, b.starts_at, b.starts_at - lead.offset_by
  from (values (b.member_id, b.professional_id), (b.professional_id, b.member_id)) as party(recipient_id, actor_id)
  cross join (values ('24h', interval '24 hours'), ('1h', interval '1 hour')) as lead(kind, offset_by)
  where b.starts_at - lead.offset_by > now()
  on conflict (booking_id, recipient_id, kind, session_starts_at) do nothing;
end;
$$;

-- Delivers every reminder that is due, as in-app notifications. Returns how many were delivered.
-- Rows are locked with SKIP LOCKED, so overlapping runs (for example two server instances) never pick up the same
-- reminder. The notification insert and the delivered_at update happen in one statement, so they commit together.
create or replace function public.deliver_due_reminders()
returns integer
language plpgsql
as $$
declare
  delivered integer;
begin
  with due as (
    select id, recipient_id, actor_id, session_starts_at
    from public.session_reminders
    where delivered_at is null
      and remind_at <= now()
    order by remind_at
    limit 500
    for update skip locked
  ),
  notified as (
    insert into public.notifications (recipient_id, actor_id, type, session_starts_at)
    select recipient_id, actor_id, 'session_reminder', session_starts_at
    from due
    returning id
  ),
  marked as (
    update public.session_reminders r
    set delivered_at = now()
    from due
    where r.id = due.id
    returning r.id
  )
  select count(*) into delivered from marked;

  return delivered;
end;
$$;

revoke all on function public.sync_session_reminders(uuid) from public, anon, authenticated;
grant execute on function public.sync_session_reminders(uuid) to service_role;
revoke all on function public.deliver_due_reminders() from public, anon, authenticated;
grant execute on function public.deliver_due_reminders() to service_role;

-- Same body as 0005, plus reminders for the new booking.
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

  perform public.sync_session_reminders(result.id);

  return result;
end;
$$;

revoke all on function public.book_session(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.book_session(uuid, uuid, timestamptz, timestamptz) to service_role;

-- Same body as 0008, plus reminders for the new start. Reminders for the old start that haven't been delivered
-- are removed, so the member and professional are never reminded about a time the session no longer has.
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

  perform public.sync_session_reminders(p_booking_id);

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

revoke all on function public.reschedule_session(uuid, uuid, uuid, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.reschedule_session(uuid, uuid, uuid, timestamptz, timestamptz, boolean) to service_role;
