import { toApiRule } from "../lib/availability.js";
import { SLOT_HORIZON_DAYS, generateOpenSlots, bookingInterval } from "../lib/slots.js";
import { getBlockedDatesForProfessional, getRulesForProfessional } from "./availability.js";
import { getMemberBookingsOverlapping, getProfessionalBookingsOverlapping } from "./professionals.js";

// Loads a professional's weekly rules (API shape), blocked dates, and bookings overlapping [from, to).
export async function loadProfessionalSchedule(professionalId, from, to) {
  const [rules, blockedDates, bookings] = await Promise.all([
    getRulesForProfessional(professionalId),
    getBlockedDatesForProfessional(professionalId),
    getProfessionalBookingsOverlapping(professionalId, from, to),
  ]);
  return { rules: rules.map(toApiRule), blockedDates, bookings };
}

// Open sessions over the next SLOT_HORIZON_DAYS, as DateTimes in the professional's zone.
// Sessions that overlap the member's bookings with any professional are excluded too, unless checkMember is false.
// excludeBookingId is the session being rescheduled, so it doesn't block its own time.
export async function loadOpenSlots(professional, member, now, excludeBookingId, { checkMember = true } = {}) {
  const horizonEnd = now.plus({ days: SLOT_HORIZON_DAYS });
  const [schedule, memberBookings] = await Promise.all([
    loadProfessionalSchedule(professional.id, now, horizonEnd),
    checkMember ? getMemberBookingsOverlapping(member.id, now, horizonEnd) : [],
  ]);

  return generateOpenSlots({
    rules: schedule.rules,
    blockedDates: schedule.blockedDates,
    timezone: professional.timezone,
    now,
    horizonEnd,
    minNoticeHours: professional.min_booking_notice_hours,
    booked: [...schedule.bookings, ...memberBookings]
      .filter((booking) => !excludeBookingId || booking.id !== excludeBookingId)
      .map(bookingInterval),
  });
}

// The open slot starting exactly at `instant`, or undefined.
export function findSlotAt(slots, instant) {
  return slots.find((slot) => slot.start.toMillis() === instant.toMillis());
}
