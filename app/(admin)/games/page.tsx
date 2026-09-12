"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, Sparkles, Target, Plus, Pencil, MapPin } from "lucide-react";
import { gamesApi } from "@/lib/api/games";
import { useObjectiveAreas, usePrograms } from "@/lib/api/hooks";
import GameEditorModal from "./_editor";
import type {
  GameSummaryDto,
  GameDetailDto,
  ObjectiveAreaDto,
  ProgramSummaryDto,
  GameCategory,
} from "@/lib/types/api";

type TierChoice = "Novice" | "Intermediate" | "Expert";

const CATEGORIES: { value: GameCategory; label: string }[] = [
  { value: "Warmup", label: "Warm-ups" },
  { value: "Circle", label: "Circle" },
  { value: "Movement", label: "Movement" },
  { value: "Name", label: "Name" },
  { value: "Icebreaker", label: "Icebreaker" },
  { value: "Theater", label: "Theater" },
  { value: "Reset", label: "Reset" },
  { value: "SuggestedAddition", label: "Suggested" },
];

const TIERS: TierChoice[] = ["Novice", "Intermediate", "Expert"];

function tint(hex: string, pct: number) {
  return `color-mix(in srgb, ${hex} ${pct}%, var(--surface))`;
}

function tierList(tiers: string): string[] {
  if (!tiers || tiers === "None") return [];
  if (tiers === "All") return ["Novice", "Intermediate", "Expert"];
  return tiers.split(",").map((t) => t.trim());
}

export default function GamesLibraryPage() {
  // Cached + shared via React Query (#34).
  // Curriculum activities are tagged against the part-time framework only.
  const areas: ObjectiveAreaDto[] = (useObjectiveAreas().data ?? []).filter((a) => a.track === "PartTime");
  const programs: ProgramSummaryDto[] = usePrograms().data ?? [];
  const [games, setGames] = useState<GameSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [areaId, setAreaId] = useState<string | null>(null);
  const [tier, setTier] = useState<TierChoice | null>(null);
  const [category, setCategory] = useState<GameCategory | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [selected, setSelected] = useState<GameSummaryDto | null>(null);
  const [detail, setDetail] = useState<GameDetailDto | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorGame, setEditorGame] = useState<GameDetailDto | null>(null);
  const [reload, setReload] = useState(0);

  // Objective areas power the colour-coded filter chips (and the editor's area/sub-goal pickers).

  // Debounce the free-text search.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(h);
  }, [query]);

  // Re-query whenever a filter changes — exercises the server-side filter.
  useEffect(() => {
    setLoading(true);
    gamesApi
      .list({
        tier: tier ?? undefined,
        objectiveAreaId: areaId ?? undefined,
        category: category ?? undefined,
        q: debouncedQuery || undefined,
        programId: programId ?? undefined,
      })
      .then((g) => { setGames(g); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [areaId, tier, category, programId, debouncedQuery, reload]);

  async function openGame(game: GameSummaryDto) {
    setSelected(game);
    setDetail(null);
    try {
      setDetail(await gamesApi.getById(game.id));
    } catch { /* drawer shows summary only */ }
  }

  function onSaved(saved: GameDetailDto) {
    setReload((r) => r + 1); // refetch with current filters
    if (selected?.id === saved.id) { setSelected(saved); setDetail(saved); }
  }

  const areaById = useMemo(
    () => Object.fromEntries(areas.map((a) => [a.id, a])),
    [areas]
  );
  const activeFilters = [areaId, tier, category, programId, debouncedQuery].filter(Boolean).length;

  function clearFilters() {
    setAreaId(null); setTier(null); setCategory(null); setProgramId(null); setQuery("");
  }

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles">
          <h1>Curriculum Resources</h1>
        </div>
        <div className="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search style={{ width: 14, height: 14, position: "absolute", left: 10, color: "var(--fg-tertiary)" }} />
            <input
              type="text"
              placeholder="Search activities…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
                padding: "8px 12px 8px 30px", fontSize: 13, color: "var(--fg)",
                background: "var(--surface)", outline: "none", width: 220,
              }}
            />
          </div>
          <button className="ss-btn ss-btn-primary" type="button" onClick={() => { setEditorGame(null); setEditorOpen(true); }}>
            <Plus className="ss-btn-icon" />Add activity
          </button>
        </div>
      </div>

      <div className="adm-content">
        {/* Filters */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {/* Objective-area chips */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Objective</span>
            <button
              type="button"
              className={`ss-chip${areaId === null ? " is-active" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => setAreaId(null)}
            >
              All areas
            </button>
            {areas.map((a) => {
              const active = areaId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAreaId(active ? null : a.id)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "5px 11px", borderRadius: "var(--r-pill)", cursor: "pointer",
                    fontSize: 13, userSelect: "none",
                    border: `0.5px solid ${active ? a.colorHex : "var(--border)"}`,
                    background: active ? tint(a.colorHex, 14) : "var(--surface)",
                    color: active ? `color-mix(in srgb, ${a.colorHex} 55%, var(--fg))` : "var(--fg-secondary)",
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: a.colorHex }} />
                  {a.name}
                </button>
              );
            })}
          </div>

          {/* Tier + category row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Tier</span>
            <button type="button" className={`ss-chip${tier === null ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setTier(null)}>All</button>
            {TIERS.map((t) => (
              <button key={t} type="button" className={`ss-chip${tier === t ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setTier(tier === t ? null : t)}>{t}</button>
            ))}
            <span style={{ width: 1, height: 20, background: "var(--border-strong)", margin: "0 6px" }} />
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Category</span>
            <button type="button" className={`ss-chip${category === null ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setCategory(null)}>All</button>
            {CATEGORIES.map((c) => (
              <button key={c.value} type="button" className={`ss-chip${category === c.value ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setCategory(category === c.value ? null : c.value)}>{c.label}</button>
            ))}
            <span style={{ width: 1, height: 20, background: "var(--border-strong)", margin: "0 6px" }} />
            <span className="ss-label" style={{ color: "var(--fg-tertiary)", marginRight: 2 }}>Program</span>
            <button type="button" className={`ss-chip${programId === null ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setProgramId(null)}>All</button>
            {programs.map((p) => (
              <button key={p.id} type="button" className={`ss-chip${programId === p.id ? ` is-active ${p.slug}` : ""}`} style={{ cursor: "pointer" }} onClick={() => setProgramId(programId === p.id ? null : p.id)}>
                <span className={`ss-dot ${p.slug}`} />{p.name}
              </button>
            ))}
            {activeFilters > 0 && (
              <button type="button" onClick={clearFilters} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 4 }}>
                <X style={{ width: 12, height: 12 }} />Clear
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div style={{ margin: "var(--space-3) 0", fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>
          {loading ? "Loading…" : `${games.length} activit${games.length !== 1 ? "ies" : "y"}`}
        </div>

        {error ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
            Couldn&apos;t load activities. Check that the API is running and try again.
          </div>
        ) : !loading && games.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
            No activities match these filters. <button type="button" onClick={clearFilters} style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontSize: 13 }}>Clear filters</button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "var(--space-4)" }}>
            {games.map((g) => {
              const accent = g.primaryObjectiveAreaColorHex || "var(--neutral)";
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => openGame(g)}
                  style={{
                    textAlign: "left", cursor: "pointer", font: "inherit",
                    border: `0.5px solid var(--border)`, borderLeft: `2.5px solid ${accent}`,
                    borderRadius: "var(--r-lg)", background: "var(--surface)",
                    padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)", color: "var(--fg)", lineHeight: "var(--lh-tight)" }}>{g.name}</span>
                    {g.source === "Suggested" && <span className="ss-chip" style={{ flexShrink: 0 }}>Suggested</span>}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--fs-meta)", color: `color-mix(in srgb, ${accent} 55%, var(--fg))` }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent }} />
                      {g.primaryObjectiveAreaName}
                    </span>
                    {g.categoryLabel && <span style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>· {g.categoryLabel}</span>}
                    {g.programName && <span style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>· {g.programName}</span>}
                    {g.location && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>
                        · <MapPin style={{ width: 11, height: 11 }} />{g.location}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {tierList(g.tiers).map((t) => (
                      <span key={t} className="ss-badge" style={{ fontSize: 10 }}>{t}</span>
                    ))}
                  </div>

                  {g.whenToUse && (
                    <div style={{ fontSize: "var(--fs-meta)", color: "var(--fg-secondary)", lineHeight: "var(--lh-body)" }}>{g.whenToUse}</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", justifyContent: "flex-end", zIndex: 200 }}
        >
          <div style={{ background: "var(--surface)", width: "min(460px, 100%)", height: "100%", display: "flex", flexDirection: "column", borderLeft: "0.5px solid var(--border-hover)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", gap: 8 }}>
              <div>
                <h3 style={{ fontSize: "var(--fs-h2)", fontWeight: "var(--w-medium)", margin: "0 0 4px" }}>{selected.name}</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: `color-mix(in srgb, ${selected.primaryObjectiveAreaColorHex} 55%, var(--fg))` }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: selected.primaryObjectiveAreaColorHex }} />
                    {selected.primaryObjectiveAreaName}
                  </span>
                  {selected.categoryLabel && <span>· {selected.categoryLabel}</span>}
                  <span>· {selected.source === "Suggested" ? "Suggested addition" : "TSSP"}</span>
                  {selected.programName && <span>· {selected.programName}</span>}
                  {selected.location && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                      · <MapPin style={{ width: 11, height: 11 }} />{selected.location}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                {detail && (
                  <button type="button" onClick={() => { setEditorGame(detail); setEditorOpen(true); }} title="Edit activity" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, display: "inline-flex" }}>
                    <Pencil style={{ width: 15, height: 15 }} />
                  </button>
                )}
                <button type="button" onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4 }}>
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </div>

            <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {tierList(selected.tiers).map((t) => (
                  <span key={t} className="ss-badge">{t}</span>
                ))}
              </div>

              {detail?.description && (
                <Section label="What it is"><p style={pStyle}>{detail.description}</p></Section>
              )}

              <Section label="Skills targeted">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {selected.subGoals.map((sg) => (
                    <div key={sg.subSkillId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-body)" }}>
                      <Target style={{ width: 13, height: 13, color: sg.objectiveAreaColorHex ?? "var(--neutral)", flexShrink: 0 }} />
                      <span>{sg.subSkillName}</span>
                      {sg.isPrimary && <span className="ss-chip" style={{ fontSize: 10 }}>Primary</span>}
                    </div>
                  ))}
                </div>
              </Section>

              {detail?.bestForVariations && (
                <Section label="Best for / variations"><p style={pStyle}>{detail.bestForVariations}</p></Section>
              )}
              {selected.whenToUse && (
                <Section label="When to use"><p style={pStyle}>{selected.whenToUse}</p></Section>
              )}
              {!detail && (
                <div style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Sparkles style={{ width: 13, height: 13 }} />Loading details…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editorOpen && (
        <GameEditorModal
          areas={areas}
          programs={programs}
          game={editorGame}
          onClose={() => setEditorOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

const pStyle: React.CSSProperties = { margin: 0, fontSize: "var(--fs-body)", color: "var(--fg-secondary)", lineHeight: "var(--lh-body)" };

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="ss-label" style={{ color: "var(--fg-tertiary)" }}>{label}</div>
      {children}
    </div>
  );
}
