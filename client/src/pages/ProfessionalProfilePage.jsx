import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from "@mui/material";
import { fetchProfessionalProfile } from "../api/professionals.js";

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

export default function ProfessionalProfilePage({ token, professionalId, memberTimezone, onBack }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchProfessionalProfile(token, professionalId)
      .then((data) => active && setProfile(data))
      .catch((error) => active && setLoadError(error.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token, professionalId]);

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
                />
              </CardContent>
            </Card>
          </>
        )}
      </Stack>
    </Box>
  );
}
