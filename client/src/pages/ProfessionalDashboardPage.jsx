import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import EditCalendarOutlinedIcon from "@mui/icons-material/EditCalendarOutlined";
import FullCalendar from "@fullcalendar/react";
import CalendarShell from "../components/CalendarShell.jsx";
import timeGridPlugin from "@fullcalendar/timegrid";
import { fetchAvailability } from "../api/availability.js";
import {
  cancelProfessionalBooking,
  fetchProfessionalBookings,
  rescheduleProfessionalBooking,
} from "../api/bookings.js";
import { formatSessionDate, formatSessionTime } from "../lib/schedule.js";

function WelcomeCard({ user, onSetAvailability }) {
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <Card>
      <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "64px minmax(0, 1fr) auto" },
            alignItems: "center",
            gap: 3,
          }}
        >
          <Box
            sx={{
              display: "grid",
              placeItems: "center",
              width: 64,
              height: 64,
              borderRadius: "50%",
              bgcolor: "var(--color-primary-tint)",
              color: "var(--color-primary-deep)",
            }}
          >
            <EditCalendarOutlinedIcon sx={{ fontSize: 32 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="h2" sx={{ color: "var(--color-primary-ink)", fontWeight: 600 }}>
              Welcome to Thoughtfull-THT, {firstName}!
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Set your weekly availability so members can see when you're free and book sessions
              with you. You can change it at any time.
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            onClick={onSetAvailability}
            sx={{
              whiteSpace: "nowrap",
              px: 2,
              bgcolor: "var(--color-primary-deep)",
              "&:hover": { bgcolor: "var(--color-primary-deep-hover)" },
            }}
          >
            Set your availability
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

// The server returns times in the professional's zone. Dropping the offset makes FullCalendar
// show that wall-clock time, whatever zone the browser is in.
function toWallClock(iso) {
  return iso.slice(0, 19);
}

// Parses "HH:mm" (or "24:00") into minutes after midnight.
function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function toWallClockFromMinutes(date, minutes) {
  if (minutes < 24 * 60) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return `${date}T${hh}:${mm}:00`;
  }
  const nextDay = new Date(`${date}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return `${nextDay.toISOString().slice(0, 10)}T00:00:00`;
}

// Blocked dates are shown over the professional's availability hours, but only in the gaps
// between kept sessions, so the chip never sits on top of a session.
function toBlockedEvents(blockedDates, rules, slots) {
  const booked = slots.filter((slot) => slot.member !== null);
  return blockedDates.flatMap((date) => {
    const weekday = new Date(`${date}T00:00:00`).getDay();
    const dayBooked = booked
      .filter((slot) => slot.start.slice(0, 10) <= date && slot.end.slice(0, 10) >= date)
      .map((slot) => {
        const startsToday = slot.start.slice(0, 10) === date;
        const endsToday = slot.end.slice(0, 10) === date;
        const start = startsToday ? toMinutes(slot.start.slice(11, 16)) : 0;
        const end = endsToday ? toMinutes(slot.end.slice(11, 16)) : 24 * 60;
        return { start, end };
      })
      .filter((interval) => interval.end > interval.start)
      .sort((a, b) => a.start - b.start);

    return rules
      .filter((rule) => rule.day_of_week === weekday)
      .flatMap((rule) => {
        const windowStart = toMinutes(rule.start_time);
        const windowEnd = toMinutes(rule.end_time);
        const gaps = [];
        let cursor = windowStart;
        for (const interval of dayBooked) {
          if (interval.end <= cursor || interval.start >= windowEnd) continue;
          if (interval.start > cursor) gaps.push([cursor, Math.min(interval.start, windowEnd)]);
          cursor = Math.max(cursor, interval.end);
        }
        if (cursor < windowEnd) gaps.push([cursor, windowEnd]);

        return gaps.map(([start, end]) => ({
          id: `blocked-${date}-${start}`,
          title: "Blocked",
          start: toWallClockFromMinutes(date, start),
          end: toWallClockFromMinutes(date, end),
          displayEventTime: false,
          classNames: ["session-blocked"],
        }));
      });
  });
}

function toCalendarEvents(slots, blockedDates, rules) {
  const slotEvents = slots.map((slot) => {
    const open = slot.member === null;
    return {
      id: slot.start,
      title: open ? "Open" : slot.member.name,
      start: toWallClock(slot.start),
      end: toWallClock(slot.end),
      classNames: [open ? "session-open" : "session-booked"],
    };
  });
  return [...slotEvents, ...toBlockedEvents(blockedDates, rules, slots)];
}

function UpcomingSessionsCard({ bookings, blockedDates, rules, loadError, onEventClick, panel }) {
  let body;
  if (loadError) {
    body = <Alert severity="error">{loadError}</Alert>;
  } else if (!bookings) {
    body = <Skeleton variant="rounded" height={480} aria-busy="true" />;
  } else {
    body = (
      <div className="session-calendar">
        <CalendarShell>
        <FullCalendar
          plugins={[timeGridPlugin]}
          initialView="timeGridWeek"
          buttonText={{ today: "Today", week: "Week", day: "Day" }}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridWeek,timeGridDay",
          }}
          allDaySlot={false}
          scrollTime="08:00:00"
          nowIndicator
          height="auto"
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
          events={toCalendarEvents(bookings.slots, blockedDates, rules)}
          eventClick={onEventClick}
        />
        </CalendarShell>
      </div>
    );
  }

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" component="h2">
          Upcoming sessions
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Next 4 weeks · Times are in {bookings?.timezone ?? "your timezone"}
        </Typography>
        <Box sx={{ mt: 3 }}>{body}</Box>
        {panel}
      </CardContent>
    </Card>
  );
}

// Cancel or reschedule for the booked session the professional clicked on. Rescheduling only picks an open slot,
// and the server moves the session in one step, so the member never loses their session without a new time.
function SessionActions({ timezone, rescheduling, newSlot, error, working, handlers }) {
  const rangeOf = (slot) =>
    `${formatSessionDate(slot.start, timezone)}, ${formatSessionTime(slot.start, timezone)} – ${formatSessionTime(slot.end, timezone)}`;

  if (rescheduling) {
    return (
      <Box
        sx={{
          position: "sticky",
          bottom: 0,
          zIndex: 1,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          py: 1.5,
          bgcolor: "background.paper",
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        {error && (
          <Alert severity="error" sx={{ width: "100%" }}>
            {error}
          </Alert>
        )}
        <Box>
          <Typography>
            Rescheduling with <strong>{rescheduling.member.name}</strong>, currently {rangeOf(rescheduling)}. Click an
            open session on the calendar for the new time.
          </Typography>
          {newSlot && (
            <Typography color="text.secondary">
              New time: <strong>{rangeOf(newSlot)}</strong>
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button onClick={handlers.onStopRescheduling} disabled={working}>
            Stop
          </Button>
          <Button variant="contained" onClick={handlers.onConfirmReschedule} disabled={!newSlot || working}>
            {working ? "Rescheduling…" : "Confirm reschedule"}
          </Button>
        </Stack>
      </Box>
    );
  }

  return null;
}

// Opens when a booked session is clicked, mirroring the member's confirm-booking dialog.
function SessionDialog({ timezone, session, error, working, handlers }) {
  return (
    <Dialog open={Boolean(session)} onClose={() => !working && handlers.onClose()} aria-labelledby="session-dialog-title">
      <DialogTitle id="session-dialog-title">Booked session</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>
            Session with <strong>{session?.member.name}</strong>
          </Typography>
          <Typography>
            <strong>
              {session &&
                `${formatSessionDate(session.start, timezone)}, ${formatSessionTime(session.start, timezone)} – ${formatSessionTime(session.end, timezone)}`}
            </strong>
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handlers.onClose} disabled={working}>
          Close
        </Button>
        <Button variant="outlined" onClick={handlers.onStartReschedule} disabled={working}>
          Reschedule
        </Button>
        <Button color="error" variant="outlined" onClick={handlers.onCancelSession} disabled={working}>
          {working ? "Cancelling…" : "Cancel session"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}


export default function ProfessionalDashboardPage({ token, user, onEditAvailability }) {
  const [schedule, setSchedule] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [bookings, setBookings] = useState(null);
  const [bookingsError, setBookingsError] = useState("");
  const [selectedStart, setSelectedStart] = useState(null);
  const [rescheduling, setRescheduling] = useState(null);
  const [newStart, setNewStart] = useState(null);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetchAvailability(token)
      .then((data) => active && setSchedule(data))
      .catch((error) => active && setLoadError(error.message));
    fetchProfessionalBookings(token)
      .then((data) => active && setBookings(data))
      .catch((error) => active && setBookingsError(error.message));
    return () => {
      active = false;
    };
  }, [token]);

  const refreshBookings = () =>
    fetchProfessionalBookings(token)
      .then((data) => setBookings(data))
      .catch((error) => setBookingsError(error.message));

  const timezone = bookings?.timezone;
  const findSlot = (start) => bookings?.slots.find((slot) => slot.start === start) ?? null;
  const session = selectedStart ? findSlot(selectedStart) : null;

  const handleEventClick = (info) => {
    const slot = findSlot(info.event.id);
    if (!slot) return;
    setActionError("");
    setNotice("");
    if (rescheduling) {
      if (slot.member) {
        setActionError("Pick an open session for the new time.");
        return;
      }
      setNewStart(slot);
      return;
    }
    setSelectedStart(slot.member ? slot.start : null);
  };

  const startReschedule = () => {
    setActionError("");
    setNotice("");
    setRescheduling(session);
    setNewStart(null);
    setSelectedStart(null);
  };

  const stopRescheduling = () => {
    setRescheduling(null);
    setNewStart(null);
    setActionError("");
  };

  const closeSession = () => {
    setSelectedStart(null);
    setActionError("");
  };

  const confirmReschedule = async () => {
    setWorking(true);
    setActionError("");
    try {
      await rescheduleProfessionalBooking(token, rescheduling.id, newStart.start);
      setNotice(`Session with ${rescheduling.member.name} moved to the new time.`);
      setRescheduling(null);
      setNewStart(null);
      await refreshBookings();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setWorking(false);
    }
  };

  const cancelSession = async () => {
    setWorking(true);
    setActionError("");
    try {
      await cancelProfessionalBooking(token, session.id);
      setNotice(`Session with ${session.member.name} cancelled.`);
      setSelectedStart(null);
      await refreshBookings();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setWorking(false);
    }
  };

  let content = null;
  if (loadError) {
    content = <Alert severity="error">{loadError}</Alert>;
  } else if (schedule && schedule.rules.length === 0) {
    content = <WelcomeCard user={user} onSetAvailability={onEditAvailability} />;
  }

  const panel = (
    <Stack spacing={2} sx={{ mt: 3 }}>
      {notice && (
        <Alert severity="success" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      {actionError && !session && !rescheduling && <Alert severity="error">{actionError}</Alert>}
    </Stack>
  );

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1">
          Dashboard
        </Typography>
        <Typography color="text.secondary">Signed in as {user.name}</Typography>
      </Box>
      {content}
      {(schedule ? schedule.rules.length > 0 : !loadError) && (
        <UpcomingSessionsCard
          bookings={bookings}
          blockedDates={schedule?.blocked_dates ?? []}
          rules={schedule?.rules ?? []}
          loadError={bookingsError}
          onEventClick={handleEventClick}
          panel={panel}
        />
      )}
      <SessionActions
        timezone={timezone}
        rescheduling={rescheduling}
        newSlot={newStart}
        error={actionError}
        working={working}
        handlers={{
          onStopRescheduling: stopRescheduling,
          onConfirmReschedule: confirmReschedule,
        }}
      />
      <SessionDialog
        timezone={timezone}
        session={session}
        error={actionError}
        working={working}
        handlers={{
          onClose: closeSession,
          onStartReschedule: startReschedule,
          onCancelSession: cancelSession,
        }}
      />
    </Stack>
  );
}
