"use client";

import { useEffect, useMemo, useState } from "react";
import { PenLine, Check, X, Info } from "lucide-react";
import { useMyPrograms, useParticipants, useObjectiveAreas, useStaff } from "@/lib/api/hooks";
import { progressApi } from "@/lib/api/progress";
import { rosterApi } from "@/lib/api/roster";
import { useAuth } from "@/lib/auth/AuthProvider";
import { programTint } from "@/lib/programColor";
import { Skeleton } from "../components/Skeleton";
import ProgramPills from "../components/ProgramPills";
import type {
  ProgramSummaryDto,
  ParticipantSummaryDto,
  ObjectiveAreaDto,
  WeeklyFocusSkillDto,
  WeeklyDataEntryDto,
  DataScore,
  StaffSummaryDto,
  RosterEntryDto,
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

// The term the roster is keyed by. Assignments are set per quarter, so the filter reads
// the current one — the same convention the Roster page uses.
function currentTerm() {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

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

/** Which stars a staff member "has", and where that answer came from. */
type StaffScope = { ids: Set<string>; fromRoster: boolean };

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
  const programs: ProgramSummaryDto[] = useMyPrograms().data ?? [];
  const allParticipants: ParticipantSummaryDto[] = useParticipants().data ?? [];
  const areas: ObjectiveAreaDto[] = useObjectiveAreas().data ?? [];
  const staff: StaffSummaryDto[] = useStaff().data ?? [];
  const { user } = useAuth();

  const [staffFilter, setStaffFilter] = useState<string>("");            // "" = all stars
  const [programFilter, setProgramFilter] = useState<string | null>(null); // null = all programs
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [week, setWeek] = useState(1);

  // The term's roster: which staff member each star is assigned to. A management user sees
  // the whole roster, a teacher their programs' (the API scopes it).
  const [assignments, setAssignments] = useState<RosterEntryDto[] | null>(null); // null = not loaded yet
  const [term] = useState(currentTerm);
  useEffect(() => {
    rosterApi.get(term.year, term.quarter)
      .then(setAssignments)
      // An empty array is a real answer ("nobody is assigned yet"); a failure is not. Both
      // used to collapse to [], which silently turned a 500 into an empty roster.
      .catch(() => setAssignments([]));
  }, [term]);

  const programIdByName = useMemo(() => new Map(programs.map((p) => [p.name, p.id])), [programs]);

  // A staff member's stars: their roster assignments this term when they have any, otherwise
  // every star in the programs they teach. The roster is the precise answer; the program
  // fallback keeps the filter useful in a quarter nobody has filled the roster in for —
  // which, at the start of every term, is all of them.
  const starsByStaff = useMemo(() => {
    const map = new Map<string, StaffScope>();
    for (const m of staff) {
      if (m.isFormer) continue;
      const roster = new Set(
        (assignments ?? []).filter((a) => a.assignedStaffId === m.id).map((a) => a.participantId)
      );
      if (roster.size > 0) { map.set(m.id, { ids: roster, fromRoster: true }); continue; }

      const progIds = new Set(m.programNames.map((n) => programIdByName.get(n)).filter((id): id is string => !!id));
      if (progIds.size === 0) continue;
      const ids = new Set(
        allParticipants
          .filter((p) => progIds.has(p.programId) || (p.secondaryProgramId !== null && progIds.has(p.secondaryProgramId)))
          .map((p) => p.id)
      );
      map.set(m.id, { ids, fromRoster: false });
    }
    return map;
  }, [staff, assignments, allParticipants, programIdByName]);

  // Staff who have stars to show, the signed-in user first.
  const staffChoices = useMemo(
    () => staff
      .filter((m) => starsByStaff.has(m.id))
      .sort((a, b) => {
        if (a.id === user?.staffMemberId) return -1;
        if (b.id === user?.staffMemberId) return 1;
        return a.fullName.localeCompare(b.fullName);
      }),
    [staff, starsByStaff, user?.staffMemberId]
  );
  const staffScope: StaffScope | null = staffFilter ? (starsByStaff.get(staffFilter) ?? null) : null;
  const staffName = staffFilter ? staff.find((m) => m.id === staffFilter)?.fullName ?? "this staff member" : "";

  const programsInView = useMemo(
    () => (programFilter ? programs.filter((p) => p.id === programFilter) : programs),
    [programs, programFilter]
  );

  // One group per program in view: its stars (primary or secondary enrollment) that pass the
  // staff filter. With "All programs", a program with nobody to show is skipped.
  const groups = useMemo(
    () => programsInView
      .map((program) => ({
        program,
        stars: allParticipants
          .filter((p) => (p.programId === program.id || p.secondaryProgramId === program.id))
          .filter((p) => !staffScope || staffScope.ids.has(p.id))
          .sort((a, b) => a.fullName.localeCompare(b.fullName)),
      }))
      .filter((g) => g.stars.length > 0 || programFilter !== null),
    [programsInView, allParticipants, staffScope, programFilter]
  );

  // Focus skills per program (all weeks of the month) and every score for the stars in view.
  // "Loading" is derived: the data on hand is stamped with the (programs, month) it was
  // fetched for, and the grid is loading whenever that stamp is behind the filters.
  const [focus, setFocus] = useState<Map<string, WeeklyFocusSkillDto[]>>(new Map());
  const [scores, setScores] = useState<Map<string, DataScore>>(new Map());
  const [loadedKey, setLoadedKey] = useState("");
  const programKey = programsInView.map((p) => p.id).join(",");
  const dataKey = `${programKey}|${month}`;
  const loading = programKey !== "" && loadedKey !== dataKey;

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

  function recordScore(participantId: string, subSkillId: string, score: DataScore) {
    setScores((prev) => new Map(prev).set(scoreKey(participantId, subSkillId, week), score));
    progressApi.recordWeekly({ participantId, subSkillId, monthKey: month, weekNumber: week, score }).catch(() => {});
  }

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

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles"><h1>Weekly Data</h1></div>
        <div className="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            style={{ border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "6px 8px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none" }} />
        </div>
      </div>

      <div className="adm-content">
        {/* Filters: staff first, then program, then week */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Staff</span>
            <button type="button" className={`ss-chip${staffFilter === "" ? " is-active" : ""}`} aria-pressed={staffFilter === ""} style={{ cursor: "pointer" }} onClick={() => setStaffFilter("")}>All stars</button>
            {staffChoices.map((m) => {
              const scope = starsByStaff.get(m.id)!;
              return (
                <button key={m.id} type="button" className={`ss-chip${staffFilter === m.id ? " is-active" : ""}`} aria-pressed={staffFilter === m.id} style={{ cursor: "pointer" }} onClick={() => setStaffFilter(staffFilter === m.id ? "" : m.id)}
                  title={scope.fromRoster ? `${scope.ids.size} assigned on the roster this term` : `${scope.ids.size} in the programs they teach`}>
                  {m.id === user?.staffMemberId ? "My stars" : m.fullName}
                  <span style={{ opacity: 0.7, marginLeft: 4 }}>{scope.ids.size}</span>
                </button>
              );
            })}
          </div>
          {staffScope && !staffScope.fromRoster && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>
              <Info style={{ width: 13, height: 13, flexShrink: 0 }} />
              No stars are assigned to {staffName} on the Roster this term, so this shows every star in the programs they teach. Set assignments on the Roster page to narrow it.
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Program</span>
            <ProgramPills programs={programs} value={programFilter} onChange={setProgramFilter} allLabel="All programs" compact />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Week</span>
            {WEEKS.map((w) => (
              <button key={w} type="button" className={`ss-chip${week === w ? " is-active" : ""}`} aria-pressed={week === w} style={{ cursor: "pointer" }} onClick={() => setWeek(w)}>W{w}</button>
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
          <div style={{ padding: "24px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
            No programs are assigned to you yet — an admin can add you to a program from the Programs page.
          </div>
        ) : totalStars === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
            {staffFilter
              ? `No stars for ${staffName}${programFilter ? " in this program" : ""}. Choose “All stars”, or set assignments on the Roster page.`
              : "No stars in this program yet."}
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
                areas={areas}
                onScore={recordScore}
                editing={editingProgramId === g.program.id}
                editorDisabled={editingProgramId !== null && editingProgramId !== g.program.id}
                focusDraft={focusDraft}
                savingFocus={savingFocus}
                onOpenEditor={() => openFocusEditor(g.program.id)}
                onToggleDraft={toggleDraft}
                onSaveFocus={saveFocus}
                onCancelEditor={() => setEditingProgramId(null)}
              />
            ))}
          </div>
        )}

        <div style={{ marginTop: "var(--space-3)", fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>
          <strong>0</strong> Refusal · <strong>1</strong> Full prompts · <strong>2</strong> Minimal prompts · <strong>3</strong> Independent · <strong>N/A</strong> not targeted. Scores save as you enter them.
        </div>
      </div>
    </div>
  );
}

/** One program's block: its focus skills for the week, coverage, and the entry grid. */
function ProgramSection({
  program, stars, week, weekFocus, scores, areas, onScore,
  editing, editorDisabled, focusDraft, savingFocus, onOpenEditor, onToggleDraft, onSaveFocus, onCancelEditor,
}: {
  program: ProgramSummaryDto;
  stars: ParticipantSummaryDto[];
  week: number;
  weekFocus: WeeklyFocusSkillDto[];
  scores: Map<string, DataScore>;
  areas: ObjectiveAreaDto[];
  onScore: (participantId: string, subSkillId: string, score: DataScore) => void;
  editing: boolean;
  editorDisabled: boolean;
  focusDraft: Set<string>;
  savingFocus: boolean;
  onOpenEditor: () => void;
  onToggleDraft: (id: string) => void;
  onSaveFocus: () => void;
  onCancelEditor: () => void;
}) {
  const tint = programTint(program.colorHex);

  // The program decides which framework's sections the editor offers (Pathways vs part-time).
  const track = program.slug === "pathways" ? "Pathways" : "PartTime";
  const sections = areas.filter((a) => a.track === track && a.subSkills.length > 0).sort((a, b) => a.sortOrder - b.sortOrder);

  // Coverage for the week in view: who is still missing, where the work actually happens.
  // A star counts as done when every focus skill has a score — N/A counts, since marking a
  // skill not-applicable is a deliberate answer, not a gap.
  const coverage = useMemo(() => {
    if (weekFocus.length === 0 || stars.length === 0) return null;
    let done = 0;
    const missing: string[] = [];
    for (const p of stars) {
      const scored = weekFocus.every((f) => scores.get(scoreKey(p.id, f.subSkillId, week)));
      if (scored) done++;
      else missing.push(p.fullName);
    }
    // Overdue only for a week that has actually finished — flagging the current week as late
    // on its own due day, before the class has happened, would be nagging rather than useful.
    const due = dueDayFor(program.meetingDays);
    const dueIndex = due ? DAY_ORDER.indexOf(due) : -1;
    const pastDue = dueIndex >= 0 && new Date().getDay() > dueIndex;
    return { done, total: stars.length, missing, due, pastDue };
  }, [stars, weekFocus, scores, week, program.meetingDays]);

  return (
    <section style={{ border: "0.5px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: tint.fill, borderBottom: "0.5px solid var(--border)" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: tint.accent, flexShrink: 0 }} />
        <h3 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)", margin: 0, color: tint.text }}>{program.name}</h3>
        <span style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>{stars.length} star{stars.length !== 1 ? "s" : ""} · Week {week}</span>
        {!editing && (
          <button type="button" className="ss-btn" style={{ marginLeft: "auto" }} onClick={onOpenEditor} disabled={editorDisabled}>
            <PenLine className="ss-btn-icon" />{weekFocus.length ? "Edit focus skills" : "Set focus skills"}
          </button>
        )}
      </div>

      {/* Focus skills for the week */}
      <div style={{ padding: "10px 12px", borderBottom: "0.5px solid var(--border)" }}>
        {editing ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {sections.map((a) => (
                <div key={a.id}>
                  <div style={{ fontSize: "var(--fs-label)", letterSpacing: "var(--ls-label)", textTransform: "uppercase", color: `color-mix(in srgb, ${a.colorHex} 55%, var(--fg))`, marginBottom: 4 }}>{a.name}</div>
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
      ) : weekFocus.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>Set this week&apos;s focus skills above to start entering data.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: "var(--fs-label)", textTransform: "uppercase", letterSpacing: "var(--ls-label)", color: "var(--fg-tertiary)", fontWeight: "var(--w-regular)" }}>Star</th>
                {weekFocus.map((f) => (
                  <th key={f.subSkillId} style={{ padding: "8px 8px", fontSize: "var(--fs-meta)", color: "var(--fg-secondary)", fontWeight: "var(--w-regular)", textAlign: "center", minWidth: 84 }}>{f.subSkillName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stars.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < stars.length - 1 ? "0.5px solid var(--border)" : "none" }}>
                  <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span className="ss-avatar teacher sm">{p.initials}</span>
                      <span style={{ fontSize: "var(--fs-body)" }}>{p.fullName}</span>
                      {p.programId !== program.id && (
                        <span className="ss-meta" style={{ color: "var(--fg-tertiary)" }} title="Dual enrollment — primary program is elsewhere">also enrolled</span>
                      )}
                    </span>
                  </td>
                  {weekFocus.map((f) => {
                    const key = scoreKey(p.id, f.subSkillId, week);
                    return (
                      <td key={f.subSkillId} style={{ padding: "4px 8px", textAlign: "center" }}>
                        <select value={scores.get(key) ?? ""} onChange={(e) => e.target.value && onScore(p.id, f.subSkillId, e.target.value as DataScore)} style={cellSelect} aria-label={`${p.fullName} — ${f.subSkillName}`}>
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
