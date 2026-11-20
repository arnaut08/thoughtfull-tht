import { useEffect, useState } from "react";
import { Box } from "@mui/material";
import AuthPage from "./pages/AuthPage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import AppShell from "./components/AppShell.jsx";
import PublicLayout from "./components/PublicLayout.jsx";
import PageLoadingSkeleton from "./components/PageLoadingSkeleton.jsx";
import { fetchCurrentUser } from "./api/auth.js";

const TOKEN_KEY = "thoughtfull-tht.token";

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(Boolean(token));
  const [entry, setEntry] = useState(null);

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
    setEntry(null);
  }

  if (checkingSession) {
    return (
      <Box sx={{ minHeight: "100vh", p: { xs: 2, sm: 3 } }}>
        <PageLoadingSkeleton />
      </Box>
    );
  }

  if (!token || !user) {
    const goHome = () => setEntry(null);
    const goLogin = () => setEntry({ mode: "signin", role: "member" });
    const goSignup = () => setEntry({ mode: "signup", role: "member" });

    return (
      <PublicLayout onHome={goHome} onLogin={goLogin} onSignup={goSignup}>
        {entry ? (
          <AuthPage
            onAuthenticated={handleAuthenticated}
            initialMode={entry.mode}
            initialRole={entry.role}
            onBack={goHome}
          />
        ) : (
          <LandingPage onFindProfessional={goSignup} onLogin={goLogin} />
        )}
      </PublicLayout>
    );
  }

  return <AppShell token={token} user={user} onSignOut={handleSignOut} />;
}

export default App;
