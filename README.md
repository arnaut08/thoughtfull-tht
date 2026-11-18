# thoughtfull-tht

A starter project with a React client and an Express server.

## Requirements

- Node.js 20.19+ or 22.12+ (required by the Vite client)
- npm

## Getting started

Open two terminals from the project root:

```sh
cd server
npm install
cp .env.example .env
npm run dev
```

```sh
cd client
npm install
cp .env.example .env
npm run dev
```

The React app is served at <http://localhost:5173> and the Express API at
<http://localhost:3001>. The client calls the API directly at the URL in
`VITE_API_URL`, and the server allows that browser origin via `CLIENT_ORIGIN`
(default `http://localhost:5173`).

The server exposes `GET /api/health`, which returns `{ "status": "ok" }`.

### Supabase

The server uses `@supabase/supabase-js` through `server/src/db.js`. Set these in
`server/.env`, using values from the Supabase dashboard under Project Settings >
API:

- `SUPABASE_URL`: the project URL (`https://<project-ref>.supabase.co`).
- `SUPABASE_SERVICE_ROLE_KEY`: the service role key. It bypasses Row Level
  Security, so keep it on the server only and never expose it to the client.

The server won't start if either value is missing.

Create the users table by running `server/migrations/0001_create_users.sql` in
the Supabase SQL editor, then run `server/migrations/0002_create_availability_rules.sql`
to create the availability table and its replace function, and
`server/migrations/0003_create_bookings.sql` for the bookings table.

### Authentication

Set `JWT_SECRET` in `server/.env` (a long random string). `JWT_EXPIRES_IN` sets
the token lifetime and defaults to `1h`. The server won't start without
`JWT_SECRET`.

| Method | Path                    | Auth   | Description                                 |
| ------ | ----------------------- | ------ | ------------------------------------------- |
| POST   | `/api/auth/register`    | none   | Body: `email`, `password` (min 8), `name`, `role` (`member` or `professional`), `timezone` (IANA, e.g. `Asia/Kolkata`). Returns `{ token, user }`. |
| POST   | `/api/auth/login`       | none   | Body: `email`, `password`. Returns `{ token, user }`. |
| GET    | `/api/auth/me`          | Bearer | Returns the current `{ user }`. |

Send the token as `Authorization: Bearer <token>`. Timestamps are converted to
the user's registered timezone with Luxon.

### Availability

Professionals set a recurring weekly schedule. All routes require a bearer token
for a `professional` account (`member` gets 403).

| Method | Path                 | Auth   | Description |
| ------ | -------------------- | ------ | ----------- |
| GET    | `/api/availability`  | Bearer | Returns `{ timezone, rules }`. `timezone` is the professional's profile zone. |
| PUT    | `/api/availability`  | Bearer | Body: `{ rules: [{ day_of_week, start_time, end_time }] }`. Replaces the whole week. Returns `{ rules }`. |

- `day_of_week`: `0` (Sunday) to `6` (Saturday).
- `start_time` / `end_time`: `HH:mm` in the professional's local time. `end_time` may be `24:00`
  for a window that runs to midnight.
- Windows must be at least 50 minutes. Overnight windows (end before start) are
  rejected; split them into two days.
- Overlapping and adjacent windows on the same day are merged.
- Times are stored and returned as local time with no conversion. Changing the
  profile timezone keeps local hours. See `DECISIONS.md`.

### Booking slots

Members browse professionals and see their open sessions. Any signed-in user can call these routes.

| Method | Path                      | Auth   | Description |
| ------ | ------------------------- | ------ | ----------- |
| GET    | `/api/professionals`      | Bearer | Returns `{ professionals: [{ id, name, timezone }] }`. |
| GET    | `/api/professionals/:id`  | Bearer | Returns `{ professional, timezone, slots }`. `timezone` is the caller's profile zone. `slots` is a list of `{ start, end }` ISO timestamps in that zone, covering the next 4 weeks. Booked sessions are excluded. 404 if `:id` is not a professional. |

- Each slot is a 50-minute session. Sessions run back to back from the start of each
  availability window and must fit entirely inside it.
- Windows are generated in the professional's timezone, so DST changes are handled.
  See `DECISIONS.md`.

| Method | Path                           | Auth   | Description |
| ------ | ------------------------------ | ------ | ----------- |
| POST   | `/api/professionals/:id/bookings` | Bearer (`member`) | Body: `{ starts_at }`, the ISO `start` of an open slot. Returns 201 with `{ booking: { professional, start, end } }` in the member's zone. 409 if the time isn't an open slot, was just taken, or overlaps another session the member has booked with any professional. 403 for professionals. 400 if `starts_at` isn't an ISO timestamp. |

- Members pick a slot on the calendar, then confirm it. The start must match a
  currently open slot exactly, so arbitrary times are rejected.
- Open slots exclude sessions that have already started, and `book_session` rejects a `starts_at` in the past (`slot_in_past`).
- Bookings are written by the `book_session` SQL function (`server/migrations/0005_member_no_overlapping_bookings.sql`,
  which replaces the version in `0004`). It locks the professional's row so two members can't take the same
  session, and the member's row so one member can't take overlapping sessions with two professionals at once.

### Member sessions

| Method | Path            | Auth   | Description |
| ------ | --------------- | ------ | ----------- |
| GET    | `/api/bookings` | Bearer (`member`) | Returns `{ timezone, upcoming, past }`. Each entry is `{ professional: { id, name, timezone }, start, end }` with ISO timestamps in the member's zone. 403 for professionals. |

- A session is upcoming until it ends, so one in progress is listed as upcoming. `upcoming` is sorted soonest first, and `past` is sorted most recent first.
- The profile page shows these lists under the member's profile card.

### Professional sessions

| Method | Path                        | Auth   | Description |
| ------ | --------------------------- | ------ | ----------- |
| GET    | `/api/professional-bookings` | Bearer (`professional`) | Returns `{ timezone, slots }` covering the next 4 weeks, soonest first. Each entry is `{ start, end, member }` with ISO timestamps in the professional's zone. `member` is `{ id, name }` for a booked session and `null` for an open slot. 403 for members. |

- The professional dashboard shows these in a week calendar (FullCalendar). Open slots are greyed out.


Run the server tests from `server/` with `npm test`.
The server loads `server/.env` when starting; set `PORT` there (or in the
process environment) to override its default port. Vite loads `client/.env`
automatically, and `VITE_API_URL` sets the API base URL used by the client
(default in `client/.env.example`: `http://localhost:3001/api`). The server's
`CLIENT_ORIGIN` must match the client's origin for CORS.
