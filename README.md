# ThoughtFull Session Booking

A session-booking flow for a mental health platform. A member finds a professional, sees their free slots for the next four weeks in the member's own timezone, and books a 50-minute session. Both people get in-app reminders 24 hours and 1 hour before it starts.

**Stack:** React (Vite) + MUI + FullCalendar · Node.js + Express · Supabase (Postgres) · Luxon for timezone maths.

## Features

- Sign up and log in as a **member** or a **professional**. Each user picks an IANA timezone at sign-up, and every request is authenticated from a JWT.
- Professionals set **weekly working hours** in their own timezone.
- Members browse professionals and book from a **calendar of free slots** shown in the member's timezone.
- **No double-booking**, even when two members book the same slot at the same moment. A member can't hold overlapping sessions with different professionals, and past slots can't be booked.
- **My sessions**: upcoming and past for members, a schedule for professionals (with the member's name).
- **Cancel and reschedule**: members up to 24 hours before the start, professionals at any time. Rescheduling is a single atomic move.
- **Reminders** at 24 hours and 1 hour before, for both people, delivered as in-app notifications exactly once, including across restarts.
- Optional extras: **blocked dates**, a **minimum booking notice**, and `docker compose up`.

## Architecture

```
 Browser (React + MUI + FullCalendar)
        │  JSON over HTTP, Bearer JWT
        ▼
 Express API ── auth · validation · slot generation (Luxon)
        │        └── reminder worker (runs every 30 s)
        │  supabase-js, service-role key (server only)
        ▼
 Supabase Postgres ── tables + SQL functions that hold the transactions:
                      book_session · reschedule_session · cancel_session ·
                      replace_availability_rules · deliver_due_reminders
```

Anything that must be atomic (booking, rescheduling, cancelling, replacing a week of availability, delivering a reminder) runs inside a Postgres function called with `.rpc()`, because `supabase-js` can't run multi-statement transactions. Everything else lives in the Express layer. The reasoning behind these choices is in [DECISIONS.md](DECISIONS.md).

## Prerequisites

- Node.js 20.19+ or 22.12+, and npm
- A [Supabase](https://supabase.com) project (the free tier is enough)
- Docker, only if you want to use `docker compose`

## Setup

### 1. Create the database

In the Supabase dashboard, open the **SQL editor** and run every file in `server/migrations/` **in numeric order** (`0001` to `0011`).

To paste everything in one go on macOS or Linux:

```sh
cat server/migrations/*.sql > all-migrations.sql
```

Run this once on a fresh project, and don't commit the combined file.

### 2. Configure

```sh
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Fill in `server/.env`:

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Project URL, from Project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Bypasses Row Level Security. Keep it on the server and never expose it to the client |
| `JWT_SECRET` | yes | A long random string |
| `JWT_EXPIRES_IN` | no | Token lifetime, default `1h` |
| `PORT` | no | API port, default `3001` locally |
| `CLIENT_ORIGIN` | no | Allowed CORS origin, default `http://localhost:5173` |

`client/.env` only needs `VITE_API_URL` (default `http://localhost:3001/api`). The server won't start if `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` or `JWT_SECRET` is missing.

### 3. Run

**Option A: Docker (one command)**

Put the server variables from the table above in a `.env` file at the repo root, then:

```sh
docker compose up --build
```

The app is served at <http://localhost> (nginx proxies `/api` to the server container). The database is still your hosted Supabase project, so Docker runs the app only.

**Option B: local development**

```sh
# terminal 1
cd server && npm install && npm run dev

# terminal 2
cd client && npm install && npm run dev
```

The client runs at <http://localhost:5173> and the API at <http://localhost:3001>. Check the API with `GET /api/health`.

## Tests

```sh
cd server && npm test
```

The default run covers slot generation (layout, timezones, DST), the 24-hour rule, booking and overlap rules, and reminder scheduling.

A few tests need a real Postgres (reminder delivery idempotency and restart survival; 4 at last count) and are **skipped unless `REMINDERS_TEST_DATABASE_URL` is set**. They drop and recreate the `public` schema, so point them at a throwaway database (for example a local Postgres container), never at your Supabase project.

## Trying it out

Use fictional data only.

1. Sign up as a **professional** (for example in `Asia/Kolkata`) and set weekly hours on the availability page.
2. In a private window, sign up as a **member** in a different timezone (for example `America/New_York`).
3. Open the professional's profile, pick a slot and confirm. The booked slot disappears from the calendar.
4. Check **My sessions** and the notification bell on both accounts. Reminders appear at 24 hours and 1 hour before the start, and any that are already past at booking time are skipped.
5. Try to cancel or reschedule a session that starts within 24 hours. The member is blocked with a message, while the professional can still do it.

## API reference

All routes except register and login need `Authorization: Bearer <token>`. Timestamps are ISO strings in the caller's timezone, and conflicts return `409`.

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | none | `email`, `password` (min 8), `name`, `role` (`member` or `professional`), `timezone`. Returns `{ token, user }` |
| POST | `/api/auth/login` | none | `email`, `password`. Returns `{ token, user }` |
| GET | `/api/auth/me` | any | The current user |
| GET | `/api/availability` | professional | `{ timezone, rules, ... }`, including the booking notice |
| PUT | `/api/availability` | professional | Replaces the whole week: `{ rules: [{ day_of_week, start_time, end_time }] }` |
| PUT | `/api/availability/booking-notice` | professional | Minimum hours of notice before a session (0 to 168) |
| POST | `/api/availability/blocked-dates` | professional | Blocks a calendar date (idempotent) |
| DELETE | `/api/availability/blocked-dates/:date` | professional | Unblocks a date |
| GET | `/api/availability/reschedule-suggestions?date=` | professional | Suggested new times for sessions on a date about to be blocked |
| GET | `/api/professionals` | any | `{ professionals: [{ id, name, timezone }] }` |
| GET | `/api/professionals/:id` | any | `{ professional, timezone, slots }`. Free slots only for the next 4 weeks, never who booked what |
| POST | `/api/professionals/:id/bookings` | member | `{ starts_at }`, the `start` of an open slot. `201` on success, `409` if the slot is taken, not open, or overlaps the member's other sessions |
| GET | `/api/bookings` | member | `{ timezone, upcoming, past }`, each with a `cancellable` flag |
| DELETE | `/api/bookings/:id` | member | Cancels a session. `409` within 24 hours of the start |
| POST | `/api/professionals/:id/bookings/:bookingId/reschedule` | member | Moves a session to another open slot. Same 24-hour rule |
| GET | `/api/professional-bookings` | professional | Own schedule for the next 4 weeks, with the member's name on booked sessions |
| DELETE | `/api/professional-bookings/:id` | professional | Cancels a session at any time |
| POST | `/api/professional-bookings/:id/reschedule` | professional | Moves a session at any time |
| GET | `/api/notifications` | any | The 50 newest notifications and the unread count |
| POST | `/api/notifications/read` | any | Marks all notifications as read |
| GET | `/api/health` | none | `{ "status": "ok" }` |

**Availability rules:** `day_of_week` is `0` (Sunday) to `6` (Saturday). Times are `HH:mm` in the professional's local time, and `end_time` may be `24:00`. A window must be at least 50 minutes. Overnight windows are rejected (split them across two days), and overlapping or adjacent windows on the same day are merged.

## Project layout

```
client/                    React app
server/
  migrations/              SQL, run in order
  src/lib/slots.js         slot generation (timezones, DST)
  src/services/reminders.js  reminder worker
```

## Further reading

- [DECISIONS.md](DECISIONS.md): design decisions, trade-offs, limitations, and what would change for production
- [AI_USAGE.md](AI_USAGE.md): how AI tools were used