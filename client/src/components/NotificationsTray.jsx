import { Box, Drawer, IconButton, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";

export default function NotificationsTray({ open, onClose }) {
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

      <Box sx={{ flex: 1, display: "grid", placeItems: "center", p: 3 }}>
        <Stack spacing={1} sx={{ alignItems: "center" }}>
          <NotificationsNoneIcon sx={{ fontSize: 48, color: "text.disabled" }} />
          <Typography color="text.secondary">You're all caught up.</Typography>
        </Stack>
      </Box>
    </Drawer>
  );
}
