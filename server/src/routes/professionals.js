import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireMember } from "../middleware/requireMember.js";
import { toApiRule } from "../lib/availability.js";
import { isBeyondNotice, noticeClosedMessage } from "../lib/cancellation.js";
import { SLOT_HORIZON_DAYS, generateOpenSlots } from "../lib/slots.js";
import { getBookingForMember } from "../services/bookings.js";
import { getBlockedDatesForProfessional, getRulesForProfessional } from "../services/availability.js";
import {
  bookSession,
  getMemberBookingsOverlapping,
  getProfessionalBookingsOverlapping,
  listProfessionals,
  rescheduleSession,
} from "../services/professionals.js";
import { findUserById } from "../services/users.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toProfessionalSummary(row) {
  return { id: row.id, name: row.name, timezone: row.timezone };
}

async function findProfessional(id) {
  if (!UUID_PATTERN.test(id)) return null;
  const professional = await findUserById(id);
  return professional?.role === "professional" ? professional : null;
}

// Returns the member's booking with this professional if it exists, else null.
async function findMemberBookingWithProfessional(bookingId, member, professional) {
  if (!UUID_PATTERN.test(bookingId)) return null;
  const booking = await getBookingForMember(bookingId, member.id);
  return booking?.professional_id === professional.id ? booking : null;
}

// Open sessions over the next SLOT_HORIZON_DAYS, as DateTimes in the professional's zone.
// Sessions that overlap the member's bookings with any professional are excluded too, unless checkMember is false.
// excludeBookingId is the session being rescheduled, so it doesn't block its own time.
export async function loadOpenSlots(professional, member, now, excludeBookingId, { checkMember = true } = {}) {
  const horizonEnd = now.plus({ days: SLOT_HORIZON_DAYS });
  const [rows, blockedDates, professionalBookings, memberBookings] = await Promise.all([
    getRulesForProfessional(professional.id),
    getBlockedDatesForProfessional(professional.id),
    getProfessionalBookingsOverlapping(professional.id, now, horizonEnd),
    checkMember ? getMemberBookingsOverlapping(member.id, now, horizonEnd) : [],
  ]);

  return generateOpenSlots({
    rules: rows.map(toApiRule),
    blockedDates,
    timezone: professional.timezone,
    now,
    horizonEnd,
    minNoticeHours: professional.min_booking_notice_hours,
    booked: [...professionalBookings, ...memberBookings]
      .filter((booking) => !excludeBookingId || booking.id !== excludeBookingId)
      .map((booking) => ({
        start: DateTime.fromISO(booking.starts_at),
        end: DateTime.fromISO(booking.ends_at),
      })),
  });
}

export const professionalsRouter = Router();

professionalsRouter.use(requireAuth);

professionalsRouter.get("/", async (_request, response) => {
  const rows = await listProfessionals();
  response.json({ professionals: rows.map(toProfessionalSummary) });
});

// Open slots are returned as ISO timestamps in the requesting member's timezone.
// With ?reschedule=<bookingId>, the response also includes that session, and its own time is offered as open.
professionalsRouter.get("/:id", async (request, response) => {
  const member = await findUserById(request.user.id);
  if (!member) {
    return response.status(404).json({ error: "User not found" });
  }
  const professional = await findProfessional(request.params.id);
  if (!professional) {
    return response.status(404).json({ error: "Professional not found" });
  }

  const now = DateTime.utc();
  const rescheduleId = request.query.reschedule;
  let reschedule = null;
  if (rescheduleId !== undefined) {
    const booking = await findMemberBookingWithProfessional(rescheduleId, member, professional);
    if (!booking) {
      return response.status(404).json({ error: "Session not found" });
    }
    const start = DateTime.fromISO(booking.starts_at);
    if (!isBeyondNotice(start, now)) {
      return response.status(409).json({ error: noticeClosedMessage("rescheduled") });
    }
    reschedule = {
      id: booking.id,
      start: start.setZone(member.timezone).toISO(),
      end: DateTime.fromISO(booking.ends_at).setZone(member.timezone).toISO(),
    };
  }

  const slots = await loadOpenSlots(professional, member, now, reschedule?.id);

  response.json({
    professional: toProfessionalSummary(professional),
    min_booking_notice_hours: professional.min_booking_notice_hours,
    timezone: member.timezone,
    reschedule,
    slots: slots.map(({ start, end }) => ({
      start: start.setZone(member.timezone).toISO(),
      end: end.setZone(member.timezone).toISO(),
    })),
  });
});

// Books one of the open slots returned by GET. The start must match an open slot exactly, so
// members can't book arbitrary times. Concurrent bookings are serialized by book_session.
professionalsRouter.post("/:id/bookings", requireMember, async (request, response) => {
  const startsAtInput = request.body?.starts_at;
  const startsAt = typeof startsAtInput === "string" ? DateTime.fromISO(startsAtInput) : null;
  if (!startsAt?.isValid) {
    return response.status(400).json({ error: "starts_at must be an ISO timestamp" });
  }

  const [member, professional] = await Promise.all([
    findUserById(request.user.id),
    findProfessional(request.params.id),
  ]);
  if (!member) {
    return response.status(404).json({ error: "User not found" });
  }
  if (!professional) {
    return response.status(404).json({ error: "Professional not found" });
  }

  const slots = await loadOpenSlots(professional, member, DateTime.utc());
  const slot = slots.find((candidate) => candidate.start.toMillis() === startsAt.toMillis());
  if (!slot) {
    return response.status(409).json({ error: "That session is no longer available" });
  }

  try {
    await bookSession({
      professionalId: professional.id,
      memberId: member.id,
      startsAt: slot.start.toUTC().toISO(),
      endsAt: slot.end.toUTC().toISO(),
    });
  } catch (error) {
    if (error.message === "member_conflict") {
      return response.status(409).json({ error: "You already have a session booked at this time" });
    }
    if (error.message === "slot_unavailable" || error.message === "slot_in_past") {
      return response.status(409).json({ error: "That session is no longer available" });
    }
    throw error;
  }

  response.status(201).json({
    booking: {
      professional: toProfessionalSummary(professional),
      start: slot.start.setZone(member.timezone).toISO(),
      end: slot.end.setZone(member.timezone).toISO(),
    },
  });
});

// Moves one of the member's sessions with this professional to an open slot. Uses the same slot rules as
// booking, and the session being moved must also start more than 24 hours from now.
professionalsRouter.post(
  "/:id/bookings/:bookingId/reschedule",
  requireMember,
  async (request, response) => {
    const startsAtInput = request.body?.starts_at;
    const startsAt = typeof startsAtInput === "string" ? DateTime.fromISO(startsAtInput) : null;
    if (!startsAt?.isValid) {
      return response.status(400).json({ error: "starts_at must be an ISO timestamp" });
    }

    const [member, professional] = await Promise.all([
      findUserById(request.user.id),
      findProfessional(request.params.id),
    ]);
    if (!member) {
      return response.status(404).json({ error: "User not found" });
    }
    if (!professional) {
      return response.status(404).json({ error: "Professional not found" });
    }

    const now = DateTime.utc();
    const booking = await findMemberBookingWithProfessional(request.params.bookingId, member, professional);
    if (!booking) {
      return response.status(404).json({ error: "Session not found" });
    }
    const previousStart = DateTime.fromISO(booking.starts_at);
    if (!isBeyondNotice(previousStart, now)) {
      return response.status(409).json({ error: noticeClosedMessage("rescheduled") });
    }

    const slots = await loadOpenSlots(professional, member, now, booking.id);
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
      });
    } catch (error) {
      if (error.message === "booking_not_found") {
        return response.status(404).json({ error: "Session not found" });
      }
      if (error.message === "cancellation_closed") {
        return response.status(409).json({ error: noticeClosedMessage("rescheduled") });
      }
      if (error.message === "member_conflict") {
        return response.status(409).json({ error: "You already have a session booked at this time" });
      }
      if (error.message === "slot_unavailable" || error.message === "slot_in_past") {
        return response.status(409).json({ error: "That session is no longer available" });
      }
      throw error;
    }

    response.json({
      booking: {
        professional: toProfessionalSummary(professional),
        start: slot.start.setZone(member.timezone).toISO(),
        end: slot.end.setZone(member.timezone).toISO(),
      },
    });
  },
);
