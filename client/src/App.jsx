import { useEffect, useState } from "react";
import { Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from "@mui/material";
import AuthPage from "./pages/AuthPage.jsx";
import { fetchCurrentUser } from "./api/auth.js";

const TOKEN_KEY = "thoughtfull-tht.token";

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return;

    fetchCurrentUser(token)
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setCheckingSession(false));
  }, [token]);

  function handleAuthenticated({ token: nextToken, user: nextUser }) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }

  function handleSignOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  if (checkingSession) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!token || !user) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  return (
    <Box component="main" sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2, bgcolor: "#f5f5f5" }}>
      <Card sx={{ width: "100%", maxWidth: 440 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={2}>
            <Typography variant="h5" component="h1">
              Welcome, {user.name}
            </Typography>
            <Typography color="text.secondary">
              Signed in as {user.email} ({user.role})
            </Typography>
            <Button variant="outlined" onClick={handleSignOut}>
              Sign out
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

export default App;
