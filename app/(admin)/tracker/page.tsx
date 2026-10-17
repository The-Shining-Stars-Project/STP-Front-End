"use client";

import { localMonthKey } from "@/lib/format";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PenLine, Check, X, AlertTriangle } from "lucide-react";
import { useMyPrograms, useParticipants, useObjectiveAreas, useStaff } from "@/lib/api/hooks";
import { progressApi } from "@/lib/api/progress";
import { describeApiError } from "@/lib/api/client";
import { planningApi } from "@/lib/api/planning";
import TierFilter from "../components/TierFilter";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isTeachingRole } from "@/lib/staffRoles";
import { programTint } from "@/lib/programColor";
import { Skeleton } from "../components/Skeleton";
import ProgramPills from "../components/ProgramPills";
import { starDisplayName } from "@/lib/starName";
import StarStatusFilter, { DEFAULT_STAR_STATUS_FILTER, starStatusMatches, type StarStatusFilterValue } from "../components/StarStatusFilter";
import type {
  ProgramSummaryDto,
  ParticipantSummaryDto,
  ObjectiveAreaDto,
  WeeklyFocusSkillDto,
  WeeklyDataEntryDto,
  DataScore,
  StaffSummaryDto,
  PerStarPlanDto,
  ProgressLevel,
} from "@/lib/types/api";

const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/**
 * When weekly data is due for a programme: its LAST meeting day of the week.
 *
 * The client stated the rule as "Part-time each Wednesday (or last day of class for the
 * week), Full-time Fridays" — and their programmes meet Mon–Wed and Mon–Fri respectively, so
 * deriving it from the schedule reproduces both answers exactly and stays correct if the
 * timetable ever changes. Hardcoding the two weekdays would silently go wrong the first time
 * a class moves.
 */
function dueDayFor(meetingDays: string | undefined): (typeof DAY_ORDER)[number] | null {
  if (!meetingDays || meetingDays === "None") return null;
  const days = meetingDays.split(",").map((d) => d.trim());
  for (let i = DAY_ORDER.length - 1; i >= 0; i--) {
    if (days.includes(DAY_ORDER[i])) return DAY_ORDER[i];
  }
  return null;
}

/**
 * The roster term a month falls in ("2026-10" → Q4 2026). Assignments are set per quarter, and
 * the filter must read the SELECTED month's quarter — reading today's paired September's plans
 * with Q4's roster.
 */
function termOfMonth(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return { year: y, quarter: Math.floor((m - 1) / 3) + 1 };
}

/** "2026-10" → "October 2026". */
function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Stable fallbacks, so a list that hasn't loaded yet doesn't change identity every render.
const NO_PROGRAMS: ProgramSummaryDto[] = [];
const NO_PARTICIPANTS: ParticipantSummaryDto[] = [];
const NO_AREAS: ObjectiveAreaDto[] = [];
const NO_STAFF: StaffSummaryDto[] = [];

/** A fetch result stamped with the request it answers; a stamp behind the filters means "loading". */
type Loaded<T> = { key: string; rows?: T[]; error?: unknown };

const WEEKS = [1, 2, 3, 4, 5];
const SCORES: { value: DataScore; short: string }[] = [
  { value: "Refusal", short: "0" },
  { value: "FullPrompts", short: "1" },
  { value: "MinimalPrompts", short: "2" },
  { value: "Independent", short: "3" },
  { value: "NotApplicable", short: "N/A" },
];

const cellSelect: React.CSSProperties = {
  border: "0.5px solid var(--border)", borderRadius: "var(--r-sm)",
  padding: "4px 6px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none", width: 56,
};

const scoreKey = (participantId: string, subSkillId: string, week: number) => `${participantId}:${subSkillId}:${week}`;
/** One star in one program: assignments are per enrolment, so a dual-enrolled star has two. */
const enrollmentKey = (participantId: string, programId: string) => `${participantId}:${programId}`;

/**
 * Weekly Data — score every star on the week's focus skills.
 *
 * Filters run staff-first, then program (client ask, Sep 2026). The old order was
 * program-first with the signed-in teacher pre-selected, which landed a teacher whose stars
 * sit in the second program on an empty grid with no obvious way out. Now the default is
 * every star in every program the user can see, grouped by program (each program has its own
 * focus skills for the week), and the Staff chips narrow to one teacher's stars before the
 * program chips narrow further.
 */
export default function WeeklyDataPage() {
  // Cached + shared via React Query (#34).
  const programs = useMyPrograms().data ?? NO_PROGRAMS;
  const allParticipants = useParticipants().data ?? NO_PARTICIPANTS;
  const areas = useObjectiveAreas().data ?? NO_AREAS;
  const staff = useStaff().data ?? NO_STAFF;
  const { user, canManage } = useAuth();

  const [staffFilter, setStaffFilter] = useState<string>("");            // "" = all stars
  const [programFilter, setProgramFilter] = useState<string | null>(null); // null = all programs
  const [month, setMonth] = useState(() => localMonthKey());
  // The chip is the only thing that defines "week" (nothing ties it to a date), so at least
  // reopen on the one used last — teachers were landing on W1 and reading "no data".
  const [week, setWeek] = useState(() => {
    try { const w = Number(window.localStorage.getItem("tracker.week")); return w >= 1 && w <= 5 ? w : 1; } catch { return 1; }
  });
  useEffect(() => { try { window.localStorage.setItem("tracker.week", String(week)); } catch { /* ignore */ } }, [week]);
  const [statusFilter, setStatusFilter] = useState<StarStatusFilterValue>(DEFAULT_STAR_STATUS_FILTER);
  const [tierFilter, setTierFilter] = useState<ProgressLevel | null>(null);

  const term = termOfMonth(month);
  const termLabel = `Q${term.quarter} ${term.year}`;
  const monthName = monthLabel(month);
  // Bumped by "Try again" so a retry re-requests (and reads as loading) even for the same term.
  const [attempt, setAttempt] = useState(0);

  // The month's Per-Star Plans, fetched once per program the viewer can see (not just the one
  // in view, so the program pills never refetch and "before any filter" totals stay whole). A
  // plan row's Assigned staff is the star's owner IN THAT PROGRAM: the API falls back plan →
  // this quarter's roster → an earlier plan → an earlier roster, and the roster steps are per
  // enrolment, so a dual-enrolled star can have their Part-time teacher on one row and their
  // Pathways teacher on the other (Chris/Skyler, Oct 2026). Each program's rows are exactly what
  // Per-Star Planning shows under that program's pill, so the two pages agree for every viewer.
  // The plan's primary tier is also what the Tier chips filter on (one plan per star).
  const programIds = programs.map((p) => p.id).join(",");
  const plansKey = `${month}|${programIds}#${attempt}`;
  const [plansRes, setPlansRes] = useState<Loaded<PerStarPlanDto> | null>(null);
  useEffect(() => {
    let active = true;
    const ids = programIds ? programIds.split(",") : [];
    Promise.all(ids.map((pid) => planningApi.getPerStar(month, pid)))
      .then((lists) => { if (active) setPlansRes({ key: plansKey, rows: lists.flat() }); })
      // A failure is NOT "nobody assigned": an empty answer used to fall back to "every star in
      // their programs" (Alec's 43, Oct 2026). One failed program fails the set, so chips are
      // never built from half the data.
      .catch((error) => { if (active) setPlansRes({ key: plansKey, error }); });
    return () => { active = false; };
  }, [month, programIds, plansKey]);

  const plans = plansRes?.key === plansKey ? plansRes : null; // null = loading
  const planRows = plans?.rows;
  const assignmentsError = plans?.error ?? null;
  const tierByStar = useMemo(() => new Map((planRows ?? []).map((p) => [p.participantId, p.primaryTier])), [planRows]);

  // Each (star, program) pair's ONE owner. There is no "every star in their programs" fallback
  // any more — that is what gave Alec 43 stars instead of 6. Null while the plans are loading or
  // failed.
  const ownerByEnrollment = useMemo(
    () => (planRows ? new Map(planRows.map((p) => [enrollmentKey(p.participantId, p.programId), p.assignedStaffId])) : null),
    [planRows]
  );

  const programsInView = useMemo(
    () => (programFilter ? programs.filter((p) => p.id === programFilter) : programs),
    [programs, programFilter]
  );

  // One group per program in view: its stars (primary or secondary enrollment) that pass the
  // status and tier filters. The staff filter is applied after, so chip counts can use these.
  const filteredGroups = useMemo(
    () => programsInView.map((program) => ({
      program,
      stars: allParticipants
        .filter((p) => (p.programId === program.id || p.secondaryProgramId === program.id))
        .filter((p) => starStatusMatches(p.status, statusFilter))
        .filter((p) => tierFilter === null || tierByStar.get(p.id) === tierFilter)
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    })),
    [programsInView, allParticipants, statusFilter, tierFilter, tierByStar]
  );

  // Chip counts: distinct stars in view (after status, program and tier) per owner. A star
  // counts for whoever owns them in the program group they sit in, so a dual-enrolled star
  // counts once for each of two different teachers, and once for a teacher who has them in both.
  const countByStaff = useMemo(() => {
    const counts = new Map<string, number>();
    if (!ownerByEnrollment) return counts;
    const counted = new Set<string>();
    for (const g of filteredGroups) {
      for (const p of g.stars) {
        const owner = ownerByEnrollment.get(enrollmentKey(p.id, g.program.id));
        if (!owner || counted.has(`${owner}|${p.id}`)) continue;
        counted.add(`${owner}|${p.id}`);
        counts.set(owner, (counts.get(owner) ?? 0) + 1);
      }
    }
    return counts;
  }, [ownerByEnrollment, filteredGroups]);

  // Chips: teaching staff (Teacher, Teacher Assistant) with at least one star in view, plus
  // "My stars" for the signed-in user. Admins and coordinators have staff records for
  // onboarding but don't carry stars, so they no longer appear (Vera/Debbie, Oct 2026). A
  // selected chip stays put even when the filters take its count to 0.
  const myStaffId = user?.staffMemberId ?? null;
  const staffChoices = useMemo(
    () => !ownerByEnrollment ? [] : staff
      .filter((m) => m.id === myStaffId || m.id === staffFilter || (!m.isFormer && isTeachingRole(m.role) && (countByStaff.get(m.id) ?? 0) > 0))
      .sort((a, b) => {
        if (a.id === myStaffId) return -1;
        if (b.id === myStaffId) return 1;
        return a.fullName.localeCompare(b.fullName);
      }),
    [ownerByEnrollment, staff, myStaffId, staffFilter, countByStaff]
  );
  const staffName = !staffFilter ? "" : staffFilter === myStaffId ? "you" : staff.find((m) => m.id === staffFilter)?.fullName ?? "this staff member";
  // Every star the selected staff member owns this term in any of the viewer's programs, before
  // any filter — tells "nobody is assigned to them" apart from "the filters hide their stars".
  const ownedTotal = useMemo(
    () => (!staffFilter || !planRows ? 0 : new Set(planRows.filter((p) => p.assignedStaffId === staffFilter).map((p) => p.participantId)).size),
    [staffFilter, planRows]
  );

  // The staff and tier filters can't be applied until the assignments they read have loaded —
  // showing every star meanwhile is how a slow or failed fetch used to look like "all 43".
  const filtersWaiting = (staffFilter !== "" && !ownerByEnrollment) || (tierFilter !== null && !planRows);
  const groups = useMemo(
    () => filtersWaiting ? [] : filteredGroups
      .map((g) => ({
        ...g,
        stars: staffFilter && ownerByEnrollment
          ? g.stars.filter((p) => ownerByEnrollment.get(enrollmentKey(p.id, g.program.id)) === staffFilter)
          : g.stars,
      }))
      .filter((g) => g.stars.length > 0 || programFilter !== null),
    [filtersWaiting, filteredGroups, staffFilter, ownerByEnrollment, programFilter]
  );

  // Focus skills per program (all weeks of the month) and every score for the stars in view.
  // "Loading" is derived: the data on hand is stamped with the (programs, month) it was
  // fetched for, and the grid is loading whenever that stamp is behind the filters.
  const [focus, setFocus] = useState<Map<string, WeeklyFocusSkillDto[]>>(new Map());
  const [scores, setScores] = useState<Map<string, DataScore>>(new Map());
  const [loadedKey, setLoadedKey] = useState("");
  const programKey = programsInView.map((p) => p.id).join(",");
  const dataKey = `${programKey}|${month}`;
  const loading = (programKey !== "" && loadedKey !== dataKey) || (filtersWaiting && !assignmentsError);

  useEffect(() => {
    if (!programKey) return;
    let active = true;
    const ids = programKey.split(",");
    Promise.all(ids.map(async (pid) => {
      const [f, entries] = await Promise.all([
        progressApi.getFocusSkills(pid, month).catch(() => [] as WeeklyFocusSkillDto[]),
        progressApi.getProgramMonth(pid, month).catch(() => [] as WeeklyDataEntryDto[]),
      ]);
      return { pid, f, entries };
    })).then((results) => {
      if (!active) return;
      const fm = new Map<string, WeeklyFocusSkillDto[]>();
      const sm = new Map<string, DataScore>();
      for (const r of results) {
        fm.set(r.pid, r.f);
        for (const e of r.entries) sm.set(scoreKey(e.participantId, e.subSkillId, e.weekNumber), e.score);
      }
      setFocus(fm);
      setScores(sm);
      setLoadedKey(dataKey);
    });
    return () => { active = false; };
  }, [programKey, month, dataKey]);

  // Edits wait here until "Save scores" (key = scoreKey, null = clear). Per-cell autosave let
  // two quick changes race so the older reply "reset" the cell, and could never clear one.
  const [draft, setDraft] = useState<Map<string, DataScore | null>>(new Map());
  const [savingScores, setSavingScores] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const dirty = draft.size > 0;

  function editScore(participantId: string, subSkillId: string, score: DataScore | null) {
    const key = scoreKey(participantId, subSkillId, week);
    setDraft((prev) => {
      const next = new Map(prev);
      if ((scores.get(key) ?? null) === score) next.delete(key); else next.set(key, score);
      return next;
    });
  }

  function discardScores() { setDraft(new Map()); setScoreError(null); }

  async function saveScores() {
    if (!dirty) return;
    setSavingScores(true);
    setScoreError(null);
    const changes = [...draft.entries()].map(([key, score]) => {
      const [participantId, subSkillId, w] = key.split(":");
      return { participantId, subSkillId, weekNumber: Number(w), score };
    });
    try {
      await progressApi.saveWeekly({ monthKey: month, changes });
      setScores((prev) => {
        const next = new Map(prev);
        for (const [key, score] of draft) { if (score === null) next.delete(key); else next.set(key, score); }
        return next;
      });
      setDraft(new Map());
    } catch (e) {
      setScoreError(describeApiError(e, "Couldn't save the scores — nothing was changed. Try again."));
    } finally {
      setSavingScores(false);
    }
  }

  // Changing the week, month or filters would hide unsaved cells; ask first.
  function guarded<T>(setter: (v: T) => void) {
    return (v: T) => {
      if (dirty && !window.confirm("You have unsaved scores. Discard them?")) return;
      if (dirty) discardScores();
      setter(v);
    };
  }
  const changeWeek = guarded(setWeek);
  const changeMonth = guarded(setMonth);
  const changeStaff = guarded(setStaffFilter);
  const changeProgram = guarded(setProgramFilter);
  const changeStatus = guarded(setStatusFilter);
  const changeTier = guarded(setTierFilter);

  // Focus-skill editing — one program at a time.
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [focusDraft, setFocusDraft] = useState<Set<string>>(new Set());
  const [savingFocus, setSavingFocus] = useState(false);

  function openFocusEditor(programId: string) {
    const current = (focus.get(programId) ?? []).filter((f) => f.weekNumber === week).map((f) => f.subSkillId);
    setFocusDraft(new Set(current));
    setEditingProgramId(programId);
  }
  function toggleDraft(id: string) {
    setFocusDraft((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function saveFocus() {
    if (!editingProgramId) return;
    const pid = editingProgramId;
    setSavingFocus(true);
    try {
      await progressApi.setFocusSkills({ programId: pid, monthKey: month, weekNumber: week, subSkillIds: [...focusDraft] });
      const f = await progressApi.getFocusSkills(pid, month);
      setFocus((prev) => new Map(prev).set(pid, f));
      setEditingProgramId(null);
    } catch { /* leave editor open */ } finally { setSavingFocus(false); }
  }

  const totalStars = groups.reduce((n, g) => n + g.stars.length, 0);
  const emptyNote: React.CSSProperties = { padding: "24px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 };
  const linkStyle: React.CSSProperties = { color: "var(--primary)" };

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles"><h1>Weekly Data</h1></div>
        <div className="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StarStatusFilter value={statusFilter} onChange={changeStatus} />
          <input type="month" value={month} onChange={(e) => { if (e.target.value) changeMonth(e.target.value); }} aria-label="Month"
            style={{ border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "6px 8px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none" }} />
        </div>
      </div>

      <div className="adm-content">
        {/* Filters: staff first, then program, then week */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          {assignmentsError !== null && (
            <div className="ss-alert is-danger" role="alert">
              <AlertTriangle />
              <span className="ss-alert-text">
                <strong>Couldn&apos;t load staff assignments</strong>, so the Staff and Tier filters are unavailable — {describeApiError(assignmentsError, "check your connection and try again.")}
              </span>
              <button type="button" className="ss-alert-action" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", minHeight: 34 }} onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Staff</span>
            <button type="button" className={`ss-chip${staffFilter === "" ? " is-active" : ""}`} aria-pressed={staffFilter === ""} style={{ cursor: "pointer" }} onClick={() => changeStaff("")}>All stars</button>
            {staffChoices.map((m) => {
              const count = countByStaff.get(m.id) ?? 0;
              return (
                <button key={m.id} type="button" className={`ss-chip${staffFilter === m.id ? " is-active" : ""}`} aria-pressed={staffFilter === m.id} style={{ cursor: "pointer" }} onClick={() => changeStaff(staffFilter === m.id ? "" : m.id)}
                  title={`${count} star${count === 1 ? "" : "s"} assigned for ${termLabel} / ${monthName}, with the current filters`}>
                  {m.id === myStaffId ? "My stars" : m.fullName}
                  <span style={{ opacity: 0.7, marginLeft: 4 }}>{count}</span>
                </button>
              );
            })}
            {!ownerByEnrollment && assignmentsError === null && (
              <span style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>Loading assignments…</span>
            )}
          </div>
          <div style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>
            A teacher&apos;s chip counts the stars assigned to them in <Link href="/planning" style={linkStyle}>Per-Star Planning</Link> for {monthName},
            else on the <Link href="/roster" style={linkStyle}>Roster</Link> for {termLabel} (or carried over from an earlier month or quarter). A star in two programs
            counts under each program&apos;s own assignment. Counts follow the status, program and tier filters.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Program</span>
            <ProgramPills programs={programs} value={programFilter} onChange={changeProgram} allLabel="All programs" compact />
          </div>
          <TierFilter value={tierFilter} onChange={changeTier} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Week</span>
            {WEEKS.map((w) => (
              <button key={w} type="button" className={`ss-chip${week === w ? " is-active" : ""}`} aria-pressed={week === w} style={{ cursor: "pointer" }} onClick={() => changeWeek(w)}>W{w}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ border: "0.5px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface)", overflow: "hidden" }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: i < 4 ? "0.5px solid var(--border)" : "none" }}>
                <Skeleton w={24} h={24} circle />
                <Skeleton w={120 + ((i * 23) % 40)} h={11} />
                <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <Skeleton w={56} h={24} r={4} />
                  <Skeleton w={56} h={24} r={4} />
                  <Skeleton w={56} h={24} r={4} />
                </span>
              </div>
            ))}
          </div>
        ) : programs.length === 0 ? (
          <div style={emptyNote}>
            No programs are assigned to you yet — an admin can add you to a program from the Programs page.
          </div>
        ) : filtersWaiting ? (
          <div style={emptyNote}>
            The {staffFilter ? "Staff" : "Tier"} filter needs the staff assignments, which didn&apos;t load. Use &ldquo;Try again&rdquo; above, or
            choose &ldquo;All stars&rdquo;{tierFilter ? " and clear the tier" : ""} to see every star.
          </div>
        ) : staffFilter && ownedTotal === 0 ? (
          <div style={emptyNote}>
            No stars are assigned to {staffName} for {termLabel} / {monthName}. Set Assigned staff on
            the <Link href="/roster" style={linkStyle}>Roster</Link> or <Link href="/planning" style={linkStyle}>Per-Star Planning</Link>.
          </div>
        ) : totalStars === 0 ? (
          <div style={emptyNote}>
            {staffFilter
              ? `The ${ownedTotal} star${ownedTotal === 1 ? "" : "s"} assigned to ${staffName} ${ownedTotal === 1 ? "doesn't" : "don't"} match these filters${programFilter ? " in this program" : ""}. Choose “All stars” or change the filters.`
              : tierFilter ? "No stars at this tier — tiers are set on Per-Star Planning." : "No stars in this program yet."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {groups.map((g) => (
              <ProgramSection
                key={g.program.id}
                program={g.program}
                stars={g.stars}
                week={week}
                weekFocus={(focus.get(g.program.id) ?? []).filter((f) => f.weekNumber === week)}
                scores={scores}
                draft={draft}
                areas={areas}
                onScore={editScore}
                editing={editingProgramId === g.program.id}
                editorDisabled={editingProgramId !== null && editingProgramId !== g.program.id}
                canManage={canManage}
                focusDraft={focusDraft}
                savingFocus={savingFocus}
                onOpenEditor={() => openFocusEditor(g.program.id)}
                onToggleDraft={toggleDraft}
                onSetDraft={setFocusDraft}
                onSaveFocus={saveFocus}
                onCancelEditor={() => setEditingProgramId(null)}
              />
            ))}
          </div>
        )}

        {!loading && totalStars > 0 && (
          <div style={{ position: "sticky", bottom: 0, marginTop: "var(--space-3)", padding: "10px 12px", background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: "var(--r-lg)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", boxShadow: "0 -4px 16px rgba(0,0,0,.05)" }}>
            <button type="button" className="ss-btn ss-btn-primary" onClick={saveScores} disabled={!dirty || savingScores}>
              <Check className="ss-btn-icon" />{savingScores ? "Saving…" : dirty ? `Save ${draft.size} score${draft.size === 1 ? "" : "s"}` : "Save scores"}
            </button>
            <button type="button" className="ss-btn" onClick={discardScores} disabled={!dirty || savingScores}>
              <X className="ss-btn-icon" />Discard
            </button>
            {dirty && !scoreError && <span style={{ fontSize: "var(--fs-meta)", color: "var(--warning-text, var(--warning))" }}>Unsaved changes — nothing is stored until you save.</span>}
            {scoreError && <span role="alert" style={{ fontSize: "var(--fs-meta)", color: "var(--danger)" }}>{scoreError}</span>}
          </div>
        )}
        <div style={{ marginTop: "var(--space-3)", fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>
          <strong>0</strong> Refusal · <strong>1</strong> Full prompts · <strong>2</strong> Minimal prompts · <strong>3</strong> Independent · <strong>N/A</strong> not targeted. Pick scores, then click Save.
        </div>
      </div>
    </div>
  );
}


/** One program's block: its focus skills for the week, coverage, and the entry grid. */
function ProgramSection({
  program, stars, week, weekFocus, scores, draft, areas, onScore,
  editing, editorDisabled, focusDraft, savingFocus, onOpenEditor, onToggleDraft, onSetDraft, onSaveFocus, onCancelEditor,
  canManage = false,
}: {
  program: ProgramSummaryDto;
  stars: ParticipantSummaryDto[];
  week: number;
  weekFocus: WeeklyFocusSkillDto[];
  scores: Map<string, DataScore>;
  draft: Map<string, DataScore | null>;
  areas: ObjectiveAreaDto[];
  onScore: (participantId: string, subSkillId: string, score: DataScore | null) => void;
  editing: boolean;
  editorDisabled: boolean;
  /** Only coordinators and admins may set focus skills (the API is ManagementWrite). */
  canManage?: boolean;
  focusDraft: Set<string>;
  savingFocus: boolean;
  onOpenEditor: () => void;
  onToggleDraft: (id: string) => void;
  onSetDraft: (ids: Set<string>) => void;
  onSaveFocus: () => void;
  onCancelEditor: () => void;
}) {
  const tint = programTint(program.colorHex);

  // Columns: this week's focus skills, PLUS any other sub-skill that already has a score for
  // one of these stars this week (entered on a star's profile, or under an earlier focus
  // list). Hiding those made the grid look like data vanished between weeks (client, Sep 24).
  const subSkillById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; sortOrder: number; sectionNumber: number }>();
    for (const a of areas) for (const sk of a.subSkills) m.set(sk.id, sk);
    return m;
  }, [areas]);
  const columns = useMemo(() => {
    const focusIds = new Set(weekFocus.map((f) => f.subSkillId));
    const cols: { subSkillId: string; subSkillName: string; isFocus: boolean }[] =
      weekFocus.map((f) => ({ subSkillId: f.subSkillId, subSkillName: f.subSkillName, isFocus: true }));
    const extra = new Set<string>();
    const starIds = new Set(stars.map((p) => p.id));
    for (const key of scores.keys()) {
      const [pid, skillId, w] = key.split(":");
      if (Number(w) === week && starIds.has(pid) && !focusIds.has(skillId)) extra.add(skillId);
    }
    for (const id of [...extra].sort((a, b) => {
      const A = subSkillById.get(a), B = subSkillById.get(b);
      return (A?.sectionNumber ?? 0) - (B?.sectionNumber ?? 0) || (A?.sortOrder ?? 0) - (B?.sortOrder ?? 0);
    })) cols.push({ subSkillId: id, subSkillName: subSkillById.get(id)?.name ?? "Skill", isFocus: false });
    return cols;
  }, [weekFocus, scores, stars, week, subSkillById]);

  // The program decides which framework's sections the editor offers (Pathways vs part-time).
  const track = program.track;
  const sections = areas.filter((a) => a.track === track && a.subSkills.length > 0).sort((a, b) => a.sortOrder - b.sortOrder);

  // Coverage for the week in view: who is still missing, where the work actually happens.
  // A star counts as done when every focus skill has a score — N/A counts, since marking a
  // skill not-applicable is a deliberate answer, not a gap.
  const coverage = useMemo(() => {
    if (weekFocus.length === 0 || stars.length === 0) return null;
    let done = 0;
    const missing: string[] = [];
    for (const p of stars) {
      const scored = weekFocus.every((f) => {
        const key = scoreKey(p.id, f.subSkillId, week);
        return draft.has(key) ? draft.get(key) !== null : scores.has(key);
      });
      if (scored) done++;
      else missing.push(p.fullName);
    }
    // Overdue only for a week that has actually finished — flagging the current week as late
    // on its own due day, before the class has happened, would be nagging rather than useful.
    const due = dueDayFor(program.meetingDays);
    const dueIndex = due ? DAY_ORDER.indexOf(due) : -1;
    const pastDue = dueIndex >= 0 && new Date().getDay() > dueIndex;
    return { done, total: stars.length, missing, due, pastDue };
  }, [stars, weekFocus, scores, draft, week, program.meetingDays]);

  return (
    <section style={{ border: "0.5px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: tint.fill, borderBottom: "0.5px solid var(--border)" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: tint.accent, flexShrink: 0 }} />
        <h3 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)", margin: 0, color: tint.text }}>{program.name}</h3>
        <span style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>{stars.length} star{stars.length !== 1 ? "s" : ""} · Week {week}</span>
        {!editing && canManage && (
          <button type="button" className="ss-btn" style={{ marginLeft: "auto" }} onClick={onOpenEditor} disabled={editorDisabled}>
            <PenLine className="ss-btn-icon" />{weekFocus.length ? "Edit focus skills" : "Set focus skills"}
          </button>
        )}
        {!editing && !canManage && weekFocus.length === 0 && (
          <span style={{ marginLeft: "auto", fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }} title="Focus skills are set by a coordinator or admin">
            No focus skills set for this week yet
          </span>
        )}
      </div>

      {/* Focus skills for the week */}
      <div style={{ padding: "10px 12px", borderBottom: "0.5px solid var(--border)" }}>
        {editing ? (
          <>
            {/* Every star gets a score on every skill each week (N/A counts), so picking the
                18 one by one — and missing one — was the daily friction. One button selects
                the whole framework; sections and single skills can still be unticked. */}
            {(() => {
              const allIds = sections.flatMap((a) => a.subSkills.map((sk) => sk.id));
              const allOn = allIds.length > 0 && allIds.every((id) => focusDraft.has(id));
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
                  <button type="button" className="ss-btn ss-btn-primary" onClick={() => onSetDraft(new Set(allIds))} disabled={allOn}>
                    <Check className="ss-btn-icon" />Score all {allIds.length} skills
                  </button>
                  <button type="button" className="ss-btn" onClick={() => onSetDraft(new Set())} disabled={focusDraft.size === 0}>
                    <X className="ss-btn-icon" />Clear
                  </button>
                  <span style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>{focusDraft.size} of {allIds.length} selected — click a skill to untick it.</span>
                </div>
              );
            })()}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {sections.map((a) => (
                <div key={a.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: "var(--fs-label)", letterSpacing: "var(--ls-label)", textTransform: "uppercase", color: `color-mix(in srgb, ${a.colorHex} 55%, var(--fg))` }}>{a.name}</span>
                    {(() => {
                      const ids = a.subSkills.map((sk) => sk.id);
                      const on = ids.every((id) => focusDraft.has(id));
                      return (
                        <button type="button" onClick={() => { const n = new Set(focusDraft); ids.forEach((id) => on ? n.delete(id) : n.add(id)); onSetDraft(n); }}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--primary)", padding: 0 }}>
                          {on ? "none" : "all"}
                        </button>
                      );
                    })()}
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {a.subSkills.map((s) => {
                      const on = focusDraft.has(s.id);
                      return (
                        <button key={s.id} type="button" onClick={() => onToggleDraft(s.id)} aria-pressed={on}
                          style={{ padding: "4px 9px", borderRadius: "var(--r-pill)", cursor: "pointer", fontSize: 12,
                            border: `0.5px solid ${on ? a.colorHex : "var(--border)"}`,
                            background: on ? `color-mix(in srgb, ${a.colorHex} 14%, var(--surface))` : "var(--surface)",
                            color: on ? `color-mix(in srgb, ${a.colorHex} 55%, var(--fg))` : "var(--fg-secondary)" }}>
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: "var(--space-3)" }}>
              <button type="button" className="ss-btn" onClick={onCancelEditor} disabled={savingFocus}><X className="ss-btn-icon" />Cancel</button>
              <button type="button" className="ss-btn ss-btn-primary" onClick={onSaveFocus} disabled={savingFocus}>
                <Check className="ss-btn-icon" />{savingFocus ? "Saving…" : `Save ${focusDraft.size} skill${focusDraft.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </>
        ) : weekFocus.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>No focus skills set for this week yet — set the 2–4 skills the lesson plan targets.</div>
        ) : (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Focus</span>
            {weekFocus.map((f) => <span key={f.subSkillId} className="ss-chip is-active">{f.subSkillName}</span>)}
          </div>
        )}
      </div>

      {/* Week coverage */}
      {coverage && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            padding: "8px 12px", borderBottom: "0.5px solid var(--border)",
            background: coverage.done === coverage.total
              ? "var(--success-fill, #e9f1ec)"
              : coverage.pastDue ? "var(--warning-fill, #f7efe2)" : "var(--surface)",
            fontSize: 13,
          }}
        >
          <span style={{ color: coverage.done === coverage.total ? "var(--success-text, var(--success))" : "var(--fg)" }}>
            <strong>Week {week}:</strong> {coverage.done} of {coverage.total} star{coverage.total !== 1 ? "s" : ""} scored
          </span>
          {coverage.due && coverage.done < coverage.total && (
            <span style={{ color: coverage.pastDue ? "var(--warning-text, var(--warning))" : "var(--fg-tertiary)" }}>
              {coverage.pastDue ? `· was due ${coverage.due}` : `· due ${coverage.due}`}
            </span>
          )}
          {coverage.missing.length > 0 && (
            <span style={{ color: "var(--fg-tertiary)" }}>
              still to do: {coverage.missing.slice(0, 4).join(", ")}
              {coverage.missing.length > 4 ? ` +${coverage.missing.length - 4} more` : ""}
            </span>
          )}
        </div>
      )}

      {/* Entry grid */}
      {stars.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>No stars to show for this program.</div>
      ) : columns.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
          {canManage ? <>Set this week&apos;s focus skills above to start entering data.</> : <>Nothing scored yet this week — a coordinator sets the week&apos;s focus skills.</>}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: "var(--fs-label)", textTransform: "uppercase", letterSpacing: "var(--ls-label)", color: "var(--fg-tertiary)", fontWeight: "var(--w-regular)" }}>Star</th>
                {columns.map((f) => (
                  <th key={f.subSkillId} title={f.isFocus ? "This week's focus skill" : "Scored this week (not a focus skill)"}
                    style={{ padding: "8px 8px", fontSize: "var(--fs-meta)", color: f.isFocus ? "var(--fg)" : "var(--fg-tertiary)", fontWeight: f.isFocus ? "var(--w-medium)" : "var(--w-regular)", textAlign: "center", minWidth: 84, borderBottom: f.isFocus ? `2px solid ${tint.accent}` : undefined }}>
                    {f.subSkillName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stars.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < stars.length - 1 ? "0.5px solid var(--border)" : "none" }}>
                  <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span className="ss-avatar teacher sm">{p.initials}</span>
                      <span style={{ fontSize: "var(--fs-body)" }}>{starDisplayName(p.fullName, p.preferredName)}</span>
                      {p.programId !== program.id && (
                        <span className="ss-meta" style={{ color: "var(--fg-tertiary)" }} title="Dual enrollment — primary program is elsewhere">also enrolled</span>
                      )}
                    </span>
                  </td>
                  {columns.map((f) => {
                    const key = scoreKey(p.id, f.subSkillId, week);
                    const pending = draft.has(key);
                    const value = pending ? draft.get(key) ?? "" : scores.get(key) ?? "";
                    return (
                      <td key={f.subSkillId} style={{ padding: "4px 8px", textAlign: "center" }}>
                        <select value={value} onChange={(e) => onScore(p.id, f.subSkillId, (e.target.value || null) as DataScore | null)}
                          style={pending ? { ...cellSelect, borderColor: "var(--warning)", background: "color-mix(in srgb, var(--warning) 12%, var(--surface))" } : cellSelect}
                          aria-label={`${p.fullName} — ${f.subSkillName}${pending ? " (unsaved)" : ""}`}>
                          <option value="">–</option>
                          {SCORES.map((sc) => <option key={sc.value} value={sc.value}>{sc.short}</option>)}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
