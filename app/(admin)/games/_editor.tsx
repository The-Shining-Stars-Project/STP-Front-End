"use client";

import { useState } from "react";
import { X, Check, Star } from "lucide-react";
import { gamesApi } from "@/lib/api/games";
import type {
  ObjectiveAreaDto,
  ProgramSummaryDto,
  GameDetailDto,
  GameSource,
  GameCategory,
  CreateGameDto,
} from "@/lib/types/api";

type Tier = "Novice" | "Intermediate" | "Expert";
const TIERS: Tier[] = ["Novice", "Intermediate", "Expert"];

const CATEGORIES: { value: GameCategory; label: string }[] = [
  { value: "Warmup", label: "Warm-ups" },
  { value: "Circle", label: "Circle" },
  { value: "Movement", label: "Movement" },
  { value: "Name", label: "Name" },
  { value: "Icebreaker", label: "Icebreaker" },
  { value: "Theater", label: "Theater" },
  { value: "Reset", label: "Reset" },
  { value: "SuggestedAddition", label: "Suggested addition" },
];

function parseTiers(t: string | undefined): Set<Tier> {
  if (!t || t === "None") return new Set();
  if (t === "All") return new Set(TIERS);
  return new Set(t.split(",").map((s) => s.trim()) as Tier[]);
}
function tiersToString(s: Set<Tier>): string {
  const sel = TIERS.filter((t) => s.has(t));
  return sel.length === 3 ? "All" : sel.join(", ");
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
  padding: "8px 12px", fontSize: 13, color: "var(--fg)", background: "var(--surface)", outline: "none",
};

export default function GameEditorModal({
  areas,
  programs,
  game,
  onClose,
  onSaved,
}: {
  areas: ObjectiveAreaDto[];
  programs: ProgramSummaryDto[];
  game: GameDetailDto | null; // null = create
  onClose: () => void;
  onSaved: (saved: GameDetailDto) => void;
}) {
  const editing = game !== null;

  const [name, setName] = useState(game?.name ?? "");
  const [source, setSource] = useState<GameSource>(game?.source ?? "TSSP");
  const [category, setCategory] = useState<GameCategory>(game?.category ?? "Theater");
  const [categoryLabel, setCategoryLabel] = useState(game?.categoryLabel ?? "");
  const [tiers, setTiers] = useState<Set<Tier>>(parseTiers(game?.tiers));
  const [areaId, setAreaId] = useState<string>(game?.primaryObjectiveAreaId ?? "");
  const [subIds, setSubIds] = useState<string[]>(
    game ? [...game.subGoals].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.subSkillId) : []
  );
  const [primaryId, setPrimaryId] = useState<string | null>(
    game?.subGoals.find((s) => s.isPrimary)?.subSkillId ?? null
  );
  const [description, setDescription] = useState(game?.description ?? "");
  const [bestFor, setBestFor] = useState(game?.bestForVariations ?? "");
  const [whenToUse, setWhenToUse] = useState(game?.whenToUse ?? "");
  const [location, setLocation] = useState(game?.location ?? "");
  const [programId, setProgramId] = useState<string>(game?.programId ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subById = new Map(areas.flatMap((a) => a.subSkills.map((s) => [s.id, { name: s.name, color: a.colorHex }] as const)));

  function toggleTier(t: Tier) {
    setTiers((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });
  }
  function toggleSub(id: string) {
    setSubIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        if (primaryId === id) setPrimaryId(next[0] ?? null);
        return next;
      }
      return [...prev, id];
    });
  }

  const canSave = name.trim().length > 0 && areaId !== "" && tiers.size > 0 && subIds.length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    const primary = primaryId && subIds.includes(primaryId) ? primaryId : subIds[0];
    const dto: CreateGameDto = {
      name: name.trim(),
      source,
      category,
      categoryLabel: categoryLabel.trim() || null,
      tiers: tiersToString(tiers),
      primaryObjectiveAreaId: areaId,
      description: description.trim() || null,
      bestForVariations: bestFor.trim() || null,
      whenToUse: whenToUse.trim() || null,
      location: location.trim() || null,
      programId: programId || null,
      subGoals: subIds.map((id) => ({ subSkillId: id, isPrimary: id === primary })),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = editing ? await gamesApi.update(game!.id, dto) : await gamesApi.create(dto);
      onSaved(saved);
      onClose();
    } catch {
      setError("Couldn't save the activity. Check the API and try again.");
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
    >
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(560px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "92vh" }}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <h3 style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--w-medium)", margin: 0 }}>{editing ? "Edit activity" : "Add activity"}</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* body */}
        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          <Field label="Name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zip Zap Zop (Hard)" style={inputStyle} autoFocus />
          </Field>

          <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
            <Field label="Source">
              <div style={{ display: "flex", gap: 6 }}>
                {(["TSSP", "Suggested"] as GameSource[]).map((s) => (
                  <button key={s} type="button" className={`ss-chip${source === s ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setSource(s)}>{s}</button>
                ))}
              </div>
            </Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value as GameCategory)} style={{ ...inputStyle, width: "auto" }}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Category label" hint="Optional finer label, e.g. “Vocal Warmup”">
            <input value={categoryLabel} onChange={(e) => setCategoryLabel(e.target.value)} placeholder="Optional" style={inputStyle} />
          </Field>

          <Field label="Tiers" required>
            <div style={{ display: "flex", gap: 6 }}>
              {TIERS.map((t) => (
                <button key={t} type="button" className={`ss-chip${tiers.has(t) ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => toggleTier(t)}>{t}</button>
              ))}
            </div>
          </Field>

          <Field label="Primary objective area" required>
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)} style={inputStyle}>
              <option value="">Select an area…</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>

          <Field label="Sub-goals" required hint="Pick the skills this game develops, then star the primary one.">
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {areas.filter((a) => a.subSkills.length > 0).map((a) => (
                <div key={a.id}>
                  <div style={{ fontSize: "var(--fs-label)", letterSpacing: "var(--ls-label)", textTransform: "uppercase", color: `color-mix(in srgb, ${a.colorHex} 55%, var(--fg))`, marginBottom: 4 }}>{a.name}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {a.subSkills.map((s) => (
                      <button key={s.id} type="button" onClick={() => toggleSub(s.id)}
                        style={{
                          padding: "4px 9px", borderRadius: "var(--r-pill)", cursor: "pointer", fontSize: 12,
                          border: `0.5px solid ${subIds.includes(s.id) ? a.colorHex : "var(--border)"}`,
                          background: subIds.includes(s.id) ? `color-mix(in srgb, ${a.colorHex} 14%, var(--surface))` : "var(--surface)",
                          color: subIds.includes(s.id) ? `color-mix(in srgb, ${a.colorHex} 55%, var(--fg))` : "var(--fg-secondary)",
                        }}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {subIds.length > 0 && (
              <div style={{ marginTop: "var(--space-2)", padding: "var(--space-2)", background: "var(--bg-tertiary)", borderRadius: "var(--r-md)" }}>
                <div style={{ fontSize: "var(--fs-meta)", color: "var(--fg-tertiary)", marginBottom: 4 }}>Selected — star the primary:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {subIds.map((id) => {
                    const meta = subById.get(id);
                    const isPrimary = (primaryId ?? subIds[0]) === id;
                    return (
                      <button key={id} type="button" onClick={() => setPrimaryId(id)}
                        style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: "3px 0", textAlign: "left" }}>
                        <Star style={{ width: 13, height: 13, color: isPrimary ? "var(--warning)" : "var(--fg-tertiary)", fill: isPrimary ? "var(--warning)" : "none" }} />
                        <span style={{ fontSize: "var(--fs-body)", color: "var(--fg)" }}>{meta?.name ?? "—"}</span>
                        {isPrimary && <span className="ss-chip" style={{ fontSize: 10 }}>Primary</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Field>

          <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
            <Field label="Program" hint="Optional — leave unset if usable by any program">
              <select value={programId} onChange={(e) => setProgramId(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                <option value="">Any program</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Location" hint="Where it's typically run">
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Main studio, Manteca" style={inputStyle} />
            </Field>
          </div>

          <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} /></Field>
          <Field label="Best for / variations"><textarea value={bestFor} onChange={(e) => setBestFor(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} /></Field>
          <Field label="When to use"><input value={whenToUse} onChange={(e) => setWhenToUse(e.target.value)} style={inputStyle} /></Field>

          {error && <div style={{ fontSize: "var(--fs-meta)", color: "var(--danger-text)" }}>{error}</div>}
        </div>

        {/* footer */}
        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={handleSave} disabled={!canSave}>
            <Check className="ss-btn-icon" />{saving ? "Saving…" : editing ? "Save changes" : "Add activity"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="ss-label" style={{ marginBottom: 6 }}>
        {label}{required && <span style={{ color: "var(--danger)", fontWeight: 400 }}> *</span>}
        {hint && <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6 }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
