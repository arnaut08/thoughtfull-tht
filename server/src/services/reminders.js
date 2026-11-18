import { supabase } from "../db.js";

export const REMINDER_INTERVAL_MS = 30_000;

// Delivers every reminder that is due. Returns how many were delivered. Safe to call from several processes at once.
export async function deliverDueReminders() {
  const { data, error } = await supabase.rpc("deliver_due_reminders");
  if (error) throw error;
  return data;
}

// Runs deliverDueReminders now and then every REMINDER_INTERVAL_MS. Reminders are stored in the database, so a
// restart picks up any that came due while the server was down. Returns a function that stops the worker.
export function startReminderWorker({ intervalMs = REMINDER_INTERVAL_MS, onError = console.error } = {}) {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await deliverDueReminders();
    } catch (error) {
      onError("Failed to deliver session reminders", error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  tick();
  return () => clearInterval(timer);
}
