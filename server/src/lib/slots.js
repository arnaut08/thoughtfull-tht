import { DateTime } from "luxon";
import { toMinutes } from "./availability.js";

export const SESSION_MINUTES = 50;
export const SLOT_HORIZON_DAYS = 28;

const MINUTES_PER_DAY = 24 * 60;

// The instant of `minutes` past local midnight on `day`, in `zone`. 1440 is the next midnight.
function localInstant(day, minutes, zone) {
  if (minutes === MINUTES_PER_DAY) {
    return day.plus({ days: 1 }).startOf("day");
  }
  return DateTime.fromObject(
    {
      year: day.year,
      month: day.month,
      day: day.day,
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    },
    { zone },
  );
}

// Expands a professional's weekly local-time windows into back-to-back sessions within
// [now, horizonEnd), skipping any session that overlaps a booking.
// rules: [{ day_of_week, start_time, end_time }] in HH:mm; booked: [{ start, end }] as DateTimes.
// blockedDates: YYYY-MM-DD dates in the professional's timezone that have no slots at all.
// minNoticeHours: a session must start at least this many hours after now.
export function generateOpenSlots({
  rules,
  timezone,
  now,
  horizonEnd,
  booked = [],
  blockedDates = [],
  minNoticeHours = 0,
}) {
  const sessionLength = { minutes: SESSION_MINUTES };
  const earliestStart = now.plus({ hours: minNoticeHours });
  const blocked = new Set(blockedDates);
  const firstDay = now.setZone(timezone).startOf("day").minus({ days: 1 });
  const lastDay = horizonEnd.setZone(timezone).startOf("day").plus({ days: 1 });
  const slots = [];

  for (let day = firstDay; day <= lastDay; day = day.plus({ days: 1 })) {
    if (blocked.has(day.toISODate())) continue;
    const weekday = day.weekday % 7; // Luxon: 1 = Monday ... 7 = Sunday. Ours: 0 = Sunday.
    const dayRules = rules.filter((rule) => rule.day_of_week === weekday);

    for (const rule of dayRules) {
      const windowStart = localInstant(day, toMinutes(rule.start_time), timezone);
      const windowEnd = localInstant(day, toMinutes(rule.end_time, { allowEndOfDay: true }), timezone);

      // Steps by absolute time so a session keeps its 50-minute length across DST changes.
      for (let start = windowStart; start.plus(sessionLength) <= windowEnd; start = start.plus(sessionLength)) {
        const end = start.plus(sessionLength);
        if (start < earliestStart || end > horizonEnd) continue;
        if (booked.some((booking) => start < booking.end && end > booking.start)) continue;
        slots.push({ start, end });
      }
    }
  }

  return slots;
}
