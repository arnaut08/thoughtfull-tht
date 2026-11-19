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

## In-app notifications
- Cancelling and rescheduling write a `notifications` row in the same transaction as the change.
  `cancel_session` (migration `0008_session_notifications.sql`) replaces the plain deletes, and
  `reschedule_session` also inserts a row. A change can't happen without its notification, and
  a refused cancellation writes nothing.
- The recipient is the other party. A member's action notifies the professional, and a professional's
  action notifies the member.
- Types are `session_cancelled`, `session_rescheduled`, and `session_reminder`. A check constraint ties `new_starts_at` to the
  reschedule type. Reminders have no `new_starts_at`, so they pass that constraint.

## Session reminders
- A reminder is scheduled 24 hours and 1 hour before the session starts, for both the member and the
  professional. Each reminder is a `session_reminders` row (migration `0009_session_reminders.sql`).
- `book_session` and `reschedule_session` call `sync_session_reminders`, in the same transaction as the
  booking change. It deletes the session's undelivered reminders and writes new ones for the current start.
  A reminder whose time has already passed is not created.
- Cancelling deletes the booking, and the reminders cascade with it. Nothing else needs to change.
- Delivery: `deliver_due_reminders` runs every 30 seconds from `startReminderWorker` (`server/src/services/reminders.js`).
  It locks due rows with `SKIP LOCKED`, inserts the notification, and sets `delivered_at` in one statement. The
  row and its notification commit together, so a reminder is delivered exactly once, including across restarts
  and multiple server instances. Reminders that came due while the server was down are delivered when it comes back.
- Delivered reminders stay in the table. A reschedule creates reminders for the new start, and the unique key
  includes the start, so a reminder delivered for the old time doesn't block the new one.
- `GET /api/notifications` returns the 50 newest items plus an exact unread count.
  `POST /api/notifications/read` marks everything read. The client polls the unread count every 30 seconds
  and marks items read when the tray opens. Polling was chosen over websockets for simplicity.

## Slot generation
- Slots are built from the professional's local-time windows in the professional's
  timezone, then returned as instants in the member's timezone. Luxon handles
  the offsets, so a 09:00 window stays at 09:00 local time across DST changes.
- Sessions step by absolute time (50 minutes), so a session keeps its length when
  clocks change. A local time that falls in a DST gap moves forward.
- Slots cover the next 4 weeks (28 days, `SLOT_HORIZON_DAYS`) from the request time and exclude sessions that
  have already started.
- The member's booking calendar uses FullCalendar's week day grid (`dayGridWeek`), so the seven days sit side by side. It shows one chip per session, which avoids the list view's full-width rows and its duplicate handling of overnight sessions.
- Each chip shows only its time range (`displayEventTime: false`, range in the title). Members only see open slots, so there is no "Open" label. A session that crosses midnight in the member's zone is capped at that midnight, so it appears once, on its start day, and its end time is shown without a date.
- The chip the member picks is highlighted (`is-selected`) until they confirm or cancel. Confirmation runs in a dialog rather than a panel at the bottom of the page, and success or error messages appear above the calendar.

## Blocked dates
- A professional can block whole calendar dates (`blocked_dates`, migration `0010_create_blocked_dates.sql`).
  The date is local to the professional's timezone, like the weekly rules.
- A blocked date has no open slots. `generateOpenSlots` skips the whole day, both for members and in the
  professional's own session list.
- `POST /api/availability/blocked-dates` (idempotent) and `DELETE /api/availability/blocked-dates/:date` change
  blocks immediately. They are not part of the weekly-rules save.
- Rescheduling is suggested per session: `GET /api/availability/reschedule-suggestions?date=` proposes the same local
  time on the nearest later day with an open slot (falling back to the earliest free slot). It skips the blocked day,
  the member's other sessions, and slots already suggested for another session. The dialog shows each suggestion
  and lets the professional change it by picking a day, then a time. Confirming moves each session through
  `POST /api/professional-bookings/:id/reschedule` (which notifies the member), then blocks the date. Calls are
  sequential, so a failure partway leaves earlier moves in place and the dialog lists the sessions still to move.
- Blocked dates are managed on their own page, opened from the professional's profile, with a month calendar where clicking a day toggles its block. Weekly hours stay on the availability page.

## Booking notice
- A professional can require whole hours of notice before a session starts (`users.min_booking_notice_hours`, migration
  `0011_booking_notice.sql`). 0 means no minimum, and the maximum is 168 hours.
- `PUT /api/availability/booking-notice` saves it. `GET /api/availability` and `GET /api/professionals/:id` return it.
- `generateOpenSlots` drops any session that starts before now plus the notice. Member bookings and member reschedules
  both use those slots, so both respect the notice. The server rejects a slot that doesn't meet it with 409.
- The notice doesn't apply to professionals. Their reschedule suggestions and their own reschedules and cancellations
  aren't limited by it.

## Timezone changes
- Changing `users.timezone` keeps the local hours. Monday 09:00 stays 09:00 in the
  new zone.
- The UI should warn the professional before the change.
- Booked sessions are stored as absolute instants and are not changed.
- DST behavior is handled by the slot generator (`server/src/lib/slots.js`).
