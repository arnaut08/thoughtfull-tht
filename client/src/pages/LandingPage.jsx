import { Box, Button, Stack, Typography } from "@mui/material";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import PublicIcon from "@mui/icons-material/Public";
import SearchIcon from "@mui/icons-material/Search";

const HIGHLIGHTS = [
  {
    icon: SearchIcon,
    title: "Find the right fit",
    text: "Browse professionals by what they offer and read profiles before you book.",
  },
  {
    icon: PublicIcon,
    title: "Stay in your timezone",
    text: "Every time is shown in your own zone, so nobody has to do the maths.",
  },
  {
    icon: EventRepeatIcon,
    title: "Rebook in a few clicks",
    text: "Reschedule or cancel a session without starting the conversation over.",
  },
];

export default function LandingPage({ onFindProfessional, onLogin }) {
  return (
    <Box>
      <Box sx={{ py: "var(--section-pad-marketing)", px: "var(--gutter)" }}>
        <Stack spacing={3} sx={{ maxWidth: 720, mx: "auto", textAlign: "center", alignItems: "center" }}>
          <Typography variant="h1" component="h1">
            Booking time with people who know your work
          </Typography>
          <Typography variant="h6" component="p" color="text.secondary" sx={{ fontWeight: 400 }}>
            Pick a professional, choose a slot that suits you both, and keep every session in one place.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ pt: 1 }}>
            <Button variant="contained" size="large" onClick={onFindProfessional}>
              Find a professional
            </Button>
            <Button variant="outlined" size="large" onClick={onLogin}>
              Log in
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ bgcolor: "surface.main", py: "var(--section-pad-app)", px: "var(--gutter)" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 3, md: 4 }}
          component="ul"
          sx={{ listStyle: "none", m: 0, p: 0, maxWidth: "var(--max-width)", mx: "auto" }}
        >
          {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
            <Stack key={title} component="li" spacing={1} sx={{ flex: 1 }}>
              <Icon sx={{ color: "primary.main" }} />
              <Typography variant="h6" component="h2">
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {text}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
