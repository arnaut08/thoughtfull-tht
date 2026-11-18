import { DateTime } from "luxon";
import { supabase } from "../db.js";

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists");
    this.name = "EmailTakenError";
  }
}

// Shapes a stored row for API responses, expressing createdAt in the user's own timezone.
export function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    timezone: row.timezone,
    createdAt: DateTime.fromISO(row.created_at, { zone: "utc" })
      .setZone(row.timezone)
      .toISO(),
  };
}

export async function createUser({ email, passwordHash, name, role, timezone }) {
  const { data, error } = await supabase
    .from("users")
    .insert({
      email,
      password_hash: passwordHash,
      name,
      role,
      timezone,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new EmailTakenError();
    throw error;
  }
  return data;
}

export async function findUserByEmail(email) {
  const { data, error } = await supabase
    .from("users")
    .select()
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function findUserById(id) {
  const { data, error } = await supabase
    .from("users")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function findUsersByIds(ids) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .from("users")
    .select("id, name, timezone")
    .in("id", uniqueIds);

  if (error) throw error;
  return data;
}
