import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireProfessional } from "../middleware/requireRole.js";
import { normalizeRules, toApiRule } from "../lib/availability.js";
import { SLOT_HORIZON_DAYS, bookingInterval, generateOpenSlots, toZonedInterval } from "../lib/slots.js";
import { parseCalendarDate } from "../lib/validation.js";
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
import { loadProfessionalSchedule } from "../services/openSlots.js";
import { findUserById, findUsersByIds, setBookingNotice } from "../services/users.js";

export const availabilityRouter = Router();

availabilityRouter.use(requireAuth, requireProfessional);

const RESOLUTIONS = new Set(["keep", "cancel"]);
const MAX_BOOKING_NOTICE_HOURS = 168;

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
  const members = await findUsersByIds(onDate.map((booking) => booking.member_id));

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
    min_booking_notice_hours: user.min_booking_notice_hours,
    rules: rows.map(toApiRule),
    blocked_dates: blockedDates,
  });
});

// Sets how many whole hours ahead members must book. Applies to new bookings and to member reschedules.
availabilityRouter.put("/booking-notice", async (request, response) => {
  const hours = request.body?.hours;
  if (!Number.isInteger(hours) || hours < 0 || hours > MAX_BOOKING_NOTICE_HOURS) {
    return response
      .status(400)
      .json({ error: `hours must be a whole number from 0 to ${MAX_BOOKING_NOTICE_HOURS}` });
  }

  await setBookingNotice(request.user.id, hours);
  response.json({ min_booking_notice_hours: hours });
});

// Blocks a whole day. If the day already has sessions, nothing is blocked unless the professional chooses:
// "keep" leaves the sessions in place, and "cancel" cancels them (notifying members) before blocking.
// Rescheduling is done by the client through the reschedule endpoint, then this is called again without a resolution.
availabilityRouter.post("/blocked-dates", async (request, response) => {
  const date = parseCalendarDate(request.body?.date);
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
  const date = parseCalendarDate(request.params.date);
  if (!date) {
    return response.status(400).json({ error: "date must be a YYYY-MM-DD calendar date" });
  }

  await removeBlockedDate(request.user.id, date);
  response.json({ blocked_dates: await getBlockedDatesForProfessional(request.user.id) });
});

availabilityRouter.get("/reschedule-suggestions", async (request, response) => {
  const date = parseCalendarDate(request.query.date);
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
  const [schedule, memberRows] = await Promise.all([
    loadProfessionalSchedule(professional.id, now, horizonEnd),
    Promise.all(memberIds.map((memberId) => getMemberBookingsOverlapping(memberId, now, horizonEnd))),
  ]);
  const memberBookingsById = new Map(memberIds.map((id, index) => [id, memberRows[index]]));

  // The blocked day is excluded from candidates, so suggestions only land on other days.
  const candidates = generateOpenSlots({
    rules: schedule.rules,
    blockedDates: [...schedule.blockedDates, date],
    timezone: zone,
    now,
    horizonEnd,
    booked: schedule.bookings.map(bookingInterval),
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
        !memberSessions.some((booking) => {
          const interval = bookingInterval(booking);
          return slot.start < interval.end && slot.end > interval.start;
        }),
    );
    const sameTime = localTime(DateTime.fromISO(session.start));
    const pick = free.find((slot) => localTime(slot.start) === sameTime) ?? free[0] ?? null;
    if (pick) taken.add(pick.start.toMillis());

    return {
      id: session.id,
      start: session.start,
      end: session.end,
      member: session.member,
      suggested: pick ? toZonedInterval(pick, zone) : null,
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
