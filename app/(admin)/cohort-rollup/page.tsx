"use client";

import { localMonthKey } from "@/lib/format";

import { Fragment, useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { cohortApi } from "@/lib/api/cohort";
import { describeApiError } from "@/lib/api/client";
import { useMyPrograms } from "@/lib/api/hooks";
import ProgramPills from "../components/ProgramPills";
import type { CohortRollUpDto, CohortRollUpRowDto, ProgramSummaryDto, ProgramTrack, CohortStarDto, ProgressLevel } from "@/lib/types/api";

const TRACK_LABEL: Record<ProgramTrack, string> = { PartTime: "Part-time", Pathways: "Pathways" };
const trackLabel = (t: ProgramTrack) => TRACK_LABEL[t] ?? "Skills";

// Ordinal "mastery" ramp (light -> dark = more developed). Validated: CVD ΔE 17.2,
// monotonic lightness; the light step's contrast is relieved by direct count labels + gaps.
const LEVEL = {
  Novice:       { color: "#74c49a", label: "Novice" },
  Intermediate: { color: "#369a66", label: "Intermediate" },
  Expert:       { color: "#14683f", label: "Expert" },
} as const;

function DistributionBar({ row }: { row: CohortRollUpRowDto }) {
  const total = row.scoredCount;
  if (total === 0) {
    return <div style={{ height: 10, borderRadius: 5, background: "var(--bg-tertiary)" }} title="No levels yet" />;
  }
  const segs: { key: keyof typeof LEVEL; n: number }[] = [
    { key: "Novice", n: row.noviceCount },
    { key: "Intermediate", n: row.intermediateCount },
    { key: "Expert", n: row.expertCount },
  ].filter((s) => s.n > 0) as { key: keyof typeof LEVEL; n: number }[];

  return (
    <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: 2, background: "var(--surface)" }}>
      {segs.map((s) => (
        <div key={s.key} title={`${LEVEL[s.key].label}: ${s.n}`}
          style={{ flex: s.n, background: LEVEL[s.key].color, minWidth: 3 }} />
      ))}
    </div>
  );
}

/**
 * A roll-up count that answers "which students", not just "how many" — Rachel's request.
 * Zero counts are plain text: nothing to open, and making them look clickable invites a
 * pointless round-trip.
 */
function CountCell({
  n, level, subSkillId, isOpen, onToggle,
}: {
  n: number;
  level: ProgressLevel;
  subSkillId: string;
  isOpen: boolean;
  onToggle: (subSkillId: string, level: ProgressLevel) => void;
}) {
  const base: React.CSSProperties = {
    padding: "8px 12px", textAlign: "center", fontVariantNumeric: "tabular-nums",
  };
  if (n === 0) return <td style={{ ...base, color: "var(--fg-tertiary)" }}>0</td>;
  return (
    <td style={base}>
      <button
        type="button"
        onClick={() => onToggle(subSkillId, level)}
        aria-expanded={isOpen}
        title={`Show the ${n} star${n !== 1 ? "s" : ""} at ${level}`}
        style={{
          border: "0.5px solid transparent", background: isOpen ? "var(--bg-tertiary)" : "none",
          borderRadius: "var(--r-sm)", padding: "2px 8px", cursor: "pointer",
          font: "inherit", color: "var(--fg)", fontVariantNumeric: "tabular-nums",
          textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3,
        }}
      >
        {n}
      </button>
    </td>
  );
}

function LevelBadge({ level }: { level: string }) {
  const meta = (LEVEL as Record<string, { color: string; label: string }>)[level];
  if (!meta) return <span style={{ color: "var(--fg-tertiary)", fontSize: "var(--fs-meta)" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--fs-meta)", color: `color-mix(in srgb, ${meta.color} 60%, var(--fg))` }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color }} />{meta.label}
    </span>
  );
}

export default function CohortRollUpPage() {
  const [month, setMonth] = useState(() => localMonthKey());
  const [programId, setProgramId] = useState<string | null>(null);
  // Cached + shared via React Query (#34).
  const programs: ProgramSummaryDto[] = useMyPrograms().data ?? [];
  const [data, setData] = useState<CohortRollUpDto | null>(null);
  // The data on hand is stamped with the (month, program) it answers; "loading" is simply
  // that stamp being behind the filters, so no effect has to flip a flag.
  const [loadedKey, setLoadedKey] = useState("");
  const scopeKey = `${month}|${programId ?? ""}`;
  // A failure is stamped with its scope too, so picking another month or program retries
  // instead of keeping the old error on screen.
  const [failure, setFailure] = useState<{ key: string; error: unknown } | null>(null);
  const error = failure?.key === scopeKey ? failure.error : null;
  const loading = loadedKey !== scopeKey && !error;

  useEffect(() => {
    let active = true;
    cohortApi.getRollUp(month, programId ?? undefined)
      .then((d) => { if (active) { setData(d); setFailure(null); setLoadedKey(scopeKey); } })
      .catch((err) => { if (active) setFailure({ key: scopeKey, error: err ?? new Error("Roll-up failed") }); });
    return () => { active = false; };
  }, [month, programId, scopeKey]);

  // Which cell is expanded, and the Stars behind it. One at a time — this is a reference
  // lookup ("who are those four?"), not a comparison view. The open cell remembers the scope
  // it was opened in, so changing the month or program collapses it — the list would
  // otherwise describe a cohort that is no longer on screen.
  const [openCellRaw, setOpenCell] = useState<{ scope: string; subSkillId: string; level: ProgressLevel } | null>(null);
  const openCell = openCellRaw?.scope === scopeKey ? openCellRaw : null;
  const [cellStars, setCellStars] = useState<CohortStarDto[] | null>(null);
  const [cellLoading, setCellLoading] = useState(false);
  const [cellError, setCellError] = useState<string | null>(null);

  function toggleCell(subSkillId: string, level: ProgressLevel) {
    const same = openCell?.subSkillId === subSkillId && openCell?.level === level;
    if (same) { setOpenCell(null); setCellStars(null); return; }
    setOpenCell({ scope: scopeKey, subSkillId, level });
    setCellStars(null);
    setCellError(null);
    setCellLoading(true);
    cohortApi.getStarsAtLevel(month, subSkillId, level, programId || undefined)
      .then(setCellStars)
      // A failed lookup must not read as "no stars".
      .catch((err) => setCellError(describeApiError(err, "Couldn't load these stars. Try again.")))
      .finally(() => setCellLoading(false));
  }

  // One table per objective area, in the order the rows arrive (track, then area, then
  // skill). Grouping by section number mixed the frameworks: Part-time and Pathways both
  // number their sections 1–5, so Pathways pillars showed up inside Part-time areas. Under
  // "All programs" the areas sit in a Part-time block and a Pathways block.
  const tracks = useMemo(() => {
    const byTrack = new Map<ProgramTrack, { track: ProgramTrack; levels: number; areas: Map<string, { id: string; name: string; color: string; rows: CohortRollUpRowDto[] }> }>();
    for (const r of data?.rows ?? []) {
      let t = byTrack.get(r.track);
      if (!t) byTrack.set(r.track, (t = { track: r.track, levels: 0, areas: new Map() }));
      t.levels += r.scoredCount;
      let area = t.areas.get(r.objectiveAreaId);
      if (!area) t.areas.set(r.objectiveAreaId, (area = { id: r.objectiveAreaId, name: r.objectiveAreaName, color: r.objectiveAreaColorHex, rows: [] }));
      area.rows.push(r);
    }
    return [...byTrack.values()].map((t) => ({ ...t, areas: [...t.areas.values()] }));
  }, [data]);
  const showTrackHeadings = programId === null;

  // Every (star, skill) level this month, whether derived from scores or confirmed by a teacher.
  const totalLevels = data?.rows.reduce((n, r) => n + r.scoredCount, 0) ?? 0;
  const skillsWithData = data?.rows.filter((r) => r.scoredCount > 0).length ?? 0;

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles"><h1>Cohort Roll-Up</h1></div>
        <div className="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            style={{ border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "6px 8px", fontSize: 12, color: "var(--fg)", background: "var(--surface)", outline: "none" }} />
        </div>
      </div>

      <div className="adm-content">
        <div className="info-note" style={{ marginBottom: "var(--space-2)" }}>
          <BarChart3 />
          <span>Where the cohort lives this month — how many stars sit at each level per skill, derived live from the <strong>weekly scores</strong> entered on the Weekly Data page. A month-end level confirmed in a star&apos;s tracker overrides the derived one.</span>
        </div>

        {/* program filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
          <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Program</span>
          <ProgramPills programs={programs} value={programId} onChange={setProgramId} allLabel="All programs" compact />
        </div>

        {/* stat tiles */}
        <div className="board-stats">
          <div className="board-stat"><span className="num">{data?.participantCount ?? 0}</span><span className="label">Stars Scored</span></div>
          <div className="board-stat"><span className="num">{skillsWithData}</span><span className="label">Skills With Data</span></div>
          <div className="board-stat" title="Star-and-skill levels this month — derived from weekly scores, or confirmed in a star's tracker"><span className="num">{totalLevels}</span><span className="label">Levels Recorded</span></div>
          <div className="board-stat"><span className="num">{data?.confirmedCount ?? 0}</span><span className="label">Confirmed By Teachers</span></div>
        </div>

        {/* legend */}
        <div style={{ display: "flex", gap: 14, margin: "var(--space-3) 0", flexWrap: "wrap" }}>
          {(["Novice", "Intermediate", "Expert"] as const).map((k) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--fs-meta)", color: "var(--fg-secondary)" }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: LEVEL[k].color }} />{LEVEL[k].label}
            </span>
          ))}
        </div>

        {error ? (
          <div role="alert" style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>Couldn&apos;t load the roll-up: {describeApiError(error, "check your connection and try again.")}</div>
        ) : loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading…</div>
        ) : totalLevels === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
            No weekly scores for {data?.programName ?? "any program"} this month yet. Enter scores on the Weekly Data page and the cohort appears here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            {tracks.map((t) => (
              <section key={t.track ?? "all"} aria-label={showTrackHeadings ? `${trackLabel(t.track)} programs` : undefined} style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
                {showTrackHeadings && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, borderBottom: "0.5px solid var(--border)", paddingBottom: "var(--space-2)" }}>
                    <h2 style={{ fontSize: "var(--fs-h2)", fontWeight: "var(--w-medium)", margin: 0 }}>{trackLabel(t.track)}</h2>
                    <span style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>
                      {t.areas.length} objective area{t.areas.length === 1 ? "" : "s"} · {t.levels} level{t.levels === 1 ? "" : "s"} recorded
                    </span>
                  </div>
                )}
                {showTrackHeadings && t.levels === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>No weekly scores for {trackLabel(t.track)} programs this month yet.</div>
                ) : t.areas.map((area) => (
                  <div key={area.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-2)" }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: area.color }} />
                      <h3 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)", margin: 0 }}>{area.name}</h3>
                    </div>
                    <div style={{ overflowX: "auto", border: "0.5px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface)" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                        <thead>
                          <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
                            {["Skill", "Distribution", "Nov", "Int", "Exp", "Scored", "Most common"].map((h, i) => (
                              <th key={h} style={{ textAlign: i > 1 && i < 6 ? "center" : "left", padding: "8px 12px", fontSize: "var(--fs-label)", textTransform: "uppercase", letterSpacing: "var(--ls-label)", color: "var(--fg-tertiary)", fontWeight: "var(--w-regular)", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {area.rows.map((r) => (
                            <Fragment key={r.subSkillId}>
                            <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
                              <td style={{ padding: "8px 12px", fontSize: "var(--fs-body)", whiteSpace: "nowrap" }}>{r.subSkillName}</td>
                              <td style={{ padding: "8px 12px", minWidth: 160 }}><DistributionBar row={r} /></td>
                              {(["Novice", "Intermediate", "Expert"] as const).map((lvl) => (
                                <CountCell
                                  key={lvl}
                                  n={lvl === "Novice" ? r.noviceCount : lvl === "Intermediate" ? r.intermediateCount : r.expertCount}
                                  level={lvl}
                                  subSkillId={r.subSkillId}
                                  isOpen={openCell?.subSkillId === r.subSkillId && openCell?.level === lvl}
                                  onToggle={toggleCell}
                                />
                              ))}
                              <td style={{ padding: "8px 12px", textAlign: "center", fontVariantNumeric: "tabular-nums", color: "var(--fg-secondary)" }}>{r.scoredCount}</td>
                              <td style={{ padding: "8px 12px" }}><LevelBadge level={r.mostCommonLevel} /></td>
                            </tr>
                            {openCell?.subSkillId === r.subSkillId && (
                              <tr style={{ borderBottom: "0.5px solid var(--border)", background: "var(--bg-tertiary)" }}>
                                <td colSpan={7} style={{ padding: "10px 12px" }}>
                                  <div style={{ fontSize: "var(--fs-label)", textTransform: "uppercase", letterSpacing: "var(--ls-label)", color: "var(--fg-tertiary)", marginBottom: 6 }}>
                                    {r.subSkillName} · {openCell.level}
                                  </div>
                                  {cellLoading ? (
                                    <span style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>Loading…</span>
                                  ) : cellError ? (
                                    <span role="alert" style={{ fontSize: 13, color: "var(--danger)" }}>{cellError}</span>
                                  ) : !cellStars || cellStars.length === 0 ? (
                                    <span style={{ fontSize: 13, color: "var(--fg-tertiary)" }}>No stars to show.</span>
                                  ) : (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                      {cellStars.map((st) => (
                                        <span key={st.participantId} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px 3px 3px", borderRadius: "var(--r-pill)", border: "0.5px solid var(--border)", background: "var(--surface)", fontSize: 13 }}>
                                          <span className="ss-avatar teacher sm">{st.initials}</span>
                                          {st.fullName}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
