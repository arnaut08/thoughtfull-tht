import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Skeleton, Stack, Typography } from "@mui/material";
import NameAvatar from "../components/NameAvatar.jsx";
import { cancelMemberBooking, fetchMemberBookings } from "../api/bookings.js";
import { formatSessionDate, formatSessionTime } from "../lib/schedule.js";

function DetailRow({ label, value }) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between" }} spacing={2}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography sx={{ textAlign: "right", wordBreak: "break-word" }}>{value}</Typography>
    </Stack>
  );
}

function SessionRowSkeleton() {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
      <Skeleton variant="circular" width={40} height={40} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Skeleton variant="text" width="50%" />
        <Skeleton variant="text" width="30%" />
      </Box>
    </Stack>
  );
}

// sessions is null while loading, which shows skeleton rows. onCancel is passed only for upcoming sessions.
function SessionGroup({ title, sessions, timezone, emptyText, onCancel, cancelingId }) {
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
            <Stack key={session.id} direction="row" spacing={2} sx={{ alignItems: "center" }}>
              <NameAvatar
                name={session.professional.name}
                sx={{ width: 40, height: 40, bgcolor: "#fde8da", color: "#a4552a" }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap fontWeight={500}>
                  {session.professional.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatSessionDate(session.start, timezone)} ·{" "}
                  {formatSessionTime(session.start, timezone)} –{" "}
                  {formatSessionTime(session.end, timezone)}
                </Typography>
              </Box>
              {onCancel &&
                (session.cancellable ? (
                  <Button
                    color="error"
                    size="small"
                    disabled={cancelingId !== null}
                    onClick={() => onCancel(session)}
                  >
                    {cancelingId === session.id ? "Cancelling…" : "Cancel"}
                  </Button>
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 160, textAlign: "right" }}>
                    Starts within 24 hours, so it can't be cancelled.
                  </Typography>
                ))}
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
  const [cancelingId, setCancelingId] = useState(null);
  const [cancelError, setCancelError] = useState("");

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

  async function handleCancel(session) {
    setCancelError("");
    setCancelingId(session.id);
    try {
      await cancelMemberBooking(token, session.id);
      setBookings(await fetchMemberBookings(token));
    } catch (error) {
      setCancelError(error.message);
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 720, mx: "auto" }}>
      <Typography variant="h5" component="h1">
        Profile
      </Typography>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
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
                {cancelError && <Alert severity="error">{cancelError}</Alert>}
                <SessionGroup
                  title="Upcoming"
                  sessions={bookings?.upcoming ?? null}
                  timezone={user.timezone}
                  emptyText="No upcoming sessions."
                  onCancel={handleCancel}
                  cancelingId={cancelingId}
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

