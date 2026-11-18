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
  Slot generation skips any session that overlaps a booking.
- Sessions are 50 minutes, matching the minimum window length, so every window
  that is accepted can hold at least one session.
- Members book by sending the `starts_at` of a slot from the current list. The server
  recomputes slots and rejects any other time with 409.
- `book_session` locks the professional's `users` row, checks for overlapping bookings,
  then inserts. This stops two members from booking the same session at once.

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
