import { request } from "./request.js";

export function fetchNotifications(token) {
  return request("/notifications", { token });
}

export function markNotificationsRead(token) {
  return request("/notifications/read", { token, method: "POST" });
}
