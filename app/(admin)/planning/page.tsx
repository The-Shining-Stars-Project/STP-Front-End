"use client";

import { localMonthKey } from "@/lib/format";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Target, Check, RotateCcw } from "lucide-react";
import { planningApi } from "@/lib/api/planning";
import { describeApiError } from "@/lib/api/client";
import { useMyPrograms, useStaff, useObjectiveAreas } from "@/lib/api/hooks";
import { isTeachingRole } from "@/lib/staffRoles";
import { programTint } from "@/lib/programColor";
import ProgramPills from "../components/ProgramPills";
import TierFilter from "../components/TierFilter";
import { useAuth } from "@/lib/auth/AuthProvider";
import StarStatusFilter, { DEFAULT_STAR_STATUS_FILTER, starStatusMatches, type StarStatusFilterValue } from "../components/StarStatusFilter";
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

// Stable fallbacks, so a list that hasn't loaded yet doesn't change identity every render.
const NO_PROGRAMS: ProgramSummaryDto[] = [];
const NO_STAFF: StaffSummaryDto[] = [];
const NO_AREAS: ObjectiveAreaDto[] = [];

const fieldStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", border: "0.5px solid var(--border-hover)",
  borderRadius: "var(--r-md)", padding: "6px 9px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none",
};

const hintStyle: React.CSSProperties = { fontSize: 11, color: "var(--fg-tertiary)", marginTop: 3 };

function Label({ children }: { children: React.ReactNode }) {
  return <div className="ss-label" style={{ marginBottom: 4, color: "var(--fg-tertiary)" }}>{children}</div>;
}

/** "2026-09" → "September 2026". */
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Where a row's Assigned staff came from, when it isn't this month's own plan. After a month
 * or quarter rolls over (Oct 1 2026 blanked every assignment) the API carries the most recent
 * earlier one forward, and this says so instead of passing it off as this month's choice.
 *
 * Re-picking the name the picker already shows fires no change, so it can't confirm it. When
 * `canKeep`, the card shows a "Keep for <month>" button for that, and the tooltip points to it.
 */
function assignedStaffHint(plan: PerStarPlanDto, canKeep: boolean): { text: string; title: string } | null {
  const term = plan.assignedStaffSourceTerm;
  const month = monthLabel(plan.monthKey);
  const keepOrPick = canKeep
    ? ` Use “Keep for ${month}” to save this name for ${month}, or pick another name.`
    : ` Pick a name to set someone for ${month}.`;
  switch (plan.assignedStaffSource) {
    case "Roster":
      return {
        text: "From the Roster this quarter",
        title: canKeep
          ? `Set on the Roster page for this quarter, so a Roster change still shows here. Use “Keep for ${month}” to hold this name for ${month} even if the Roster changes, or pick another name to override it.`
          : `Set on the Roster page for this quarter. Pick a name to override it for ${month}.`,
      };
    case "PreviousRoster":
      return {
        text: `Carried over from the ${term ?? "previous"} roster`,
        title: `Nobody is assigned on this quarter's Roster yet, so the most recent earlier quarter's is shown. It can be set on the Roster.${keepOrPick}`,
      };
    case "PreviousPlan":
      return {
        text: `Carried over from ${term ? `${monthLabel(term)}'s` : "an earlier"} plan`,
        title: `Nobody is assigned for ${month} yet, so the most recent earlier month's plan is shown.${keepOrPick}`,
      };
    default:
      return null;
  }
}

/**
 * The option that keeps a star's current assignee readable when the picker no longer offers
 * them — a former staff member, or a coordinator/admin assigned before the picker was limited
 * to teaching staff (Oct 2026).
 */
function currentAssigneeLabel(id: string, name: string | null, staff: StaffSummaryDto[], programId?: string): string {
  const member = staff.find((s) => s.id === id);
  if (!member) return `${name ?? "Former staff"} (former)`;
  if (member.isFormer) return `${member.fullName} (former)`;
  if (!isTeachingRole(member.role)) return `${member.fullName} (not a teacher)`;
  // A dual-enrolled star's row named by the Roster with someone outside the row's program.
  if (programId && !member.programIds.includes(programId)) return `${member.fullName} (not in this program)`;
  return member.fullName;
}

/**
 * Saves for one star run one after another. Two quick edits on a star with no plan yet for the
 * month both used to INSERT, and the second failed on the unique index (409) — silently, so the
 * screen kept a value that was never stored. `isLatest` tells a reply whether a newer edit is
 * queued behind it, so an older reply never puts back a value the user has since changed.
 */
function useSaveQueue() {
  const chains = useRef(new Map<string, { tail: Promise<void>; seq: number }>());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const enqueue = useCallback((key: string, task: (isLatest: () => boolean) => Promise<void>) => {
    const prev = chains.current.get(key);
    const seq = (prev?.seq ?? 0) + 1;
    const isLatest = () => chains.current.get(key)?.seq === seq;
    const tail = (prev?.tail ?? Promise.resolve()).then(() => task(isLatest)).catch((err) => console.error("Plan save failed:", err));
    chains.current.set(key, { tail, seq });
    setPending((s) => new Set(s).add(key));
    void tail.then(() => {
      if (!isLatest()) return;
      chains.current.delete(key);
      setPending((s) => { const next = new Set(s); next.delete(key); return next; });
    });
  }, []);
  return { enqueue, pending };
}

export default function PlanningPage() {
  const [month, setMonth] = useState(() => localMonthKey());
  const [programId, setProgramId] = useState<string | null>(null);

  const [plans, setPlans] = useState<PerStarPlanDto[]>([]);
  // Cached + shared via React Query (#34).
  const programs = useMyPrograms().data ?? NO_PROGRAMS;
  const staff = useStaff().data ?? NO_STAFF;
  const allAreas = useObjectiveAreas().data ?? NO_AREAS;
  // Per-star planning works against the part-time framework's areas.
  const areas = useMemo(() => allAreas.filter((a) => a.track === "PartTime"), [allAreas]);
  const [statusFilter, setStatusFilter] = useState<StarStatusFilterValue>(DEFAULT_STAR_STATUS_FILTER);
  const [tierFilter, setTierFilter] = useState<ProgressLevel | null>(null);
  const [staffFilter, setStaffFilter] = useState<string>(""); // "" = everyone
  const { user } = useAuth();
  const { enqueue, pending } = useSaveQueue();
  // A failed save, per star, stamped with the month it was for.
  const [saveErrors, setSaveErrors] = useState<Record<string, { month: string; text: string }>>({});

  // The plans on hand are stamped with the (month, program) they answer; "loading" is that
  // stamp being behind the filters, so no effect has to flip a flag.
  const scopeKey = `${month}|${programId ?? ""}`;
  const [loadedKey, setLoadedKey] = useState("");
  const [loadFailure, setLoadFailure] = useState<{ key: string; error: unknown } | null>(null);
  const [reload, setReload] = useState(0);
  const loadError = loadFailure?.key === scopeKey ? loadFailure.error : null;
  const loading = loadedKey !== scopeKey && !loadError;

  useEffect(() => {
    let active = true;
    planningApi.getPerStar(month, programId ?? undefined)
      .then((d) => { if (active) { setPlans(d); setLoadedKey(scopeKey); setLoadFailure(null); } })
      .catch((err) => { if (active) setLoadFailure({ key: scopeKey, error: err }); });
    return () => { active = false; };
  }, [month, programId, scopeKey, reload]);

  function retryLoad() {
    setLoadFailure(null);
    setLoadedKey("");
    setReload((n) => n + 1);
  }

  const areaById = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a])), [areas]);
  const colorByProgram = useMemo(() => new Map(programs.map((p) => [p.id, p.colorHex])), [programs]);
  // The picker offers current teaching staff only (Teacher, Teacher Assistant).
  const pickableStaff = useMemo(() => staff.filter((s) => !s.isFormer && isTeachingRole(s.role)), [staff]);
  // A dual-enrolled star's row only takes someone assigned to the row's program (the API
  // refuses anyone else), so their picker narrows to that program's teaching staff.
  const pickableFor = (plan: PerStarPlanDto) =>
    plan.isDualEnrolled ? pickableStaff.filter((s) => s.programIds.includes(plan.programId)) : pickableStaff;

  // A dual-enrolled star can be listed under either program, but the plan itself is one per
  // star per month — so an edit applies to every row of that star.
  const isStarRow = (p: PerStarPlanDto, of: PerStarPlanDto) => p.participantId === of.participantId && p.monthKey === of.monthKey;
  // A save sends the program its row is shown under, and the API labels the reply and resolves
  // its Assigned staff for that program, so the reply replaces that row as is. A row of the star
  // under ANOTHER program (only after a refetch raced the save) keeps its own program and its own
  // Assigned staff: who stands for a row is resolved per enrolment, even a plan's name (a dual
  // star's plan only applies where that teacher works), so the reply's can't be borrowed (Oct 2026).
  const applySaved = (row: PerStarPlanDto, saved: PerStarPlanDto): PerStarPlanDto => {
    if (row.programId === saved.programId) return saved;
    return {
      ...saved,
      programId: row.programId,
      programName: row.programName,
      programSlug: row.programSlug,
      isSecondaryEnrollment: row.isSecondaryEnrollment,
      assignedStaffId: row.assignedStaffId,
      assignedStaffName: row.assignedStaffName,
      assignedStaffSource: row.assignedStaffSource,
      assignedStaffSourceTerm: row.assignedStaffSourceTerm,
    };
  };

  function save(plan: PerStarPlanDto, patch: Partial<PerStarPlanDto>) {
    const merged = { ...plan, ...patch };
    setPlans((prev) => prev.map((p) => (isStarRow(p, plan) ? { ...p, ...patch } : p)));
    setSaveErrors((prev) => {
      if (!(plan.participantId in prev)) return prev;
      const next = { ...prev };
      delete next[plan.participantId];
      return next;
    });
    enqueue(plan.participantId, async (isLatest) => {
      try {
        const saved = await planningApi.upsertPerStar({
          participantId: plan.participantId,
          monthKey: plan.monthKey,
          programId: plan.programId,
          // Only a name picked for this month is the plan's own. A Roster or carried-over
          // default is sent as "none", so saving a tier doesn't pin it into the plan and a
          // later Roster change still flows through.
          assignedStaffId: merged.assignedStaffSource === "Plan" ? merged.assignedStaffId : null,
          primaryTier: merged.primaryTier,
          priorityObjectiveAreaId: merged.priorityObjectiveAreaId,
          prioritySubSkillId: merged.prioritySubSkillId,
          monthlyGoal: merged.monthlyGoal,
          howIllSupport: merged.howIllSupport,
          notes: merged.notes,
        });
        if (isLatest()) setPlans((prev) => prev.map((p) => (isStarRow(p, saved) ? applySaved(p, saved) : p)));
      } catch (err) {
        // Roll back what this edit changed (unless a later edit has changed it again) and say
        // so on the card. A swallowed failure left the unsaved value on screen until reload.
        setPlans((prev) => prev.map((p) => {
          if (!isStarRow(p, plan)) return p;
          const reverted: Record<string, unknown> = { ...p };
          for (const k of Object.keys(patch) as (keyof PerStarPlanDto)[]) if (p[k] === merged[k]) reverted[k] = plan[k];
          return reverted as unknown as PerStarPlanDto;
        }));
        setSaveErrors((prev) => ({
          ...prev,
          [plan.participantId]: { month: plan.monthKey, text: describeApiError(err, "Couldn't save that change — it was undone. Try again.") },
        }));
      }
    });
  }

  function changeStaff(plan: PerStarPlanDto, id: string | null) {
    save(plan, {
      assignedStaffId: id,
      assignedStaffName: id ? staff.find((s) => s.id === id)?.fullName ?? null : null,
      assignedStaffSource: id ? "Plan" : null,
      assignedStaffSourceTerm: id ? plan.monthKey : null,
    });
  }

  // Plans that pass the status filter — the pool the tier/staff chips count and filter within.
  // Counts are per star, so a star listed under both of their programs counts once.
  const inStatus = useMemo(() => plans.filter((x) => starStatusMatches(x.status, statusFilter)), [plans, statusFilter]);
  const uniqueStars = useMemo(() => [...new Map(inStatus.map((p) => [p.participantId, p])).values()], [inStatus]);
  const tierCounts = useMemo(() => {
    const m = new Map<ProgressLevel, number>();
    for (const p of uniqueStars) m.set(p.primaryTier, (m.get(p.primaryTier) ?? 0) + 1);
    return m;
  }, [uniqueStars]);
  // Staff chips: current teaching staff assigned to at least one star in view, the signed-in
  // user first. Admins and coordinators have staff records but don't carry stars (Oct 2026).
  const staffChoices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of uniqueStars) if (p.assignedStaffId) counts.set(p.assignedStaffId, (counts.get(p.assignedStaffId) ?? 0) + 1);
    return pickableStaff
      .filter((s) => counts.has(s.id))
      .map((s) => ({ id: s.id, name: s.fullName, count: counts.get(s.id) ?? 0 }))
      .sort((a, b) => (a.id === user?.staffMemberId ? -1 : b.id === user?.staffMemberId ? 1 : a.name.localeCompare(b.name)));
  }, [uniqueStars, pickableStaff, user?.staffMemberId]);
  const unassignedCount = useMemo(() => uniqueStars.filter((p) => !p.assignedStaffId).length, [uniqueStars]);

  const byProgram = useMemo(() => {
    const map = new Map<string, { id: string; name: string; rows: PerStarPlanDto[] }>();
    for (const p of inStatus
      .filter((x) => tierFilter === null || x.primaryTier === tierFilter)
      .filter((x) => staffFilter === "" || (staffFilter === "__none__" ? !x.assignedStaffId : x.assignedStaffId === staffFilter))) {
      if (!map.has(p.programId)) map.set(p.programId, { id: p.programId, name: p.programName || "No program", rows: [] });
      map.get(p.programId)!.rows.push(p);
    }
    for (const g of map.values()) g.rows.sort((a, b) => a.participantName.localeCompare(b.participantName));
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [inStatus, tierFilter, staffFilter]);

  const visibleCount = byProgram.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles"><h1>Per-Star Planning</h1></div>
        <div className="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StarStatusFilter value={statusFilter} onChange={setStatusFilter} />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month"
            style={{ border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "6px 8px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none" }} />
        </div>
      </div>

      <div className="adm-content">
        <div className="info-note" style={{ marginBottom: "var(--space-3)" }}>
          <Target />
          <span>Each star&apos;s monthly priorities — their primary tier, the objective area &amp; sub-skill to focus on, a goal with a +1 growing edge, and how staff will support it. Changes save automatically.</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Program</span>
            <ProgramPills programs={programs} value={programId} onChange={setProgramId} allLabel="All" compact />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Assigned staff</span>
            <button type="button" className={`ss-chip${staffFilter === "" ? " is-active" : ""}`} aria-pressed={staffFilter === ""} style={{ cursor: "pointer" }} onClick={() => setStaffFilter("")}>Everyone</button>
            {staffChoices.map((s) => (
              <button key={s.id} type="button" className={`ss-chip${staffFilter === s.id ? " is-active" : ""}`} aria-pressed={staffFilter === s.id} style={{ cursor: "pointer" }} onClick={() => setStaffFilter(staffFilter === s.id ? "" : s.id)}>
                {s.id === user?.staffMemberId ? "My stars" : s.name}<span style={{ opacity: 0.7, marginLeft: 4 }}>{s.count}</span>
              </button>
            ))}
            {unassignedCount > 0 && (
              <button type="button" className={`ss-chip${staffFilter === "__none__" ? " is-active" : ""}`} aria-pressed={staffFilter === "__none__"} style={{ cursor: "pointer" }} onClick={() => setStaffFilter(staffFilter === "__none__" ? "" : "__none__")}>
                Unassigned<span style={{ opacity: 0.7, marginLeft: 4 }}>{unassignedCount}</span>
              </button>
            )}
          </div>
          <TierFilter value={tierFilter} onChange={setTierFilter} counts={tierCounts} />
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading…</div>
        ) : loadError ? (
          <div role="alert" style={{ padding: "40px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-3)", color: "var(--fg-tertiary)", fontSize: 13 }}>
            <span>Couldn&apos;t load plans: {describeApiError(loadError, "check your connection and try again.")}</span>
            <button type="button" className="ss-btn" onClick={retryLoad}><RotateCcw className="ss-btn-icon" />Try again</button>
          </div>
        ) : plans.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>No stars.</div>
        ) : visibleCount === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>No stars match these filters.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            {byProgram.map((prog) => (
              <div key={prog.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-2)" }}>
                  <span className="ss-dot" style={{ background: programTint(colorByProgram.get(prog.id)).accent }} />
                  <h3 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)", margin: 0 }}>{prog.name}</h3>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "var(--space-4)" }}>
                  {prog.rows.map((plan) => {
                    const areaSubs = plan.priorityObjectiveAreaId ? (areaById[plan.priorityObjectiveAreaId]?.subSkills ?? []) : [];
                    // A Roster or carried-over name can be kept as this month's own, but only
                    // someone the picker would offer: not a former or non-teaching staff member.
                    const rowStaff = pickableFor(plan);
                    const canKeep = plan.assignedStaffSource !== null && plan.assignedStaffSource !== "Plan"
                      && !!plan.assignedStaffId && rowStaff.some((s) => s.id === plan.assignedStaffId);
                    const hint = assignedStaffHint(plan, canKeep);
                    const planMonth = monthLabel(plan.monthKey);
                    const saveError = saveErrors[plan.participantId];
                    return (
                      <div key={`${plan.participantId}:${plan.programId}`} style={{ border: "0.5px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface)", padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="ss-avatar teacher sm">{plan.participantInitials}</span>
                          <span style={{ fontSize: "var(--fs-body)", fontWeight: "var(--w-medium)", flex: 1 }}>
                            {plan.participantName}
                            {plan.isSecondaryEnrollment && (
                              <span className="ss-meta" style={{ marginLeft: 8, fontWeight: "var(--w-regular)", color: "var(--fg-tertiary)" }}
                                title="Dual enrollment — this is the star's second program. The plan is shared with their main program.">
                                Second program
                              </span>
                            )}
                          </span>
                          {pending.has(plan.participantId) && <Check style={{ width: 13, height: 13, color: "var(--success)" }} />}
                        </div>

                        {saveError && saveError.month === plan.monthKey && (
                          <div role="alert" style={{ fontSize: 12, color: "var(--danger)", background: "var(--danger-fill)", borderRadius: "var(--r-md)", padding: "6px 9px" }}>
                            {saveError.text}
                          </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
                          <div>
                            <Label>Primary tier</Label>
                            <select value={plan.primaryTier} onChange={(e) => save(plan, { primaryTier: e.target.value as ProgressLevel })} style={fieldStyle} aria-label={`Primary tier for ${plan.participantName}`}>
                              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <Label>Assigned staff</Label>
                            <select value={plan.assignedStaffId ?? ""} onChange={(e) => changeStaff(plan, e.target.value || null)} style={fieldStyle} aria-label={`Assigned staff for ${plan.participantName}`}
                              title="Lists teachers and teacher assistants from the Onboarding page.">
                              <option value="">—</option>
                              {rowStaff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                              {plan.assignedStaffId && !rowStaff.some((s) => s.id === plan.assignedStaffId) && (
                                <option value={plan.assignedStaffId}>{currentAssigneeLabel(plan.assignedStaffId, plan.assignedStaffName, staff, plan.isDualEnrolled ? plan.programId : undefined)}</option>
                              )}
                            </select>
                            {hint && (
                              <div style={{ ...hintStyle, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span title={hint.title}>{hint.text}</span>
                                {/* Picking the name already selected saves nothing (no change
                                    event), so this is how a carried-over name becomes the
                                    month's own and stops moving when the Roster changes. */}
                                {canKeep && (
                                  <button type="button" className="ss-btn" style={{ fontSize: 12, padding: "4px 10px" }}
                                    onClick={() => changeStaff(plan, plan.assignedStaffId)}
                                    aria-label={`Keep for ${planMonth}: ${plan.assignedStaffName ?? "this staff member"} for ${plan.participantName}`}
                                    title={`Save ${plan.assignedStaffName ?? "this staff member"} as ${plan.participantName}'s Assigned staff for ${planMonth}.`}>
                                    Keep for {planMonth}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div>
                            <Label>Priority area</Label>
                            <select value={plan.priorityObjectiveAreaId ?? ""} onChange={(e) => save(plan, { priorityObjectiveAreaId: e.target.value || null, prioritySubSkillId: null })} style={fieldStyle} aria-label={`Priority area for ${plan.participantName}`}>
                              <option value="">—</option>
                              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <Label>Priority sub-skill</Label>
                            <select value={plan.prioritySubSkillId ?? ""} onChange={(e) => save(plan, { prioritySubSkillId: e.target.value || null })} style={fieldStyle} disabled={areaSubs.length === 0} aria-label={`Priority sub-skill for ${plan.participantName}`}>
                              <option value="">—</option>
                              {areaSubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* Text boxes are keyed on the saved value, so a rolled-back edit (or the
                            same star's other card being edited) replaces what they show. */}
                        <div>
                          <Label>Goal (+1 growing edge)</Label>
                          <input key={`goal:${plan.monthlyGoal ?? ""}`} defaultValue={plan.monthlyGoal ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (plan.monthlyGoal ?? null)) save(plan, { monthlyGoal: v }); }} style={fieldStyle} aria-label={`Goal for ${plan.participantName}`} />
                        </div>
                        <div>
                          <Label>How I&apos;ll support in group project</Label>
                          <input key={`support:${plan.howIllSupport ?? ""}`} defaultValue={plan.howIllSupport ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (plan.howIllSupport ?? null)) save(plan, { howIllSupport: v }); }} style={fieldStyle} aria-label={`How I'll support ${plan.participantName}`} />
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <input key={`notes:${plan.notes ?? ""}`} defaultValue={plan.notes ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (plan.notes ?? null)) save(plan, { notes: v }); }} style={fieldStyle} aria-label={`Notes for ${plan.participantName}`} />
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
