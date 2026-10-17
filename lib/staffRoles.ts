import type { StaffRole } from "./types/api";

/** Every staff role, in the order the pickers show them. */
export const STAFF_ROLES: readonly StaffRole[] = ["Teacher", "TeacherAssistant", "Coordinator", "TechnologySystemsCoordinator", "Admin"];

const LABELS: Record<StaffRole, string> = {
  Teacher: "Teacher",
  TeacherAssistant: "Teacher Assistant",
  Coordinator: "Coordinator",
  TechnologySystemsCoordinator: "Technology & Systems Coordinator",
  Admin: "Admin",
};

/** Display label for a role — the API value is a single word ("TeacherAssistant"). */
export function staffRoleLabel(role: StaffRole | string): string {
  return LABELS[role as StaffRole] ?? role;
}

/** Roles with management-write access (mirrors the API's ManagementWrite policy). */
export function isManagementRole(role: StaffRole | string | null | undefined): boolean {
  return role === "Coordinator" || role === "TechnologySystemsCoordinator" || role === "Admin";
}

/**
 * Roles that carry their own stars: the only staff offered in Assigned-staff pickers and as
 * teacher chips on Roster, Per-Star Planning and Weekly Data. Admins and coordinators have
 * staff records for onboarding but must not "populate in data" (client, Oct 2026).
 */
export function isTeachingRole(role: StaffRole | string | null | undefined): boolean {
  return role === "Teacher" || role === "TeacherAssistant";
}

/** CSS colour class for `.ss-avatar` — the two coordinator roles share a colour, assistants match teachers. */
export function staffRoleAvatarClass(role: StaffRole | string): string {
  switch (role) {
    case "Admin": return "admin";
    case "Coordinator":
    case "TechnologySystemsCoordinator": return "coordinator";
    default: return "teacher";
  }
}
