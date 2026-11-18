import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { fetchAvailability, saveAvailability } from "../api/availability.js";
import { DAY_NAMES } from "../lib/schedule.js";

const MIN_WINDOW_MINUTES = 50;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// Sunday 2 Jan 2000 (UTC). The calendar renders in UTC, so windows show the exact stored
// wall-clock times regardless of the browser's timezone or DST.
const REFERENCE_SUNDAY = "2000-01-02";
const REFERENCE_SUNDAY_MS = Date.UTC(2000, 0, 2);

let lastWindowId = 0;

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function toHHmm(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  return `${hours}:${String(minutes % 60).padStart(2, "0")}`;
}

// Converts a calendar start/end into a day of week and minutes from that day's midnight.
function toWindow(start, end) {
  const dayStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  return {
    day: start.getUTCDay(),
    startMin: (start.getTime() - dayStart) / MINUTE_MS,
    endMin: (end.getTime() - dayStart) / MINUTE_MS,
  };
}

function windowError({ startMin, endMin }) {
  if (endMin > 24 * 60) return "Windows can't run past midnight. Split it into two days.";
  if (endMin - startMin < MIN_WINDOW_MINUTES) {
    return `Each window must be at least ${MIN_WINDOW_MINUTES} minutes.`;
  }
  return null;
}

function makeEvent({ day, startMin, endMin }, id = `window-${++lastWindowId}`) {
  const base = REFERENCE_SUNDAY_MS + day * DAY_MS;
  return {
    id,
    title: "Available",
    start: new Date(base + startMin * MINUTE_MS),
    end: new Date(base + endMin * MINUTE_MS),
  };
}

function ruleToEvent(rule) {
  return makeEvent({
    day: rule.day_of_week,
    startMin: toMinutes(rule.start_time),
    endMin: toMinutes(rule.end_time),
  });
}

function eventToRule(event) {
  const { day, startMin, endMin } = toWindow(event.start, event.end);
  return { day_of_week: day, start_time: toHHmm(startMin), end_time: toHHmm(endMin) };
}

function sortRules(rules) {
  return [...rules].sort(
    (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
  );
}

function AvailabilityPage({ token, user, onBack }) {
  const calendarRef = useRef(null);
  const [savedRules, setSavedRules] = useState([]);
  const [events, setEvents] = useState([]);
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let active = true;
    fetchAvailability(token)
      .then((data) => {
        if (!active) return;
        setTimezone(data.timezone);
        setSavedRules(data.rules);
        setEvents(data.rules.map(ruleToEvent));
      })
      .catch((error) => active && setLoadError(error.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  const draftRules = useMemo(() => sortRules(events.map(eventToRule)), [events]);
  const isDirty = JSON.stringify(draftRules) !== JSON.stringify(sortRules(savedRules));

  function warn(text) {
    setMessage({ severity: "warning", text });
  }

  function handleSelect({ start, end }) {
    calendarRef.current?.getApi().unselect();
    const slot = toWindow(start, end);
    const error = windowError(slot);
    if (error) return warn(error);

    setMessage(null);
    setEvents((current) => [...current, makeEvent(slot)]);
  }

  function handleEventChange({ event, revert }) {
    const slot = toWindow(event.start, event.end);
    const error = windowError(slot);
    if (error) {
      revert();
      return warn(error);
    }

    setMessage(null);
    setEvents((current) =>
      current.map((existing) => (existing.id === event.id ? makeEvent(slot, event.id) : existing)),
    );
  }

  function handleEventClick({ event }) {
    setMessage(null);
    setEvents((current) => current.filter((existing) => existing.id !== event.id));
  }

  function handleDiscard() {
    setMessage(null);
    setEvents(savedRules.map(ruleToEvent));
  }

  async function handleSave() {
    const rules = draftRules;
    setSaving(true);
    setMessage(null);
    try {
      const data = await saveAvailability(token, rules);
      setSavedRules(data.rules);
      setEvents(data.rules.map(ruleToEvent));
      setMessage({ severity: "success", text: "Availability saved." });
    } catch (error) {
      const items = Object.entries(error.details).map(([key, text]) => {
        const rule = rules[Number(key.match(/\d+/)?.[0])];
        return rule
          ? `${DAY_NAMES[rule.day_of_week]} ${rule.start_time}–${rule.end_time}: ${text}`
          : text;
      });
      setMessage({ severity: "error", text: error.message, items });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Stack spacing={2} aria-busy="true" aria-live="polite">
        <Skeleton variant="rounded" width={180} height={36} sx={{ alignSelf: "flex-start" }} />
        <Box>
          <Skeleton variant="text" sx={{ fontSize: "1.5rem", width: 200 }} />
          <Skeleton variant="text" width={260} />
        </Box>
        <Card>
          <CardContent>
            <Skeleton variant="rounded" height={560} />
          </CardContent>
        </Card>
      </Stack>
    );
  }

  if (loadError) {
    return <Alert severity="error">{loadError}</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Button
        variant="outlined"
        onClick={onBack}
        sx={{
          alignSelf: "flex-start",
          color: "#13595e",
          borderColor: "#13595e",
          "&:hover": { borderColor: "#0e474b", bgcolor: "#eff7f6" },
        }}
      >
        Back to dashboard
      </Button>

      <Box>
        <Typography variant="h5" component="h1">
          Availability
        </Typography>
        <Typography color="text.secondary">
          {user.name} · Times are in {timezone}
        </Typography>
      </Box>

      <Alert severity="info">
        Drag across a day to add a window, or click a window to remove it. Windows are at least{" "}
        {MIN_WINDOW_MINUTES} minutes and can't run past midnight. Overlapping windows are merged
        when you save.
      </Alert>

      {message && (
        <Alert severity={message.severity} onClose={() => setMessage(null)}>
          {message.text}
          {message.items?.map((item) => (
            <Typography key={item} variant="body2">
              {item}
            </Typography>
          ))}
        </Alert>
      )}

      <Card>
        <CardContent>
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            initialDate={REFERENCE_SUNDAY}
            headerToolbar={false}
            timeZone="UTC"
            firstDay={0}
            dayHeaderFormat={{ weekday: "long" }}
            allDaySlot={false}
            slotDuration="00:30:00"
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            height="auto"
            selectable
            selectMirror
            editable
            events={events}
            select={handleSelect}
            eventClick={handleEventClick}
            eventDrop={handleEventChange}
            eventResize={handleEventChange}
          />
        </CardContent>
      </Card>

      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Button onClick={handleDiscard} disabled={!isDirty || saving}>
          Discard
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!isDirty || saving}>
          {saving ? "Saving…" : "Save availability"}
        </Button>
      </Stack>
    </Stack>
  );
}

export default AvailabilityPage;
