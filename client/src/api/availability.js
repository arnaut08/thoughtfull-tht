import { request } from "./request.js";

export function fetchAvailability(token) {
  return request("/availability", { token });
}

export function saveAvailability(token, rules) {
  return request("/availability", { token, method: "PUT", body: { rules } });
}

export function saveBookingNotice(token, hours) {
  return request("/availability/booking-notice", { token, method: "PUT", body: { hours } });
}

export function blockDate(token, date, resolution) {
  return request("/availability/blocked-dates", { token, method: "POST", body: { date, resolution } });
}

export function fetchRescheduleSuggestions(token, date) {
  return request(`/availability/reschedule-suggestions?date=${date}`, { token });
}

export function unblockDate(token, date) {
  return request(`/availability/blocked-dates/${date}`, { token, method: "DELETE" });
}
