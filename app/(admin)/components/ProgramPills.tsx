"use client";

import { Check } from "lucide-react";
import { programPillStyle, programTint } from "@/lib/programColor";
import type { ProgramSummaryDto } from "@/lib/types/api";

/**
 * The one program picker. Every pill is coloured from the program's own `colorHex`, so a
 * program created on the Programs page ("Manteca PT" → slug `manteca-pt`) highlights exactly
 * like the three whose slugs have hand-written CSS tokens. The pages that styled pills from
 * `var(--<slug>-fill)` were the ones users reported as "not highlighting".
 *
 * `value` is a program id, or null for the "all" chip (rendered only when `allLabel` is
 * given). With an "all" chip, clicking the selected pill again returns to "all".
 */
export default function ProgramPills({
  programs,
  value,
  onChange,
  allLabel,
  exclude,
  compact = false,
}: {
  programs: ProgramSummaryDto[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Label for a leading "all / none" chip. Omit for a required single choice. */
  allLabel?: string;
  /** Program ids to leave out (e.g. the primary program when picking the secondary). */
  exclude?: readonly string[];
  /** Slightly tighter padding for filter bars. */
  compact?: boolean;
}) {
  const toggleable = allLabel !== undefined;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {allLabel !== undefined && (
        <button
          type="button"
          className={`ss-chip${value === null ? " is-active" : ""}`}
          aria-pressed={value === null}
          style={{ cursor: "pointer" }}
          onClick={() => onChange(null)}
        >
          {allLabel}
        </button>
      )}
      {programs
        .filter((p) => !exclude?.includes(p.id))
        .map((p) => {
          const selected = value === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected && toggleable ? null : p.id)}
              style={{ ...programPillStyle(p.colorHex, selected), ...(compact ? { padding: "5px 11px" } : {}) }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: programTint(p.colorHex).accent, flexShrink: 0 }} />
              {p.name}
              {selected && <Check style={{ width: 12, height: 12 }} aria-hidden="true" />}
            </button>
          );
        })}
    </div>
  );
}
