import { useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import SpaIcon from "@mui/icons-material/Spa";
import { login, register } from "../api/auth.js";

const BRAND_700 = "#13595e";
const BRAND_800 = "#0e474b";
const BRAND_900 = "#0b3538";

const ROLES = [
  { value: "member", label: "Member" },
  { value: "professional", label: "Professional" },
];

function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const TIMEZONE_OPTIONS =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [browserTimezone()];

const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  role: "member",
  timezone: browserTimezone(),
};

export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === "signup";

  function handleModeChange(_event, nextMode) {
    setMode(nextMode);
    setFieldErrors({});
    setFormError("");
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
      component="main"
      sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2, bgcolor: "#fafaf9" }}
    >
      <Card
        sx={{
          width: "100%",
          maxWidth: 440,
          border: 0,
          borderRadius: 4,
          boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3, px: 0.5 }}>
            <SpaIcon sx={{ color: BRAND_700 }} />
            <Typography variant="h6" component="span" fontWeight={700} sx={{ color: BRAND_900 }}>
              Thoughtfull-THT
            </Typography>
          </Stack>
          <Tabs
            value={mode}
            onChange={handleModeChange}
            variant="fullWidth"
            sx={{
              mb: 3,
              "& .MuiTab-root": { textTransform: "none", fontWeight: 500, color: "#78716c" },
              "& .MuiTab-root.Mui-selected": { color: BRAND_800, fontWeight: 600 },
              "& .MuiTabs-indicator": { backgroundColor: BRAND_700 },
            }}
          >
            <Tab value="signin" label="Sign in" />
            <Tab value="signup" label="Sign up" />
          </Tabs>

          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}

          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{
              "& .MuiInputLabel-root.Mui-focused": { color: BRAND_700 },
              "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: BRAND_700,
              },
            }}
          >
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
                <TextField
                  select
                  label="I am a"
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  error={Boolean(fieldErrors.role)}
                  helperText={fieldErrors.role}
                  fullWidth
                >
                  {ROLES.map((role) => (
                    <MenuItem key={role.value} value={role.value}>
                      {role.label}
                    </MenuItem>
                  ))}
                </TextField>
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
                sx={{
                  bgcolor: BRAND_700,
                  boxShadow: "none",
                  textTransform: "none",
                  fontWeight: 600,
                  "&:hover": { bgcolor: BRAND_800, boxShadow: "none" },
                }}
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
