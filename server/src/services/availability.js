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

// Atomically replaces the professional's weekly schedule via the replace_availability_rules SQL function.
export async function replaceRulesForProfessional(professionalId, rules) {
  const { data, error } = await supabase.rpc("replace_availability_rules", {
    p_professional_id: professionalId,
    p_rules: rules,
  });

  if (error) throw error;
  return data;
}
