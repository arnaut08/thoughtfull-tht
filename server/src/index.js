import "dotenv/config";
// Loads the Supabase client and checks its env vars at startup.
import "./db.js";
import { createApp } from "./app.js";
import { startReminderWorker } from "./services/reminders.js";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in server/.env");
}

const app = createApp();
const port = process.env.PORT ?? 3001;

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://localhost:${port}`);
  startReminderWorker();
});
