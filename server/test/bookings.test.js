import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { addUser, app, availabilityRows, bookingRows, request, resetTestState } from "./helpers/availability-test-setup.js";

beforeEach(resetTestState);

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
    const bookedId = randomUUID();
    bookingRows.push({
      id: bookedId,
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
      id: bookedId,
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

describe("professional cancel and reschedule", () => {
  const sessionIn = (member, professional, hoursFromNow) => {
    const start = DateTime.utc().plus({ hours: hoursFromNow }).startOf("hour");
    return {
      id: randomUUID(),
      professional_id: professional.id,
      member_id: member.id,
      starts_at: start.toISO(),
      ends_at: start.plus({ minutes: 50 }).toISO(),
    };
  };

  function setup(hoursFromNow = 2) {
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
    const session = sessionIn(member, professional, hoursFromNow);
    bookingRows.push(session);
    return { token, professional, member, session };
  }

  test("cancels a session that starts within 24 hours", async () => {
    const { token, session } = setup(2);

    const response = await request(app)
      .delete(`/api/professional-bookings/${session.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);
    expect(bookingRows).toHaveLength(0);
  });

  test("returns 404 and keeps the session when another professional tries to cancel it", async () => {
    const { session } = setup(2);
    const { token: otherToken } = addUser("professional", "Europe/London");

    const response = await request(app)
      .delete(`/api/professional-bookings/${session.id}`)
      .set("Authorization", `Bearer ${otherToken}`);

    expect(response.status).toBe(404);
    expect(bookingRows).toHaveLength(1);
  });

  test("moves a session that starts within 24 hours to an open slot, keeping the same session", async () => {
    const { token, professional, session } = setup(2);
    const calendar = await request(app).get("/api/professional-bookings").set("Authorization", `Bearer ${token}`);
    const target = calendar.body.slots.find((slot) => slot.member === null);
    expect(calendar.body.slots.find((slot) => slot.id === session.id)).toMatchObject({ member: expect.any(Object) });

    const response = await request(app)
      .post(`/api/professional-bookings/${session.id}/reschedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({ starts_at: target.start });

    expect(response.status).toBe(200);
    expect(response.body.booking.start).toBe(target.start);
    expect(bookingRows).toHaveLength(1);
    expect(bookingRows[0]).toMatchObject({ id: session.id, professional_id: professional.id });
    expect(DateTime.fromISO(bookingRows[0].starts_at).toMillis()).toBe(DateTime.fromISO(target.start).toMillis());
  });

  test("refuses a new time the member already has with another professional and leaves the session unchanged", async () => {
    const { token, member, session } = setup(2);
    const calendar = await request(app).get("/api/professional-bookings").set("Authorization", `Bearer ${token}`);
    const target = calendar.body.slots.find((slot) => slot.member === null);
    const start = DateTime.fromISO(target.start).toUTC();
    bookingRows.push({
      id: randomUUID(),
      professional_id: randomUUID(),
      member_id: member.id,
      starts_at: start.toISO(),
      ends_at: start.plus({ minutes: 50 }).toISO(),
    });
    const originalStart = session.starts_at;

    const response = await request(app)
      .post(`/api/professional-bookings/${session.id}/reschedule`)
      .set("Authorization", `Bearer ${token}`)
      .send({ starts_at: target.start });

    expect(response.status).toBe(409);
    expect(bookingRows.find((row) => row.id === session.id).starts_at).toBe(originalStart);
  });
});

