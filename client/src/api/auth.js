const apiUrl = import.meta.env.VITE_API_URL || "/api";

async function postJson(path, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error || "Request failed"), {
      details: data.details ?? {},
    });
  }
  return data;
}

export function register(values) {
  return postJson("/auth/register", values);
}

export function login(values) {
  return postJson("/auth/login", values);
}

export async function fetchCurrentUser(token) {
  const response = await fetch(`${apiUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("Session expired");
  }
  const data = await response.json();
  return data.user;
}
