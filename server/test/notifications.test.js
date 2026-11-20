import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { addUser, app, availabilityRows, bookingRows, request, resetTestState } from "./helpers/availability-test-setup.js";

beforeEach(resetTestState);

describe("in-app notifications", () => {
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

  function setup() {
    const { user: member, token: memberToken } = addUser("member", "America/New_York");
    const { user: professional, token: professionalToken } = addUser("professional", "Asia/Kolkata");
    for (let day_of_week = 0; day_of_week < 7; day_of_week += 1) {
      availabilityRows.push({
        id: randomUUID(),
        professional_id: professional.id,
        day_of_week,
        start_time: "09:00:00",
        end_time: "12:00:00",
      });
    }
    return { member, memberToken, professional, professionalToken };
  }

  const inbox = (token) => request(app).get("/api/notifications").set("Authorization", `Bearer ${token}`);

  test("a member cancelling notifies the professional, and only the professional", async () => {
    const { member, memberToken, professional, professionalToken } = setup();
    const session = sessionIn(member, professional, 48);
    bookingRows.push(session);

    const cancelled = await request(app)
      .delete(`/api/bookings/${session.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    const professionalInbox = await inbox(professionalToken);
    const memberInbox = await inbox(memberToken);

    expect(cancelled.status).toBe(204);
    expect(professionalInbox.body.unreadCount).toBe(1);
    expect(professionalInbox.body.notifications).toEqual([
      expect.objectContaining({
        type: "session_cancelled",
        actor: { id: member.id, name: "member" },
        sessionStart: session.starts_at,
        newStart: null,
        read: false,
      }),
    ]);
    expect(memberInbox.body.notifications).toEqual([]);
  });

  test("a professional cancelling notifies the member, with no notice limit", async () => {
    const { member, memberToken, professional, professionalToken } = setup();
    const session = sessionIn(member, professional, 2);
    bookingRows.push(session);

    const cancelled = await request(app)
      .delete(`/api/professional-bookings/${session.id}`)
      .set("Authorization", `Bearer ${professionalToken}`);
    const memberInbox = await inbox(memberToken);

    expect(cancelled.status).toBe(204);
    expect(memberInbox.body.notifications).toEqual([
      expect.objectContaining({ type: "session_cancelled", actor: { id: professional.id, name: "professional" } }),
    ]);
  });

  test("a refused cancellation inside the notice window sends no notification", async () => {
    const { member, memberToken, professional, professionalToken } = setup();
    const session = sessionIn(member, professional, 5);
    bookingRows.push(session);

    const refused = await request(app)
      .delete(`/api/bookings/${session.id}`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(refused.status).toBe(409);
    expect((await inbox(professionalToken)).body.notifications).toEqual([]);
  });

  test("a member rescheduling notifies the professional with the old and new times", async () => {
    const { member, memberToken, professional, professionalToken } = setup();
    const session = sessionIn(member, professional, 72);
    const originalStart = session.starts_at;
    bookingRows.push(session);
    const profile = await request(app)
      .get(`/api/professionals/${professional.id}?reschedule=${session.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    const [target] = profile.body.slots;

    const rescheduled = await request(app)
      .post(`/api/professionals/${professional.id}/bookings/${session.id}/reschedule`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ starts_at: target.start });
    const professionalInbox = await inbox(professionalToken);

    expect(rescheduled.status).toBe(200);
    expect(professionalInbox.body.notifications).toEqual([
      expect.objectContaining({
        type: "session_rescheduled",
        actor: { id: member.id, name: "member" },
        sessionStart: originalStart,
        newStart: DateTime.fromISO(target.start).toUTC().toISO(),
      }),
    ]);
  });

  test("marking notifications read clears the unread count and keeps the notifications", async () => {
    const { member, memberToken, professional, professionalToken } = setup();
    const session = sessionIn(member, professional, 48);
    bookingRows.push(session);
    await request(app).delete(`/api/bookings/${session.id}`).set("Authorization", `Bearer ${memberToken}`);

    const marked = await request(app)
      .post("/api/notifications/read")
      .set("Authorization", `Bearer ${professionalToken}`);
    const afterwards = await inbox(professionalToken);

    expect(marked.status).toBe(204);
    expect(afterwards.body.unreadCount).toBe(0);
    expect(afterwards.body.notifications).toHaveLength(1);
    expect(afterwards.body.notifications[0].read).toBe(true);
  });
});
