// Rejects requests whose signed-in user doesn't have `role`. Must run after requireAuth.
export function requireRole(role, message) {
  return (request, response, next) => {
    if (request.user?.role !== role) {
      return response.status(403).json({ error: message });
    }
    next();
  };
}

export const requireMember = requireRole("member", "Only members can book sessions");
export const requireProfessional = requireRole("professional", "Only professionals can manage availability");
