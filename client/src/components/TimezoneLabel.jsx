import { Chip } from "@mui/material";
import PublicIcon from "@mui/icons-material/Public";

export default function TimezoneLabel({ timezone }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<PublicIcon />}
      label={timezone}
      sx={{ color: "text.secondary" }}
    />
  );
}
