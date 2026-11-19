import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireProfessional } from "../middleware/requireProfessional.js";
import { normalizeRules, toApiRule } from "../lib/availability.js";
import {
  addBlockedDate,
  getBlockedDatesForProfessional,
  getRulesForProfessional,
  removeBlockedDate,
  replaceRulesForProfessional,
} from "../services/availability.js";
import { findUserById } from "../services/users.js";

export const availabilityRouter = Router();

availabilityRouter.use(requireAuth, requireProfessional);

// Returns a YYYY-MM-DD string for a real calendar date, or null.
function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = DateTime.fromISO(value);
  return date.isValid && date.toISODate() === value ? value : null;
}

availabilityRouter.get("/", async (request, response) => {
  const [user, rows, blockedDates] = await Promise.all([
    findUserById(request.user.id),
    getRulesForProfessional(request.user.id),
    getBlockedDatesForProfessional(request.user.id),
  ]);
  if (!user) {
    return response.status(404).json({ error: "User not found" });
  }
  response.json({
    timezone: user.timezone,
    rules: rows.map(toApiRule),
    blocked_dates: blockedDates,
  });
});

availabilityRouter.post("/blocked-dates", async (request, response) => {
  const date = parseDate(request.body?.date);
  if (!date) {
    return response.status(400).json({ error: "date must be a YYYY-MM-DD calendar date" });
  }

  await addBlockedDate(request.user.id, date);
  response.status(201).json({ blocked_dates: await getBlockedDatesForProfessional(request.user.id) });
});

availabilityRouter.delete("/blocked-dates/:date", async (request, response) => {
  const date = parseDate(request.params.date);
  if (!date) {
    return response.status(400).json({ error: "date must be a YYYY-MM-DD calendar date" });
  }

  await removeBlockedDate(request.user.id, date);
  response.json({ blocked_dates: await getBlockedDatesForProfessional(request.user.id) });
});

availabilityRouter.put("/", async (request, response) => {
  const { errors, rules } = normalizeRules(request.body?.rules);
  if (errors) {
    return response.status(400).json({ error: "Invalid availability", details: errors });
  }

  const saved = await replaceRulesForProfessional(request.user.id, rules);
  response.json({ rules: saved.map(toApiRule) });
});
