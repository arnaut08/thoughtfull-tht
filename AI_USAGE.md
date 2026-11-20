# AI Usage

I used two AI tools. I made the design decisions and reviewed everything that went into the repository, and I can explain every line.

## Tools

- **GitHub Copilot** (agent mode, about 34 sessions over four days) did most of the code generation: scaffolding, API routes, SQL functions, slot generation, the React UI, tests and Docker. It also drafted `README.md` and `DECISIONS.md` as features landed.
- **Claude** (chat) was used for planning and review rather than for writing application code: the initial architecture and data model, the calendar library choice, review of Copilot's plans before they were implemented, the plan and prompts for the UI revamp (design tokens, MUI theme, FullCalendar theming), review of Copilot's progress reports, and a final restructure of the README and DECISIONS. The CSS token and FullCalendar theme snippets were drafted by Claude and applied through Copilot.

## Where AI was used

| Area | How |
| --- | --- |
| Scaffolding, env config, Docker | Copilot |
| Auth (register, login, JWT, bcrypt) | Copilot |
| Availability model | Plan from Copilot, reviewed with Claude, changed by me (see example 1) |
| Slot generation (Luxon, DST) | Copilot, to my spec |
| Booking, cancel, reschedule SQL functions | Copilot, with locking and rules specified and corrected by me |
| Reminders and notifications | Copilot, to a spec I wrote |
| Blocked dates, minimum notice | Copilot |
| UI revamp | Claude planned and wrote prompts, Copilot executed in small passes |
| Tests | Copilot wrote them, I reviewed and pushed back on gaps |
| Docs | Copilot drafted, Claude helped restructure |

## Corrections, rejections and improvements

### 1. Rejected storing availability in UTC

- **What the AI produced:** Copilot's plan for availability converted working hours to UTC for storage, and treated the result (windows shifting by an hour when DST changes, stale windows after a timezone change) as an acceptable trade-off needing a re-save.
- **Why it was wrong:** a professional who sets "Monday 09:00" means 09:00 local every week. With UTC storage they would silently become available at 10:00 after a clock change, and members could book hours that were never offered. UTC windows also cross midnight (a Sydney 09:00 to 17:00 window spans two UTC days), which collided with the plan's own "end > start" constraint. The brief tests DST handling directly.
- **What I did:** I rejected it and had the plan rewritten. Availability is stored as `day_of_week` plus local `start_time`/`end_time` with no UTC columns, and conversion to UTC happens per date in the slot generator (`server/src/lib/slots.js`). Booked sessions stay as absolute instants. I reviewed the revised plan again before it was implemented.

### 2. Double-booking: the first version missed two required rules

- **What the AI produced:** booking that rejected a second booking of the same slot. When I asked whether edge cases like double bookings were handled, the first answer was a plain yes.
- **Problem:** the brief also requires that one member can't hold overlapping sessions with different professionals, and that past slots can't be booked. Neither was covered.
- **What I did:** I asked for tests, found both gaps, and had Copilot add them. `book_session` now locks the professional's row and then the member's (fixed order to avoid deadlocks), checks overlaps for both, and rejects a start in the past. The assistant couldn't run SQL against my Supabase project, so I ran the migration myself.

### 3. A professional's reschedule must never leave the member without a session

- **What the AI produced:** a first version where a professional changing a session could end with the member's existing session cancelled without a replacement assigned.
- **What I did:** I pushed back, since the brief says rescheduling must never leave the member with no session or two. A professional's reschedule now moves the existing session in place through the same `reschedule_session` function, skipping only the 24-hour check, and notifies the member in the same transaction.

### 4. Rejected a suggestion to skip the conflict check

- **What the AI produced:** when a professional moves a member's session, Copilot suggested skipping the overlap check against the member's other sessions.
- **What I did:** I said no. Skipping it would let a member end up with overlapping sessions. The check stayed, the error now names the member's conflicting session instead of saying the slot is "no longer available", and the message moved to a sticky footer because it was hidden below the calendar.

## Where I didn't follow AI suggestions

Claude's early plan suggested plain `pg`, TypeScript, and a 60-minute pitch with a 10-minute buffer. I stayed with the Supabase client and SQL functions, JavaScript (Claude had wrongly assumed TypeScript), and back-to-back 50-minute sessions, which fit working windows without waste. I also used FullCalendar for the members' booking view, where Claude had suggested a custom slot picker.

## How I verified AI output

- **Automated tests:** `cd server && npm test` (76 passing, 4 skipped when no throwaway database is configured, at the last run).
- **Manual testing in the browser** for every flow. Most of the layout bugs above were found this way, since the assistant couldn't see the UI.
- **Running the SQL myself** against a real Supabase project.
- **Reviewing plans before implementation** for the riskiest areas: availability storage, the booking transaction, and the reminder spec.
- **A restyle-only rule for the UI revamp.** It was done in small passes, with behavioural FullCalendar props and handlers off limits. Each pass reported the lines it touched, and I committed after each.
- **Data and secrets:** fictional data only, and no API keys pasted into AI chats.

## What I owned

The decisions that carry the product's risk were mine: local-time availability with per-date UTC conversion, lock-based double-booking protection, the 24-hour and professional-override rules, the reminder delivery spec (exactly once, restart-safe), and the design-token rules for the UI.