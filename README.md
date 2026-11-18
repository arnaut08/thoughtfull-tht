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
the Supabase SQL editor.

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

Run the server tests from `server/` with `npm test`.
The server loads `server/.env` when starting; set `PORT` there (or in the
process environment) to override its default port. Vite loads `client/.env`
automatically, and `VITE_API_URL` sets the API base URL used by the client
(default in `client/.env.example`: `http://localhost:3001/api`). The server's
`CLIENT_ORIGIN` must match the client's origin for CORS.
