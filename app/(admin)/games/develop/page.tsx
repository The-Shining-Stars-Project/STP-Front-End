"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Lightbulb, Plus, ArrowUpRight, ArrowDownLeft, Check, Wand2, AlertTriangle, Link2, Pencil, Trash2 } from "lucide-react";
import { gameBacklogApi } from "@/lib/api/gameBacklog";
import { gamesApi } from "@/lib/api/games";
import { describeApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { GameIdeaDto, AgeModificationDto, GameCategory, GameSummaryDto } from "@/lib/types/api";

/** The Log / Edit modification form. `editingId` is set when editing an existing entry. */
type ModForm = {
  open: boolean;
  editingId: string | null;
  gameName: string;
  ageLevel: string;
  modification: string;
  teacher: boolean;
  /** Library game this modifies, or "" for one that isn't in the library. */
  gameId: string;
};
const CLOSED_MOD_FORM: ModForm = { open: false, editingId: null, gameName: "", ageLevel: "", modification: "", teacher: false, gameId: "" };

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
  const [modForm, setModForm] = useState<ModForm>(CLOSED_MOD_FORM);
  // The library, for the "modifies which activity" picker and the linked-game chips.
  const [games, setGames] = useState<GameSummaryDto[]>([]);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [savingIdea, setSavingIdea] = useState(false);
  const [savingMod, setSavingMod] = useState(false);
  const [deletingMod, setDeletingMod] = useState(false);
  const [confirmDeleteMod, setConfirmDeleteMod] = useState(false);
  const [ideaError, setIdeaError] = useState<string | null>(null);
  const [modError, setModError] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    Promise.all([gameBacklogApi.getIdeas(), gameBacklogApi.getAgeMods(), gamesApi.list()])
      .then(([i, m, g]) => {
        setIdeas(i); setMods(m); setGames(g); setLoadError(null);
        // "+ Log modification" on a game's drawer lands here as ?game=<id> with the form open
        // and that activity picked. Read once the library is here so the chip can show its name.
        const wanted = new URLSearchParams(window.location.search).get("game");
        const game = wanted ? g.find((x) => x.id === wanted) : undefined;
        if (game) setModForm({ ...CLOSED_MOD_FORM, open: true, gameId: game.id, gameName: game.name });
      })
      .catch((e: unknown) => setLoadError(describeApiError(e, "Check your connection and try again.")))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const gameNameById = (id: string | null) => (id ? games.find((g) => g.id === id)?.name ?? null : null);

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

  function closeModForm() { setModForm(CLOSED_MOD_FORM); setModError(null); setConfirmDeleteMod(false); }

  function openEditMod(m: AgeModificationDto) {
    setModForm({ open: true, editingId: m.id, gameName: m.gameName, ageLevel: m.groupAgeLevel, modification: m.modification, teacher: m.teacherSuggested, gameId: m.gameId ?? "" });
    setModError(null);
    setConfirmDeleteMod(false);
  }

  // Picking a library game fills the name; clearing it keeps whatever was typed.
  function pickGame(id: string) {
    const game = games.find((g) => g.id === id);
    setModForm((f) => ({ ...f, gameId: id, gameName: game ? game.name : f.gameName }));
  }

  async function saveMod() {
    if (!modForm.gameName.trim() || !modForm.modification.trim() || savingMod) return;
    setSavingMod(true);
    setModError(null);
    try {
      if (modForm.editingId) {
        const updated = await gameBacklogApi.updateAgeMod(modForm.editingId, {
          gameName: modForm.gameName.trim(),
          groupAgeLevel: modForm.ageLevel.trim(),
          modification: modForm.modification.trim(),
          gameId: modForm.gameId || null,
        });
        setMods((p) => p.map((m) => (m.id === updated.id ? updated : m)));
      } else {
        const created = await gameBacklogApi.createAgeMod({
          gameName: modForm.gameName.trim(),
          groupAgeLevel: modForm.ageLevel.trim(),
          modification: modForm.modification.trim(),
          teacherSuggested: modForm.teacher,
          gameId: modForm.gameId || null,
        });
        setMods((p) => [created, ...p]);
      }
      closeModForm();
    } catch (e) {
      setModError(describeApiError(e, modForm.editingId ? "Couldn't save the modification. Your text is still here; try again." : "Couldn't log the modification. Your text is still here; try again."));
    } finally {
      setSavingMod(false);
    }
  }

  async function deleteMod() {
    if (!modForm.editingId || deletingMod) return;
    setDeletingMod(true);
    setModError(null);
    try {
      await gameBacklogApi.deleteAgeMod(modForm.editingId);
      setMods((p) => p.filter((m) => m.id !== modForm.editingId));
      closeModForm();
    } catch (e) {
      setModError(describeApiError(e, "Couldn't delete the modification. Try again."));
    } finally {
      setDeletingMod(false);
    }
  }

  async function promote(id: string) {
    setPromoting(id);
    setPromoteError(null);
    try {
      const updated = await gameBacklogApi.promote(id);
      setIdeas((p) => p.map((i) => (i.id === id ? updated : i)));
      // The new draft game should be pickable for modifications straight away.
      gamesApi.list().then(setGames).catch(() => { /* chips just won't name it until reload */ });
    } catch (e) {
      setPromoteError({ id, message: describeApiError(e, "Couldn't promote this idea. Try again.") });
    } finally {
      setPromoting(null);
    }
  }

  // Reverses a promote: the draft game is deleted from the library (client, Oct 2026).
  async function demote(id: string) {
    const idea = ideas.find((i) => i.id === id);
    if (!idea || !window.confirm(`Move "${idea.name}" back to To Develop? The activity it created is removed from Curriculum Resources; any modifications logged against it are kept.`)) return;
    setPromoting(id);
    setPromoteError(null);
    try {
      const updated = await gameBacklogApi.demote(id);
      setIdeas((p) => p.map((i) => (i.id === id ? updated : i)));
      setGames((g) => g.filter((x) => x.id !== idea.promotedGameId));
      setMods((p) => p.map((m) => (m.gameId === idea.promotedGameId ? { ...m, gameId: null } : m)));
    } catch (e) {
      setPromoteError({ id, message: describeApiError(e, "Couldn't move this idea back. Try again.") });
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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span className="ss-badge is-active"><Check />In library</span>
                    {canManage && (
                      <button type="button" className="ss-btn" onClick={() => demote(i.id)} disabled={promoting === i.id} title="Remove the activity from Curriculum Resources and bring the idea back here">
                        <ArrowDownLeft className="ss-btn-icon" />{promoting === i.id ? "Moving…" : "Move back"}
                      </button>
                    )}
                  </span>
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
            <button type="button" className="ss-btn" style={{ marginLeft: "auto" }} onClick={() => (modForm.open && !modForm.editingId ? closeModForm() : (closeModForm(), setModForm({ ...CLOSED_MOD_FORM, open: true })))}>
              <Plus className="ss-btn-icon" />Log modification
            </button>
          </div>
          <div className="widget-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {modForm.open && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", padding: "var(--space-3)", background: "var(--bg-tertiary)", borderRadius: "var(--r-md)" }}>
                {modForm.editingId && <div className="ss-label" style={{ color: "var(--fg-tertiary)" }}>Editing modification</div>}
                {/* Attach to a library activity (Oct 2026). Optional: a game that isn't in the library yet is still a free-text name. */}
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--fg-secondary)" }}>
                  Activity in Curriculum Resources <span style={{ color: "var(--fg-tertiary)" }}>(optional — picking one fills the name)</span>
                  <select value={modForm.gameId} onChange={(e) => pickGame(e.target.value)} style={inputStyle}>
                    <option value="">Not in the library / other</option>
                    {[...games].sort((a, b) => a.name.localeCompare(b.name)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input placeholder="Game name" value={modForm.gameName} onChange={(e) => setModForm((f) => ({ ...f, gameName: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 160 }} autoFocus={!modForm.gameId} />
                  <input placeholder="Group / age level" value={modForm.ageLevel} onChange={(e) => setModForm((f) => ({ ...f, ageLevel: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
                </div>
                <textarea placeholder="What was modified?" rows={2} value={modForm.modification} onChange={(e) => setModForm((f) => ({ ...f, modification: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} autoFocus={!!modForm.gameId} />
                {!modForm.editingId && (
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-secondary)" }}>
                    <input type="checkbox" checked={modForm.teacher} onChange={(e) => setModForm((f) => ({ ...f, teacher: e.target.checked }))} style={{ accentColor: "var(--primary)" }} />
                    Teacher-suggested
                  </label>
                )}
                {modError && <InlineError message={modError} />}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                  {modForm.editingId && canManage && (confirmDeleteMod ? (
                    <span style={{ marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg-secondary)" }}>
                      Delete this modification? This can&apos;t be undone.
                      <button type="button" className="ss-btn" onClick={() => setConfirmDeleteMod(false)} disabled={deletingMod}>Keep</button>
                      <button type="button" className="ss-btn" onClick={deleteMod} disabled={deletingMod} style={{ color: "var(--danger)", borderColor: "var(--danger-border)" }}><Trash2 className="ss-btn-icon" />{deletingMod ? "Deleting…" : "Yes, delete"}</button>
                    </span>
                  ) : (
                    <button type="button" className="ss-btn" onClick={() => setConfirmDeleteMod(true)} disabled={savingMod} style={{ marginRight: "auto", color: "var(--danger)" }}><Trash2 className="ss-btn-icon" />Delete</button>
                  ))}
                  <button type="button" className="ss-btn" onClick={closeModForm} disabled={savingMod || deletingMod}>Cancel</button>
                  <button type="button" className="ss-btn ss-btn-primary" onClick={saveMod} disabled={!modForm.gameName.trim() || !modForm.modification.trim() || savingMod || deletingMod}>
                    <Check className="ss-btn-icon" />{savingMod ? (modForm.editingId ? "Saving…" : "Logging…") : modForm.editingId ? "Save" : "Log"}
                  </button>
                </div>
              </div>
            )}
            {loading ? (
              <div style={{ padding: "12px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading…</div>
            ) : mods.length === 0 ? (
              loadError ? null : <div style={{ padding: "12px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>No modifications logged yet.</div>
            ) : mods.map((m) => {
              const linked = gameNameById(m.gameId);
              return (
              <div key={m.id} style={{ padding: "8px 0", borderBottom: "0.5px solid var(--border)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {m.gameName}
                    {linked && (
                      <Link href={`/games?game=${m.gameId}`} className="ss-chip" title="Open in Curriculum Resources" style={{ textDecoration: "none" }}>
                        <Link2 style={{ width: 11, height: 11 }} />{linked === m.gameName ? "In library" : linked}
                      </Link>
                    )}
                    {m.groupAgeLevel && <span className="ss-chip">{m.groupAgeLevel}</span>}
                    {m.teacherSuggested && <span className="ss-chip">Teacher</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--fg-secondary)", marginTop: 2, lineHeight: "var(--lh-body)" }}>{m.modification}</div>
                </div>
                {canManage && (
                  <button type="button" className="ss-btn" onClick={() => openEditMod(m)} aria-label={`Edit modification for ${m.gameName}`} title="Edit" style={{ flexShrink: 0, minHeight: 34, padding: "0 8px" }}>
                    <Pencil className="ss-btn-icon" />
                  </button>
                )}
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
