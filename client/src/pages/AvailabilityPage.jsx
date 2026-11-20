import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import CalendarShell from "../components/CalendarShell.jsx";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { fetchAvailability, saveAvailability, saveBookingNotice } from "../api/availability.js";
import BackButton from "../components/BackButton.jsx";
import StickyActionBar from "../components/StickyActionBar.jsx";
import { DAY_NAMES, toHHmm, toMinutes } from "../lib/schedule.js";

const MIN_WINDOW_MINUTES = 50;
const MAX_NOTICE_HOURS = 168;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// Sunday 2 Jan 2000 (UTC). The calendar renders in UTC, so windows show the exact stored
// wall-clock times regardless of the browser's timezone or DST.
const REFERENCE_SUNDAY = "2000-01-02";
const REFERENCE_SUNDAY_MS = Date.UTC(2000, 0, 2);

let lastWindowId = 0;

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

function renderWindow({ event }) {
  const { startMin, endMin } = toWindow(event.start, event.end);
  return <span className="fc-event-title">{`${toHHmm(startMin)}–${toHHmm(endMin)}`}</span>;
}

const windowClassNames = () => ["tf-availability"];

function AvailabilityPage({ token, user, onBack }) {
  const calendarRef = useRef(null);
  const [savedRules, setSavedRules] = useState([]);
  const [events, setEvents] = useState([]);
  const [timezone, setTimezone] = useState("");
  const [savedNotice, setSavedNotice] = useState(0);
  const [noticeDraft, setNoticeDraft] = useState("0");
  const [savingNotice, setSavingNotice] = useState(false);
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
        setSavedNotice(data.min_booking_notice_hours);
        setNoticeDraft(String(data.min_booking_notice_hours));
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

  const noticeHours = Number(noticeDraft);
  const isNoticeValid =
    noticeDraft !== "" && Number.isInteger(noticeHours) && noticeHours >= 0 && noticeHours <= MAX_NOTICE_HOURS;
  const isNoticeDirty = isNoticeValid && noticeHours !== savedNotice;

  async function handleSaveNotice() {
    setSavingNotice(true);
    setMessage(null);
    try {
      const data = await saveBookingNotice(token, noticeHours);
      setSavedNotice(data.min_booking_notice_hours);
      setNoticeDraft(String(data.min_booking_notice_hours));
      setMessage({ severity: "success", text: "Booking notice saved." });
    } catch (error) {
      setMessage({ severity: "error", text: error.message });
    } finally {
      setSavingNotice(false);
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
      <BackButton onClick={onBack}>Back to profile</BackButton>

      <Box>
        <Typography variant="h5" component="h1">
          Availability
        </Typography>
      </Box>

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
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
          >
            <Box>
              <Typography variant="subtitle1" component="h2" fontWeight={600}>
                Minimum booking notice
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Members must book at least this many hours ahead. 0 means no minimum.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexShrink: 0 }}>
              <TextField
                size="small"
                type="number"
                value={noticeDraft}
                onChange={(event) => setNoticeDraft(event.target.value)}
                error={noticeDraft !== "" && !isNoticeValid}
                slotProps={{
                  htmlInput: { "aria-label": "Minimum booking notice in hours", min: 0, max: MAX_NOTICE_HOURS, step: 1 },
                  input: { endAdornment: <InputAdornment position="end">hours</InputAdornment> },
                }}
                sx={{ width: 150 }}
              />
              <Button
                variant="contained"
                onClick={handleSaveNotice}
                disabled={!isNoticeDirty || savingNotice}
                sx={{ height: 40, minWidth: 120 }}
              >
                {savingNotice ? "Saving…" : "Save notice"}
              </Button>
            </Stack>
          </Stack>
          {noticeDraft !== "" && !isNoticeValid && (
            <Typography variant="caption" color="error" component="p" sx={{ mt: 1 }}>
              Enter a whole number of hours from 0 to {MAX_NOTICE_HOURS}.
            </Typography>
          )}
        </CardContent>
      </Card>

      <Alert severity="info">
        Weekly hours in {timezone}, repeating every week. Existing booked sessions are not affected.
        Drag across a day to add a window, and click a window to remove it. Windows must be at least{" "}
        {MIN_WINDOW_MINUTES} minutes, can't cross midnight, and overlaps merge on save.
      </Alert>

      <Card>
        <CardContent>
          <CalendarShell>
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
              eventClassNames={windowClassNames}
              eventContent={renderWindow}
              select={handleSelect}
              eventClick={handleEventClick}
              eventDrop={handleEventChange}
              eventResize={handleEventChange}
            />
          </CalendarShell>
        </CardContent>
      </Card>

      <StickyActionBar>
        {isDirty && <Chip size="small" color="warning" variant="outlined" label="Unsaved changes" />}
        <Button onClick={handleDiscard} disabled={!isDirty || saving}>
          Reset
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!isDirty || saving}>
          {saving ? "Saving…" : "Save availability"}
        </Button>
      </StickyActionBar>
    </Stack>
  );
}

export default AvailabilityPage;
