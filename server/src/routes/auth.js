import { Router } from "express";
import { IANAZone } from "luxon";
import { requireAuth } from "../middleware/requireAuth.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signAccessToken } from "../lib/jwt.js";
import {
  EmailTakenError,
  createUser,
  findUserByEmail,
  findUserById,
  toPublicUser,
} from "../services/users.js";

const ROLES = ["member", "professional"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function validateRegistration(body) {
  const errors = {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!EMAIL_PATTERN.test(email)) errors.email = "A valid email is required";
  if (typeof body.password !== "string" || body.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (!name || name.length > 100) errors.name = "Name is required (max 100 characters)";
  if (!ROLES.includes(body.role)) errors.role = `Role must be one of: ${ROLES.join(", ")}`;
  if (typeof body.timezone !== "string" || !IANAZone.isValidZone(body.timezone)) {
    errors.timezone = "Timezone must be a valid IANA zone, e.g. America/New_York";
  }

  return { errors, value: { email, name, role: body.role, timezone: body.timezone, password: body.password } };
}

export const authRouter = Router();

authRouter.post("/register", async (request, response) => {
  const { errors, value } = validateRegistration(request.body ?? {});
  if (Object.keys(errors).length > 0) {
    return response.status(400).json({ error: "Invalid registration", details: errors });
  }

  try {
    const row = await createUser({
      email: value.email,
      passwordHash: await hashPassword(value.password),
      name: value.name,
      role: value.role,
      timezone: value.timezone,
    });
    const user = toPublicUser(row);
    response.status(201).json({ token: signAccessToken(user), user });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return response.status(409).json({ error: error.message });
    }
    throw error;
  }
});

authRouter.post("/login", async (request, response) => {
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const password = request.body?.password;

  const row = email ? await findUserByEmail(email) : null;
  const passwordMatches =
    row && typeof password === "string" && (await verifyPassword(password, row.password_hash));

  if (!passwordMatches) {
    return response.status(401).json({ error: "Invalid email or password" });
  }

  const user = toPublicUser(row);
  response.json({ token: signAccessToken(user), user });
});

authRouter.get("/me", requireAuth, async (request, response) => {
  const row = await findUserById(request.user.id);
  if (!row) {
    return response.status(404).json({ error: "User not found" });
  }
  response.json({ user: toPublicUser(row) });
});
