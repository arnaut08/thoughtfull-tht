import { randomUUID } from "node:crypto";
import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "1h";

// In-memory stand-in for the Supabase query builder subset used by services/users.js.
const rows = [];
const fakeSupabase = {
  from() {
    return {
      insert(values) {
        return {
          select() {
            return {
              single: async () => {
                if (rows.some((row) => row.email === values.email)) {
                  return { data: null, error: { code: "23505" } };
                }
                const row = { id: randomUUID(), created_at: new Date().toISOString(), ...values };
                rows.push(row);
                return { data: row, error: null };
              },
            };
          },
        };
      },
      select() {
        const filters = [];
        const builder = {
          eq(column, value) {
            filters.push([column, value]);
            return builder;
          },
          maybeSingle: async () => {
            const row = rows.find((candidate) =>
              filters.every(([column, value]) => candidate[column] === value),
            );
            return { data: row ?? null, error: null };
          },
        };
        return builder;
      },
    };
  },
};

jest.unstable_mockModule("../src/db.js", () => ({ supabase: fakeSupabase }));

const { default: request } = await import("supertest");
const { createApp } = await import("../src/app.js");

const app = createApp();

const validRegistration = {
  email: "Jane@Example.com",
  password: "correct-horse",
  name: "Jane Doe",
  role: "professional",
  timezone: "Asia/Kolkata",
};

async function register(overrides = {}) {
  return request(app).post("/api/auth/register").send({ ...validRegistration, ...overrides });
}

beforeEach(() => {
  rows.length = 0;
});

describe("POST /api/auth/register", () => {
  test("creates the user, returns a token, and formats createdAt in the user's timezone", async () => {
    const response = await register();

    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      email: "jane@example.com",
      name: "Jane Doe",
      role: "professional",
      timezone: "Asia/Kolkata",
    });
    expect(response.body.user.createdAt).toMatch(/\+05:30$/);
    expect(rows[0].password_hash).not.toContain("correct-horse");
  });

  test("rejects an invalid timezone, role, and missing name", async () => {
    const response = await register({ timezone: "Mars/Olympus", role: "admin", name: "  " });

    expect(response.status).toBe(400);
    expect(Object.keys(response.body.details)).toEqual(
      expect.arrayContaining(["timezone", "role", "name"]),
    );
    expect(rows).toHaveLength(0);
  });

  test("returns 409 when the email is already registered, ignoring case", async () => {
    await register();
    const response = await register({ email: "JANE@example.com" });

    expect(response.status).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await register();
  });

  test("returns a token for correct credentials", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "jane@example.com", password: "correct-horse" });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user.email).toBe("jane@example.com");
  });

  test("returns the same 401 for a wrong password and an unknown email", async () => {
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: "jane@example.com", password: "wrong-password" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "correct-horse" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe("GET /api/auth/me (requireAuth)", () => {
  test("returns the current user for a valid bearer token", async () => {
    const registered = await register();

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${registered.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("jane@example.com");
  });

  test("rejects requests without a bearer token", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
  });

  test("rejects a token signed with a different secret", async () => {
    await register();
    const forged = jwt.sign({ sub: rows[0].id, role: "member" }, "other-secret");

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${forged}`);

    expect(response.status).toBe(401);
  });
});
