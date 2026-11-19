import { useCallback, useEffect, useState } from "react";
import {
  AppBar,
  Badge,
  Box,
  Button,
  ButtonBase,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import PersonIcon from "@mui/icons-material/Person";
import { fetchNotifications } from "../api/notifications.js";
import InitialsAvatar from "./InitialsAvatar.jsx";
import NotificationsTray from "./NotificationsTray.jsx";
import TimezoneLabel from "./TimezoneLabel.jsx";

const UNREAD_POLL_MS = 30000;

export default function AppHeader({ token, user, activePage, onHome, onProfile, onSignOut }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    const poll = () =>
      fetchNotifications(token)
        .then((data) => active && setUnreadCount(data.unreadCount))
        .catch(() => {});
    poll();
    const timer = setInterval(poll, UNREAD_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);

  const markAllRead = useCallback(() => setUnreadCount(0), []);

  function closeMenuThen(action) {
    setMenuAnchor(null);
    action();
  }

  const navLinks = [
    { key: "home", label: "Dashboard", onClick: onHome },
    { key: "profile", label: "Profile", onClick: onProfile },
  ];
  const roleLabel = user.role === "professional" ? "Professional" : "Member";

  function navigate(action) {
    setNavOpen(false);
    action();
  }

  return (
    <>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
            sx={{ display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>

          <ButtonBase
            onClick={onHome}
            aria-label="Go to dashboard"
            sx={{ borderRadius: 1, px: 1, py: 0.5 }}
          >
            <Typography variant="h6" component="span" color="primary.main">
              ThoughtFull
            </Typography>
          </ButtonBase>

          <Box component="nav" aria-label="Main" sx={{ display: { xs: "none", md: "flex" }, gap: 1, ml: 2 }}>
            {navLinks.map((link) => {
              const active = activePage === link.key;
              return (
                <Button
                  key={link.key}
                  color={active ? "primary" : "inherit"}
                  aria-current={active ? "page" : undefined}
                  onClick={link.onClick}
                  sx={{ fontWeight: active ? 600 : 400 }}
                >
                  {link.label}
                </Button>
              );
            })}
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Tooltip title="Notifications">
            <IconButton
              aria-label="Notifications"
              aria-expanded={trayOpen}
              color={trayOpen ? "primary" : "default"}
              onClick={() => setTrayOpen((open) => !open)}
            >
              <Badge badgeContent={unreadCount} color="error" max={99}>
                <NotificationsNoneIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          <Tooltip title="Account">
            <IconButton
              aria-label="Account menu"
              aria-haspopup="true"
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              sx={{ p: 0.5 }}
            >
              <InitialsAvatar name={user.name} />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Drawer anchor="left" open={navOpen} onClose={() => setNavOpen(false)}>
        <Box role="presentation" sx={{ width: 260, pt: 1 }}>
          <List aria-label="Main">
            {navLinks.map((link) => (
              <ListItemButton
                key={link.key}
                selected={activePage === link.key}
                onClick={() => navigate(link.onClick)}
              >
                <ListItemText primary={link.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>

      <NotificationsTray
        open={trayOpen}
        token={token}
        timezone={user.timezone}
        onClose={() => setTrayOpen(false)}
        onMarkedRead={markAllRead}
      />

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ px: 2, py: 1, minWidth: 240 }}>
          <Typography fontWeight={600}>{user.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {roleLabel}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <TimezoneLabel timezone={user.timezone} />
          </Box>
        </Box>
        <Divider />
        <MenuItem onClick={() => closeMenuThen(onSignOut)}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Log out
        </MenuItem>
      </Menu>
    </>
  );
}
