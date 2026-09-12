"use client";

import { useEffect, useState } from "react";
import { parseLocalDate } from "@/lib/format";
import { attendanceApi } from "@/lib/api/attendance";
import {
  Users,
  UserX,
  Search,
  Check,
  X,
  MessageSquare,
  MessageSquareText,
  Loader2,
  ChevronRight,
  ArrowLeft,
  Clock,
  MapPin,
  Plus,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import type {
  ScheduledSessionDto,
  SessionRosterDto,
  AttendanceStatus,
  AttendanceRosterEntryDto,
  ProgramSummaryDto,
} from "@/lib/types/api";
import { useDialogFocus } from "@/lib/useDialogFocus";


export const ATT_OPTS: { key: AttendanceStatus; icon: LucideIcon; label: string; cls: string }[] = [
  { key: "Present", icon: Check, label: "Present", cls: "present" },
  { key: "Absent", icon: X, label: "Absent", cls: "absent" },
];

export const FILTERS = ["all", "present", "absent", "unmarked"] as const;
export type Filter = (typeof FILTERS)[number];

export const CARD_STATUS: Record<
  ScheduledSessionDto["status"],
  { label: string; bg: string; color: string; border: string }
> = {
  "not-started": { label: "Not started", bg: "var(--neutral-fill)", color: "var(--neutral-text)", border: "var(--border)" },
  "in-progress": { label: "In progress", bg: "var(--warning-fill)", color: "var(--warning-text)", border: "var(--warning-border)" },
  submitted:     { label: "Submitted",   bg: "var(--success-fill)", color: "var(--success-text)", border: "var(--success-border)" },
};

export function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function prettyDate(yyyyMMdd: string) {
  const d = parseLocalDate(yyyyMMdd);
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}


// ── Note modal ────────────────────────────────────────────────────────────────

export function NoteModal({
  entry,
  dateLabel,
  noteText,
  setNoteText,
  noteType,
  setNoteType,
  saving,
  onClose,
  onSave,
}: {
  entry: AttendanceRosterEntryDto;
  dateLabel: string;
  noteText: string;
  setNoteText: (v: string) => void;
  noteType: "observation" | "concern";
  setNoteType: (v: "observation" | "concern") => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  useEscapeKey(onClose, !saving);
  const panelRef = useDialogFocus<HTMLDivElement>();

  return (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(43,42,38,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "var(--space-4)" }}
        >
          <div role="dialog" aria-modal="true" ref={panelRef} aria-label={`Notes for ${entry.fullName}`} style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: "min(460px, calc(100vw - 32px))", display: "flex", flexDirection: "column", gap: 16, border: "0.5px solid var(--border-hover)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 500, margin: "0 0 3px" }}>{entry.fullName}</h3>
                <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
                  {dateLabel}
                </div>
              </div>
              <button onClick={() => onClose()} disabled={saving} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-tertiary)", padding: 2 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {entry.notes.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="ss-label">Existing notes</div>
                {entry.notes.map((n) => (
                  <div key={n.id} style={{ border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                    <span className={`ss-notetag ${n.noteType}`} style={{ marginBottom: 4, display: "inline-block" }}>{n.noteType}</span>
                    <div style={{ fontSize: 13, color: "var(--fg)" }}>{n.content}</div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="ss-label" htmlFor="note-text" style={{ display: "block", marginBottom: 6 }}>Add a note</label>
              <textarea
                id="note-text"
                rows={3}
                placeholder="What happened today…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", border: "0.5px solid var(--border-hover)", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", resize: "vertical", background: "var(--surface)", color: "var(--fg)", outline: "none" }}
                autoFocus
              />
            </div>
            <div>
              <div className="ss-label" style={{ marginBottom: 8 }}>Note type</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["observation", "concern"] as const).map((t) => (
                  <span
                    key={t}
                    className={`ss-notetag ${t}`}
                    style={{ cursor: "pointer", opacity: noteType === t ? 1 : 0.45, outline: noteType === t ? "1.5px solid currentColor" : "none", outlineOffset: 1 }}
                    onClick={() => setNoteType(t)}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="ss-btn" onClick={() => onClose()} disabled={saving}>Cancel</button>
              <button className="ss-btn ss-btn-primary" onClick={onSave} disabled={!noteText.trim() || saving}>
                {saving ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Check className="ss-btn-icon" />}
                {saving ? "Saving…" : "Save note"}
              </button>
            </div>
          </div>
        </div>

  );
}

// ── Session card (landing) ──────────────────────────────────────────────────

export function SessionCard({ card, onOpen }: { card: ScheduledSessionDto; onOpen: () => void }) {
  const st = CARD_STATUS[card.status];
  const pct = card.totalCount > 0 ? Math.round((card.markedCount / card.totalCount) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="ss-card"
      style={{
        display: "flex", flexDirection: "column", padding: 0, overflow: "hidden",
        textAlign: "left", cursor: "pointer", border: "0.5px solid var(--border)", background: "var(--surface)",
      }}
    >
      <div style={{ background: `var(--${card.programSlug}-fill)`, padding: "var(--space-4)", borderBottom: "0.5px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: "var(--space-2)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>
            <span className={`ss-dot ${card.programSlug}`} />
            {card.programName}
          </span>
          <span
            style={{
              fontSize: 11, padding: "2px 8px", borderRadius: "var(--r-sm)", whiteSpace: "nowrap",
              background: st.bg, color: st.color, border: `0.5px solid ${st.border}`,
            }}
          >
            {st.label}
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--fg-secondary)" }}>
          {card.timeRange && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Clock style={{ width: 12, height: 12 }} />{card.timeRange}
            </span>
          )}
          {card.room && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <MapPin style={{ width: 12, height: 12 }} />{card.room}
            </span>
          )}
          {card.isAdHoc && (
            <span style={{ fontSize: 11, color: "var(--fg-tertiary)" }}>Ad-hoc</span>
          )}
        </div>
      </div>

      <div style={{ padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--fg-secondary)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Users style={{ width: 12, height: 12 }} />
            {card.markedCount} / {card.totalCount} marked
          </span>
          <span style={{ color: "var(--primary)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 2 }}>
            {card.status === "submitted" ? "Review" : card.status === "not-started" ? "Take attendance" : "Continue"}
            <ChevronRight style={{ width: 13, height: 13 }} />
          </span>
        </div>
        <div className="ss-progress">
          <div className={`ss-progress-fill ${card.status === "submitted" ? "success" : "warning"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </button>
  );
}

// ── Ad-hoc starter ────────────────────────────────────────────────────────────

export function AdHocStarter({
  open, setOpen, options, value, setValue, onStart,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  options: ProgramSummaryDto[];
  value: string;
  setValue: (v: string) => void;
  onStart: () => void;
}) {
  if (!open) {
    return (
      <button
        type="button"
        className="ss-btn"
        style={{ marginTop: "var(--space-4)" }}
        onClick={() => setOpen(true)}
      >
        <Plus className="ss-btn-icon" />
        Start another session
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: "var(--space-4)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "var(--space-3)", border: "0.5px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)",
      }}
    >
      <span className="ss-label" style={{ marginRight: 2 }}>Start an off-schedule session for</span>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{
          border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-md)", padding: "6px 10px",
          fontSize: 13, color: "var(--fg)", background: "var(--surface)", outline: "none",
        }}
      >
        <option value="">Select a program…</option>
        {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button type="button" className="ss-btn ss-btn-primary" disabled={!value} onClick={onStart}>
        <Plus className="ss-btn-icon" />Start
      </button>
      <button type="button" className="ss-btn" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

// ── Roster view ────────────────────────────────────────────────────────────────

export function RosterView({
  selected, locked, total, present, absent, marked,
  filter, setFilter, query, setQuery, visibleEntries, loadingRoster,
  onBack, onMark, onOpenNote, onSubmit, submitting, th,
}: {
  selected: SessionRosterDto;
  locked: boolean;
  total: number; present: number; absent: number; marked: number;
  filter: Filter; setFilter: (f: Filter) => void;
  query: string; setQuery: (q: string) => void;
  visibleEntries: SessionRosterDto["entries"];
  loadingRoster: boolean;
  onBack: () => void;
  onMark: (recordId: string, target: AttendanceStatus) => void;
  onOpenNote: (recordId: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  th: React.CSSProperties;
}) {
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");

  // Pathways sessions record total hours (client rule) — saved on blur, in-place.
  const [hours, setHours] = useState<string>(selected.hoursLogged != null ? String(selected.hoursLogged) : "");
  const [hoursState, setHoursState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => {
    setHours(selected.hoursLogged != null ? String(selected.hoursLogged) : "");
    setHoursState("idle");
  }, [selected.sessionId, selected.hoursLogged]);

  async function saveHours() {
    const parsed = hours.trim() === "" ? null : Number(hours);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0 || parsed > 24)) { setHoursState("error"); return; }
    if (parsed === (selected.hoursLogged ?? null)) return;
    setHoursState("saving");
    try {
      await attendanceApi.setSessionHours(selected.sessionId, parsed);
      setHoursState("saved");
    } catch {
      setHoursState("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, marginBottom: "var(--space-3)",
          background: "none", border: "none", cursor: "pointer", color: "var(--fg-secondary)", fontSize: 13, padding: 0,
        }}
      >
        <ArrowLeft style={{ width: 14, height: 14 }} />
        All sessions
      </button>

      {/* session header */}
      <div
        style={{
          background: `var(--${selected.programSlug}-fill)`, borderRadius: "var(--r-lg)",
          padding: "var(--space-4)", marginBottom: "var(--space-4)", border: "0.5px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span className={`ss-dot ${selected.programSlug}`} />
              {selected.programName}
            </h2>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--fg-secondary)" }}>
              {selected.timeRange && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Clock style={{ width: 12, height: 12 }} />{selected.timeRange}
                </span>
              )}
              {selected.room && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <MapPin style={{ width: 12, height: 12 }} />{selected.room}
                </span>
              )}
              {selected.programSlug === "pathways" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Clock style={{ width: 12, height: 12 }} />
                  Hours
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.25}
                    value={hours}
                    disabled={locked}
                    placeholder="e.g. 6"
                    onChange={(e) => { setHours(e.target.value); setHoursState("idle"); }}
                    onBlur={saveHours}
                    style={{
                      width: 64, padding: "2px 6px", fontSize: 12, color: "var(--fg)",
                      border: "0.5px solid var(--border-hover)", borderRadius: "var(--r-sm)",
                      background: "var(--surface)", outline: "none",
                    }}
                  />
                  {hoursState === "saving" && <span style={{ color: "var(--fg-tertiary)" }}>Saving…</span>}
                  {hoursState === "saved" && <span style={{ color: "var(--success-text)" }}>Saved</span>}
                  {hoursState === "error" && <span style={{ color: "var(--danger)" }}>0–24 only</span>}
                </span>
              )}
            </div>
          </div>
          {locked && (
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500,
                padding: "4px 10px", borderRadius: "var(--r-pill)",
                background: "var(--success-fill)", color: "var(--success-text)", border: "0.5px solid var(--success-border)",
              }}
            >
              <Lock style={{ width: 12, height: 12 }} />Submitted
            </span>
          )}
        </div>
      </div>

      {/* stats */}
      <div className="adm-statgrid" style={{ marginBottom: "var(--space-4)" }}>
        <div className="adm-stat">
          <span className="label">Present</span>
          <span className="num" style={{ color: "var(--success)" }}>{present}</span>
          <span className="delta muted"><Users />{pct(present)} of roster</span>
        </div>
        <div className="adm-stat">
          <span className="label">Absent</span>
          <span className="num" style={{ color: "var(--danger)" }}>{absent}</span>
          <span className="delta danger"><UserX />{pct(absent)} of roster</span>
        </div>
      </div>

      {/* roster card */}
      <div className="widget">
        <div className="widget-head" style={{ flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Roster</h3>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {FILTERS.map((f) => (
              <span
                key={f}
                className={`ss-chip${filter === f ? " is-active" : ""}`}
                style={{ cursor: "pointer", textTransform: "capitalize" }}
                onClick={() => setFilter(f)}
              >
                {f}
              </span>
            ))}
          </div>
          <div className="search" style={{ display: "flex", alignItems: "center", gap: 6, border: "0.5px solid var(--border-hover)", borderRadius: 8, padding: "5px 10px", background: "var(--surface)" }}>
            <Search style={{ width: 14, height: 14, color: "var(--fg-tertiary)" }} />
            <input
              type="text"
              placeholder="Search stars…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ border: "none", outline: "none", fontSize: 13, background: "transparent", width: 150 }}
            />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
                <th style={th}>Star</th>
                <th style={{ ...th, textAlign: "center" }}>Status</th>
                <th style={{ ...th, textAlign: "center" }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {loadingRoster ? (
                <tr><td colSpan={3} style={{ textAlign: "center", padding: "32px 16px", color: "var(--fg-tertiary)", fontSize: 13 }}>Loading roster…</td></tr>
              ) : visibleEntries.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: "center", padding: "32px 16px", color: "var(--fg-tertiary)", fontSize: 13 }}>
                  {total === 0 ? "No active stars in this program." : "No stars match this filter."}
                </td></tr>
              ) : visibleEntries.map((r) => (
                <tr key={r.recordId} style={{ borderBottom: "0.5px solid var(--border)" }}>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="ss-avatar sm" style={{ background: `var(--${r.programSlug}-fill)`, color: `var(--${r.programSlug})`, border: `0.5px solid var(--${r.programSlug}-border)` }}>
                        {r.initials}
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{r.fullName}</div>
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 3 }}>
                      {ATT_OPTS.map((o) => {
                        const Icon = o.icon;
                        return (
                          <button
                            key={o.key}
                            className={`ss-att-btn ${o.cls}${r.status === o.key ? " is-selected" : ""}`}
                            title={locked ? "Session submitted — locked" : o.label}
                            disabled={locked}
                            style={locked ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                            onClick={() => onMark(r.recordId, o.key)}
                          >
                            <Icon />
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "center" }}>
                    <button
                      onClick={() => onOpenNote(r.recordId)}
                      style={{
                        background: "none",
                        border: `0.5px solid ${r.notes.length ? "var(--border-hover)" : "var(--border)"}`,
                        borderRadius: 8, padding: "5px 9px", cursor: "pointer",
                        color: r.notes.length ? "var(--primary)" : "var(--fg-tertiary)",
                        display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, whiteSpace: "nowrap",
                      }}
                    >
                      {r.notes.length ? <MessageSquareText style={{ width: 13, height: 13 }} /> : <MessageSquare style={{ width: 13, height: 13 }} />}
                      {r.notes.length ? `Notes (${r.notes.length})` : "Add note"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "0.5px solid var(--border)", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: "var(--fg-secondary)" }}>
            <span>{marked} of {total} marked</span>
            {!locked && <span style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>· changes save automatically</span>}
          </div>
          {locked ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--success-text, var(--success))" }}>
              <Check style={{ width: 14, height: 14 }} />Attendance submitted
            </span>
          ) : (
            <button
              className="ss-btn ss-btn-primary"
              disabled={total === 0 || marked < total || submitting}
              onClick={onSubmit}
            >
              {submitting ? <Loader2 className="ss-btn-icon" style={{ animation: "spin 1s linear infinite" }} /> : <Check className="ss-btn-icon" />}
              {submitting ? "Submitting…" : "Submit attendance"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

