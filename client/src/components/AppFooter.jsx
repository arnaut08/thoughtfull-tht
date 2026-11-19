import { Box, Container, Typography } from "@mui/material";

export default function AppFooter() {
  return (
    <Box
      component="footer"
      sx={{ bgcolor: "secondary.main", color: "secondary.contrastText", py: 3 }}
    >
      <Container maxWidth="lg">
        <Typography variant="h6" component="p">
          ThoughtFull
        </Typography>
        <Typography variant="body2">© {new Date().getFullYear()} ThoughtFull</Typography>
      </Container>
    </Box>
  );
}
