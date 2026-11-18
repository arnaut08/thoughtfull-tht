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
import { fetchProfessionalBookings } from "../api/bookings.js";

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
      title: open ? "Open" : slot.member.name,
      start: toWallClock(slot.start),
      end: toWallClock(slot.end),
      classNames: [open ? "session-open" : "session-booked"],
    };
  });
}

function UpcomingSessionsCard({ bookings, loadError }) {
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
      </CardContent>
    </Card>
  );
}

export default function ProfessionalDashboardPage({ token, user, onEditAvailability }) {
  const [schedule, setSchedule] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [bookings, setBookings] = useState(null);
  const [bookingsError, setBookingsError] = useState("");

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

  let content = null;
  if (loadError) {
    content = <Alert severity="error">{loadError}</Alert>;
  } else if (schedule && schedule.rules.length === 0) {
    content = <WelcomeCard user={user} onSetAvailability={onEditAvailability} />;
  }

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
        <UpcomingSessionsCard bookings={bookings} loadError={bookingsError} />
      )}
    </Stack>
  );
}
