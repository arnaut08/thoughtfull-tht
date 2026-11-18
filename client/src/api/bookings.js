import { request } from "./request.js";

export function fetchMemberBookings(token) {
  return request("/bookings", { token });
}
