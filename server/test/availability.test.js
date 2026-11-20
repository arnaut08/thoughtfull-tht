import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import {
  addUser,
  app,
  availabilityRows,
  blockedDateRows,
  bookingRows,
  generateOpenSlots,
  normalizeRules,
  notificationRows,
  request,
  resetTestState,
} from "./helpers/availability-test-setup.js";

beforeEach(resetTestState);

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
    expect(get.body).toEqual({ timezone: "Asia/Kolkata", rules: expected, blocked_dates: [] });
  });

  test("saves the minimum booking notice, returns it with the schedule, and rejects invalid hours", async () => {
    const { token } = addUser("professional");
    const auth = (req) => req.set("Authorization", `Bearer ${token}`);

    const saved = await auth(request(app).put("/api/availability/booking-notice")).send({ hours: 6 });
    const invalid = await auth(request(app).put("/api/availability/booking-notice")).send({ hours: 169 });
    const fractional = await auth(request(app).put("/api/availability/booking-notice")).send({ hours: 1.5 });
    const get = await auth(request(app).get("/api/availability"));

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ min_booking_notice_hours: 6 });
    expect(invalid.status).toBe(400);
    expect(fractional.status).toBe(400);
    expect(get.body.min_booking_notice_hours).toBe(6);
  });

  test("blocks and unblocks calendar dates, returning them sorted and without duplicates", async () => {
    const { token } = addUser("professional");
    const block = (date) =>
      request(app).post("/api/availability/blocked-dates").set("Authorization", `Bearer ${token}`).send({ date });

    const first = await block("2026-12-25");
    await block("2026-12-24");
    const duplicate = await block("2026-12-24");
    const removed = await request(app)
      .delete("/api/availability/blocked-dates/2026-12-25")
      .set("Authorization", `Bearer ${token}`);
    const get = await request(app).get("/api/availability").set("Authorization", `Bearer ${token}`);

    expect(first.status).toBe(201);
    expect(first.body.blocked_dates).toEqual(["2026-12-25"]);
    expect(duplicate.body.blocked_dates).toEqual(["2026-12-24", "2026-12-25"]);
    expect(removed.body.blocked_dates).toEqual(["2026-12-24"]);
    expect(get.body.blocked_dates).toEqual(["2026-12-24"]);
  });

  test("returns 400 for a date that is not a real YYYY-MM-DD calendar date", async () => {
    const { token } = addUser("professional");

    const badFormat = await request(app)
      .post("/api/availability/blocked-dates")
      .set("Authorization", `Bearer ${token}`)
      .send({ date: "2026-12-25T00:00" });
    const impossible = await request(app)
      .delete("/api/availability/blocked-dates/2026-02-30")
      .set("Authorization", `Bearer ${token}`);

    expect(badFormat.status).toBe(400);
    expect(impossible.status).toBe(400);
    expect(blockedDateRows).toHaveLength(0);
  });

  describe("blocking a date that has sessions", () => {
    function bookSessionOn(professional, member, startsAt) {
      const booking = {
        id: randomUUID(),
        professional_id: professional.id,
        member_id: member.id,
        starts_at: DateTime.fromISO(startsAt).toUTC().toISO(),
        ends_at: DateTime.fromISO(startsAt).plus({ minutes: 50 }).toUTC().toISO(),
      };
      bookingRows.push(booking);
      return booking;
    }
    const block = (token, body) =>
      request(app).post("/api/availability/blocked-dates").set("Authorization", `Bearer ${token}`).send(body);

    test("returns 409 listing the day's sessions and blocks nothing without a resolution", async () => {
      const { user: professional, token } = addUser("professional");
      const { user: member } = addUser("member");
      const booking = bookSessionOn(professional, member, "2026-12-25T10:00:00+05:30");

      const response = await block(token, { date: "2026-12-25" });

      expect(response.status).toBe(409);
      expect(response.body.details.sessions).toEqual([
        expect.objectContaining({ id: booking.id, member: { id: member.id, name: "member" } }),
      ]);
      expect(blockedDateRows).toHaveLength(0);
      expect(bookingRows).toHaveLength(1);
    });

    test("with keep, blocks the day and leaves the sessions booked", async () => {
      const { user: professional, token } = addUser("professional");
      const { user: member } = addUser("member");
      bookSessionOn(professional, member, "2026-12-25T10:00:00+05:30");

      const response = await block(token, { date: "2026-12-25", resolution: "keep" });

      expect(response.status).toBe(201);
      expect(response.body.blocked_dates).toEqual(["2026-12-25"]);
      expect(bookingRows).toHaveLength(1);
      expect(notificationRows).toHaveLength(0);
    });

    test("with cancel, cancels every session on the day, notifies each member, then blocks the day", async () => {
      const { user: professional, token } = addUser("professional");
      const { user: member } = addUser("member");
      const { user: other } = addUser("member");
      bookSessionOn(professional, member, "2026-12-25T10:00:00+05:30");
      bookSessionOn(professional, other, "2026-12-25T15:00:00+05:30");

      const response = await block(token, { date: "2026-12-25", resolution: "cancel" });

      expect(response.status).toBe(201);
      expect(response.body.blocked_dates).toEqual(["2026-12-25"]);
      expect(bookingRows).toHaveLength(0);
      expect(notificationRows.map((row) => row.recipient_id).sort()).toEqual([member.id, other.id].sort());
    });

    test("uses the professional's timezone: a session at 00:30 IST is not on the previous UTC day", async () => {
      const { user: professional, token } = addUser("professional");
      const { user: member } = addUser("member");
      bookSessionOn(professional, member, "2026-12-25T00:30:00+05:30");

      const previousDay = await block(token, { date: "2026-12-24" });
      const sessionDay = await block(token, { date: "2026-12-25" });

      expect(previousDay.status).toBe(201);
      expect(sessionDay.status).toBe(409);
    });

    test("returns 400 for an unknown resolution and writes nothing", async () => {
      const { user: professional, token } = addUser("professional");
      const { user: member } = addUser("member");
      bookSessionOn(professional, member, "2026-12-25T10:00:00+05:30");

      const response = await block(token, { date: "2026-12-25", resolution: "reschedule" });

      expect(response.status).toBe(400);
      expect(bookingRows).toHaveLength(1);
      expect(blockedDateRows).toHaveLength(0);
    });

    describe("reschedule suggestions", () => {
      const localDay = (offset) => DateTime.now().setZone("Asia/Kolkata").startOf("day").plus({ days: offset }).toISODate();
      const at = (day, time) => `${day}T${time}:00+05:30`;
      const everyDay = [0, 1, 2, 3, 4, 5, 6].map((day_of_week) => ({
        day_of_week,
        start_time: "09:00",
        end_time: "12:00",
      }));
      const suggest = (token, date) =>
        request(app).get(`/api/availability/reschedule-suggestions?date=${date}`).set("Authorization", `Bearer ${token}`);
      const suggestedStart = (body, sessionId) =>
        DateTime.fromISO(body.sessions.find((session) => session.id === sessionId).suggested.start)
          .setZone("Asia/Kolkata")
          .toISO({ suppressMilliseconds: true });

      test("suggests the same local time on the next day with room", async () => {
        const { user: professional, token } = addUser("professional");
        const { user: member } = addUser("member");
        await request(app).put("/api/availability").set("Authorization", `Bearer ${token}`).send({ rules: everyDay });
        const day = localDay(3);
        const booking = bookSessionOn(professional, member, at(day, "09:00"));

        const response = await suggest(token, day);

        expect(response.status).toBe(200);
        expect(response.body.sessions).toEqual([
          expect.objectContaining({ id: booking.id, suggested: expect.any(Object) }),
        ]);
        expect(suggestedStart(response.body, booking.id)).toBe(at(localDay(4), "09:00"));
      });

      test("skips later days that are blocked", async () => {
        const { user: professional, token } = addUser("professional");
        const { user: member } = addUser("member");
        await request(app).put("/api/availability").set("Authorization", `Bearer ${token}`).send({ rules: everyDay });
        await block(token, { date: localDay(4) });
        const day = localDay(3);
        const booking = bookSessionOn(professional, member, at(day, "09:00"));

        const response = await suggest(token, day);

        expect(suggestedStart(response.body, booking.id)).toBe(at(localDay(5), "09:00"));
      });

      test("avoids a slot the member already has with another professional", async () => {
        const { user: professional, token } = addUser("professional");
        const { user: other } = addUser("professional");
        const { user: member } = addUser("member");
        await request(app).put("/api/availability").set("Authorization", `Bearer ${token}`).send({ rules: everyDay });
        const day = localDay(3);
        const booking = bookSessionOn(professional, member, at(day, "09:00"));
        bookSessionOn(other, member, at(localDay(4), "09:00"));

        const response = await suggest(token, day);

        expect(suggestedStart(response.body, booking.id)).toBe(at(localDay(5), "09:00"));
      });

      test("never suggests the same slot for two sessions", async () => {
        const { user: professional, token } = addUser("professional");
        const { user: first } = addUser("member");
        const { user: second } = addUser("member");
        await request(app).put("/api/availability").set("Authorization", `Bearer ${token}`).send({ rules: everyDay });
        const day = localDay(3);
        const a = bookSessionOn(professional, first, at(day, "09:00"));
        const b = bookSessionOn(professional, second, at(day, "10:00"));

        const response = await suggest(token, day);

        expect(suggestedStart(response.body, a.id)).toBe(at(localDay(4), "09:00"));
        expect(suggestedStart(response.body, b.id)).toBe(at(localDay(4), "09:50"));
      });

      test("returns a null suggestion when no open slot exists", async () => {
        const { user: professional, token } = addUser("professional");
        const { user: member } = addUser("member");
        const day = localDay(3);
        const booking = bookSessionOn(professional, member, at(day, "09:00"));

        const response = await suggest(token, day);

        expect(response.body.sessions).toEqual([expect.objectContaining({ id: booking.id, suggested: null })]);
      });

      test("returns 400 for an invalid date", async () => {
        const { token } = addUser("professional");

        const response = await suggest(token, "2026-02-30");

        expect(response.status).toBe(400);
      });
    });
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

  test("skips sessions that start sooner than the minimum booking notice", () => {
    const now = DateTime.fromISO("2026-03-01T10:00:00Z");
    const slots = generateOpenSlots({
      rules: [rule(0, "00:00", "24:00")],
      timezone: "UTC",
      now,
      horizonEnd: now.plus({ days: 1 }),
      minNoticeHours: 2,
    });

    // The 50-minute grid from midnight has no slot at 11:40 (starts too soon) and the first is at 12:30.
    expect(slots.every((slot) => slot.start >= now.plus({ hours: 2 }))).toBe(true);
    expect(slots[0].start.toUTC().toISO()).toBe("2026-03-01T12:30:00.000Z");
  });

  test("skips every session on a blocked date in the professional's timezone, not UTC", () => {
    // 00:30 IST on 1 Mar is still 28 Feb in UTC, so the blocked date must be matched in the professional's zone.
    const now = DateTime.fromISO("2026-02-28T00:00:00Z");
    const slots = generateOpenSlots({
      rules: [rule(0, "00:30", "02:00")],
      timezone: "Asia/Kolkata",
      now,
      horizonEnd: now.plus({ days: 14 }),
      blockedDates: ["2026-03-01"],
    });

    const localDates = slots.map((slot) => slot.start.setZone("Asia/Kolkata").toISODate());
    expect(localDates).not.toContain("2026-03-01");
    expect(localDates).toContain("2026-03-08");
  });
});

