import { Chip } from "@mui/material";
import { alpha } from "@mui/material/styles";

const STATUSES = {
  upcoming: {
    label: "Upcoming",
    sx: (theme) => ({
      bgcolor: alpha(theme.palette.primary.main, 0.12),
      color: "primary.main",
    }),
  },
  past: {
    label: "Past",
    sx: { bgcolor: "action.hover", color: "text.secondary" },
  },
  cancelled: {
    label: "Cancelled",
    sx: {
      bgcolor: "action.hover",
      color: "text.secondary",
      "& .MuiChip-label": { textDecoration: "line-through" },
    },
  },
};

export default function StatusChip({ status }) {
  const { label, sx } = STATUSES[status];
  return <Chip size="small" label={label} sx={sx} />;
}
