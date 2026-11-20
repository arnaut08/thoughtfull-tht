# Decisions

Key technical decisions, the reasoning behind them, and what I would do next.

## Architecture in brief

- **React + Express + Supabase Postgres.** The Express API owns authentication, validation and slot generation. Postgres owns anything that must be atomic.
- **Transactions live in SQL functions.** `supabase-js` can't run multi-statement transactions, so booking, rescheduling, cancelling, replacing a week of availability and delivering reminders are Postgres functions called with `.rpc()`. A function body runs as one transaction, so a failure leaves no half-written state.
- **The service-role key stays on the server.** Access control is enforced in Express: the caller is identified from the verified JWT on every request, and no route takes a user ID from the client to decide who is acting.

## Assumptions

- Every user picks an IANA timezone at sign-up. Sessions are always 50 minutes, between one member and one professional.
- Changing weekly hours, or the booking notice, never moves or cancels existing sessions. Those are fixed instants.
- Both people are notified of a change made by the other party. Both get reminders.
- Out of scope, per the brief: password reset, email verification, social login, payments, video calls, recurring sessions, external calendar sync, and real email/SMS/push. The ones that matter most are listed under "What I'd do next".

## Timezones and daylight saving

The core idea is to store each kind of time in the form that matches what it means.

- **Availability is a recurring local intent**, so it's stored as `day_of_week` plus local `start_time`/`end_time`, interpreted in the professional's timezone. "Monday 09:00" means 09:00 on the wall clock every week of the year. There are no UTC columns for it.
- **Bookings are absolute events**, so they're stored as UTC instants (`starts_at`, `ends_at`). Reminder times are derived from the session's absolute start.
- **Slot generation** (`server/src/lib/slots.js`) does the conversion once per date. For each of the next 28 days it takes the date in the professional's timezone, resolves each window to instants with Luxon, and steps through them in absolute 50-minute increments. It then converts to the caller's timezone for display.
- **DST** therefore needs no data migration. A window stays at 09:00 local on both sides of a clock change, while the UTC instants shift. Sessions step by absolute time, so they keep their 50 minutes across a change, and a local time that falls in a spring-forward gap moves forward instead of producing an invalid slot.
- **The member's calendar** groups slots by day in the member's timezone, not the professional's, and always shows the timezone label. A late slot can land on a different date for the member, and this is deliberate.
- **The 24-hour rule** compares absolute instants, so DST can't shift the cutoff.
- **Changing a professional's timezone keeps their local hours** (Monday 09:00 stays 09:00 in the new zone). Existing sessions are unaffected because they're absolute instants.

## Slot layout

Sessions run back to back from the start of each availability window, 50 minutes each, and every session must fit entirely inside a window. Windows must be at least 50 minutes, so any accepted window holds at least one session.

I chose this over a fixed hourly grid with a buffer because it's simple to explain, and it never wastes working time. The trade-off is that there's no break between consecutive sessions. A configurable buffer is the first thing I'd add.

Other availability rules: overnight windows are rejected (split them across two days), overlapping and adjacent windows on a day are merged, and `end_time` may be `24:00` so a window can run to midnight. A week is replaced in one call, inside a function that locks the professional's `users` row so two concurrent saves serialize.

## Preventing double-booking

Several layers, with the database as the final authority.

1. **The server recomputes the open slots** and accepts a booking only if `starts_at` matches one exactly. This rejects arbitrary times, past slots, blocked dates, and anything inside the minimum notice. It's the layer that produces friendly errors.
2. **`book_session` re-checks inside a transaction.** It locks the professional's `users` row, then the member's, checks for overlapping bookings for both, and only then inserts. It also rejects a start in the past. Two members booking the same slot at the same moment queue on the professional's lock, and the second one sees the first's row and gets `409`.
3. **The member lock stops cross-professional overlaps.** One member can't hold two overlapping sessions with different professionals, even if both requests arrive together.
4. **The lock order is fixed** (professional first, then member), which avoids deadlocks.

Locking the `users` row works as a per-person mutex without locking a whole table, and it serializes only bookings for the same professional or member. Booking throughput per professional is low, so this is fine here. Reschedule uses the same checks, applied to the new slot, with the session's own current time offered as open while rescheduling.

## Cancel and reschedule

- **Members** can cancel or reschedule only if the session starts more than 24 hours from now. The rule applies to the session's *current* start, not the new slot. The cancel statement repeats the time condition in the same query, so a request can't slip past the cutoff between a check and a delete. The UI shows a clear message and explains the rule next to the disabled buttons.
- **Professionals** can cancel or reschedule at any time. Their reschedule goes through the same function with a flag that skips only the 24-hour check.
- **Reschedule is one atomic move** of the existing session, not a cancel followed by a rebook. The member can't end up with no session or with two.
- Cancelling and rescheduling write a notification for the other party in the same transaction, so a change can't happen without its notification, and a refused change writes nothing.

## Reminders

**Scheduling.** `book_session` and `reschedule_session` call `sync_session_reminders` in the same transaction as the booking change. It removes the session's undelivered reminders and writes new ones at start − 24 hours and start − 1 hour, for both people. A reminder whose time has already passed is not created. Cancelling deletes the booking and the reminders cascade with it.

**Delivery.** A worker (`server/src/services/reminders.js`) calls `deliver_due_reminders` every 30 seconds. The function selects due rows with `FOR UPDATE SKIP LOCKED`, inserts the notification, and sets `delivered_at`, all in one statement. The notification and the "delivered" mark commit together, so:

- each reminder is delivered **exactly once**, even if two server instances run at the same time (`SKIP LOCKED`);
- everything lives in the database, so a **restart loses nothing**, and reminders that came due while the server was down are delivered when it comes back;
- a reminder delivered for the old time doesn't block the new one after a reschedule, because the unique key includes the session's start.

**Notifications** are in-app. `GET /api/notifications` returns the 50 newest plus an exact unread count. The client polls the unread count every 30 seconds and marks items read when the tray opens. I chose polling over websockets for simplicity, at the cost of up to 30 seconds of lag.

## Access control and privacy

- Members can read and change only their own sessions. Professionals can see only their own schedule.
- A member viewing a calendar gets free slots only, with no booking data and no names. Only a professional's own schedule includes the member's name, and only on that professional's booked sessions.
- Role checks (`member` or `professional`) happen in the API on every protected route.

## Optional extras

- **Blocked dates.** A professional can block whole dates, interpreted in their own timezone. A blocked date has no open slots. Blocking is done from a month calendar, and when sessions already exist on the date, the dialog suggests a new time for each one (the same local time on the nearest later free day), which the professional can change before confirming. Each session is moved with the normal professional reschedule, so the member is notified.
- **Minimum booking notice.** A professional can require 0 to 168 whole hours of notice. Slot generation drops any slot that starts too soon, so booking and member reschedules both respect it, and the server rejects a violating request with `409`. It doesn't limit professionals' own reschedules or cancellations.
- **`docker compose up`** runs the client (nginx) and the API. The database is a hosted Supabase project.

## Known limitations

- **The reminder worker runs inside the API process.** If the process is down, reminders are delayed, not lost, but there's no backoff, alerting, or escalation for repeated failures. Delivery is in-app only, so a member who doesn't open the app won't see a reminder.
- **Polling, not push.** Notifications can lag by up to 30 seconds.
- **Cancelling deletes the booking.** There's no history of cancelled sessions beyond the notification sent to the other party.
- **Blocking a date with several sessions isn't atomic.** The sessions are moved one by one, so a failure partway leaves earlier moves in place, and the dialog lists the sessions still to move.
- **No buffer between sessions**, and no overnight windows.
- **Slots are computed per request** with no caching. That's fine at this scale.
- **Hosted Supabase is required.** Reviewers need their own project to run the app.
- **Database-level behaviour is only partly tested by default.** The tests that exercise real Postgres (exactly-once reminder delivery, restart survival) are skipped unless a throwaway database is configured, because they drop and recreate the schema. I chose that over running them against the shared project.

## What I'd do next

1. **Database-enforced overlap constraints** (exclusion constraints on time ranges per professional and per member) as a declarative backstop behind the lock-based checks.
2. **End-to-end tests** with two browser sessions racing for one slot, plus a DST-week test through the whole stack. Run the Postgres-backed tests in CI against a disposable database container so they never skip.
3. **Soft-delete cancellations** with who cancelled and when, instead of hard deletes.
4. **Move reminder delivery to a separate worker** or a job queue, add monitoring, and add real channels (email, push, SMS) with retries and a dead-letter path.
5. **Make bulk rescheduling atomic**, so a blocked date either moves every session or none.
6. **A configurable buffer and session length**, then realtime notifications.
7. From the out-of-scope list, the ones that matter most: **email verification and password reset** (account safety), **real reminder delivery** (reminders only help if people see them), and **video calls**.

## Running this safely in production for a healthcare product

This is a take-home, so the following are changes I'd require before real members used it.

**Data protection and compliance**
- Treat the data as sensitive: the fact that someone is booked with a mental health professional is itself health information. Check the legal basis and regional rules for each market (for example PDPA, GDPR or HIPAA), sign data-processing agreements with the database host, and pick a data region deliberately.
- Define consent, retention and deletion policies. Keep personal data out of logs and notification text, and keep notifications free of clinical detail.
- Encrypt in transit everywhere (TLS only) and at rest, and manage secrets in a secrets manager, not `.env` files.

**Authentication and authorization**
- Short-lived access tokens with refresh and revocation, tokens kept in httpOnly cookies instead of script-accessible storage, MFA (at least for professionals), rate limiting and lockout on login, and email verification with a secure password reset.
- Enable Row Level Security on every table and revoke `EXECUTE` on the SQL functions from the `anon` and `authenticated` roles, so the API is the only caller. Use a least-privilege database role in place of the service-role key where possible.

**Auditability**
- An append-only audit log of who viewed or changed session data, soft-deleted cancellations, and alerts on unusual access patterns.

**Reliability**
- Run the reminder worker as its own service with health checks, retries, alerting on lag, and real delivery channels. Add structured logging and tracing, automated backups with point-in-time recovery, and a tested restore.
- Add CI with dependency scanning, security headers, strict CORS, request size limits, and a penetration test before launch.

**Clinical safety**
- A missed or cancelled session can mean someone doesn't get support when they need it. A professional's short-notice cancellation should prompt immediate rebooking help, and there should be an escalation path (a crisis line and a human follow-up) for members flagged as higher risk. Wording throughout should stay calm and plain.