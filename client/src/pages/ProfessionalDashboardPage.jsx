import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import EditCalendarOutlinedIcon from "@mui/icons-material/EditCalendarOutlined";
import { fetchAvailability } from "../api/availability.js";
import { DAY_NAMES } from "../lib/schedule.js";

function WelcomeCard({ user, onSetAvailability }) {
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <Card>
      <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
        <Stack spacing={2} alignItems="flex-start" sx={{ maxWidth: 560 }}>
          <EditCalendarOutlinedIcon sx={{ fontSize: 48, color: "primary.main" }} />
          <Typography variant="h5" component="h2">
            Welcome to Thoughtfull-THT, {firstName}!
          </Typography>
          <Typography color="text.secondary">
            Set your weekly availability so members can see when you're free and book sessions with
            you. You can change it at any time.
          </Typography>
          <Button variant="contained" size="large" onClick={onSetAvailability}>
            Set your availability
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function AvailabilitySummary({ timezone, rules, onEdit }) {
  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <Box>
            <Typography variant="h6" component="h2">
              Your weekly availability
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Times are in {timezone}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            onClick={onEdit}
            sx={{
              color: "#13595e",
              borderColor: "#13595e",
              "&:hover": { borderColor: "#0e474b", bgcolor: "#eff7f6" },
            }}
          >
            Edit availability
          </Button>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Stack divider={<Divider flexItem />} spacing={1.5}>
          {DAY_NAMES.map((dayName, day) => {
            const windows = rules.filter((rule) => rule.day_of_week === day);
            return (
              <Stack key={dayName} direction="row" justifyContent="space-between" spacing={2}>
                <Typography sx={{ fontWeight: 600 }}>{dayName}</Typography>
                {windows.length === 0 ? (
                  <Typography color="text.secondary">Unavailable</Typography>
                ) : (
                  <Typography sx={{ textAlign: "right" }}>
                    {windows.map((rule) => `${rule.start_time}–${rule.end_time}`).join(", ")}
                  </Typography>
                )}
              </Stack>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function ProfessionalDashboardPage({ token, user, onEditAvailability }) {
  const [schedule, setSchedule] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    fetchAvailability(token)
      .then((data) => active && setSchedule(data))
      .catch((error) => active && setLoadError(error.message));
    return () => {
      active = false;
    };
  }, [token]);

  let content;
  if (loadError) {
    content = <Alert severity="error">{loadError}</Alert>;
  } else if (!schedule) {
    content = (
      <Card aria-busy="true" aria-live="polite">
        <CardContent sx={{ p: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" sx={{ fontSize: "1.25rem", width: 220 }} />
              <Skeleton variant="text" width={160} />
            </Box>
            <Skeleton variant="rounded" width={150} height={36} />
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={1.5}>
            {DAY_NAMES.map((dayName) => (
              <Stack key={dayName} direction="row" justifyContent="space-between" spacing={2}>
                <Skeleton variant="text" width={90} />
                <Skeleton variant="text" width={120} />
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>
    );
  } else if (schedule.rules.length === 0) {
    content = <WelcomeCard user={user} onSetAvailability={onEditAvailability} />;
  } else {
    content = (
      <AvailabilitySummary
        timezone={schedule.timezone}
        rules={schedule.rules}
        onEdit={onEditAvailability}
      />
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1">
          Dashboard
        </Typography>
        <Typography color="text.secondary">Signed in as {user.name}</Typography>
      </Box>
      {content}
    </Stack>
  );
}
