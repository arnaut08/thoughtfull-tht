import { lazy, Suspense, useState, useTransition } from "react";
import { Box, Container } from "@mui/material";
import AppFooter from "./AppFooter.jsx";
import AppHeader from "./AppHeader.jsx";
import {
  AvailabilityPageSkeleton,
  BlockedDatesPageSkeleton,
  MemberDashboardSkeleton,
  ProfessionalDashboardSkeleton,
  ProfessionalProfilePageSkeleton,
  ProfilePageSkeleton,
} from "./PageSkeletons.jsx";

// Pages are code-split so the calendar library loads only for the pages that use it.
const AvailabilityPage = lazy(() => import("../pages/AvailabilityPage.jsx"));
const BlockedDatesPage = lazy(() => import("../pages/BlockedDatesPage.jsx"));
const MemberDashboardPage = lazy(() => import("../pages/MemberDashboardPage.jsx"));
const ProfessionalDashboardPage = lazy(() => import("../pages/ProfessionalDashboardPage.jsx"));
const ProfessionalProfilePage = lazy(() => import("../pages/ProfessionalProfilePage.jsx"));
const ProfilePage = lazy(() => import("../pages/ProfilePage.jsx"));

export default function AppShell({ token, user, onSignOut }) {
  const [view, setViewState] = useState({ page: "home" });
  const [, startTransition] = useTransition();
  const isProfessional = user.role === "professional";

  // Navigation runs in a transition so the current page stays visible while the next page's code loads.
  const setView = (next) => startTransition(() => setViewState(next));
  const goHome = () => setView({ page: "home" });

  // Shown only while a page's code loads for the first time. Each matches that page's own loading skeleton.
  function renderFallback() {
    switch (view.page) {
      case "profile":
        return <ProfilePageSkeleton />;
      case "availability":
        return <AvailabilityPageSkeleton />;
      case "blockedDates":
        return <BlockedDatesPageSkeleton />;
      case "professional":
        return <ProfessionalProfilePageSkeleton />;
      default:
        return isProfessional ? <ProfessionalDashboardSkeleton /> : <MemberDashboardSkeleton />;
    }
  }

  function renderPage() {
    switch (view.page) {
      case "profile":
        return (
          <ProfilePage
            token={token}
            user={user}
            onEditAvailability={() => setView({ page: "availability" })}
            onManageBlockedDates={() => setView({ page: "blockedDates" })}
            onReschedule={(session) =>
              setView({
                page: "professional",
                professionalId: session.professional.id,
                rescheduleBookingId: session.id,
              })
            }
          />
        );
      case "availability":
        return (
          <AvailabilityPage
            token={token}
            user={user}
            onBack={() => setView({ page: "profile" })}
          />
        );
      case "blockedDates":
        return (
          <BlockedDatesPage
            token={token}
            user={user}
            onBack={() => setView({ page: "profile" })}
          />
        );
      case "professional":
        return view.rescheduleBookingId ? (
          <ProfessionalProfilePage
            token={token}
            professionalId={view.professionalId}
            memberTimezone={user.timezone}
            rescheduleBookingId={view.rescheduleBookingId}
            onBack={() => setView({ page: "profile" })}
            onRescheduled={() =>
              setView({ page: "professional", professionalId: view.professionalId })
            }
          />
        ) : (
          <ProfessionalProfilePage
            token={token}
            professionalId={view.professionalId}
            memberTimezone={user.timezone}
            onBack={goHome}
          />
        );
      default:
        return isProfessional ? (
          <ProfessionalDashboardPage
            token={token}
            user={user}
            onEditAvailability={() => setView({ page: "availability" })}
          />
        ) : (
          <MemberDashboardPage
            token={token}
            user={user}
            onSelectProfessional={(professionalId) =>
              setView({ page: "professional", professionalId })
            }
          />
        );
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
      <AppHeader
        token={token}
        user={user}
        activePage={view.page}
        onHome={goHome}
        onProfile={() => setView({ page: "profile" })}
        onSignOut={onSignOut}
      />
      <Container component="main" maxWidth="lg" sx={{ py: 3, flexGrow: 1 }}>
        <Suspense fallback={renderFallback()}>{renderPage()}</Suspense>
      </Container>
      <AppFooter />
    </Box>
  );
}
