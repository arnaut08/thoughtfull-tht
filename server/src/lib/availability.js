export const MIN_WINDOW_MINUTES = 50;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

// end_time may be "24:00" so a window can run to the end of the day.
function toMinutes(time, { allowEndOfDay = false } = {}) {
  if (typeof time !== "string") return null;
  if (allowEndOfDay && time === "24:00") return 24 * 60;
  const match = TIME_PATTERN.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function toHHmm(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");
  return `${hours}:${mins}`;
}

// Validates local-time windows, then merges overlapping and adjacent windows per day.
// Returns { rules } sorted by day and start time, or { errors } keyed by rules[index].
export function normalizeRules(input) {
  if (!Array.isArray(input)) {
    return { errors: { rules: "rules must be an array" } };
  }

  const errors = {};
  const windowsByDay = Array.from({ length: 7 }, () => []);

  input.forEach((rule, index) => {
    const key = `rules[${index}]`;
    const day = rule?.day_of_week;
    const start = toMinutes(rule?.start_time);
    const end = toMinutes(rule?.end_time, { allowEndOfDay: true });

    if (!Number.isInteger(day) || day < 0 || day > 6) {
      errors[key] = "day_of_week must be an integer from 0 (Sunday) to 6 (Saturday)";
    } else if (start === null || end === null) {
      errors[key] = "start_time and end_time must be HH:mm";
    } else if (end <= start) {
      errors[key] = "end_time must be after start_time; split overnight windows into two days";
    } else if (end - start < MIN_WINDOW_MINUTES) {
      errors[key] = `Each window must be at least ${MIN_WINDOW_MINUTES} minutes`;
    } else {
      windowsByDay[day].push({ start, end });
    }
  });

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const rules = [];
  windowsByDay.forEach((windows, day) => {
    windows.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const window of windows) {
      const last = merged.at(-1);
      if (last && window.start <= last.end) {
        last.end = Math.max(last.end, window.end);
      } else {
        merged.push({ ...window });
      }
    }
    for (const window of merged) {
      rules.push({
        day_of_week: day,
        start_time: toHHmm(window.start),
        end_time: toHHmm(window.end),
      });
    }
  });

  return { rules };
}

// Converts a stored row (Postgres returns time as HH:mm:ss) to the API shape.
export function toApiRule(row) {
  return {
    day_of_week: row.day_of_week,
    start_time: row.start_time.slice(0, 5),
    end_time: row.end_time.slice(0, 5),
  };
}
