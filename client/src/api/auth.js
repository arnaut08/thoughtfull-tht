import { API_URL, parseResponse } from "./request.js";

async function postJson(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse(response);
}

export function register(values) {
  return postJson("/auth/register", values);
}

export function login(values) {
  return postJson("/auth/login", values);
}

export async function fetchCurrentUser(token) {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("Session expired");
  }
  const data = await response.json();
  return data.user;
}
