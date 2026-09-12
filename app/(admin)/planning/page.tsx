"use client";

import { useEffect, useMemo, useState } from "react";
import { Target, Check } from "lucide-react";
import { planningApi } from "@/lib/api/planning";
import { useMyPrograms, useStaff, useObjectiveAreas } from "@/lib/api/hooks";
import ProgramPills from "../components/ProgramPills";
import type {
  PerStarPlanDto,
  ProgramSummaryDto,
  StaffSummaryDto,
  ObjectiveAreaDto,
  ProgressLevel,
} from "@/lib/types/api";

const LEVELS: { value: ProgressLevel; label: string }[] = [
  { value: "Novice", label: "Novice" },
  { value: "Intermediate", label: "Intermediate" },
  { value: "Expert", label: "Expert" },
  { value: "NotApplicable", label: "N/A" },
];

const fieldStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", border: "0.5px solid var(--border-hover)",
  borderRadius: "var(--r-md)", padding: "6px 9px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none",
};

function Label({ children }: { children: React.ReactNode }) {
  return <div className="ss-label" style={{ marginBottom: 4, color: "var(--fg-tertiary)" }}>{children}</div>;
}

export default function PlanningPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.toISOString().slice(0, 7));
  const [programId, setProgramId] = useState<string | null>(null);

  const [plans, setPlans] = useState<PerStarPlanDto[]>([]);
  // Cached + shared via React Query (#34).
  const programs: ProgramSummaryDto[] = useMyPrograms().data ?? [];
  const staff: StaffSummaryDto[] = useStaff().data ?? [];
  // Per-star planning works against the part-time framework's areas.
  const areas: ObjectiveAreaDto[] = (useObjectiveAreas().data ?? []).filter((a) => a.track === "PartTime");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    planningApi.getPerStar(month, programId ?? undefined)
      .then((d) => { setPlans(d); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [month, programId]);

  const areaById = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a])), [areas]);

  function save(plan: PerStarPlanDto, patch: Partial<PerStarPlanDto>) {
    const merged = { ...plan, ...patch };
    setPlans((prev) => prev.map((p) => (p.participantId === plan.participantId ? merged : p)));
    setSavingId(plan.participantId);
    planningApi.upsertPerStar({
      participantId: plan.participantId,
      monthKey: month,
      assignedStaffId: merged.assignedStaffId,
      primaryTier: merged.primaryTier,
      priorityObjectiveAreaId: merged.priorityObjectiveAreaId,
      prioritySubSkillId: merged.prioritySubSkillId,
      monthlyGoal: merged.monthlyGoal,
      howIllSupport: merged.howIllSupport,
      notes: merged.notes,
    })
      .then((saved) => setPlans((prev) => prev.map((p) => (p.participantId === saved.participantId ? saved : p))))
      .catch(() => {})
      .finally(() => setSavingId((cur) => (cur === plan.participantId ? null : cur)));
  }

  const byProgram = useMemo(() => {
    const map = new Map<string, { name: string; slug: string; rows: PerStarPlanDto[] }>();
    for (const p of plans) {
      if (!map.has(p.programId)) map.set(p.programId, { name: p.programName || "No program", slug: p.programSlug, rows: [] });
      map.get(p.programId)!.rows.push(p);
    }
    for (const g of map.values()) g.rows.sort((a, b) => a.participantName.localeCompare(b.participantName));
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [plans]);

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles"><h1>Per-Star Planning</h1></div>
        <div className="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            style={{ border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "6px 8px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none" }} />
        </div>
      </div>

      <div className="adm-content">
        <div className="info-note" style={{ marginBottom: "var(--space-3)" }}>
          <Target />
          <span>Each star&apos;s monthly priorities — their primary tier, the objective area &amp; sub-skill to focus on, a goal with a +1 growing edge, and how staff will support it. Changes save automatically.</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
          <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Program</span>
          <ProgramPills programs={programs} value={programId} onChange={setProgramId} allLabel="All" compact />
        </div>

        {error ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>Couldn&apos;t load plans — check the API and try again.</div>
        ) : loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading…</div>
        ) : plans.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>No stars.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            {byProgram.map((prog) => (
              <div key={prog.name}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-2)" }}>
                  <span className={`ss-dot ${prog.slug}`} />
                  <h3 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)", margin: 0 }}>{prog.name}</h3>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "var(--space-4)" }}>
                  {prog.rows.map((plan) => {
                    const areaSubs = plan.priorityObjectiveAreaId ? (areaById[plan.priorityObjectiveAreaId]?.subSkills ?? []) : [];
                    return (
                      <div key={plan.participantId} style={{ border: "0.5px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface)", padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="ss-avatar teacher sm">{plan.participantInitials}</span>
                          <span style={{ fontSize: "var(--fs-body)", fontWeight: "var(--w-medium)", flex: 1 }}>{plan.participantName}</span>
                          {savingId === plan.participantId && <Check style={{ width: 13, height: 13, color: "var(--success)" }} />}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
                          <div>
                            <Label>Primary tier</Label>
                            <select value={plan.primaryTier} onChange={(e) => save(plan, { primaryTier: e.target.value as ProgressLevel })} style={fieldStyle}>
                              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <Label>Assigned staff</Label>
                            <select value={plan.assignedStaffId ?? ""} onChange={(e) => save(plan, { assignedStaffId: e.target.value || null })} style={fieldStyle}>
                              <option value="">—</option>
                              {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                            </select>
                          </div>
                          <div>
                            <Label>Priority area</Label>
                            <select value={plan.priorityObjectiveAreaId ?? ""} onChange={(e) => save(plan, { priorityObjectiveAreaId: e.target.value || null, prioritySubSkillId: null })} style={fieldStyle}>
                              <option value="">—</option>
                              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <Label>Priority sub-skill</Label>
                            <select value={plan.prioritySubSkillId ?? ""} onChange={(e) => save(plan, { prioritySubSkillId: e.target.value || null })} style={fieldStyle} disabled={areaSubs.length === 0}>
                              <option value="">—</option>
                              {areaSubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                        </div>

                        <div>
                          <Label>Monthly goal (+1 growing edge)</Label>
                          <input defaultValue={plan.monthlyGoal ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (plan.monthlyGoal ?? null)) save(plan, { monthlyGoal: v }); }} style={fieldStyle} />
                        </div>
                        <div>
                          <Label>How I&apos;ll support in group project</Label>
                          <input defaultValue={plan.howIllSupport ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (plan.howIllSupport ?? null)) save(plan, { howIllSupport: v }); }} style={fieldStyle} />
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <input defaultValue={plan.notes ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (plan.notes ?? null)) save(plan, { notes: v }); }} style={fieldStyle} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
