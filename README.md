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
<http://localhost:3001>. The Vite development server proxies `/api` requests to
the Express server, so the client can call API endpoints without configuring
CORS.

The server exposes `GET /api/health`, which returns `{ "status": "ok" }`.
The server loads `server/.env` when starting; set `PORT` there (or in the
process environment) to override its default port. Vite loads `client/.env`
automatically, and `VITE_API_URL` sets the API path used by the client. Keep it
at `/api` to use the development proxy.
