"use client";

import { localMonthKey } from "@/lib/format";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCw, Check, X } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { progressApi, goalBankApi } from "@/lib/api/progress";
import { taxonomyApi } from "@/lib/api/taxonomy";
import type {
  ObjectiveAreaDto,
  ProgramTrack,
  StarMonthDto,
  WeeklyDataEntryDto,
  MonthlyProgressSnapshotDto,
  DataScore,
  ProgressLevel,
  GoalBankEntryDto,
  GoalBankKind,
  WeeklyNoteSelectionDto,
  MonthlySummaryDto,
  UpsertMonthlySummaryDto,
} from "@/lib/types/api";

const NOTE_WEEKS = [1, 2, 3, 4];
const NOTE_KINDS: { kind: GoalBankKind; label: string }[] = [
  { kind: "Strength", label: "Strengths observed" },
  { kind: "AreaForImprovement", label: "Areas for improvement" },
  { kind: "NewGoal", label: "New goals for next week" },
];

function sumFrom(s: MonthlySummaryDto | null | undefined): UpsertMonthlySummaryDto {
  return {
    primaryLevel: s?.primaryLevel ?? "NotApplicable",
    progressNarrative: s?.progressNarrative ?? "",
    goalsCarryOver: s?.goalsCarryOver ?? true,
    nextMonthUpdate: s?.nextMonthUpdate ?? "",
  };
}

const WEEKS = [1, 2, 3, 4, 5];

const SCORES: { value: DataScore; short: string }[] = [
  { value: "Refusal", short: "0" },
  { value: "FullPrompts", short: "1" },
  { value: "MinimalPrompts", short: "2" },
  { value: "Independent", short: "3" },
  { value: "NotApplicable", short: "N/A" },
];

const LEVELS: { value: ProgressLevel; label: string }[] = [
  { value: "Novice", label: "Novice" },
  { value: "Intermediate", label: "Intermediate" },
  { value: "Expert", label: "Expert" },
  { value: "NotApplicable", label: "N/A" },
];

// Pathways adds a fourth developmental level beyond Expert.
const PATHWAYS_LEVELS: { value: ProgressLevel; label: string }[] = [
  { value: "Novice", label: "Novice" },
  { value: "Intermediate", label: "Intermediate" },
  { value: "Expert", label: "Expert" },
  { value: "Vocational", label: "Vocational" },
  { value: "NotApplicable", label: "N/A" },
];

function levelLabel(l: ProgressLevel): string {
  return l === "NotApplicable" ? "N/A" : l;
}

const cellSelect: React.CSSProperties = {
  border: "0.5px solid var(--border)", borderRadius: "var(--r-sm)",
  padding: "3px 4px", fontSize: 12, color: "var(--fg)", background: "var(--surface)",
  outline: "none", width: 48,
};

export default function TrackerWidget({ participantId, tracks = ["PartTime"] }: { participantId: string; tracks?: ProgramTrack[] }) {
  const [track, setTrack] = useState<ProgramTrack>(tracks[0] ?? "PartTime");
  const levels = track === "Pathways" ? PATHWAYS_LEVELS : LEVELS;
  const [month, setMonth] = useState(() => localMonthKey());
  const [areas, setAreas] = useState<ObjectiveAreaDto[]>([]);
  const [data, setData] = useState<StarMonthDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState(false);
  const [goalBank, setGoalBank] = useState<GoalBankEntryDto[]>([]);
  const [summaryForm, setSummaryForm] = useState<UpsertMonthlySummaryDto>(sumFrom(null));
  const [savingSummary, setSavingSummary] = useState(false);
  const [customCells, setCustomCells] = useState<Set<string>>(new Set()); // `${kind}:${week}` in custom-text mode

  // Score edits are held here until "Save scores" — key `${subSkillId}:${week}`, null = clear.
  // Per-cell autosave (the old way) let two quick changes race, and the older reply would
  // win and "reset" the cell; it also had no way to clear a score at all.
  const [draft, setDraft] = useState<Map<string, DataScore | null>>(new Map());
  const [savingScores, setSavingScores] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  useEffect(() => { taxonomyApi.getObjectiveAreas().then(setAreas).catch(() => setAreas([])); }, []);
  useEffect(() => { goalBankApi.get().then(setGoalBank).catch(() => setGoalBank([])); }, []);

  useEffect(() => {
    setLoading(true);
    setDraft(new Map());
    setScoreError(null);
    progressApi.getStarMonth(participantId, month)
      .then((d) => { setData(d); setError(false); setSummaryForm(sumFrom(d.monthlySummary)); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [participantId, month]);

  const entryMap = useMemo(() => {
    const m = new Map<string, WeeklyDataEntryDto>();
    data?.entries.forEach((e) => m.set(`${e.subSkillId}:${e.weekNumber}`, e));
    return m;
  }, [data]);

  const snapMap = useMemo(() => {
    const m = new Map<string, MonthlyProgressSnapshotDto>();
    data?.snapshots.forEach((s) => m.set(s.subSkillId, s));
    return m;
  }, [data]);

  const sections = useMemo(
    () => areas.filter((a) => a.track === track && a.subSkills.length > 0).sort((a, b) => a.sortOrder - b.sortOrder),
    [areas, track]
  );

  const noteMap = useMemo(() => {
    const m = new Map<string, WeeklyNoteSelectionDto>();
    data?.noteSelections.forEach((n) => m.set(`${n.kind}:${n.weekNumber}`, n));
    return m;
  }, [data]);

  function saveNote(kind: GoalBankKind, week: number, goalBankEntryId: string | null, customText: string | null) {
    progressApi.recordNote(participantId, month, { weekNumber: week, kind, goalBankEntryId, customText })
      .then((saved) => setData((prev) => prev
        ? { ...prev, noteSelections: [...prev.noteSelections.filter((n) => !(n.kind === kind && n.weekNumber === week)), saved] }
        : prev))
      .catch(() => {});
  }

  function saveSummary() {
    setSavingSummary(true);
    progressApi.upsertSummary(participantId, month, summaryForm)
      .then((saved) => setData((prev) => (prev ? { ...prev, monthlySummary: saved } : prev)))
      .catch(() => {})
      .finally(() => setSavingSummary(false));
  }

  function editScore(subSkillId: string, week: number, score: DataScore | null) {
    const key = `${subSkillId}:${week}`;
    setDraft((prev) => {
      const next = new Map(prev);
      const saved = entryMap.get(key)?.score ?? null;
      if (score === saved) next.delete(key); else next.set(key, score);
      return next;
    });
  }

  function discardScores() { setDraft(new Map()); setScoreError(null); }

  async function saveScores() {
    if (draft.size === 0) return;
    setSavingScores(true);
    setScoreError(null);
    const changes = [...draft.entries()].map(([key, score]) => {
      const [subSkillId, w] = key.split(":");
      return { participantId, subSkillId, weekNumber: Number(w), score };
    });
    try {
      const res = await progressApi.saveWeekly({ monthKey: month, changes });
      const touched = new Set(changes.map((c) => c.subSkillId));
      setData((prev) => prev ? {
        ...prev,
        entries: [...prev.entries.filter((e) => !touched.has(e.subSkillId)), ...res.entries],
        snapshots: [...prev.snapshots.filter((sn) => !touched.has(sn.subSkillId)), ...res.snapshots],
      } : prev);
      setDraft(new Map());
    } catch (e) {
      setScoreError(describeApiError(e, "Couldn't save the scores — nothing was changed. Try again."));
    } finally {
      setSavingScores(false);
    }
  }

  function confirmLevel(subSkillId: string, level: ProgressLevel) {
    progressApi.confirmMonthEnd(participantId, month, { subSkillId, level })
      .then((saved) => setData((prev) => prev
        ? { ...prev, snapshots: [...prev.snapshots.filter((s) => s.subSkillId !== subSkillId), saved] }
        : prev))
      .catch(() => {});
  }

  function recompute() {
    setComputing(true);
    progressApi.computeMonthEnd(participantId, month)
      .then((snaps) => setData((prev) => (prev ? { ...prev, snapshots: snaps } : prev)))
      .catch(() => {})
      .finally(() => setComputing(false));
  }

  return (
    <div className="widget">
      <div className="widget-head" style={{ display: "flex", alignItems: "center" }}>
        <ClipboardList className="ico" style={{ color: "var(--primary)" }} />
        <h3>Weekly tracker</h3>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {tracks.length > 1 && tracks.map((t) => (
            <button key={t} type="button" className={`ss-chip${track === t ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setTrack(t)}>
              {t === "Pathways" ? "Pathways" : "Part-time"}
            </button>
          ))}
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "5px 8px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none" }}
          />
          <button type="button" className="ss-btn" onClick={recompute} disabled={computing || loading} title="Month-end levels update automatically as scores are saved. Use this to refresh a month whose scores were entered before that was true.">
            <RefreshCw className="ss-btn-icon" style={computing ? { animation: "spin 1s linear infinite" } : undefined} />
            {computing ? "Updating…" : "Refresh levels"}
          </button>
        </div>
      </div>

      <div className="widget-body">
        {loading ? (
          <div style={{ padding: "16px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: "16px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>Couldn&apos;t load the tracker — check the API and try again.</div>
        ) : sections.length === 0 ? (
          <div style={{ padding: "16px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>Skill taxonomy unavailable.</div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560, fontSize: "var(--fs-body)" }}>
                <thead>
                  <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: "var(--w-regular)", color: "var(--fg-tertiary)", fontSize: "var(--fs-label)", textTransform: "uppercase", letterSpacing: "var(--ls-label)" }}>Skill</th>
                    {WEEKS.map((w) => (
                      <th key={w} style={{ padding: "6px 4px", fontWeight: "var(--w-regular)", color: "var(--fg-tertiary)", fontSize: "var(--fs-label)", textTransform: "uppercase" }}>W{w}</th>
                    ))}
                    <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: "var(--w-regular)", color: "var(--fg-tertiary)", fontSize: "var(--fs-label)", textTransform: "uppercase", letterSpacing: "var(--ls-label)" }}>Month-end</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((area) => (
                    <FragmentSection key={area.id} area={area}
                      entryMap={entryMap} snapMap={snapMap} draft={draft}
                      onScore={editScore} onConfirm={confirmLevel} />
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: "var(--space-3)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="ss-btn ss-btn-primary" onClick={saveScores} disabled={draft.size === 0 || savingScores}>
                <Check className="ss-btn-icon" />{savingScores ? "Saving…" : draft.size > 0 ? `Save ${draft.size} score${draft.size === 1 ? "" : "s"}` : "Save scores"}
              </button>
              <button type="button" className="ss-btn" onClick={discardScores} disabled={draft.size === 0 || savingScores}>
                <X className="ss-btn-icon" />Discard
              </button>
              {draft.size > 0 && !scoreError && (
                <span style={{ fontSize: "var(--fs-meta)", color: "var(--warning-text, var(--warning))" }}>Unsaved changes — nothing is stored until you save.</span>
              )}
              {scoreError && <span role="alert" style={{ fontSize: "var(--fs-meta)", color: "var(--danger)" }}>{scoreError}</span>}
            </div>
            <div style={{ marginTop: "var(--space-3)", fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)", lineHeight: "var(--lh-body)" }}>
              Data: <strong>0</strong> Refusal · <strong>1</strong> Full prompts · <strong>2</strong> Minimal prompts · <strong>3</strong> Independent · <strong>N/A</strong> not targeted.
              Month-end suggests a level from the average of scored weeks — confirm or override it.
            </div>

            {/* Section 6 — weekly notes */}
            <div style={{ marginTop: "var(--space-5)", borderTop: "0.5px solid var(--border)", paddingTop: "var(--space-4)" }}>
              <div className="ss-label" style={{ marginBottom: "var(--space-3)", color: "var(--fg-secondary)" }}>Section 6 · Weekly notes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                {NOTE_KINDS.map(({ kind, label }) => (
                  <div key={kind}>
                    <div style={{ fontSize: "var(--fs-body)", fontWeight: "var(--w-medium)", marginBottom: 6 }}>{label}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-2)" }}>
                      {NOTE_WEEKS.map((w) => {
                        const cellKey = `${kind}:${w}`;
                        const sel = noteMap.get(cellKey);
                        const opts = goalBank.filter((g) => g.kind === kind);
                        const groups = [...new Set(opts.map((g) => `S${g.sectionNumber} · ${levelLabel(g.level)}`))];
                        const inputStyle = { border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "6px 8px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none", width: "100%" } as React.CSSProperties;
                        const isCustom = customCells.has(cellKey) || (!!sel && !sel.goalBankEntryId && !!sel.customText);
                        return (
                          <label key={w} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={{ fontSize: "var(--fs-label)", letterSpacing: "var(--ls-label)", textTransform: "uppercase", color: "var(--fg-tertiary)" }}>Week {w}</span>
                            {isCustom ? (
                              <div style={{ display: "flex", gap: 4 }}>
                                <input defaultValue={sel?.customText ?? ""} placeholder="Type a note…" autoFocus={customCells.has(cellKey)}
                                  onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (sel?.customText ?? null)) saveNote(kind, w, null, v); }}
                                  style={{ ...inputStyle, flex: 1 }} />
                                <button type="button" title="Use a preset instead" onClick={() => { setCustomCells((s) => { const n = new Set(s); n.delete(cellKey); return n; }); if (sel?.customText) saveNote(kind, w, null, null); }}
                                  style={{ background: "none", border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", cursor: "pointer", color: "var(--fg-tertiary)", padding: "0 8px" }}>✕</button>
                              </div>
                            ) : (
                              <select value={sel?.goalBankEntryId ?? ""}
                                onChange={(e) => { if (e.target.value === "__custom__") setCustomCells((s) => new Set(s).add(cellKey)); else saveNote(kind, w, e.target.value || null, null); }}
                                style={inputStyle}>
                                <option value="">— none —</option>
                                <option value="__custom__">✎ Custom…</option>
                                {groups.map((g) => (
                                  <optgroup key={g} label={g}>
                                    {opts.filter((o) => `S${o.sectionNumber} · ${levelLabel(o.level)}` === g).map((o) => (
                                      <option key={o.id} value={o.id}>{o.text}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly summary */}
            <div style={{ marginTop: "var(--space-5)", borderTop: "0.5px solid var(--border)", paddingTop: "var(--space-4)" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: "var(--space-3)" }}>
                <div className="ss-label" style={{ color: "var(--fg-secondary)" }}>Monthly summary</div>
                <button type="button" className="ss-btn ss-btn-primary" style={{ marginLeft: "auto" }} onClick={saveSummary} disabled={savingSummary}>
                  <Check className="ss-btn-icon" />{savingSummary ? "Saving…" : "Save summary"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: 620 }}>
                <div>
                  <div className="ss-label" style={{ marginBottom: 6 }}>Primary level for the month</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {levels.map((l) => (
                      <button key={l.value} type="button" className={`ss-chip${summaryForm.primaryLevel === l.value ? " is-active" : ""}`} style={{ cursor: "pointer" }}
                        onClick={() => setSummaryForm((f) => ({ ...f, primaryLevel: l.value }))}>{l.label}</button>
                    ))}
                  </div>
                  {/*
                    The calculated overall level, offered rather than applied. Same
                    suggest-then-confirm split the per-skill levels use: the average is the
                    machine's answer, the chip above is what a named person stands behind.
                  */}
                  {data && data.suggestedPrimaryScoredCount > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "var(--fg-tertiary)" }}>
                      <span>
                        Calculated across all {data.suggestedPrimaryScoredCount} score
                        {data.suggestedPrimaryScoredCount !== 1 ? "s" : ""} this month:{" "}
                        <strong style={{ color: "var(--fg-secondary)" }}>{levelLabel(data.suggestedPrimaryLevel)}</strong>
                      </span>
                      {summaryForm.primaryLevel !== data.suggestedPrimaryLevel && (
                        <button
                          type="button"
                          onClick={() => setSummaryForm((f) => ({ ...f, primaryLevel: data.suggestedPrimaryLevel }))}
                          style={{ border: "0.5px solid var(--border-hover)", background: "var(--surface)", borderRadius: "var(--r-pill)", padding: "2px 10px", fontSize: 11, color: "var(--fg-secondary)", cursor: "pointer" }}
                        >
                          Use this
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <div className="ss-label" style={{ marginBottom: 6 }}>Progress this month</div>
                  <textarea rows={2} value={summaryForm.progressNarrative ?? ""} onChange={(e) => setSummaryForm((f) => ({ ...f, progressNarrative: e.target.value }))}
                    style={{ width: "100%", boxSizing: "border-box", border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "8px 12px", fontSize: 13, color: "var(--fg)", background: "var(--surface)", outline: "none", resize: "vertical", lineHeight: "var(--lh-body)" }} />
                </div>
                <div>
                  <div className="ss-label" style={{ marginBottom: 6 }}>Goals carry over to next month?</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className={`ss-chip${summaryForm.goalsCarryOver ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setSummaryForm((f) => ({ ...f, goalsCarryOver: true }))}>Yes — carry over</button>
                    <button type="button" className={`ss-chip${!summaryForm.goalsCarryOver ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setSummaryForm((f) => ({ ...f, goalsCarryOver: false }))}>No — update</button>
                  </div>
                </div>
                {!summaryForm.goalsCarryOver && (
                  <div>
                    <div className="ss-label" style={{ marginBottom: 6 }}>What&apos;s new for next month</div>
                    <textarea rows={2} value={summaryForm.nextMonthUpdate ?? ""} onChange={(e) => setSummaryForm((f) => ({ ...f, nextMonthUpdate: e.target.value }))}
                      style={{ width: "100%", boxSizing: "border-box", border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "8px 12px", fontSize: 13, color: "var(--fg)", background: "var(--surface)", outline: "none", resize: "vertical", lineHeight: "var(--lh-body)" }} />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FragmentSection({
  area, entryMap, snapMap, draft, onScore, onConfirm,
}: {
  area: ObjectiveAreaDto;
  entryMap: Map<string, WeeklyDataEntryDto>;
  snapMap: Map<string, MonthlyProgressSnapshotDto>;
  draft: Map<string, DataScore | null>;
  onScore: (subSkillId: string, week: number, score: DataScore | null) => void;
  onConfirm: (subSkillId: string, level: ProgressLevel) => void;
}) {
  const rowLevels = area.track === "Pathways" ? PATHWAYS_LEVELS : LEVELS;
  return (
    <>
      <tr>
        <td colSpan={7} style={{ padding: "8px 8px 4px", fontSize: "var(--fs-label)", letterSpacing: "var(--ls-label)", textTransform: "uppercase", color: `color-mix(in srgb, ${area.colorHex} 55%, var(--fg))`, fontWeight: "var(--w-medium)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: area.colorHex }} />
            {area.name}
          </span>
          {area.annualGoal && (
            <div style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, fontSize: 11, color: "var(--fg-tertiary)", marginTop: 3, lineHeight: 1.45, maxWidth: 720 }}>
              <strong>Annual goal:</strong> {area.annualGoal}
              {area.sixMonthBenchmark && <> · <strong>6-month benchmark:</strong> {area.sixMonthBenchmark}</>}
            </div>
          )}
        </td>
      </tr>
      {[...area.subSkills].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => {
        const snap = snapMap.get(s.id);
        return (
          <tr key={s.id} style={{ borderBottom: "0.5px solid var(--border)" }}>
            <td style={{ padding: "5px 8px", color: "var(--fg)" }}>{s.name}</td>
            {WEEKS.map((w) => {
              const key = `${s.id}:${w}`;
              const pending = draft.has(key);
              const value = pending ? draft.get(key) ?? "" : entryMap.get(key)?.score ?? "";
              return (
                <td key={w} style={{ padding: "4px 2px", textAlign: "center" }}>
                  <select
                    value={value}
                    onChange={(e) => onScore(s.id, w, (e.target.value || null) as DataScore | null)}
                    style={pending ? { ...cellSelect, borderColor: "var(--warning)", background: "color-mix(in srgb, var(--warning) 12%, var(--surface))" } : cellSelect}
                    aria-label={`${s.name} week ${w}${pending ? " (unsaved)" : ""}`}
                  >
                    <option value="">–</option>
                    {SCORES.map((sc) => <option key={sc.value} value={sc.value}>{sc.short}</option>)}
                  </select>
                </td>
              );
            })}
            <td style={{ padding: "4px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/*
                  Bound to the CONFIRMED level only, never to the auto-derived one. Levels now
                  fill in the moment a score is saved, so binding to snap.level would show
                  "Intermediate" already selected — and a teacher who agrees would pick the
                  value that is already there, fire no change event, and confirm nothing. The
                  cohort roll-up counts confirmed levels only, so the tracker would look
                  complete while the roll-up read zero.
                */}
                <select
                  value={snap?.isConfirmed ? snap.level : ""}
                  onChange={(e) => e.target.value && onConfirm(s.id, e.target.value as ProgressLevel)}
                  style={{ border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-sm)", padding: "3px 6px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none" }}
                  aria-label={`${s.name} — confirmed month-end level`}
                >
                  <option value="">{snap && snap.scoredWeekCount > 0 ? "Confirm…" : "Set…"}</option>
                  {rowLevels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                {snap?.isConfirmed ? (
                  <span title="Confirmed" style={{ display: "inline-flex", alignItems: "center", color: "var(--success)" }}><Check style={{ width: 13, height: 13 }} /></span>
                ) : snap && snap.scoredWeekCount > 0 ? (
                  // One click to agree with the calculated level — the common case. Picking a
                  // different level from the dropdown remains the way to disagree.
                  <button
                    type="button"
                    onClick={() => onConfirm(s.id, snap.suggestedLevel)}
                    title={`Confirm ${levelLabel(snap.suggestedLevel)}, calculated from ${snap.scoredWeekCount} scored week${snap.scoredWeekCount !== 1 ? "s" : ""}`}
                    aria-label={`Confirm ${levelLabel(snap.suggestedLevel)} for ${s.name}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "0.5px solid var(--border-hover)", background: "var(--surface)", borderRadius: "var(--r-pill)", padding: "2px 8px", fontSize: 10, color: "var(--fg-secondary)", cursor: "pointer" }}
                  >
                    <Check style={{ width: 11, height: 11 }} />
                    {levelLabel(snap.suggestedLevel)}
                  </button>
                ) : null}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
