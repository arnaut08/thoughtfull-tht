import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireMember } from "../middleware/requireRole.js";
import { isBeyondNotice, noticeClosedMessage } from "../lib/cancellation.js";
import { bookingInterval, toZonedInterval } from "../lib/slots.js";
import { isUuid, parseIsoDateTime } from "../lib/validation.js";
import { getBookingForMember } from "../services/bookings.js";
import { bookSession, listProfessionals, rescheduleSession } from "../services/professionals.js";
import { findSlotAt, loadOpenSlots } from "../services/openSlots.js";
import { findUserById, toProfessionalSummary } from "../services/users.js";

async function findProfessional(id) {
  if (!isUuid(id)) return null;
  const professional = await findUserById(id);
  return professional?.role === "professional" ? professional : null;
}

// Returns the member's booking with this professional if it exists, else null.
async function findMemberBookingWithProfessional(bookingId, member, professional) {
  if (!isUuid(bookingId)) return null;
  const booking = await getBookingForMember(bookingId, member.id);
  return booking?.professional_id === professional.id ? booking : null;
}

// The booking as the member sees it: the professional, plus the slot in the member's timezone.
function toMemberBooking(professional, slot, timezone) {
  return { professional: toProfessionalSummary(professional), ...toZonedInterval(slot, timezone) };
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
    const interval = bookingInterval(booking);
    if (!isBeyondNotice(interval.start, now)) {
      return response.status(409).json({ error: noticeClosedMessage("rescheduled") });
    }
    reschedule = { id: booking.id, ...toZonedInterval(interval, member.timezone) };
  }

  const slots = await loadOpenSlots(professional, member, now, reschedule?.id);

  response.json({
    professional: toProfessionalSummary(professional),
    min_booking_notice_hours: professional.min_booking_notice_hours,
    timezone: member.timezone,
    reschedule,
    slots: slots.map((slot) => toZonedInterval(slot, member.timezone)),
  });
});

// Books one of the open slots returned by GET. The start must match an open slot exactly, so
// members can't book arbitrary times. Concurrent bookings are serialized by book_session.
professionalsRouter.post("/:id/bookings", requireMember, async (request, response) => {
  const startsAt = parseIsoDateTime(request.body?.starts_at);
  if (!startsAt) {
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

  const slot = findSlotAt(await loadOpenSlots(professional, member, DateTime.utc()), startsAt);
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

  response.status(201).json({ booking: toMemberBooking(professional, slot, member.timezone) });
});

// Moves one of the member's sessions with this professional to an open slot. Uses the same slot rules as
// booking, and the session being moved must also start more than 24 hours from now.
professionalsRouter.post(
  "/:id/bookings/:bookingId/reschedule",
  requireMember,
  async (request, response) => {
    const startsAt = parseIsoDateTime(request.body?.starts_at);
    if (!startsAt) {
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
    if (!isBeyondNotice(DateTime.fromISO(booking.starts_at), now)) {
      return response.status(409).json({ error: noticeClosedMessage("rescheduled") });
    }

    const slot = findSlotAt(await loadOpenSlots(professional, member, now, booking.id), startsAt);
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

    response.json({ booking: toMemberBooking(professional, slot, member.timezone) });
  },
);
