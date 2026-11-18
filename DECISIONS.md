# Decisions

## Availability storage
- `availability_rules` stores `day_of_week`, `start_time`, and `end_time` in the
  professional's local time. There are no UTC columns. Conversion to UTC happens
  only when slots are computed.
- Overnight windows are rejected. The professional splits them into two same-day
  windows.
- Each window must be at least 50 minutes, since a shorter window can't hold a session.
- Overlapping and adjacent windows on the same day are merged.
- A week is replaced in one call (`PUT /api/availability`). The replacement runs in
  the `replace_availability_rules` SQL function, which locks the professional's
  `users` row so concurrent updates serialize.

## Booked sessions
- `bookings` stores each session as an absolute `starts_at`/`ends_at` pair (UTC).
  Slot generation skips any session that overlaps a booking for the professional or
  for the member (with any professional).
- Sessions are 50 minutes, matching the minimum window length, so every window
  that is accepted can hold at least one session.
- Members book by sending the `starts_at` of a slot from the current list. The server
  recomputes slots and rejects any other time with 409.
- `book_session` locks the professional's `users` row and then the member's, checks
  for overlapping bookings with both, then inserts. This stops two members from
  booking the same session at once, and stops one member from holding overlapping
  sessions with two professionals. The lock order is fixed to avoid deadlocks.

## Cancellations
- A member can cancel a session only if it starts more than 24 hours from now.
  `DELETE /api/bookings/:id` returns 409 otherwise. The delete repeats the start-time
  condition in the same statement, so a session can't be cancelled after the cutoff.
- `GET /api/bookings` returns each session's `id` and a `cancellable` flag.
- Rescheduling uses the same 24-hour rule, applied to the session being moved (its current
  start), not the new slot. `POST /api/professionals/:id/bookings/:bookingId/reschedule` moves the
  session atomically through `reschedule_session` (migration `0006_reschedule_session.sql`), which
  must be run in Supabase. The new slot follows the normal booking rules, and the session's own time
  is offered as open while rescheduling.
- Professionals have no notice limit. They can cancel any booked session
  (`DELETE /api/professional-bookings/:id`) and reschedule one
  (`POST /api/professional-bookings/:id/reschedule`) at any time. A professional's reschedule
  goes through the same `reschedule_session` RPC with `p_by_professional = true`, which skips only the
  24-hour check (migration `0007_professional_reschedule.sql`, which must be run after 0006). The member's
  session is moved in one step, never cancelled first, so the member is never left without a session.

## Slot generation
- Slots are built from the professional's local-time windows in the professional's
  timezone, then returned as instants in the member's timezone. Luxon handles
  the offsets, so a 09:00 window stays at 09:00 local time across DST changes.
- Sessions step by absolute time (50 minutes), so a session keeps its length when
  clocks change. A local time that falls in a DST gap moves forward.
- Slots cover the next 4 weeks (28 days, `SLOT_HORIZON_DAYS`) from the request time and exclude sessions that
  have already started.

## Timezone changes
- Changing `users.timezone` keeps the local hours. Monday 09:00 stays 09:00 in the
  new zone.
- The UI should warn the professional before the change.
- Booked sessions are stored as absolute instants and are not changed.
- DST behavior is handled by the slot generator (`server/src/lib/slots.js`).
