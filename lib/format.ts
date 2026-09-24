/** Shared display-formatting helpers. */

/** "Devon P." → "DP", "Cher" → "CH", "" → "?". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Parse a date-only string (e.g. "2026-07-21", or an ISO timestamp we only want
 * the date from) as *local* noon. Anchoring at noon avoids the classic off-by-one
 * where "2026-07-21" parsed as UTC midnight renders as the 20th in western zones.
 * The single source of truth for turning API date strings into Date objects.
 */
export function parseLocalDate(s: string): Date {
  return new Date(s.slice(0, 10) + "T12:00:00");
}

/** "2026-07-21" → "Jul 21". */
export function shortDate(s: string): string {
  return parseLocalDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "2026-07-21" → "July 21, 2026". */
export function longDate(s: string): string {
  return parseLocalDate(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/**
 * Parse an API *timestamp* — an instant, not a calendar date — into a Date.
 *
 * The backend records these with DateTime.UtcNow and they come back through SQL Server
 * with no timezone kind attached, so the JSON reads "2026-08-17T17:24:23.42" with no "Z".
 * `new Date()` treats that as local time, which silently shifts every audit entry by the
 * viewer's UTC offset — seven hours in California, and always in the direction that makes
 * an event look like it happened earlier than it did. Appending the Z when no designator
 * is present says out loud what the value already is.
 */
export function parseApiTimestamp(s: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
  return new Date(hasZone ? s : `${s}Z`);
}

/** An instant → "Aug 17, 2026, 10:24:23 AM" in the viewer's own timezone. */
export function timestampLabel(s: string): string {
  return parseApiTimestamp(s).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  });
}

/**
 * "yyyy-MM" for the viewer's LOCAL month. `toISOString().slice(0, 7)` is the UTC month, which
 * after ~5 pm Pacific on the last day of a month is already next month — Weekly Data,
 * Planning and the roll-up were opening on a month with no data yet.
 */
export function localMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
