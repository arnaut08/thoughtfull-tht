import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Skeleton, Stack, Typography } from "@mui/material";
import NameAvatar from "../components/NameAvatar.jsx";
import InitialsAvatar from "../components/InitialsAvatar.jsx";
import StatusChip from "../components/StatusChip.jsx";
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

function SessionCard({ name, start, end, status, timezone, actions }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <InitialsAvatar name={name} sx={{ width: 40, height: 40 }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
              <Typography noWrap fontWeight={500}>
                {name}
              </Typography>
              <StatusChip status={status} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {formatSessionDate(start, timezone)} · {formatSessionTime(start, timezone)} –{" "}
              {formatSessionTime(end, timezone)}
            </Typography>
          </Box>
        </Stack>
        {actions && <Box sx={{ mt: 2 }}>{actions}</Box>}
      </CardContent>
    </Card>
  );
}

// sessions is null while loading, which shows skeleton rows. onCancel and onReschedule are passed only for upcoming sessions.
function SessionGroup({ title, sessions, timezone, emptyText, onCancel, onReschedule, cancelingId }) {
  const status = onCancel ? "upcoming" : "past";
  return (
    <Box>
      <Typography variant="subtitle1" component="h3" fontWeight={600}>
        {title}
      </Typography>

      {sessions === null && (
        <Stack spacing={2} sx={{ mt: 1.5 }} aria-busy="true">
          <Skeleton variant="rounded" height={88} />
          <Skeleton variant="rounded" height={88} />
        </Stack>
      )}

      {sessions?.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {emptyText}
        </Typography>
      )}

      {sessions?.length > 0 && (
        <Stack spacing={2} sx={{ mt: 1.5 }}>
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              name={session.professional.name}
              start={session.start}
              end={session.end}
              status={status}
              timezone={timezone}
              actions={
                onCancel && (
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={!session.cancellable || cancelingId !== null}
                      onClick={() => onReschedule(session)}
                    >
                      Reschedule
                    </Button>
                    <Button
                      color="error"
                      size="small"
                      variant="outlined"
                      disabled={!session.cancellable || cancelingId !== null}
                      onClick={() => onCancel(session)}
                    >
                      {cancelingId === session.id ? "Cancelling…" : "Cancel"}
                    </Button>
                    {!session.cancellable && (
                      <Typography variant="body2" color="text.secondary">
                        Sessions can be changed up to 24 hours before they start
                      </Typography>
                    )}
                  </Stack>
                )
              }
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default function ProfilePage({ token, user, onReschedule, onEditAvailability, onManageBlockedDates }) {
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

      {!isMember && (
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" component="h2">
              Availability
            </Typography>
            <Stack spacing={2} sx={{ mt: 2 }}>
              <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Box>
                  <Typography fontWeight={500}>Weekly hours</Typography>
                  <Typography variant="body2" color="text.secondary">
                    The times you're available each week.
                  </Typography>
                </Box>
                <Button variant="outlined" onClick={onEditAvailability}>
                  Edit weekly hours
                </Button>
              </Stack>
              <Divider />
              <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Box>
                  <Typography fontWeight={500}>Blocked dates</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Specific days with no open slots, such as holidays or time off.
                  </Typography>
                </Box>
                <Button variant="outlined" onClick={onManageBlockedDates}>
                  Manage blocked dates
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

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
                  onReschedule={onReschedule}
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

