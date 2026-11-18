import { request } from "./request.js";

export function fetchAvailability(token) {
  return request("/availability", { token });
}

export function saveAvailability(token, rules) {
  return request("/availability", { token, method: "PUT", body: { rules } });
}
