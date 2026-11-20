export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function formatSessionDate(iso, timezone) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });
}

export function formatSessionTime(iso, timezone) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
}

export function formatSessionDateTime(iso, timezone) {
  return `${formatSessionDate(iso, timezone)} at ${formatSessionTime(iso, timezone)}`;
}

export function formatSessionTimeRange(start, end, timezone) {
  return `${formatSessionTime(start, timezone)} – ${formatSessionTime(end, timezone)}`;
}

export function formatSessionRange(start, end, timezone) {
  return `${formatSessionDate(start, timezone)}, ${formatSessionTimeRange(start, end, timezone)}`;
}

export function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function toHHmm(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  return `${hours}:${String(minutes % 60).padStart(2, "0")}`;
}

// FullCalendar renders in UTC, so each instant is shifted to the wall-clock time it shows in the given zone.
export function toWallClockDate(instant, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute));
}

// Formats an ISO instant as a readable date and time range in the given zone.
export function formatSlotRange(start, end, timezone) {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const startDate = new Date(start);
  return `${date.format(startDate)}, ${time.format(startDate)} – ${time.format(new Date(end))}`;
}
