import { useCallback, useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import CalendarShell from "../components/CalendarShell.jsx";
import dayGridPlugin from "@fullcalendar/daygrid";
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
import CheckIcon from "@mui/icons-material/Check";
import TimezoneLabel from "../components/TimezoneLabel.jsx";
import BackButton from "../components/BackButton.jsx";
import { formatSlotRange, toWallClockDate } from "../lib/schedule.js";
import {
  bookProfessionalSlot,
  fetchProfessionalProfile,
  rescheduleProfessionalSlot,
} from "../api/professionals.js";

// With rescheduleBookingId set, confirming moves that session instead of booking a new one.
export default function ProfessionalProfilePage({
  token,
  professionalId,
  memberTimezone,
  rescheduleBookingId,
  onBack,
  onRescheduled,
}) {
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const loadProfile = useCallback(
    () => fetchProfessionalProfile(token, professionalId, rescheduleBookingId).then(setProfile),
    [token, professionalId, rescheduleBookingId],
  );

  useEffect(() => {
    let active = true;
    setProfile(null);
    setLoadError("");
    fetchProfessionalProfile(token, professionalId, rescheduleBookingId)
      .then((data) => active && setProfile(data))
      .catch((error) => active && setLoadError(error.message));
    return () => {
      active = false;
    };
  }, [token, professionalId, rescheduleBookingId]);

  // Clicking a slot only selects it; the member confirms in a dialog.
  function handleEventClick(info) {
    if (info.event.id === profile.reschedule?.start) return;
    const slot = profile.slots.find((candidate) => candidate.start === info.event.id);
    setSelectedSlot(slot ?? null);
    setConfirmation(null);
    setBookError("");
  }

  async function handleConfirm() {
    const previous = profile.reschedule;
    setBooking(true);
    setBookError("");
    let rescheduled = false;
    try {
      if (rescheduleBookingId) {
        const data = await rescheduleProfessionalSlot(
          token,
          professionalId,
          rescheduleBookingId,
          selectedSlot.start,
        );
        setConfirmation({
          kind: "reschedule",
          from: { start: previous.start, end: previous.end },
          booking: data.booking,
        });
        rescheduled = true;
      } else {
        const data = await bookProfessionalSlot(token, professionalId, selectedSlot.start);
        setConfirmation({ kind: "booking", booking: data.booking });
      }
    } catch (error) {
      setBookError(error.message);
    } finally {
      setSelectedSlot(null);
      setBooking(false);
      if (rescheduled) {
        // Leaving reschedule mode refetches the profile. This page stays mounted, so the confirmation remains.
        onRescheduled();
      } else {
        // Refresh so booked sessions and any slot taken by someone else disappear.
        loadProfile().catch((error) => setLoadError(error.message));
      }
    }
  }

  // Each open session is one chip on its start day, showing only its range. A session that runs past midnight is
  // capped at midnight, so it appears once. The chip for the session being rescheduled is marked current, and the
  // chip the member picked is marked selected until they confirm or cancel.
  const events = useMemo(() => {
    if (!profile) return [];
    const clock = new Intl.DateTimeFormat("en-US", {
      timeZone: memberTimezone,
      hour: "numeric",
      minute: "2-digit",
    });
    return profile.slots.map((slot) => {
      const isCurrent = slot.start === profile.reschedule?.start;
      const start = toWallClockDate(new Date(slot.start), memberTimezone);
      const midnight = new Date(start);
      midnight.setUTCHours(24, 0, 0, 0);
      const end = new Date(Math.min(toWallClockDate(new Date(slot.end), memberTimezone), midnight));
      const range = `${clock.format(new Date(slot.start))} – ${clock.format(new Date(slot.end))}`;
      const classNames = [];
      if (isCurrent) classNames.push("current-session");
      return {
        id: slot.start,
        title: isCurrent ? `Current · ${range}` : range,
        classNames,
        start,
        end,
      };
    });
  }, [profile, memberTimezone]);

  const today = toWallClockDate(new Date(), memberTimezone).toISOString().slice(0, 10);
  const isRescheduling = Boolean(rescheduleBookingId);
  const confirmLabel = booking
    ? isRescheduling
      ? "Rescheduling…"
      : "Booking…"
    : isRescheduling
      ? "Confirm reschedule"
      : "Confirm booking";

  // The session being rescheduled is not a free slot, so it gets no slot styling.
  const slotClassNames = ({ event }) => {
    if (event.id === profile?.reschedule?.start) return [];
    return event.id === selectedSlot?.start ? ["tf-slot", "is-selected"] : ["tf-slot"];
  };

  const renderSlot = ({ event }) => (
    <Box
      component="span"
      className="fc-event-title"
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
    >
      {event.id === selectedSlot?.start && <CheckIcon fontSize="inherit" aria-hidden="true" />}
      {event.title}
    </Box>
  );

  return (
    <Stack spacing={2}>
      <BackButton onClick={onBack}>
        {rescheduleBookingId ? "Back to my sessions" : "Back to professionals"}
      </BackButton>

      {!profile && !loadError && (
        <Stack spacing={2} aria-busy="true" aria-live="polite">
          <Box>
            <Skeleton variant="text" sx={{ fontSize: "1.5rem", width: 220 }} />
            <Skeleton variant="text" width={300} />
          </Box>
          <Card>
            <CardContent>
              <Skeleton variant="rounded" height={560} />
            </CardContent>
          </Card>
        </Stack>
      )}
      {loadError && <Alert severity="error">{loadError}</Alert>}

      {profile && (
        <>
          <Box>
            <Typography variant="h5" component="h1">
              {profile.professional.name}
            </Typography>
            <Typography color="text.secondary">Open sessions in the next 4 weeks</Typography>
            {profile.min_booking_notice_hours > 0 && (
              <Typography color="text.secondary">
                Sessions must be booked at least {profile.min_booking_notice_hours}{" "}
                {profile.min_booking_notice_hours === 1 ? "hour" : "hours"} in advance.
              </Typography>
            )}
          </Box>

          {profile.reschedule && (
            <Alert severity="info">
              Rescheduling your session currently on{" "}
              <strong>
                {formatSlotRange(profile.reschedule.start, profile.reschedule.end, memberTimezone)}
              </strong>
              . Pick a new open slot below.
            </Alert>
          )}

          {events.length === 0 && (
            <Typography color="text.secondary">No open sessions in the next 4 weeks.</Typography>
          )}

          {confirmation?.kind === "booking" && (
            <Alert severity="success">
              Booked with {confirmation.booking.professional.name} on{" "}
              {formatSlotRange(confirmation.booking.start, confirmation.booking.end, memberTimezone)}.
            </Alert>
          )}
          {confirmation?.kind === "reschedule" && (
            <Alert severity="success">
              Rescheduled with {confirmation.booking.professional.name} from{" "}
              {formatSlotRange(confirmation.from.start, confirmation.from.end, memberTimezone)} to{" "}
              {formatSlotRange(confirmation.booking.start, confirmation.booking.end, memberTimezone)}.
            </Alert>
          )}
          {bookError && <Alert severity="error">{bookError}</Alert>}

          <Card>
            <CardContent>
              <Box sx={{ mb: 2 }}>
                <TimezoneLabel timezone={memberTimezone} />
              </Box>
              <CalendarShell className="session-calendar">
                <FullCalendar
                  plugins={[dayGridPlugin]}
                  initialView="dayGridWeek"
                  initialDate={today}
                  headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
                  buttonText={{ today: "Today" }}
                  timeZone="UTC"
                  firstDay={0}
                  dayHeaderFormat={{ weekday: "short", month: "short", day: "numeric" }}
                  displayEventTime={false}
                  eventDisplay="block"
                  height="auto"
                  events={events}
                  eventClassNames={slotClassNames}
                  eventContent={renderSlot}
                  eventClick={handleEventClick}
                />
              </CalendarShell>
            </CardContent>
          </Card>

          <Dialog
            open={Boolean(selectedSlot)}
            onClose={() => !booking && setSelectedSlot(null)}
            aria-labelledby="confirm-session-title"
          >
            <DialogTitle id="confirm-session-title">
              {rescheduleBookingId ? "Confirm reschedule" : "Confirm booking"}
            </DialogTitle>
            <DialogContent>
              <Typography>
                {rescheduleBookingId ? "New session" : "Session"}:{" "}
                <strong>
                  {selectedSlot && formatSlotRange(selectedSlot.start, selectedSlot.end, memberTimezone)}
                </strong>
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedSlot(null)} disabled={booking}>
                Cancel
              </Button>
              <Button variant="contained" onClick={handleConfirm} disabled={booking}>
                {confirmLabel}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Stack>
  );
}
