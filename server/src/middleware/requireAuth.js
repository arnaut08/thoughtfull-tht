import { verifyAccessToken } from "../lib/jwt.js";

export function requireAuth(request, response, next) {
  const header = request.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return response.status(401).json({ error: "Missing bearer token" });
  }

  try {
    const payload = verifyAccessToken(token);
    request.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired token" });
  }
}
