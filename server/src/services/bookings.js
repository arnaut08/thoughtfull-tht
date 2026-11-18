import { supabase } from "../db.js";

// Returns every booking the member holds, soonest first, with any professional.
export async function getBookingsForMember(memberId) {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, professional_id")
    .eq("member_id", memberId)
    .order("starts_at");

  if (error) throw error;
  return data;
}

// Returns the booking only if the member holds it, or null.
export async function getBookingForMember(bookingId, memberId) {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, starts_at, professional_id")
    .eq("id", bookingId)
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Deletes the member's booking only if it starts after startsAfter. Returns true if a row was deleted.
// The start-time condition is checked in the same statement, so a session can't be cancelled
// once it is inside the cutoff, even if the check in getBookingForMember was stale.
export async function deleteBookingForMember(bookingId, memberId, startsAfter) {
  const { data, error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", bookingId)
    .eq("member_id", memberId)
    .gt("starts_at", startsAfter.toISO())
    .select("id");

  if (error) throw error;
  return data.length > 0;
}
