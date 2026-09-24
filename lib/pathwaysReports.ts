import { parseLocalDate } from "./format";

export type PathwaysReportDue = {
  /** "6-month report", "12-month report", "18-month report", … */
  label: string;
  /** yyyy-MM-dd */
  due: string;
  daysUntil: number;
};

/**
 * Pathways stars owe a progress report 6 and 12 months after their start date, then
 * every 6 months onward. Returns the next upcoming due date (never in the past).
 */
export function nextPathwaysReportDue(startDate: string, programTrack: string): PathwaysReportDue | null {
  if (programTrack !== "Pathways" || !startDate) return null;
  const start = parseLocalDate(startDate);
  if (Number.isNaN(start.getTime())) return null;

  const due = new Date(start);
  let months = 0;
  do {
    due.setMonth(due.getMonth() + 6);
    months += 6;
  } while (due.getTime() < Date.now());

  const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
  return {
    label: `${months}-month report`,
    due: iso,
    daysUntil: Math.ceil((due.getTime() - Date.now()) / 86_400_000),
  };
}
