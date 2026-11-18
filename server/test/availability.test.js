import { randomUUID } from "node:crypto";
import { jest } from "@jest/globals";
import { DateTime } from "luxon";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "1h";

const users = [];
const availabilityRows = [];
const bookingRows = [];
const tables = {
  users,
  availability_rules: availabilityRows,
  bookings: bookingRows,
};

const OPERATORS = {
  eq: (value, expected) => value === expected,
  lt: (value, expected) => value < expected,
  gt: (value, expected) => value > expected,
};

// In-memory stand-in for the Supabase calls used by the services.
function fakeQuery(table) {
  const filters = [];
  const matches = (row) => filters.every(([column, op, value]) => OPERATORS[op](row[column], value));
  const builder = {
    select: () => builder,
    order: () => builder,
    maybeSingle: async () => ({ data: table.find(matches) ?? null, error: null }),
    then: (resolve, reject) =>
      Promise.resolve({ data: table.filter(matches), error: null }).then(resolve, reject),
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
  rpc: async (name, { p_professional_id: professionalId, p_rules: rules }) => {
    if (name !== "replace_availability_rules") throw new Error(`unexpected rpc ${name}`);
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

jest.unstable_mockModule("../src/db.js", () => ({ supabase: fakeSupabase }));

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");
const { normalizeRules } = await import("../src/lib/availability.js");
const { signAccessToken } = await import("../src/lib/jwt.js");
const { generateOpenSlots } = await import("../src/lib/slots.js");

const app = createApp();

function addUser(role, timezone = "Asia/Kolkata") {
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

beforeEach(() => {
  users.length = 0;
  availabilityRows.length = 0;
  bookingRows.length = 0;
});

describe("normalizeRules", () => {
  test("merges overlapping and adjacent windows on the same day and sorts the result", () => {
    const { rules } = normalizeRules([
      { day_of_week: 2, start_time: "13:00", end_time: "17:00" },
      { day_of_week: 2, start_time: "09:00", end_time: "12:00" },
      { day_of_week: 2, start_time: "12:00", end_time: "13:30" },
      { day_of_week: 0, start_time: "10:00", end_time: "11:00" },
    ]);

    expect(rules).toEqual([
      { day_of_week: 0, start_time: "10:00", end_time: "11:00" },
      { day_of_week: 2, start_time: "09:00", end_time: "17:00" },
    ]);
  });

  test("rejects overnight windows and windows shorter than 50 minutes", () => {
    const { errors } = normalizeRules([
      { day_of_week: 5, start_time: "22:00", end_time: "02:00" },
      { day_of_week: 5, start_time: "09:00", end_time: "09:30" },
    ]);

    expect(Object.keys(errors)).toEqual(["rules[0]", "rules[1]"]);
    expect(errors["rules[0]"]).toMatch(/split overnight/);
    expect(errors["rules[1]"]).toMatch(/at least 50 minutes/);
  });

  test("accepts a window ending at 24:00 but not one starting there", () => {
    const { rules } = normalizeRules([
      { day_of_week: 4, start_time: "22:00", end_time: "24:00" },
    ]);
    const { errors } = normalizeRules([
      { day_of_week: 4, start_time: "24:00", end_time: "24:00" },
    ]);

    expect(rules).toEqual([{ day_of_week: 4, start_time: "22:00", end_time: "24:00" }]);
    expect(errors["rules[0]"]).toMatch(/HH:mm/);
  });

  test("rejects an out-of-range day and malformed times", () => {
    const { errors } = normalizeRules([
      { day_of_week: 7, start_time: "09:00", end_time: "10:00" },
      { day_of_week: 1, start_time: "9am", end_time: "10:00" },
    ]);

    expect(errors["rules[0]"]).toMatch(/day_of_week/);
    expect(errors["rules[1]"]).toMatch(/HH:mm/);
  });
});

describe("/api/availability", () => {
  test("returns 401 without a bearer token", async () => {
    const response = await request(app).get("/api/availability");

    expect(response.status).toBe(401);
  });

  test("returns 403 for a member", async () => {
    const { token } = addUser("member");

    const response = await request(app)
      .put("/api/availability")
      .set("Authorization", `Bearer ${token}`)
      .send({ rules: [] });

    expect(response.status).toBe(403);
    expect(availabilityRows).toHaveLength(0);
  });

  test("returns 400 with details and writes nothing for invalid rules", async () => {
    const { token } = addUser("professional");

    const response = await request(app)
      .put("/api/availability")
      .set("Authorization", `Bearer ${token}`)
      .send({ rules: [{ day_of_week: 1, start_time: "22:00", end_time: "02:00" }] });

    expect(response.status).toBe(400);
    expect(response.body.details["rules[0]"]).toMatch(/split overnight/);
    expect(availabilityRows).toHaveLength(0);
  });

  test("PUT then GET round-trips the normalized week with HH:mm times and the profile timezone", async () => {
    const { token } = addUser("professional");
    const week = [
      { day_of_week: 1, start_time: "13:00", end_time: "17:00" },
      { day_of_week: 1, start_time: "09:00", end_time: "12:00" },
      { day_of_week: 3, start_time: "10:00", end_time: "10:50" },
    ];

    const put = await request(app)
      .put("/api/availability")
      .set("Authorization", `Bearer ${token}`)
      .send({ rules: week });
    const get = await request(app)
      .get("/api/availability")
      .set("Authorization", `Bearer ${token}`);

    const expected = [
      { day_of_week: 1, start_time: "09:00", end_time: "12:00" },
      { day_of_week: 1, start_time: "13:00", end_time: "17:00" },
      { day_of_week: 3, start_time: "10:00", end_time: "10:50" },
    ];
    expect(put.status).toBe(200);
    expect(put.body.rules).toEqual(expected);
    expect(get.status).toBe(200);
    expect(get.body).toEqual({ timezone: "Asia/Kolkata", rules: expected });
  });
});

describe("generateOpenSlots", () => {
  const rule = (day_of_week, start_time, end_time) => ({ day_of_week, start_time, end_time });

  test("keeps the local start time across the US spring-forward change", () => {
    const now = DateTime.fromISO("2026-03-01T00:00:00Z");
    const slots = generateOpenSlots({
      rules: [rule(0, "09:00", "11:00")],
      timezone: "America/New_York",
      now,
      horizonEnd: now.plus({ days: 14 }),
    });

    // 09:00 is EST (UTC-5) on Mar 1 and EDT (UTC-4) on Mar 8, so the UTC instants differ.
    expect(slots.map((slot) => slot.start.toUTC().toISO())).toEqual([
      "2026-03-01T14:00:00.000Z",
      "2026-03-01T14:50:00.000Z",
      "2026-03-08T13:00:00.000Z",
      "2026-03-08T13:50:00.000Z",
    ]);
  });

  test("skips sessions that overlap a booking or start before now", () => {
    const now = DateTime.fromISO("2026-03-01T10:00:00Z");
    const horizonEnd = now.plus({ days: 1 });
    const booked = [
      { start: DateTime.fromISO("2026-03-01T12:00:00Z"), end: DateTime.fromISO("2026-03-01T13:00:00Z") },
    ];
    const slots = generateOpenSlots({
      rules: [0, 1, 2, 3, 4, 5, 6].map((day) => rule(day, "00:00", "24:00")),
      timezone: "UTC",
      now,
      horizonEnd,
      booked,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot) => slot.start >= now && slot.end <= horizonEnd)).toBe(true);
    expect(slots.some((slot) => slot.start < booked[0].end && slot.end > booked[0].start)).toBe(false);
  });
});

describe("/api/professionals", () => {
  function scheduleEveryDay(professionalId, start_time = "09:00:00", end_time = "12:00:00") {
    for (let day_of_week = 0; day_of_week < 7; day_of_week += 1) {
      availabilityRows.push({ id: randomUUID(), professional_id: professionalId, day_of_week, start_time, end_time });
    }
  }

  test("returns 401 without a bearer token", async () => {
    const response = await request(app).get("/api/professionals");

    expect(response.status).toBe(401);
  });

  test("lists only professionals, without email addresses", async () => {
    const { token } = addUser("member");
    const { user: professional } = addUser("professional");

    const response = await request(app)
      .get("/api/professionals")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.professionals).toEqual([
      { id: professional.id, name: "professional", timezone: "Asia/Kolkata" },
    ]);
  });

  test("returns 404 for a member account or a malformed id", async () => {
    const { token } = addUser("member");
    const { user: member } = addUser("member");

    const asMember = await request(app)
      .get(`/api/professionals/${member.id}`)
      .set("Authorization", `Bearer ${token}`);
    const malformed = await request(app)
      .get("/api/professionals/not-a-uuid")
      .set("Authorization", `Bearer ${token}`);

    expect(asMember.status).toBe(404);
    expect(malformed.status).toBe(404);
  });

  test("returns open slots in the member's timezone and excludes booked sessions", async () => {
    const { token } = addUser("member", "America/New_York");
    const { user: professional } = addUser("professional", "Asia/Kolkata");
    scheduleEveryDay(professional.id);

    const bookedStart = DateTime.now().setZone("Asia/Kolkata").plus({ days: 1 }).startOf("day").set({ hour: 9 }).toUTC();
    bookingRows.push({
      professional_id: professional.id,
      starts_at: bookedStart.toISO(),
      ends_at: bookedStart.plus({ minutes: 50 }).toISO(),
    });

    const response = await request(app)
      .get(`/api/professionals/${professional.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.timezone).toBe("America/New_York");
    expect(response.body.professional).toEqual({ id: professional.id, name: "professional", timezone: "Asia/Kolkata" });

    const starts = response.body.slots.map((slot) => DateTime.fromISO(slot.start).toMillis());
    expect(starts).not.toContain(bookedStart.toMillis());
    expect(starts).toContain(bookedStart.plus({ minutes: 50 }).toMillis());
    expect(response.body.slots.every((slot) => /-0[45]:00$/.test(slot.start))).toBe(true);
  });
});
