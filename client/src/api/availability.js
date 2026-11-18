const apiUrl = import.meta.env.VITE_API_URL || "/api";

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error || "Request failed"), {
      details: data.details ?? {},
    });
  }
  return data;
}

export function fetchAvailability(token) {
  return request("/availability", { token });
}

export function saveAvailability(token, rules) {
  return request("/availability", { token, method: "PUT", body: { rules } });
}
