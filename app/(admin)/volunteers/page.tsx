"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus, Search, X, Check, AlertCircle, Pencil, CheckCircle2, MinusCircle, Loader2 } from "lucide-react";
import { useVolunteers, usePrograms, queryKeys } from "@/lib/api/hooks";
import { volunteersApi } from "@/lib/api/volunteers";
import LoadError from "@/app/components/LoadError";
import { Skeleton } from "../components/Skeleton";
import type { VolunteerDto, ProgramSummaryDto, CreateVolunteerDto } from "@/lib/types/api";
import { programPillStyle, programTint } from "@/lib/programColor";

type Tab = "active" | "former" | "all";

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)",
  padding: "8px 12px", fontSize: 13, color: "var(--fg)",
  background: "var(--surface)", outline: "none",
};

export default function VolunteersPage() {
  const volunteersQ = useVolunteers();
  const programsQ = usePrograms();
  const loading = volunteersQ.isPending || programsQ.isPending;
  const data: VolunteerDto[] = volunteersQ.data ?? [];
  const programs: ProgramSummaryDto[] = programsQ.data ?? [];

  const [tab, setTab] = useState<Tab>("active");
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VolunteerDto | null>(null);

  const counts = {
    active: data.filter((v) => v.isActive).length,
    former: data.filter((v) => !v.isActive).length,
    all: data.length,
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.filter((v) => {
      if (tab === "active" && !v.isActive) return false;
      if (tab === "former" && v.isActive) return false;
      if (programFilter !== "all" && v.programSlug !== programFilter) return false;
      if (q && !v.fullName.toLowerCase().includes(q) && !v.programName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, tab, programFilter, query]);

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "active", label: "Active", count: counts.active },
    { key: "former", label: "Former", count: counts.former },
    { key: "all", label: "All", count: counts.all },
  ];

  return (
    <div className="adm-main">
      <div className="adm-topbar">
        <div className="titles">
          <h1>Volunteers</h1>
        </div>
        <div className="right">
          <button className="ss-btn ss-btn-primary" type="button" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <UserPlus className="ss-btn-icon" />
            Add volunteer
          </button>
        </div>
      </div>

      <div className="adm-content">
        {/* filters */}
        <div className="filter-bar">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`ss-chip${tab === t.key ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setTab(t.key)}>
              {t.label} ({t.count})
            </button>
          ))}
          <span className="sep" />
          <button type="button" className={`ss-chip${programFilter === "all" ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setProgramFilter("all")}>
            All programs
          </button>
          {programs.map((p) => (
            <button key={p.id} type="button" className={`ss-chip${programFilter === p.slug ? ` is-active ${p.slug}` : ""}`} style={{ cursor: "pointer" }} onClick={() => setProgramFilter(programFilter === p.slug ? "all" : p.slug)}>
              <span className={`ss-dot ${p.slug}`} />
              {p.name}
            </button>
          ))}
          <div className="search">
            <Search />
            <input type="text" placeholder="Search volunteers…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {/* table */}
        <div className="tbl-card">
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Volunteer</th>
                  <th>Program</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }, (_, i) => (
                    <tr key={`sk-${i}`}>
                      <td><Skeleton w={130} h={11} /></td>
                      <td><Skeleton w={90} h={11} /></td>
                      <td><Skeleton w={80} h={11} /></td>
                      <td><Skeleton w={110} h={11} /></td>
                      <td><Skeleton w={60} h={18} r={10} /></td>
                      <td><Skeleton w={60} h={11} /></td>
                      <td />
                    </tr>
                  ))
                ) : volunteersQ.isError ? (
                  <tr>
                    <td colSpan={7}>
                      <LoadError title="Couldn't load volunteers" error={volunteersQ.error} onRetry={() => volunteersQ.refetch()} />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "40px 0", color: "var(--fg-tertiary)", fontSize: 13 }}>
                      {data.length === 0 ? "No volunteers yet — add one to get started." : "No volunteers match the current filters."}
                    </td>
                  </tr>
                ) : filtered.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div className="cell-student">
                        <span className="ss-avatar sm" style={{ background: `var(--${v.programSlug}-fill)`, color: `var(--${v.programSlug})`, border: `0.5px solid var(--${v.programSlug}-border)` }}>
                          {v.initials}
                        </span>
                        <div><span className="nm">{v.fullName}</span></div>
                      </div>
                    </td>
                    <td>
                      <span className="cell-prog">
                        <span className={`ss-dot ${v.programSlug}`} />
                        {v.programName}
                      </span>
                    </td>
                    <td className="ss-meta">{v.phone || "—"}</td>
                    <td className="ss-meta">{v.email || "—"}</td>
                    <td>
                      <span className={`ss-badge ${v.isActive ? "is-active" : "is-former"}`}>
                        {v.isActive ? <><CheckCircle2 />Active</> : <><MinusCircle />Former</>}
                      </span>
                    </td>
                    <td className="ss-meta">{v.startDate}</td>
                    <td>
                      <button type="button" title="Edit volunteer" onClick={() => { setEditing(v); setModalOpen(true); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4, display: "inline-flex" }}>
                        <Pencil style={{ width: 14, height: 14 }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalOpen && (
        <VolunteerModal programs={programs} volunteer={editing} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}

function VolunteerModal({
  programs,
  volunteer,
  onClose,
}: {
  programs: ProgramSummaryDto[];
  volunteer: VolunteerDto | null; // null = create
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = volunteer !== null;

  const [nm, setNm] = useState(volunteer?.fullName ?? "");
  const [programId, setProgramId] = useState(volunteer?.programId ?? "");
  const [phone, setPhone] = useState(volunteer?.phone ?? "");
  const [email, setEmail] = useState(volunteer?.email ?? "");
  const [notes, setNotes] = useState(volunteer?.notes ?? "");
  const [isActive, setIsActive] = useState(volunteer?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = nm.trim().length > 0 && programId !== "" && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await volunteersApi.update(volunteer!.id, {
          fullName: nm.trim(),
          programId,
          phone: phone.trim(),
          email: email.trim(),
          notes: notes.trim(),
          isActive,
        });
      } else {
        const dto: CreateVolunteerDto = {
          fullName: nm.trim(),
          programId,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          notes: notes.trim() || undefined,
        };
        await volunteersApi.create(dto);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers });
      onClose();
    } catch {
      setError("Could not save volunteer — check that the backend is running and try again.");
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", width: "min(480px, 100%)", display: "flex", flexDirection: "column", border: "0.5px solid var(--border-hover)", maxHeight: "90vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)", flexShrink: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{editing ? "Edit volunteer" : "Add volunteer"}</h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 4 }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)", overflowY: "auto" }}>
          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Full name <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <input type="text" placeholder="e.g. Sam Torres" value={nm} onChange={(e) => setNm(e.target.value)} style={inputStyle} autoFocus />
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 8 }}>Volunteering for <span style={{ color: "var(--danger)", fontWeight: 400 }}>*</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {programs.map((p) => {
                const selected = programId === p.id;
                return (
                  <button key={p.id} type="button" aria-pressed={selected} onClick={() => setProgramId(p.id)}
                    style={programPillStyle(p.colorHex, selected)}>
                    <span className="ss-dot" style={{ background: programTint(p.colorHex).accent }} />
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>Phone</div>
              <input type="tel" placeholder="(209) 555-0100" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="ss-label" style={{ marginBottom: 6 }}>Email</div>
              <input type="email" placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div>
            <div className="ss-label" style={{ marginBottom: 6 }}>Notes <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Optional</span></div>
            <textarea value={notes} rows={2} placeholder="Availability, skills, anything useful…" onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          {editing && (
            <div>
              <div className="ss-label" style={{ marginBottom: 8 }}>Status</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className={`ss-chip${isActive ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setIsActive(true)}>Active</button>
                <button type="button" className={`ss-chip${!isActive ? " is-active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setIsActive(false)}>Former</button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ margin: "0 var(--space-4)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-fill, #fce8e8)", color: "var(--danger)", fontSize: 12, display: "flex", alignItems: "flex-start", gap: 6 }}>
            <AlertCircle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}
        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button className="ss-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="ss-btn ss-btn-primary" type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Check className="ss-btn-icon" />}
            {saving ? "Saving…" : editing ? "Save changes" : "Add volunteer"}
          </button>
        </div>
      </div>
    </div>
  );
}
