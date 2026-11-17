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
npm run dev
```

```sh
cd client
npm install
npm run dev
```

The React app is served at <http://localhost:5173> and the Express API at
<http://localhost:3001>. The Vite development server proxies `/api` requests to
the Express server, so the client can call API endpoints without configuring
CORS.

The server exposes `GET /api/health`, which returns `{ "status": "ok" }`.
Set `PORT` in the server environment to override its default port.
