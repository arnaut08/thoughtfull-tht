import { useState } from "react";
import {
  AppBar,
  Box,
  ButtonBase,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import PersonIcon from "@mui/icons-material/Person";
import SpaIcon from "@mui/icons-material/Spa";
import NameAvatar from "./NameAvatar.jsx";
import NotificationsTray from "./NotificationsTray.jsx";

export default function AppHeader({ user, onHome, onProfile, onSignOut }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [trayOpen, setTrayOpen] = useState(false);

  function closeMenuThen(action) {
    setMenuAnchor(null);
    action();
  }

  return (
    <>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "#f1f5f9" }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <ButtonBase
            onClick={onHome}
            aria-label="Go to dashboard"
            sx={{ display: "flex", alignItems: "center", gap: 1, borderRadius: 1, px: 1, py: 0.5 }}
          >
            <SpaIcon sx={{ color: "#13595e" }} />
            <Typography variant="h6" component="span" fontWeight={700} sx={{ color: "#13595e" }}>
              Thoughtfull-THT
            </Typography>
          </ButtonBase>

          <Box sx={{ flexGrow: 1 }} />

          <Tooltip title="Notifications">
            <IconButton
              aria-label="Notifications"
              aria-expanded={trayOpen}
              color={trayOpen ? "primary" : "default"}
              onClick={() => setTrayOpen((open) => !open)}
            >
              <NotificationsNoneIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Account">
            <IconButton
              aria-label="Account menu"
              aria-haspopup="true"
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              sx={{ p: 0.5 }}
            >
              <NameAvatar
                name={user.name}
                sx={{ width: 36, height: 36, bgcolor: "#13595e" }}
              />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <NotificationsTray open={trayOpen} onClose={() => setTrayOpen(false)} />

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ px: 2, py: 1, minWidth: 220 }}>
          <Typography fontWeight={600}>{user.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {user.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={() => closeMenuThen(onProfile)}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          Profile
        </MenuItem>
        <MenuItem onClick={() => closeMenuThen(onSignOut)}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}
