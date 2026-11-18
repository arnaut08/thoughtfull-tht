import { useState } from "react";
import { Box, Container } from "@mui/material";
import AppHeader from "./AppHeader.jsx";
import AvailabilityPage from "../pages/AvailabilityPage.jsx";
import MemberDashboardPage from "../pages/MemberDashboardPage.jsx";
import ProfessionalDashboardPage from "../pages/ProfessionalDashboardPage.jsx";
import ProfessionalProfilePage from "../pages/ProfessionalProfilePage.jsx";
import ProfilePage from "../pages/ProfilePage.jsx";

export default function AppShell({ token, user, onSignOut }) {
  const [view, setView] = useState({ page: "home" });
  const isProfessional = user.role === "professional";

  const goHome = () => setView({ page: "home" });

  function renderPage() {
    switch (view.page) {
      case "profile":
        return (
          <ProfilePage
            token={token}
            user={user}
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
        return <AvailabilityPage token={token} user={user} onBack={goHome} />;
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
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppHeader
        token={token}
        user={user}
        onHome={goHome}
        onProfile={() => setView({ page: "profile" })}
        onSignOut={onSignOut}
      />
      <Container component="main" maxWidth="lg" sx={{ py: 3 }}>
        {renderPage()}
      </Container>
    </Box>
  );
}
