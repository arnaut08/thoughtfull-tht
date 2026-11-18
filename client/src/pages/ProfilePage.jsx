import { useEffect, useState } from "react";
import { Alert, Box, Card, CardContent, Chip, Divider, Skeleton, Stack, Typography } from "@mui/material";
import NameAvatar from "../components/NameAvatar.jsx";
import { fetchMemberBookings } from "../api/bookings.js";

function DetailRow({ label, value }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography sx={{ textAlign: "right", wordBreak: "break-word" }}>{value}</Typography>
    </Stack>
  );
}

function SessionRowSkeleton() {
  return (
    <Stack direction="row" spacing={2} alignItems="center">
      <Skeleton variant="circular" width={40} height={40} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Skeleton variant="text" width="50%" />
        <Skeleton variant="text" width="30%" />
      </Box>
    </Stack>
  );
}

function formatSessionDate(iso, timezone) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });
}

function formatSessionTime(iso, timezone) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
}

// sessions is null while loading, which shows skeleton rows.
function SessionGroup({ title, sessions, timezone, emptyText }) {
  return (
    <Box>
      <Typography variant="subtitle1" component="h3" fontWeight={600}>
        {title}
      </Typography>

      {sessions === null && (
        <Stack spacing={2} sx={{ mt: 1.5 }} aria-busy="true">
          <SessionRowSkeleton />
          <SessionRowSkeleton />
        </Stack>
      )}

      {sessions?.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {emptyText}
        </Typography>
      )}

      {sessions?.length > 0 && (
        <Stack spacing={2} divider={<Divider flexItem />} sx={{ mt: 1.5 }}>
          {sessions.map((session) => (
            <Stack key={session.start} direction="row" spacing={2} alignItems="center">
              <NameAvatar
                name={session.professional.name}
                sx={{ width: 40, height: 40, bgcolor: "#fde8da", color: "#a4552a" }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap fontWeight={500}>
                  {session.professional.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatSessionDate(session.start, timezone)} ·{" "}
                  {formatSessionTime(session.start, timezone)} –{" "}
                  {formatSessionTime(session.end, timezone)}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default function ProfilePage({ token, user }) {
  const roleLabel = user.role === "professional" ? "Professional" : "Member";
  const isMember = user.role === "member";
  const [bookings, setBookings] = useState(null);
  const [bookingsError, setBookingsError] = useState("");

  useEffect(() => {
    if (!isMember) return undefined;
    let active = true;
    fetchMemberBookings(token)
      .then((data) => active && setBookings(data))
      .catch((error) => active && setBookingsError(error.message));
    return () => {
      active = false;
    };
  }, [token, isMember]);

  return (
    <Stack spacing={3} sx={{ maxWidth: 720, mx: "auto" }}>
      <Typography variant="h5" component="h1">
        Profile
      </Typography>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <NameAvatar name={user.name} sx={{ width: 64, height: 64, bgcolor: "primary.main" }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" component="h2" noWrap>
                {user.name}
              </Typography>
              <Chip size="small" label={roleLabel} variant="outlined" />
            </Box>
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Stack spacing={2}>
            <DetailRow label="Email" value={user.email} />
            <DetailRow label="Timezone" value={user.timezone} />
          </Stack>
        </CardContent>
      </Card>

      {isMember && (
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" component="h2">
              Sessions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Times are shown in {user.timezone}
            </Typography>

            {bookingsError ? (
              <Alert severity="error" sx={{ mt: 2 }}>
                {bookingsError}
              </Alert>
            ) : (
              <Stack spacing={3} sx={{ mt: 3 }}>
                <SessionGroup
                  title="Upcoming"
                  sessions={bookings?.upcoming ?? null}
                  timezone={user.timezone}
                  emptyText="No upcoming sessions."
                />
                <Divider />
                <SessionGroup
                  title="Past"
                  sessions={bookings?.past ?? null}
                  timezone={user.timezone}
                  emptyText="No past sessions yet."
                />
              </Stack>
            )}
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

