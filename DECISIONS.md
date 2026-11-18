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

## Timezone changes
- Changing `users.timezone` keeps the local hours. Monday 09:00 stays 09:00 in the
  new zone.
- The UI should warn the professional before the change.
- Booked sessions are stored as absolute instants and are not changed.
- DST behavior belongs to the slot generator, which is not built yet.
