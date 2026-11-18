import { useEffect, useState } from "react";
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
import EditCalendarOutlinedIcon from "@mui/icons-material/EditCalendarOutlined";
import FullCalendar from "@fullcalendar/react";
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
              bgcolor: "#eff7f6",
              color: "#13595e",
            }}
          >
            <EditCalendarOutlinedIcon sx={{ fontSize: 32 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="h2" sx={{ color: "#0b3538", fontWeight: 600 }}>
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
              bgcolor: "#13595e",
              "&:hover": { bgcolor: "#0e474b" },
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

function toCalendarEvents(slots) {
  return slots.map((slot) => {
    const open = slot.member === null;
    return {
      id: slot.start,
      title: open ? "Open" : slot.member.name,
      start: toWallClock(slot.start),
      end: toWallClock(slot.end),
      classNames: [open ? "session-open" : "session-booked"],
    };
  });
}

function UpcomingSessionsCard({ bookings, loadError, onEventClick, panel }) {
  let body;
  if (loadError) {
    body = <Alert severity="error">{loadError}</Alert>;
  } else if (!bookings) {
    body = <Skeleton variant="rounded" height={480} aria-busy="true" />;
  } else {
    body = (
      <div className="session-calendar">
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
          events={toCalendarEvents(bookings.slots)}
          eventClick={onEventClick}
        />
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
function SessionActions({ timezone, session, rescheduling, newSlot, working, handlers }) {
  const rangeOf = (slot) =>
    `${formatSessionDate(slot.start, timezone)}, ${formatSessionTime(slot.start, timezone)} – ${formatSessionTime(slot.end, timezone)}`;

  if (rescheduling) {
    return (
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Alert severity="info">
              Rescheduling your session with <strong>{rescheduling.member.name}</strong>, currently{" "}
              {rangeOf(rescheduling)}. Click an open session on the calendar for the new time.
            </Alert>
            {newSlot && (
              <Typography>
                New time: <strong>{rangeOf(newSlot)}</strong>
              </Typography>
            )}
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handlers.onConfirmReschedule} disabled={!newSlot || working}>
                {working ? "Rescheduling…" : "Confirm reschedule"}
              </Button>
              <Button onClick={handlers.onStopRescheduling} disabled={working}>
                Stop
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  if (session) {
    return (
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography>
              Session with <strong>{session.member.name}</strong> · {rangeOf(session)}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={handlers.onStartReschedule} disabled={working}>
                Reschedule
              </Button>
              <Button color="error" variant="outlined" onClick={handlers.onCancelSession} disabled={working}>
                {working ? "Cancelling…" : "Cancel session"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return null;
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
      {actionError && <Alert severity="error">{actionError}</Alert>}
      <SessionActions
        timezone={timezone}
        session={session}
        rescheduling={rescheduling}
        newSlot={newStart}
        working={working}
        handlers={{
          onStartReschedule: startReschedule,
          onStopRescheduling: stopRescheduling,
          onConfirmReschedule: confirmReschedule,
          onCancelSession: cancelSession,
        }}
      />
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
      {schedule?.rules.length > 0 && (
        <UpcomingSessionsCard
          bookings={bookings}
          loadError={bookingsError}
          onEventClick={handleEventClick}
          panel={panel}
        />
      )}
    </Stack>
  );
}
