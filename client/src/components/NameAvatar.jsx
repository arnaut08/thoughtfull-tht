import { Avatar } from "@mui/material";

function initialsOf(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

export default function NameAvatar({ name, ...props }) {
  return <Avatar {...props}>{initialsOf(name)}</Avatar>;
}
