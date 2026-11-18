import { useCallback, useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from "@mui/material";
import { bookProfessionalSlot, fetchProfessionalProfile } from "../api/professionals.js";

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

export default function ProfessionalProfilePage({ token, professionalId, memberTimezone, onBack }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const loadProfile = useCallback(
    () => fetchProfessionalProfile(token, professionalId).then(setProfile),
    [token, professionalId],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadProfile()
      .catch((error) => active && setLoadError(error.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loadProfile]);

  // Clicking a slot only selects it; the member confirms in the panel below the calendar.
  function handleEventClick(info) {
    const slot = profile.slots.find((candidate) => candidate.start === info.event.id);
    setSelectedSlot(slot ?? null);
    setConfirmation(null);
    setBookError("");
  }

  async function handleConfirm() {
    setBooking(true);
    setBookError("");
    try {
      const data = await bookProfessionalSlot(token, professionalId, selectedSlot.start);
      setConfirmation(data.booking);
    } catch (error) {
      setBookError(error.message);
    } finally {
      setSelectedSlot(null);
      setBooking(false);
      // Refresh so booked sessions and any slot taken by someone else disappear.
      loadProfile().catch((error) => setLoadError(error.message));
    }
  }

  const events = useMemo(
    () =>
      profile
        ? profile.slots.map((slot) => ({
            id: slot.start,
            title: "Open",
            start: toWallClockDate(new Date(slot.start), memberTimezone),
            end: toWallClockDate(new Date(slot.end), memberTimezone),
          }))
        : [],
    [profile, memberTimezone],
  );

  const today = toWallClockDate(new Date(), memberTimezone).toISOString().slice(0, 10);

  return (
    <Box component="main" sx={{ minHeight: "100vh", p: 2, bgcolor: "#f5f5f5" }}>
      <Stack spacing={2} sx={{ maxWidth: 1000, mx: "auto" }}>
        <Button onClick={onBack} sx={{ alignSelf: "flex-start" }}>
          ← Back to professionals
        </Button>

        {loading && <CircularProgress sx={{ alignSelf: "center" }} />}
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

            {confirmation && (
              <Alert severity="success">
                Booked with {confirmation.professional.name} on{" "}
                {formatSlotRange(confirmation.start, confirmation.end, memberTimezone)}.
              </Alert>
            )}
            {bookError && <Alert severity="error">{bookError}</Alert>}

            {selectedSlot && (
              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography>
                      Selected session:{" "}
                      <strong>
                        {formatSlotRange(selectedSlot.start, selectedSlot.end, memberTimezone)}
                      </strong>
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button variant="contained" onClick={handleConfirm} disabled={booking}>
                        {booking ? "Booking…" : "Confirm booking"}
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
    </Box>
  );
}
