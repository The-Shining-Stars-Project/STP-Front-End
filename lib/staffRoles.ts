import type { StaffRole } from "./types/api";

/** Every staff role, in the order the pickers show them. */
export const STAFF_ROLES: readonly StaffRole[] = ["Teacher", "TeacherAssistant", "Coordinator", "Admin"];

/** Display label for a role — the API value is a single word ("TeacherAssistant"). */
export function staffRoleLabel(role: StaffRole | string): string {
  return role === "TeacherAssistant" ? "Teacher Assistant" : role;
}
