import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireProfessional } from "../middleware/requireProfessional.js";
import { normalizeRules, toApiRule } from "../lib/availability.js";
import { SLOT_HORIZON_DAYS, generateOpenSlots } from "../lib/slots.js";
import {
  addBlockedDate,
  getBlockedDatesForProfessional,
  getRulesForProfessional,
  removeBlockedDate,
  replaceRulesForProfessional,
} from "../services/availability.js";
import {
  cancelSession,
  getMemberBookingsOverlapping,
  getProfessionalBookingsOverlapping,
} from "../services/professionals.js";
import { findUserById, findUsersByIds } from "../services/users.js";

export const availabilityRouter = Router();

availabilityRouter.use(requireAuth, requireProfessional);

const RESOLUTIONS = new Set(["keep", "cancel"]);

// Returns a YYYY-MM-DD string for a real calendar date, or null.
function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = DateTime.fromISO(value);
  return date.isValid && date.toISODate() === value ? value : null;
}

// Returns the professional's sessions that start on the given local date, in their timezone, soonest first.
async function getSessionsOnDate(professional, date) {
  const dayStart = DateTime.fromISO(date, { zone: professional.timezone }).toUTC();
  const bookings = await getProfessionalBookingsOverlapping(
    professional.id,
    dayStart,
    dayStart.plus({ days: 1 }),
  );
  const onDate = bookings
    .map((booking) => ({ ...booking, start: DateTime.fromISO(booking.starts_at).setZone(professional.timezone) }))
    .filter((booking) => booking.start.toISODate() === date)
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());
  const members = new Map(
    (await findUsersByIds(onDate.map((booking) => booking.member_id))).map((member) => [member.id, member]),
  );

  return onDate.map((booking) => ({
    id: booking.id,
    member_id: booking.member_id,
    start: booking.start.toISO(),
    end: DateTime.fromISO(booking.ends_at).setZone(professional.timezone).toISO(),
    member: { id: booking.member_id, name: members.get(booking.member_id)?.name ?? null },
  }));
}

availabilityRouter.get("/", async (request, response) => {
  const [user, rows, blockedDates] = await Promise.all([
    findUserById(request.user.id),
    getRulesForProfessional(request.user.id),
    getBlockedDatesForProfessional(request.user.id),
  ]);
  if (!user) {
    return response.status(404).json({ error: "User not found" });
  }
  response.json({
    timezone: user.timezone,
    rules: rows.map(toApiRule),
    blocked_dates: blockedDates,
  });
});

// Blocks a whole day. If the day already has sessions, nothing is blocked unless the professional chooses:
// "keep" leaves the sessions in place, and "cancel" cancels them (notifying members) before blocking.
// Rescheduling is done by the client through the reschedule endpoint, then this is called again without a resolution.
availabilityRouter.post("/blocked-dates", async (request, response) => {
  const date = parseDate(request.body?.date);
  if (!date) {
    return response.status(400).json({ error: "date must be a YYYY-MM-DD calendar date" });
  }

  const resolution = request.body?.resolution;
  if (resolution !== undefined && !RESOLUTIONS.has(resolution)) {
    return response.status(400).json({ error: "resolution must be \"keep\" or \"cancel\"" });
  }

  const professional = await findUserById(request.user.id);
  if (!professional) {
    return response.status(404).json({ error: "User not found" });
  }

  const sessions = await getSessionsOnDate(professional, date);
  if (sessions.length > 0 && resolution === undefined) {
    return response.status(409).json({
      error: "This date has booked sessions",
      details: { sessions: sessions.map(({ member_id, ...session }) => session) },
    });
  }

  if (resolution === "cancel") {
    for (const session of sessions) {
      await cancelSession({
        bookingId: session.id,
        professionalId: professional.id,
        memberId: session.member_id,
        byProfessional: true,
        noticeCutoff: null,
      });
    }
  }

  await addBlockedDate(request.user.id, date);
  response.status(201).json({ blocked_dates: await getBlockedDatesForProfessional(request.user.id) });
});

availabilityRouter.delete("/blocked-dates/:date", async (request, response) => {
  const date = parseDate(request.params.date);
  if (!date) {
    return response.status(400).json({ error: "date must be a YYYY-MM-DD calendar date" });
  }

  await removeBlockedDate(request.user.id, date);
  response.json({ blocked_dates: await getBlockedDatesForProfessional(request.user.id) });
});

availabilityRouter.get("/reschedule-suggestions", async (request, response) => {
  const date = parseDate(request.query.date);
  if (!date) {
    return response.status(400).json({ error: "date must be a YYYY-MM-DD calendar date" });
  }

  const professional = await findUserById(request.user.id);
  if (!professional) {
    return response.status(404).json({ error: "User not found" });
  }

  const sessions = await getSessionsOnDate(professional, date);
  if (sessions.length === 0) {
    return response.json({ sessions: [] });
  }

  const now = DateTime.utc();
  const horizonEnd = now.plus({ days: SLOT_HORIZON_DAYS });
  const zone = professional.timezone;
  const memberIds = [...new Set(sessions.map((session) => session.member_id))];
  const [rules, blockedDates, bookings, memberRows] = await Promise.all([
    getRulesForProfessional(professional.id),
    getBlockedDatesForProfessional(professional.id),
    getProfessionalBookingsOverlapping(professional.id, now, horizonEnd),
    Promise.all(memberIds.map((memberId) => getMemberBookingsOverlapping(memberId, now, horizonEnd))),
  ]);
  const memberBookingsById = new Map(memberIds.map((id, index) => [id, memberRows[index]]));

  // The blocked day is excluded from candidates, so suggestions only land on other days.
  const candidates = generateOpenSlots({
    rules: rules.map(toApiRule),
    blockedDates: [...blockedDates, date],
    timezone: zone,
    now,
    horizonEnd,
    booked: bookings.map((booking) => ({
      start: DateTime.fromISO(booking.starts_at),
      end: DateTime.fromISO(booking.ends_at),
    })),
  })
    .filter((slot) => slot.start.setZone(zone).toISODate() > date)
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());

  const localTime = (instant) => instant.setZone(zone).toFormat("HH:mm");
  const taken = new Set();
  const suggestions = sessions.map((session) => {
    const memberSessions = memberBookingsById.get(session.member_id);
    const free = candidates.filter(
      (slot) =>
        !taken.has(slot.start.toMillis()) &&
        !memberSessions.some(
          (booking) =>
            slot.start.toMillis() < DateTime.fromISO(booking.ends_at).toMillis() &&
            slot.end.toMillis() > DateTime.fromISO(booking.starts_at).toMillis(),
        ),
    );
    const sameTime = localTime(DateTime.fromISO(session.start));
    const pick = free.find((slot) => localTime(slot.start) === sameTime) ?? free[0] ?? null;
    if (pick) taken.add(pick.start.toMillis());

    return {
      id: session.id,
      start: session.start,
      end: session.end,
      member: session.member,
      suggested: pick
        ? { start: pick.start.setZone(zone).toISO(), end: pick.end.setZone(zone).toISO() }
        : null,
    };
  });

  response.json({ sessions: suggestions });
});

availabilityRouter.put("/", async (request, response) => {
  const { errors, rules } = normalizeRules(request.body?.rules);
  if (errors) {
    return response.status(400).json({ error: "Invalid availability", details: errors });
  }

  const saved = await replaceRulesForProfessional(request.user.id, rules);
  response.json({ rules: saved.map(toApiRule) });
});
