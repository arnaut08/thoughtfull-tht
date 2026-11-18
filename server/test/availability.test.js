import { randomUUID } from "node:crypto";
import { jest } from "@jest/globals";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "1h";

const users = [];
const availabilityRows = [];

// In-memory stand-in for the Supabase calls used by services/users.js and services/availability.js.
function fakeQuery(table, filters = []) {
  const matches = (row) => filters.every(([column, value]) => row[column] === value);
  const builder = {
    select: () => builder,
    eq(column, value) {
      filters.push([column, value]);
      return builder;
    },
    order: () => builder,
    maybeSingle: async () => ({ data: table.find(matches) ?? null, error: null }),
    then: (resolve, reject) =>
      Promise.resolve({ data: table.filter(matches), error: null }).then(resolve, reject),
  };
  return builder;
}

const fakeSupabase = {
  from: (name) => fakeQuery(name === "users" ? users : availabilityRows),
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

const app = createApp();

function addUser(role) {
  const user = {
    id: randomUUID(),
    email: `${role}@example.com`,
    name: role,
    role,
    timezone: "Asia/Kolkata",
    created_at: new Date().toISOString(),
  };
  users.push(user);
  return { user, token: signAccessToken({ id: user.id, role }) };
}

beforeEach(() => {
  users.length = 0;
  availabilityRows.length = 0;
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
