-- Minimum notice, in whole hours, a professional requires before a session can be booked. 0 means no minimum.
-- Run once in the Supabase SQL editor, after 0010.
alter table public.users
  add column if not exists min_booking_notice_hours integer not null default 0
  check (min_booking_notice_hours between 0 and 168);
