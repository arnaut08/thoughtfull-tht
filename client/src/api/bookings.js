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
