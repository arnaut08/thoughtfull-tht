import { Skeleton, Stack } from "@mui/material";

export default function PageLoadingSkeleton() {
  return (
    <Stack spacing={3} sx={{ maxWidth: 1200, mx: "auto" }} aria-busy="true" aria-live="polite">
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Skeleton variant="circular" width={32} height={32} />
          <Skeleton variant="text" width={140} />
        </Stack>
        <Skeleton variant="circular" width={40} height={40} />
      </Stack>
      <Skeleton variant="text" sx={{ fontSize: "1.5rem", width: 240 }} />
      <Skeleton variant="rounded" height={320} />
    </Stack>
  );
}
