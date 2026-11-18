import { DateTime } from "luxon";

// Members can cancel or reschedule a session only if it starts more than this many hours from now.
export const CANCELLATION_NOTICE_HOURS = 24;

export function noticeCutoff(now) {
  return now.plus({ hours: CANCELLATION_NOTICE_HOURS });
}

export function isBeyondNotice(startsAt, now) {
  return DateTime.isDateTime(startsAt) && startsAt > noticeCutoff(now);
}

export function noticeClosedMessage(action) {
  return `Sessions can only be ${action} more than ${CANCELLATION_NOTICE_HOURS} hours before they start`;
}
