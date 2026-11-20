import { randomUUID } from "node:crypto";
import { jest } from "@jest/globals";
import { DateTime } from "luxon";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "1h";

export const users = [];
export const availabilityRows = [];
export const bookingRows = [];
export const notificationRows = [];
export const blockedDateRows = [];
export const bookingRejection = { enabled: false, error: "slot_unavailable" };
const tables = {
  users,
  availability_rules: availabilityRows,
  bookings: bookingRows,
  notifications: notificationRows,
  blocked_dates: blockedDateRows,
};

const OPERATORS = {
  eq: (value, expected) => value === expected,
  lt: (value, expected) => value < expected,
  gt: (value, expected) => value > expected,
  in: (value, expected) => expected.includes(value),
  is: (value, expected) => value === expected,
};

// In-memory stand-in for the Supabase calls used by the services.
function fakeQuery(table) {
  const filters = [];
  let deleting = false;
  let updates = null;
  let upserts = null;
  let countOnly = false;
  const sorts = [];
  let limit = null;
  const matches = (row) => filters.every(([column, op, value]) => OPERATORS[op](row[column], value));
  const builder = {
    select: (_columns, options) => {
      countOnly = options?.head === true;
      return builder;
    },
    order: (column, { ascending = true } = {}) => {
      sorts.push({ column, ascending });
      return builder;
    },
    limit: (count) => {
      limit = count;
      return builder;
    },
    update: (values) => {
      updates = values;
      return builder;
    },
    upsert: (values) => {
      upserts = values;
      return builder;
    },
    delete: () => {
      deleting = true;
      return builder;
    },
    maybeSingle: async () => ({ data: table.find(matches) ?? null, error: null }),
    then: (resolve, reject) => {
      let rows = table.filter(matches);
      for (const sort of [...sorts].reverse()) {
        const direction = sort.ascending ? 1 : -1;
        rows = [...rows].sort((a, b) => (a[sort.column] < b[sort.column] ? -1 : a[sort.column] > b[sort.column] ? 1 : 0) * direction);
      }
      if (upserts && !table.some((row) => Object.entries(upserts).every(([key, value]) => row[key] === value))) {
        table.push({ id: randomUUID(), ...upserts });
      }
      if (deleting) {
        rows.forEach((row) => table.splice(table.indexOf(row), 1));
      }
      if (updates) {
        rows.forEach((row) => Object.assign(row, updates));
      }
      const count = rows.length;
      if (limit !== null) rows = rows.slice(0, limit);
      if (countOnly) {
        return Promise.resolve({ data: null, count, error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: rows, count, error: null }).then(resolve, reject);
    },
  };
  for (const op of Object.keys(OPERATORS)) {
    builder[op] = (column, value) => {
      filters.push([column, op, value]);
      return builder;
    };
  }
  return builder;
}

const fakeSupabase = {
  from: (name) => fakeQuery(tables[name]),
  rpc: async (name, args) => {
    if (name === "cancel_session") {
      const {
        p_booking_id: bookingId,
        p_professional_id: professionalId,
        p_member_id: memberId,
        p_by_professional: byProfessional,
        p_notice_cutoff: noticeCutoff,
      } = args;
      const index = bookingRows.findIndex(
        (row) => row.id === bookingId && row.professional_id === professionalId && row.member_id === memberId,
      );
      if (index === -1) return { data: null, error: { message: "booking_not_found" } };
      const booking = bookingRows[index];
      if (!byProfessional && DateTime.fromISO(booking.starts_at) <= DateTime.fromISO(noticeCutoff)) {
        return { data: null, error: { message: "cancellation_closed" } };
      }
      bookingRows.splice(index, 1);
      notificationRows.push({
        id: randomUUID(),
        recipient_id: byProfessional ? memberId : professionalId,
        actor_id: byProfessional ? professionalId : memberId,
        type: "session_cancelled",
        session_starts_at: booking.starts_at,
        new_starts_at: null,
        read_at: null,
        created_at: DateTime.utc().toISO(),
      });
      return { data: null, error: null };
    }
    if (name === "book_session") {
      if (bookingRejection.enabled) {
        bookingRejection.enabled = false;
        return { data: null, error: { message: bookingRejection.error } };
      }
      const { p_professional_id: professionalId, p_member_id: memberId, p_starts_at: startsAt, p_ends_at: endsAt } = args;
      const overlaps = (column, id) =>
        bookingRows.some(
          (booking) => booking[column] === id && booking.starts_at < endsAt && booking.ends_at > startsAt,
        );
      if (DateTime.fromISO(startsAt) <= DateTime.utc()) return { data: null, error: { message: "slot_in_past" } };
      if (overlaps("professional_id", professionalId)) return { data: null, error: { message: "slot_unavailable" } };
      if (overlaps("member_id", memberId)) return { data: null, error: { message: "member_conflict" } };
      const booking = { professional_id: professionalId, member_id: memberId, starts_at: startsAt, ends_at: endsAt };
      bookingRows.push(booking);
      return { data: booking, error: null };
    }
    if (name === "reschedule_session") {
      const {
        p_booking_id: bookingId,
        p_professional_id: professionalId,
        p_member_id: memberId,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
      } = args;
      if (DateTime.fromISO(startsAt) <= DateTime.utc()) return { data: null, error: { message: "slot_in_past" } };
      const booking = bookingRows.find(
        (row) => row.id === bookingId && row.professional_id === professionalId && row.member_id === memberId,
      );
      if (!booking) return { data: null, error: { message: "booking_not_found" } };
      if (!args.p_by_professional && DateTime.fromISO(booking.starts_at) <= DateTime.utc().plus({ hours: 24 })) {
        return { data: null, error: { message: "cancellation_closed" } };
      }
      const overlaps = (column, id) =>
        bookingRows.some(
          (row) =>
            row.id !== bookingId &&
            row[column] === id &&
            row.starts_at < endsAt &&
            row.ends_at > startsAt,
        );
      if (overlaps("professional_id", professionalId)) return { data: null, error: { message: "slot_unavailable" } };
      if (overlaps("member_id", memberId)) return { data: null, error: { message: "member_conflict" } };
      notificationRows.push({
        id: randomUUID(),
        recipient_id: args.p_by_professional ? memberId : professionalId,
        actor_id: args.p_by_professional ? professionalId : memberId,
        type: "session_rescheduled",
        session_starts_at: booking.starts_at,
        new_starts_at: startsAt,
        read_at: null,
        created_at: DateTime.utc().toISO(),
      });
      booking.starts_at = startsAt;
      booking.ends_at = endsAt;
      return { data: booking, error: null };
    }
    if (name !== "replace_availability_rules") throw new Error(`unexpected rpc ${name}`);
    const { p_professional_id: professionalId, p_rules: rules } = args;
    const kept = availabilityRows.filter((row) => row.professional_id !== professionalId);
    availabilityRows.length = 0;
    availabilityRows.push(
      ...kept,
      ...rules.map((rule) => ({
        id: randomUUID(),
        professional_id: professionalId,
        day_of_week: rule.day_of_week,
        start_time: `${rule.start_time}:00`,
        end_time: `${rule.end_time}:00`,
      })),
    );
    return {
      data: availabilityRows.filter((row) => row.professional_id === professionalId),
      error: null,
    };
  },
};

jest.unstable_mockModule("../../src/db.js", () => ({ supabase: fakeSupabase }));

export const { default: request } = await import("supertest");
const { createApp } = await import("../../src/app.js");
export const { normalizeRules } = await import("../../src/lib/availability.js");
const { signAccessToken } = await import("../../src/lib/jwt.js");
export const { generateOpenSlots } = await import("../../src/lib/slots.js");

export const app = createApp();

export function addUser(role, timezone = "Asia/Kolkata") {
  const user = {
    id: randomUUID(),
    email: `${role}-${users.length}@example.com`,
    name: role,
    role,
    timezone,
    created_at: new Date().toISOString(),
  };
  users.push(user);
  return { user, token: signAccessToken({ id: user.id, role }) };
}

export function resetTestState() {
  users.length = 0;
  availabilityRows.length = 0;
  bookingRows.length = 0;
  notificationRows.length = 0;
  blockedDateRows.length = 0;
  bookingRejection.enabled = false;
  bookingRejection.error = "slot_unavailable";
}

