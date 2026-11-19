import NameAvatar from "./NameAvatar.jsx";

export default function InitialsAvatar({ name, sx, ...props }) {
  return (
    <NameAvatar
      name={name}
      {...props}
      sx={{ bgcolor: "surface.main", color: "primary.main", ...sx }}
    />
  );
}
