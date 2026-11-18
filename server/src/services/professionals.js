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

// Returns bookings that overlap [from, to) for the professional, as ISO timestamps.
export async function getBookingsOverlapping(professionalId, from, to) {
  const { data, error } = await supabase
    .from("bookings")
    .select("starts_at, ends_at")
    .eq("professional_id", professionalId)
    .lt("starts_at", to.toISO())
    .gt("ends_at", from.toISO());

  if (error) throw error;
  return data;
}

// Books a session via the book_session SQL function. Throws with message "slot_unavailable" if it overlaps a booking.
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
