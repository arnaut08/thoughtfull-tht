import { Alert, Box, Button, Card, CardActionArea, CardContent, CircularProgress, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { fetchProfessionals } from "../api/professionals.js";
import ProfessionalProfilePage from "./ProfessionalProfilePage.jsx";

export default function MemberDashboardPage({ token, user, onSignOut }) {
  const [professionals, setProfessionals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let active = true;
    fetchProfessionals(token)
      .then((data) => active && setProfessionals(data.professionals))
      .catch((error) => active && setLoadError(error.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  if (selectedId) {
    return (
      <ProfessionalProfilePage
        token={token}
        professionalId={selectedId}
        memberTimezone={user.timezone}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <Box component="main" sx={{ minHeight: "100vh", p: 2, bgcolor: "#f5f5f5" }}>
      <Stack spacing={2} sx={{ maxWidth: 680, mx: "auto" }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="h5" component="h1">
              Professionals
            </Typography>
            <Typography color="text.secondary">
              Welcome, {user.name} · Times are shown in {user.timezone}
            </Typography>
          </Box>
          <Button variant="outlined" onClick={onSignOut}>
            Sign out
          </Button>
        </Stack>

        {loading && <CircularProgress sx={{ alignSelf: "center" }} />}
        {loadError && <Alert severity="error">{loadError}</Alert>}
        {!loading && !loadError && professionals.length === 0 && (
          <Typography color="text.secondary">No professionals yet.</Typography>
        )}

        {professionals.map((professional) => (
          <Card key={professional.id}>
            <CardActionArea onClick={() => setSelectedId(professional.id)}>
              <CardContent>
                <Typography variant="h6" component="h2">
                  {professional.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Based in {professional.timezone}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
