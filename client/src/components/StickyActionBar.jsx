import { Box } from "@mui/material";

function StickyActionBar({ children, sx }) {
  return (
    <Box
      sx={{
        position: "sticky",
        bottom: 0,
        zIndex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 2,
        py: 1.5,
        bgcolor: "background.paper",
        borderTop: 1,
        borderColor: "divider",
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

export default StickyActionBar;
