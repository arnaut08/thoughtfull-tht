import "dotenv/config";
import express from "express";
// Loads the Supabase client and checks its env vars at startup.
import "./db.js";

const app = express();
const port = process.env.PORT ?? 3001;

app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
