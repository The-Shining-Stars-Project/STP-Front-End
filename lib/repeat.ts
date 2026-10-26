import { parseLocalDate } from "./format";
import type { RepeatFrequency } from "./types/api";

/**
 * Repeat (Oct 2026) — the form shape shared by the event and task modals, and the plain-English
 * summary shown under the picker and on repeating items. The API stores the rule and expands
 * occurrences itself; nothing here computes dates beyond the summary text.
 */
export type RepeatForm = {
  frequency: RepeatFrequency;
  interval: number;
  /** 0 = Sunday … 6 = Saturday (Weekly only). */
  weekdays: number[];
  /** yyyy-MM-dd, or "" for no end. */
  until: string;
};

export const NO_REPEAT: RepeatForm = { frequency: "None", interval: 1, weekdays: [], until: "" };

export const WEEKDAYS = [
  { n: 0, short: "S", abbr: "Sun", name: "Sunday" },
  { n: 1, short: "M", abbr: "Mon", name: "Monday" },
  { n: 2, short: "T", abbr: "Tue", name: "Tuesday" },
  { n: 3, short: "W", abbr: "Wed", name: "Wednesday" },
  { n: 4, short: "T", abbr: "Thu", name: "Thursday" },
  { n: 5, short: "F", abbr: "Fri", name: "Friday" },
  { n: 6, short: "S", abbr: "Sat", name: "Saturday" },
];

const UNIT: Record<Exclude<RepeatFrequency, "None">, [string, string]> = {
  Daily: ["day", "days"],
  Weekly: ["week", "weeks"],
  Monthly: ["month", "months"],
  Yearly: ["year", "years"],
};

/** The pieces of a DTO that describe its repeat, as a form value. */
export function repeatFromDto(d: { repeatFrequency?: RepeatFrequency; repeatInterval?: number; repeatWeekdays?: number[]; repeatUntil?: string | null }): RepeatForm {
  return {
    frequency: d.repeatFrequency ?? "None",
    interval: Math.max(1, d.repeatInterval ?? 1),
    weekdays: [...(d.repeatWeekdays ?? [])].sort(),
    until: d.repeatUntil ?? "",
  };
}

/** The request fields for a repeat form value. */
export function repeatToDto(r: RepeatForm) {
  if (r.frequency === "None") return { repeatFrequency: "None" as RepeatFrequency };
  return {
    repeatFrequency: r.frequency,
    repeatInterval: r.interval,
    repeatWeekdays: r.frequency === "Weekly" ? r.weekdays : [],
    repeatUntil: r.until || undefined,
  };
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/**
 * "Every 2 weeks on Mon, Wed until Dec 18, 2026". `startIso` is the first occurrence
 * (an event's date, a task's due date); without it the weekday/day parts are left out.
 */
export function repeatSummary(r: RepeatForm, startIso?: string | null): string {
  if (r.frequency === "None") return "Does not repeat";
  const [one, many] = UNIT[r.frequency];
  let s = r.interval === 1 ? `Every ${one}` : `Every ${r.interval} ${many}`;
  const start = startIso ? parseLocalDate(startIso) : null;

  if (r.frequency === "Weekly") {
    const days = r.weekdays.length > 0 ? r.weekdays : start ? [start.getDay()] : [];
    if (days.length > 0) s += ` on ${[...days].sort().map((d) => WEEKDAYS[d].abbr).join(", ")}`;
  } else if (r.frequency === "Monthly" && start) {
    const day = start.getDate();
    s += day > 28 ? ` on the ${ordinal(day)} (the last day in shorter months)` : ` on the ${ordinal(day)}`;
  } else if (r.frequency === "Yearly" && start) {
    s += ` on ${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }

  if (r.until) s += ` until ${parseLocalDate(r.until).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  return s;
}

/** Problems that would make the API refuse the rule, phrased for the form; null when fine. */
export function repeatProblem(r: RepeatForm, startIso?: string | null): string | null {
  if (r.frequency === "None") return null;
  if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > 99) return "Repeat every 1–99.";
  if (r.until && startIso && r.until < startIso) return "The repeat can't end before it starts.";
  return null;
}
