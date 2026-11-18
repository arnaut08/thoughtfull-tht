export function requireMember(request, response, next) {
  if (request.user?.role !== "member") {
    return response.status(403).json({ error: "Only members can book sessions" });
  }
  next();
}
