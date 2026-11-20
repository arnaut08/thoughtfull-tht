import { request } from "./request.js";

export function fetchProfessionals(token) {
  return request("/professionals", { token });
}

export function fetchProfessionalProfile(token, professionalId, rescheduleBookingId) {
  const query = rescheduleBookingId ? `?reschedule=${encodeURIComponent(rescheduleBookingId)}` : "";
  return request(`/professionals/${professionalId}${query}`, { token });
}

export function bookProfessionalSlot(token, professionalId, startsAt) {
  return request(`/professionals/${professionalId}/bookings`, {
    token,
    method: "POST",
    body: { starts_at: startsAt },
  });
}

export function rescheduleProfessionalSlot(token, professionalId, bookingId, startsAt) {
  return request(`/professionals/${professionalId}/bookings/${bookingId}/reschedule`, {
    token,
    method: "POST",
    body: { starts_at: startsAt },
  });
}
