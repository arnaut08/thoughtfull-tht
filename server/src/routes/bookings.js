import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireMember } from "../middleware/requireMember.js";
import { getBookingsForMember } from "../services/bookings.js";
import { findUserById, findUsersByIds } from "../services/users.js";

export const bookingsRouter = Router();

bookingsRouter.use(requireAuth, requireMember);

// A session is upcoming until it ends, so one in progress still counts as upcoming.
// Upcoming sessions run soonest first; past sessions run most recent first.
bookingsRouter.get("/", async (request, response) => {
  const member = await findUserById(request.user.id);
  if (!member) {
    return response.status(404).json({ error: "User not found" });
  }

  const rows = await getBookingsForMember(member.id);
  const professionals = new Map(
    (await findUsersByIds(rows.map((row) => row.professional_id))).map((professional) => [
      professional.id,
      professional,
    ]),
  );

  const now = DateTime.utc();
  const sessions = rows.map((row) => ({
    professional: professionals.get(row.professional_id),
    start: DateTime.fromISO(row.starts_at),
    end: DateTime.fromISO(row.ends_at),
  }));
  const toApiSession = ({ professional, start, end }) => ({
    professional: { id: professional.id, name: professional.name, timezone: professional.timezone },
    start: start.setZone(member.timezone).toISO(),
    end: end.setZone(member.timezone).toISO(),
  });

  response.json({
    timezone: member.timezone,
    upcoming: sessions.filter((session) => session.end > now).map(toApiSession),
    past: sessions
      .filter((session) => session.end <= now)
      .reverse()
      .map(toApiSession),
  });
});
