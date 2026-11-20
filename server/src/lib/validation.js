import { DateTime } from "luxon";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value) {
  return UUID_PATTERN.test(value);
}

// Returns a valid DateTime for an ISO timestamp string, or null.
export function parseIsoDateTime(value) {
  if (typeof value !== "string") return null;
  const parsed = DateTime.fromISO(value);
  return parsed.isValid ? parsed : null;
}

// Returns the YYYY-MM-DD string for a real calendar date, or null.
export function parseCalendarDate(value) {
  if (typeof value !== "string" || !CALENDAR_DATE_PATTERN.test(value)) return null;
  const date = DateTime.fromISO(value);
  return date.isValid && date.toISODate() === value ? value : null;
}
