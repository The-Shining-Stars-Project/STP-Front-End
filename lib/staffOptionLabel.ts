import type { StaffSummaryDto } from "./types/api";
import { staffRoleLabel } from "./staffRoles";
import { parseLocalDate } from "./format";

function monthYear(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * One line that tells two staff records apart in a dropdown — a duplicate name or a rehire
 * shows its programs, start month and "Former since …", so the right one gets linked to a login.
 */
export function staffOptionLabel(s: StaffSummaryDto): string {
  const programs = s.programNames.length ? s.programNames.join(", ") : "no program yet";
  const tenure = s.isFormer
    ? `Former${s.endDate ? ` since ${monthYear(s.endDate)}` : ""}`
    : `since ${monthYear(s.startDate)}`;
  return `${s.fullName} — ${staffRoleLabel(s.role)} (${programs}) · ${tenure}`;
}
