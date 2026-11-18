import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../middleware/requireAuth.js";
import { toApiRule } from "../lib/availability.js";
import { SLOT_HORIZON_DAYS, generateOpenSlots } from "../lib/slots.js";
import { getRulesForProfessional } from "../services/availability.js";
import { getBookingsOverlapping, listProfessionals } from "../services/professionals.js";
import { findUserById } from "../services/users.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toProfessionalSummary(row) {
  return { id: row.id, name: row.name, timezone: row.timezone };
}

export const professionalsRouter = Router();

professionalsRouter.use(requireAuth);

professionalsRouter.get("/", async (_request, response) => {
  const rows = await listProfessionals();
  response.json({ professionals: rows.map(toProfessionalSummary) });
});

// Open slots are returned as ISO timestamps in the requesting member's timezone.
professionalsRouter.get("/:id", async (request, response) => {
  const { id } = request.params;
  if (!UUID_PATTERN.test(id)) {
    return response.status(404).json({ error: "Professional not found" });
  }

  const [member, professional] = await Promise.all([
    findUserById(request.user.id),
    findUserById(id),
  ]);
  if (!member) {
    return response.status(404).json({ error: "User not found" });
  }
  if (!professional || professional.role !== "professional") {
    return response.status(404).json({ error: "Professional not found" });
  }

  const now = DateTime.utc();
  const horizonEnd = now.plus({ days: SLOT_HORIZON_DAYS });
  const [rows, bookings] = await Promise.all([
    getRulesForProfessional(id),
    getBookingsOverlapping(id, now, horizonEnd),
  ]);

  const slots = generateOpenSlots({
    rules: rows.map(toApiRule),
    timezone: professional.timezone,
    now,
    horizonEnd,
    booked: bookings.map((booking) => ({
      start: DateTime.fromISO(booking.starts_at),
      end: DateTime.fromISO(booking.ends_at),
    })),
  });

  response.json({
    professional: toProfessionalSummary(professional),
    timezone: member.timezone,
    slots: slots.map(({ start, end }) => ({
      start: start.setZone(member.timezone).toISO(),
      end: end.setZone(member.timezone).toISO(),
    })),
  });
});
