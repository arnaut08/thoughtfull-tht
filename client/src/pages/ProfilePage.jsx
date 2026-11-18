import { Box, Card, CardContent, Chip, Divider, Stack, Typography } from "@mui/material";
import NameAvatar from "../components/NameAvatar.jsx";

function DetailRow({ label, value }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography sx={{ textAlign: "right", wordBreak: "break-word" }}>{value}</Typography>
    </Stack>
  );
}

export default function ProfilePage({ user }) {
  const roleLabel = user.role === "professional" ? "Professional" : "Member";

  return (
    <Stack spacing={3} sx={{ maxWidth: 720, mx: "auto" }}>
      <Typography variant="h5" component="h1">
        Profile
      </Typography>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <NameAvatar name={user.name} sx={{ width: 64, height: 64, bgcolor: "primary.main" }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" component="h2" noWrap>
                {user.name}
              </Typography>
              <Chip size="small" label={roleLabel} variant="outlined" />
            </Box>
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Stack spacing={2}>
            <DetailRow label="Email" value={user.email} />
            <DetailRow label="Timezone" value={user.timezone} />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
