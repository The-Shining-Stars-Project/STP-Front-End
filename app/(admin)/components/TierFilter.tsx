"use client";

import type { ProgressLevel } from "@/lib/types/api";

export const TIERS: { value: ProgressLevel; label: string }[] = [
  { value: "Novice", label: "Novice" },
  { value: "Intermediate", label: "Intermediate" },
  { value: "Expert", label: "Expert" },
  { value: "Vocational", label: "Vocational" },
  { value: "NotApplicable", label: "N/A" },
];

export function tierLabel(t: ProgressLevel): string {
  return TIERS.find((x) => x.value === t)?.label ?? t;
}

/** Chip row: "All tiers" or one primary tier (from Per-Star Planning). null = all. */
export default function TierFilter({ value, onChange, counts }: {
  value: ProgressLevel | null;
  onChange: (v: ProgressLevel | null) => void;
  counts?: Map<ProgressLevel, number>;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Tier</span>
      <button type="button" className={`ss-chip${value === null ? " is-active" : ""}`} aria-pressed={value === null} style={{ cursor: "pointer" }} onClick={() => onChange(null)}>All tiers</button>
      {TIERS.filter((t) => !counts || (counts.get(t.value) ?? 0) > 0).map((t) => (
        <button key={t.value} type="button" className={`ss-chip${value === t.value ? " is-active" : ""}`} aria-pressed={value === t.value} style={{ cursor: "pointer" }} onClick={() => onChange(value === t.value ? null : t.value)}>
          {t.label}{counts && <span style={{ opacity: 0.7, marginLeft: 4 }}>{counts.get(t.value) ?? 0}</span>}
        </button>
      ))}
    </div>
  );
}
