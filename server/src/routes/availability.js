import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireProfessional } from "../middleware/requireProfessional.js";
import { normalizeRules, toApiRule } from "../lib/availability.js";
import {
  getRulesForProfessional,
  replaceRulesForProfessional,
} from "../services/availability.js";
import { findUserById } from "../services/users.js";

export const availabilityRouter = Router();

availabilityRouter.use(requireAuth, requireProfessional);

availabilityRouter.get("/", async (request, response) => {
  const [user, rows] = await Promise.all([
    findUserById(request.user.id),
    getRulesForProfessional(request.user.id),
  ]);
  if (!user) {
    return response.status(404).json({ error: "User not found" });
  }
  response.json({ timezone: user.timezone, rules: rows.map(toApiRule) });
});

availabilityRouter.put("/", async (request, response) => {
  const { errors, rules } = normalizeRules(request.body?.rules);
  if (errors) {
    return response.status(400).json({ error: "Invalid availability", details: errors });
  }

  const saved = await replaceRulesForProfessional(request.user.id, rules);
  response.json({ rules: saved.map(toApiRule) });
});
