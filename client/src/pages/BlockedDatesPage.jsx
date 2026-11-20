import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import CalendarShell from "../components/CalendarShell.jsx";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Alert, Box, Card, CardContent, Skeleton, Stack, Typography } from "@mui/material";
import { blockDate, fetchAvailability, unblockDate } from "../api/availability.js";
import BackButton from "../components/BackButton.jsx";
import SessionConflictDialog from "../components/SessionConflictDialog.jsx";

function BlockedDatesPage({ token, user, onBack }) {
  const [blockedDates, setBlockedDates] = useState([]);
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState(null);
  const [conflict, setConflict] = useState(null);

  useEffect(() => {
    let active = true;
    fetchAvailability(token)
      .then((data) => {
        if (!active) return;
        setTimezone(data.timezone);
        setBlockedDates(data.blocked_dates);
      })
      .catch((error) => active && setLoadError(error.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  const blockedSet = useMemo(() => new Set(blockedDates), [blockedDates]);

  // Each blocked date gets a shaded background and a label. Dates are YYYY-MM-DD, so the calendar renders them in UTC to match.
  const blockedEvents = useMemo(
    () =>
      blockedDates.flatMap((date) => [
        { start: date, allDay: true, display: "background", color: "var(--color-neutral-soft)" },
        { start: date, allDay: true, title: "Blocked", color: "var(--color-neutral-strong)", textColor: "var(--color-on-primary)" },
      ]),
    [blockedDates],
  );

  async function handleDayClick({ dateStr }) {
    if (updating) return;
    setUpdating(true);
    setMessage(null);
    try {
      const data = blockedSet.has(dateStr)
        ? await unblockDate(token, dateStr)
        : await blockDate(token, dateStr);
      setBlockedDates(data.blocked_dates);
    } catch (error) {
      if (error.details?.sessions) {
        setConflict({ date: dateStr, sessions: error.details.sessions });
      } else {
        setMessage({ severity: "error", text: error.message });
      }
    } finally {
      setUpdating(false);
    }
  }

  function handleBlocked(dates) {
    setBlockedDates(dates);
    setConflict(null);
  }

  if (loading) {
    return (
      <Stack spacing={2} aria-busy="true" aria-live="polite">
        <Skeleton variant="rounded" width={180} height={36} sx={{ alignSelf: "flex-start" }} />
        <Skeleton variant="text" sx={{ fontSize: "1.5rem", width: 200 }} />
        <Card>
          <CardContent>
            <Skeleton variant="rounded" height={480} />
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
          Blocked dates
        </Typography>
        <Typography color="text.secondary">
          {user.name} · Dates are in {timezone}
        </Typography>
      </Box>

      <Alert severity="info">
        Click a day to block it, or click a blocked day to unblock it. A blocked day has no open
        slots. If a day already has booked sessions, you'll choose whether to keep them, cancel them,
        or reschedule them before the day is blocked.
      </Alert>

      {message && (
        <Alert severity={message.severity} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {conflict && (
        <SessionConflictDialog
          key={conflict.date}
          token={token}
          timezone={timezone}
          date={conflict.date}
          sessions={conflict.sessions}
          onBlocked={handleBlocked}
          onClose={() => setConflict(null)}
        />
      )}

      <Card>
        <CardContent>
          <CalendarShell className="session-calendar">
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
              timeZone="UTC"
              firstDay={0}
              height="auto"
              events={blockedEvents}
              dateClick={handleDayClick}
              eventClick={({ event }) => handleDayClick({ dateStr: event.startStr })}
            />
          </CalendarShell>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default BlockedDatesPage;
