import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { fetchProfessionals } from "../api/professionals.js";
import NameAvatar from "../components/NameAvatar.jsx";

function ProfessionalCardSkeleton() {
  return (
    <Card sx={{ height: "100%", border: 0, boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <Skeleton variant="circular" width={56} height={56} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton variant="text" sx={{ fontSize: "1.25rem", width: "60%" }} />
            <Skeleton variant="text" width="40%" />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function MemberDashboardPage({ token, user, onSelectProfessional }) {
  const [professionals, setProfessionals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

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

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1">
          Professionals
        </Typography>
        <Typography color="text.secondary">
          Welcome, {user.name} · Times are shown in {user.timezone}
        </Typography>
      </Box>

      {loadError && <Alert severity="error">{loadError}</Alert>}
      {!loading && !loadError && professionals.length === 0 && (
        <Typography color="text.secondary">No professionals yet.</Typography>
      )}

      <Box
        sx={{
          display: "grid",
          gap: 2.5,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
        }}
      >
        {loading &&
          Array.from({ length: 3 }, (_, index) => <ProfessionalCardSkeleton key={index} />)}
        {professionals.map((professional) => (
          <Card
            key={professional.id}
            sx={{
              height: "100%",
              border: 0,
              // Subtle card shadow, set via sx because MUI's Paper styles override the theme.
              boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
              transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
              "&:hover": {
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                transform: "translateY(-2px)",
              },
            }}
          >
            <CardActionArea
              onClick={() => onSelectProfessional(professional.id)}
              sx={{ height: "100%" }}
            >
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                  <NameAvatar
                    name={professional.name}
                    sx={{ width: 56, height: 56, bgcolor: "var(--color-peach)", color: "var(--color-peach-ink)" }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" component="h2" noWrap>
                      {professional.name}
                    </Typography>
                    <Typography variant="body2" noWrap sx={{ color: "var(--color-slate)" }}>
                      Based in {professional.timezone}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Stack>
  );
}
