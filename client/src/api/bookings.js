import { request } from "./request.js";

export function fetchMemberBookings(token) {
  return request("/bookings", { token });
}

export function cancelMemberBooking(token, bookingId) {
  return request(`/bookings/${bookingId}`, { token, method: "DELETE" });
}

export function fetchProfessionalBookings(token) {
  return request("/professional-bookings", { token });
}

export function cancelProfessionalBooking(token, bookingId) {
  return request(`/professional-bookings/${bookingId}`, { token, method: "DELETE" });
}

export function rescheduleProfessionalBooking(token, bookingId, startsAt) {
  return request(`/professional-bookings/${bookingId}/reschedule`, {
    token,
    method: "POST",
    body: { starts_at: startsAt },
  });
}
