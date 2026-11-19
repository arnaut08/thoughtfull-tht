import { AppBar, Box, Button, ButtonBase, Toolbar, Typography } from "@mui/material";
import AppFooter from "./AppFooter.jsx";

export default function PublicLayout({ onHome, onLogin, onSignup, children }) {
  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 1 }}>
          <ButtonBase onClick={onHome} aria-label="Go to home" sx={{ borderRadius: 1, px: 1, py: 0.5 }}>
            <Typography variant="h6" component="span" color="primary.main">
              ThoughtFull
            </Typography>
          </ButtonBase>
          <Box sx={{ flexGrow: 1 }} />
          <Button color="inherit" onClick={onLogin}>
            Log in
          </Button>
          <Button variant="contained" onClick={onSignup}>
            Sign up
          </Button>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flex: 1 }}>
        {children}
      </Box>
      <AppFooter />
    </Box>
  );
}
