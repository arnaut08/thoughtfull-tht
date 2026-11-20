import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import {
  addUser,
  app,
  availabilityRows,
  bookingRejection,
  bookingRows,
  blockedDateRows,
  request,
  resetTestState,
} from "./helpers/availability-test-setup.js";

beforeEach(resetTestState);

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

  test("offers no slots on a date the professional has blocked", async () => {
    const { token } = addUser("member", "America/New_York");
    const { user: professional } = addUser("professional", "Asia/Kolkata");
    scheduleEveryDay(professional.id);
    const blocked = DateTime.now().setZone("Asia/Kolkata").plus({ days: 2 }).toISODate();
    blockedDateRows.push({ id: randomUUID(), professional_id: professional.id, blocked_date: blocked });

    const response = await request(app)
      .get(`/api/professionals/${professional.id}`)
      .set("Authorization", `Bearer ${token}`);

    const localDates = response.body.slots.map((slot) => DateTime.fromISO(slot.start).setZone("Asia/Kolkata").toISODate());
    expect(response.status).toBe(200);
    expect(localDates).not.toContain(blocked);
    expect(localDates).toContain(DateTime.fromISO(blocked).plus({ days: 1 }).toISODate());
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

    test("rejects a slot that starts sooner than the professional's minimum booking notice", async () => {
      const { token } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      const [slot] = (await request(app).get(`/api/professionals/${professional.id}`).set("Authorization", `Bearer ${token}`)).body.slots;
      const hoursUntilSlot = DateTime.fromISO(slot.start).diffNow("hours").hours;
      professional.min_booking_notice_hours = Math.ceil(hoursUntilSlot) + 1;

      const response = await bookingRequest(token, professional.id, { starts_at: slot.start });

      expect(response.status).toBe(409);
      expect(bookingRows).toHaveLength(0);
    });

    test("offers only slots that start after the minimum booking notice", async () => {
      const { token } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      professional.min_booking_notice_hours = 6;

      const profile = await request(app)
        .get(`/api/professionals/${professional.id}`)
        .set("Authorization", `Bearer ${token}`);

      const earliest = DateTime.utc().plus({ hours: 6 });
      expect(profile.body.min_booking_notice_hours).toBe(6);
      expect(profile.body.slots.length).toBeGreaterThan(0);
      expect(profile.body.slots.every((slot) => DateTime.fromISO(slot.start) >= earliest)).toBe(true);
    });

    test("returns 409 with a member conflict message when the database rejects an overlapping member booking", async () => {
      const { token } = addUser("member", "America/New_York");
      const { user: professional } = addUser("professional", "Asia/Kolkata");
      scheduleEveryDay(professional.id);
      const profile = await request(app)
        .get(`/api/professionals/${professional.id}`)
        .set("Authorization", `Bearer ${token}`);
      const [slot] = profile.body.slots;
      bookingRejection.enabled = true;
      bookingRejection.error = "member_conflict";

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
      bookingRejection.enabled = true;

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

