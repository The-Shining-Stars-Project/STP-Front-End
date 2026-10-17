"use client";

import { Fragment, useEffect, useState } from "react";
import { Lightbulb, Plus, ArrowUpRight, Check, Wand2, AlertTriangle } from "lucide-react";
import { gameBacklogApi } from "@/lib/api/gameBacklog";
import { describeApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { GameIdeaDto, AgeModificationDto, GameCategory } from "@/lib/types/api";

const CATEGORIES: GameCategory[] = ["Warmup", "Circle", "Movement", "Name", "Icebreaker", "Theater", "Reset", "SuggestedAddition"];

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", border: "0.5px solid var(--border-hover)",
  borderRadius: "var(--r-md)", padding: "7px 10px", fontSize: 13, color: "var(--fg)", background: "var(--surface)", outline: "none",
};

/** Inline error banner; the text always says what failed, so colour is never the only signal. */
function InlineError({ message }: { message: string }) {
  return (
    <div className="ss-alert is-danger" role="alert" style={{ padding: "8px 12px" }}>
      <AlertTriangle />
      <span className="ss-alert-text" style={{ fontSize: 13 }}>{message}</span>
    </div>
  );
}

export default function ToDevelopPage() {
  // Anyone can log ideas and modifications; promoting into Curriculum Resources is
  // ManagementWrite, so Promote is hidden from everyone else instead of failing with a 403.
  const { canManage } = useAuth();
  const [ideas, setIdeas] = useState<GameIdeaDto[]>([]);
  const [mods, setMods] = useState<AgeModificationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [ideaForm, setIdeaForm] = useState<{ open: boolean; name: string; category: GameCategory | ""; source: string; notes: string; teacher: boolean }>(
    { open: false, name: "", category: "", source: "", notes: "", teacher: false });
  const [modForm, setModForm] = useState<{ open: boolean; gameName: string; ageLevel: string; modification: string; teacher: boolean }>(
    { open: false, gameName: "", ageLevel: "", modification: "", teacher: false });
  const [promoting, setPromoting] = useState<string | null>(null);
  const [savingIdea, setSavingIdea] = useState(false);
  const [savingMod, setSavingMod] = useState(false);
  const [ideaError, setIdeaError] = useState<string | null>(null);
  const [modError, setModError] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    Promise.all([gameBacklogApi.getIdeas(), gameBacklogApi.getAgeMods()])
      .then(([i, m]) => { setIdeas(i); setMods(m); setLoadError(null); })
      .catch((e: unknown) => setLoadError(describeApiError(e, "Check your connection and try again.")))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  function retryLoad() {
    setLoading(true);
    setLoadError(null);
    setReloadKey((k) => k + 1);
  }

  // On failure the form stays open with everything typed, and says why (Oct 2026: a failed
  // save used to close the form and lose the text).
  async function addIdea() {
    if (!ideaForm.name.trim() || savingIdea) return;
    setSavingIdea(true);
    setIdeaError(null);
    try {
      const created = await gameBacklogApi.createIdea({
        name: ideaForm.name.trim(),
        targetCategory: ideaForm.category || null,
        sourceInspiration: ideaForm.source.trim() || null,
        statusNotes: ideaForm.notes.trim() || null,
        teacherSuggested: ideaForm.teacher,
      });
      setIdeas((p) => [created, ...p]);
      setIdeaForm({ open: false, name: "", category: "", source: "", notes: "", teacher: false });
    } catch (e) {
      setIdeaError(describeApiError(e, "Couldn't add the idea. Your text is still here; try again."));
    } finally {
      setSavingIdea(false);
    }
  }

  async function addMod() {
    if (!modForm.gameName.trim() || !modForm.modification.trim() || savingMod) return;
    setSavingMod(true);
    setModError(null);
    try {
      const created = await gameBacklogApi.createAgeMod({
        gameName: modForm.gameName.trim(),
        groupAgeLevel: modForm.ageLevel.trim(),
        modification: modForm.modification.trim(),
        teacherSuggested: modForm.teacher,
      });
      setMods((p) => [created, ...p]);
      setModForm({ open: false, gameName: "", ageLevel: "", modification: "", teacher: false });
    } catch (e) {
      setModError(describeApiError(e, "Couldn't log the modification. Your text is still here; try again."));
    } finally {
      setSavingMod(false);
    }
  }

  async function promote(id: string) {
    setPromoting(id);
    setPromoteError(null);
    try {
      const updated = await gameBacklogApi.promote(id);
      setIdeas((p) => p.map((i) => (i.id === id ? updated : i)));
    } catch (e) {
      setPromoteError({ id, message: describeApiError(e, "Couldn't promote this idea. Try again.") });
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles"><h1>To Develop</h1></div>
      </div>

      <div className="adm-content" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        <div className="info-note">
          <Lightbulb />
          {canManage ? (
            <span>Capture game ideas and modifications as they come up in class. Refine an idea, then <strong>promote</strong> it into Curriculum Resources as a draft to finish tagging.</span>
          ) : (
            <span>Capture game ideas and modifications as they come up in class. Coordinators review ideas and <strong>promote</strong> the ready ones into Curriculum Resources.</span>
          )}
        </div>

        {loadError && (
          <div className="ss-alert is-danger" role="alert">
            <AlertTriangle />
            <span className="ss-alert-text">Couldn&apos;t load ideas and modifications. {loadError}</span>
            <button type="button" className="ss-btn" onClick={retryLoad}>Retry</button>
          </div>
        )}

        {/* Game ideas */}
        <div className="widget">
          <div className="widget-head" style={{ display: "flex", alignItems: "center" }}>
            <Lightbulb className="ico" style={{ color: "var(--primary)" }} />
            <h3>Game ideas</h3>
            <button type="button" className="ss-btn" style={{ marginLeft: "auto" }} onClick={() => { setIdeaForm((f) => ({ ...f, open: !f.open })); setIdeaError(null); }}>
              <Plus className="ss-btn-icon" />Add idea
            </button>
          </div>
          <div className="widget-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {ideaForm.open && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", padding: "var(--space-3)", background: "var(--bg-tertiary)", borderRadius: "var(--r-md)" }}>
                <input placeholder="Game name" value={ideaForm.name} onChange={(e) => setIdeaForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} autoFocus />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select value={ideaForm.category} onChange={(e) => setIdeaForm((f) => ({ ...f, category: e.target.value as GameCategory }))} style={{ ...inputStyle, width: "auto" }}>
                    <option value="">Target category…</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input placeholder="Source / inspiration" value={ideaForm.source} onChange={(e) => setIdeaForm((f) => ({ ...f, source: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
                </div>
                <input placeholder="Status / notes" value={ideaForm.notes} onChange={(e) => setIdeaForm((f) => ({ ...f, notes: e.target.value }))} style={inputStyle} />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-secondary)" }}>
                  <input type="checkbox" checked={ideaForm.teacher} onChange={(e) => setIdeaForm((f) => ({ ...f, teacher: e.target.checked }))} style={{ accentColor: "var(--primary)" }} />
                  Teacher-suggested
                </label>
                {ideaError && <InlineError message={ideaError} />}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="ss-btn" onClick={() => { setIdeaForm((f) => ({ ...f, open: false })); setIdeaError(null); }} disabled={savingIdea}>Cancel</button>
                  <button type="button" className="ss-btn ss-btn-primary" onClick={addIdea} disabled={!ideaForm.name.trim() || savingIdea}><Check className="ss-btn-icon" />{savingIdea ? "Adding…" : "Add"}</button>
                </div>
              </div>
            )}
            {loading ? (
              <div style={{ padding: "12px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading…</div>
            ) : ideas.length === 0 ? (
              loadError ? null : <div style={{ padding: "12px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>No ideas yet — capture the first one.</div>
            ) : ideas.map((i) => (
              <Fragment key={i.id}>
              <div className="list-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "0.5px solid var(--border)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {i.name}
                    {i.targetCategory && <span className="ss-chip">{i.targetCategory}</span>}
                    {i.teacherSuggested && <span className="ss-chip">Teacher idea</span>}
                  </div>
                  {(i.statusNotes || i.sourceInspiration) && (
                    <div style={{ fontSize: 12, color: "var(--fg-tertiary)", marginTop: 2 }}>
                      {i.statusNotes}{i.statusNotes && i.sourceInspiration ? " · " : ""}{i.sourceInspiration}
                    </div>
                  )}
                </div>
                {i.promotedGameId ? (
                  <span className="ss-badge is-active" style={{ flexShrink: 0 }}><Check />In library</span>
                ) : canManage ? (
                  <button type="button" className="ss-btn" onClick={() => promote(i.id)} disabled={promoting === i.id} style={{ flexShrink: 0 }}>
                    <ArrowUpRight className="ss-btn-icon" />{promoting === i.id ? "Promoting…" : "Promote"}
                  </button>
                ) : null}
              </div>
              {promoteError?.id === i.id && <InlineError message={promoteError.message} />}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Modifications (renamed from "Age modifications", client Oct 2026; the entity, API
            and agemod.* audit names stay as they are). */}
        <div className="widget">
          <div className="widget-head" style={{ display: "flex", alignItems: "center" }}>
            <Wand2 className="ico" style={{ color: "var(--primary)" }} />
            <h3>Modifications</h3>
            <button type="button" className="ss-btn" style={{ marginLeft: "auto" }} onClick={() => { setModForm((f) => ({ ...f, open: !f.open })); setModError(null); }}>
              <Plus className="ss-btn-icon" />Log modification
            </button>
          </div>
          <div className="widget-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {modForm.open && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", padding: "var(--space-3)", background: "var(--bg-tertiary)", borderRadius: "var(--r-md)" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input placeholder="Game name" value={modForm.gameName} onChange={(e) => setModForm((f) => ({ ...f, gameName: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 160 }} autoFocus />
                  <input placeholder="Group / age level" value={modForm.ageLevel} onChange={(e) => setModForm((f) => ({ ...f, ageLevel: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
                </div>
                <textarea placeholder="What was modified?" rows={2} value={modForm.modification} onChange={(e) => setModForm((f) => ({ ...f, modification: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-secondary)" }}>
                  <input type="checkbox" checked={modForm.teacher} onChange={(e) => setModForm((f) => ({ ...f, teacher: e.target.checked }))} style={{ accentColor: "var(--primary)" }} />
                  Teacher-suggested
                </label>
                {modError && <InlineError message={modError} />}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="ss-btn" onClick={() => { setModForm((f) => ({ ...f, open: false })); setModError(null); }} disabled={savingMod}>Cancel</button>
                  <button type="button" className="ss-btn ss-btn-primary" onClick={addMod} disabled={!modForm.gameName.trim() || !modForm.modification.trim() || savingMod}><Check className="ss-btn-icon" />{savingMod ? "Logging…" : "Log"}</button>
                </div>
              </div>
            )}
            {loading ? (
              <div style={{ padding: "12px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading…</div>
            ) : mods.length === 0 ? (
              loadError ? null : <div style={{ padding: "12px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>No modifications logged yet.</div>
            ) : mods.map((m) => (
              <div key={m.id} style={{ padding: "8px 0", borderBottom: "0.5px solid var(--border)" }}>
                <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {m.gameName}
                  {m.groupAgeLevel && <span className="ss-chip">{m.groupAgeLevel}</span>}
                  {m.teacherSuggested && <span className="ss-chip">Teacher</span>}
                </div>
                <div style={{ fontSize: 13, color: "var(--fg-secondary)", marginTop: 2, lineHeight: "var(--lh-body)" }}>{m.modification}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
