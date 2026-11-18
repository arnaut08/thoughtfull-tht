import { request } from "./request.js";

export function fetchMemberBookings(token) {
  return request("/bookings", { token });
}

export function fetchProfessionalBookings(token) {
  return request("/professional-bookings", { token });
}
