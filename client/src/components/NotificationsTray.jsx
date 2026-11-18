import { useEffect, useState } from "react";
import { Box, Drawer, IconButton, List, ListItem, ListItemText, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { fetchNotifications, markNotificationsRead } from "../api/notifications.js";
import { formatSessionDate, formatSessionTime } from "../lib/schedule.js";

function describeNotification(notification, timezone) {
  const when = `${formatSessionDate(notification.sessionStart, timezone)} at ${formatSessionTime(notification.sessionStart, timezone)}`;
  if (notification.type === "session_rescheduled") {
    const newWhen = `${formatSessionDate(notification.newStart, timezone)} at ${formatSessionTime(notification.newStart, timezone)}`;
    return `${notification.actor.name} rescheduled the session from ${when} to ${newWhen}.`;
  }
  if (notification.type === "session_reminder") {
    return `Reminder: your session with ${notification.actor.name} is on ${when}.`;
  }
  return `${notification.actor.name} cancelled the session scheduled for ${when}.`;
}

export default function NotificationsTray({ open, token, timezone, onClose, onMarkedRead }) {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setError("");
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

      {!error && notifications.length === 0 ? (
        <Box sx={{ flex: 1, display: "grid", placeItems: "center", p: 3 }}>
          <Stack spacing={1} sx={{ alignItems: "center" }}>
            <NotificationsNoneIcon sx={{ fontSize: 48, color: "text.disabled" }} />
            <Typography color="text.secondary">You're all caught up.</Typography>
          </Stack>
        </Box>
      ) : (
        <List disablePadding>
          {notifications.map((notification) => (
            <ListItem key={notification.id} divider sx={{ bgcolor: notification.read ? "transparent" : "#f0f9f8" }}>
              <ListItemText
                primary={describeNotification(notification, timezone)}
                secondary={formatSessionDate(notification.createdAt, timezone)}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Drawer>
  );
}
