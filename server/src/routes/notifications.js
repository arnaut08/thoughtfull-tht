import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { markAllNotificationsRead, listNotificationsForUser } from "../services/notifications.js";
import { findUsersByIds } from "../services/users.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

// Notifications for the signed-in user, newest first. Members and professionals both receive them.
notificationsRouter.get("/", async (request, response) => {
  const { notifications, unreadCount } = await listNotificationsForUser(request.user.id);
  const actors = new Map(
    (await findUsersByIds(notifications.map((row) => row.actor_id))).map((actor) => [actor.id, actor]),
  );

  response.json({
    unreadCount,
    notifications: notifications.map((row) => ({
      id: row.id,
      type: row.type,
      actor: actors.has(row.actor_id) ? { id: row.actor_id, name: actors.get(row.actor_id).name } : null,
      sessionStart: row.session_starts_at,
      newStart: row.new_starts_at,
      read: row.read_at !== null,
      createdAt: row.created_at,
    })),
  });
});

notificationsRouter.post("/read", async (request, response) => {
  await markAllNotificationsRead(request.user.id);
  response.status(204).end();
});
