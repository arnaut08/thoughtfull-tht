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
