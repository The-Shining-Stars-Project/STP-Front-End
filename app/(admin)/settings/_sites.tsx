"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Pencil, Check, X, Loader2, Archive, ArchiveRestore, AlertCircle } from "lucide-react";
import { sitesApi } from "@/lib/api/sites";
import { ApiError } from "@/lib/api/client";
import type { SiteDto } from "@/lib/types/api";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid var(--border-hover)",
  borderRadius: "var(--r-md)",
  padding: "5px 9px",
  fontSize: 13,
  color: "var(--fg)",
  background: "var(--surface)",
  outline: "none",
};

/**
 * The organisation's sites, editable in place: add a location, rename one, retire it when
 * it closes (it leaves every dropdown but stays on historical rosters and events), and
 * bring it back if it reopens. Slugs never change on rename — theming and links key on them.
 */
export default function SitesEditor() {
  const queryClient = useQueryClient();
  const [sites, setSites] = useState<SiteDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    sitesApi.getAll()
      .then((s) => { if (active) setSites(s); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  function describe(err: unknown, fallback: string) {
    return err instanceof ApiError && err.detail ? err.detail : fallback;
  }

  function replace(updated: SiteDto) {
    setSites((prev) => (prev ?? []).map((s) => (s.id === updated.id ? updated : s)));
    // Every dropdown reads active sites from the cached reference lists — refresh them.
    queryClient.invalidateQueries({ queryKey: ["reference-lists"] });
  }

  async function run(id: string, action: () => Promise<void>, fallback: string) {
    setError(null);
    setBusyId(id);
    try {
      await action();
    } catch (err) {
      setError(describe(err, fallback));
    } finally {
      setBusyId(null);
    }
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    await run("new", async () => {
      const created = await sitesApi.create({ name });
      setSites((prev) => {
        const rest = (prev ?? []).filter((s) => s.id !== created.id);
        return [...rest, created];
      });
      queryClient.invalidateQueries({ queryKey: ["reference-lists"] });
      setNewName("");
      setAdding(false);
    }, "Couldn't add the site — try again.");
  }

  async function rename(site: SiteDto) {
    const name = editName.trim();
    if (!name || name === site.name) { setEditingId(null); return; }
    await run(site.id, async () => {
      replace(await sitesApi.update(site.id, { name }));
      setEditingId(null);
    }, "Couldn't rename the site — try again.");
  }

  async function setActive(site: SiteDto, isActive: boolean) {
    if (!isActive && !window.confirm(`Retire ${site.name}? It leaves every dropdown but stays on past rosters and events. You can bring it back later.`)) return;
    await run(site.id, async () => {
      replace(await sitesApi.update(site.id, { isActive }));
    }, isActive ? "Couldn't restore the site — try again." : "Couldn't retire the site — try again.");
  }

  const active = (sites ?? []).filter((s) => s.isActive);
  const retired = (sites ?? []).filter((s) => !s.isActive);

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", flexWrap: "wrap" }}>
      <span className="ss-label" style={{ color: "var(--fg-tertiary)", display: "inline-flex", alignItems: "center", gap: 6, minWidth: 96 }}>
        <MapPin style={{ width: 12, height: 12 }} />Sites
      </span>
      <div className="settings-overview" style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 }}>
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--danger)" }}>
            <AlertCircle style={{ width: 14, height: 14 }} />{error}
          </div>
        )}
        {failed ? (
          <span className="ss-meta" style={{ color: "var(--fg-tertiary)" }}>Couldn&apos;t load sites.</span>
        ) : sites === null ? (
          <span className="ss-meta" style={{ color: "var(--fg-tertiary)" }}>Loading…</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {active.length === 0 && !adding && <span className="ss-meta" style={{ color: "var(--fg-tertiary)" }}>None yet</span>}
            {active.map((s) => (
              editingId === s.id ? (
                <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void rename(s); if (e.key === "Escape") setEditingId(null); }}
                    maxLength={150}
                    style={{ ...inputStyle, width: 180 }}
                    autoFocus
                  />
                  <button type="button" className="ss-btn" onClick={() => rename(s)} disabled={busyId === s.id} aria-label="Save name" style={{ padding: "3px 6px" }}>
                    {busyId === s.id ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Check className="ss-btn-icon" />}
                  </button>
                  <button type="button" className="ss-btn" onClick={() => setEditingId(null)} aria-label="Cancel" style={{ padding: "3px 6px" }}>
                    <X className="ss-btn-icon" />
                  </button>
                </span>
              ) : (
                <span key={s.id} className="ss-chip ss-chip--static" style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: busyId === s.id ? 0.6 : 1 }}>
                  {s.name}
                  <button type="button" onClick={() => { setEditingId(s.id); setEditName(s.name); }} title="Rename" aria-label={`Rename ${s.name}`}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 0, display: "flex" }}>
                    <Pencil style={{ width: 11, height: 11 }} />
                  </button>
                  <button type="button" onClick={() => setActive(s, false)} title="Retire this site" aria-label={`Retire ${s.name}`} disabled={busyId === s.id}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 0, display: "flex" }}>
                    <Archive style={{ width: 11, height: 11 }} />
                  </button>
                </span>
              )
            ))}
            {adding ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <input
                  placeholder="Site name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void add(); if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
                  maxLength={150}
                  style={{ ...inputStyle, width: 180 }}
                  autoFocus
                />
                <button type="button" className="ss-btn ss-btn-primary" onClick={add} disabled={!newName.trim() || busyId === "new"} style={{ padding: "3px 8px" }}>
                  {busyId === "new" ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Check className="ss-btn-icon" />}
                  Add
                </button>
                <button type="button" className="ss-btn" onClick={() => { setAdding(false); setNewName(""); }} style={{ padding: "3px 6px" }} aria-label="Cancel">
                  <X className="ss-btn-icon" />
                </button>
              </span>
            ) : (
              <button type="button" className="ss-btn" onClick={() => { setAdding(true); setError(null); }} style={{ padding: "3px 8px" }}>
                <Plus className="ss-btn-icon" />Add site
              </button>
            )}
          </div>
        )}
        {retired.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span className="ss-meta" style={{ color: "var(--fg-tertiary)", fontSize: 11 }}>Retired:</span>
            {retired.map((s) => (
              <span key={s.id} className="ss-chip ss-chip--static" style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: 0.6 }}>
                {s.name}
                <button type="button" onClick={() => setActive(s, true)} title="Bring this site back" aria-label={`Restore ${s.name}`} disabled={busyId === s.id}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 0, display: "flex" }}>
                  <ArchiveRestore style={{ width: 11, height: 11 }} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
