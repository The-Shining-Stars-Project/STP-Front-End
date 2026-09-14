"use client";

import type { ParticipantStatus } from "@/lib/types/api";

/**
 * The status dropdown for pages that list stars (Roster, Per-Star Planning, Weekly Data).
 * Defaults to the stars actually attending — Active, Needs attention, Auth pending — so a
 * former star does not sit on a roster until someone widens the filter (client ask, Sep 2026).
 */
export type StarStatusFilterValue = "active" | "prospective" | "former" | "notinterested" | "all";

export const DEFAULT_STAR_STATUS_FILTER: StarStatusFilterValue = "active";

const GROUPS: Record<Exclude<StarStatusFilterValue, "all">, readonly ParticipantStatus[]> = {
  active: ["Active", "Attention", "AuthPending"],
  prospective: ["Prospective", "Inquiry"],
  former: ["Former"],
  notinterested: ["NotInterested"],
};

const LABELS: Record<StarStatusFilterValue, string> = {
  active: "Active stars",
  prospective: "Prospective & inquiries",
  former: "Former",
  notinterested: "Not interested",
  all: "All statuses",
};

export function starStatusMatches(status: ParticipantStatus, filter: StarStatusFilterValue): boolean {
  return filter === "all" || GROUPS[filter].includes(status);
}

export default function StarStatusFilter({
  value,
  onChange,
}: {
  value: StarStatusFilterValue;
  onChange: (v: StarStatusFilterValue) => void;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-tertiary)" }}>
      Status
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as StarStatusFilterValue)}
        aria-label="Filter stars by status"
        style={{ border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "6px 8px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none" }}
      >
        {(Object.keys(LABELS) as StarStatusFilterValue[]).map((k) => (
          <option key={k} value={k}>{LABELS[k]}</option>
        ))}
      </select>
    </label>
  );
}
