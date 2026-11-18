import { request } from "./request.js";

export function fetchProfessionals(token) {
  return request("/professionals", { token });
}

export function fetchProfessionalProfile(token, professionalId) {
  return request(`/professionals/${professionalId}`, { token });
}

export function bookProfessionalSlot(token, professionalId, startsAt) {
  return request(`/professionals/${professionalId}/bookings`, {
    token,
    method: "POST",
    body: { starts_at: startsAt },
  });
}
