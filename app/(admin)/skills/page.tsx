"use client";

import { useEffect, useState } from "react";
import { Target, Layers, Sparkles } from "lucide-react";
import { taxonomyApi } from "@/lib/api/taxonomy";
import type { ObjectiveAreaDto, ProgressLevel } from "@/lib/types/api";

// The five measured sections carry sub-skills; Multi-Area (area 6) is a Games
// Library tag only, so it has none.
function sectionLabel(area: ObjectiveAreaDto): string | null {
  const n = area.subSkills[0]?.sectionNumber;
  return n ? `Section ${n}` : null;
}

function plLabel(pl: ProgressLevel): string {
  return pl === "NotApplicable" ? "N/A" : pl;
}

// Tints derived from each area's own colour so the six areas keep their
// colour language without hard-coding six sets of tokens. Flat — no shadows.
function areaTint(hex: string) {
  return {
    accent: hex,
    fill: `color-mix(in srgb, ${hex} 9%, var(--surface))`,
    softFill: `color-mix(in srgb, ${hex} 14%, var(--surface))`,
    border: `color-mix(in srgb, ${hex} 32%, var(--border))`,
    text: `color-mix(in srgb, ${hex} 55%, var(--fg))`,
  };
}

export default function SkillsFrameworkPage() {
  const [areas, setAreas] = useState<ObjectiveAreaDto[]>([]);
  const [levels, setLevels] = useState<ProgressLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    taxonomyApi
      .getLists()
      .then((lists) => {
        setAreas(lists.objectiveAreas);
        setLevels(lists.progressLevels);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Two frameworks share one taxonomy: the part-time sections (MJC / Manteca PT) and the
  // Pathways sections. They are rendered as separate groups, and every Pathways card carries
  // a "Pathways:" prefix so the two "Section 1"s can't be confused (client request).
  const partTimeAreas = areas.filter((a) => a.track !== "Pathways");
  const pathwaysAreas = areas.filter((a) => a.track === "Pathways");

  const totalSubSkills = areas.reduce((n, a) => n + a.subSkills.length, 0);
  const sectionCount = new Set(
    areas.flatMap((a) => a.subSkills.map((s) => s.sectionNumber))
  ).size;

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles">
          <h1>Skills Framework</h1>
        </div>
        <div className="right" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="ss-label" style={{ color: "var(--fg-tertiary)" }}>Progress levels</span>
          {levels.map((pl) => (
            <span key={pl} className="ss-chip">{plLabel(pl)}</span>
          ))}
        </div>
      </div>

      <div className="adm-content">
        <div className="info-note" style={{ marginBottom: "var(--space-2)" }}>
          <Sparkles />
          <span>
            The shared skill taxonomy behind every program: six colour-coded objective
            areas and the universal sub-skills beneath them. The Games Library tags
            games to these skills, the weekly tracker measures against them, and the
            cohort roll-up aggregates by them. Reference data — maintained centrally.
          </span>
        </div>

        <div className="board-stats">
          <div className="board-stat"><span className="num">{areas.length}</span><span className="label">Objective Areas</span></div>
          <div className="board-stat"><span className="num">{totalSubSkills}</span><span className="label">Sub-skills</span></div>
          <div className="board-stat"><span className="num">{sectionCount}</span><span className="label">Measured Sections</span></div>
          <div className="board-stat"><span className="num">{levels.length}</span><span className="label">Progress Levels</span></div>
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
            Loading skills framework…
          </div>
        ) : error ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
            Couldn&apos;t load the skills framework. Check that the API is running and try again.
          </div>
        ) : (
          <>
            <AreaGroup
              title="Part-time framework"
              subtitle="MJC and Manteca PT — the five measured sections plus the Multi-Area tag"
              list={partTimeAreas}
            />
            {pathwaysAreas.length > 0 && (
              <AreaGroup
                title="Pathways framework"
                subtitle="Full-time Pathways sections and pillars — each carries an annual goal and 6-month benchmark"
                list={pathwaysAreas}
                prefix="Pathways:"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AreaGroup({ title, subtitle, list, prefix }: {
  title: string;
  subtitle: string;
  list: ObjectiveAreaDto[];
  prefix?: string;
}) {
  return (
    <section style={{ marginBottom: "var(--space-6)" }}>
      <div style={{ marginBottom: "var(--space-3)" }}>
        <h2 style={{ fontSize: "var(--fs-h2)", fontWeight: "var(--w-medium)", margin: 0, lineHeight: "var(--lh-tight)" }}>{title}</h2>
        <div style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)", marginTop: 2 }}>{subtitle}</div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {list.map((area) => {
          const t = areaTint(area.colorHex);
          const sec = sectionLabel(area);
          return (
            <div
              key={area.id}
              style={{
                border: `var(--bw) solid ${t.border}`,
                borderRadius: "var(--r-lg)",
                background: "var(--surface)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* header — carries the area's colour as a top band */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-3) var(--space-4)",
                  background: t.fill,
                  borderBottom: `var(--bw) solid ${t.border}`,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 12, height: 12, borderRadius: "var(--r-circle)",
                    background: t.accent, flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)", color: "var(--fg)", lineHeight: "var(--lh-tight)" }}>
                    {prefix && <span style={{ color: t.text }}>{prefix} </span>}
                    {area.name}
                  </div>
                  {sec && (
                    <div style={{ fontSize: "var(--fs-label)", letterSpacing: "var(--ls-label)", textTransform: "uppercase", color: t.text, marginTop: 2 }}>
                      {sec}
                    </div>
                  )}
                </div>
                {area.subSkills.length > 0 && (
                  <span
                    title={`${area.subSkills.length} sub-skills`}
                    style={{
                      fontSize: "var(--fs-meta)", color: t.text,
                      fontVariantNumeric: "tabular-nums", flexShrink: 0,
                    }}
                  >
                    {area.subSkills.length}
                  </span>
                )}
              </div>

              {/* body — sub-skills, or the Multi-Area note */}
              <div style={{ padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                {area.subSkills.length === 0 ? (
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start", color: "var(--fg-tertiary)", fontSize: "var(--fs-meta)", lineHeight: "var(--lh-body)" }}>
                    <Layers style={{ width: 14, height: 14, flexShrink: 0, marginTop: 3 }} />
                    <span>A Games Library tag for cross-cutting activities — measured skills live in the five sections.</span>
                  </div>
                ) : (
                  area.subSkills.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: "flex", alignItems: "center", gap: "var(--space-2)",
                        padding: "6px 0", fontSize: "var(--fs-body)", color: "var(--fg)",
                      }}
                    >
                      <Target style={{ width: 13, height: 13, color: t.accent, flexShrink: 0 }} />
                      <span>{s.name}</span>
                      {!s.isActive && (
                        <span className="ss-chip" style={{ marginLeft: "auto" }}>Retired</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
