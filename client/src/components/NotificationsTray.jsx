import { useEffect, useState } from "react";
import { Box, Drawer, IconButton, List, ListItem, ListItemText, Skeleton, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { fetchNotifications, markNotificationsRead } from "../api/notifications.js";
import { formatSessionDate, formatSessionDateTime } from "../lib/schedule.js";

function describeNotification(notification, timezone) {
  const when = formatSessionDateTime(notification.sessionStart, timezone);
  if (notification.type === "session_rescheduled") {
    const newWhen = formatSessionDateTime(notification.newStart, timezone);
    return `${notification.actor.name} rescheduled the session from ${when} to ${newWhen}.`;
  }
  if (notification.type === "session_reminder") {
    return `Reminder: your session with ${notification.actor.name} is on ${when}.`;
  }
  return `${notification.actor.name} cancelled the session scheduled for ${when}.`;
}

const RELATIVE_UNITS = [
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

// Older than a week falls back to the date, since "3 weeks ago" reads poorly.
function formatRelativeTime(iso, timezone) {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (elapsed >= 7 * RELATIVE_UNITS[0].ms) return formatSessionDate(iso, timezone);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const match = RELATIVE_UNITS.find(({ ms }) => elapsed >= ms);
  if (!match) return "just now";
  return formatter.format(-Math.floor(elapsed / match.ms), match.unit);
}

export default function NotificationsTray({ open, token, timezone, onClose, onMarkedRead }) {
  const [notifications, setNotifications] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setError("");
    setNotifications(null);
    fetchNotifications(token)
      .then(async (data) => {
        if (!active) return;
        setNotifications(data.notifications);
        if (data.unreadCount > 0) {
          await markNotificationsRead(token);
          if (active) onMarkedRead();
        }
      })
      .catch(() => active && setError("Could not load notifications."));
    return () => {
      active = false;
    };
  }, [open, token, onMarkedRead]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: "100%", sm: 360 } } } }}
    >
      <Stack
        direction="row"
        sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider", justifyContent: "space-between", alignItems: "center" }}
      >
        <Typography variant="h6" component="h2">
          Notifications
        </Typography>
        <IconButton aria-label="Close notifications" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>

      {error && (
        <Typography color="error" sx={{ p: 2 }}>
          {error}
        </Typography>
      )}

      {!error && notifications === null && (
        <Stack spacing={1.5} sx={{ p: 2 }} aria-busy="true">
          <Skeleton variant="rounded" height={64} />
          <Skeleton variant="rounded" height={64} />
          <Skeleton variant="rounded" height={64} />
        </Stack>
      )}

      {!error && notifications?.length === 0 ? (
        <Box sx={{ flex: 1, display: "grid", placeItems: "center", p: 3 }}>
          <Stack spacing={1} sx={{ alignItems: "center" }}>
            <NotificationsNoneIcon sx={{ fontSize: 48, color: "text.disabled" }} />
            <Typography color="text.secondary">You're all caught up.</Typography>
          </Stack>
        </Box>
      ) : notifications?.length > 0 && (
        <List disablePadding>
          {notifications.map((notification) => (
            <ListItem
              key={notification.id}
              divider
              alignItems="flex-start"
              sx={{ bgcolor: notification.read ? "transparent" : "surface.main", gap: 1.5 }}
            >
              <Box
                aria-label={notification.read ? undefined : "Unread"}
                sx={{
                  width: 8,
                  height: 8,
                  mt: 1,
                  flexShrink: 0,
                  borderRadius: "50%",
                  bgcolor: notification.read ? "transparent" : "primary.main",
                }}
              />
              <ListItemText
                primary={describeNotification(notification, timezone)}
                secondary={formatRelativeTime(notification.createdAt, timezone)}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Drawer>
  );
}
