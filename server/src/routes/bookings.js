import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireMember } from "../middleware/requireMember.js";
import { requireProfessional } from "../middleware/requireProfessional.js";
import { toApiRule } from "../lib/availability.js";
import { isBeyondNotice, noticeClosedMessage, noticeCutoff } from "../lib/cancellation.js";
import { SLOT_HORIZON_DAYS, generateOpenSlots } from "../lib/slots.js";
import { getBlockedDatesForProfessional, getRulesForProfessional } from "../services/availability.js";
import {
  getBookingForMember,
  getBookingForProfessional,
  getBookingsForMember,
} from "../services/bookings.js";
import { getProfessionalBookingsOverlapping, cancelSession, rescheduleSession } from "../services/professionals.js";
import { findUserById, findUsersByIds } from "../services/users.js";
import { loadOpenSlots } from "./professionals.js";

export const bookingsRouter = Router();
export const professionalBookingsRouter = Router();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    id: row.id,
    professional: professionals.get(row.professional_id),
    start: DateTime.fromISO(row.starts_at),
    end: DateTime.fromISO(row.ends_at),
  }));
  const toApiSession = ({ id, professional, start, end }) => ({
    id,
    professional: { id: professional.id, name: professional.name, timezone: professional.timezone },
    start: start.setZone(member.timezone).toISO(),
    end: end.setZone(member.timezone).toISO(),
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
  if (!UUID_PATTERN.test(bookingId)) {
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
  const [rules, blockedDates, bookings] = await Promise.all([
    getRulesForProfessional(professional.id),
    getBlockedDatesForProfessional(professional.id),
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
    blockedDates,
    timezone: professional.timezone,
    now,
    horizonEnd,
    booked: bookings.map(toInterval),
  }).map((slot) => ({ ...slot, id: null, member: null }));
  const bookedSessions = bookings.map((booking) => ({
    ...toInterval(booking),
    id: booking.id,
    member: members.get(booking.member_id),
  }));

  const slots = [...openSlots, ...bookedSessions]
    .sort((a, b) => a.start.toMillis() - b.start.toMillis())
    .map(({ id, start, end, member }) => ({
      id,
      start: start.setZone(professional.timezone).toISO(),
      end: end.setZone(professional.timezone).toISO(),
      member: member ? { id: member.id, name: member.name } : null,
    }));

  response.json({ timezone: professional.timezone, slots });
});

// Cancels one of the professional's sessions. Unlike members, professionals have no 24-hour notice limit.
professionalBookingsRouter.delete("/:id", async (request, response) => {
  const bookingId = request.params.id;
  if (!UUID_PATTERN.test(bookingId)) {
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
  const startsAtInput = request.body?.starts_at;
  const startsAt = typeof startsAtInput === "string" ? DateTime.fromISO(startsAtInput) : null;
  if (!startsAt?.isValid) {
    return response.status(400).json({ error: "starts_at must be an ISO timestamp" });
  }

  const bookingId = request.params.id;
  if (!UUID_PATTERN.test(bookingId)) {
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

  const slots = await loadOpenSlots(professional, member, DateTime.utc(), booking.id);
  const slot = slots.find((candidate) => candidate.start.toMillis() === startsAt.toMillis());
  if (!slot) {
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
      return response.status(409).json({ error: "The member already has a session at this time" });
    }
    if (error.message === "slot_unavailable" || error.message === "slot_in_past") {
      return response.status(409).json({ error: "That session is no longer available" });
    }
    throw error;
  }

  response.json({
    booking: {
      member: { id: member.id, name: member.name },
      start: slot.start.setZone(professional.timezone).toISO(),
      end: slot.end.setZone(professional.timezone).toISO(),
    },
  });
});
