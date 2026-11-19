import { request } from "./request.js";

export function fetchAvailability(token) {
  return request("/availability", { token });
}

export function saveAvailability(token, rules) {
  return request("/availability", { token, method: "PUT", body: { rules } });
}

export function blockDate(token, date) {
  return request("/availability/blocked-dates", { token, method: "POST", body: { date } });
}

export function unblockDate(token, date) {
  return request(`/availability/blocked-dates/${date}`, { token, method: "DELETE" });
}
