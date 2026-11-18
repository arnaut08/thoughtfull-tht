import { supabase } from "../db.js";

export async function listProfessionals() {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, timezone")
    .eq("role", "professional")
    .order("name");

  if (error) throw error;
  return data;
}

async function getBookingsOverlapping(column, id, from, to) {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, member_id")
    .eq(column, id)
    .lt("starts_at", to.toISO())
    .gt("ends_at", from.toISO());

  if (error) throw error;
  return data;
}

// Returns bookings that overlap [from, to) for the professional, as ISO timestamps.
export function getProfessionalBookingsOverlapping(professionalId, from, to) {
  return getBookingsOverlapping("professional_id", professionalId, from, to);
}

// Returns bookings that overlap [from, to) for the member, with any professional.
export function getMemberBookingsOverlapping(memberId, from, to) {
  return getBookingsOverlapping("member_id", memberId, from, to);
}

// Books a session via the book_session SQL function. Throws with message "slot_unavailable" if the professional
// is already booked, or "member_conflict" if the member has an overlapping session with any professional.
export async function bookSession({ professionalId, memberId, startsAt, endsAt }) {
  const { data, error } = await supabase.rpc("book_session", {
    p_professional_id: professionalId,
    p_member_id: memberId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });

  if (error) throw error;
  return data;
}

// Cancels a booking and notifies the other party, via the cancel_session SQL function. Throws with message
// "booking_not_found", or "cancellation_closed" when a member cancels inside the notice window.
export async function cancelSession({ bookingId, professionalId, memberId, byProfessional, noticeCutoff }) {
  const { error } = await supabase.rpc("cancel_session", {
    p_booking_id: bookingId,
    p_professional_id: professionalId,
    p_member_id: memberId,
    p_by_professional: byProfessional,
    p_notice_cutoff: noticeCutoff,
  });

  if (error) throw error;
}

// Moves an existing booking to a new slot via the reschedule_session SQL function. Throws with the same
// messages as bookSession, plus "booking_not_found" and "cancellation_closed" (members only).
export async function rescheduleSession({ bookingId, professionalId, memberId, startsAt, endsAt, byProfessional = false }) {
  const { data, error } = await supabase.rpc("reschedule_session", {
    p_booking_id: bookingId,
    p_professional_id: professionalId,
    p_member_id: memberId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_by_professional: byProfessional,
  });

  if (error) throw error;
  return data;
}
