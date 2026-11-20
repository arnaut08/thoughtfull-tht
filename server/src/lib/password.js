import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password, storedHash) {
  return bcrypt.compare(password, storedHash);
}
