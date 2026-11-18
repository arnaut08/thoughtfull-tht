import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireMember } from "../middleware/requireMember.js";
import { requireProfessional } from "../middleware/requireProfessional.js";
import { toApiRule } from "../lib/availability.js";
import { SLOT_HORIZON_DAYS, generateOpenSlots } from "../lib/slots.js";
import { getRulesForProfessional } from "../services/availability.js";
import { getBookingsForMember } from "../services/bookings.js";
import { getProfessionalBookingsOverlapping } from "../services/professionals.js";
import { findUserById, findUsersByIds } from "../services/users.js";

export const bookingsRouter = Router();
export const professionalBookingsRouter = Router();

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

professionalBookingsRouter.use(requireAuth, requireProfessional);

// Every session over the next SLOT_HORIZON_DAYS, soonest first, in the professional's zone.
// Booked sessions carry the member; open slots have member: null.
professionalBookingsRouter.get("/", async (request, response) => {
  const professional = await findUserById(request.user.id);
  if (!professional) {
    return response.status(404).json({ error: "User not found" });
  }

  const now = DateTime.utc();
  const horizonEnd = now.plus({ days: SLOT_HORIZON_DAYS });
  const [rules, bookings] = await Promise.all([
    getRulesForProfessional(professional.id),
    getProfessionalBookingsOverlapping(professional.id, now, horizonEnd),
  ]);
  const members = new Map(
    (await findUsersByIds(bookings.map((booking) => booking.member_id))).map((member) => [
      member.id,
      member,
    ]),
  );

  const toInterval = (booking) => ({
    start: DateTime.fromISO(booking.starts_at),
    end: DateTime.fromISO(booking.ends_at),
  });
  const openSlots = generateOpenSlots({
    rules: rules.map(toApiRule),
    timezone: professional.timezone,
    now,
    horizonEnd,
    booked: bookings.map(toInterval),
  }).map((slot) => ({ ...slot, member: null }));
  const bookedSessions = bookings.map((booking) => ({
    ...toInterval(booking),
    member: members.get(booking.member_id),
  }));

  const slots = [...openSlots, ...bookedSessions]
    .sort((a, b) => a.start.toMillis() - b.start.toMillis())
    .map(({ start, end, member }) => ({
      start: start.setZone(professional.timezone).toISO(),
      end: end.setZone(professional.timezone).toISO(),
      member: member ? { id: member.id, name: member.name } : null,
    }));

  response.json({ timezone: professional.timezone, slots });
});
