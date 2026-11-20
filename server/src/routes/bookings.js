import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireMember, requireProfessional } from "../middleware/requireRole.js";
import { isBeyondNotice, noticeClosedMessage, noticeCutoff } from "../lib/cancellation.js";
import { SLOT_HORIZON_DAYS, bookingInterval, generateOpenSlots, toZonedInterval } from "../lib/slots.js";
import { isUuid, parseIsoDateTime } from "../lib/validation.js";
import { getBookingForMember, getBookingForProfessional, getBookingsForMember } from "../services/bookings.js";
import { cancelSession, rescheduleSession } from "../services/professionals.js";
import { findSlotAt, loadOpenSlots, loadProfessionalSchedule } from "../services/openSlots.js";
import { findUserById, findUsersByIds, toProfessionalSummary } from "../services/users.js";

export const bookingsRouter = Router();
export const professionalBookingsRouter = Router();

const memberConflictMessage =
  "The member already has another session that conflicts with this time, so the session can't be moved here";

bookingsRouter.use(requireAuth, requireMember);

// A session is upcoming until it ends, so one in progress still counts as upcoming.
// Upcoming sessions run soonest first; past sessions run most recent first.
bookingsRouter.get("/", async (request, response) => {
  const member = await findUserById(request.user.id);
  if (!member) {
    return response.status(404).json({ error: "User not found" });
  }

  const rows = await getBookingsForMember(member.id);
  const professionals = await findUsersByIds(rows.map((row) => row.professional_id));

  const now = DateTime.utc();
  const sessions = rows.map((row) => ({
    id: row.id,
    professional: professionals.get(row.professional_id),
    ...bookingInterval(row),
  }));
  const toApiSession = ({ id, professional, start, end }) => ({
    id,
    professional: toProfessionalSummary(professional),
    ...toZonedInterval({ start, end }, member.timezone),
    cancellable: isBeyondNotice(start, now),
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

// Cancels one of the member's sessions. Sessions starting within the cancellation notice window are refused with 409.
bookingsRouter.delete("/:id", async (request, response) => {
  const bookingId = request.params.id;
  if (!isUuid(bookingId)) {
    return response.status(404).json({ error: "Session not found" });
  }

  const booking = await getBookingForMember(bookingId, request.user.id);
  if (!booking) {
    return response.status(404).json({ error: "Session not found" });
  }

  try {
    await cancelSession({
      bookingId: booking.id,
      professionalId: booking.professional_id,
      memberId: request.user.id,
      byProfessional: false,
      noticeCutoff: noticeCutoff(DateTime.utc()).toISO(),
    });
  } catch (error) {
    if (error.message === "booking_not_found") {
      return response.status(404).json({ error: "Session not found" });
    }
    if (error.message === "cancellation_closed") {
      return response.status(409).json({ error: noticeClosedMessage("cancelled") });
    }
    throw error;
  }

  response.status(204).end();
});

professionalBookingsRouter.use(requireAuth, requireProfessional);

// Every session over the next SLOT_HORIZON_DAYS, soonest first, in the professional's zone.
// Booked sessions carry the member and their booking id; open slots have member: null and id: null.
professionalBookingsRouter.get("/", async (request, response) => {
  const professional = await findUserById(request.user.id);
  if (!professional) {
    return response.status(404).json({ error: "User not found" });
  }

  const now = DateTime.utc();
  const horizonEnd = now.plus({ days: SLOT_HORIZON_DAYS });
  const { rules, blockedDates, bookings } = await loadProfessionalSchedule(professional.id, now, horizonEnd);
  const members = await findUsersByIds(bookings.map((booking) => booking.member_id));

  const openSlots = generateOpenSlots({
    rules,
    blockedDates,
    timezone: professional.timezone,
    now,
    horizonEnd,
    booked: bookings.map(bookingInterval),
  }).map((slot) => ({ ...slot, id: null, member: null }));
  const bookedSessions = bookings.map((booking) => ({
    ...bookingInterval(booking),
    id: booking.id,
    member: members.get(booking.member_id),
  }));

  const slots = [...openSlots, ...bookedSessions]
    .sort((a, b) => a.start.toMillis() - b.start.toMillis())
    .map(({ id, start, end, member }) => ({
      id,
      ...toZonedInterval({ start, end }, professional.timezone),
      member: member ? { id: member.id, name: member.name } : null,
    }));

  response.json({ timezone: professional.timezone, slots });
});

// Cancels one of the professional's sessions. Unlike members, professionals have no 24-hour notice limit.
professionalBookingsRouter.delete("/:id", async (request, response) => {
  const bookingId = request.params.id;
  if (!isUuid(bookingId)) {
    return response.status(404).json({ error: "Session not found" });
  }

  const booking = await getBookingForProfessional(bookingId, request.user.id);
  if (!booking) {
    return response.status(404).json({ error: "Session not found" });
  }

  try {
    await cancelSession({
      bookingId: booking.id,
      professionalId: request.user.id,
      memberId: booking.member_id,
      byProfessional: true,
      noticeCutoff: null,
    });
  } catch (error) {
    if (error.message === "booking_not_found") {
      return response.status(404).json({ error: "Session not found" });
    }
    throw error;
  }

  response.status(204).end();
});

// Moves one of the professional's sessions to an open slot. The move is a single atomic update, so the member
// keeps a session throughout. The slot must be free for both the professional and the member.
professionalBookingsRouter.post("/:id/reschedule", async (request, response) => {
  const startsAt = parseIsoDateTime(request.body?.starts_at);
  if (!startsAt) {
    return response.status(400).json({ error: "starts_at must be an ISO timestamp" });
  }

  const bookingId = request.params.id;
  if (!isUuid(bookingId)) {
    return response.status(404).json({ error: "Session not found" });
  }

  const professional = await findUserById(request.user.id);
  if (!professional) {
    return response.status(404).json({ error: "User not found" });
  }
  const booking = await getBookingForProfessional(bookingId, professional.id);
  if (!booking) {
    return response.status(404).json({ error: "Session not found" });
  }
  const member = await findUserById(booking.member_id);

  const now = DateTime.utc();
  const slots = await loadOpenSlots(professional, member, now, booking.id);
  const slot = findSlotAt(slots, startsAt);
  if (!slot) {
    // Slots are hidden when the member has another session then. Check the professional's time alone to tell
    // that apart from a slot that is really taken.
    const professionalSlots = await loadOpenSlots(professional, member, now, booking.id, { checkMember: false });
    if (findSlotAt(professionalSlots, startsAt)) {
      return response.status(409).json({ error: memberConflictMessage });
    }
    return response.status(409).json({ error: "That session is no longer available" });
  }

  try {
    await rescheduleSession({
      bookingId: booking.id,
      professionalId: professional.id,
      memberId: member.id,
      startsAt: slot.start.toUTC().toISO(),
      endsAt: slot.end.toUTC().toISO(),
      byProfessional: true,
    });
  } catch (error) {
    if (error.message === "booking_not_found") {
      return response.status(404).json({ error: "Session not found" });
    }
    if (error.message === "member_conflict") {
      return response.status(409).json({ error: memberConflictMessage });
    }
    if (error.message === "slot_unavailable" || error.message === "slot_in_past") {
      return response.status(409).json({ error: "That session is no longer available" });
    }
    throw error;
  }

  response.json({
    booking: {
      member: { id: member.id, name: member.name },
      ...toZonedInterval(slot, professional.timezone),
    },
  });
});
