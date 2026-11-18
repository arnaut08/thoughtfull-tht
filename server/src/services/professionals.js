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
    .select("starts_at, ends_at")
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
