import { Box, Typography } from "@mui/material";

export default function EmptyState({ icon, title, description, action }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-3)",
        py: "var(--section-pad-app)",
        textAlign: "center",
      }}
    >
      {icon && (
        <Box sx={{ display: "flex", color: "primary.main", "& > svg": { fontSize: "3rem" } }}>
          {icon}
        </Box>
      )}
      <Typography variant="h4" component="h3">
        {title}
      </Typography>
      {description && <Typography color="text.secondary">{description}</Typography>}
      {action}
    </Box>
  );
}
