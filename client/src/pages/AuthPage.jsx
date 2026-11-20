import { useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { login, register } from "../api/auth.js";

const ROLES = [
  { value: "member", label: "Member" },
  { value: "professional", label: "Professional" },
];

const INTROS = {
  signin: "Good to see you again. Sign in to pick up where you left off.",
  signup: "It takes a minute to set up. Tell us how you'll use ThoughtFull.",
};

function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const TIMEZONE_OPTIONS = (() => {
  const zone = browserTimezone();
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes(zone) ? zones : [zone, ...zones];
})();

const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  role: "member",
  timezone: browserTimezone(),
};

export default function AuthPage({ onAuthenticated, initialMode = "signin", initialRole = "member", onBack }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ ...EMPTY_FORM, role: initialRole });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === "signup";

  function handleModeChange(_event, nextMode) {
    setMode(nextMode);
    setFieldErrors({});
    setFormError("");
  }

  function handleRoleChange(_event, nextRole) {
    if (nextRole) setForm((current) => ({ ...current, role: nextRole }));
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError("");

    try {
      const result = isSignUp
        ? await register(form)
        : await login({ email: form.email, password: form.password });
      onAuthenticated(result);
    } catch (error) {
      setFieldErrors(error.details ?? {});
      setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box
      sx={{ display: "grid", placeItems: "center", p: 2, py: 6, bgcolor: "background.default" }}
    >
      <Card sx={{ width: "100%", maxWidth: 440 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={1} sx={{ mb: 3 }}>
            {onBack && (
              <Button
                variant="text"
                onClick={onBack}
                startIcon={<ArrowBackIcon />}
                sx={{ alignSelf: "flex-start", ml: -1 }}
              >
                Back
              </Button>
            )}
            <Typography variant="h5" component="span" color="primary.main">
              ThoughtFull
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {INTROS[mode]}
            </Typography>
          </Stack>
          <Tabs value={mode} onChange={handleModeChange} variant="fullWidth" sx={{ mb: 3 }}>
            <Tab value="signin" label="Sign in" />
            <Tab value="signup" label="Sign up" />
          </Tabs>

          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
              {isSignUp && (
                <TextField
                  label="Full name"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  error={Boolean(fieldErrors.name)}
                  helperText={fieldErrors.name}
                  autoComplete="name"
                  required
                  fullWidth
                />
              )}
              <TextField
                label="Email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                error={Boolean(fieldErrors.email)}
                helperText={fieldErrors.email}
                autoComplete="email"
                required
                fullWidth
              />
              <TextField
                label="Password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                error={Boolean(fieldErrors.password)}
                helperText={fieldErrors.password ?? (isSignUp ? "At least 8 characters" : undefined)}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
                fullWidth
              />
              {isSignUp && (
                <Box>
                  <Typography variant="body2" color="text.secondary" id="role-label" sx={{ mb: 1 }}>
                    I am a
                  </Typography>
                  <ToggleButtonGroup
                    exclusive
                    aria-labelledby="role-label"
                    value={form.role}
                    onChange={handleRoleChange}
                  >
                    {ROLES.map((role) => (
                      <ToggleButton key={role.value} value={role.value}>
                        {role.label}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                  {fieldErrors.role && (
                    <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.5 }}>
                      {fieldErrors.role}
                    </Typography>
                  )}
                </Box>
              )}
              {isSignUp && (
                <Autocomplete
                  options={TIMEZONE_OPTIONS}
                  value={form.timezone}
                  onChange={(_event, value) =>
                    setForm((current) => ({ ...current, timezone: value ?? "" }))
                  }
                  disableClearable
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Timezone"
                      error={Boolean(fieldErrors.timezone)}
                      helperText={fieldErrors.timezone}
                      required
                    />
                  )}
                />
              )}
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : null}
              >
                {isSignUp ? "Create account" : "Sign in"}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
