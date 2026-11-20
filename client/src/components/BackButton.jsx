import { Button } from "@mui/material";

function BackButton({ onClick, children }) {
  return (
    <Button
      variant="outlined"
      onClick={onClick}
      sx={{
        alignSelf: "flex-start",
        color: "primary.main",
        borderColor: "primary.main",
        "&:hover": { borderColor: "primary.dark", bgcolor: "action.hover" },
      }}
    >
      {children}
    </Button>
  );
}

export default BackButton;
