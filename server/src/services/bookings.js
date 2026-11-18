import { supabase } from "../db.js";

// Returns every booking the member holds, soonest first, with any professional.
export async function getBookingsForMember(memberId) {
  const { data, error } = await supabase
    .from("bookings")
    .select("starts_at, ends_at, professional_id")
    .eq("member_id", memberId)
    .order("starts_at");

  if (error) throw error;
  return data;
}
