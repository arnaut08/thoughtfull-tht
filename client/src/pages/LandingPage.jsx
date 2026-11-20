import { Box, Button, Stack, Typography } from "@mui/material";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import PublicIcon from "@mui/icons-material/Public";
import SearchIcon from "@mui/icons-material/Search";

const HIGHLIGHTS = [
  {
    icon: SearchIcon,
    title: "Members: find the right fit",
    text: "Browse professionals, read their profiles, and book a slot that suits you.",
  },
  {
    icon: EventRepeatIcon,
    title: "Professionals: set your hours once",
    text: "Publish weekly hours that repeat, block off dates, and see every booking in one place.",
  },
  {
    icon: PublicIcon,
    title: "Everyone: stay in your timezone",
    text: "Every time is shown in your own zone, so nobody has to do the maths.",
  },
];

export default function LandingPage({ onFindProfessional, onLogin }) {
  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", py: "var(--section-pad-marketing)", px: "var(--gutter)" }}>
        <Stack spacing={3} sx={{ maxWidth: 720, mx: "auto", textAlign: "center", alignItems: "center" }}>
          <Typography variant="h1" component="h1" sx={{ textWrap: "balance" }}>
            Book time with the right people, from either side of the call
          </Typography>
          <Typography variant="h6" component="p" color="text.secondary" sx={{ fontWeight: 400 }}>
            Members find a professional and pick a slot. Professionals set their weekly hours and manage every session in one place.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ pt: 1 }}>
            <Button variant="contained" size="large" onClick={onFindProfessional}>
              Get started
            </Button>
            <Button variant="outlined" size="large" onClick={onLogin}>
              Log in
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Offering sessions yourself? Choose Professional when you sign up.
          </Typography>
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
