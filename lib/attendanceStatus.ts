import type { AttendanceStatus } from "./types/api";

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  Present: "Present",
  Absent: "Absent",
  Unmarked: "Unmarked",
  Rescheduled: "Rescheduled",
  NotScheduled: "Not scheduled",
};

export function attendanceLabel(s: AttendanceStatus): string { return ATTENDANCE_LABELS[s] ?? s; }

/** Statuses only coordinators/admins may set (mirrors the API's check). */
export const MANAGEMENT_ONLY_STATUSES: readonly AttendanceStatus[] = ["Rescheduled", "NotScheduled"];
export function isManagementStatus(s: AttendanceStatus): boolean { return MANAGEMENT_ONLY_STATUSES.includes(s); }
