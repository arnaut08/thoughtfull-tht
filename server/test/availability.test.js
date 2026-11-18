import { randomUUID } from "node:crypto";
import { jest } from "@jest/globals";
import { DateTime } from "luxon";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "1h";

const users = [];
const availabilityRows = [];
const bookingRows = [];
let rejectNextBooking = false;
let rejectNextBookingWith = "slot_unavailable";
const tables = {
  users,
  availability_rules: availabilityRows,
  bookings: bookingRows,
};

const OPERATORS = {
  eq: (value, expected) => value === expected,
  lt: (value, expected) => value < expected,
  gt: (value, expected) => value > expected,
  in: (value, expected) => expected.includes(value),
};

// In-memory stand-in for the Supabase calls used by the services.
function fakeQuery(table) {
  const filters = [];
  let deleting = false;
  const matches = (row) => filters.every(([column, op, value]) => OPERATORS[op](row[column], value));
  const builder = {
    select: () => builder,
    order: () => builder,
    delete: () => {
      deleting = true;
      return builder;
    },
    maybeSingle: async () => ({ data: table.find(matches) ?? null, error: null }),
    then: (resolve, reject) => {
      let rows = table.filter(matches);
      if (deleting) {
        rows.forEach((row) => table.splice(table.indexOf(row), 1));
      }
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
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
    if (name === "book_session") {
      if (rejectNextBooking) {
        rejectNextBooking = false;
        return { data: null, error: { message: rejectNextBookingWith } };
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
      if (DateTime.fromISO(booking.starts_at) <= DateTime.utc().plus({ hours: 24 })) {
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
  rejectNextBooking = false;
  rejectNextBookingWith = "slot_unavailable";
});

describe("GET /api/bookings", () => {
  test("splits a member's sessions into upcoming and past, in the member's timezone", async () => {
    const { user: member, token } = addUser("member", "America/New_York");
    const { user: professional } = addUser("professional", "Asia/Kolkata");
    const now = DateTime.utc();
    const sessionAt = (hoursFromNow) => ({
      professional_id: professional.id,
      member_id: member.id,
      starts_at: now.plus({ hours: hoursFromNow }).startOf("hour").toISO(),
      ends_at: now.plus({ hours: hoursFromNow + 1 }).startOf("hour").toISO(),
    });
    bookingRows.push(sessionAt(-48), sessionAt(-24), sessionAt(24), sessionAt(48));

    const response = await request(app).get("/api/bookings").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.timezone).toBe("America/New_York");
    expect(response.body.upcoming.map((session) => session.start)).toEqual([
      DateTime.fromISO(bookingRows[2].starts_at).setZone("America/New_York").toISO(),
      DateTime.fromISO(bookingRows[3].starts_at).setZone("America/New_York").toISO(),
    ]);
    expect(response.body.past.map((session) => session.start)).toEqual([
      DateTime.fromISO(bookingRows[1].starts_at).setZone("America/New_York").toISO(),
      DateTime.fromISO(bookingRows[0].starts_at).setZone("America/New_York").toISO(),
    ]);
    expect(response.body.upcoming[0].professional).toEqual({
      id: professional.id,
      name: professional.name,
      timezone: "Asia/Kolkata",
    });
  });

  test("a session in progress is upcoming, and a session that has ended is past", async () => {
    const { user: member, token } = addUser("member", "Europe/London");
    const { user: professional } = addUser("professional", "Asia/Kolkata");
    const now = DateTime.utc();
    bookingRows.push({
      professional_id: professional.id,
      member_id: member.id,
      starts_at: now.minus({ minutes: 10 }).toISO(),
      ends_at: now.plus({ minutes: 40 }).toISO(),
    });
    bookingRows.push({
      professional_id: professional.id,
      member_id: member.id,
      starts_at: now.minus({ hours: 2 }).toISO(),
      ends_at: now.minus({ hours: 1 }).toISO(),
    });

    const response = await request(app).get("/api/bookings").set("Authorization", `Bearer ${token}`);

    expect(response.body.upcoming).toHaveLength(1);
    expect(response.body.past).toHaveLength(1);
  });

  test("only returns the caller's own sessions", async () => {
    const { token } = addUser("member", "Europe/London");
    const { user: otherMember } = addUser("member", "Europe/London");
    const { user: professional } = addUser("professional", "Asia/Kolkata");
    bookingRows.push({
      professional_id: professional.id,
      member_id: otherMember.id,
      starts_at: DateTime.utc().plus({ days: 1 }).toISO(),
      ends_at: DateTime.utc().plus({ days: 1, minutes: 50 }).toISO(),
    });

    const response = await request(app).get("/api/bookings").set("Authorization", `Bearer ${token}`);

    expect(response.body).toEqual({ timezone: "Europe/London", upcoming: [], past: [] });
  });

  test("rejects professionals", async () => {
    const { token } = addUser("professional", "Asia/Kolkata");

    const response = await request(app).get("/api/bookings").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/bookings/:id", () => {
  const sessionAt = (member, professional, hoursFromNow) => {
    const start = DateTime.utc().plus({ hours: hoursFromNow }).startOf("hour");
    return {
      id: randomUUID(),
      professional_id: professional.id,
      member_id: member.id,
      starts_at: start.toISO(),
      ends_at: start.plus({ minutes: 50 }).toISO(),
    };
  };

  test("cancels a session more than 24 hours away and reports whether it is cancellable", async () => {
    const { user: member, token } = addUser("member");
    const { user: professional } = addUser("professional");
    const later = sessionAt(member, professional, 48);
    const soon = sessionAt(member, professional, 12);
    bookingRows.push(soon, later);

    const listed = await request(app).get("/api/bookings").set("Authorization", `Bearer ${token}`);
    expect(listed.body.upcoming.map((session) => [session.id, session.cancellable])).toEqual([
      [soon.id, false],
      [later.id, true],
    ]);

    const response = await request(app)
      .delete(`/api/bookings/${later.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);
    expect(bookingRows.map((booking) => booking.id)).toEqual([soon.id]);
  });

  test("refuses to cancel a session that starts within 24 hours and keeps it booked", async () => {
    const { user: member, token } = addUser("member");
    const { user: professional } = addUser("professional");
    const soon = sessionAt(member, professional, 23);
    bookingRows.push(soon);

    const response = await request(app)
      .delete(`/api/bookings/${soon.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/more than 24 hours/);
    expect(bookingRows).toHaveLength(1);
  });

  test("returns 404 for another member's session or a malformed id, and deletes nothing", async () => {
    const { user: member, token } = addUser("member");
    const { user: otherMember } = addUser("member");
    const { user: professional } = addUser("professional");
    const theirs = sessionAt(otherMember, professional, 48);
    bookingRows.push(theirs);

    const otherSession = await request(app)
      .delete(`/api/bookings/${theirs.id}`)
      .set("Authorization", `Bearer ${token}`);
    const malformed = await request(app)
      .delete("/api/bookings/not-a-uuid")
      .set("Authorization", `Bearer ${token}`);

    expect(otherSession.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(bookingRows).toHaveLength(1);
  });

  test("rejects professionals", async () => {
    const { user: member } = addUser("member");
    const { user: professional, token } = addUser("professional");
    const session = sessionAt(member, professional, 48);
    bookingRows.push(session);

    const response = await request(app)
      .delete(`/api/bookings/${session.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(bookingRows).toHaveLength(1);
  });
});

describe("GET /api/professional-bookings", () => {
  test("lists booked sessions with the member's name alongside open slots, in the professional's timezone", async () => {
    const { token, user: professional } = addUser("professional", "Asia/Kolkata");
    const { user: member } = addUser("member", "America/New_York");
    for (let day_of_week = 0; day_of_week < 7; day_of_week += 1) {
      availabilityRows.push({
        id: randomUUID(),
        professional_id: professional.id,
        day_of_week,
        start_time: "09:00:00",
        end_time: "12:00:00",
      });
    }

    const bookedStart = DateTime.now().setZone("Asia/Kolkata").plus({ days: 1 }).startOf("day").set({ hour: 9 }).toUTC();
    bookingRows.push({
      professional_id: professional.id,
      member_id: member.id,
      starts_at: bookedStart.toISO(),
      ends_at: bookedStart.plus({ minutes: 50 }).toISO(),
    });

    const response = await request(app).get("/api/professional-bookings").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.timezone).toBe("Asia/Kolkata");

    const { slots } = response.body;
    const starts = slots.map((slot) => DateTime.fromISO(slot.start).toMillis());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(slots.every((slot) => slot.start.endsWith("+05:30"))).toBe(true);

    const booked = slots.find((slot) => DateTime.fromISO(slot.start).toMillis() === bookedStart.toMillis());
    expect(booked).toEqual({
      start: bookedStart.setZone("Asia/Kolkata").toISO(),
      end: bookedStart.plus({ minutes: 50 }).setZone("Asia/Kolkata").toISO(),
      member: { id: member.id, name: "member" },
    });

    const open = slots.filter((slot) => slot.member === null);
    expect(open.length).toBeGreaterThan(0);
    expect(open.map((slot) => DateTime.fromISO(slot.start).toMillis())).not.toContain(bookedStart.toMillis());
  });

  test("rejects members", async () => {
    const { token } = addUser("member", "Europe/London");

    const response = await request(app).get("/api/professional-bookings").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
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

  describe("POST /:id/bookings", () => {
    function bookingRequest(token, professionalId, body) {
      return request(app)
        .post(`/api/professionals/${professionalId}/bookings`)
        .set("Authorization", `Bearer ${token}`)
        .send(body);
    }

    test("books an open slot, which then drops out of the slot list", async () => {
      const { token } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      const profile = await request(app)
        .get(`/api/professionals/${professional.id}`)
        .set("Authorization", `Bearer ${token}`);
      const [slot] = profile.body.slots;

      const response = await bookingRequest(token, professional.id, { starts_at: slot.start });

      expect(response.status).toBe(201);
      expect(response.body.booking.start).toBe(slot.start);
      expect(response.body.booking.end).toBe(slot.end);
      expect(bookingRows).toHaveLength(1);
      expect(DateTime.fromISO(bookingRows[0].starts_at).toMillis()).toBe(DateTime.fromISO(slot.start).toMillis());

      const after = await request(app)
        .get(`/api/professionals/${professional.id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(after.body.slots.map((s) => s.start)).not.toContain(slot.start);
    });

    test("rejects a time that is not an open slot, or a slot that is already booked", async () => {
      const { token } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      const profile = await request(app)
        .get(`/api/professionals/${professional.id}`)
        .set("Authorization", `Bearer ${token}`);
      const [slot] = profile.body.slots;
      const offGrid = DateTime.fromISO(slot.start).plus({ minutes: 10 }).toISO();

      const offGridResponse = await bookingRequest(token, professional.id, { starts_at: offGrid });
      const first = await bookingRequest(token, professional.id, { starts_at: slot.start });
      const repeat = await bookingRequest(token, professional.id, { starts_at: slot.start });

      expect(offGridResponse.status).toBe(409);
      expect(first.status).toBe(201);
      expect(repeat.status).toBe(409);
      expect(bookingRows).toHaveLength(1);
    });

    test("returns 403 for a professional and 400 for a missing start time", async () => {
      const { token: memberToken } = addUser("member");
      const { user: professional, token: professionalToken } = addUser("professional");
      scheduleEveryDay(professional.id);

      const asProfessional = await bookingRequest(professionalToken, professional.id, {
        starts_at: DateTime.utc().plus({ days: 1 }).toISO(),
      });
      const missing = await bookingRequest(memberToken, professional.id, {});

      expect(asProfessional.status).toBe(403);
      expect(missing.status).toBe(400);
      expect(bookingRows).toHaveLength(0);
    });

    test("when two members request the same slot, only the first is booked", async () => {
      const { user: firstMember, token: firstToken } = addUser("member", "America/New_York");
      const { token: secondToken } = addUser("member", "Europe/London");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      const profile = await request(app)
        .get(`/api/professionals/${professional.id}`)
        .set("Authorization", `Bearer ${firstToken}`);
      const [slot] = profile.body.slots;

      const first = await bookingRequest(firstToken, professional.id, { starts_at: slot.start });
      const second = await bookingRequest(secondToken, professional.id, { starts_at: slot.start });

      expect(first.status).toBe(201);
      expect(second.status).toBe(409);
      expect(second.body.error).toBe("That session is no longer available");
      expect(bookingRows).toHaveLength(1);
      expect(bookingRows[0].member_id).toBe(firstMember.id);
    });

    test("a member can't book a session that overlaps their booking with another professional", async () => {
      const { token } = addUser("member", "America/New_York");
      const { user: professionalA } = addUser("professional", "Asia/Kolkata");
      const { user: professionalB } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professionalA.id);
      scheduleEveryDay(professionalB.id);
      const profileA = await request(app)
        .get(`/api/professionals/${professionalA.id}`)
        .set("Authorization", `Bearer ${token}`);
      const [slotA] = profileA.body.slots;
      const booked = await bookingRequest(token, professionalA.id, { starts_at: slotA.start });

      const profileB = await request(app)
        .get(`/api/professionals/${professionalB.id}`)
        .set("Authorization", `Bearer ${token}`);
      const professionalBStarts = profileB.body.slots.map((slot) => slot.start);
      const overlapping = await bookingRequest(token, professionalB.id, { starts_at: slotA.start });

      expect(booked.status).toBe(201);
      expect(professionalBStarts).not.toContain(slotA.start);
      expect(overlapping.status).toBe(409);
      expect(bookingRows).toHaveLength(1);
    });

    test("rejects a slot that has already started, even if it is a valid weekly time", async () => {
      const { token } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      const pastStart = DateTime.utc().minus({ days: 1 }).startOf("hour").toISO();

      const response = await bookingRequest(token, professional.id, { starts_at: pastStart });

      expect(response.status).toBe(409);
      expect(bookingRows).toHaveLength(0);
    });

    test("returns 409 with a member conflict message when the database rejects an overlapping member booking", async () => {
      const { token } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      const profile = await request(app)
        .get(`/api/professionals/${professional.id}`)
        .set("Authorization", `Bearer ${token}`);
      const [slot] = profile.body.slots;
      rejectNextBooking = true;
      rejectNextBookingWith = "member_conflict";

      const response = await bookingRequest(token, professional.id, { starts_at: slot.start });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("You already have a session booked at this time");
      expect(bookingRows).toHaveLength(0);
    });

    test("returns 409 and writes nothing when the database rejects a slot that passed the pre-check", async () => {
      const { token } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      const profile = await request(app)
        .get(`/api/professionals/${professional.id}`)
        .set("Authorization", `Bearer ${token}`);
      const [slot] = profile.body.slots;
      rejectNextBooking = true;

      const response = await bookingRequest(token, professional.id, { starts_at: slot.start });

      expect(response.status).toBe(409);
      expect(bookingRows).toHaveLength(0);
    });
  });

  describe("reschedule", () => {
    function sessionFor(member, professional, hoursFromNow) {
      const start = DateTime.utc().plus({ hours: hoursFromNow }).startOf("hour");
      return {
        id: randomUUID(),
        professional_id: professional.id,
        member_id: member.id,
        starts_at: start.toISO(),
        ends_at: start.plus({ minutes: 50 }).toISO(),
      };
    }

    function rescheduleRequest(token, professionalId, bookingId, startsAt) {
      return request(app)
        .post(`/api/professionals/${professionalId}/bookings/${bookingId}/reschedule`)
        .set("Authorization", `Bearer ${token}`)
        .send({ starts_at: startsAt });
    }

    test("the profile lists the session being rescheduled and rejects one inside the 24-hour window", async () => {
      const { user: member, token } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      const later = sessionFor(member, professional, 72);
      const soon = sessionFor(member, professional, 5);
      bookingRows.push(later, soon);

      const response = await request(app)
        .get(`/api/professionals/${professional.id}?reschedule=${later.id}`)
        .set("Authorization", `Bearer ${token}`);
      const tooLate = await request(app)
        .get(`/api/professionals/${professional.id}?reschedule=${soon.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.reschedule.id).toBe(later.id);
      expect(DateTime.fromISO(response.body.reschedule.start).toMillis()).toBe(DateTime.fromISO(later.starts_at).toMillis());
      expect(tooLate.status).toBe(409);
      expect(tooLate.body.error).toBe("Sessions can only be rescheduled more than 24 hours before they start");
    });

    test("moves the session to an open slot and frees its old time", async () => {
      const { user: member, token } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      const session = sessionFor(member, professional, 72);
      bookingRows.push(session);
      const profile = await request(app)
        .get(`/api/professionals/${professional.id}?reschedule=${session.id}`)
        .set("Authorization", `Bearer ${token}`);
      const [target] = profile.body.slots;

      const response = await rescheduleRequest(token, professional.id, session.id, target.start);

      expect(response.status).toBe(200);
      expect(response.body.booking.start).toBe(target.start);
      expect(bookingRows).toHaveLength(1);
      expect(DateTime.fromISO(bookingRows[0].starts_at).toMillis()).toBe(DateTime.fromISO(target.start).toMillis());
    });

    test("refuses to move a session that starts within 24 hours and leaves it unchanged", async () => {
      const { user: member, token } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      const session = sessionFor(member, professional, 5);
      bookingRows.push(session);
      const target = DateTime.utc().plus({ days: 3 }).set({ hour: 4, minute: 0, second: 0, millisecond: 0 }).toISO();
      const originalStart = session.starts_at;

      const response = await rescheduleRequest(token, professional.id, session.id, target);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("Sessions can only be rescheduled more than 24 hours before they start");
      expect(bookingRows[0].starts_at).toBe(originalStart);
    });

    test("returns 404 for another member's session or a session with a different professional", async () => {
      const { token } = addUser("member", "America/New_York");
      const { user: otherMember } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      const { user: otherProfessional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      const theirs = sessionFor(otherMember, professional, 72);
      const mismatched = sessionFor(otherMember, otherProfessional, 72);
      bookingRows.push(theirs, mismatched);

      const response = await rescheduleRequest(token, professional.id, theirs.id, DateTime.utc().plus({ days: 4 }).toISO());
      const wrongProfessional = await rescheduleRequest(
        token,
        professional.id,
        mismatched.id,
        DateTime.utc().plus({ days: 4 }).toISO(),
      );

      expect(response.status).toBe(404);
      expect(wrongProfessional.status).toBe(404);
    });

    test("refuses a new time that overlaps another session the member already has", async () => {
      const { user: member, token } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      const { user: otherProfessional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      scheduleEveryDay(otherProfessional.id);
      const session = sessionFor(member, professional, 72);
      const conflicting = sessionFor(member, otherProfessional, 96);
      bookingRows.push(session, conflicting);

      const response = await rescheduleRequest(token, professional.id, session.id, conflicting.starts_at);

      expect(response.status).toBe(409);
      expect(bookingRows[0].starts_at).toBe(session.starts_at);
    });
  });
});
