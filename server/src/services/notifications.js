import { supabase } from "../db.js";

const NOTIFICATION_PAGE_SIZE = 50;

// Returns the user's most recent notifications, newest first, and the total unread count.
export async function listNotificationsForUser(userId) {
  const [listed, unread] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, actor_id, session_starts_at, new_starts_at, read_at, created_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(NOTIFICATION_PAGE_SIZE),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null),
  ]);

  if (listed.error) throw listed.error;
  if (unread.error) throw unread.error;
  return { notifications: listed.data, unreadCount: unread.count ?? 0 };
}

// Marks every unread notification for the user as read.
export async function markAllNotificationsRead(userId) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) throw error;
}
