import { supabase } from "../db.js";

export async function getRulesForProfessional(professionalId) {
  const { data, error } = await supabase
    .from("availability_rules")
    .select("day_of_week, start_time, end_time")
    .eq("professional_id", professionalId)
    .order("day_of_week")
    .order("start_time");

  if (error) throw error;
  return data;
}

// Returns the professional's blocked dates as YYYY-MM-DD strings, soonest first.
export async function getBlockedDatesForProfessional(professionalId) {
  const { data, error } = await supabase
    .from("blocked_dates")
    .select("blocked_date")
    .eq("professional_id", professionalId)
    .order("blocked_date");

  if (error) throw error;
  return data.map((row) => row.blocked_date);
}

// Blocking a date that is already blocked does nothing.
export async function addBlockedDate(professionalId, date) {
  const { error } = await supabase
    .from("blocked_dates")
    .upsert(
      { professional_id: professionalId, blocked_date: date },
      { onConflict: "professional_id,blocked_date", ignoreDuplicates: true },
    );

  if (error) throw error;
}

export async function removeBlockedDate(professionalId, date) {
  const { error } = await supabase
    .from("blocked_dates")
    .delete()
    .eq("professional_id", professionalId)
    .eq("blocked_date", date);

  if (error) throw error;
}

// Atomically replaces the professional's weekly schedule via the replace_availability_rules SQL function.
export async function replaceRulesForProfessional(professionalId, rules) {
  const { data, error } = await supabase.rpc("replace_availability_rules", {
    p_professional_id: professionalId,
    p_rules: rules,
  });

  if (error) throw error;
  return data;
}
