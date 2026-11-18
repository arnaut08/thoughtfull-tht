import { useCallback, useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
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
import {
  bookProfessionalSlot,
  fetchProfessionalProfile,
  rescheduleProfessionalSlot,
} from "../api/professionals.js";

// FullCalendar renders in UTC, so each instant is shifted to the wall-clock time it shows in the member's zone.
function toWallClockDate(instant, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute));
}

// Formats an ISO instant as a readable date and time range in the given zone.
function formatSlotRange(start, end, timezone) {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const startDate = new Date(start);
  return `${date.format(startDate)}, ${time.format(startDate)} – ${time.format(new Date(end))}`;
}

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

  // Clicking a slot only selects it; the member confirms in the panel below the calendar.
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

  // The session being rescheduled is offered as open by the server, but it is shown as current and can't be picked.
  const events = useMemo(
    () =>
      profile
        ? profile.slots.map((slot) => {
            const isCurrent = slot.start === profile.reschedule?.start;
            return {
              id: slot.start,
              title: isCurrent ? "Current" : "Open",
              classNames: isCurrent ? ["current-session"] : [],
              start: toWallClockDate(new Date(slot.start), memberTimezone),
              end: toWallClockDate(new Date(slot.end), memberTimezone),
            };
          })
        : [],
    [profile, memberTimezone],
  );

  const today = toWallClockDate(new Date(), memberTimezone).toISOString().slice(0, 10);

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
        {rescheduleBookingId ? "Back to my sessions" : "Back to professionals"}
      </Button>

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
            <Typography color="text.secondary">
              Open sessions in the next 4 weeks · Times are in {memberTimezone}
            </Typography>
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

          <Card>
            <CardContent>
              <FullCalendar
                plugins={[timeGridPlugin]}
                initialView="timeGridWeek"
                initialDate={today}
                headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
                buttonText={{ today: "Today" }}
                timeZone="UTC"
                firstDay={0}
                dayHeaderFormat={{ weekday: "short", month: "short", day: "numeric" }}
                allDaySlot={false}
                slotDuration="00:30:00"
                slotMinTime="00:00:00"
                slotMaxTime="24:00:00"
                height="auto"
                events={events}
                eventDisplay="block"
                eventClick={handleEventClick}
              />
            </CardContent>
          </Card>

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

          {selectedSlot && (
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Typography>
                    {rescheduleBookingId ? "New session" : "Selected session"}:{" "}
                    <strong>
                      {formatSlotRange(selectedSlot.start, selectedSlot.end, memberTimezone)}
                    </strong>
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button variant="contained" onClick={handleConfirm} disabled={booking}>
                      {booking
                        ? rescheduleBookingId
                          ? "Rescheduling…"
                          : "Booking…"
                        : rescheduleBookingId
                          ? "Confirm reschedule"
                          : "Confirm booking"}
                    </Button>
                    <Button onClick={() => setSelectedSlot(null)} disabled={booking}>
                      Cancel
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Stack>
  );
}
