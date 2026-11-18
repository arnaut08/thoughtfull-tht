export function requireProfessional(request, response, next) {
  if (request.user?.role !== "professional") {
    return response.status(403).json({ error: "Only professionals can manage availability" });
  }
  next();
}
