import { request } from "./request.js";

export function fetchProfessionals(token) {
  return request("/professionals", { token });
}

export function fetchProfessionalProfile(token, professionalId) {
  return request(`/professionals/${professionalId}`, { token });
}
