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
    .select("id, starts_at, ends_at, professional_id")
    .eq("id", bookingId)
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Returns the booking only if the professional holds it, or null.
export async function getBookingForProfessional(bookingId, professionalId) {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, member_id, professional_id")
    .eq("id", bookingId)
    .eq("professional_id", professionalId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
