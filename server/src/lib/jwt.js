import jwt from "jsonwebtoken";

const ALGORITHM = "HS256";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET must be set in server/.env");
  }
  return secret;
}

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, getSecret(), {
    algorithm: ALGORITHM,
    expiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: [ALGORITHM] });
}
