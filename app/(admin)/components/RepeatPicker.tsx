"use client";

import { Repeat } from "lucide-react";
import { parseLocalDate } from "@/lib/format";
import { WEEKDAYS, repeatProblem, repeatSummary, type RepeatForm } from "@/lib/repeat";
import type { RepeatFrequency } from "@/lib/types/api";

const OPTIONS: { value: RepeatFrequency; label: string }[] = [
  { value: "None", label: "Doesn't repeat" },
  { value: "Daily", label: "Daily" },
  { value: "Weekly", label: "Weekly" },
  { value: "Monthly", label: "Monthly" },
  { value: "Yearly", label: "Yearly" },
];

const UNIT: Record<RepeatFrequency, string> = { None: "", Daily: "day", Weekly: "week", Monthly: "month", Yearly: "year" };

const inputStyle: React.CSSProperties = {
  boxSizing: "border-box", border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
  padding: "6px 10px", fontSize: 13, color: "var(--fg)", background: "var(--surface)", outline: "none", minHeight: 34,
};

/**
 * Repeat (Oct 2026), shared by the event and task modals. `startIso` is the first occurrence
 * (the event's date / the task's due date): it supplies the default weekday and the summary.
 * Pass `disabledReason` to show why repeating isn't available yet (a task with no due date).
 */
export default function RepeatPicker({
  value,
  onChange,
  startIso,
  disabledReason,
}: {
  value: RepeatForm;
  onChange: (next: RepeatForm) => void;
  startIso?: string | null;
  disabledReason?: string;
}) {
  const repeats = value.frequency !== "None";
  const problem = repeatProblem(value, startIso);

  function pick(f: RepeatFrequency) {
    // Weekly starts with the start's weekday ticked, so the chips show what will happen.
    const weekdays = f === "Weekly" && value.weekdays.length === 0 && startIso ? [parseLocalDate(startIso).getDay()] : value.weekdays;
    onChange({ ...value, frequency: f, weekdays });
  }

  function toggleDay(d: number) {
    const has = value.weekdays.includes(d);
    // Never leave Weekly with no day ticked; the start's weekday is the floor.
    const next = has ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d].sort();
    onChange({ ...value, weekdays: next.length > 0 ? next : value.weekdays });
  }

  return (
    <div>
      <div className="ss-label" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <Repeat style={{ width: 12, height: 12 }} aria-hidden="true" />Repeat
      </div>

      {disabledReason ? (
        <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>{disabledReason}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }} role="group" aria-label="Repeat">
            {OPTIONS.map((o) => (
              <button key={o.value} type="button" className={`ss-chip${value.frequency === o.value ? " is-active" : ""}`}
                aria-pressed={value.frequency === o.value} style={{ cursor: "pointer", minHeight: 34 }} onClick={() => pick(o.value)}>
                {o.label}
              </button>
            ))}
          </div>

          {repeats && (
            <>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fg-secondary)" }}>
                Every
                <input type="number" min={1} max={99} value={value.interval} aria-label={`Repeat every how many ${UNIT[value.frequency]}s`}
                  onChange={(e) => onChange({ ...value, interval: Math.trunc(Number(e.target.value)) || 1 })}
                  style={{ ...inputStyle, width: 64 }} />
                {value.interval === 1 ? UNIT[value.frequency] : `${UNIT[value.frequency]}s`}
              </label>

              {value.frequency === "Weekly" && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} role="group" aria-label="On these days">
                  {WEEKDAYS.map((d) => {
                    const on = value.weekdays.includes(d.n);
                    return (
                      <button key={d.n} type="button" className={`ss-chip${on ? " is-active" : ""}`} aria-pressed={on} aria-label={d.name} title={d.name}
                        style={{ cursor: "pointer", minHeight: 34, minWidth: 34, justifyContent: "center" }} onClick={() => toggleDay(d.n)}>
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, color: "var(--fg-secondary)" }} role="group" aria-label="Ends">
                Ends
                <button type="button" className={`ss-chip${!value.until ? " is-active" : ""}`} aria-pressed={!value.until} style={{ cursor: "pointer", minHeight: 34 }}
                  onClick={() => onChange({ ...value, until: "" })}>
                  Never
                </button>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  On
                  <input type="date" value={value.until} min={startIso ?? undefined} aria-label="Repeat until"
                    onChange={(e) => onChange({ ...value, until: e.target.value })} style={inputStyle} />
                </label>
              </div>
            </>
          )}

          <div aria-live="polite" style={{ fontSize: 12, color: problem ? "var(--danger)" : "var(--fg-tertiary)" }}>
            {problem ?? repeatSummary(value, startIso)}
          </div>
        </div>
      )}
    </div>
  );
}
