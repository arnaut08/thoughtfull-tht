import { useEffect, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import AuthPage from "./pages/AuthPage.jsx";
import AvailabilityPage from "./pages/AvailabilityPage.jsx";
import MemberDashboardPage from "./pages/MemberDashboardPage.jsx";
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

  if (user.role === "professional") {
    return <AvailabilityPage token={token} user={user} onSignOut={handleSignOut} />;
  }

  return <MemberDashboardPage token={token} user={user} onSignOut={handleSignOut} />;
}

export default App;
