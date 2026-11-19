import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import CalendarShell from "./CalendarShell.jsx";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: DashboardOutlinedIcon },
  { id: "calendar", label: "Calendar", icon: CalendarMonthOutlinedIcon },
  { id: "sessions", label: "Sessions", icon: VideocamOutlinedIcon },
  { id: "profile", label: "Profile", icon: PersonOutlineIcon },
  { id: "settings", label: "Settings", icon: SettingsOutlinedIcon },
];

function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatSessionTime(iso, timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function Sidebar({ activeId, onSelect }) {
  return (
    <aside className="flex flex-col gap-8 rounded-2xl bg-white p-5 shadow-sm md:sticky md:top-6 md:w-64 md:shrink-0 md:self-start">
      <div className="flex items-center gap-3 px-2">
        <span className="size-3 rounded-full bg-peach-300" aria-hidden="true" />
        <span className="text-lg font-semibold tracking-tight text-brand-900">thoughtfull</span>
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = id === activeId;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(id)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-peach-100 text-peach-700 shadow-sm"
                  : "text-stone-500 hover:bg-stone-50 hover:text-brand-800 hover:shadow-md hover:shadow-brand-900/10"
              }`}
            >
              <Icon fontSize="small" />
              {label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function DashboardHeader({ firstName }) {
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm text-stone-500">{today}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-900">
          {getGreeting()}, {firstName}
        </h1>
        <p className="mt-2 text-stone-500">Here's what's coming up this week.</p>
      </div>

      <label className="relative md:w-72">
        <span className="sr-only">Search sessions</span>
        <SearchIcon
          fontSize="small"
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-stone-400"
        />
        <input
          type="search"
          placeholder="Search sessions"
          className="w-full rounded-xl bg-white py-3 pr-4 pl-11 text-sm text-stone-700 shadow-sm placeholder:text-stone-400 focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
      </label>
    </header>
  );
}

function UpcomingSessionCard({ session, onJoin, onReschedule }) {
  if (!session) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-brand-900">Upcoming Session</h2>
        <p className="mt-1 text-sm text-stone-500">You have no sessions scheduled.</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="upcoming-session-title"
      className="flex flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm transition-shadow duration-300 hover:shadow-md hover:shadow-brand-900/10 md:flex-row md:items-center md:justify-between"
    >
      <div className="flex items-center gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-peach-100 text-peach-700">
          <VideocamOutlinedIcon />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-widest text-peach-700 uppercase">
            Next up
          </p>
          <h2 id="upcoming-session-title" className="mt-1 text-lg font-semibold text-brand-900">
            Upcoming Session
          </h2>
          <p className="text-sm text-stone-500">
            with {session.withName} · {formatSessionTime(session.startsAt, session.timeZone)}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onReschedule}
          className="rounded-xl bg-stone-100 px-5 py-3 text-sm font-medium text-stone-700 transition-shadow duration-200 hover:shadow-md hover:shadow-brand-900/10"
        >
          Reschedule
        </button>
        <button
          type="button"
          onClick={onJoin}
          className="rounded-xl bg-brand-700 px-5 py-3 text-sm font-medium text-white shadow-sm transition-shadow duration-200 hover:shadow-md hover:shadow-brand-900/10"
        >
          Join session
        </button>
      </div>
    </section>
  );
}

function CalendarPanel({ events }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm md:p-8">
      <div className="session-calendar">
        <CalendarShell>
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          buttonText={{ today: "Today", week: "Week", day: "Day" }}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridWeek,timeGridDay",
          }}
          allDaySlot={false}
          slotMinTime="08:00:00"
          slotMaxTime="20:00:00"
          slotDuration="00:30:00"
          nowIndicator
          height="auto"
          events={events}
        />
        </CalendarShell>
      </div>
    </section>
  );
}

/**
 * Sidebar + main layout for the scheduling and session dashboard.
 *
 * @param {object} props
 * @param {{ name: string }} props.user
 * @param {{ withName: string, startsAt: string, timeZone?: string } | null} [props.upcomingSession]
 * @param {Array<object>} [props.events] FullCalendar event objects.
 * @param {() => void} [props.onJoinSession]
 * @param {() => void} [props.onReschedule]
 */
export default function SessionDashboardLayout({
  user,
  upcomingSession = null,
  events = [],
  onJoinSession,
  onReschedule,
}) {
  const [activeNav, setActiveNav] = useState("overview");
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-stone-50 p-4 font-sans text-stone-700 md:flex-row md:p-6">
      <Sidebar activeId={activeNav} onSelect={setActiveNav} />

      <main className="flex min-w-0 flex-1 flex-col gap-8">
        <DashboardHeader firstName={firstName} />
        <UpcomingSessionCard
          session={upcomingSession}
          onJoin={onJoinSession}
          onReschedule={onReschedule}
        />
        <CalendarPanel events={events} />
      </main>
    </div>
  );
}
