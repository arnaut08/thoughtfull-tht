import { Box, Typography } from "@mui/material";

export default function PageSection({ title, subtitle, children }) {
  return (
    <Box
      component="section"
      sx={{
        maxWidth: "var(--max-width)",
        mx: "auto",
        px: "var(--gutter)",
        py: "var(--section-pad-app)",
      }}
    >
      <Box sx={{ mb: "var(--space-5)" }}>
        <Typography variant="h2" component="h2">
          {title}
        </Typography>
        {subtitle && <Typography color="text.secondary">{subtitle}</Typography>}
      </Box>
      {children}
    </Box>
  );
}
