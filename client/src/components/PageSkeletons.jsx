import { Box, Card, CardContent, Skeleton, Stack } from "@mui/material";

export function ProfessionalCardSkeleton() {
  return (
    <Card sx={{ height: "100%", border: 0, boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <Skeleton variant="circular" width={56} height={56} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton variant="text" sx={{ fontSize: "1.25rem", width: "60%" }} />
            <Skeleton variant="text" width="40%" />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function MemberDashboardSkeleton() {
  return (
    <Stack spacing={3} aria-busy="true" aria-live="polite">
      <Box>
        <Skeleton variant="text" sx={{ fontSize: "1.5rem", width: 200 }} />
        <Skeleton variant="text" width={320} />
      </Box>
      <Box
        sx={{
          display: "grid",
          gap: 2.5,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
        }}
      >
        {Array.from({ length: 3 }, (_, index) => (
          <ProfessionalCardSkeleton key={index} />
        ))}
      </Box>
    </Stack>
  );
}

export function ProfessionalDashboardSkeleton() {
  return (
    <Stack spacing={3} aria-busy="true" aria-live="polite">
      <Box>
        <Skeleton variant="text" sx={{ fontSize: "1.5rem", width: 200 }} />
        <Skeleton variant="text" width={260} />
      </Box>
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Skeleton variant="rounded" height={480} />
        </CardContent>
      </Card>
    </Stack>
  );
}

export function ProfilePageSkeleton() {
  return (
    <Stack spacing={3} sx={{ maxWidth: 720, mx: "auto" }} aria-busy="true" aria-live="polite">
      <Skeleton variant="text" sx={{ fontSize: "1.5rem", width: 120 }} />
      <Skeleton variant="rounded" height={120} />
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Skeleton variant="text" sx={{ fontSize: "1.25rem", width: 120 }} />
          <Stack spacing={2} sx={{ mt: 1.5 }}>
            <Skeleton variant="rounded" height={88} />
            <Skeleton variant="rounded" height={88} />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export function AvailabilityPageSkeleton() {
  return (
    <Stack spacing={2} aria-busy="true" aria-live="polite">
      <Skeleton variant="rounded" width={180} height={36} sx={{ alignSelf: "flex-start" }} />
      <Box>
        <Skeleton variant="text" sx={{ fontSize: "1.5rem", width: 200 }} />
        <Skeleton variant="text" width={260} />
      </Box>
      <Card>
        <CardContent>
          <Skeleton variant="rounded" height={560} />
        </CardContent>
      </Card>
    </Stack>
  );
}

export function BlockedDatesPageSkeleton() {
  return (
    <Stack spacing={2} aria-busy="true" aria-live="polite">
      <Skeleton variant="rounded" width={180} height={36} sx={{ alignSelf: "flex-start" }} />
      <Skeleton variant="text" sx={{ fontSize: "1.5rem", width: 200 }} />
      <Card>
        <CardContent>
          <Skeleton variant="rounded" height={480} />
        </CardContent>
      </Card>
    </Stack>
  );
}

export function ProfessionalProfilePageSkeleton() {
  return (
    <Stack spacing={2} aria-busy="true" aria-live="polite">
      <Box>
        <Skeleton variant="text" sx={{ fontSize: "1.5rem", width: 220 }} />
        <Skeleton variant="text" width={300} />
      </Box>
      <Card>
        <CardContent>
          <Skeleton variant="rounded" height={560} />
        </CardContent>
      </Card>
    </Stack>
  );
}
